import {
  AnyCameraData,
  CameraData,
  CameraEvent,
  CameraEventResponse,
  CameraHealth,
  DingKind,
  RingCamera
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
  COMMON_DEBUG_REQUEST,
  COMMON_EVENTS_DETECTIONTYPE,
  COMMON_EVENTS_DOORBELL,
  COMMON_EVENTS_MESSAGE,
  COMMON_EVENTS_MOMENT,
  COMMON_EVENTS_TYPE,
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
  COMMON_LIVESTREAM_MOMENT,
  COMMON_LIVESTREAM_REQUEST,
  COMMON_LIVESTREAM_DURATION,
  COMMON_LIVESTREAM_URL,
  COMMON_MOTION,
  COMMON_SNAPSHOT_FILE,
  COMMON_SNAPSHOT_MOMENT,
  COMMON_SNAPSHOT_REQUEST,
  COMMON_SNAPSHOT_SNAPSHOT,
  COMMON_SNAPSHOT_URL,
  STATE_ID_DEBUG_REQUEST,
  STATE_ID_LIGHT_SWITCH,
  STATE_ID_LIVESTREAM_REQUEST,
  STATE_ID_SNAPSHOT_REQUEST
} from "./constants";
import { LastAction } from "./lastAction";
import * as fs from "fs";
import { FileService } from "./services/file-service";
import * as util from "util";
import { OwnRingLocation } from "./ownRingLocation";
import { PushNotificationDing } from "ring-client-api/lib/ring-types";
import { OwnRingDevice } from "./ownRingDevice";

enum EventState {
  Idle,
  ReactingOnMotion,
  ReactingOnDing,
  ReactingOnDoorbell
}

export class OwnRingCamera extends OwnRingDevice {
  private readonly infoChannelId: string;
  private readonly historyChannelId: string;
  private readonly lightChannelId: string;
  private readonly eventsChannelId: string;
  private readonly snapshotChannelId: string;
  private readonly liveStreamChannelId: string;
  private _ringDevice: RingCamera;
  private lastAction: LastAction | undefined;
  private _requestingSnapshot = false;
  private _requestingLiveStream = false;
  private _durationLiveStream = this._adapter.config.recordtime_livestream;
  private _autoLiveStream = this._adapter.config.auto_livestream;
  private _autoSnapshot = this._adapter.config.auto_snapshot;
  private _lastLightCommand = 0;
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
  private _state = EventState.Idle;
  private _doorbellEventActive: boolean = false;

  get lastLiveStreamDir(): string {
    return this._lastLiveStreamDir;
  }

  get lastSnapShotDir(): string {
    return this._lastSnapShotDir;
  }

  get ringDevice(): RingCamera {
    return this._ringDevice;
  }

  private set ringDevice(device) {
    this._ringDevice = device;
    this.subscribeToEvents();
  }

  private async subscribeToEvents(): Promise<void> {
    this.silly(`Start device subscriptions`);
    await this._ringDevice.subscribeToDingEvents().catch((r) => {
      this.catcher(`Failed subscribing to Ding Events for ${this._ringDevice.name}`, r);
    });
    await this._ringDevice.subscribeToMotionEvents().catch((r) => {
      this.catcher(`Failed subscribing to Motion Events for ${this._ringDevice.name}`, r);
    });
    this._ringDevice.onData.subscribe(this.update.bind(this));
    this._ringDevice.onMotionDetected.subscribe(
      {
        next: (motion: boolean) => {
          this.onMotion(motion)
        },
        error: (err: Error) => {
          this.catcher(`Motion Observer recieved error`, err)
        },
      }
    );
    this._ringDevice.onDoorbellPressed.subscribe(
      {
        next: (ding: PushNotificationDing) => {
          this.onDorbell(ding)
        },
        error: (err: Error) => {
          this.catcher(`Dorbell Observer recieved error`, err)
        },
      }
    );
    this._ringDevice.onNewNotification.subscribe(
      {
        next: (ding: PushNotificationDing) => {
          this.onDing(ding)
        },
        error: (err: Error) => {
          this.catcher(`Ding Observer recieved error`, err)
        },
      }
    );
  }

