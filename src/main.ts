/*
 * Created with @iobroker/create-adapter v1.34.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";
import { Adapter } from "@iobroker/adapter-core";
import path from "path";
import schedule from "node-schedule";
import suncalc from "suncalc";

import { RingApiClient } from "./lib/ringApiClient";
import { FileService } from "./lib/services/file-service";

export class RingAdapter extends Adapter {
  private apiClient: RingApiClient | undefined;
  public static isWindows: boolean = process.platform.startsWith("win");
  private states: { [id: string]: ioBroker.StateValue } = {};
  private sunrise: number = 0;
  private sunset: number = 0;

  public get absoluteInstanceDir(): string {
    return utils.getAbsoluteInstanceDataDir(this as unknown as ioBroker.Adapter);
  }
  public get absoluteDefaultDir(): string {
    return utils.getAbsoluteDefaultDataDir();
  }
  public get Sunrise(): number {
    return this.sunrise;
  }
  public get Sunset(): number {
    return this.sunset;
  }

  public constructor(options: Partial<utils.AdapterOptions> = {}) {
    options.systemConfig = true;
    super({
      ...options,
      name: "ring",
      useFormatDate: true,
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    // this.on("objectChange", this.onObjectChange.bind(this));
    // this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }

  private async CalcSunData():Promise<void> {
    try {
      this.log.debug("Run CalcSunData");
      if (this.latitude && this.longitude) {
        const today = new Date();
        const sunData = suncalc.getTimes(today, this.latitude, this.longitude);
        this.sunset = sunData.night.getTime()     // night is really dark, sunset is too early
        this.sunrise = sunData.nightEnd.getTime() // same here vice versa
        this.log.debug(`Sunset: ${new Date(this.sunset).toLocaleString()}, Sunrise: ${new Date(this.sunrise).toLocaleString()}`);
      } else {
        this.log.error("Latitude or Longtime not defined in System");
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

    const config_path: string[] = [this.config.path_snapshot, this.config.path_livestream];
    for (const index in config_path) {
      this.log.debug(`Configured Path: "${config_path[index]}"`);
      const dataDir = this.systemConfig ? this.systemConfig.dataDir : "";
      this.log.silly(`DataDir: ${dataDir}`);
      if (!config_path[index]) {
        config_path[index] = path.join(this.absoluteDefaultDir, "files", this.namespace);
        if (index == "0") {
          this.config.path_snapshot = config_path[index];
        } else {
          this.config.path_livestream = config_path[index];
        }
        this.log.debug(`New Config Path: "${config_path[index]}"`);
      }
      await FileService.prepareFolder(config_path[index]);
    }

    const objectDevices = this.getDevicesAsync();
    for (const objectDevice in objectDevices) {
      this.deleteDevice(objectDevice);
    }

    this.log.info(`Initializing Api Client`);
    await this.apiClient.init();

    this.log.info(`Get sunset and sunrise`);
    await this.CalcSunData();

    // Daily schedule sometime from 00:00:20 to 00:00:40
    const scheduleSeconds = Math.round(Math.random() * 20 + 20);
    this.log.info(`Daily sun parameter calculation scheduled for 00:00:${scheduleSeconds}`);
    schedule.scheduleJob("SunData", `${scheduleSeconds} 0 0 * * *`, async () => {
      this.log.info(`Cronjob 'Sun parameter calculation' starts`);
      await this.CalcSunData();
    });
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
      if (this.apiClient) {
        this.apiClient.unload();
      }
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

  upsertState(id: string, common: Partial<ioBroker.StateCommon>, value: ioBroker.StateValue, ack = true, subscribe = false): void {
    if (this.states[id] === value && !subscribe) {
      // Unchanged and from user not changeable Value
      return;
    }
    // noinspection JSIgnoredPromiseFromCall
    this.upsertStateAsync(id, common, value, ack, subscribe);
  }

  async tryGetStringState(id: string): Promise<string> {
    const cachedVal = this.states[id];
    if (cachedVal !== undefined && cachedVal !== null) {
      return cachedVal + "";
    }
    return ((await this.getStateAsync(id))?.val ?? "") + "";
  }

  private async upsertStateAsync(id: string, common: Partial<ioBroker.StateCommon>, value: ioBroker.StateValue, ack = true, subscribe = false): Promise<void> {
    try {
      if (this.states[id] !== undefined) {
        this.states[id] = value;
        await this.setStateAsync(id, value, ack);
        return;
      }

      const { device, channel, stateName } = RingAdapter.getSplitIds(id);
      await this.createStateAsync(device, channel, stateName, common);
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

  public static getSplitIds(id: string): { device: string, channel: string, stateName: string } {
    const splits = id.split(".");
    let device = "";
    let channel = "";
    let stateName = splits[0];
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

  public logCatch(message: string, reason: any): void {
    this.log.info(message);
    this.log.debug(`Reason: "${reason}"`);
  }

  public async getRefreshToken(): Promise<string> {
    const newTokenStateVal = await this.tryGetStringState("next_refresh_token");
    const oldTokenStateVal = await this.tryGetStringState("old_user_refresh_token");
    if (newTokenStateVal && oldTokenStateVal === this.config.refreshtoken) {
      this.log.debug(`As the configured refresh token hasn't changed the state one will be used`);
      return newTokenStateVal;
    }
    return this.config.refreshtoken;
  }
}

if (require.main !== module) {
  // Export the constructor in compact mode
  module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new RingAdapter(options);
} else {
  // otherwise start the instance directly
  (() => new RingAdapter())();
}
