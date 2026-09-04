"use strict";
/*
 * Created with @iobroker/create-adapter v1.34.1
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RingAdapter = void 0;
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const adapter_core_1 = require("@iobroker/adapter-core");
const node_path_1 = __importDefault(require("node:path"));
const node_schedule_1 = __importDefault(require("node-schedule"));
const ringApiClient_1 = require("./lib/ringApiClient");
const file_service_1 = require("./lib/services/file-service");
class RingAdapter extends adapter_core_1.Adapter {
    apiClient;
    static isWindows = process.platform.startsWith('win');
    states = {};
    scheduledJobs = [];
    sunrise = 0;
    sunset = 0;
    get absoluteInstanceDir() {
        return (0, adapter_core_1.getAbsoluteInstanceDataDir)(this);
    }
    get absoluteDefaultDir() {
        return (0, adapter_core_1.getAbsoluteDefaultDataDir)();
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
            name: 'ring',
            useFormatDate: true,
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    static getSplitIds(id) {
        const splits = id.split('.');
        let device = '';
        let channel = '';
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
            // Timers created via this.setTimeout()/this.setInterval() are cleared by adapter-core,
            // node-schedule jobs are not - and in compact mode they would outlive the instance.
            while (this.scheduledJobs.length) {
                this.scheduledJobs.pop()?.cancel();
            }
            this.apiClient?.unload();
            callback();
        }
        catch {
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
        const cachedVal = this.states[id];
        if (cachedVal !== undefined && cachedVal !== null) {
            return `${cachedVal}`;
        }
        return `${(await this.getStateAsync(id))?.val ?? ''}`;
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
        const newTokenStateVal = await this.tryGetStringState('next_refresh_token');
        const oldTokenStateVal = await this.tryGetStringState('old_user_refresh_token');
        if (newTokenStateVal && oldTokenStateVal === this.config.refreshtoken) {
            this.log.debug(`As the configured refresh token hasn't changed the state one will be used`);
            return newTokenStateVal;
        }
        return this.config.refreshtoken;
    }
    async calcSunData() {
        try {
            this.log.debug('Run calcSunData');
            if (this.latitude && this.longitude) {
                // "suncalc" is ESM only and cannot be require()d from this CommonJS build
                const { getTimes } = await import('suncalc');
                const today = new Date();
                const sunData = getTimes(today, typeof this.latitude === 'string' ? parseFloat(this.latitude) : this.latitude, typeof this.longitude === 'string' ? parseFloat(this.longitude) : this.longitude);
                // night is really dark, sunset is too early - and vice versa for nightEnd.
                // Both are null inside the polar circles, where there is no astronomical night.
                // The night detection in OwnRingCamera treats 0 as "unknown" and is skipped then.
                if (sunData.night && sunData.nightEnd) {
                    this.sunset = sunData.night.getTime();
                    this.sunrise = sunData.nightEnd.getTime();
                    this.log.debug(`Sunset: ${new Date(this.sunset).toLocaleString()}, Sunrise: ${new Date(this.sunrise).toLocaleString()}`);
                }
                else {
                    this.sunset = 0;
                    this.sunrise = 0;
                    this.log.debug('No astronomical night at this location today, night detection is disabled');
                }
            }
            else {
                this.log.error('Latitude or Longitude not defined in System');
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
        const configPath = [this.config.path_snapshot, this.config.path_livestream];
        for (let index = 0; index < configPath.length; index++) {
            this.log.debug(`Configured Path: "${configPath[index]}"`);
            const dataDir = this.systemConfig ? this.systemConfig.dataDir : '';
            this.log.silly(`DataDir: ${dataDir}`);
            if (!configPath[index]) {
                configPath[index] = node_path_1.default.join(this.absoluteDefaultDir, 'files', this.namespace);
                if (!index) {
                    this.config.path_snapshot = configPath[index];
                }
                else {
                    this.config.path_livestream = configPath[index];
                }
                this.log.debug(`New Config Path: "${configPath[index]}"`);
            }
            await file_service_1.FileService.prepareFolder(configPath[index]);
        }
        this.log.info(`Initializing Api Client`);
        await this.apiClient.init();
        this.log.info(`Get sunset and sunrise`);
        await this.calcSunData();
        // Daily schedule sometime from 00:00:20 to 00:00:40
        const scheduleSeconds = Math.round(Math.random() * 20 + 20);
        this.log.info(`Daily sun parameter calculation scheduled for 00:00:${scheduleSeconds}`);
        this.registerScheduledJob(
        // the job name has to carry the namespace, node-schedule keeps named jobs in one
        // process-wide registry and a second instance would otherwise replace this job
        node_schedule_1.default.scheduleJob(`SunData_${this.namespace}`, `${scheduleSeconds} 0 0 * * *`, async () => {
            this.log.info(`Cronjob 'Sun parameter calculation' starts`);
            await this.calcSunData();
        }));
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
        const splits = id.split('.');
        const targetId = splits[2];
        let stateID = splits[3];
        let channelID = '';
        if (splits.length === 5) {
            channelID = splits[3];
            stateID = splits[4];
        }
        this.apiClient.processUserInput(targetId, channelID, stateID, state);
    }
    /** Remember a node-schedule job so that onUnload() can cancel it again */
    registerScheduledJob(job) {
        if (job) {
            this.scheduledJobs.push(job);
        }
    }
    logCatch(message, reason) {
        this.log.info(message);
        this.log.debug(`Reason: "${reason}"`);
    }
    async upsertStateAsync(id, common, value, ack = true, subscribe = false) {
        try {
            if (this.states[id] !== undefined) {
                this.states[id] = value;
                await this.setStateAsync(id, value, ack);
                return;
            }
            const { device, channel, stateName } = RingAdapter.getSplitIds(id);
            const objectId = [device, channel, stateName].filter((part) => part !== '').join('.');
            await this.setObjectNotExistsAsync(objectId, {
                type: 'state',
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
            this.log.warn(`Error Updating State ${id} to ${value}: ${e?.message ?? e}`);
            if (e?.stack !== undefined) {
                this.log.debug(`Error Stack: ${e.stack}`);
            }
        }
    }
}
exports.RingAdapter = RingAdapter;
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new RingAdapter(options);
}
else {
    // otherwise start the instance directly
    (() => new RingAdapter())();
}
//# sourceMappingURL=main.js.map