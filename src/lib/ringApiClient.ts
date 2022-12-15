import { Location, RingApi, RingCamera, RingIntercom } from "ring-client-api";
import { RingAdapter } from "../main";
import { OwnRingCamera } from "./ownRingCamera";
import { COMMON_NEW_TOKEN, COMMON_OLD_TOKEN } from "./constants";
import { OwnRingLocation } from "./ownRingLocation";
import { OwnRingDevice } from "./ownRingDevice";
import { OwnRingIntercom } from "./ownRingIntercom";

export class RingApiClient {
  public refreshing = false;
  private cameras: { [id: string]: OwnRingCamera } = {};
  private intercoms: { [id: string]: OwnRingIntercom } = {};
  private _refreshInterval: NodeJS.Timer | null = null;
  private _retryTimeout: NodeJS.Timer | null = null;

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
      systemId: `${this.adapter.host}.ring_v${this.adapter.version}_${Math.random() * Math.pow(10, 6)}`,
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
    if (!await this.retrieveLocations()) {
      if (initial) {
        this.adapter.terminate(`Failed to retrieve any locations for your ring Account.`);
      } else {
        if (this._retryTimeout !== null) {
          clearTimeout(this._retryTimeout);
          this._retryTimeout = null;
        }
        this.warn(`Couldn't load data from Ring Server on reconnect, will retry in 5 Minutes...`)
        this._retryTimeout = setTimeout(this.refreshAll.bind(this), 5 * 60 * 1000);
      }
    } else {
      if (this._retryTimeout !== null) {
        clearTimeout(this._retryTimeout);
        this._retryTimeout = null;
      }
    }
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
        this.updateCamera(c, l);
      }
      this.debug(`Location has ${l.loc.intercoms.length} Intercoms`);
      for (const i of l.loc.intercoms) {
        this.updateIntercom(i, l);
      }
    }
    this.refreshing = false;
    this.debug(`Refresh complete`);
  }


  public processUserInput(targetId: string, channelID: string, stateID: string, state: ioBroker.State): void {
    const targetDevice = this.cameras[targetId] ?? this.intercoms[targetId];
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
    if (this._retryTimeout !== null) {
      clearTimeout(this._retryTimeout);
      this._retryTimeout = null;
    }
  }

  private async retrieveLocations(): Promise<boolean> {
    this.debug(`Retrieve Locations`);
    return new Promise<boolean>(async (res) => {
      (await this.getApi()).getLocations()
        .catch((reason: any) => {
          this.handleApiError(reason)
          res(false);
        })
        .then((locs) => {
          if (typeof locs != "object" || (locs?.length ?? 0) == 0) {
            this.debug("getLocations was successful, but received no array")
            res(false);
          }
          this.debug(`Received ${locs?.length} Locations`);
          this._locations = {};
          for (const loc of locs as Location[]) {
            const newLoc = new OwnRingLocation(loc, this.adapter, this);
            this._locations[newLoc.fullId] = newLoc;
          }
          res(true);
        });
    });
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

  private updateCamera(camera: RingCamera, location: OwnRingLocation): void {
    const fullID = OwnRingCamera.getFullId(camera, this.adapter);
    let ownRingCamera: OwnRingCamera = this.cameras[fullID];
    if (ownRingCamera === undefined) {
      ownRingCamera = new OwnRingCamera(camera, location, this.adapter, this);
      this.cameras[fullID] = ownRingCamera;
    } else {
      ownRingCamera.updateByDevice(camera);
    }
  }

  private updateIntercom(intercom: RingIntercom, location: OwnRingLocation): void {
    const fullID = OwnRingDevice.getFullId(intercom, this.adapter);
    let ownRingIntercom: OwnRingIntercom = this.intercoms[fullID];
    if (ownRingIntercom === undefined) {
      ownRingIntercom = new OwnRingIntercom(intercom, location, this.adapter, this);
      this.intercoms[fullID] = ownRingIntercom;
    } else {
      ownRingIntercom.updateByDevice(intercom);
    }
  }

  public getLocation(locId: string): OwnRingLocation {
    return this.locations[locId];
  }
}
