import {
  AnyCameraData,
  CameraData,
  CameraEvent,
  CameraEventResponse,
  CameraHealth,
  DingKind,
  RingCamera
} from "ring-client-api";
import * as rxjs from "rxjs";
import * as fs from "fs";
import * as util from "util";
import Sharp from "sharp";
import strftime from "strftime";
import schedule from "node-schedule";
import { PushNotificationDing } from "ring-client-api/lib/ring-types";
import { ExtendedResponse } from "ring-client-api/lib/rest-client";

import { RingAdapter } from "../main";
import { RingApiClient } from "./ringApiClient";
import {
  CHANNEL_NAME_EVENTS,
  CHANNEL_NAME_HDSNAPSHOT,
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
  COMMON_HDSNAPSHOT_AUTO,
  COMMON_HDSNAPSHOT_FILE,
  COMMON_HDSNAPSHOT_MOMENT,
  COMMON_HDSNAPSHOT_REQUEST,
  COMMON_HDSNAPSHOT_URL,
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
  COMMON_LIVESTREAM_AUTO,
  COMMON_LIVESTREAM_DURATION,
  COMMON_LIVESTREAM_FILE,
  COMMON_LIVESTREAM_MOMENT,
  COMMON_LIVESTREAM_REQUEST,
  COMMON_LIVESTREAM_URL,
  COMMON_MOTION,
  COMMON_SNAPSHOT_AUTO,
  COMMON_SNAPSHOT_FILE,
  COMMON_SNAPSHOT_MOMENT,
  COMMON_SNAPSHOT_REQUEST,
  COMMON_SNAPSHOT_URL,
  STATE_ID_DEBUG_REQUEST,
  STATE_ID_HDSNAPSHOT_REQUEST,
  STATE_ID_LIGHT_SWITCH,
  STATE_ID_LIVESTREAM_DURATION,
  STATE_ID_LIVESTREAM_REQUEST,
  STATE_ID_SNAPSHOT_REQUEST,
} from "./constants";
import { LastAction } from "./lastAction";
import { FileService } from "./services/file-service";
import { OwnRingLocation } from "./ownRingLocation";
import { OwnRingDevice } from "./ownRingDevice";
import { FileInfo } from "./services/file-info";
import { StreamingSession } from "ring-client-api/lib/streaming/streaming-session";
import { PathInfo } from "./services/path-info";
import { EventBlocker } from "./services/event-blocker";
import { ImageService } from "./services/image-service";
import { TextService } from "./services/text-service";

enum EventState {
  Idle,
  ReactingOnMotion,
  ReactingOnDing,
  ReactingOnDoorbell,
}

export class OwnRingCamera extends OwnRingDevice {
  private readonly infoChannelId: string;
  private readonly historyChannelId: string;
  private readonly lightChannelId: string;
  private readonly eventsChannelId: string;
  private readonly snapshotChannelId: string;
  private readonly HDsnapshotChannelId: string;
  private readonly liveStreamChannelId: string;
  private lastAction: LastAction | undefined;
  private _ringDevice: RingCamera;
  private _durationLiveStream: number = this._adapter.config.recordtime_livestream;
  private _lastLightCommand: number = 0;
  private _lastLiveStreamUrl: string = "";
  private _lastLiveStreamTimestamp: number = 0;
  private _lastSnapShotUrl: string = "";
  private _lastSnapshotTimestamp: number = 0;
  private _snapshotCount: number = 0;
  private _lastHDSnapShotUrl: string = "";
  private _lastHDSnapshotTimestamp: number = 0;
  private _HDsnapshotCount: number = 0;
  private _liveStreamCount: number = 0;
  private _state: EventState = EventState.Idle;
  private _lastLiveStreamDir: string = "";
  private _lastSnapShotDir: string = "";
  private _lastHDSnapShotDir: string = "";
  private _eventBlocker: { [name: string]: EventBlocker } = {
    "motion":   new EventBlocker(this._adapter.config.ignore_events_Motion,   this._adapter.config.keep_ignoring_if_retriggered),
    "doorbell": new EventBlocker(this._adapter.config.ignore_events_Doorbell, this._adapter.config.keep_ignoring_if_retriggered)
  };

  public constructor(ringDevice: RingCamera, location: OwnRingLocation, adapter: RingAdapter, apiClient: RingApiClient) {
    super(
      location,
      adapter,
      apiClient,
      OwnRingCamera.evaluateKind(ringDevice.deviceType as string, adapter, ringDevice),
      `${ringDevice.id}`,
      ringDevice.data.description,
    );
    this._ringDevice = ringDevice;
    this.infoChannelId = `${this.fullId}.${CHANNEL_NAME_INFO}`;
    this.historyChannelId = `${this.fullId}.${CHANNEL_NAME_HISTORY}`;
    this.lightChannelId = `${this.fullId}.${CHANNEL_NAME_LIGHT}`;
    this.snapshotChannelId = `${this.fullId}.${CHANNEL_NAME_SNAPSHOT}`;
    this.HDsnapshotChannelId = `${this.fullId}.${CHANNEL_NAME_HDSNAPSHOT}`;
    this.liveStreamChannelId = `${this.fullId}.${CHANNEL_NAME_LIVESTREAM}`;
    this.eventsChannelId = `${this.fullId}.${CHANNEL_NAME_EVENTS}`;

    this.recreateDeviceObjectTree();
    this.updateDeviceInfoObject(ringDevice.data as CameraData);
    this.updateHealth();
    this.updateHistory();
    this.updateSnapshotObject();
    this.updateHDSnapshotObject();
    this.updateLiveStreamObject();
    this.autoSched();
    this.subscribeToEvents();
  }

