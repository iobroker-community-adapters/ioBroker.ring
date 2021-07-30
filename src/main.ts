/*
 * Created with @iobroker/create-adapter v1.34.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";
import {RingApiClient} from "./lib/ringApiClient";
import path from "path";
import * as fs from "fs";

// Load your modules here, e.g.:
// import * as fs from "fs";

export class RingAdapter extends utils.Adapter {
    private apiClient: RingApiClient | undefined;
    private isWindows: boolean = process.platform.startsWith("win");
    private states: {[id: string]: ioBroker.StateValue } = {};

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: "ring",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
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

        if(this.config.path === "") {
            const dataDir = (this.systemConfig) ? this.systemConfig.dataDir : "";
            const snapshotDir = path.normalize(
                `${utils.controllerDir}/${dataDir}${this.namespace.replace(".", "_")}`
            );
            this.config.path = path.join(snapshotDir, "snapshot");
        }
        if (!fs.existsSync(this.config.path)) {
            this.log.info(`Data dir isn't existing yet --> Creating Directory`);
            fs.mkdirSync(this.config.path, {recursive: true});
            if (!this.isWindows) {
                fs.chmodSync(this.config.path, 508);
            }
        }

        this.log.info(`Initializing Api Client`);
        await this.apiClient.init();
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);

            callback();
        } catch (e) {
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
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
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

    upsertState(id: string, common: Partial<ioBroker.StateCommon>, value: ioBroker.StateValue) {
        if (this.states[id] === value) {
            // Unchanged Value
            return;
        }
        // noinspection JSIgnoredPromiseFromCall
        this.upsertStateAsync(id, common, value);
    }

    private async upsertStateAsync(id: string, common: Partial<ioBroker.StateCommon>, value: string | number | null | boolean) {
        if (this.states[id] === undefined) {
            const splits = id.split(".");
            const device = splits[0];
            let channel = "";
            let stateName = splits[1];
            if (splits.length === 3) {
                channel = splits[1];
                stateName = splits[2];
            }
            await this.createStateAsync(device, channel, stateName, common);
        }
        this.states[id] = value;
        await this.setStateAsync(id, value);
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new RingAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new RingAdapter())();
}
