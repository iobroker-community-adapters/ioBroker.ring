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
    set ringDevice(device) {
        this._ringDevice = device;
        this.subscribeToEvents();
    }
    constructor(ringDevice, location, adapter, apiClient) {
        super(location, adapter, apiClient, OwnRingCamera.evaluateKind(ringDevice.deviceType, adapter, ringDevice), `${ringDevice.id}`, ringDevice.data.description);
        this._durationLiveStream = this._adapter.config.recordtime_livestream;
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
        this._state = EventState.Idle;
        this._lastLiveStreamDir = "";
        this._lastSnapShotDir = "";
        this._lastHDSnapShotDir = "";
        this._eventBlocker = {
            "motion": new event_blocker_1.EventBlocker(this._adapter.config.ignore_events_Motion, this._adapter.config.keep_ignoring_if_retriggered),
            "doorbell": new event_blocker_1.EventBlocker(this._adapter.config.ignore_events_Doorbell, this._adapter.config.keep_ignoring_if_retriggered)
        };
        this._ringDevice = ringDevice;
        this.ringDevice = ringDevice; // subscribe to events
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
        this.updateSnapshotObject();
        this.updateHDSnapshotObject();
        this.updateLiveStreamObject();
        this.autoSched();
        // this.subscribeToEvents();
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
            this.info(` is offline --> won't take LiveStream`);
            await this.updateLivestreamRequest(false);
            return;
        }
        const tempPath = (await file_service_1.FileService.getTempDir(this._adapter)) + `/temp_${this.shortId}_livestream.mp4`;
        const liveCall = await this._ringDevice.streamVideo({
            video: image_service_1.ImageService.videoFilter(this._adapter.config.overlay_Livestream, this._adapter.dateFormat, this._adapter.language, this._ringDevice.data.description),
            output: ["-t", duration.toString(), tempPath],
        }).catch((reason) => {
            this.catcher("Couldn't create Livestream.", reason);
            return null;
        });
        if (!liveCall) {
            this.warn(`Couldn't create Livestream`);
            await this.updateLivestreamRequest(false);
            return;
        }
        const liveCallSucceeded = await rxjs.firstValueFrom(liveCall.onCallEnded).then((_result) => {
            return true;
        }).catch((reason) => {
            this.catcher("Couldn't create HD Snapshot.", reason);
            return null;
        });
        if (!fs.existsSync(tempPath) || !liveCallSucceeded) {
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
            this.warn(`prepare folder problem --> won't take HD Snapshot`);
            await this.updateHDSnapshotRequest(false);
            return;
        }
        file_service_1.FileService.deleteFileIfExistSync(fullPath, this._adapter);
        if (this._ringDevice.isOffline) {
            this.info(`is offline --> won't take HD Snapshot`);
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
            this.catcher("Couldn't create HD Snapshot.", reason);
            return null;
        });
        if (!liveCall) {
            this.warn(`Couldn't create HD Snapshot`);
            await this.updateHDSnapshotRequest(false);
            return;
        }
        const liveCallSucceeded = await rxjs.firstValueFrom(liveCall.onCallEnded).then((_result) => {
            return true;
        }).catch((reason) => {
            this.catcher("Couldn't create HD Snapshot.", reason);
            return null;
        });
        if (!fs.existsSync(tempPath) || !liveCallSucceeded) {
            this.warn(`Couldn't create HD Snapshot`);
            await this.updateHDSnapshotRequest(false);
            return;
        }
        else {
            this.silly(`HD Snapshot from livestream created`);
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
                this._adapter.logCatch(`Couldn't delete temp file ${tempPath}`, err);
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
                this.warn("Taking Snapshot on Event failed. Will try again after livestream finished.");
            }
            else {
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
                            setTimeout(() => this.updateHealth.bind(this), 65000);
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
                            this.updateSnapshotRequest();
                            this.catcher("Couldn't retrieve Snapshot.", reason);
                        });
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
                            this.updateHDSnapshotRequest();
                            this.catcher("Couldn't retrieve HDSnapshot.", reason);
                        });
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
                            this.updateLivestreamRequest();
                            this.catcher("Couldn't retrieve Livestream.", reason);
                        });
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
    async recreateDeviceObjectTree() {
        this.silly(`Recreate DeviceObjectTree`);
        this._adapter.createDevice(this.fullId, {
            name: `Device ${this.shortId} ("${this._ringDevice.data.description}")`,
        });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_INFO, { name: `Info ${this.shortId}` });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_SNAPSHOT, { name: `Snapshot ${this.shortId}` });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_HDSNAPSHOT, { name: `HD Snapshot ${this.shortId}` });
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
        if (this._adapter.config.auto_snapshot === undefined)
            this._adapter.config.auto_snapshot = false;
        if (this._adapter.config.auto_HDsnapshot === undefined)
            this._adapter.config.auto_HDsnapshot = false;
        if (this._adapter.config.auto_livestream === undefined)
            this._adapter.config.auto_livestream = false;
        this._adapter.upsertState(`${this.fullId}.${constants_1.STATE_ID_DEBUG_REQUEST}`, constants_1.COMMON_DEBUG_REQUEST, false, true, true);
        this._adapter.upsertState(`${this.snapshotChannelId}.auto`, constants_1.COMMON_SNAPSHOT_AUTO, this._adapter.config.auto_snapshot, true, true);
        this._adapter.upsertState(`${this.HDsnapshotChannelId}.auto`, constants_1.COMMON_HDSNAPSHOT_AUTO, this._adapter.config.auto_HDsnapshot, true, true);
        this._adapter.upsertState(`${this.liveStreamChannelId}.auto`, constants_1.COMMON_LIVESTREAM_AUTO, this._adapter.config.auto_livestream, true, true);
        // Remove legacy states
        this._adapter.delObject(`${this.snapshotChannelId}.snapshot_request`);
        this._adapter.delObject(`${this.snapshotChannelId}.snapshot_file`);
        this._adapter.delObject(`${this.snapshotChannelId}.snapshot_url`);
        this._adapter.delObject(`${this.liveStreamChannelId}.livestream_request`);
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
        this.ringDevice = ringDevice;
        this._state = EventState.Idle;
        this.update(ringDevice.data);
    }
    update(data) {
        this.debug(`Received Update`);
        this.updateDeviceInfoObject(data);
        this.updateHealth();
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
                start: 2
            },
            {
                name: "Livestream",
                val: this._adapter.config.save_livestream,
                fct: () => {
                    this.startLivestream();
                },
                start: 4
            }
        ];
        for (const m of media) {
            if (m.val > 0) {
                let schedMinute = "*";
                let schedHour = "*";
                if (m.val === 3600) {
                    schedMinute = "1";
                    schedHour = "12";
                }
                else if (m.val === 60) {
                    schedMinute = "3";
                }
                else if (m.val < 60) {
                    schedMinute = `${m.start}-59/${m.val.toString()}`;
                }
                node_schedule_1.default.scheduleJob(`Auto save ${m.name}_${this._adapter.name}_${this._adapter.instance}`, `${m.start * 10} ${schedMinute} ${schedHour} * * *`, () => {
                    this.info(`Cronjob Auto save ${m.name} starts`);
                    m.fct();
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
                this.onDing(ding);
            },
            error: (err) => {
                this.catcher(`Ding Observer received error`, err);
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
    onDing(value) {
        var _a;
        this.debug(`Received Ding Event (${util.inspect(value, true, 1)})`);
        this.conditionalRecording(EventState.ReactingOnDing, value.ding.image_uuid);
        this._adapter.upsertState(`${this.eventsChannelId}.type`, constants_1.COMMON_EVENTS_TYPE, value.subtype);
        this._adapter.upsertState(`${this.eventsChannelId}.detectionType`, constants_1.COMMON_EVENTS_DETECTIONTYPE, (_a = value.ding.detection_type) !== null && _a !== void 0 ? _a : value.subtype);
        this._adapter.upsertState(`${this.eventsChannelId}.created_at`, constants_1.COMMON_EVENTS_MOMENT, Date.now());
        this._adapter.upsertState(`${this.eventsChannelId}.message`, constants_1.COMMON_EVENTS_MESSAGE, value.aps.alert);
    }
    onMotion(value) {
        if (value && this._eventBlocker.motion.checkBlock()) {
            this.debug(`ignore Motion event...`);
            return;
        }
        this.debug(`Received Motion Event (${util.inspect(value, true, 1)})`);
        this._adapter.upsertState(`${this.eventsChannelId}.motion`, constants_1.COMMON_MOTION, value);
        value && this.conditionalRecording(EventState.ReactingOnMotion);
    }
    onDoorbell(value) {
        if (value && this._eventBlocker.doorbell.checkBlock()) {
            this.debug(`ignore Doorbell event...`);
            return;
        }
        this.debug(`Received Doorbell Event (${util.inspect(value, true, 1)})`);
        this._adapter.upsertState(`${this.eventsChannelId}.doorbell`, constants_1.COMMON_EVENTS_DOORBELL, true);
        setTimeout(() => {
            this._adapter.upsertState(`${this.eventsChannelId}.doorbell`, constants_1.COMMON_EVENTS_DOORBELL, false);
        }, 1000);
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