import * as utils from "@iobroker/adapter-core";
import { Adapter } from "@iobroker/adapter-core";
import path from "path";
import schedule from "node-schedule";
import suncalc, { GetTimesResult } from "suncalc";
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
    this.on("unload", this.onUnload.bind(this));
  }

  public static getSplitIds(id: string): { device: string, channel: string, stateName: string } {
    const splits: string[] = id.split(".");
    let device: string = "";
    let channel: string = "";
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

  /**
   * This method ensures that the state is updated or created if it doesn't exist.
   */
  public async upsertState(
    id: string,
    common: Partial<ioBroker.StateCommon>,
    value: ioBroker.StateValue,
    ack: boolean = true,
    subscribe: boolean = false
  ): Promise<void> {
    if (this.states[id] === value && !subscribe) {
      return;
    }
    await this.upsertStateAsync(id, common, value, ack, subscribe);
  }

  /**
   * This method handles the creation of devices, channels, and states as necessary.
   */
  private async upsertStateAsync(
    id: string,
    common: Partial<ioBroker.StateCommon>,
    value: ioBroker.StateValue,
    ack: boolean = true,
    subscribe: boolean = false
  ): Promise<void> {
    try {
      if (this.states[id] !== undefined) {
        this.states[id] = value;
        await this.setStateAsync(id, value, ack);
        return;
      }

      const { device, channel, stateName }: { device: string; channel: string; stateName: string } = RingAdapter.getSplitIds(id);

      // Create a complete `common` object to avoid type issues
      const completeCommon: ioBroker.StateCommon = {
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
    } catch (e: any) {
      this.log.warn(`Error Updating State ${id} to ${value}: ${e?.message ?? e}`);
      if (e?.stack !== undefined) {
        this.log.debug(`Error Stack: ${e.stack}`);
      }
    }
  }

  /**
   * Is called when the adapter is unloaded - make sure to clean up timers and intervals.
   */
  private onUnload(callback: () => void): void {
    try {
      if (this.apiClient) {
        this.apiClient.unload();
      }
      callback();
    } catch (e) {
      callback();
    }
  }

  /**
   * Retrieves a state value as a string from the cache or from the state object.
   */
  public async tryGetStringState(id: string): Promise<string> {
    const cachedVal: string | number | boolean | null = this.states[id];
    if (cachedVal !== undefined && cachedVal !== null) {
      return cachedVal + "";
    }
    return ((await this.getStateAsync(id))?.val ?? "") + "";
  }

  /**
   * Returns the refresh token if available.
   */
  public async getRefreshToken(): Promise<string> {
    const newTokenStateVal: string = await this.tryGetStringState("next_refresh_token");
    const oldTokenStateVal: string = await this.tryGetStringState("old_user_refresh_token");
    if (newTokenStateVal && oldTokenStateVal === this.config.refreshtoken) {
      this.log.debug(`As the configured refresh token hasn't changed, the stored one will be used`);
      return newTokenStateVal;
    }
    return this.config.refreshtoken;
  }

  /**
   * Calculates the sun data (sunrise and sunset) based on the current latitude and longitude.
   */
  private async CalcSunData(): Promise<void> {
    try {
      this.log.debug("Run CalcSunData");
      if (this.latitude && this.longitude) {
        const today: Date = new Date();
        const sunData: GetTimesResult = suncalc.getTimes(
          today,
          typeof this.latitude === "string" ? parseFloat(this.latitude) : this.latitude,
          typeof this.longitude === "string" ? parseFloat(this.longitude) : this.longitude
        );
        this.sunset = sunData.night.getTime();
        this.sunrise = sunData.nightEnd.getTime();
        this.log.debug(`Sunset: ${new Date(this.sunset).toLocaleString()}, Sunrise: ${new Date(this.sunrise).toLocaleString()}`);
      } else {
        this.log.error("Latitude or Longitude not defined in the system");
      }
    } catch (error) {
      const eMsg: string = `Error in CalcSunData: ${error}`;
      this.log.error(eMsg);
      console.error(eMsg);
    }
  }

  /**
   * Called when the adapter is ready - initializes the API client and schedules tasks.
   */
  private async onReady(): Promise<void> {
    this.apiClient = new RingApiClient(this);
    if (!this.apiClient.validateRefreshToken()) {
      this.terminate(`Invalid Refresh Token, please follow steps provided within Readme to generate a new one`);
      return;
    }

    const config_path: string[] = [this.config.path_snapshot, this.config.path_livestream];
    for (const index in config_path) {
      this.log.debug(`Configured Path: "${config_path[index]}"`);
      const dataDir: any = this.systemConfig ? this.systemConfig.dataDir : "";
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

    this.log.info(`Initializing Api Client`);
    await this.apiClient.init();

    this.log.info(`Get sunset and sunrise`);
    await this.CalcSunData();

    const scheduleSeconds: number = Math.round(Math.random() * 20 + 20);
    this.log.info(`Daily sun parameter calculation scheduled for 00:00:${scheduleSeconds}`);
    schedule.scheduleJob("SunData", `${scheduleSeconds} 0 0 * * *`, async (): Promise<void> => {
      this.log.info(`Cronjob 'Sun parameter calculation' starts`);
      await this.CalcSunData();
    });
  }

  /**
   * Called when a subscribed state changes - handles user input and updates the state.
   */
  private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
    if (!state || !this.apiClient) {
      this.log.silly(`state ${id} deleted`);
      return;
    }

    if (state.ack) {
      return;
    }
    this.log.silly(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
    const splits: string[] = id.split(".");
    const targetId: string = splits[2];
    let stateID: string = splits[3];
    let channelID: string = "";
    if (splits.length === 5) {
      channelID = splits[3];
      stateID = splits[4];
    }

    this.apiClient.processUserInput(targetId, channelID, stateID, state);
  }

  public logCatch(message: string, reason: any): void {
    this.log.info(message);
    this.log.debug(`Reason: "${reason}"`);
  }
}

if (require.main !== module) {
  module.exports = (options: Partial<utils.AdapterOptions> | undefined): RingAdapter => new RingAdapter(options);
} else {
  (() => new RingAdapter())();
}