  public async startLivestream(duration?: number): Promise<void> {
    this.silly(`${this.shortId}.startLivestream()`);
    duration ??= this._durationLiveStream;
    const {visURL, visPath, fullPath}: FileInfo | { fullPath: ""; visPath: ""; visURL: "" } =
      await this.prepareLivestreamTargetFile().catch((reason: any): { fullPath: ""; visPath: ""; visURL: "" } => {
        this.catcher("Couldn't prepare Livestream Target File.", reason);
        return {visURL: "", visPath: "", fullPath: ""};
      });
    if (!visURL || !visPath || !fullPath) {
      await this.updateLivestreamRequest(false);
      return;
    }
    if (this._ringDevice.isOffline) {
      this.info(` is offline --> won't take LiveStream`);
      await this.updateLivestreamRequest(false);
      return;
    }
    const tempPath: string = (await FileService.getTempDir(this._adapter)) + `/temp_${this.shortId}_livestream.mp4`;
    const liveCall: StreamingSession | null = await this._ringDevice.streamVideo({
      video: ImageService.videoFilter(
        this._adapter.config.overlay_Livestream,
        this._adapter.dateFormat,
        this._adapter.language,
        this._ringDevice.data.description
      ),
      output: ["-t", duration.toString(), tempPath],
    }).catch((reason: any): null => {
      this.catcher("Couldn't create Livestream.", reason);
      return null;
    });
    if (!liveCall) {
      this.warn(`Couldn't create Livestream`);
      await this.updateLivestreamRequest(false);
      return;
    }

    const liveCallSucceeded: boolean | null = await rxjs.firstValueFrom(liveCall.onCallEnded).then((_result: void): boolean => {
      return true;
    }).catch((reason: any): null => {
      this.catcher("Couldn't create HD Snapshot.", reason);
      return null;
    });

    if (!fs.existsSync(tempPath) || !liveCallSucceeded) {
      this.warn(`Couldn't create livestream`);
      await this.updateLivestreamRequest(false);
      return;
    }
    const video: Buffer = fs.readFileSync(tempPath);

    // clean up
    fs.unlink(tempPath, (err: NodeJS.ErrnoException | null): void => {
      if (err) {
        this._adapter.logCatch(`Couldn't delete temp file`, err);
      }
    });
    if (this._lastLiveStreamDir !== "" && this._adapter.config.del_old_livestream) {
      FileService.deleteFileIfExistSync(this._lastLiveStreamDir, this._adapter);
    }

    if (visPath) {
      this.silly(`Locally storing Filestream (Length: ${video.length})`);
      await FileService.writeFile(visPath, video, this._adapter);
      this._lastLiveStreamUrl = visURL;
    }
    this.silly(`Writing Filestream (Length: ${video.length}) to "${fullPath}"`);
    await FileService.writeFile(fullPath, video, this._adapter);
    this._lastLiveStreamDir = fullPath;
    this._lastLiveStreamTimestamp = Date.now();
    await this.updateLiveStreamObject();
    this.debug(`Done creating livestream to ${fullPath}`);
  }

