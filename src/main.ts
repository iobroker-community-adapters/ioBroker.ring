/*
 * Created with @iobroker/create-adapter v1.34.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import {
    Adapter,
    type AdapterOptions,
    getAbsoluteInstanceDataDir,
    getAbsoluteDefaultDataDir,
} from '@iobroker/adapter-core';
import path from 'node:path';
import schedule from 'node-schedule';
import type { SunTimes } from 'suncalc' with {
    'resolution-mode': 'import',
};

import { RingApiClient } from './lib/ringApiClient';
import { FileService } from './lib/services/file-service';

export class RingAdapter extends Adapter {
    private apiClient: RingApiClient | undefined;
    public static isWindows: boolean = process.platform.startsWith('win');
    private states: { [id: string]: ioBroker.StateValue } = {};
    private readonly scheduledJobs: schedule.Job[] = [];
    private sunrise: number = 0;
    private sunset: number = 0;

    public get absoluteInstanceDir(): string {
        return getAbsoluteInstanceDataDir(this);
    }
    public get absoluteDefaultDir(): string {
        return getAbsoluteDefaultDataDir();
    }
    public get Sunrise(): number {
        return this.sunrise;
    }
    public get Sunset(): number {
        return this.sunset;
    }

    public constructor(options: Partial<AdapterOptions> = {}) {
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

    public static getSplitIds(id: string): { device: string; channel: string; stateName: string } {
        const splits: string[] = id.split('.');
        let device = '';
        let channel = '';
        let stateName: string = splits[0];
        if (splits.length === 2) {
            device = splits[0];
            stateName = splits[1];
        } else if (splits.length === 3) {
            device = splits[0];
            channel = splits[1];
            stateName = splits[2];
        }
        return { device, channel, stateName };
    }

    public async upsertState(
        id: string,
        common: Partial<ioBroker.StateCommon>,
        value: ioBroker.StateValue,
        ack: boolean = true,
        subscribe: boolean = false,
    ): Promise<void> {
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
    private onUnload(callback: () => void): void {
        try {
            // Timers created via this.setTimeout()/this.setInterval() are cleared by adapter-core,
            // node-schedule jobs are not - and in compact mode they would outlive the instance.
            while (this.scheduledJobs.length) {
                this.scheduledJobs.pop()?.cancel();
            }
            this.apiClient?.unload();
            callback();
        } catch {
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

    public async tryGetStringState(id: string): Promise<string> {
        const cachedVal: string | number | boolean | null = this.states[id];
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

    public async getRefreshToken(): Promise<string> {
        const newTokenStateVal: string = await this.tryGetStringState('next_refresh_token');
        const oldTokenStateVal: string = await this.tryGetStringState('old_user_refresh_token');
        if (newTokenStateVal && oldTokenStateVal === this.config.refreshtoken) {
            this.log.debug(`As the configured refresh token hasn't changed the state one will be used`);
            return newTokenStateVal;
        }
        return this.config.refreshtoken;
    }

    private async calcSunData(): Promise<void> {
        try {
            this.log.debug('Run calcSunData');
            if (this.latitude && this.longitude) {
                // "suncalc" is ESM only and cannot be require()d from this CommonJS build
                const { getTimes } = await import('suncalc');
                const today: Date = new Date();
                const sunData: SunTimes = getTimes(
                    today,
                    typeof this.latitude === 'string' ? parseFloat(this.latitude) : this.latitude,
                    typeof this.longitude === 'string' ? parseFloat(this.longitude) : this.longitude,
                );
                // night is really dark, sunset is too early - and vice versa for nightEnd.
                // Both are null inside the polar circles, where there is no astronomical night.
                // The night detection in OwnRingCamera treats 0 as "unknown" and is skipped then.
                if (sunData.night && sunData.nightEnd) {
                    this.sunset = sunData.night.getTime();
                    this.sunrise = sunData.nightEnd.getTime();
                    this.log.debug(
                        `Sunset: ${new Date(this.sunset).toLocaleString()}, Sunrise: ${new Date(this.sunrise).toLocaleString()}`,
                    );
                } else {
                    this.sunset = 0;
                    this.sunrise = 0;
                    this.log.debug('No astronomical night at this location today, night detection is disabled');
                }
            } else {
                this.log.error('Latitude or Longitude not defined in System');
            }
        } catch (error) {
            const eMsg = `Error in CalcSunData: ${error}`;
            this.log.error(eMsg);
            console.error(eMsg);
        }
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        // Initialize your adapter here
        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.apiClient = new RingApiClient(this);
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

        const configPath: string[] = [this.config.path_snapshot, this.config.path_livestream];
        for (let index = 0; index < configPath.length; index++) {
            this.log.debug(`Configured Path: "${configPath[index]}"`);
            const dataDir: any = this.systemConfig ? this.systemConfig.dataDir : '';
            this.log.silly(`DataDir: ${dataDir}`);
            if (!configPath[index]) {
                configPath[index] = path.join(this.absoluteDefaultDir, 'files', this.namespace);
                if (!index) {
                    this.config.path_snapshot = configPath[index];
                } else {
                    this.config.path_livestream = configPath[index];
                }
                this.log.debug(`New Config Path: "${configPath[index]}"`);
            }
            await FileService.prepareFolder(configPath[index]);
        }

        this.log.info(`Initializing Api Client`);
        await this.apiClient.init();

        this.log.info(`Get sunset and sunrise`);
        await this.calcSunData();

        // Daily schedule sometime from 00:00:20 to 00:00:40
        const scheduleSeconds: number = Math.round(Math.random() * 20 + 20);
        this.log.info(`Daily sun parameter calculation scheduled for 00:00:${scheduleSeconds}`);
        this.registerScheduledJob(
            // the job name has to carry the namespace, node-schedule keeps named jobs in one
            // process-wide registry and a second instance would otherwise replace this job
            schedule.scheduleJob(
                `SunData_${this.namespace}`,
                `${scheduleSeconds} 0 0 * * *`,
                async (): Promise<void> => {
                    this.log.info(`Cronjob 'Sun parameter calculation' starts`);
                    await this.calcSunData();
                },
            ),
        );
    }

    /**
     * Is called if a subscribed state changes
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
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
        const splits: string[] = id.split('.');
        const targetId: string = splits[2];
        let stateID: string = splits[3];
        let channelID = '';
        if (splits.length === 5) {
            channelID = splits[3];
            stateID = splits[4];
        }

        this.apiClient.processUserInput(targetId, channelID, stateID, state);
    }

    /** Remember a node-schedule job so that onUnload() can cancel it again */
    public registerScheduledJob(job: schedule.Job | null): void {
        if (job) {
            this.scheduledJobs.push(job);
        }
    }

    public logCatch(message: string, reason: any): void {
        this.log.info(message);
        this.log.debug(`Reason: "${reason}"`);
    }

    private async upsertStateAsync(
        id: string,
        common: Partial<ioBroker.StateCommon>,
        value: ioBroker.StateValue,
        ack: boolean = true,
        subscribe: boolean = false,
    ): Promise<void> {
        try {
            if (this.states[id] !== undefined) {
                this.states[id] = value;
                await this.setStateAsync(id, value, ack);
                return;
            }

            const { device, channel, stateName }: { device: string; channel: string; stateName: string } =
                RingAdapter.getSplitIds(id);
            const objectId: string = [device, channel, stateName].filter((part: string) => part !== '').join('.');
            await this.setObjectNotExistsAsync(objectId, {
                type: 'state',
                common: common as ioBroker.StateCommon,
                native: {},
            });
            this.states[id] = value;
            await this.setStateAsync(id, value, ack);
            if (subscribe) {
                await this.subscribeStatesAsync(id);
            }
        } catch (e: any) {
            this.log.warn(`Error Updating State ${id} to ${value}: ${e?.message ?? e}`);
            if (e?.stack !== undefined) {
                this.log.debug(`Error Stack: ${e.stack}`);
            }
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined): RingAdapter => new RingAdapter(options);
} else {
    // otherwise start the instance directly
    ((): RingAdapter => new RingAdapter())();
}
