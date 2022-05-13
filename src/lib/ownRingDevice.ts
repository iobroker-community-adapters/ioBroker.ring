import path from "path";
import { Location } from "ring-client-api/lib/api/location";
import {
  CameraData,
  CameraEvent,
  CameraEventResponse,
  CameraHealth,
  DingKind,
  RingCamera,
  RingCameraKind
} from "ring-client-api";
import { RingAdapter } from "../main";
import { RingApiClient } from "./ringApiClient";
import {
  CHANNEL_NAME_HISTORY,
  CHANNEL_NAME_INFO,
  CHANNEL_NAME_LIGHT,
  CHANNEL_NAME_SNAPSHOT,
  COMMON_HISTORY_CREATED_AT,
  COMMON_HISTORY_KIND,
  COMMON_HISTORY_URL,
  COMMON_INFO_BATTERY_PERCENTAGE,
  COMMON_INFO_BATTERY_PERCENTAGE_CATEGORY,
  COMMON_INFO_DESCRIPTION,
  COMMON_INFO_EXTERNAL_CONNECTION,
  COMMON_INFO_FIRMWARE,
  COMMON_INFO_HAS_BATTERY,
  COMMON_INFO_HAS_LIGHT,
  COMMON_INFO_HAS_SIREN,
  COMMON_INFO_ID,
  COMMON_INFO_KIND,
  COMMON_INFO_LATEST_SIGNAL_CATEGORY,
  COMMON_INFO_LATEST_SIGNAL_STRENGTH,
  COMMON_INFO_WIFI_NAME,
  COMMON_LIGHT_STATE,
  COMMON_LIGHT_SWITCH,
  COMMON_SNAPSHOT_FILE, COMMON_SNAPSHOT_REQUEST, COMMON_SNAPSHOT_SNAPSHOT,
  COMMON_SNAPSHOT_URL,
  STATE_ID_LIGHT_SWITCH, STATE_ID_SNAPSHOT_REQUEST
} from "./constants";
import { LastAction } from "./lastAction";
import * as fs from "fs";

export class OwnRingDevice {
  public static getFullId(device: RingCamera, adapter: RingAdapter): string {
    return `${this.evaluateKind(device, adapter)}_${device.id}`;
  }

  public static evaluateKind(device: RingCamera, adapter: RingAdapter): string {
    switch (device.deviceType) {
      case RingCameraKind.doorbot:
      case RingCameraKind.doorbell:
      case RingCameraKind.doorbell_v3:
      case RingCameraKind.doorbell_v4:
      case RingCameraKind.doorbell_v5:
      case RingCameraKind.doorbell_portal:
      case RingCameraKind.doorbell_scallop:
      case RingCameraKind.doorbell_scallop_lite:
      case RingCameraKind.hp_cam_v1:
      case RingCameraKind.hp_cam_v2:
      case RingCameraKind.lpd_v1:
      case RingCameraKind.lpd_v2:
      case RingCameraKind.floodlight_v1:
      case RingCameraKind.floodlight_v2:
      case RingCameraKind.spotlightw_v2:
      case RingCameraKind.jbox_v1:
        return `doorbell`;
      case RingCameraKind.cocoa_camera:
      case RingCameraKind.cocoa_doorbell:
        return `cocoa`;
      case RingCameraKind.stickup_cam:
      case RingCameraKind.stickup_cam_v3:
      case RingCameraKind.stickup_cam_v4:
      case RingCameraKind.stickup_cam_mini:
      case RingCameraKind.stickup_cam_lunar:
      case RingCameraKind.stickup_cam_elite:
        return `stickup`
      default:
        adapter.log.error(
          `Device with Type ${device.deviceType} not yet supported, please inform dev Team via Github`
        );
        adapter.log.debug(`Unsupported Device Info: ${JSON.stringify(device)}`);
    }
    return "unknown";
  }

  private fullId: string;
  private infoChannelId: string;
  private historyChannelId: string;
  private kind: string;
  private lightChannelId: string;
  private snapshotChannelId: string;
  private path: string;
  private shortId: string;

