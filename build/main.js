"use strict";
/*
 * Created with @iobroker/create-adapter v1.34.1
 */
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
exports.RingAdapter = void 0;
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = __importStar(require("@iobroker/adapter-core"));
const adapter_core_1 = require("@iobroker/adapter-core");
const path_1 = __importDefault(require("path"));
const node_schedule_1 = __importDefault(require("node-schedule"));
const suncalc_1 = __importDefault(require("suncalc"));
const ringApiClient_1 = require("./lib/ringApiClient");
const file_service_1 = require("./lib/services/file-service");
class RingAdapter extends adapter_core_1.Adapter {
    get absoluteInstanceDir() {
        return utils.getAbsoluteInstanceDataDir(this);
    }
    get absoluteDefaultDir() {
        return utils.getAbsoluteDefaultDataDir();
    }
    get Sunrise() {
        return this.sunrise;
    }
    get Sunset() {
        return this.sunset;
    }
    constructor(options = {}) {
        options.systemConfig = true;
        super({
            ...options,
            name: "ring",
            useFormatDate: true,
        });
        this.states = {};
        this.sunrise = 0;
        this.sunset = 0;
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }
    static getSplitIds(id) {
        const splits = id.split(".");
        let device = "";
        let channel = "";
        let stateName = splits[0];
        if (splits.length === 2) {
            device = splits[0];
            stateName = splits[1];
        }
        else if (splits.length === 3) {
            device = splits[0];
            channel = splits[1];
            stateName = splits[2];
        }
        return { device, channel, stateName };
    }
    async upsertState(id, common, value, ack = true, subscribe = false) {
        if (this.states[id] === value && !subscribe) {
            // Unchanged and from user not changeable Value
            return;
        }
        // noinspection JSIgnoredPromiseFromCall
        await this.upsertStateAsync(id, common, value, ack, subscribe);
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);
            if (this.apiClient) {
                this.apiClient.unload();
            }
            callback();
        }
        catch (e) {
            callback();
        }
    }
    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  */
    // private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
    // 	if (obj) {
    // 		// The object was changed
    // 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    // 	} else {
    // 		// The object was deleted
    // 		this.log.info(`object ${id} deleted`);
    // 	}
    // }
    async tryGetStringState(id) {
        var _a, _b;
        const cachedVal = this.states[id];
        if (cachedVal !== undefined && cachedVal !== null) {
            return cachedVal + "";
        }
        return ((_b = (_a = (await this.getStateAsync(id))) === null || _a === void 0 ? void 0 : _a.val) !== null && _b !== void 0 ? _b : "") + "";
    }
    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over the message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  */
    // private onMessage(obj: ioBroker.Message): void {
    // 	if (typeof obj === "object" && obj.message) {
    // 		if (obj.command === "send") {
    // 			// e.g. send email or pushover or whatever
    // 			this.log.info("send command");
    // 			// Send response in callback if required
    // 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
    // 		}
    // 	}
    // }
    async getRefreshToken() {
        const newTokenStateVal = await this.tryGetStringState("next_refresh_token");
        const oldTokenStateVal = await this.tryGetStringState("old_user_refresh_token");
        if (newTokenStateVal && oldTokenStateVal === this.config.refreshtoken) {
            this.log.debug(`As the configured refresh token hasn't changed the state one will be used`);
            return newTokenStateVal;
        }
        return this.config.refreshtoken;
    }
    async CalcSunData() {
        try {
            this.log.debug("Run CalcSunData");
            if (this.latitude && this.longitude) {
                const today = new Date();
                const sunData = suncalc_1.default.getTimes(today, typeof this.latitude === "string" ? parseFloat(this.latitude) : this.latitude, typeof this.longitude === "string" ? parseFloat(this.longitude) : this.longitude);
                this.sunset = sunData.night.getTime(); // night is really dark, sunset is too early
                this.sunrise = sunData.nightEnd.getTime(); // same here vice versa
                this.log.debug(`Sunset: ${new Date(this.sunset).toLocaleString()}, Sunrise: ${new Date(this.sunrise).toLocaleString()}`);
            }
            else {
                this.log.error("Latitude or Longitude not defined in System");
            }
        }
        catch (error) {
            const eMsg = `Error in CalcSunData: ${error}`;
            this.log.error(eMsg);
            console.error(eMsg);
        }
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here
        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.apiClient = new ringApiClient_1.RingApiClient(this);
        if (!this.apiClient.validateRefreshToken()) {
            this.terminate(`Invalid Refresh Token, please follow steps provided within Readme to generate a new one`);
            return;
        }
        /*
        this.log.debug(`Configured Path: "${this.config.path}"`);
        const dataDir = (this.systemConfig) ? this.systemConfig.dataDir : "";
        this.log.silly(`DataDir: ${dataDir}`);
        if (!this.config.path) {
          this.config.path = path.join(utils.getAbsoluteDefaultDataDir(), "files", this.namespace)
          this.log.debug(`New Config Path: "${this.config.path}"`);
        }
        await FileService.prepareFolder(this.config.path);
        */
        const config_path = [this.config.path_snapshot, this.config.path_livestream];
        for (const index in config_path) {
            this.log.debug(`Configured Path: "${config_path[index]}"`);
            const dataDir = this.systemConfig ? this.systemConfig.dataDir : "";
            this.log.silly(`DataDir: ${dataDir}`);
            if (!config_path[index]) {
                config_path[index] = path_1.default.join(this.absoluteDefaultDir, "files", this.namespace);
                if (index == "0") {
                    this.config.path_snapshot = config_path[index];
                }
                else {
                    this.config.path_livestream = config_path[index];
                }
                this.log.debug(`New Config Path: "${config_path[index]}"`);
            }
            await file_service_1.FileService.prepareFolder(config_path[index]);
        }
        const objectDevices = await this.getDevicesAsync();
        for (const objectDevice of objectDevices) {
            await this.delObjectAsync(objectDevice._id, { recursive: true });
        }
        this.log.info(`Initializing Api Client`);
        await this.apiClient.init();
        this.log.info(`Get sunset and sunrise`);
        await this.CalcSunData();
        // Daily schedule sometime from 00:00:20 to 00:00:40
        const scheduleSeconds = Math.round(Math.random() * 20 + 20);
        this.log.info(`Daily sun parameter calculation scheduled for 00:00:${scheduleSeconds}`);
        node_schedule_1.default.scheduleJob("SunData", `${scheduleSeconds} 0 0 * * *`, async () => {
            this.log.info(`Cronjob 'Sun parameter calculation' starts`);
            await this.CalcSunData();
        });
    }
    /**
     * Is called if a subscribed state changes
     */
    onStateChange(id, state) {
        if (!state || !this.apiClient) {
            // The state was deleted
            this.log.silly(`state ${id} deleted`);
            return;
        }
        if (state.ack) {
            // As it is already ack, don't react on it (could be set by us).
            return;
        }
        // The state was changed
        this.log.silly(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        const splits = id.split(".");
        const targetId = splits[2];
        let stateID = splits[3];
        let channelID = "";
        if (splits.length === 5) {
            channelID = splits[3];
            stateID = splits[4];
        }
        this.apiClient.processUserInput(targetId, channelID, stateID, state);
    }
    logCatch(message, reason) {
        this.log.info(message);
        this.log.debug(`Reason: "${reason}"`);
    }
    async upsertStateAsync(id, common, value, ack = true, subscribe = false) {
        var _a;
        try {
            if (this.states[id] !== undefined) {
                this.states[id] = value;
                await this.setStateAsync(id, value, ack);
                return;
            }
            const { device, channel, stateName } = RingAdapter.getSplitIds(id);
            const objectId = [device, channel, stateName].filter((part) => part !== "").join(".");
            await this.setObjectNotExistsAsync(objectId, {
                type: "state",
                common: common,
                native: {},
            });
            this.states[id] = value;
            await this.setStateAsync(id, value, ack);
            if (subscribe) {
                await this.subscribeStatesAsync(id);
            }
        }
        catch (e) {
            this.log.warn(`Error Updating State ${id} to ${value}: ${(_a = e === null || e === void 0 ? void 0 : e.message) !== null && _a !== void 0 ? _a : e}`);
            if ((e === null || e === void 0 ? void 0 : e.stack) !== undefined) {
                this.log.debug(`Error Stack: ${e.stack}`);
            }
        }
    }
}
exports.RingAdapter = RingAdapter;
RingAdapter.isWindows = process.platform.startsWith("win");
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new RingAdapter(options);
}
else {
    // otherwise start the instance directly
    (() => new RingAdapter())();
}
//# sourceMappingURL=main.js.map