  public async takeHDSnapshot(): Promise<void> {  // from very short Livestream
    this.silly(`${this.shortId}.takeHDSnapshot()`);
    // const duration = 2.0;
    const {visURL, visPath}: { visURL: string; visPath: string } | { visPath: ""; visURL: "" } =
      await FileService.getVisUrl(
        this._adapter,
        this.fullId,
        "HDSnapshot.jpg",
      ).catch((reason: any): { visPath: ""; visURL: "" } => {
        this.catcher("Couldn't get Vis URL.", reason);
        return {visURL: "", visPath: ""};
      });
    if (!visURL || !visPath) {
      this.warn("Vis not available! Please install e.g. flot or other Vis related adapter");
      await this.updateHDSnapshotRequest(false);
      return;
    }

    const {fullPath, dirname}: PathInfo =
      FileService.getPath(
        this._adapter.config.path_snapshot,
        `HD${this._adapter.config.filename_snapshot}`,
        ++this._snapshotCount,
        this.shortId,
        this.fullId,
        this.kind,
      );

    if (!(await FileService.prepareFolder(dirname))) {
      this.warn(`prepare folder problem --> won't take HD Snapshot`);
      await this.updateHDSnapshotRequest(false);
      return;
    }
    FileService.deleteFileIfExistSync(fullPath, this._adapter);
    if (this._ringDevice.isOffline) {
      this.info(`is offline --> won't take HD Snapshot`);
      await this.updateHDSnapshotRequest(false);
      return;
    }
    const {night_contrast, night_sharpen}: { night_contrast: boolean; night_sharpen: boolean } = this.getActiveNightImageOptions();
    const tempPath: string = (await FileService.getTempDir(this._adapter)) + `/temp_${this.shortId}_livestream.jpg`;
    const liveCall: StreamingSession | null = await this._ringDevice.streamVideo({
      video: ImageService.videoFilter(
        this._adapter.config.overlay_HDsnapshot,
        this._adapter.dateFormat,
        this._adapter.language,
        this._ringDevice.data.description,
        night_contrast ? this._adapter.config.contrast_HDsnapshot : 0
      ),
      // output: ["-t", duration.toString(), "-f", "mjpeg", "-q:v", 3, "-frames:v", 1, tempPath]
      output: ["-f", "mjpeg", "-q:v", 3, "-frames:v", 1, tempPath]
    }).catch((reason: any): null => {
      this.catcher("Couldn't create HD Snapshot.", reason);
      return null;
    });
    if (!liveCall) {
      this.warn(`Couldn't create HD Snapshot`);
      await this.updateHDSnapshotRequest(false);
      return;
    }
    const liveCallSucceeded: boolean | null = await rxjs.firstValueFrom(liveCall.onCallEnded).then((_result: void): boolean => {
      return true;
    }).catch((reason: any): null => {
      this.catcher("Couldn't create HD Snapshot.", reason);
      return null;
    });

    if (!fs.existsSync(tempPath) || !liveCallSucceeded) {
      this.warn(`Couldn't create HD Snapshot`);
      await this.updateHDSnapshotRequest(false);
      return;
    } else {
      this.silly(`HD Snapshot from livestream created`);
    }
    let jpg: Buffer = fs.readFileSync(tempPath);

    if (night_sharpen && this._adapter.config.sharpen_HDsnapshot && this._adapter.config.sharpen_HDsnapshot > 0) {
      const sharpen: undefined | { sigma: number } =
        this._adapter.config.sharpen_HDsnapshot == 1
          ? undefined
          : {sigma: this._adapter.config.sharpen_HDsnapshot - 1};
      jpg = await Sharp(jpg)
        .sharpen(sharpen)
        .toBuffer()
        .catch((reason: any): null => {
          this.catcher("Couldn't sharpen HD Snapshot.", reason);
          return null;
        }) ?? jpg;
    }

    // clean up
    fs.unlink(tempPath, (err: NodeJS.ErrnoException | null): void => {
      if (err) {
        this._adapter.logCatch(`Couldn't delete temp file ${tempPath}`, err);
      }
    });
    if (this._lastHDSnapShotDir !== "" && this._adapter.config.del_old_HDsnapshot) {
      FileService.deleteFileIfExistSync(this._lastHDSnapShotDir, this._adapter);
    }

    if (visPath) {
      this.silly(`Locally storing HD Snapshot (Length: ${jpg.length})`);
      await FileService.writeFile(visPath, jpg, this._adapter);
      this._lastHDSnapShotUrl = visURL;
    }
    this.silly(`Writing HD Snapshot to ${fullPath} (Length: ${jpg.length})`);
    await FileService.writeFile(fullPath, jpg, this._adapter);
    this._lastHDSnapShotDir = fullPath;
    this._lastHDSnapshotTimestamp = Date.now();
    await this.updateHDSnapshotObject();
    this.debug(`Done creating HDSnapshot to ${visPath}`);
  }