  private _adapter: RingAdapter;
  private _client: RingApiClient;
  private _locationIndex: number;
  private _ringDevice: RingCamera;
  private lastAction: LastAction | undefined;
  private _requestingSnapshot = false;
  private _lastSnapShotUrl = "";
  private _lastSnapShotDir = "";
  private _lastSnapshotImage: Buffer | null = null;
  private _lastSnapshotTimestamp = 0;
  private _snapshotCount = 0;

  get lastSnapShotDir(): string {
    return this._lastSnapShotDir;
  }

  get lastSnapShotUrl(): string {
    return this._lastSnapShotUrl;
  }


  get locationIndex(): number {
    return this._locationIndex;
  }

  get location(): Location | undefined {
    if (this._client.locations.length < this._locationIndex) {
      this._adapter.log.error(`Can't find a Location with index ${this._locationIndex}`);
      return undefined;
    }
    return this._client.locations[this._locationIndex];
  }

  get ringDevice(): RingCamera {
    return this._ringDevice;
  }

  private set ringDevice(device) {
    this._ringDevice = device;
  }

  public constructor(ringDevice: RingCamera, locationIndex: number, adapter: RingAdapter, apiClient: RingApiClient) {
    this._adapter = adapter;
    this.debug(`Create device with ID: ${ringDevice.id}`);
    this._ringDevice = ringDevice;
    this._locationIndex = locationIndex;
    this._client = apiClient;
    this.path = `${this._locationIndex}.`
    this.kind = OwnRingDevice.evaluateKind(ringDevice, adapter);
    this.shortId = `${ringDevice.id}`;
    this.fullId = `${this.kind}_${this.shortId}`;
    this.infoChannelId = `${this.fullId}.${CHANNEL_NAME_INFO}`;
    this.historyChannelId = `${this.fullId}.${CHANNEL_NAME_HISTORY}`;
    this.lightChannelId = `${this.fullId}.${CHANNEL_NAME_LIGHT}`;
    this.snapshotChannelId = `${this.fullId}.${CHANNEL_NAME_SNAPSHOT}`;

    this.recreateDeviceObjectTree();
    this.updateDeviceInfoObject(ringDevice.data);
    this.updateHealth();

    // noinspection JSIgnoredPromiseFromCall
    this.updateHistory();
    this.updateSnapshot();
    this.ringDevice = ringDevice; // subscribes to the events
  }


  public processUserInput(channelID: string, stateID: string, state: ioBroker.State): void {
    switch (channelID) {
      case "Light":
        if (!this._ringDevice.hasLight) {
          return;
        }
        if (stateID === STATE_ID_LIGHT_SWITCH) {
          const targetVal = state.val as boolean;
          this._adapter.log.debug(`Set light for ${this.shortId} to value ${targetVal}`)
          this._ringDevice.setLight(targetVal).then((success) => {
            if (success) {
              this._adapter.upsertState(
                `${this.lightChannelId}.light_state`,
                COMMON_LIGHT_STATE,
                targetVal
              );
            }
          });
        } else {
          this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
        }
        break;
      case "Snapshot":
        if (stateID === STATE_ID_SNAPSHOT_REQUEST) {
          const targetVal = state.val as boolean;
          this._adapter.log.debug(`Get Snapshot request for ${this.shortId} to value ${targetVal}`);
          // noinspection JSIgnoredPromiseFromCall
          this.updateSnapshot().catch((reason) => {
            this.catcher("Couldn't retrieve Snapshot.", reason);
          });
        } else {
          this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
        }
        break;
      default:
        this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
    }
  }

