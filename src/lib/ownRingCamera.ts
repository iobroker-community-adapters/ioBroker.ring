import {
  AnyCameraData,
  CameraData,
  CameraEvent,
  CameraEventResponse,
  CameraHealth,
  DingKind,
  RingCamera
} from "ring-client-api";
import { firstValueFrom } from "rxjs";
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
  CHANNEL_NAME_HISTORY,
  CHANNEL_NAME_INFO,
  CHANNEL_NAME_LIGHT,
  CHANNEL_NAME_LIVESTREAM,
  CHANNEL_NAME_SNAPSHOT,
  CHANNEL_NAME_HDSNAPSHOT,
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
  COMMON_HDSNAPSHOT_AUTO,
  COMMON_HDSNAPSHOT_FILE,
  COMMON_HDSNAPSHOT_MOMENT,
  COMMON_HDSNAPSHOT_REQUEST,
  COMMON_HDSNAPSHOT_URL,
  STATE_ID_DEBUG_REQUEST,
  STATE_ID_LIGHT_SWITCH,
  STATE_ID_LIVESTREAM_DURATION,
  STATE_ID_LIVESTREAM_REQUEST,
  STATE_ID_SNAPSHOT_REQUEST,
  STATE_ID_HDSNAPSHOT_REQUEST,
} from "./constants";
import { LastAction } from "./lastAction";
import { FileService } from "./services/file-service";
import { OwnRingLocation } from "./ownRingLocation";
import { OwnRingDevice } from "./ownRingDevice";

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
  private _ringDevice: RingCamera;
  private lastAction: LastAction | undefined;
  private _durationLiveStream = this._adapter.config.recordtime_livestream;
  private _lastLightCommand = 0;
  private _lastLiveStreamUrl = "";
  private _lastLiveStreamDir = "";
  private _lastLiveStreamTimestamp = 0;
  private _lastSnapShotUrl = "";
  private _lastSnapShotDir = "";
  private _lastSnapshotTimestamp = 0;
  private _snapshotCount = 0;
  private _lastHDSnapShotUrl = "";
  private _lastHDSnapShotDir = "";
  private _lastHDSnapshotTimestamp = 0;
  private _HDsnapshotCount = 0;
  private _liveStreamCount = 0;
  private _state = EventState.Idle;
  private _doorbellEventActive: boolean = false;

  get lastLiveStreamDir(): string {
    return this._lastLiveStreamDir;
  }

  get lastSnapShotDir(): string {
    return this._lastSnapShotDir;
  }

  get lastHDSnapShotDir(): string {
    return this._lastHDSnapShotDir;
  }

  get ringDevice(): RingCamera {
    return this._ringDevice;
  }

  private getDay(): string {
    const en = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const de = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
    const ru = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
    const pt = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];
    const nl = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
    const fr = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
    const it = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
    const es = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    const pl = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];
    const uk = ["понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота", "неділя"];
    const zh = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

    const dow = (new Date().getDay()+ 6) % 7

    switch (this._adapter.language) {
      case "en": return en[dow];
      case "de": return de[dow];
      case "ru": return ru[dow];
      case "pt": return pt[dow];
      case "nl": return nl[dow];
      case "fr": return fr[dow];
      case "it": return it[dow];
      case "es": return es[dow];
      case "pl": return pl[dow];
      case "zh-cn": return zh[dow];
    }
    return en[dow];
  }

  private getDateFormat():string {
    let sPattern = "/";
    if (!this._adapter.dateFormat.includes(sPattern)) {
      sPattern = "-";
      if (!this._adapter.dateFormat.includes(sPattern)) {
        sPattern = ".";
        if (!this._adapter.dateFormat.includes(sPattern))
          return "%y/%m/%d";
      }
    }
    let rDate: string = "";
    for(const val of this._adapter.dateFormat.split(sPattern)) {
      switch(val) {
        case "YYYY": rDate += "%y";  break;
        case "YY":   rDate += "%y";  break;
        case "Y":    rDate += "%Y";  break;
        case "MMMM": rDate += "%B";  break;
        case "MMM":  rDate += "%b";  break;
        case "MM":   rDate += "%m";  break;
        case "M":    rDate += "%-m"; break;
        case "DD":   rDate += "%d";  break;
        case "D":    rDate += "%-d"; break;
      }
      rDate = rDate + sPattern;
    }
    rDate = rDate.slice(0, rDate.length - 1);
    return rDate;
  }

  private videoFilter(overlay: boolean, startTime: number = 0): string[] {
    const start =  `00:00:0${startTime.toString()}`;
    const filter = `drawtext='
                      fontsize=30:
                      fontcolor=white:
                      x=(main_w-text_w-20):
                      y=20:shadowcolor=black:
                      shadowx=2:
                      shadowy=2:
                      text=${this._ringDevice.data.description}',
                    drawtext='
                      fontsize=30:
                      fontcolor=white:
                      x=20:
                      y=(main_h-text_h-20):
                      shadowcolor=black:
                      shadowx=2:
                      shadowy=2:
                      text=%{localtime\\:${this.getDay()}, ${this.getDateFormat()} %T}'`;
    return (overlay && startTime > 0 ? ["-ss", start, "-vf", filter] :
      (overlay ? ["-vf", filter] :
        (startTime > 0 ? ["-ss", start] : [])));
  }

  private async addText(jpg: Buffer):Promise<Buffer> {
    const width = 640;
    const height = 360;
    const font_size = 15;
    const border_dist = 10;

    const text1= this._ringDevice.data.description;
    const text2= strftime(`${this.getDay()}, ${this.getDateFormat()} %T`);

    const svgText = `
      <svg width="${width}" height="${height}">
        <style>
          .title { fill: white; font-size: ${font_size}px; filter: drop-shadow(2px 2px 1px rgb(0 0 0 / 0.9))}
        </style>
        <text x="${width-border_dist}" y="${border_dist+font_size}" text-anchor="end" class="title">${text1}</text>
        <text x="10" y="${height-border_dist}" text-anchor="start" class="title">${text2}</text>
      </svg>`;

    const svgBuffer = Buffer.from(svgText);

    return Sharp(jpg)
      .composite([{input: svgBuffer, left: 0, top: 0}])
      .toBuffer();
  }

  private autoSched():void {
    const media = [
      { name: "Snaspshot",   val: this._adapter.config.save_snapshot,   fct: ()=>{ this.takeSnapshot() },    start:  0 },
      { name: "HD Snapshot", val: this._adapter.config.save_HDsnapshot, fct: ()=>{ this.takeHDSnapshot() },  start:  2 },
      { name: "Livestream",  val: this._adapter.config.save_livestream, fct: ()=>{ this.startLivestream() }, start:  4 }
    ];

    for (const m of media) {
      if (m.val > 0) {
        let schedMinute = "*";
        let schedHour = "*";
        if (m.val === 3600) {
          schedMinute = "1";
          schedHour = "12";
        } else if (m.val === 60) {
          schedMinute = "3";
        }
        else if (m.val < 60) {
          schedMinute = `${m.start}-59/${m.val.toString()}`;
        }

        schedule.scheduleJob(`Auto save ${m.name}_${this._adapter.name}_${this._adapter.instance}`, `${m.start * 10} ${schedMinute} ${schedHour} * * *`, () => {
          this.info(`Cronjob Auto save ${m.name} starts`);
          m.fct();
        });
      }
    }
  }

  private set ringDevice(device) {
    this._ringDevice = device;
    this.subscribeToEvents();
  }

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
    this.debug(`Create device`);
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
    // noinspection JSIgnoredPromiseFromCall
    this.updateHistory();
    this.updateSnapshotObject();
    this.updateHDSnapshotObject();
    this.updateLiveStreamObject();
    this.ringDevice = ringDevice; // subscribes to the events
    this.autoSched();
  }

  public override async processUserInput(channelID: string, stateID: string, state: ioBroker.State): Promise<void> {
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
            false,
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
                targetVal,
              );
              this._adapter.upsertState(
                `${this.lightChannelId}.light_switch`,
                COMMON_LIGHT_SWITCH,
                targetVal,
                true,
                true,
              );
              setTimeout(() => this.updateHealth.bind(this), 65000);
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
            await this.takeSnapshot().catch(reason => {
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
          const targetVal = state.val as boolean;
          this._adapter.log.debug(`Get HDSnapshot request for ${this.shortId} to value ${targetVal}`);
          if (targetVal) {
            await this.takeHDSnapshot().catch((reason) => {
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
          const targetVal = state.val as boolean;
          this._adapter.log.debug(`Get Livestream request for ${this.shortId} to value ${targetVal}`);
          if (targetVal) {
            await this.startLivestream().catch(reason => {
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

  public updateByDevice(ringDevice: RingCamera): void {
    this.ringDevice = ringDevice;
    this._state = EventState.Idle;
    this.update(ringDevice.data as CameraData);
  }

  public update(data: AnyCameraData): void {
    this.debug(`Received Update`);
    this.updateDeviceInfoObject(data as CameraData);
    this.updateHealth();
    // noinspection JSIgnoredPromiseFromCall
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

  public async startLivestream(duration?: number): Promise<void> {
    this.silly(`${this.shortId}.startLivestream()`);
    duration ??= this._durationLiveStream;
    const {visURL, visPath} =
      await FileService.getVisUrl(
        this._adapter,
        this.fullId,
        "Livestream.mp4",
      );
    if (!visURL || !visPath) {
      this.warn("Vis not available");
    }

    const {fullPath, dirname} =
      FileService.getPath(
        this._adapter.config.path_livestream,
        this._adapter.config.filename_livestream,
        ++this._liveStreamCount,
        this.shortId,
        this.fullId,
        this.kind,
      );

    if (!(await FileService.prepareFolder(dirname))) {
      this.warn(`Failed to prepare Livestream folder ("${fullPath}")`);
      await this.updateLivestreamRequest(false);
      return;
    }
    FileService.deleteFileIfExistSync(fullPath, this._adapter);
    if (this._ringDevice.isOffline) {
      this.info(` is offline --> won't take LiveStream`);
      await this.updateLivestreamRequest(false);
      return;
    }
    const tempPath = (await FileService.getTempDir(this._adapter)) + `/temp_${this.shortId}_livestream.mp4`
    const liveCall = await this._ringDevice.streamVideo({
      video: this.videoFilter(this._adapter.config.overlay_Livestream),
      output: ["-t", duration.toString(), tempPath],
    })
    await firstValueFrom(liveCall.onCallEnded);

    if (!fs.existsSync(tempPath)) {
      this.warn(`Couldn't create livestream`);
      await this.updateLivestreamRequest(false);
      return;
    }
    const video = fs.readFileSync(tempPath);

    // clean up
    fs.unlink(tempPath, (err) => {
      if (err) {
        this._adapter.logCatch(`Couldn't delete temp file`, err);
      }
    })
    if (this._lastLiveStreamDir !== "" && this._adapter.config.del_old_livestream) {
      FileService.deleteFileIfExistSync(this._lastLiveStreamDir, this._adapter);
    }

    if (visPath) {
      this.silly(`Locally storing Filestream (Length: ${video.length})`);
      await FileService.writeFile(visPath, video, this._adapter, () => {
        this._lastLiveStreamUrl = visURL;
      });
    }
    this.silly(`Writing Filestream (Length: ${video.length}) to "${fullPath}"`);
    await FileService.writeFile(fullPath, video, this._adapter, () => {
      this._lastLiveStreamDir = fullPath;
      this._lastLiveStreamTimestamp = Date.now();
      this.updateLiveStreamObject();
    });
    this.debug(`Done creating livestream to ${fullPath}`);
  }

  public async takeSnapshot(uuid?: string, eventBased = false): Promise<void> {
    this.silly(`${this.shortId}.takeSnapshot()`);

    const {visURL, visPath} =
      await FileService.getVisUrl(
        this._adapter,
        this.fullId, "Snapshot.jpg",
      );
    if (!visURL || !visPath) {
      this.warn("Vis not available");
    }

    const {fullPath, dirname} =
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
    /*
    const image = await this._ringDevice.getNextSnapshot({uuid: uuid}).catch((reason) => {
      if (eventBased) {
        this.warn("Taking Snapshot on Event failed. Will try again after livestream finished.");
      } else {
        this.catcher("Couldn't get Snapshot from api.", reason);
      }
    })
    */
    const image = await this._ringDevice.getNextSnapshot({force: true, uuid: uuid})
      .then((result):Buffer & ExtendedResponse => result)
      .catch((err):Buffer & ExtendedResponse => {
        if (eventBased) {
          this.warn("Taking Snapshot on Event failed. Will try again after livestream finished.");
        } else {
          this.catcher("Couldn't get Snapshot from api.", err);
        }
        return err;
      })

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
      image_txt = await this.addText(image)
        .catch(reason => {
          this.catcher("Couldn't add text to Snapshot.", reason);
          return reason
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
    await FileService.writeFile(fullPath, image_txt, this._adapter, () => this.updateSnapshotObject());
    this.debug(`Done creating snapshot to ${fullPath}`);
  }

  public async takeHDSnapshot(): Promise<void> {  // ..from very short Livestream
    this.silly(`${this.shortId}.takeHDSnapshot()`);
    // const duration = 2.0;
    const { visURL, visPath } =
      await FileService.getVisUrl(
        this._adapter,
        this.fullId,
        "HDSnapshot.jpg",
      );
    if (!visURL || !visPath) {
      this.warn("Vis not available! Please install e.g. flot or other Vis related adapter");
      await this.updateHDSnapshotRequest(false);
      return;
    }

    const {fullPath, dirname} =
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
    let night_contrast: boolean = false;
    let night_sharpen: boolean = false;

    if (this._adapter.Sunrise > 0 && this._adapter.Sunset > 0) {
      const today = Date.now()
      this.silly(`Now: ${today}, sunrise: ${this._adapter.Sunrise}, sunset: ${this._adapter.Sunset}`)
      const isNight = today < this._adapter.Sunrise || today > this._adapter.Sunset
      this.debug(`is Night: ${isNight}`)
      night_contrast =  this._adapter.config.night_contrast_HDsnapshot && isNight || !this._adapter.config.night_contrast_HDsnapshot
      night_sharpen =  this._adapter.config.night_sharpen_HDsnapshot && isNight || !this._adapter.config.night_sharpen_HDsnapshot
    }
    const tempPath = (await FileService.getTempDir(this._adapter)) + `/temp_${this.shortId}_livestream.jpg`;
    const liveCall = await this._ringDevice.streamVideo({
      video: this.videoFilter(this._adapter.config.overlay_HDsnapshot, night_contrast ? this._adapter.config.contrast_HDsnapshot : 0),
      // output: ["-t", duration.toString(), "-f", "mjpeg", "-q:v", 3, "-frames:v", 1, tempPath]
      output: ["-f", "mjpeg", "-q:v", 3, "-frames:v", 1, tempPath]
    })
    await firstValueFrom(liveCall.onCallEnded);

    if (!fs.existsSync(tempPath)) {
      this.warn(`Couldn't create HD Snapshot`);
      await this.updateHDSnapshotRequest(false);
      return;
    } else {
      this.silly(`HD Snapshot from livestream created`);
    }
    let jpg = fs.readFileSync(tempPath);

    if (night_sharpen && this._adapter.config.sharpen_HDsnapshot && this._adapter.config.sharpen_HDsnapshot > 0) {
      const sharpen  = this._adapter.config.sharpen_HDsnapshot == 1 ? undefined : { sigma: this._adapter.config.sharpen_HDsnapshot-1 }
      jpg = await Sharp(jpg)
        .sharpen(sharpen)
        .toBuffer()
        .catch(reason => {
          this.catcher("Couldn't sharpen HD Snapshot.", reason);
          return reason;
        });
    }

    // clean up
    fs.unlink(tempPath, (err) => {
      if (err) {
        this._adapter.logCatch(`Couldn't delete temp file ${tempPath}`, err);
      }
    })
    if (this._lastHDSnapShotDir !== "" && this._adapter.config.del_old_HDsnapshot) {
      FileService.deleteFileIfExistSync(this._lastHDSnapShotDir, this._adapter);
    }

    if (visPath) {
      this.silly(`Locally storing HD Snapshot (Length: ${jpg.length})`)
      await FileService.writeFile(visPath, jpg, this._adapter, () => this._lastHDSnapShotUrl = visURL);
    }
    this.silly(`Writing HD Snapshot to ${fullPath} (Length: ${jpg.length})`);
    await FileService.writeFile(fullPath, jpg, this._adapter, () => {
      this._lastHDSnapShotDir = fullPath;
      this._lastHDSnapshotTimestamp = Date.now();
      this.updateHDSnapshotObject();
    })
    this.debug(`Done creating HDSnapshot to ${visPath}`);
  }

  public updateHealth(): void {
    this.silly(`Update Health`);
    this._ringDevice.getHealth().then(this.updateHealthObject.bind(this));
  }

  public async updateHistory(): Promise<void> {
    this.silly(`Update History`);
    this._ringDevice.getEvents({ limit: 50 })
      .then(async (r: CameraEventResponse) => {
        this.silly(`Received Event History`);
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
        this.lastAction = new LastAction(lastAction, url);
        this.updateHistoryObject(this.lastAction);
      });
  }

  protected async recreateDeviceObjectTree(): Promise<void> {
    this.silly(`Recreate DeviceObjectTree`);
    this._adapter.createDevice(this.fullId, {
      name: `Device ${this.shortId} ("${this._ringDevice.data.description}")`,
    })
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_INFO, {name: `Info ${this.shortId}`});
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_SNAPSHOT, {name: `Snapshot ${this.shortId}`});
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_HDSNAPSHOT, {name: `HD Snapshot ${this.shortId}`});
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_LIVESTREAM, {name: `Livestream ${this.shortId}`});
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_HISTORY);
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_EVENTS);
    if (this._ringDevice.hasLight) {
      this.debug(`Device with Light Capabilities detected`)
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
          this.onMotion(motion);
        },
        error: (err: Error) => {
          this.catcher(`Motion Observer received error`, err);
        },
      }
    );
    this._ringDevice.onDoorbellPressed.subscribe(
      {
        next: (ding: PushNotificationDing) => {
          this.onDoorbell(ding);
        },
        error: (err: Error) => {
          this.catcher(`Doorbell Observer received error`, err);
        },
      }
    );
    this._ringDevice.onNewNotification.subscribe(
      {
        next: (ding: PushNotificationDing) => {
          this.onDing(ding)
        },
        error: (err: Error) => {
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

  private async updateSnapshotRequest(ack = true): Promise<void> {
    this._adapter.upsertState(
      `${this.snapshotChannelId}.${STATE_ID_SNAPSHOT_REQUEST}`,
      COMMON_SNAPSHOT_REQUEST,
      false,
      ack,
      true,
    );
  }

  private async updateHDSnapshotRequest(ack = true): Promise<void> {
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

  private async updateLivestreamRequest(ack = true): Promise<void> {
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
      const floodlightOn = (this._ringDevice.data as any).health.floodlight_on as boolean;
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
    this.debug(`Received Motion Event (${util.inspect(value, true, 1)})`);
    this._adapter.upsertState(
      `${this.eventsChannelId}.motion`,
      COMMON_MOTION,
      value,
    );
    value && this.conditionalRecording(EventState.ReactingOnMotion);
  }

  private onDoorbell(value: PushNotificationDing): void {
    if (this._doorbellEventActive) {
      this.debug(`Received Doorbell Event, but we are already reacting. Ignoring.`)
      return;
    }
    this.info("Doorbell pressed --> Will ignore additional presses for the next 25s.")
    this.debug(`Received Doorbell Event (${util.inspect(value, true, 1)})`);
    this._doorbellEventActive = true;
    this._adapter.upsertState(
      `${this.eventsChannelId}.doorbell`,
      COMMON_EVENTS_DOORBELL,
      true,
    );
    setTimeout(() => {
      this._adapter.upsertState(
        `${this.eventsChannelId}.doorbell`,
        COMMON_EVENTS_DOORBELL,
        false,
      );
    }, 5000);
    setTimeout(() => this._doorbellEventActive = false, 25000);
    this.conditionalRecording(EventState.ReactingOnDoorbell, value.ding.image_uuid);
  }

  private async conditionalRecording(state: EventState, uuid?: string): Promise<void> {
    if (this._state !== EventState.Idle) {
      this.silly(`Would have recorded due to "${EventState[state]}", but we are already reacting.`);
      if (this._adapter.config.auto_HDsnapshot && uuid) {
        setTimeout(() => {
          this.debug(`delayed HD recording`);
          this.takeHDSnapshot();
        }, this._adapter.config.recordtime_auto_livestream * 1000 + 3000);
      }
      if (this._adapter.config.auto_snapshot && uuid) {
        setTimeout(() => {
          this.debug(`delayed uuid recording`);
          this.takeSnapshot(uuid);
        }, this._adapter.config.recordtime_auto_livestream * 1000 + 4000);
      }
      return
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
