"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) for (var k in mod) if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
  __setModuleDefault(result, mod);
  return result;
};
Object.defineProperty(exports, '__esModule', {value: true});
exports.OwnRingDevice = void 0;
const ring_client_api_1 = require('ring-client-api');
const constants_1 = require('./constants');
const lastAction_1 = require('./lastAction');
const fs = __importStar(require('fs'));
const file_service_1 = require('./services/file-service');
const util = __importStar(require('util'));
var EventState;
(function (EventState) {
  EventState[EventState['Idle'] = 0] = 'Idle';
  EventState[EventState['ReactingOnMotion'] = 1] = 'ReactingOnMotion';
  EventState[EventState['ReactingOnDing'] = 2] = 'ReactingOnDing';
  EventState[EventState['ReactingOnDoorbell'] = 3] = 'ReactingOnDoorbell';
})(EventState || (EventState = {}));

class OwnRingDevice {
  constructor(ringDevice, locationIndex, adapter, apiClient) {
    this._requestingSnapshot = false;
    this._requestingLiveStream = false;
    this._lastLightCommand = 0;
    this._lastLiveStreamUrl = '';
    this._lastLiveStreamDir = '';
    this._lastLiveStreamVideo = null;
    this._lastLiveStreamTimestamp = 0;
    this._lastSnapShotUrl = '';
    this._lastSnapShotDir = '';
    this._lastSnapshotImage = null;
    this._lastSnapshotTimestamp = 0;
    this._snapshotCount = 0;
    this._liveStreamCount = 0;
    this._state = EventState.Idle;
    this._adapter = adapter;
    this.debug(`Create device with ID: ${ringDevice.id}`);
    this._ringDevice = ringDevice;
    this._locationIndex = locationIndex;
    this._client = apiClient;
    this.path = `${this._locationIndex}.`;
    this.kind = OwnRingDevice.evaluateKind(ringDevice, adapter);
    this.shortId = `${ringDevice.id}`;
    this.fullId = `${this.kind}_${this.shortId}`;
    this.infoChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_INFO}`;
    this.historyChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_HISTORY}`;
    this.lightChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_LIGHT}`;
    this.snapshotChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_SNAPSHOT}`;
    this.liveStreamChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_LIVESTREAM}`;
    this.eventsChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_EVENTS}`;
    this.recreateDeviceObjectTree();
    this.updateDeviceInfoObject(ringDevice.data);
        this.updateHealth();
        // noinspection JSIgnoredPromiseFromCall
        this.updateHistory();
        this.updateLiveStreamObject();
        setTimeout(this.takeSnapshot.bind(this), 5000);
        this.ringDevice = ringDevice; // subscribes to the events
    }
    static getFullId(device, adapter) {
        return `${this.evaluateKind(device, adapter)}_${device.id}`;
    }
    static evaluateKind(device, adapter) {
      switch (device.deviceType) {
        case ring_client_api_1.RingCameraKind.doorbot:
        case ring_client_api_1.RingCameraKind.doorbell:
        case ring_client_api_1.RingCameraKind.doorbell_v3:
        case ring_client_api_1.RingCameraKind.doorbell_v4:
        case ring_client_api_1.RingCameraKind.doorbell_v5:
        case ring_client_api_1.RingCameraKind.doorbell_portal:
        case ring_client_api_1.RingCameraKind.doorbell_scallop:
        case ring_client_api_1.RingCameraKind.doorbell_scallop_lite:
        case ring_client_api_1.RingCameraKind.hp_cam_v1:
        case ring_client_api_1.RingCameraKind.hp_cam_v2:
        case ring_client_api_1.RingCameraKind.lpd_v1:
        case ring_client_api_1.RingCameraKind.lpd_v2:
        case ring_client_api_1.RingCameraKind.floodlight_v1:
        case ring_client_api_1.RingCameraKind.floodlight_v2:
        case ring_client_api_1.RingCameraKind.spotlightw_v2:
        case ring_client_api_1.RingCameraKind.jbox_v1:
        case 'lpd_v3':
        case 'lpd_v4':
          return `doorbell`;
        case ring_client_api_1.RingCameraKind.cocoa_camera:
        case ring_client_api_1.RingCameraKind.cocoa_doorbell:
        case ring_client_api_1.RingCameraKind.cocoa_floodlight:
          return `cocoa`;
        case ring_client_api_1.RingCameraKind.stickup_cam:
        case ring_client_api_1.RingCameraKind.stickup_cam_v3:
        case ring_client_api_1.RingCameraKind.stickup_cam_v4:
        case ring_client_api_1.RingCameraKind.stickup_cam_mini:
        case ring_client_api_1.RingCameraKind.stickup_cam_lunar:
        case ring_client_api_1.RingCameraKind.stickup_cam_elite:
          return `stickup`;
        default:
          adapter.log.error(`Device with Type ${device.deviceType} not yet supported, please inform dev Team via Github`);
          adapter.log.info(`Unsupported Device Info: ${util.inspect(device, false, 1)}`);
      }
        return "unknown";
    }
    get lastLiveStreamDir() {
        return this._lastLiveStreamDir;
    }
    get lastSnapShotDir() {
        return this._lastSnapShotDir;
    }
    get locationIndex() {
        return this._locationIndex;
    }
    get location() {
        if (this._client.locations.length < this._locationIndex) {
            this._adapter.log.error(`Can't find a Location with index ${this._locationIndex}`);
            return undefined;
        }
        return this._client.locations[this._locationIndex];
    }
    get ringDevice() {
        return this._ringDevice;
    }
    set ringDevice(device) {
        this._ringDevice = device;
        this._ringDevice.onData.subscribe(this.update.bind(this));
        this._ringDevice.onMotionDetected.subscribe(this.onMotion.bind(this));
        this._ringDevice.onDoorbellPressed.subscribe(this.onDorbell.bind(this));
        this._ringDevice.onNewNotification.subscribe(this.onDing.bind(this));
    }
    processUserInput(channelID, stateID, state) {
      switch (channelID) {
        case '':
          if (stateID !== constants_1.STATE_ID_DEBUG_REQUEST) {
            return;
          }
          const targetVal = state.val;
          if (targetVal) {
            this._adapter.log.info(`Device Debug Data for ${this.shortId}: ${util.inspect(this._ringDevice, false, 1)}`);
            this._adapter.upsertState(`${this.fullId}.${constants_1.STATE_ID_DEBUG_REQUEST}`, constants_1.COMMON_DEBUG_REQUEST, false);
          }
          return;
        case 'Light':
          if (!this._ringDevice.hasLight) {
            return;
          }
          if (stateID === constants_1.STATE_ID_LIGHT_SWITCH) {
            const targetVal = state.val;
            this._adapter.log.debug(`Set light for ${this.shortId} to value ${targetVal}`);
            this._lastLightCommand = Date.now();
            this._ringDevice.setLight(targetVal).then((success) => {
              if (success) {
                this._adapter.upsertState(`${this.lightChannelId}.light_state`, constants_1.COMMON_LIGHT_STATE, targetVal);
                this._adapter.upsertState(`${this.lightChannelId}.light_switch`, constants_1.COMMON_LIGHT_SWITCH, targetVal);
                setTimeout(() => {
                  this.updateHealth.bind(this);
                }, 65000);
              }
            });
          } else {
            this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
          }
          break;
        case 'Snapshot':
          if (stateID === constants_1.STATE_ID_SNAPSHOT_REQUEST) {
            const targetVal = state.val;
            this._adapter.log.debug(`Get Snapshot request for ${this.shortId} to value ${targetVal}`);
            if (targetVal) {
              this.takeSnapshot().catch((reason) => {
                this.catcher('Couldn\'t retrieve Snapshot.', reason);
              });
            }
          } else {
            this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
          }
          break;
        case 'Livestream':
          if (stateID === constants_1.STATE_ID_LIVESTREAM_REQUEST) {
            const targetVal = state.val;
            this._adapter.log.debug(`Get Livestream request for ${this.shortId} to value ${targetVal}`);
            if (targetVal) {
                        this.startLivestream().catch((reason) => {
                            this.catcher("Couldn't retrieve Livestream.", reason);
                        });
                    }
                }
                else {
                    this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                }
                break;
            default:
                this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
        }
    }
    async recreateDeviceObjectTree() {
        this.silly(`Recreate DeviceObjectTree for ${this.fullId}`);
        this._adapter.createDevice(this.fullId, {
            name: `Device ${this.shortId} ("${this._ringDevice.data.description}")`
        });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_INFO, { name: `Info ${this.shortId}` });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_SNAPSHOT);
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_LIVESTREAM, { name: `Livestream ${this.shortId}` });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_HISTORY);
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_EVENTS);
        if (this._ringDevice.hasLight) {
            this.debug(`Device with Light Capabilities detected "${this.fullId}"`);
            this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_LIGHT, { name: `Light ${this.shortId}` });
        }
        this._lastSnapShotDir = await this._adapter.tryGetStringState(`${this.snapshotChannelId}.snapshot_file`);
        this._lastLiveStreamDir = await this._adapter.tryGetStringState(`${this.liveStreamChannelId}.livestream_file`);
        this._adapter.upsertState(`${this.fullId}.${constants_1.STATE_ID_DEBUG_REQUEST}`, constants_1.COMMON_DEBUG_REQUEST, false, true);
    }
    updateByDevice(ringDevice) {
        this.ringDevice = ringDevice;
        this.update(ringDevice.data);
    }
    update(data) {
        this.debug(`Recieved Update for ${this.fullId}`);
        this.updateDeviceInfoObject(data);
        this.updateHealth();
        // noinspection JSIgnoredPromiseFromCall
        this.updateHistory();
        this.updateSnapshotObject();
    }
    async startLivestream(duration) {
      this.silly(`${this.shortId}.startLivestream()`);
      const {
        fullPath,
        dirname
      } = file_service_1.FileService.getPath(this._adapter.config.path, this._adapter.config.filename_livestream, ++this._liveStreamCount, this.shortId, this.fullId, this.kind);
      if (!(await file_service_1.FileService.prepareFolder(dirname))) {
        this.debug(`Failed to prepare Livestream folder ("${fullPath}") for ${this.shortId}`);
        return;
      }
      file_service_1.FileService.deleteFileIfExistSync(fullPath, this._adapter);
      if (this._ringDevice.isOffline) {
        this.info(`Device ${this.fullId} ("${this._ringDevice.data.description}") is offline --> won't take LiveStream
            `);
        return;
      }
      duration !== null && duration !== void 0 ? duration : (duration = this._adapter.config.recordtime_livestream);
      const tempPath = (await file_service_1.FileService.getTempDir(this._adapter)) + `/temp_${this.shortId}_livestream.mp4`;
      this.silly(`Initialize Livestream (${duration}s) to temp-file ${tempPath}`);
      await this._ringDevice.recordToFile(tempPath, duration);
      if (!fs.existsSync(tempPath)) {
        this.info(`Could't create livestream for ${this.shortId}`);
        return;
      }
      const video = fs.readFileSync(tempPath);
      fs.unlink(tempPath, (err) => {
        if (err) {
          this._adapter.logCatch(`Couldn't delete temp file`, err);
        }
      });
      this.silly(`Recieved Livestream has Length: ${video.length}`);
      this._lastLiveStreamUrl = await file_service_1.FileService.getVisUrl(this._adapter, this.fullId, 'Livestream.mp4');
      file_service_1.FileService.writeFileSync(fullPath, video, this._adapter);
      if (this.lastLiveStreamDir !== '' && this._adapter.config.del_old_livestream) {
        file_service_1.FileService.deleteFileIfExistSync(this._lastLiveStreamDir, this._adapter);
      }
      this._lastLiveStreamDir = fullPath;
      this._requestingLiveStream = false;
      // this.silly(`Locally storing Snapshot (Length: ${image.length})`);
      this._lastLiveStreamVideo = video;
      this._lastLiveStreamTimestamp = Date.now();
      await this.updateLiveStreamObject();
      this.debug(`Done creating livestream to ${fullPath}`);
    }
    async takeSnapshot(uuid) {
      const {fullPath, dirname} = file_service_1.FileService.getPath(this._adapter.config.path, this._adapter.config.filename_snapshot, ++this._snapshotCount, this.shortId, this.fullId, this.kind);
      if (!(await file_service_1.FileService.prepareFolder(dirname)))
        return;
      file_service_1.FileService.deleteFileIfExistSync(fullPath, this._adapter);
      if (this._ringDevice.isOffline) {
        this.info(`Device ${this.fullId} ("${this._ringDevice.data.description}") is offline --> won't take Snapshot
            `);
        return;
      }
      const image = await this._ringDevice.getSnapshot({uuid: uuid}).catch((reason) => {
        this.catcher('Couldn\'t get Snapshot from api.', reason);
      });
      if (!image) {
        this.info('Could not create snapshot');
        return;
      }
      this.silly(`Writing Snapshot (Length: ${image.length}) to "${fullPath}"`);
      file_service_1.FileService.writeFileSync(fullPath, image, this._adapter);
      this._lastSnapShotUrl = await file_service_1.FileService.getVisUrl(this._adapter, this.fullId, 'Snapshot.jpg');
      if (this.lastSnapShotDir !== '' && this._adapter.config.del_old_snapshot) {
        file_service_1.FileService.deleteFileIfExistSync(this._lastSnapShotDir, this._adapter);
      }
      this._lastSnapShotDir = fullPath;
      this._requestingSnapshot = false;
      // this.silly(`Locally storing Snapshot (Length: ${image.length})`);
      this._lastSnapshotImage = image;
      this._lastSnapshotTimestamp = Date.now();
      await this.updateSnapshotObject();
      this.debug(`Done creating snapshot to ${fullPath}`);
    }
    updateHealth() {
        this.silly(`Update Health for ${this.fullId}`);
        this._ringDevice.getHealth().then(this.updateHealthObject.bind(this));
    }
    async updateHistory() {
        this.silly(`Update History for ${this.fullId}`);
        this._ringDevice.getEvents({ limit: 50 })
            .then(async (r) => {
            this.silly(`Recieved Event History for ${this.fullId}`);
            const lastAction = r.events.find((event) => {
                const kind = event.kind;
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
            this.lastAction = new lastAction_1.LastAction(lastAction, url);
            this.updateHistoryObject(this.lastAction);
        });
    }
    updateDeviceInfoObject(data) {
        this._adapter.upsertState(`${this.infoChannelId}.id`, constants_1.COMMON_INFO_ID, data.device_id);
        this._adapter.upsertState(`${this.infoChannelId}.kind`, constants_1.COMMON_INFO_KIND, data.kind);
        this._adapter.upsertState(`${this.infoChannelId}.description`, constants_1.COMMON_INFO_DESCRIPTION, data.description);
        this._adapter.upsertState(`${this.infoChannelId}.external_connection`, constants_1.COMMON_INFO_EXTERNAL_CONNECTION, data.external_connection);
        this._adapter.upsertState(`${this.infoChannelId}.hasLight`, constants_1.COMMON_INFO_HAS_LIGHT, this._ringDevice.hasLight);
        this._adapter.upsertState(`${this.infoChannelId}.hasBattery`, constants_1.COMMON_INFO_HAS_BATTERY, this._ringDevice.hasBattery);
        this._adapter.upsertState(`${this.infoChannelId}.hasSiren`, constants_1.COMMON_INFO_HAS_SIREN, this._ringDevice.hasSiren);
    }
    updateHistoryObject(lastAction) {
        this._adapter.upsertState(`${this.historyChannelId}.created_at`, constants_1.COMMON_HISTORY_CREATED_AT, lastAction.event.created_at);
        this._adapter.upsertState(`${this.historyChannelId}.history_url`, constants_1.COMMON_HISTORY_URL, lastAction.historyUrl);
        this._adapter.upsertState(`${this.historyChannelId}.kind`, constants_1.COMMON_HISTORY_KIND, lastAction.event.kind);
    }
    async updateSnapshotObject() {
        this.debug(`Update Snapshot Object for "${this.fullId}"`);
        if (this._lastSnapshotImage) {
            await this._adapter.upsertFile(`${this.snapshotChannelId}.jpg`, constants_1.COMMON_SNAPSHOT_SNAPSHOT, this._lastSnapshotImage, this._lastSnapshotTimestamp).catch((reason) => {
                this.debug(`Couldn't update Snapshot obejct: "${reason}"`);
            });
        }
        if (this._lastSnapshotTimestamp !== 0) {
            this._adapter.upsertState(`${this.snapshotChannelId}.snapshot_file`, constants_1.COMMON_SNAPSHOT_FILE, this._lastSnapShotDir);
            this._adapter.upsertState(`${this.snapshotChannelId}.moment`, constants_1.COMMON_SNAPSHOT_MOMENT, this._lastSnapshotTimestamp);
            this._adapter.upsertState(`${this.snapshotChannelId}.snapshot_url`, constants_1.COMMON_SNAPSHOT_URL, this._lastSnapShotUrl);
            this._adapter.upsertState(`${this.snapshotChannelId}.${constants_1.STATE_ID_SNAPSHOT_REQUEST}`, constants_1.COMMON_SNAPSHOT_REQUEST, this._requestingSnapshot, true);
        }
    }
    async updateLiveStreamObject() {
        this.debug(`Update Livestream Object for "${this.fullId}"`);
        if (this._lastLiveStreamVideo) {
            await this._adapter.upsertFile(`${this.liveStreamChannelId}.mp4`, constants_1.COMMON_LIVESTREAM_LIVESTREAM, this._lastLiveStreamVideo, this._lastLiveStreamTimestamp).catch((reason) => {
                this.debug(`Couldn't update Livestream obejct: "${reason}"`);
            });
        }
        if (this._lastLiveStreamDir !== "") {
            this._adapter.upsertState(`${this.liveStreamChannelId}.livestream_file`, constants_1.COMMON_LIVESTREAM_FILE, this._lastLiveStreamDir);
            this._adapter.upsertState(`${this.liveStreamChannelId}.livestream_url`, constants_1.COMMON_LIVESTREAM_URL, this._lastLiveStreamUrl);
            this._adapter.upsertState(`${this.liveStreamChannelId}.moment`, constants_1.COMMON_LIVESTREAM_MOMENT, this._lastLiveStreamTimestamp);
        }
        this._adapter.upsertState(`${this.liveStreamChannelId}.${constants_1.STATE_ID_LIVESTREAM_REQUEST}`, constants_1.COMMON_LIVESTREAM_REQUEST, this._requestingLiveStream, true);
    }
    updateHealthObject(health) {
        var _a;
        this.debug(`Update Health Callback for "${this.fullId}"`);
        let batteryPercent = parseInt((_a = health.battery_percentage) !== null && _a !== void 0 ? _a : "-1");
        if (isNaN(batteryPercent)) {
            batteryPercent = -1;
        }
        this._adapter.upsertState(`${this.infoChannelId}.battery_percentage`, constants_1.COMMON_INFO_BATTERY_PERCENTAGE, batteryPercent);
        this._adapter.upsertState(`${this.infoChannelId}.battery_percentage_category`, constants_1.COMMON_INFO_BATTERY_PERCENTAGE_CATEGORY, health.battery_percentage_category);
        this._adapter.upsertState(`${this.infoChannelId}.wifi_name`, constants_1.COMMON_INFO_WIFI_NAME, health.wifi_name);
        this._adapter.upsertState(`${this.infoChannelId}.latest_signal_strength`, constants_1.COMMON_INFO_LATEST_SIGNAL_STRENGTH, health.latest_signal_strength);
        this._adapter.upsertState(`${this.infoChannelId}.latest_signal_category`, constants_1.COMMON_INFO_LATEST_SIGNAL_CATEGORY, health.latest_signal_category);
        this._adapter.upsertState(`${this.infoChannelId}.firmware`, constants_1.COMMON_INFO_FIRMWARE, health.firmware);
        if (this._ringDevice.hasLight && (Date.now() - this._lastLightCommand > 60000)) {
            // this.silly(JSON.stringify(this._ringDevice.data));
            const floodlightOn = this._ringDevice.data.health.floodlight_on;
            this.debug(`Update Light within Health Update for "${this.fullId}" FLoodlight is ${floodlightOn}`);
            this._adapter.upsertState(`${this.lightChannelId}.light_state`, constants_1.COMMON_LIGHT_STATE, floodlightOn);
            this._adapter.upsertState(`${this.lightChannelId}.${constants_1.STATE_ID_LIGHT_SWITCH}`, constants_1.COMMON_LIGHT_SWITCH, floodlightOn, true);
        }
    }
    debug(message) {
        this._adapter.log.debug(message);
    }
    silly(message) {
        this._adapter.log.silly(message);
    }
    info(message) {
        this._adapter.log.info(message);
    }
    catcher(message, reason) {
        this._adapter.logCatch(message, reason);
    }
    onDing(value) {
        this.debug(`Recieved Ding Event (${value}) for ${this.shortId}`);
        this.conditionalRecording(EventState.ReactingOnDing, value.ding.image_uuid);
        this._adapter.upsertState(`${this.eventsChannelId}.type`, constants_1.COMMON_EVENTS_TYPE, value.subtype);
        this._adapter.upsertState(`${this.eventsChannelId}.detectionType`, constants_1.COMMON_EVENTS_DETECTIONTYPE, value.ding.detection_type);
        this._adapter.upsertState(`${this.eventsChannelId}.created_at`, constants_1.COMMON_EVENTS_MOMENT, Date.now());
        this._adapter.upsertState(`${this.eventsChannelId}.message`, constants_1.COMMON_EVENTS_MESSAGE, value.aps.alert);
    }
    onMotion(value) {
        this.debug(`Recieved Motion Event (${value}) for ${this.shortId}`);
        this._adapter.upsertState(`${this.eventsChannelId}.motion`, constants_1.COMMON_MOTION, value);
        if (value) {
            this.conditionalRecording(EventState.ReactingOnMotion);
        }
    }
    onDorbell(value) {
        this.debug(`Recieved Doorbell Event (${value}) for ${this.shortId}`);
        this.conditionalRecording(EventState.ReactingOnDoorbell, value.ding.image_uuid);
        this._adapter.upsertState(`${this.eventsChannelId}.doorbell`, constants_1.COMMON_EVENTS_DOORBELL, true);
        setTimeout(() => {
            this._adapter.upsertState(`${this.eventsChannelId}.doorbell`, constants_1.COMMON_EVENTS_DOORBELL, false);
        }, 5000);
    }
    conditionalRecording(state, uuid) {
        if (this._state === EventState.Idle) {
            this.silly(`Start recording (with: ${this.shortId}) for Event "${EventState[state]}"...`);
            this._state = state;
            this.takeSnapshot(uuid);
            this.startLivestream(20).then(() => {
                this._state = EventState.Idle;
            });
        }
        else {
            this.silly(`Would have recorded due to "${EventState[state]}", but we are already reacting.`);
        }
    }
}
exports.OwnRingDevice = OwnRingDevice;
//# sourceMappingURL=ownRingDevice.js.map