  private recreateDeviceObjectTree(): void {
    this.silly(`Recreate DeviceObjectTree for ${this.fullId}`);
    this._adapter.createDevice(this.fullId, {
      name: `Device ${this.shortId} ("${this._ringDevice.data.description}")`
    });
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_INFO, {name: `Info ${this.shortId}`});
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_SNAPSHOT);
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_HISTORY);
    if (this._ringDevice.hasLight) {
      this.debug(`Device with Light Capabilities detected "${this.fullId}"`);
      this._adapter.createChannel(this.fullId, CHANNEL_NAME_LIGHT, {name: `Light ${this.shortId}`});
    }
  }

  public updateByDevice(ringDevice: RingCamera): void {
    this.ringDevice = ringDevice;
    this.update(ringDevice.data);
  }

  public update(data: CameraData): void {
    this.debug(`Recieved Update for ${this.fullId}`);
    this.updateDeviceInfoObject(data);
    this.updateHealth();
    // noinspection JSIgnoredPromiseFromCall
    this.updateHistory();
    this.updateSnapshotObject();
  }

  public async updateSnapshot(): Promise<void> {
    let fullPath: string = path.join(this._adapter.config.path, this._adapter.config.filename_snapshot);
    fullPath = fullPath
      .replace("%d", String(Date.now()))
      .replace("%n", String(++this._snapshotCount))
      .replace("%i", this.shortId)
      .replace("%k", this.kind);
    const pathname = path.dirname(fullPath);
    const filename = path.basename(fullPath);
    if (!fs.existsSync(pathname)) {
      this._adapter.mkDir(null, pathname, {recursive: true}, (e) => {
        this.info(`Error while creating directory --> Abort`);
        this.debug(`Error message ${e?.message}\nStack: ${e?.stack}`);
        return;
      });
    }
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    if (this._ringDevice.isOffline) {
      this.info(
        `Device ${this.fullId} ("${this._ringDevice.data.description}") is offline --> won't take Snapshot
            `);
      return;
    }
    const image = await this._ringDevice.getSnapshot().catch((reason) => {
      this.catcher("Couldn't get Snapshot from api.", reason);
    });
    if (!image) {
      this.info("Could not create snapshot");
      return;
    }

    this.silly(`Writing Snapshot (Length: ${image.length}) to "${fullPath}"`);
    fs.writeFileSync(fullPath, image);
    const vis = await this._adapter.getForeignObjectAsync("system.adapter.web.0").catch((reason) => {
      this.catcher(`Couldn't load "web.0" Adapter object.`, reason);
    });
    if (vis && vis.native) {
      const secure = vis.native.secure ? "https" : "http";
      this._lastSnapShotUrl = `${secure}://${this._adapter.host}:${vis.native.port
      }/${this._adapter.namespace}/${this.fullId}/${filename}`;
    }
    if (this.lastSnapShotDir !== "" && this._adapter.config.del_old_snapshot) {
      await this._adapter.delFileAsync(this._adapter.namespace, `${this.lastSnapShotDir}`).catch((reason) => {
        this.catcher("Couldn't delete previous snapshot.", reason);
      });
    }
    this._lastSnapShotDir = fullPath;
    this._requestingSnapshot = false;
    // this.silly(`Locally storing Snapshot (Length: ${image.length})`);
    this._lastSnapshotImage = image;
    this._lastSnapshotTimestamp = Date.now();
    await this.updateSnapshotObject();
    this.debug(`Done creating snapshot to ${fullPath}`);
  }

  public updateHealth(): void {
    this.silly(`Update Health for ${this.fullId}`);
    this._ringDevice.getHealth().then(this.updateHealthObject.bind(this))
  }

  public async updateHistory(): Promise<void> {
    this.silly(`Update History for ${this.fullId}`);
    this._ringDevice.getEvents({limit: 50})
      .then(async (r: CameraEventResponse) => {
        this.silly(`Recieved Event History for ${this.fullId}`);
        const lastAction = r.events.find((event: CameraEvent) => {
          const kind: DingKind = event.kind;
          switch (kind) {
            case "motion":
            case "ding":
            case "alarm":
            case "on_demand":
              return true;
          }
          return false;
        });
        if (lastAction === undefined) {
          return;
        }
        const url = await this._ringDevice.getRecordingUrl(lastAction.ding_id_str);
        this.lastAction = new LastAction(lastAction, url)
        this.updateHistoryObject(this.lastAction);
      });
  }

  private updateDeviceInfoObject(data: CameraData): void {
    this._adapter.upsertState(
      `${this.infoChannelId}.id`,
      COMMON_INFO_ID,
      data.device_id
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.kind`,
      COMMON_INFO_KIND,
      data.kind
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.description`,
      COMMON_INFO_DESCRIPTION,
      data.description
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.external_connection`,
      COMMON_INFO_EXTERNAL_CONNECTION,
      data.external_connection
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.hasLight`,
      COMMON_INFO_HAS_LIGHT,
      this._ringDevice.hasLight
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.hasBattery`,
      COMMON_INFO_HAS_BATTERY,
      this._ringDevice.hasBattery
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.hasSiren`,
      COMMON_INFO_HAS_SIREN,
      this._ringDevice.hasSiren
    );
  }

  private updateHistoryObject(lastAction: LastAction): void {
    this._adapter.upsertState(
      `${this.historyChannelId}.created_at`,
      COMMON_HISTORY_CREATED_AT,
      lastAction.event.created_at
    );
    this._adapter.upsertState(
      `${this.historyChannelId}.history_url`,
      COMMON_HISTORY_URL,
      lastAction.historyUrl
    );
    this._adapter.upsertState(
      `${this.historyChannelId}.kind`,
      COMMON_HISTORY_KIND,
      lastAction.event.kind
    );
  }

  private async updateSnapshotObject(): Promise<void> {
    this.debug(`Update Snapshot Object for "${this.fullId}"`);
    if (this._lastSnapshotImage) {
      await this._adapter.upsertFile(
        `${this.snapshotChannelId}.snapshot`,
        COMMON_SNAPSHOT_SNAPSHOT,
        this._lastSnapshotImage,
        this._lastSnapshotTimestamp
      ).catch((reason) => {
        this.debug(`Couldn't update Snapshot obejct: "${reason}"`);
      });
    }
    this._adapter.upsertState(
      `${this.snapshotChannelId}.snapshot_file`,
      COMMON_SNAPSHOT_FILE,
      this._lastSnapShotDir
    );
    this._adapter.upsertState(
      `${this.snapshotChannelId}.snapshot_url`,
      COMMON_SNAPSHOT_URL,
      this._lastSnapShotUrl
    );
    this._adapter.upsertState(
      `${this.snapshotChannelId}.${STATE_ID_SNAPSHOT_REQUEST}`,
      COMMON_SNAPSHOT_REQUEST,
      this._requestingSnapshot,
      true
    );
  }

  private updateHealthObject(health: CameraHealth): void {
    this.debug(`Update Health Callback for "${this.fullId}"`);
    let batteryPercent: number = parseInt(health.battery_percentage ?? "-1");
    if(isNaN(batteryPercent)) {
      batteryPercent = -1;
    }
    this._adapter.upsertState(
      `${this.infoChannelId}.battery_percentage`,
      COMMON_INFO_BATTERY_PERCENTAGE,
      batteryPercent
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.battery_percentage_category`,
      COMMON_INFO_BATTERY_PERCENTAGE_CATEGORY,
      health.battery_percentage_category
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.wifi_name`,
      COMMON_INFO_WIFI_NAME,
      health.wifi_name
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.latest_signal_strength`,
      COMMON_INFO_LATEST_SIGNAL_STRENGTH,
      health.latest_signal_strength
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.latest_signal_category`,
      COMMON_INFO_LATEST_SIGNAL_CATEGORY,
      health.latest_signal_category
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.firmware`,
      COMMON_INFO_FIRMWARE,
      health.firmware
    );
    if (this._ringDevice.hasLight) {
      // this.silly(JSON.stringify(this._ringDevice.data));
      const floodlightOn = (this._ringDevice.data as any).health.floodlight_on as boolean;
      this.debug(`Update Light within Health Update for "${this.fullId}" FLoodlight is ${floodlightOn}`);
      this._adapter.upsertState(
        `${this.lightChannelId}.light_state`,
        COMMON_LIGHT_STATE,
        floodlightOn
      );
      this._adapter.upsertState(
        `${this.lightChannelId}.${STATE_ID_LIGHT_SWITCH}`,
        COMMON_LIGHT_SWITCH,
        floodlightOn,
        true
      );
    }
  }

  private debug(message: string): void {
    this._adapter.log.debug(message);
  }

  private silly(message: string): void {
    this._adapter.log.silly(message);
  }

  private info(message: string): void {
    this._adapter.log.info(message);
  }

  private catcher(message: string, reason: any): void {
    this._adapter.logCatch(message, reason);
  }
}