  public constructor(ringDevice: RingCamera, location: OwnRingLocation, adapter: RingAdapter, apiClient: RingApiClient) {
    super(
      location,
      adapter,
      apiClient,
      OwnRingCamera.evaluateKind(ringDevice.deviceType as string, adapter, ringDevice),
      `${ringDevice.id}`,
      ringDevice.data.description
    );
    this._ringDevice = ringDevice;
    this.debug(`Create device`);
    this.infoChannelId = `${this.fullId}.${CHANNEL_NAME_INFO}`;
    this.historyChannelId = `${this.fullId}.${CHANNEL_NAME_HISTORY}`;
    this.lightChannelId = `${this.fullId}.${CHANNEL_NAME_LIGHT}`;
    this.snapshotChannelId = `${this.fullId}.${CHANNEL_NAME_SNAPSHOT}`;
    this.liveStreamChannelId = `${this.fullId}.${CHANNEL_NAME_LIVESTREAM}`;
    this.eventsChannelId = `${this.fullId}.${CHANNEL_NAME_EVENTS}`;

    this.recreateDeviceObjectTree();
    this.updateDeviceInfoObject(ringDevice.data as CameraData);
    this.updateHealth();
    // noinspection JSIgnoredPromiseFromCall
    this.updateHistory();
    this._autoSnapshot ? setTimeout(this.takeSnapshot.bind(this), 50) : this.updateSnapshotObject();
    this.updateLiveStreamObject();
    this.ringDevice = ringDevice; // subscribes to the events
  }


