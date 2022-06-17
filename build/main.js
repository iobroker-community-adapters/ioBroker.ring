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
const ringApiClient_1 = require("./lib/ringApiClient");
const path_1 = __importDefault(require("path"));
const file_service_1 = require("./lib/services/file-service");
// Load your modules here, e.g.:
// import * as fs from "fs";
class RingAdapter extends utils.Adapter {
    constructor(options = {}) {
        options.systemConfig = true;
        super({
            ...options,
            name: "ring",
        });
        this.states = {};
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
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
        this.log.debug(`Configured Path: "${this.config.path}"`);
        const dataDir = (this.systemConfig) ? this.systemConfig.dataDir : "";
        this.log.silly(`DataDir: ${dataDir}`);
        if (!this.config.path) {
            this.config.path = path_1.default.normalize(`${utils.controllerDir}/${dataDir}files/${this.namespace}`);
            this.log.debug(`New Config Path: "${this.config.path}"`);
        }
        await file_service_1.FileService.prepareFolder(this.config.path);
        const objectDevices = this.getDevicesAsync();
        for (const objectDevice in objectDevices) {
            this.deleteDevice(objectDevice);
        }
        this.log.info(`Initializing Api Client`);
        await this.apiClient.init();
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
    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
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
    upsertState(id, common, value, subscribe = false) {
        if (this.states[id] === value && !subscribe) {
            // Unchanged and from user not changeable Value
            return;
        }
        // noinspection JSIgnoredPromiseFromCall
        this.upsertStateAsync(id, common, value, subscribe);
    }
    async tryGetStringState(id) {
        var _a, _b;
        const cachedVal = this.states[id];
        if (cachedVal !== undefined && cachedVal !== null)
            return cachedVal + "";
        return ((_b = (_a = (await this.getStateAsync(id))) === null || _a === void 0 ? void 0 : _a.val) !== null && _b !== void 0 ? _b : "") + "";
    }
    async upsertStateAsync(id, common, value, subscribe = false) {
        var _a;
        try {
            if (this.states[id] !== undefined) {
                this.states[id] = value;
                await this.setStateAsync(id, value, true);
                return;
            }
            const { device, channel, stateName } = RingAdapter.getSplittedIds(id);
            await this.createStateAsync(device, channel, stateName, common);
            this.states[id] = value;
            await this.setStateAsync(id, value, true);
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
    async upsertFile(id, common, value, timestamp) {
        var _a;
        try {
            if (this.states[id] === timestamp) {
                this.log.silly(`upsertFile ${id} prevented as timestamp is the same`);
                // Unchanged Value
                return;
            }
            this.log.silly(`upsertFile ${id}, length: ${value.length}`);
            const foreignId = `${this.namespace}.${id}`;
            if (this.states[id] !== undefined) {
                this.states[id] = timestamp;
                await this.setForeignBinaryStateAsync(foreignId, value).catch((reason) => {
                    this.logCatch("Couldn't write File-State", reason);
                });
                return;
            }
            const { device, channel, stateName } = RingAdapter.getSplittedIds(id);
            this.log.silly(`upsertFile.First File create State first for ${id}.\n Device: ${device}; Channel: ${channel}; StateName: ${stateName}`);
            // this.log.silly(`Create Binary State Common: ${JSON.stringify(common)}`);
            const obj = {
                _id: foreignId,
                native: {},
                type: "state",
                common: common
            };
            await this.setObjectNotExistsAsync(id, obj).catch((reason) => {
                // await this.createStateAsync(device, channel, stateName, common).catch((reason) => {
                this.logCatch("Couldn't Create File-State", reason);
            });
            await this.setForeignBinaryStateAsync(foreignId, value).catch((reason) => {
                this.logCatch("Couldn't write File-State", reason);
            });
            this.states[id] = timestamp;
        }
        catch (e) {
            this.log.warn(`Error Updating File State ${id}: ${(_a = e === null || e === void 0 ? void 0 : e.message) !== null && _a !== void 0 ? _a : e}`);
            if ((e === null || e === void 0 ? void 0 : e.stack) !== undefined) {
                this.log.debug(`Error Stack: ${e.stack}`);
            }
        }
    }
    static getSplittedIds(id) {
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
    logCatch(message, reason) {
        this.log.info(message);
        this.log.debug(`Reason: "${reason}"`);
    }
    async getRefreshToken() {
        const newTokenStateVal = await this.tryGetStringState("next_refresh_token");
        const oldTokenStateVal = await this.tryGetStringState("old_user_refresh_token");
        if (newTokenStateVal && oldTokenStateVal === this.config.refreshtoken) {
            this.log.debug(`As the configured refresh token hasn't changed the state one will be used`);
            return newTokenStateVal;
        }
        return this.config.refreshtoken;
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