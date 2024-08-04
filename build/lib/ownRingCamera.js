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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnRingCamera = void 0;
const rxjs = __importStar(require("rxjs"));
const fs = __importStar(require("fs"));
const util = __importStar(require("util"));
const sharp_1 = __importDefault(require("sharp"));
const strftime_1 = __importDefault(require("strftime"));
const node_schedule_1 = __importDefault(require("node-schedule"));
const constants_1 = require("./constants");
const lastAction_1 = require("./lastAction");
const file_service_1 = require("./services/file-service");
const ownRingDevice_1 = require("./ownRingDevice");
const event_blocker_1 = require("./services/event-blocker");
const image_service_1 = require("./services/image-service");
const text_service_1 = require("./services/text-service");
var EventState;
(function (EventState) {
    EventState[EventState["Idle"] = 0] = "Idle";
    EventState[EventState["ReactingOnEvent"] = 1] = "ReactingOnEvent";
    EventState[EventState["ReactingOnMotion"] = 2] = "ReactingOnMotion";
    EventState[EventState["ReactingOnDoorbell"] = 3] = "ReactingOnDoorbell";
})(EventState || (EventState = {}));
class OwnRingCamera extends ownRingDevice_1.OwnRingDevice {
    constructor(ringDevice, location, adapter, apiClient) {
        super(location, adapter, apiClient, OwnRingCamera.evaluateKind(ringDevice.deviceType, adapter, ringDevice), `${ringDevice.id}`, ringDevice.data.description);
        this._lastLightCommand = 0;
        this._lastLiveStreamUrl = "";
        this._lastLiveStreamTimestamp = 0;
        this._lastSnapShotUrl = "";
        this._lastSnapshotTimestamp = 0;
        this._snapshotCount = 0;
        this._lastHDSnapShotUrl = "";
        this._lastHDSnapshotTimestamp = 0;
        this._HDsnapshotCount = 0;
        this._liveStreamCount = 0;
        this._lastLiveStreamDir = "";
        this._lastSnapShotDir = "";
        this._lastHDSnapShotDir = "";
        this._state = EventState.Idle;
        this._motionEventBlocker = new event_blocker_1.EventBlocker(this._adapter.config.ignore_events_Motion, this._adapter.config.keep_ignoring_if_retriggered);
        this._notifyEventBlocker = new event_blocker_1.EventBlocker(this._adapter.config.ignore_events_Motion, this._adapter.config.keep_ignoring_if_retriggered);
        this._doorbellEventBlocker = new event_blocker_1.EventBlocker(this._adapter.config.ignore_events_Doorbell, this._adapter.config.keep_ignoring_if_retriggered);
        this._durationLiveStream = this._adapter.config.recordtime_livestream;
        this._ringDevice = ringDevice;
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
        this.updateHistory();
        this.autoSched();
        this.subscribeToEvents();
    }
    async startLivestream(duration) {
        this.silly(`${this.shortId}.startLivestream()`);
        duration !== null && duration !== void 0 ? duration : (duration = this._durationLiveStream);
        const { visURL, visPath, fullPath } = await this.prepareLivestreamTargetFile().catch((reason) => {
            this.catcher("Couldn't prepare Livestream Target File.", reason);
            return { visURL: "", visPath: "", fullPath: "" };
        });
        if (!visURL || !visPath || !fullPath) {
            await this.updateLivestreamRequest(false);
            return;
        }
        if (this._ringDevice.isOffline) {
            this.info("Is offline --> won't take LiveStream");
            await this.updateLivestreamRequest(false);
            return;
        }
        const tempPath = (await file_service_1.FileService.getTempDir(this._adapter)) + `/temp_${this.shortId}_livestream.mp4`;
        const liveCall = await this._ringDevice.streamVideo({
            video: image_service_1.ImageService.videoFilter(this._adapter.config.overlay_Livestream, this._adapter.dateFormat, this._adapter.language, this._ringDevice.data.description),
            output: ["-t", duration.toString(), tempPath],
        }).catch((reason) => {
            this.catcher("Couldn't create Livestream (stream video).", reason);
            return null;
        });
        if (!liveCall) {
            this.warn("Couldn't create Livestream (empty result).");
            await this.updateLivestreamRequest(false);
            return;
        }
        const liveCallSucceeded = await rxjs.firstValueFrom(liveCall.onCallEnded).then((_result) => {
            return true;
        }).catch((reason) => {
            this.catcher("Couldn't create Livestream (first value).", reason);
            return null;
        });
        if (!fs.existsSync(tempPath) || !liveCallSucceeded) {
            this.warn(`Couldn't create Livestream (temp path: ${tempPath}, live call: ${liveCallSucceeded}).`);
            await this.updateLivestreamRequest(false);
            return;
        }
        const video = fs.readFileSync(tempPath);
        // clean up
        fs.unlink(tempPath, (err) => {
            if (err) {
                this.catcher("Couldn't delete temp file.", err);
            }
        });
        if (this._lastLiveStreamDir !== "" && this._adapter.config.del_old_livestream) {
            file_service_1.FileService.deleteFileIfExistSync(this._lastLiveStreamDir, this._adapter);
        }
        if (visPath) {
            this.silly(`Locally storing Filestream (Length: ${video.length})`);
            await file_service_1.FileService.writeFile(visPath, video, this._adapter);
            this._lastLiveStreamUrl = visURL;
        }
        this.silly(`Writing Filestream (Length: ${video.length}) to "${fullPath}"`);
        await file_service_1.FileService.writeFile(fullPath, video, this._adapter);
        this._lastLiveStreamDir = fullPath;
        this._lastLiveStreamTimestamp = Date.now();
        await this.updateLiveStreamObject();
        this.debug(`Done creating livestream to ${fullPath}`);
    }
    async takeHDSnapshot() {
        var _a;
        this.silly(`${this.shortId}.takeHDSnapshot()`);
        // const duration = 2.0;
        const { visURL, visPath } = await file_service_1.FileService.getVisUrl(this._adapter, this.fullId, "HDSnapshot.jpg").catch((reason) => {
            this.catcher("Couldn't get Vis URL.", reason);
            return { visURL: "", visPath: "" };
        });
        if (!visURL || !visPath) {
            this.warn("Vis not available! Please install e.g. flot or other Vis related adapter");
            await this.updateHDSnapshotRequest(false);
            return;
        }
        const { fullPath, dirname } = file_service_1.FileService.getPath(this._adapter.config.path_snapshot, `HD${this._adapter.config.filename_snapshot}`, ++this._snapshotCount, this.shortId, this.fullId, this.kind);
        if (!(await file_service_1.FileService.prepareFolder(dirname))) {
            this.warn("Prepare folder problem --> won't take HD Snapshot");
            await this.updateHDSnapshotRequest(false);
            return;
        }
        file_service_1.FileService.deleteFileIfExistSync(fullPath, this._adapter);
        if (this._ringDevice.isOffline) {
            this.info("Is offline --> won't take HD Snapshot");
            await this.updateHDSnapshotRequest(false);
            return;
        }
        const { night_contrast, night_sharpen } = this.getActiveNightImageOptions();
        const tempPath = (await file_service_1.FileService.getTempDir(this._adapter)) + `/temp_${this.shortId}_livestream.jpg`;
        const liveCall = await this._ringDevice.streamVideo({
            video: image_service_1.ImageService.videoFilter(this._adapter.config.overlay_HDsnapshot, this._adapter.dateFormat, this._adapter.language, this._ringDevice.data.description, night_contrast ? this._adapter.config.contrast_HDsnapshot : 0),
            // output: ["-t", duration.toString(), "-f", "mjpeg", "-q:v", 3, "-frames:v", 1, tempPath]
            output: ["-f", "mjpeg", "-q:v", 3, "-frames:v", 1, tempPath]
        }).catch((reason) => {
            this.catcher("Couldn't create HD Snapshot (stream Video).", reason);
            return null;
        });
        if (!liveCall) {
            this.warn("Couldn't create HD Snapshot (empty result).");
            await this.updateHDSnapshotRequest(false);
            return;
        }
        const liveCallSucceeded = await rxjs.firstValueFrom(liveCall.onCallEnded).then((_result) => {
            return true;
        }).catch((reason) => {
            this.catcher("Couldn't create HD Snapshot (first value).", reason);
            return null;
        });
        if (!fs.existsSync(tempPath) || !liveCallSucceeded) {
            this.warn(`Couldn't create HD Snapshot (temp path: ${tempPath}, live call: ${liveCallSucceeded}).`);
            await this.updateHDSnapshotRequest(false);
            return;
        }
        else {
            this.silly("HD Snapshot from livestream created.");
        }
        let jpg = fs.readFileSync(tempPath);
        if (night_sharpen && this._adapter.config.sharpen_HDsnapshot && this._adapter.config.sharpen_HDsnapshot > 0) {
            const sharpen = this._adapter.config.sharpen_HDsnapshot == 1
                ? undefined
                : { sigma: this._adapter.config.sharpen_HDsnapshot - 1 };
            jpg = (_a = await (0, sharp_1.default)(jpg)
                .sharpen(sharpen)
                .toBuffer()
                .catch((reason) => {
                this.catcher("Couldn't sharpen HD Snapshot.", reason);
                return null;
            })) !== null && _a !== void 0 ? _a : jpg;
        }
        // clean up
        fs.unlink(tempPath, (err) => {
            if (err) {
                this.catcher(`Couldn't delete temp file ${tempPath}`, err);
            }
        });
        if (this._lastHDSnapShotDir !== "" && this._adapter.config.del_old_HDsnapshot) {
            file_service_1.FileService.deleteFileIfExistSync(this._lastHDSnapShotDir, this._adapter);
        }
        if (visPath) {
            this.silly(`Locally storing HD Snapshot (Length: ${jpg.length})`);
            await file_service_1.FileService.writeFile(visPath, jpg, this._adapter);
            this._lastHDSnapShotUrl = visURL;
        }
        this.silly(`Writing HD Snapshot to ${fullPath} (Length: ${jpg.length})`);
        await file_service_1.FileService.writeFile(fullPath, jpg, this._adapter);
        this._lastHDSnapShotDir = fullPath;
        this._lastHDSnapshotTimestamp = Date.now();
        await this.updateHDSnapshotObject();
        this.debug(`Done creating HDSnapshot to ${visPath}`);
    }
    async takeSnapshot(uuid, eventBased = false) {
        this.silly(`${this.shortId}.takeSnapshot()`);
        const { visURL, visPath } = await file_service_1.FileService.getVisUrl(this._adapter, this.fullId, "Snapshot.jpg");
        if (!visURL || !visPath) {
            this.warn("Vis not available");
        }
        const { fullPath, dirname } = file_service_1.FileService.getPath(this._adapter.config.path_snapshot, this._adapter.config.filename_snapshot, ++this._HDsnapshotCount, this.shortId, this.fullId, this.kind);
        if (!(await file_service_1.FileService.prepareFolder(dirname))) {
            this.warn(`prepare folder problem --> won't take Snapshot`);
            await this.updateSnapshotRequest(false);
            return;
        }
        file_service_1.FileService.deleteFileIfExistSync(fullPath, this._adapter);
        if (this._ringDevice.isOffline) {
            this.info(`is offline --> won't take Snapshot`);
            await this.updateSnapshotRequest(false);
            return;
        }
        const image = await this._ringDevice.getNextSnapshot({ force: true, uuid: uuid })
            .then((result) => result)
            .catch((err) => {
            if (eventBased) {
                this.warn("Taking Snapshot on Event failed.");
            }
            else {
                this.catcher("Couldn't get Snapshot from api.", err);
            }
            this.updateSnapshotRequest(false);
            return err;
        });
        if (!image.byteLength) {
            if (eventBased) {
                this.warn("Taking Snapshot on Event failed (no image).");
            }
            else {
                this.warn("Couldn't create snapshot from image");
            }
            await this.updateSnapshotRequest(false);
            return;
        }
        else {
            this.silly(`Response timestamp: ${image.responseTimestamp}, 
                  Byte Length: ${image.byteLength},
                  Byte Offset: ${image.byteOffset},
                  Length: ${image.length},
                  Time in ms: ${image.timeMillis}`);
        }
        let image_txt = image;
        if (this._adapter.config.overlay_snapshot) {
            image_txt =
                await image_service_1.ImageService.addTextToJpgBuffer(image, this._ringDevice.data.description, (0, strftime_1.default)(`${text_service_1.TextService.getTodayName(this._adapter.language)}, ${text_service_1.TextService.getDateFormat(this._adapter.dateFormat)} %T`))
                    .catch((reason) => {
                    this.catcher("Couldn't add text to Snapshot.", reason);
                    return reason;
                });
        }
        if (this._lastSnapShotDir !== "" && this._adapter.config.del_old_snapshot) {
            file_service_1.FileService.deleteFileIfExistSync(this._lastSnapShotDir, this._adapter);
        }
        this._lastSnapShotUrl = visURL;
        this._lastSnapShotDir = fullPath;
        this._lastSnapshotTimestamp = image.timeMillis;
        if (visPath) {
            this.silly(`Locally storing Snapshot (Length: ${image.length})`);
            await file_service_1.FileService.writeFile(visPath, image_txt, this._adapter);
        }
        this.silly(`Writing Snapshot (Length: ${image.length}) to "${fullPath}"`);
        await file_service_1.FileService.writeFile(fullPath, image_txt, this._adapter);
        await this.updateSnapshotObject();
        this.debug(`Done creating snapshot to ${fullPath}`);
    }
    async updateHistory() {
        this.silly(`Update History`);
        this._ringDevice.getEvents({ limit: 50 })
            .then(async (r) => {
            this.silly(`Received Event History`);
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
    async processUserInput(channelID, stateID, state) {
        switch (channelID) {
            case "":
                if (stateID !== constants_1.STATE_ID_DEBUG_REQUEST) {
                    return;
                }
                const targetVal = state.val;
                if (targetVal) {
                    this.info(`Device Debug Data for ${this.shortId}: ${util.inspect(this._ringDevice, false, 1)}`);
                    this._adapter.upsertState(`${this.fullId}.${constants_1.STATE_ID_DEBUG_REQUEST}`, constants_1.COMMON_DEBUG_REQUEST, false);
                }
                return;
            case "Light":
                if (!this._ringDevice.hasLight) {
                    return;
                }
                if (stateID === constants_1.STATE_ID_LIGHT_SWITCH) {
                    const targetVal = state.val;
                    this.debug(`Set light for ${this.shortId} to value ${targetVal}`);
                    this._lastLightCommand = Date.now();
                    this._ringDevice.setLight(targetVal).then((success) => {
                        if (success) {
                            this._adapter.upsertState(`${this.lightChannelId}.light_state`, constants_1.COMMON_LIGHT_STATE, targetVal);
                            this._adapter.upsertState(`${this.lightChannelId}.light_switch`, constants_1.COMMON_LIGHT_SWITCH, targetVal, true);
                            setTimeout(() => this.updateHealth.bind(this), 65000);
                        }
                    });
                }
                else {
                    this.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                }
                break;
            case "Snapshot":
                if (stateID === constants_1.STATE_ID_SNAPSHOT_REQUEST) {
                    const targetVal = state.val;
                    this.debug(`Get Snapshot request for ${this.shortId} to value ${targetVal}`);
                    if (targetVal) {
                        await this.takeSnapshot().catch((reason) => {
                            this.updateSnapshotRequest(false);
                            this.catcher("Couldn't retrieve Snapshot.", reason);
                        });
                    }
                }
                else {
                    this.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                }
                break;
            case "HD Snapshot":
                if (stateID === constants_1.STATE_ID_HDSNAPSHOT_REQUEST) {
                    const targetVal = state.val;
                    this.debug(`Get HDSnapshot request for ${this.shortId} to value ${targetVal}`);
                    if (targetVal) {
                        await this.takeHDSnapshot().catch((reason) => {
                            this.updateHDSnapshotRequest(false);
                            this.catcher("Couldn't retrieve HDSnapshot.", reason);
                        });
                    }
                }
                else {
                    this.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                }
                break;
            case "Livestream":
                if (stateID === constants_1.STATE_ID_LIVESTREAM_REQUEST) {
                    const targetVal = state.val;
                    this.debug(`Get Livestream request for ${this.shortId} to value ${targetVal}`);
                    if (targetVal) {
                        await this.startLivestream().catch((reason) => {
                            this.updateLivestreamRequest(false);
                            this.catcher("Couldn't retrieve Livestream.", reason);
                        });
                    }
                }
                else if (stateID === constants_1.STATE_ID_LIVESTREAM_DURATION) {
                    const targetVal = isNaN(state.val) ? 20 : state.val;
                    this.debug(`Get Livestream duration for ${this.shortId} to value ${targetVal}`);
                    this.setDurationLivestream(targetVal);
                }
                else {
                    this.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                }
                break;
            default:
                this.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
        }
    }
    async recreateDeviceObjectTree() {
        this.silly(`Recreate DeviceObjectTree`);
        this._adapter.createDevice(this.fullId, { name: `Device ${this.shortId} ("${this._ringDevice.data.description}")` });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_INFO, { name: `Info ${this.shortId}` });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_SNAPSHOT, { name: `Snapshot ${this.shortId}` });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_HDSNAPSHOT, { name: `HD Snapshot ${this.shortId}` });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_LIVESTREAM, { name: `Livestream ${this.shortId}` });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_HISTORY);
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_EVENTS);
        if (this._ringDevice.hasLight) {
            this.debug(`Device with Light Capabilities detected`);
            this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_LIGHT, { name: `Light ${this.shortId}` });
            await this._adapter.upsertState(`${this.lightChannelId}.${constants_1.STATE_ID_LIGHT_SWITCH}`, constants_1.COMMON_LIGHT_SWITCH, false, true, true);
        }
        this._lastSnapShotDir = await this._adapter.tryGetStringState(`${this.snapshotChannelId}.file`);
        this._lastHDSnapShotDir = await this._adapter.tryGetStringState(`${this.HDsnapshotChannelId}.file`);
        this._lastLiveStreamDir = await this._adapter.tryGetStringState(`${this.liveStreamChannelId}.file`);
        if (this._adapter.config.auto_snapshot === undefined)
            this._adapter.config.auto_snapshot = false;
        if (this._adapter.config.auto_HDsnapshot === undefined)
            this._adapter.config.auto_HDsnapshot = false;
        if (this._adapter.config.auto_livestream === undefined)
            this._adapter.config.auto_livestream = false;
        await this._adapter.upsertState(`${this.fullId}.${constants_1.STATE_ID_DEBUG_REQUEST}`, constants_1.COMMON_DEBUG_REQUEST, false, true, true);
        await this._adapter.upsertState(`${this.snapshotChannelId}.${constants_1.STATE_ID_SNAPSHOT_REQUEST}`, constants_1.COMMON_SNAPSHOT_REQUEST, false, true, true);
        await this._adapter.upsertState(`${this.HDsnapshotChannelId}.${constants_1.STATE_ID_HDSNAPSHOT_REQUEST}`, constants_1.COMMON_HDSNAPSHOT_REQUEST, false, true, true);
        await this._adapter.upsertState(`${this.liveStreamChannelId}.${constants_1.STATE_ID_LIVESTREAM_REQUEST}`, constants_1.COMMON_LIVESTREAM_REQUEST, false, true, true);
        this._adapter.upsertState(`${this.liveStreamChannelId}.${constants_1.STATE_ID_LIVESTREAM_DURATION}`, constants_1.COMMON_LIVESTREAM_DURATION, this._durationLiveStream, true);
        this._adapter.upsertState(`${this.eventsChannelId}.ondemand`, constants_1.COMMON_ON_DEMAND, false);
        this._adapter.upsertState(`${this.snapshotChannelId}.auto`, constants_1.COMMON_SNAPSHOT_AUTO, this._adapter.config.auto_snapshot);
        this._adapter.upsertState(`${this.HDsnapshotChannelId}.auto`, constants_1.COMMON_HDSNAPSHOT_AUTO, this._adapter.config.auto_HDsnapshot);
        this._adapter.upsertState(`${this.liveStreamChannelId}.auto`, constants_1.COMMON_LIVESTREAM_AUTO, this._adapter.config.auto_livestream);
        // Remove legacy states
        this._adapter.delObject(`${this.snapshotChannelId}.snapshot_file`);
        this._adapter.delObject(`${this.snapshotChannelId}.snapshot_url`);
        this._adapter.delObject(`${this.HDsnapshotChannelId}.snapshot_file`);
        this._adapter.delObject(`${this.HDsnapshotChannelId}.snapshot_url`);
        this._adapter.delObject(`${this.liveStreamChannelId}.livestream_file`);
        this._adapter.delObject(`${this.liveStreamChannelId}.livestream_url`);
    }
    async prepareLivestreamTargetFile() {
        const { visURL, visPath } = await file_service_1.FileService.getVisUrl(this._adapter, this.fullId, "Livestream.mp4").catch((reason) => {
            this.catcher("Couldn't get Vis URL.", reason);
            return { visURL: "", visPath: "" };
        });
        return new Promise(async (resolve, reject) => {
            if (!visURL || !visPath) {
                reject("Vis not available");
            }
            const { fullPath, dirname } = file_service_1.FileService.getPath(this._adapter.config.path_livestream, this._adapter.config.filename_livestream, ++this._liveStreamCount, this.shortId, this.fullId, this.kind);
            const folderPrepared = await file_service_1.FileService.prepareFolder(dirname).catch((reason) => {
                this.catcher("Couldn't prepare folder.", reason);
                return false;
            });
            if (!folderPrepared) {
                this.warn(`Failed to prepare Livestream folder ("${fullPath}")`);
                reject("Failed to prepare Livestream folder");
                return;
            }
            file_service_1.FileService.deleteFileIfExistSync(fullPath, this._adapter);
            resolve({ visURL: visURL, visPath: visPath, fullPath: fullPath });
        });
    }
    getActiveNightImageOptions() {
        let night_contrast = false;
        let night_sharpen = false;
        if (this._adapter.Sunrise > 0 && this._adapter.Sunset > 0) {
            const today = Date.now();
            this.silly(`Now: ${today}, sunrise: ${this._adapter.Sunrise}, sunset: ${this._adapter.Sunset}`);
            const isNight = today < this._adapter.Sunrise || today > this._adapter.Sunset;
            this.debug(`is Night: ${isNight}`);
            night_contrast = this._adapter.config.night_contrast_HDsnapshot && isNight || !this._adapter.config.night_contrast_HDsnapshot;
            night_sharpen = this._adapter.config.night_sharpen_HDsnapshot && isNight || !this._adapter.config.night_sharpen_HDsnapshot;
        }
        return { night_contrast, night_sharpen };
    }
    updateByDevice(ringDevice) {
        this._ringDevice = ringDevice;
        this.subscribeToEvents();
        this._state = EventState.Idle;
        this.update(ringDevice.data);
    }
    update(data) {
        this.debug(`Received Update`);
        this.updateDeviceInfoObject(data);
        this.updateHealth();
        this.updateHistory();
    }
    setDurationLivestream(val) {
        this.silly(`${this.shortId}.durationLivestream()`);
        this._durationLiveStream = val;
        this._adapter.upsertState(`${this.liveStreamChannelId}.${constants_1.STATE_ID_LIVESTREAM_DURATION}`, constants_1.COMMON_LIVESTREAM_DURATION, this._durationLiveStream);
        this.debug(`Livestream duration set to: ${val}`);
    }
    updateHealth() {
        this.silly(`Update Health`);
        this._ringDevice.getHealth().then(this.updateHealthObject.bind(this));
    }
    autoSched() {
        const media = [
            {
                name: "Snaspshot",
                val: this._adapter.config.save_snapshot,
                fct: () => {
                    this.takeSnapshot();
                },
                start: 0
            },
            {
                name: "HD Snapshot",
                val: this._adapter.config.save_HDsnapshot,
                fct: () => {
                    this.takeHDSnapshot();
                },
                start: 20
            },
            {
                name: "Livestream",
                val: this._adapter.config.save_livestream,
                fct: () => {
                    this.startLivestream(this._adapter.config.recordtime_auto_livestream);
                },
                start: 40
            }
        ];
        for (const m of media) {
            if (m.val > 0) {
                let schedSec = m.start.toString();
                let schedMin = "*";
                let schedHour = "*";
                let schedDay = "*";
                if (m.val < 60) {
                    schedSec = `*/${m.val.toString()}`;
                }
                else if (m.val < 3600) {
                    schedMin = `*/${(m.val / 60).toString()}`;
                }
                else if (m.val < 43.200) {
                    schedHour = `*/${(m.val / 3600).toString()}`;
                }
                else {
                    schedDay = `*/${(m.val / 43200).toString()}`;
                }
                const t = `${schedSec} ${schedMin} ${schedHour} ${schedDay} * *`;
                this.info(`Create scheduled Job for ${m.name} at "${t}"`);
                node_schedule_1.default.scheduleJob(`Auto save ${m.name}_${this._adapter.name}_${this._adapter.instance}`, t, async () => {
                    const recAct = await this._adapter.getStateAsync(`${this.eventsChannelId}.ondemand`);
                    if (!recAct || !recAct.val) {
                        this.info(`Cronjob Auto save ${m.name} starts`);
                        this._adapter.upsertState(`${this.eventsChannelId}.ondemand`, constants_1.COMMON_ON_DEMAND, true);
                        m.fct(this._adapter.config.recordtime_auto_livestream);
                    }
                    else {
                        this.warn(`Cronjob ${m.name} not executed because another job is already running. Please adapt timer and/or duration time!`);
                    }
                });
            }
        }
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
                this.catcher(`Motion Observer received error`, err);
            },
        });
        this._ringDevice.onDoorbellPressed.subscribe({
            next: (ding) => {
                this.onDoorbell(ding);
            },
            error: (err) => {
                this.catcher(`Doorbell Observer received error`, err);
            },
        });
        this._ringDevice.onNewNotification.subscribe({
            next: (ding) => {
                this.onNotify(ding);
            },
            error: (err) => {
                this.catcher(`Notify Observer received error`, err);
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
        this._adapter.upsertState(`${this.eventsChannelId}.ondemand`, constants_1.COMMON_ON_DEMAND, false);
        // subscribe to true, because user request doesn't change value via upsertState
        this._adapter.upsertState(`${this.snapshotChannelId}.${constants_1.STATE_ID_SNAPSHOT_REQUEST}`, constants_1.COMMON_SNAPSHOT_REQUEST, false, ack, true);
    }
    async updateHDSnapshotRequest(ack = true) {
        this._adapter.upsertState(`${this.eventsChannelId}.ondemand`, constants_1.COMMON_ON_DEMAND, false);
        // subscribe to true, because user request doesn't change value via upsertState
        this._adapter.upsertState(`${this.HDsnapshotChannelId}.${constants_1.STATE_ID_HDSNAPSHOT_REQUEST}`, constants_1.COMMON_HDSNAPSHOT_REQUEST, false, ack, true);
    }
    async updateLivestreamRequest(ack = true) {
        this._adapter.upsertState(`${this.eventsChannelId}.ondemand`, constants_1.COMMON_ON_DEMAND, false);
        // subscribe to true, because user request doesn't change value via upsertState
        this._adapter.upsertState(`${this.liveStreamChannelId}.${constants_1.STATE_ID_LIVESTREAM_REQUEST}`, constants_1.COMMON_LIVESTREAM_REQUEST, false, ack, true);
        this._durationLiveStream = this._adapter.config.recordtime_livestream;
        this._adapter.upsertState(`${this.liveStreamChannelId}.${constants_1.STATE_ID_LIVESTREAM_DURATION}`, constants_1.COMMON_LIVESTREAM_DURATION, this._durationLiveStream, ack);
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
        this.debug("Update Health Callback");
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
    onNotify(value) {
        var _a;
        this.debug(`Received Notify Event (${util.inspect(value, true, 1)})`);
        if (value) {
            if (this._notifyEventBlocker.checkBlock()) {
                this.debug(`ignore Notify event...`);
                return;
            }
            this.notifyRecording(EventState.ReactingOnEvent, value.ding.image_uuid, value.ding.detection_type == "null" ? false : true);
            this._adapter.upsertState(`${this.eventsChannelId}.type`, constants_1.COMMON_EVENTS_TYPE, text_service_1.TextService.getdetectionType(value.subtype, this._adapter.language));
            this._adapter.upsertState(`${this.eventsChannelId}.detectionType`, constants_1.COMMON_EVENTS_DETECTIONTYPE, text_service_1.TextService.getdetectionType((_a = value.ding.detection_type) !== null && _a !== void 0 ? _a : value.subtype, this._adapter.language));
            this._adapter.upsertState(`${this.eventsChannelId}.created_at`, constants_1.COMMON_EVENTS_MOMENT, Date.now());
            this._adapter.upsertState(`${this.eventsChannelId}.message`, constants_1.COMMON_EVENTS_MESSAGE, value.aps.alert);
        }
    }
    onMotion(value) {
        // value = true -> motion
        this.debug(`Received Motion Event (${util.inspect(value, true, 1)})`);
        if (value) {
            if (this._motionEventBlocker.checkBlock()) {
                this.debug(`ignore Motion event...`);
                return;
            }
            this._adapter.upsertState(`${this.eventsChannelId}.motion`, constants_1.COMMON_MOTION, value);
        }
    }
    onDoorbell(value) {
        this.debug(`Received Doorbell Event (${util.inspect(value, true, 1)})`);
        if (value) {
            if (this._doorbellEventBlocker.checkBlock()) {
                this.debug(`ignore Doorbell event...`);
                return;
            }
            this._adapter.upsertState(`${this.eventsChannelId}.doorbell`, constants_1.COMMON_EVENTS_DOORBELL, true);
            setTimeout(() => {
                this._adapter.upsertState(`${this.eventsChannelId}.doorbell`, constants_1.COMMON_EVENTS_DOORBELL, false);
            }, 1000);
        }
    }
    async notifyRecording(state, uuid, subscr) {
        let del_cnt = 1;
        while (this._state !== EventState.Idle) {
            this.debug(`delayed notify recording for ${del_cnt}s`);
            del_cnt++;
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        this.silly(`Start recording for Event "${EventState[state]}"...`);
        this._state = state;
        try {
            this._adapter.config.auto_snapshot && !(this._ringDevice.hasBattery && subscr) && await this.takeSnapshot(uuid, true);
            this._adapter.config.auto_HDsnapshot && await this.takeHDSnapshot();
            this._adapter.config.auto_livestream && await this.startLivestream(this._adapter.config.recordtime_auto_livestream);
            // give some time to evaluate motion state, e.g. for node-red
            setTimeout(() => {
                this._adapter.upsertState(`${this.eventsChannelId}.motion`, constants_1.COMMON_MOTION, false);
            }, 200);
            this.debug("Recording of event finished.");
        }
        finally {
            this._state = EventState.Idle;
        }
        return;
    }
}
exports.OwnRingCamera = OwnRingCamera;
//# sourceMappingURL=ownRingCamera.js.map