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
exports.RingAdapter = void 0;
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
    /**
     * This method ensures that the state is updated or created if it doesn't exist.
     */
    async upsertState(id, common, value, ack = true, subscribe = false) {
        if (this.states[id] === value && !subscribe) {
            return;
        }
        await this.upsertStateAsync(id, common, value, ack, subscribe);
    }
    /**
     * This method handles the creation of devices, channels, and states as necessary.
     */
    async upsertStateAsync(id, common, value, ack = true, subscribe = false) {
        var _a;
        try {
            if (this.states[id] !== undefined) {
                this.states[id] = value;
                await this.setStateAsync(id, value, ack);
                return;
            }
            const { device, channel, stateName } = RingAdapter.getSplitIds(id);
            // Create a complete `common` object to avoid type issues
            const completeCommon = {
                name: "Default Name",
                type: "string",
                role: "state",
                read: true,
                write: false,
                ...common,
            };
            // Create the device if it doesn't exist yet
            if (device && !channel) {
                await this.setObjectNotExistsAsync(device, {
                    type: "device",
                    common: {
                        name: device,
                    },
                    native: {},
                });
            }
            // Create the channel if it doesn't exist yet
            if (device && channel) {
                await this.setObjectNotExistsAsync(`${device}.${channel}`, {
                    type: "channel",
                    common: {
                        name: channel,
                    },
                    native: {},
                });
            }
            // Create the state if it doesn't exist yet
            await this.setObjectNotExistsAsync(`${device}.${channel ? channel + "." : ""}${stateName}`, {
                type: "state",
                common: completeCommon,
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
    /**
     * Is called when the adapter is unloaded - make sure to clean up timers and intervals.
     */
    onUnload(callback) {
        try {
            if (this.apiClient) {
                this.apiClient.unload();
            }
            callback();
        }
        catch (e) {
            callback();
        }
    }
    /**
     * Retrieves a state value as a string from the cache or from the state object.
     */
    async tryGetStringState(id) {
        var _a, _b;
        const cachedVal = this.states[id];
        if (cachedVal !== undefined && cachedVal !== null) {
            return cachedVal + "";
        }
        return ((_b = (_a = (await this.getStateAsync(id))) === null || _a === void 0 ? void 0 : _a.val) !== null && _b !== void 0 ? _b : "") + "";
    }
    /**
     * Returns the refresh token if available.
     */
    async getRefreshToken() {
        const newTokenStateVal = await this.tryGetStringState("next_refresh_token");
        const oldTokenStateVal = await this.tryGetStringState("old_user_refresh_token");
        if (newTokenStateVal && oldTokenStateVal === this.config.refreshtoken) {
            this.log.debug(`As the configured refresh token hasn't changed, the stored one will be used`);
            return newTokenStateVal;
        }
        return this.config.refreshtoken;
    }
    /**
     * Calculates the sun data (sunrise and sunset) based on the current latitude and longitude.
     */
    async CalcSunData() {
        try {
            this.log.debug("Run CalcSunData");
            if (this.latitude && this.longitude) {
                const today = new Date();
                const sunData = suncalc_1.default.getTimes(today, typeof this.latitude === "string" ? parseFloat(this.latitude) : this.latitude, typeof this.longitude === "string" ? parseFloat(this.longitude) : this.longitude);
                this.sunset = sunData.night.getTime();
                this.sunrise = sunData.nightEnd.getTime();
                this.log.debug(`Sunset: ${new Date(this.sunset).toLocaleString()}, Sunrise: ${new Date(this.sunrise).toLocaleString()}`);
            }
            else {
                this.log.error("Latitude or Longitude not defined in the system");
            }
        }
        catch (error) {
            const eMsg = `Error in CalcSunData: ${error}`;
            this.log.error(eMsg);
            console.error(eMsg);
        }
    }
    /**
     * Called when the adapter is ready - initializes the API client and schedules tasks.
     */
    async onReady() {
        this.apiClient = new ringApiClient_1.RingApiClient(this);
        if (!this.apiClient.validateRefreshToken()) {
            this.terminate(`Invalid Refresh Token, please follow steps provided within Readme to generate a new one`);
            return;
        }
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
        this.log.info(`Initializing Api Client`);
        await this.apiClient.init();
        this.log.info(`Get sunset and sunrise`);
        await this.CalcSunData();
        const scheduleSeconds = Math.round(Math.random() * 20 + 20);
        this.log.info(`Daily sun parameter calculation scheduled for 00:00:${scheduleSeconds}`);
        node_schedule_1.default.scheduleJob("SunData", `${scheduleSeconds} 0 0 * * *`, async () => {
            this.log.info(`Cronjob 'Sun parameter calculation' starts`);
            await this.CalcSunData();
        });
    }
    /**
     * Called when a subscribed state changes - handles user input and updates the state.
     */
    onStateChange(id, state) {
        if (!state || !this.apiClient) {
            this.log.silly(`state ${id} deleted`);
            return;
        }
        if (state.ack) {
            return;
        }
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
}
exports.RingAdapter = RingAdapter;
RingAdapter.isWindows = process.platform.startsWith("win");
if (require.main !== module) {
    module.exports = (options) => new RingAdapter(options);
}
else {
    (() => new RingAdapter())();
}
//# sourceMappingURL=main.js.map