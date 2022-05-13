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
  CHANNEL_NAME_EVENTS,
  CHANNEL_NAME_HISTORY,
  CHANNEL_NAME_INFO,
  CHANNEL_NAME_LIGHT,
  CHANNEL_NAME_LIVESTREAM,
  CHANNEL_NAME_SNAPSHOT,
  COMMON_DOORBELL,
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
  COMMON_LIVESTREAM_FILE,
  COMMON_LIVESTREAM_LIVESTREAM,
  COMMON_LIVESTREAM_REQUEST,
  COMMON_LIVESTREAM_URL,
  COMMON_MOTION,
  COMMON_SNAPSHOT_FILE,
  COMMON_SNAPSHOT_REQUEST,
  COMMON_SNAPSHOT_SNAPSHOT,
  COMMON_SNAPSHOT_URL,
  STATE_ID_LIGHT_SWITCH,
  STATE_ID_LIVESTREAM_REQUEST,
  STATE_ID_SNAPSHOT_REQUEST
} from "./constants";
import { LastAction } from "./lastAction";
import * as fs from "fs";
import { PushNotification } from "ring-client-api/lib/api/ring-types";
import { FileService } from "./services/file-service";

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
  private eventsChannelId: string;
  private snapshotChannelId: string;
  private liveStreamChannelId: string;
  private path: string;
  private shortId: string;

  private _adapter: RingAdapter;
  private _client: RingApiClient;
  private _locationIndex: number;
  private _ringDevice: RingCamera;
  private lastAction: LastAction | undefined;
  private _requestingSnapshot = false;
  private _requestingLiveStream = false;
  private _lastLiveStreamUrl = "";
  private _lastLiveStreamDir = "";
  private _lastLiveStreamVideo: Buffer | null = null;
  private _lastLiveStreamTimestamp = 0;
  private _lastSnapShotUrl = "";
  private _lastSnapShotDir = "";
  private _lastSnapshotImage: Buffer | null = null;
  private _lastSnapshotTimestamp = 0;
  private _snapshotCount = 0;
  private _liveStreamCount = 0;

  get lastLiveStreamDir(): string {
    return this._lastLiveStreamDir;
  }

  get lastSnapShotDir(): string {
    return this._lastSnapShotDir;
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
    this._ringDevice.onData.subscribe(this.update.bind(this));
    this._ringDevice.onMotionDetected.subscribe(this.onMotion.bind(this));
    this._ringDevice.onDoorbellPressed.subscribe(this.onDorbell.bind(this));
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
    this.liveStreamChannelId = `${this.fullId}.${CHANNEL_NAME_LIVESTREAM}`;
    this.eventsChannelId = `${this.fullId}.${CHANNEL_NAME_EVENTS}`;

    this.recreateDeviceObjectTree();
    this.updateDeviceInfoObject(ringDevice.data);
    this.updateHealth();

    // noinspection JSIgnoredPromiseFromCall
    this.updateHistory();
    this.updateLiveStreamObject();
    this.takeSnapshot();
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
          if (targetVal) {
            this.takeSnapshot().catch((reason) => {
              this.catcher("Couldn't retrieve Snapshot.", reason);
            });
          }
        } else {
          this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
        }
        break;
      case "Livestream":
        if (stateID === STATE_ID_LIVESTREAM_REQUEST) {
          const targetVal = state.val as boolean;
          this._adapter.log.debug(`Get Livestream request for ${this.shortId} to value ${targetVal}`);
          if (targetVal) {
            this.startLivestream().catch((reason) => {
              this.catcher("Couldn't retrieve Livestream.", reason);
            });
          }
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
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_LIVESTREAM, {name: `Livestream ${this.shortId}`});
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_HISTORY);
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_EVENTS);
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

  public async startLivestream(): Promise<void> {
    this.silly(`${this.shortId}.startLivestream()`);
    const {fullPath, dirname, filename} =
      FileService.getPath(
        this._adapter.config.path,
        this._adapter.config.filename_livestream,
        ++this._liveStreamCount,
        this.shortId,
        this.fullId,
        this.kind
      );
    if (!(await FileService.prepareFolder(dirname))) {
      this.debug(`Failed to prepare Livestream folder ("${fullPath}") for ${this.shortId}`);
      return;
    }
    FileService.deleteFileIfExist(fullPath);
    if (this._ringDevice.isOffline) {
      this.info(
        `Device ${this.fullId} ("${this._ringDevice.data.description}") is offline --> won't take LiveStream
            `);
      return;
    }
    const duration = this._adapter.config.recordtime_livestream;
    this.silly(`Initialize Livestream (${duration}s) to file ${fullPath}`);
    await this._ringDevice.recordToFile(fullPath, duration);
    if (!fs.existsSync(fullPath)) {
      this.info(`Could't create livestream for ${this.shortId}`);
      return;
    }
    const video = fs.readFileSync(fullPath);
    this.silly(`Recieved Livestream has Length: ${video.length}`);
    this._lastLiveStreamUrl = await FileService.getVisUrl(this._adapter, this.fullId, "Livestream.mp4");
    if (this.lastLiveStreamDir !== "" && this._adapter.config.del_old_livestream) {
      await this._adapter.delFileAsync(this._adapter.namespace, `${this.lastLiveStreamDir}`).catch((reason) => {
        this.catcher("Couldn't delete previous Livestream.", reason);
      });
    }
    this._lastLiveStreamDir = fullPath;
    this._requestingLiveStream = false;
    // this.silly(`Locally storing Snapshot (Length: ${image.length})`);
    this._lastLiveStreamVideo = video;
    this._lastLiveStreamTimestamp = Date.now();
    await this.updateLiveStreamObject();
    this.debug(`Done creating livestream to ${fullPath}`);

  }

  public async takeSnapshot(): Promise<void> {
    const {fullPath, dirname} =
      FileService.getPath(
        this._adapter.config.path,
        this._adapter.config.filename_snapshot,
        ++this._snapshotCount,
        this.shortId,
        this.fullId,
        this.kind
      );
    if (!(await FileService.prepareFolder(dirname))) return;
    FileService.deleteFileIfExist(fullPath);
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

    this._lastSnapShotUrl = await FileService.getVisUrl(this._adapter, this.fullId, "Snapshot.jpg");
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
        `${this.snapshotChannelId}.jpg`,
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

  private async updateLiveStreamObject(): Promise<void> {
    this.debug(`Update Livestream Object for "${this.fullId}"`);
    if (this._lastLiveStreamVideo) {
      await this._adapter.upsertFile(
        `${this.liveStreamChannelId}.mp4`,
        COMMON_LIVESTREAM_LIVESTREAM,
        this._lastLiveStreamVideo,
        this._lastLiveStreamTimestamp,
      ).catch((reason) => {
        this.debug(`Couldn't update Livestream obejct: "${reason}"`);
      });
    }
    if (this._lastLiveStreamDir !== "") {
      this._adapter.upsertState(
        `${this.liveStreamChannelId}.livestream_file`,
        COMMON_LIVESTREAM_FILE,
        this._lastLiveStreamDir
      );
      this._adapter.upsertState(
        `${this.liveStreamChannelId}.livestream_url`,
        COMMON_LIVESTREAM_URL,
        this._lastLiveStreamUrl
      );
    }
    this._adapter.upsertState(
      `${this.liveStreamChannelId}.${STATE_ID_LIVESTREAM_REQUEST}`,
      COMMON_LIVESTREAM_REQUEST,
      this._requestingLiveStream,
      true
    );
  }

  private updateHealthObject(health: CameraHealth): void {
    this.debug(`Update Health Callback for "${this.fullId}"`);
    let batteryPercent: number = parseInt(health.battery_percentage ?? "-1");
    if (isNaN(batteryPercent)) {
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

  private onDorbell(value: PushNotification): void {
    this.debug(`Recieved Doorbell Event (${value}) for ${this.shortId}`);
    this._adapter.upsertState(`${this.eventsChannelId}.doorbell`, COMMON_DOORBELL, true);
    setTimeout(() => {
      this._adapter.upsertState(`${this.eventsChannelId}.doorbell`, COMMON_DOORBELL, false);
    }, 5000);
  }

  private onMotion(value: boolean): void {
    this.debug(`Recieved Motion Event (${value}) for ${this.shortId}`);
    this._adapter.upsertState(`${this.eventsChannelId}.motion`, COMMON_MOTION, value);
  }
}


