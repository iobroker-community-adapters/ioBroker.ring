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
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnRingCamera = void 0;
const rxjs_1 = require("rxjs");
const constants_1 = require("./constants");
const lastAction_1 = require("./lastAction");
const fs = __importStar(require("fs"));
const file_service_1 = require("./services/file-service");
const util = __importStar(require("util"));
const ownRingDevice_1 = require("./ownRingDevice");
var EventState;
(function (EventState) {
    EventState[EventState["Idle"] = 0] = "Idle";
    EventState[EventState["ReactingOnMotion"] = 1] = "ReactingOnMotion";
    EventState[EventState["ReactingOnDing"] = 2] = "ReactingOnDing";
    EventState[EventState["ReactingOnDoorbell"] = 3] = "ReactingOnDoorbell";
})(EventState || (EventState = {}));
class OwnRingCamera extends ownRingDevice_1.OwnRingDevice {
    get lastLiveStreamDir() {
        return this._lastLiveStreamDir;
    }
    get lastSnapShotDir() {
        return this._lastSnapShotDir;
    }
    get lastHDSnapShotDir() {
        return this._lastHDSnapShotDir;
    }
    get ringDevice() {
        return this._ringDevice;
    }
    get overlayFilter() {
        const filter = `drawtext=text=${this._ringDevice.data.description}:
                    fontsize=20:
                    fontcolor=white:
                    x=(main_w-text_w-20):
                    y=20:shadowcolor=black:
                    shadowx=2:
                    shadowy=2,
                    drawtext=text='%{localtime\\:%c}':
                    fontsize=20:
                    fontcolor=white:
                    x=20:
                    y=(main_h-text_h-20):
                    shadowcolor=black:
                    shadowx=2:
                    shadowy=2`;
        return this._adapter.config.overlay_Livestream ? ["-vf", filter] : [];
    }
    set ringDevice(device) {
        this._ringDevice = device;
        this.subscribeToEvents();
    }
    constructor(ringDevice, location, adapter, apiClient) {
        super(location, adapter, apiClient, OwnRingCamera.evaluateKind(ringDevice.deviceType, adapter, ringDevice), `${ringDevice.id}`, ringDevice.data.description);
        this._durationLiveStream = this._adapter.config.recordtime_livestream;
        this._lastLightCommand = 0;
        this._lastLiveStreamUrl = "";
        this._lastLiveStreamDir = "";
        this._lastLiveStreamTimestamp = 0;
        this._lastSnapShotUrl = "";
        this._lastSnapShotDir = "";
        this._lastSnapshotTimestamp = 0;
        this._snapshotCount = 0;
        this._lastHDSnapShotUrl = "";
        this._lastHDSnapShotDir = "";
        this._lastHDSnapshotTimestamp = 0;
        this._HDsnapshotCount = 0;
        this._liveStreamCount = 0;
        this._state = EventState.Idle;
        this._doorbellEventActive = false;
        this._ringDevice = ringDevice;
        this.debug(`Create device`);
        this.infoChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_INFO}`;
        this.historyChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_HISTORY}`;
        this.lightChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_LIGHT}`;
        this.snapshotChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_SNAPSHOT}`;
        this.HDsnapshotChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_HDSNAPSHOT}`;
        this.liveStreamChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_LIVESTREAM}`;
        this.eventsChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_EVENTS}`;
        this.recreateDeviceObjectTree();
        this.updateDeviceInfoObject(ringDevice.data);
        this.updateHealth();
        // noinspection JSIgnoredPromiseFromCall
        this.updateHistory();
        this.updateSnapshotObject();
        this.updateHDSnapshotObject();
        this.updateLiveStreamObject();
        this.ringDevice = ringDevice; // subscribes to the events
    }
    async processUserInput(channelID, stateID, state) {
        switch (channelID) {
            case "":
                if (stateID !== constants_1.STATE_ID_DEBUG_REQUEST) {
                    return;
                }
                const targetVal = state.val;
                if (targetVal) {
                    this._adapter.log.info(`Device Debug Data for ${this.shortId}: ${util.inspect(this._ringDevice, false, 1)}`);
                    this._adapter.upsertState(`${this.fullId}.${constants_1.STATE_ID_DEBUG_REQUEST}`, constants_1.COMMON_DEBUG_REQUEST, false);
                }
                return;
            case "Light":
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
                            this._adapter.upsertState(`${this.lightChannelId}.light_switch`, constants_1.COMMON_LIGHT_SWITCH, targetVal, true, true);
                            setTimeout(() => {
                                this.updateHealth.bind(this);
                            }, 65000);
                        }
                    });
                }
                else {
                    this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                }
                break;
            case "Snapshot":
                if (stateID === constants_1.STATE_ID_SNAPSHOT_REQUEST) {
                    const targetVal = state.val;
                    this._adapter.log.debug(`Get Snapshot request for ${this.shortId} to value ${targetVal}`);
                    if (targetVal) {
                        await this.takeSnapshot().catch((reason) => {
                            this.updateSnapshotRequest(true);
                            this.catcher("Couldn't retrieve Snapshot.", reason);
                        });
                    }
                    else {
                        this.updateSnapshotRequest(true);
                        this.warn(`Get Snapshot request for ${this.shortId} failed!`);
                    }
                }
                else {
                    this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                }
                break;
            case "HD Snapshot":
                if (stateID === constants_1.STATE_ID_HDSNAPSHOT_REQUEST) {
                    const targetVal = state.val;
                    this._adapter.log.debug(`Get HDSnapshot request for ${this.shortId} to value ${targetVal}`);
                    if (targetVal) {
                        await this.takeHDSnapshot().catch((reason) => {
                            this.updateHDSnapshotRequest(true);
                            this.catcher("Couldn't retrieve HDSnapshot.", reason);
                        });
                    }
                    else {
                        this.updateHDSnapshotRequest(true);
                        this.warn(`Get HDSnapshot request for ${this.shortId} failed!`);
                    }
                }
                else {
                    this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                }
                break;
            case "Livestream":
                if (stateID === constants_1.STATE_ID_LIVESTREAM_REQUEST) {
                    const targetVal = state.val;
                    this._adapter.log.debug(`Get Livestream request for ${this.shortId} to value ${targetVal}`);
                    if (targetVal) {
                        await this.startLivestream().catch((reason) => {
                            this.updateLivestreamRequest(true);
                            this.catcher("Couldn't retrieve Livestream.", reason);
                        });
                    }
                    else {
                        this.updateLivestreamRequest(true);
                        this.warn(`Get Livestream request for ${this.shortId} failed!`);
                    }
                }
                else if (stateID === constants_1.STATE_ID_LIVESTREAM_DURATION) {
                    const targetVal = isNaN(state.val) ? 20 : state.val;
                    this._adapter.log.debug(`Get Livestream duration for ${this.shortId} to value ${targetVal}`);
                    this.setDurationLivestream(targetVal);
                }
                else {
                    this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                }
                break;
            default:
                this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
        }
    }
    updateByDevice(ringDevice) {
        this.ringDevice = ringDevice;
        this._state = EventState.Idle;
        this.update(ringDevice.data);
    }
    update(data) {
        this.debug(`Recieved Update`);
        this.updateDeviceInfoObject(data);
        this.updateHealth();
        // noinspection JSIgnoredPromiseFromCall
        this.updateHistory();
        this.updateSnapshotObject();
        this.updateHDSnapshotObject();
    }
    setDurationLivestream(val) {
        this.silly(`${this.shortId}.durationLivestream()`);
        this._durationLiveStream = val;
        this._adapter.upsertState(`${this.liveStreamChannelId}.${constants_1.STATE_ID_LIVESTREAM_DURATION}`, constants_1.COMMON_LIVESTREAM_DURATION, this._durationLiveStream, true);
        this.debug(`Livestream duration set to: ${val}`);
    }
    async startLivestream(duration) {
        this.silly(`${this.shortId}.startLivestream()`);
        duration !== null && duration !== void 0 ? duration : (duration = this._durationLiveStream);
        const { visURL, visPath } = await file_service_1.FileService.getVisUrl(this._adapter, this.fullId, "Livestream.mp4");
        if (!visURL || !visPath) {
            this.warn("Vis not available");
        }
        const { fullPath, dirname } = file_service_1.FileService.getPath(this._adapter.config.path_livestream, this._adapter.config.filename_livestream, ++this._liveStreamCount, this.shortId, this.fullId, this.kind);
        if (!(await file_service_1.FileService.prepareFolder(dirname))) {
            this.warn(`Failed to prepare Livestream folder ("${fullPath}")`);
            this.updateLivestreamRequest(false);
            return;
        }
        file_service_1.FileService.deleteFileIfExistSync(fullPath, this._adapter);
        if (this._ringDevice.isOffline) {
            this.info(` is offline --> won't take LiveStream`);
            this.updateLivestreamRequest(false);
            return;
        }
        const tempPath = (await file_service_1.FileService.getTempDir(this._adapter)) + `/temp_${this.shortId}_livestream.mp4`;
        const liveCall = await this._ringDevice.streamVideo({
            video: this.overlayFilter,
            output: ["-t", duration.toString(), tempPath],
        });
        await (0, rxjs_1.firstValueFrom)(liveCall.onCallEnded);
        if (!fs.existsSync(tempPath)) {
            this.warn(`Could't create livestream`);
            this.updateLivestreamRequest(false);
            return;
        }
        const video = fs.readFileSync(tempPath);
        if (visPath) {
            this.silly(`Locally storing Filestream (Length: ${video.length})`);
            file_service_1.FileService.writeFile(visPath, video, this._adapter, () => {
                this._lastLiveStreamUrl = visURL;
            });
        }
        this.silly(`Writing Filestream (Length: ${video.length}) to "${fullPath}"`);
        await file_service_1.FileService.writeFile(fullPath, video, this._adapter, () => {
            this._lastLiveStreamDir = fullPath;
            this._lastLiveStreamTimestamp = Date.now();
            this.updateLiveStreamObject();
            // clean up
            if (this._lastLiveStreamDir !== "" && this._adapter.config.del_old_livestream) {
                file_service_1.FileService.deleteFileIfExistSync(this._lastLiveStreamDir, this._adapter);
            }
            fs.unlink(tempPath, (err) => {
                if (err) {
                    this._adapter.logCatch(`Couldn't delete temp file`, err);
                }
            });
        });
        this.debug(`Done creating livestream to ${fullPath}`);
    }
    async takeSnapshot(uuid, eventBased = false) {
        this.silly(`${this.shortId}.takeSnapshot()`);
        const { visURL, visPath } = await file_service_1.FileService.getVisUrl(this._adapter, this.fullId, "Snapshot.jpg");
        if (!visURL || !visPath) {
            this.warn("Vis not available");
        }
        const { fullPath, dirname } = file_service_1.FileService.getPath(this._adapter.config.path_snapshot, this._adapter.config.filename_snapshot, ++this._snapshotCount, this.shortId, this.fullId, this.kind);
        if (!(await file_service_1.FileService.prepareFolder(dirname))) {
            this.warn(`prepare folder problem --> won't take Snapshot`);
            this.updateSnapshotRequest(false);
            return;
        }
        file_service_1.FileService.deleteFileIfExistSync(fullPath, this._adapter);
        if (this._ringDevice.isOffline) {
            this.info(`is offline --> won't take Snapshot`);
            this.updateSnapshotRequest(false);
            return;
        }
        const image = await this._ringDevice.getNextSnapshot({ uuid: uuid }).catch((reason) => {
            if (eventBased) {
                this.warn("Taking Snapshot on Event failed. Will try again after livestream finished.");
            }
            else {
                this.catcher("Couldn't get Snapshot from api.", reason);
            }
        });
        if (!image) {
            if (!eventBased) {
                this.warn("Could not create snapshot from image");
            }
            this.updateSnapshotRequest(false);
            return;
        }
        if (this._lastSnapShotDir !== "" && this._adapter.config.del_old_snapshot) {
            file_service_1.FileService.deleteFileIfExistSync(this._lastSnapShotDir, this._adapter);
        }
        this._lastSnapShotUrl = visURL;
        this._lastSnapShotDir = fullPath;
        this._lastSnapshotTimestamp = Date.now();
        if (visPath) {
            this.silly(`Locally storing Snapshot (Length: ${image.length})`);
            await file_service_1.FileService.writeFile(visPath, image, this._adapter);
        }
        this.silly(`Writing Snapshot (Length: ${image.length}) to "${fullPath}"`);
        await file_service_1.FileService.writeFile(fullPath, image, this._adapter, () => {
            this.updateSnapshotObject();
        });
        this.debug(`Done creating snapshot to ${fullPath}`);
    }
    async takeHDSnapshot() {
        this.silly(`${this.shortId}.takeHDSnapshot()`);
        const duration = 0.1;
        const { visURL, visPath } = await file_service_1.FileService.getVisUrl(this._adapter, this.fullId, "HDSnapshot.jpg");
        if (!visURL || !visPath) {
            this.warn("Vis not available! Please install e.g. flot or other Vis related adapter");
            this.updateHDSnapshotRequest(false);
            return;
        }
        const { fullPath, dirname } = file_service_1.FileService.getPath(this._adapter.config.path_snapshot, "HD" + this._adapter.config.filename_snapshot, ++this._snapshotCount, this.shortId, this.fullId, this.kind);
        if (!(await file_service_1.FileService.prepareFolder(dirname))) {
            this.warn(`prepare folder problem --> won't take HD Snapshot`);
            this.updateHDSnapshotRequest(false);
            return;
        }
        file_service_1.FileService.deleteFileIfExistSync(fullPath, this._adapter);
        if (this._ringDevice.isOffline) {
            this.info(`is offline --> won't take HD Snapshot`);
            this.updateHDSnapshotRequest(false);
            return;
        }
        const tempPath = (await file_service_1.FileService.getTempDir(this._adapter)) + `/temp_${this.shortId}_livestream.jpg`;
        const liveCall = await this._ringDevice.streamVideo({
            video: this.overlayFilter,
            output: ["-t", duration.toString(), "-f", "mjpeg", "-q:v", 3, "-frames:v", 1, tempPath]
        });
        await (0, rxjs_1.firstValueFrom)(liveCall.onCallEnded);
        if (!fs.existsSync(tempPath)) {
            this.warn(`Could't create HD Snapshot`);
            this.updateHDSnapshotRequest(false);
            return;
        }
        else {
            this.silly(`HD Snapshot from livestream created`);
        }
        const jpg = fs.readFileSync(tempPath);
        if (visPath) {
            this.silly(`Locally storing HD Snapshot (Length: ${jpg.length})`);
            await file_service_1.FileService.writeFile(visPath, jpg, this._adapter, () => {
                this._lastHDSnapShotUrl = visURL;
            });
        }
        this.silly(`Writing HD Snapshot to ${fullPath} (Length: ${jpg.length})`);
        file_service_1.FileService.writeFile(fullPath, jpg, this._adapter, () => {
            this._lastHDSnapShotDir = fullPath;
            this._lastHDSnapshotTimestamp = Date.now();
            this.updateHDSnapshotObject();
            // clean up
            if (this._lastHDSnapShotDir !== "" && this._adapter.config.del_old_HDsnapshot) {
                file_service_1.FileService.deleteFileIfExistSync(this._lastHDSnapShotDir, this._adapter);
            }
            fs.unlink(tempPath, (err) => {
                if (err) {
                    this._adapter.logCatch(`Couldn't delete temp file ${tempPath}`, err);
                }
            });
        });
        this.debug(`Done creating HDSnapshot to ${visPath}`);
    }
    updateHealth() {
        this.silly(`Update Health`);
        this._ringDevice.getHealth().then(this.updateHealthObject.bind(this));
    }
    async updateHistory() {
        this.silly(`Update History`);
        this._ringDevice.getEvents({ limit: 50 })
            .then(async (r) => {
            this.silly(`Recieved Event History`);
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
    async recreateDeviceObjectTree() {
        this.silly(`Recreate DeviceObjectTree`);
        this._adapter.createDevice(this.fullId, {
            name: `Device ${this.shortId} ("${this._ringDevice.data.description}")`
        });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_INFO, { name: `Info ${this.shortId}` });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_SNAPSHOT);
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_HDSNAPSHOT);
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_LIVESTREAM, { name: `Livestream ${this.shortId}` });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_HISTORY);
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_EVENTS);
        if (this._ringDevice.hasLight) {
            this.debug(`Device with Light Capabilities detected`);
            this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_LIGHT, { name: `Light ${this.shortId}` });
            this._adapter.upsertState(`${this.lightChannelId}.${constants_1.STATE_ID_LIGHT_SWITCH}`, constants_1.COMMON_LIGHT_SWITCH, false, true, true);
        }
        this._lastSnapShotDir = await this._adapter.tryGetStringState(`${this.snapshotChannelId}.file`);
        this._lastHDSnapShotDir = await this._adapter.tryGetStringState(`${this.HDsnapshotChannelId}.file`);
        this._lastLiveStreamDir = await this._adapter.tryGetStringState(`${this.liveStreamChannelId}.file`);
        this._adapter.upsertState(`${this.fullId}.${constants_1.STATE_ID_DEBUG_REQUEST}`, constants_1.COMMON_DEBUG_REQUEST, false, true, true);
        this._adapter.upsertState(`${this.snapshotChannelId}.auto`, constants_1.COMMON_SNAPSHOT_AUTO, this._adapter.config.auto_snapshot, true, true);
        this._adapter.upsertState(`${this.HDsnapshotChannelId}.auto`, constants_1.COMMON_HDSNAPSHOT_AUTO, this._adapter.config.auto_HDsnapshot, true, true);
        this._adapter.upsertState(`${this.liveStreamChannelId}.auto`, constants_1.COMMON_LIVESTREAM_AUTO, this._adapter.config.auto_livestream, true, true);
    }
    async subscribeToEvents() {
        this.silly(`Start device subscriptions`);
        await this._ringDevice.subscribeToDingEvents().catch((r) => {
            this.catcher(`Failed subscribing to Ding Events for ${this._ringDevice.name}`, r);
        });
        await this._ringDevice.subscribeToMotionEvents().catch((r) => {
            this.catcher(`Failed subscribing to Motion Events for ${this._ringDevice.name}`, r);
        });
        this._ringDevice.onData.subscribe(this.update.bind(this));
        this._ringDevice.onMotionDetected.subscribe({
            next: (motion) => {
                this.onMotion(motion);
            },
            error: (err) => {
                this.catcher(`Motion Observer recieved error`, err);
            },
        });
        this._ringDevice.onDoorbellPressed.subscribe({
            next: (ding) => {
                this.onDorbell(ding);
            },
            error: (err) => {
                this.catcher(`Dorbell Observer recieved error`, err);
            },
        });
        this._ringDevice.onNewNotification.subscribe({
            next: (ding) => {
                this.onDing(ding);
            },
            error: (err) => {
                this.catcher(`Ding Observer recieved error`, err);
            },
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
    async updateSnapshotRequest(ack = true) {
        this._adapter.upsertState(`${this.snapshotChannelId}.${constants_1.STATE_ID_SNAPSHOT_REQUEST}`, constants_1.COMMON_SNAPSHOT_REQUEST, false, ack, true);
    }
    async updateHDSnapshotRequest(ack = true) {
        this._adapter.upsertState(`${this.HDsnapshotChannelId}.${constants_1.STATE_ID_HDSNAPSHOT_REQUEST}`, constants_1.COMMON_HDSNAPSHOT_REQUEST, false, ack, true);
    }
    async updateSnapshotObject() {
        this.debug(`Update Snapshot Object`);
        if (this._lastSnapshotTimestamp !== 0) {
            this._adapter.upsertState(`${this.snapshotChannelId}.file`, constants_1.COMMON_SNAPSHOT_FILE, this._lastSnapShotDir);
            this._adapter.upsertState(`${this.snapshotChannelId}.moment`, constants_1.COMMON_SNAPSHOT_MOMENT, this._lastSnapshotTimestamp);
            this._adapter.upsertState(`${this.snapshotChannelId}.url`, constants_1.COMMON_SNAPSHOT_URL, this._lastSnapShotUrl);
        }
        await this.updateSnapshotRequest();
    }
    async updateHDSnapshotObject() {
        this.debug(`Update HD Snapshot Object`);
        if (this._lastHDSnapshotTimestamp !== 0) {
            this._adapter.upsertState(`${this.HDsnapshotChannelId}.file`, constants_1.COMMON_HDSNAPSHOT_FILE, this._lastHDSnapShotDir);
            this._adapter.upsertState(`${this.HDsnapshotChannelId}.moment`, constants_1.COMMON_HDSNAPSHOT_MOMENT, this._lastHDSnapshotTimestamp);
            this._adapter.upsertState(`${this.HDsnapshotChannelId}.url`, constants_1.COMMON_HDSNAPSHOT_URL, this._lastHDSnapShotUrl);
        }
        await this.updateHDSnapshotRequest();
    }
    async updateLivestreamRequest(ack = true) {
        this._adapter.upsertState(`${this.liveStreamChannelId}.${constants_1.STATE_ID_LIVESTREAM_REQUEST}`, constants_1.COMMON_LIVESTREAM_REQUEST, false, ack, true);
        this._durationLiveStream = this._adapter.config.recordtime_livestream;
        this._adapter.upsertState(`${this.liveStreamChannelId}.${constants_1.STATE_ID_LIVESTREAM_DURATION}`, constants_1.COMMON_LIVESTREAM_DURATION, this._durationLiveStream, ack, true);
    }
    async updateLiveStreamObject() {
        this.debug(`Update Livestream Object`);
        if (this._lastLiveStreamTimestamp !== 0) {
            this._adapter.upsertState(`${this.liveStreamChannelId}.file`, constants_1.COMMON_LIVESTREAM_FILE, this._lastLiveStreamDir);
            this._adapter.upsertState(`${this.liveStreamChannelId}.url`, constants_1.COMMON_LIVESTREAM_URL, this._lastLiveStreamUrl);
            this._adapter.upsertState(`${this.liveStreamChannelId}.moment`, constants_1.COMMON_LIVESTREAM_MOMENT, this._lastLiveStreamTimestamp);
        }
        await this.updateLivestreamRequest();
    }
    updateHealthObject(health) {
        var _a;
        this.debug(`Update Health Callback`);
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
            this.debug(`Update Light within Health Update Floodlight is ${floodlightOn}`);
            this._adapter.upsertState(`${this.lightChannelId}.light_state`, constants_1.COMMON_LIGHT_STATE, floodlightOn);
        }
    }
    onDing(value) {
        var _a;
        this.debug(`Recieved Ding Event (${util.inspect(value, true, 1)})`);
        this.conditionalRecording(EventState.ReactingOnDing, value.ding.image_uuid);
        this._adapter.upsertState(`${this.eventsChannelId}.type`, constants_1.COMMON_EVENTS_TYPE, value.subtype);
        this._adapter.upsertState(`${this.eventsChannelId}.detectionType`, constants_1.COMMON_EVENTS_DETECTIONTYPE, (_a = value.ding.detection_type) !== null && _a !== void 0 ? _a : value.subtype);
        this._adapter.upsertState(`${this.eventsChannelId}.created_at`, constants_1.COMMON_EVENTS_MOMENT, Date.now());
        this._adapter.upsertState(`${this.eventsChannelId}.message`, constants_1.COMMON_EVENTS_MESSAGE, value.aps.alert);
    }
    onMotion(value) {
        this.debug(`Recieved Motion Event (${util.inspect(value, true, 1)})`);
        this._adapter.upsertState(`${this.eventsChannelId}.motion`, constants_1.COMMON_MOTION, value);
        value && this.conditionalRecording(EventState.ReactingOnMotion);
    }
    onDorbell(value) {
        if (this._doorbellEventActive) {
            this.debug(`Recieved Doorbell Event, but we are already reacting. Ignoring.`);
            return;
        }
        this.info("Doorbell pressed --> Will ignore additional presses for the next 25s.");
        this.debug(`Recieved Doorbell Event (${util.inspect(value, true, 1)})`);
        this._doorbellEventActive = true;
        this._adapter.upsertState(`${this.eventsChannelId}.doorbell`, constants_1.COMMON_EVENTS_DOORBELL, true);
        setTimeout(() => {
            this._adapter.upsertState(`${this.eventsChannelId}.doorbell`, constants_1.COMMON_EVENTS_DOORBELL, false);
        }, 5000);
        setTimeout(() => {
            this._doorbellEventActive = false;
        }, 25000);
        this.conditionalRecording(EventState.ReactingOnDoorbell, value.ding.image_uuid);
    }
    async conditionalRecording(state, uuid) {
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
            return;
        }
        this.silly(`Start recording for Event "${EventState[state]}"...`);
        this._state = state;
        try {
            this._adapter.config.auto_HDsnapshot && await this.takeHDSnapshot();
            this._adapter.config.auto_snapshot && !this._ringDevice.hasBattery && await this.takeSnapshot(uuid, true);
            this._adapter.config.auto_livestream && await this.startLivestream(this._adapter.config.recordtime_auto_livestream);
        }
        finally {
            this._state = EventState.Idle;
        }
        return;
    }
}
exports.OwnRingCamera = OwnRingCamera;
//# sourceMappingURL=ownRingCamera.js.map