  public async takeSnapshot(uuid?: string, eventBased: boolean = false): Promise<void> {
    this.silly(`${this.shortId}.takeSnapshot()`);

    const {visURL, visPath}: { visURL: string; visPath: string } =
      await FileService.getVisUrl(
        this._adapter,
        this.fullId, "Snapshot.jpg",
      );
    if (!visURL || !visPath) {
      this.warn("Vis not available");
    }

    const {fullPath, dirname}: PathInfo =
      FileService.getPath(
        this._adapter.config.path_snapshot,
        this._adapter.config.filename_snapshot,
        ++this._HDsnapshotCount,
        this.shortId,
        this.fullId,
        this.kind,
      );

    if (!(await FileService.prepareFolder(dirname))) {
      this.warn(`prepare folder problem --> won't take Snapshot`);
      await this.updateSnapshotRequest(false);
      return;
    }
    FileService.deleteFileIfExistSync(fullPath, this._adapter);

    if (this._ringDevice.isOffline) {
      this.info(`is offline --> won't take Snapshot`);
      await this.updateSnapshotRequest(false);
      return;
    }

    const image: Buffer & ExtendedResponse = await this._ringDevice.getNextSnapshot({force: true, uuid: uuid})
      .then((result: Buffer & ExtendedResponse): Buffer & ExtendedResponse => result)
      .catch((err: any): Buffer & ExtendedResponse => {
        if (eventBased) {
          this.warn("Taking Snapshot on Event failed. Will try again after livestream finished.");
        } else {
          this.catcher("Couldn't get Snapshot from api.", err);
        }
        return err;
      });

    if (!image.byteLength) {
      if (!eventBased) {
        this.warn("Could not create snapshot from image");
      }
      await this.updateSnapshotRequest(false);
      return;
    } else {
      this.silly(`Response timestamp: ${image.responseTimestamp}, 
                  Byte Length: ${image.byteLength},
                  Byte Offset: ${image.byteOffset},
                  Length: ${image.length},
                  Time in ms: ${image.timeMillis}`);
    }

    let image_txt: Buffer = image;
    if (this._adapter.config.overlay_snapshot) {
      image_txt =
        await ImageService.addTextToJpgBuffer(
          image,
          this._ringDevice.data.description,
          strftime(`${TextService.getTodayName(this._adapter.language)}, ${TextService.getDateFormat(this._adapter.dateFormat)} %T`)
        )
          .catch((reason: any): any => {
            this.catcher("Couldn't add text to Snapshot.", reason);
            return reason;
          });
    }

    if (this._lastSnapShotDir !== "" && this._adapter.config.del_old_snapshot) {
      FileService.deleteFileIfExistSync(this._lastSnapShotDir, this._adapter);
    }
    this._lastSnapShotUrl = visURL;
    this._lastSnapShotDir = fullPath;
    this._lastSnapshotTimestamp = image.timeMillis;

    if (visPath) {
      this.silly(`Locally storing Snapshot (Length: ${image.length})`);
      await FileService.writeFile(visPath, image_txt, this._adapter);
    }
    this.silly(`Writing Snapshot (Length: ${image.length}) to "${fullPath}"`);
    await FileService.writeFile(fullPath, image_txt, this._adapter);
    await this.updateSnapshotObject();
    this.debug(`Done creating snapshot to ${fullPath}`);
  }