  public override async processUserInput(channelID: string, stateID: string, state: ioBroker.State): void {
    switch (channelID) {
      case "":
        if (stateID !== STATE_ID_DEBUG_REQUEST) {
          return;
        }
        const targetVal = state.val as boolean;
        if (targetVal) {
          this._adapter.log.info(`Device Debug Data for ${this.shortId}: ${util.inspect(this._ringDevice, false, 1)}`);
          this._adapter.upsertState(
            `${this.fullId}.${STATE_ID_DEBUG_REQUEST}`,
            COMMON_DEBUG_REQUEST,
            false
          );
        }
        return;
      case "Light":
        if (!this._ringDevice.hasLight) {
          return;
        }
        if (stateID === STATE_ID_LIGHT_SWITCH) {
          const targetVal = state.val as boolean;
          this._adapter.log.debug(`Set light for ${this.shortId} to value ${targetVal}`);
          this._lastLightCommand = Date.now();
          this._ringDevice.setLight(targetVal).then((success) => {
            if (success) {
              this._adapter.upsertState(
                `${this.lightChannelId}.light_state`,
                COMMON_LIGHT_STATE,
                targetVal
              );
              this._adapter.upsertState(
                `${this.lightChannelId}.light_switch`,
                COMMON_LIGHT_SWITCH,
                targetVal,
                true
              );
              setTimeout(() => {
                this.updateHealth.bind(this)
              }, 65000);
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
        } else if (stateID === constants_1.STATE_ID_LIVESTREAM_DURATION) {
            const targetVal = state.val;
            this._adapter.log.debug(`Get Livestream duration for ${this.shortId} to value ${targetVal}`);
            if (targetVal) {
                await this.durationLivestream(targetVal).catch((reason) => {
                    this.catcher("Couldn't set duration of Livestream.", reason);
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

  protected async recreateDeviceObjectTree(): Promise<void> {
    this.silly(`Recreate DeviceObjectTree`);
    this._adapter.createDevice(this.fullId, {
      name: `Device ${this.shortId} ("${this._ringDevice.data.description}")`
    });
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_INFO, {name: `Info ${this.shortId}`});
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_SNAPSHOT);
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_LIVESTREAM, {name: `Livestream ${this.shortId}`});
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_HISTORY);
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_EVENTS);
    if (this._ringDevice.hasLight) {
      this.debug(`Device with Light Capabilities detected`);
      this._adapter.createChannel(this.fullId, CHANNEL_NAME_LIGHT, {name: `Light ${this.shortId}`});
      this._adapter.upsertState(
        `${this.lightChannelId}.${STATE_ID_LIGHT_SWITCH}`,
        COMMON_LIGHT_SWITCH,
        false,
        true
      );
    }
    this._lastSnapShotDir = await this._adapter.tryGetStringState(`${this.snapshotChannelId}.snapshot_file`);
    this._lastLiveStreamDir = await this._adapter.tryGetStringState(`${this.liveStreamChannelId}.livestream_file`);
    this._adapter.upsertState(
      `${this.fullId}.${STATE_ID_DEBUG_REQUEST}`,
      COMMON_DEBUG_REQUEST,
      false,
      true
    );
  }

  public updateByDevice(ringDevice: RingCamera): void {
    this.ringDevice = ringDevice;
    this._state = EventState.Idle;
    this.update(ringDevice.data as CameraData);
  }

  public update(data: AnyCameraData): void {
    this.debug(`Recieved Update`);
    this.updateDeviceInfoObject(data as CameraData);
    this.updateHealth();
    // noinspection JSIgnoredPromiseFromCall
    this.updateHistory();
    this.updateSnapshotObject();
  }

  async durationLivestream(val?: number): Promise<void> {
    this.silly(`${this.shortId}.durationLivestream()`);
    this._durationLiveStream = val;
    this._adapter.upsertState(`${this.liveStreamChannelId}.${constants_1.STATE_ID_LIVESTREAM_DURATION}`, constants_1.COMMON_LIVESTREAM_DURATION, >
    this.silly(`Livestream duration set to: ${val}`);
  }
  
  public async startLivestream(duration?: number): Promise<void> {
    this.silly(`${this.shortId}.startLivestream()`);
    const {fullPath, dirname} =
      FileService.getPath(
        this._adapter.config.path,
        this._adapter.config.filename_livestream,
        ++this._liveStreamCount,
        this.shortId,
        this.fullId,
        this.kind
      );
    if (!(await FileService.prepareFolder(dirname))) {
      this.debug(`Failed to prepare Livestream folder ("${fullPath}")`);
      return;
    }
    FileService.deleteFileIfExistSync(fullPath, this._adapter);
    if (this._ringDevice.isOffline) {
      this.info(` is offline --> won't take LiveStream`);
      return;
    }
    duration ??= this._durationLiveStream;
    const tempPath = (await FileService.getTempDir(this._adapter)) + `/temp_${this.shortId}_livestream.mp4`;
    this.silly(`Initialize Livestream (${duration}s) to temp-file ${tempPath}`);
    await this._ringDevice.recordToFile(tempPath, duration);
    if (!fs.existsSync(tempPath)) {
      this.info(`Could't create livestream`);
      return;
    }
    const video = fs.readFileSync(tempPath);
    fs.unlink(tempPath, (err) => {
      if (err) {
        this._adapter.logCatch(`Couldn't delete temp file`, err);
      }
    });
    this.silly(`Recieved Livestream has Length: ${video.length}`);
    this._lastLiveStreamUrl = await FileService.getVisUrl(this._adapter, this.fullId, "Livestream.mp4");
    FileService.writeFileSync(fullPath, video, this._adapter);
    if (this.lastLiveStreamDir !== "" && this._adapter.config.del_old_livestream) {
      FileService.deleteFileIfExistSync(this._lastLiveStreamDir, this._adapter);
    }
    this._lastLiveStreamDir = fullPath;
    this._requestingLiveStream = false;
    this._durationLiveStream = this._adapter.config.recordtime_livestream;
    // this.silly(`Locally storing Snapshot (Length: ${image.length})`);
    this._lastLiveStreamVideo = video;
    this._lastLiveStreamTimestamp = Date.now();
    await this.updateLiveStreamObject();
    this.debug(`Done creating livestream to ${fullPath}`);

  }

  public async takeSnapshot(uuid?: string, eventBased = false): Promise<void> {
    const {fullPath, dirname} =
      FileService.getPath(
        this._adapter.config.path,
        this._adapter.config.filename_snapshot,
        ++this._snapshotCount,
        this.shortId,
        this.fullId,
        this.kind
      );
    if (!(await FileService.prepareFolder(dirname))) {
      this._adapter.upsertState(`${this.snapshotChannelId}.${constants_1.STATE_ID_SNAPSHOT_REQUEST}`, constants_1.COMMON_SNAPSHOT_REQUEST, this._requestingSnapshot, true);
      return;
    }
    FileService.deleteFileIfExistSync(fullPath, this._adapter);
    if (this._ringDevice.isOffline) {
      this.info(`is offline --> won't take Snapshot`);
      this._requestingSnapshot = false;
      this._adapter.upsertState(`${this.snapshotChannelId}.${constants_1.STATE_ID_SNAPSHOT_REQUEST}`, constants_1.COMMON_SNAPSHOT_REQUEST, this._requestingSnapshot, true);
      return;
    }
    const image = await this._ringDevice.getSnapshot({uuid: uuid}).catch((reason) => {
      if(eventBased) {
        this.info("Taking Snapshot on Event failed. Will try again after livestream finished.");
      } else {
        this.catcher("Couldn't get Snapshot from api.", reason);
      }
    });
    if (!image) {
      if(!eventBased) {
        this.info("Could not create snapshot");
      }
      this._requestingSnapshot = false;
      this._adapter.upsertState(`${this.snapshotChannelId}.${constants_1.STATE_ID_SNAPSHOT_REQUEST}`, constants_1.COMMON_SNAPSHOT_REQUEST, this._requestingSnapshot, true);
      return;
    }

    this.silly(`Writing Snapshot (Length: ${image.length}) to "${fullPath}"`);
    FileService.writeFileSync(fullPath, image, this._adapter);

    this._lastSnapShotUrl = await FileService.getVisUrl(this._adapter, this.fullId, "Snapshot.jpg");
    if (this.lastSnapShotDir !== "" && this._adapter.config.del_old_snapshot) {
      FileService.deleteFileIfExistSync(this._lastSnapShotDir, this._adapter);
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
    this.silly(`Update Health`);
    this._ringDevice.getHealth().then(this.updateHealthObject.bind(this))
  }

  public async updateHistory(): Promise<void> {
    this.silly(`Update History`);
    this._ringDevice.getEvents({limit: 50})
      .then(async (r: CameraEventResponse) => {
        this.silly(`Recieved Event History`);
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
      data.kind as string
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
    this.debug(`Update Snapshot Object`);
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
    if (this._lastSnapshotTimestamp !== 0) {
      this._adapter.upsertState(
        `${this.snapshotChannelId}.snapshot_file`,
        COMMON_SNAPSHOT_FILE,
        this._lastSnapShotDir
      );
      this._adapter.upsertState(
        `${this.snapshotChannelId}.moment`,
        COMMON_SNAPSHOT_MOMENT,
        this._lastSnapshotTimestamp
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
  }

  private async updateLiveStreamObject(): Promise<void> {
    this.debug(`Update Livestream Object`);
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
      this._adapter.upsertState(
        `${this.liveStreamChannelId}.moment`,
        COMMON_LIVESTREAM_MOMENT,
        this._lastLiveStreamTimestamp
      );
    }
    this._adapter.upsertState(
      `${this.liveStreamChannelId}.${STATE_ID_LIVESTREAM_REQUEST}`,
      COMMON_LIVESTREAM_REQUEST,
      this._requestingLiveStream,
      true
    );
    this._adapter.upsertState(
      `${this.liveStreamChannelId}.${STATE_ID_LIVESTREAM_DURATION}`, 
      COMMON_LIVESTREAM_DURATION, 
      this._durationLiveStream, 
      true);
  }

  private updateHealthObject(health: CameraHealth): void {
    this.debug(`Update Health Callback`);
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
    if (this._ringDevice.hasLight && (Date.now() - this._lastLightCommand > 60000)) {
      // this.silly(JSON.stringify(this._ringDevice.data));
      const floodlightOn = (this._ringDevice.data as any).health.floodlight_on as boolean;
      this.debug(`Update Light within Health Update Floodlight is ${floodlightOn}`);
      this._adapter.upsertState(
        `${this.lightChannelId}.light_state`,
        COMMON_LIGHT_STATE,
        floodlightOn
      );
    }
  }

  private onDing(value: PushNotificationDing): void {
    this.debug(`Recieved Ding Event (${util.inspect(value, true, 1)})`);
    this.conditionalRecording(EventState.ReactingOnDing, value.ding.image_uuid);
    this._adapter.upsertState(`${this.eventsChannelId}.type`, COMMON_EVENTS_TYPE, value.subtype);
    this._adapter.upsertState(
      `${this.eventsChannelId}.detectionType`,
      COMMON_EVENTS_DETECTIONTYPE,
      value.ding.detection_type ?? value.subtype
    );
    this._adapter.upsertState(`${this.eventsChannelId}.created_at`, COMMON_EVENTS_MOMENT, Date.now());
    this._adapter.upsertState(`${this.eventsChannelId}.message`, COMMON_EVENTS_MESSAGE, value.aps.alert);
  }

  private onMotion(value: boolean): void {
    this.debug(`Recieved Motion Event (${util.inspect(value, true, 1)})`);
    this._adapter.upsertState(`${this.eventsChannelId}.motion`, COMMON_MOTION, value);
    if (value) {
      this.conditionalRecording(EventState.ReactingOnMotion);
    }
  }

  private onDorbell(value: PushNotificationDing): void {
    if (this._doorbellEventActive) {
      this.debug(`Recieved Doorbell Event, but we are already reacting. Ignoring.`)
      return;
    }
    this.info("Doorbell pressed --> Will ignore additional presses for the next 25s.")
    this.debug(`Recieved Doorbell Event (${util.inspect(value, true, 1)})`);
    this._doorbellEventActive = true;
    this._adapter.upsertState(`${this.eventsChannelId}.doorbell`, COMMON_EVENTS_DOORBELL, true);
    setTimeout(() => {
      this._adapter.upsertState(`${this.eventsChannelId}.doorbell`, COMMON_EVENTS_DOORBELL, false);
    }, 5000);
    setTimeout(() => {
      this._doorbellEventActive = false;
    }, 25000);
    this.conditionalRecording(EventState.ReactingOnDoorbell, value.ding.image_uuid);
  }

  private async conditionalRecording(state: EventState, uuid?: string): Promise<void> {
    if (!(this._autoSnapshot && this._autoLiveStream)) {
      if (this._state === EventState.Idle) {
        this.silly(`Start recording for Event "${EventState[state]}"...`);
        this._state = state;
        try {
          await this.takeSnapshot(uuid, true);
          await this.startLivestream(20);
        } finally {
          this._state = EventState.Idle;
        }
        return;
      }
      if (this._autoSnapshot) {
        this.silly(`Would have recorded due to "${EventState[state]}", but we are already reacting.`);
        if(uuid) {
          setTimeout(() => {
            this.debug(`delayed uuid recording`);
            this.takeSnapshot(uuid);
          }, this._durationLiveStream * 1000 + 3000);
        }
      }
  }
  }
}


