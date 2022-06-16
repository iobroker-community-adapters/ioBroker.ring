import { RingApi } from "ring-client-api/lib/api/api";
import { RingAdapter } from "../main";
import { Location } from "ring-client-api/lib/api/location";
import { RingCamera } from "ring-client-api";
import { OwnRingDevice } from "./ownRingDevice";
import { COMMON_NEW_TOKEN, COMMON_OLD_TOKEN } from "./constants";
import { OwnRingLocation } from "./ownRingLocation";

export class RingApiClient {
  public refreshing = false;
  private devices: { [id: string]: OwnRingDevice } = {};
  private _refreshInterval: NodeJS.Timer | null = null;

  get locations(): { [id: string]: OwnRingLocation } {
    return this._locations;
  }

  private _locations: { [id: string]: OwnRingLocation } = {};

  public validateRefreshToken(): boolean {
    const token: string = this.adapter.config.refreshtoken;
    if (!token || token === "") {
      this.adapter.log.error(`Refresh Token missing.`)
      return false;
    }
    if (token.length < 10) {
      this.adapter.log.error(`Refresh Token is odly short.`)
      return false;
    }

    return true;
  }

  public async getApi(): Promise<RingApi> {
    if (this._api) {
      return this._api;
    }
    if (!this.adapter.config.refreshtoken) {
      throw(`Refresh Token needed.`)
    }
    this._api = new RingApi({
      controlCenterDisplayName: "iobroker.ring",
      refreshToken: await this.adapter.getRefreshToken(),
      systemId: `${this.adapter.host}.ring`,
      cameraStatusPollingSeconds: 120,
      locationModePollingSeconds: 120,
      // debug: true
    });
    this._api.onRefreshTokenUpdated.subscribe((data) => {
      this.adapter.log.info(
        `Recieved new Refresh Token. Will use the new one until the token in config gets changed`
      );
      this.adapter.upsertState("next_refresh_token", COMMON_NEW_TOKEN, data.newRefreshToken);
      this.adapter.upsertState("old_user_refresh_token", COMMON_OLD_TOKEN, this.adapter.config.refreshtoken);
    });
    return this._api;
  }

  private readonly adapter: RingAdapter;
  private _api: RingApi | undefined;

  public constructor(adapter: RingAdapter) {
    this.adapter = adapter;
  }

  public async init(): Promise<void> {
    await this.refreshAll(true);
    this._refreshInterval = setInterval(this.refreshAll.bind(this), 120 * 60 * 1000)
  }

  public async refreshAll(initial = false): Promise<void> {
    /**
     *  TH 2022-05-30: It seems like Ring Api drops it's socket connection from time to time
     *  so we should reconnect ourselves
     */
    this.debug(`Refresh Ring Connection`);
    this.refreshing = true;
    this._api?.disconnect();
    this._api = undefined;
    await this.retrieveLocations();
    if (Object.keys(this._locations).length === 0 && initial) {
      this.adapter.terminate(`We couldn't find any locations in your Ring Account`);
      return;
    }
    for (const key in this._locations) {
      const l = this._locations[key];
      this.debug(`Process Location ${l.name}`);
      const devices = await l.getDevices();
      this.debug(`Recieved ${devices.length} Devices in Location ${l.name}`);
      this.debug(`Location has ${l.loc.cameras.length} Cameras`);
      for (const c of l.loc.cameras) {
        this.updateDev(c, l);
      }
    }
    this.refreshing = false;
    this.debug(`Refresh complete`);
  }


  public processUserInput(targetId: string, channelID: string, stateID: string, state: ioBroker.State): void {
    const targetDevice = this.devices[targetId];
    const targetLocation = this._locations[targetId];
    if (!targetDevice && !targetLocation) {
      this.adapter.log.error(`Recieved State Change on Subscribed State, for unknown Device/Location "${targetId}"`);
      return;
    } else if (targetDevice) {
      targetDevice.processUserInput(channelID, stateID, state);
    } else if (targetLocation) {
      targetLocation.processUserInput(channelID, stateID, state);
    }
  }

  public unload(): void {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
  }

  private async retrieveLocations(): Promise<void> {
    this.debug(`Retrieve Locations`);
    const locs = await (await this.getApi()).getLocations().catch(this.handleApiError.bind(this));
    this.debug(`Recieved ${locs?.length} Locations`);
    this._locations = {};
    for(const loc of locs as Location[]) {
      const newLoc = new OwnRingLocation(loc, this.adapter, this);
      this._locations[newLoc.fullId] = newLoc;
    }
  }

  private handleApiError(reason: any): void {
    this.adapter.log.error(`Api Call failed`);
    this.adapter.log.debug(`Failure reason:\n${reason}`);
    this.adapter.log.debug(`Call Stack: \n${(new Error()).stack}`);
  }

  private silly(message: string): void {
    this.adapter.log.silly(message);
  }

  private debug(message: string): void {
    this.adapter.log.debug(message);
  }

  private warn(message: string): void {
    this.adapter.log.warn(message);
  }

  private updateDev(device: RingCamera, location: OwnRingLocation): void {
    const fullID = OwnRingDevice.getFullId(device, this.adapter);
    let ownDev: OwnRingDevice = this.devices[fullID];
    if (ownDev === undefined) {
      ownDev = new OwnRingDevice(device, location, this.adapter, this);
      this.devices[fullID] = ownDev;
    } else {
      ownDev.updateByDevice(device);
    }
  }

  public getLocation(locId: string): OwnRingLocation {
    return this.locations[locId];
  }
}