  public async updateHistory(): Promise<void> {
    this.silly(`Update History`);
    this._ringDevice.getEvents({limit: 50})
      .then(async (r: CameraEventResponse): Promise<void> => {
        this.silly(`Received Event History`);
        const lastAction: CameraEvent | undefined = r.events.find((event: CameraEvent): boolean => {
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
        const url: string = await this._ringDevice.getRecordingUrl(lastAction.ding_id_str);
        this.lastAction = new LastAction(lastAction, url);
        this.updateHistoryObject(this.lastAction);
      });
  }

  public override async processUserInput(channelID: string, stateID: string, state: ioBroker.State): Promise<void> {
    switch (channelID) {
      case "":
        if (stateID !== STATE_ID_DEBUG_REQUEST) {
          return;
        }
        const targetVal: boolean = state.val as boolean;
        if (targetVal) {
          this._adapter.log.info(`Device Debug Data for ${this.shortId}: ${util.inspect(this._ringDevice, false, 1)}`);
          this._adapter.upsertState(
            `${this.fullId}.${STATE_ID_DEBUG_REQUEST}`,
            COMMON_DEBUG_REQUEST,
            false,
          );
        }
        return;

      case "Light":
        if (!this._ringDevice.hasLight) {
          return;
        }
        if (stateID === STATE_ID_LIGHT_SWITCH) {
          const targetVal: boolean = state.val as boolean;
          this._adapter.log.debug(`Set light for ${this.shortId} to value ${targetVal}`);
          this._lastLightCommand = Date.now();
          this._ringDevice.setLight(targetVal).then((success: boolean): void => {
            if (success) {
              this._adapter.upsertState(
                `${this.lightChannelId}.light_state`,
                COMMON_LIGHT_STATE,
                targetVal,
              );
              this._adapter.upsertState(
                `${this.lightChannelId}.light_switch`,
                COMMON_LIGHT_SWITCH,
                targetVal,
                true,
                true,
              );
              setTimeout((): () => void => this.updateHealth.bind(this), 65000);
            }
          });
        } else {
          this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
        }
        break;

      case "Snapshot":
        if (stateID === STATE_ID_SNAPSHOT_REQUEST) {
          const targetVal: boolean = state.val as boolean;
          this._adapter.log.debug(`Get Snapshot request for ${this.shortId} to value ${targetVal}`);
          if (targetVal) {
            await this.takeSnapshot().catch((reason: any): void => {
              this.updateSnapshotRequest();
              this.catcher("Couldn't retrieve Snapshot.", reason);
            });
          }
        } else {
          this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
        }
        break;

      case "HD Snapshot":
        if (stateID === STATE_ID_HDSNAPSHOT_REQUEST) {
          const targetVal: boolean = state.val as boolean;
          this._adapter.log.debug(`Get HDSnapshot request for ${this.shortId} to value ${targetVal}`);
          if (targetVal) {
            await this.takeHDSnapshot().catch((reason: any): void => {
              this.updateHDSnapshotRequest();
              this.catcher("Couldn't retrieve HDSnapshot.", reason);
            });
          }
        } else {
          this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
        }
        break;
      case "Livestream":
        if (stateID === STATE_ID_LIVESTREAM_REQUEST) {
          const targetVal: boolean = state.val as boolean;
          this._adapter.log.debug(`Get Livestream request for ${this.shortId} to value ${targetVal}`);
          if (targetVal) {
            await this.startLivestream().catch((reason: any): void => {
              this.updateLivestreamRequest();
              this.catcher("Couldn't retrieve Livestream.", reason);
            });
          }
        } else if (stateID === STATE_ID_LIVESTREAM_DURATION) {
          const targetVal: number = isNaN(state.val as number) ? 20 : state.val as number;
          this._adapter.log.debug(`Get Livestream duration for ${this.shortId} to value ${targetVal}`);
          this.setDurationLivestream(targetVal);
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
      name: `Device ${this.shortId} ("${this._ringDevice.data.description}")`,
    });
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_INFO, {name: `Info ${this.shortId}`});
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_SNAPSHOT, {name: `Snapshot ${this.shortId}`});
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_HDSNAPSHOT, {name: `HD Snapshot ${this.shortId}`});
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
        true,
        true,
      );
    }
    this._lastSnapShotDir = await this._adapter.tryGetStringState(`${this.snapshotChannelId}.file`);
    this._lastHDSnapShotDir = await this._adapter.tryGetStringState(`${this.HDsnapshotChannelId}.file`);
    this._lastLiveStreamDir = await this._adapter.tryGetStringState(`${this.liveStreamChannelId}.file`);
    if (this._adapter.config.auto_snapshot === undefined) this._adapter.config.auto_snapshot = false;
    if (this._adapter.config.auto_HDsnapshot === undefined) this._adapter.config.auto_HDsnapshot = false;
    if (this._adapter.config.auto_livestream === undefined) this._adapter.config.auto_livestream = false;
    this._adapter.upsertState(
      `${this.fullId}.${STATE_ID_DEBUG_REQUEST}`,
      COMMON_DEBUG_REQUEST,
      false,
      true,
      true,
    );
    this._adapter.upsertState(
      `${this.snapshotChannelId}.auto`,
      COMMON_SNAPSHOT_AUTO,
      this._adapter.config.auto_snapshot,
      true,
      true,
    );
    this._adapter.upsertState(
      `${this.HDsnapshotChannelId}.auto`,
      COMMON_HDSNAPSHOT_AUTO,
      this._adapter.config.auto_HDsnapshot,
      true,
      true,
    );
    this._adapter.upsertState(
      `${this.liveStreamChannelId}.auto`,
      COMMON_LIVESTREAM_AUTO,
      this._adapter.config.auto_livestream,
      true,
      true,
    );

    // Remove legacy states
    this._adapter.delObject(`${this.snapshotChannelId}.snapshot_request`);
    this._adapter.delObject(`${this.snapshotChannelId}.snapshot_file`);
    this._adapter.delObject(`${this.snapshotChannelId}.snapshot_url`);
    this._adapter.delObject(`${this.liveStreamChannelId}.livestream_request`);
    this._adapter.delObject(`${this.liveStreamChannelId}.livestream_file`);
    this._adapter.delObject(`${this.liveStreamChannelId}.livestream_url`);
  }

  private async prepareLivestreamTargetFile(): Promise<FileInfo> {
    const {visURL, visPath}: { visURL: string; visPath: string } | { visPath: ""; visURL: "" } =
      await FileService.getVisUrl(
        this._adapter,
        this.fullId,
        "Livestream.mp4",
      ).catch((reason: any): { visPath: ""; visURL: "" } => {
        this.catcher("Couldn't get Vis URL.", reason);
        return {visURL: "", visPath: ""};
      });
    return new Promise<FileInfo>(async (
      resolve: (value: (PromiseLike<FileInfo> | FileInfo)) => void,
      reject: (reason?: any) => void
    ): Promise<void> => {
      if (!visURL || !visPath) {
        reject("Vis not available");
      }

      const {fullPath, dirname}: PathInfo =
        FileService.getPath(
          this._adapter.config.path_livestream,
          this._adapter.config.filename_livestream,
          ++this._liveStreamCount,
          this.shortId,
          this.fullId,
          this.kind,
        );

      const folderPrepared: boolean = await FileService.prepareFolder(dirname).catch((reason: any): boolean => {
        this.catcher("Couldn't prepare folder.", reason);
        return false;
      });
      if (!folderPrepared) {
        this.warn(`Failed to prepare Livestream folder ("${fullPath}")`);
        reject("Failed to prepare Livestream folder");
        return;
      }
      FileService.deleteFileIfExistSync(fullPath, this._adapter);
      resolve({visURL: visURL, visPath: visPath, fullPath: fullPath});
    });
  }

  private getActiveNightImageOptions(): { night_contrast: boolean; night_sharpen: boolean } {
    let night_contrast: boolean = false;
    let night_sharpen: boolean = false;

    if (this._adapter.Sunrise > 0 && this._adapter.Sunset > 0) {
      const today: number = Date.now();
      this.silly(`Now: ${today}, sunrise: ${this._adapter.Sunrise}, sunset: ${this._adapter.Sunset}`);
      const isNight: boolean = today < this._adapter.Sunrise || today > this._adapter.Sunset;
      this.debug(`is Night: ${isNight}`);
      night_contrast = this._adapter.config.night_contrast_HDsnapshot && isNight || !this._adapter.config.night_contrast_HDsnapshot;
      night_sharpen = this._adapter.config.night_sharpen_HDsnapshot && isNight || !this._adapter.config.night_sharpen_HDsnapshot;
    }
    return {night_contrast, night_sharpen};
  }

  public updateByDevice(ringDevice: RingCamera): void {
    this._ringDevice = ringDevice;
    this.subscribeToEvents();
    this._state = EventState.Idle;
    this.update(ringDevice.data as CameraData);
  }

  private update(data: AnyCameraData): void {
    this.debug(`Received Update`);
    this.updateDeviceInfoObject(data as CameraData);
    this.updateHealth();
    this.updateHistory();
    this.updateSnapshotObject();
    this.updateHDSnapshotObject();
  }

  public setDurationLivestream(val: number): void {
    this.silly(`${this.shortId}.durationLivestream()`);
    this._durationLiveStream = val;
    this._adapter.upsertState(
      `${this.liveStreamChannelId}.${STATE_ID_LIVESTREAM_DURATION}`,
      COMMON_LIVESTREAM_DURATION,
      this._durationLiveStream,
      true,
    );
    this.debug(`Livestream duration set to: ${val}`);
  }

  public updateHealth(): void {
    this.silly(`Update Health`);
    this._ringDevice.getHealth().then(this.updateHealthObject.bind(this));
  }

  private autoSched(): void {
    const media: { val: number; fct: () => void; name: string; start: number }[] =
      [
        {
          name: "Snaspshot",
          val: this._adapter.config.save_snapshot,
          fct: (): void => {
            this.takeSnapshot();
          },
          start: 0
        },
        {
          name: "HD Snapshot",
          val: this._adapter.config.save_HDsnapshot,
          fct: (): void => {
            this.takeHDSnapshot();
          },
          start: 2
        },
        {
          name: "Livestream",
          val: this._adapter.config.save_livestream,
          fct: (): void => {
            this.startLivestream();
          },
          start: 4
        }
      ];

    for (const m of media) {
      if (m.val > 0) {
        let schedMinute: string = "*";
        let schedHour: string = "*";
        if (m.val === 3600) {
          schedMinute = "1";
          schedHour = "12";
        } else if (m.val === 60) {
          schedMinute = "3";
        } else if (m.val < 60) {
          schedMinute = `${m.start}-59/${m.val.toString()}`;
        }

        schedule.scheduleJob(
          `Auto save ${m.name}_${this._adapter.name}_${this._adapter.instance}`,
          `${m.start * 10} ${schedMinute} ${schedHour} * * *`,
          (): void => {
            this.info(`Cronjob Auto save ${m.name} starts`);
            m.fct();
          }
        );
      }
    }
  }

  private async subscribeToEvents(): Promise<void> {
    this.silly(`Start device subscriptions`);
    await this._ringDevice.subscribeToDingEvents().catch((r: any): void => {
      this.catcher(`Failed subscribing to Ding Events for ${this._ringDevice.name}`, r);
    });
    await this._ringDevice.subscribeToMotionEvents().catch((r: any): void => {
      this.catcher(`Failed subscribing to Motion Events for ${this._ringDevice.name}`, r);
    });
    this._ringDevice.onData.subscribe(this.update.bind(this));
    this._ringDevice.onMotionDetected.subscribe(
      {
        next: (motion: boolean): void => {
          this.onMotion(motion);
        },
        error: (err: Error): void => {
          this.catcher(`Motion Observer received error`, err);
        },
      }
    );
    this._ringDevice.onDoorbellPressed.subscribe(
      {
        next: (ding: PushNotificationDing): void => {
          this.onDoorbell(ding);
        },
        error: (err: Error): void => {
          this.catcher(`Doorbell Observer received error`, err);
        },
      }
    );
    this._ringDevice.onNewNotification.subscribe(
      {
        next: (ding: PushNotificationDing): void => {
          this.onDing(ding);
        },
        error: (err: Error): void => {
          this.catcher(`Ding Observer received error`, err);
        },
      }
    );
  }

  private updateDeviceInfoObject(data: CameraData): void {
    this._adapter.upsertState(
      `${this.infoChannelId}.id`,
      COMMON_INFO_ID,
      data.device_id,
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.kind`,
      COMMON_INFO_KIND,
      data.kind as string,
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.description`,
      COMMON_INFO_DESCRIPTION,
      data.description,
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.external_connection`,
      COMMON_INFO_EXTERNAL_CONNECTION,
      data.external_connection,
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.hasLight`,
      COMMON_INFO_HAS_LIGHT,
      this._ringDevice.hasLight,
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.hasBattery`,
      COMMON_INFO_HAS_BATTERY,
      this._ringDevice.hasBattery,
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.hasSiren`,
      COMMON_INFO_HAS_SIREN,
      this._ringDevice.hasSiren,
    );
  }

  private updateHistoryObject(lastAction: LastAction): void {
    this._adapter.upsertState(
      `${this.historyChannelId}.created_at`,
      COMMON_HISTORY_CREATED_AT,
      lastAction.event.created_at,
    );
    this._adapter.upsertState(
      `${this.historyChannelId}.history_url`,
      COMMON_HISTORY_URL,
      lastAction.historyUrl,
    );
    this._adapter.upsertState(
      `${this.historyChannelId}.kind`,
      COMMON_HISTORY_KIND,
      lastAction.event.kind,
    );
  }

  private async updateSnapshotRequest(ack: boolean = true): Promise<void> {
    this._adapter.upsertState(
      `${this.snapshotChannelId}.${STATE_ID_SNAPSHOT_REQUEST}`,
      COMMON_SNAPSHOT_REQUEST,
      false,
      ack,
      true,
    );
  }

  private async updateHDSnapshotRequest(ack: boolean = true): Promise<void> {
    this._adapter.upsertState(
      `${this.HDsnapshotChannelId}.${STATE_ID_HDSNAPSHOT_REQUEST}`,
      COMMON_HDSNAPSHOT_REQUEST,
      false,
      ack,
      true,
    );
  }

  private async updateSnapshotObject(): Promise<void> {
    this.debug(`Update Snapshot Object`);
    if (this._lastSnapshotTimestamp !== 0) {
      this._adapter.upsertState(
        `${this.snapshotChannelId}.file`,
        COMMON_SNAPSHOT_FILE,
        this._lastSnapShotDir,
      );
      this._adapter.upsertState(
        `${this.snapshotChannelId}.moment`,
        COMMON_SNAPSHOT_MOMENT,
        this._lastSnapshotTimestamp,
      );
      this._adapter.upsertState(
        `${this.snapshotChannelId}.url`,
        COMMON_SNAPSHOT_URL,
        this._lastSnapShotUrl,
      );
    }
    await this.updateSnapshotRequest();
  }

  private async updateHDSnapshotObject(): Promise<void> {
    this.debug(`Update HD Snapshot Object`);
    if (this._lastHDSnapshotTimestamp !== 0) {
      this._adapter.upsertState(
        `${this.HDsnapshotChannelId}.file`,
        COMMON_HDSNAPSHOT_FILE,
        this._lastHDSnapShotDir,
      );
      this._adapter.upsertState(
        `${this.HDsnapshotChannelId}.moment`,
        COMMON_HDSNAPSHOT_MOMENT,
        this._lastHDSnapshotTimestamp,
      );
      this._adapter.upsertState(
        `${this.HDsnapshotChannelId}.url`,
        COMMON_HDSNAPSHOT_URL,
        this._lastHDSnapShotUrl,
      );
    }
    await this.updateHDSnapshotRequest();
  }

  private async updateLivestreamRequest(ack: boolean = true): Promise<void> {
    this._adapter.upsertState(
      `${this.liveStreamChannelId}.${STATE_ID_LIVESTREAM_REQUEST}`,
      COMMON_LIVESTREAM_REQUEST,
      false,
      ack,
      true,
    );
    this._durationLiveStream = this._adapter.config.recordtime_livestream;
    this._adapter.upsertState(
      `${this.liveStreamChannelId}.${STATE_ID_LIVESTREAM_DURATION}`,
      COMMON_LIVESTREAM_DURATION,
      this._durationLiveStream,
      ack,
      true,
    );
  }

  private async updateLiveStreamObject(): Promise<void> {
    this.debug(`Update Livestream Object`);
    if (this._lastLiveStreamTimestamp !== 0) {
      this._adapter.upsertState(
        `${this.liveStreamChannelId}.file`,
        COMMON_LIVESTREAM_FILE,
        this._lastLiveStreamDir,
      );
      this._adapter.upsertState(
        `${this.liveStreamChannelId}.url`,
        COMMON_LIVESTREAM_URL,
        this._lastLiveStreamUrl,
      );
      this._adapter.upsertState(
        `${this.liveStreamChannelId}.moment`,
        COMMON_LIVESTREAM_MOMENT,
        this._lastLiveStreamTimestamp,
      );
    }
    await this.updateLivestreamRequest();
  }

  private updateHealthObject(health: CameraHealth): void {
    this.debug("Update Health Callback");
    let batteryPercent: number = parseInt(health.battery_percentage ?? "-1");
    if (isNaN(batteryPercent)) {
      batteryPercent = -1;
    }
    this._adapter.upsertState(
      `${this.infoChannelId}.battery_percentage`,
      COMMON_INFO_BATTERY_PERCENTAGE,
      batteryPercent,
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.battery_percentage_category`,
      COMMON_INFO_BATTERY_PERCENTAGE_CATEGORY,
      health.battery_percentage_category,
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.wifi_name`,
      COMMON_INFO_WIFI_NAME,
      health.wifi_name,
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.latest_signal_strength`,
      COMMON_INFO_LATEST_SIGNAL_STRENGTH,
      health.latest_signal_strength,
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.latest_signal_category`,
      COMMON_INFO_LATEST_SIGNAL_CATEGORY,
      health.latest_signal_category,
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.firmware`,
      COMMON_INFO_FIRMWARE,
      health.firmware,
    );
    if (this._ringDevice.hasLight && (Date.now() - this._lastLightCommand > 60000)) {
      // this.silly(JSON.stringify(this._ringDevice.data));
      const floodlightOn: boolean = (this._ringDevice.data as any).health.floodlight_on as boolean;
      this.debug(`Update Light within Health Update Floodlight is ${floodlightOn}`);
      this._adapter.upsertState(
        `${this.lightChannelId}.light_state`,
        COMMON_LIGHT_STATE,
        floodlightOn,
      );
    }
  }

  private onDing(value: PushNotificationDing): void {
    this.debug(`Received Ding Event (${util.inspect(value, true, 1)})`);
    this.conditionalRecording(EventState.ReactingOnDing, value.ding.image_uuid);
    this._adapter.upsertState(
      `${this.eventsChannelId}.type`,
      COMMON_EVENTS_TYPE,
      value.subtype,
    );
    this._adapter.upsertState(
      `${this.eventsChannelId}.detectionType`,
      COMMON_EVENTS_DETECTIONTYPE,
      value.ding.detection_type ?? value.subtype,
    );
    this._adapter.upsertState(
      `${this.eventsChannelId}.created_at`,
      COMMON_EVENTS_MOMENT,
      Date.now(),
    );
    this._adapter.upsertState(
      `${this.eventsChannelId}.message`,
      COMMON_EVENTS_MESSAGE,
      value.aps.alert,
    );
  }

  private onMotion(value: boolean): void {
    if (value && this._eventBlocker.motion.checkBlock()
    ) {
      this.debug(`ignore Motion event...`);
      return;
    }
    this.debug(`Received Motion Event (${util.inspect(value, true, 1)})`);
    this._adapter.upsertState(
      `${this.eventsChannelId}.motion`,
      COMMON_MOTION,
      value,
    );
    value && this.conditionalRecording(EventState.ReactingOnMotion);
  }

  private onDoorbell(value: PushNotificationDing): void {
    if (value && this._eventBlocker.doorbell.checkBlock()
    ) {
      this.debug(`ignore Doorbell event...`);
      return;
    }
    this.debug(`Received Doorbell Event (${util.inspect(value, true, 1)})`);
    this._adapter.upsertState(
      `${this.eventsChannelId}.doorbell`,
      COMMON_EVENTS_DOORBELL,
      true,
    );
    setTimeout((): void => {
      this._adapter.upsertState(
        `${this.eventsChannelId}.doorbell`,
        COMMON_EVENTS_DOORBELL,
        false,
      );
    }, 1000);
    this.conditionalRecording(EventState.ReactingOnDoorbell, value.ding.image_uuid);
  }

  private async conditionalRecording(state: EventState, uuid?: string): Promise<void> {
    if (this._state !== EventState.Idle) {
      this.silly(`Would have recorded due to "${EventState[state]}", but we are already reacting.`);
      if (this._adapter.config.auto_HDsnapshot && uuid) {
        setTimeout((): void => {
          this.debug(`delayed HD recording`);
          this.takeHDSnapshot();
        }, this._adapter.config.recordtime_auto_livestream * 1000 + 3000);
      }
      if (this._adapter.config.auto_snapshot && uuid) {
        setTimeout((): void => {
          this.debug(`delayed uuid recording`);
          this.takeSnapshot(uuid);
        }, this._adapter.config.recordtime_auto_livestream * 1000 + 4000);
      }
      return;
    }

    this.silly(`Start recording for Event "${EventState[state]}"...`);
    this._state = state;
    try {
      this._adapter.config.auto_HDsnapshot && await this.takeHDSnapshot();
      this._adapter.config.auto_snapshot && !this._ringDevice.hasBattery && await this.takeSnapshot(uuid, true);
      this._adapter.config.auto_livestream && await this.startLivestream(this._adapter.config.recordtime_auto_livestream);
    } finally {
      this._state = EventState.Idle;
    }
    return;
  }
}
