import util from "util";
import {
  Location,
  LocationMode,
  LocationModeInput,
  LocationModeResponse,
  RingDevice,
  SocketIoMessage
} from "ring-client-api";

import { RingAdapter } from "../main";
import { RingApiClient } from "./ringApiClient";
import {
  COMMON_DEBUG_REQUEST,
  COMMON_LOCATIONMODE,
  LOCATION_MODE_OPTIONS,
  STATE_ID_DEBUG_REQUEST,
  STATE_ID_LOCATIONMODE,
} from "./constants";
import { ExtendedResponse } from "ring-client-api/lib/rest-client";

export class OwnRingLocation {
  private _currentLocationMode: LocationMode = "unset";
  public get loc(): Location {
    return this._loc;
  }

  public get id(): string {
    return this._loc.id;
  }

  public get fullId(): string {
    return this._fullId;
  }

  public get name(): string {
    return this._loc.name;
  }

  private readonly _fullId: string;
  private readonly _adapter: RingAdapter;
  private readonly _client: RingApiClient;
  private readonly _loc: Location;


  public constructor(location: Location, adapter: RingAdapter, apiClient: RingApiClient) {
    this._loc = location;
    this._fullId = `Location_${this.id}`;
    this._adapter = adapter;
    this._client = apiClient;
    this._loc.onDataUpdate.subscribe((message: SocketIoMessage): void => {
      this.debug(`Received Location Update Event: "${message}"`);
    });
    this._loc.onConnected.subscribe((connected: boolean): void => {
      this.debug(`Received Location Connection Status Change to ${connected}`);
      if(!connected && !apiClient.refreshing) {
        this.warn(`Lost connection to Location ${this._loc.name}... Will try a reconnect in 5s`);
        setTimeout((): void => {
          this._client.refreshAll();
        }, 5000);
      }
    });
    this._loc.onLocationMode.subscribe((newMode: "home" | "away" | "disarmed" | "disabled" | "unset"): void => {
      this.updateModeObject(newMode);
    });
    this.silly(`Location Debug Data: ${util.inspect(this._loc, false, 2)}`);
    this.recreateDeviceObjectTree();
    this.getLocationMode();
  }

  private async recreateDeviceObjectTree(): Promise<void> {
    this.silly(`Recreate LocationObjectTree`);
    this._adapter.createDevice(this._fullId, {
      name: `Location ${this.id} ("${this.name}")`,
    });
    await this._adapter.upsertState(
      `${this._fullId}.${STATE_ID_DEBUG_REQUEST}`,
      COMMON_DEBUG_REQUEST,
      false,
      true,
      true
    );
  }

  private silly(message: string): void {
    this._adapter.log.silly(`Location ${this.id} ("${this.name}"): ${message}`);
  }

  private debug(message: string): void {
    this._adapter.log.debug(`Location ${this.id} ("${this.name}"): ${message}`);
  }

  private warn(message: string): void {
    this._adapter.log.warn(`Location ${this.id} ("${this.name}"): ${message}`);
  }

  public async getDevices(): Promise<RingDevice[]> {
    return this.loc.getDevices();
  }

  public processUserInput(channelID: string, stateID: string, state: ioBroker.State): void {
    switch (channelID) {
      case "":
        if (stateID === STATE_ID_DEBUG_REQUEST) {
          this.performDebugOnUserRequest(state);
          return;
        }
        if (stateID === STATE_ID_LOCATIONMODE) {
          this.performLocationModeChange(state);
          return;
        }
        this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
        return;
      default:
        this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
    }
  }

  private performDebugOnUserRequest(state: ioBroker.State): void {
    const targetVal: boolean = state.val as boolean;
    if (targetVal) {
      this._adapter.log.info(`Location Debug Data for ${this.id}: ${util.inspect(this._loc, false, 1)}`);
      this._adapter.upsertState(
        `${this._fullId}.${STATE_ID_DEBUG_REQUEST}`,
        COMMON_DEBUG_REQUEST,
        false
      );
    }
  }

  private async performLocationModeChange(state: ioBroker.State): Promise<void> {
    const parsedNumber: number = parseInt(state.val as string, 10);
    let desiredState: string | LocationMode;
    if (typeof state.val == "number") {
      desiredState = LOCATION_MODE_OPTIONS[state.val as number];
    } else if(!isNaN(parsedNumber)) {
      desiredState = LOCATION_MODE_OPTIONS[parsedNumber];
    } else {
      desiredState = state.val as string;
    }
    if (desiredState == this._currentLocationMode) {
      return;
    }
    if (["home", "away", "disarmed"].indexOf(desiredState) === -1) {
      this.updateModeObject(this._currentLocationMode, true);
      this.warn(`Invalid input "${desiredState}"... Only "home","away" and "disarmed" are choose-able by user.`);
      return;
    }
    this.debug(`Change Location Mode to ${desiredState}`);
    this._loc.setLocationMode(desiredState as LocationModeInput)
      .then((r: LocationModeResponse & ExtendedResponse): Promise<void> => this.updateModeObject(r.mode))
      .catch((reason: any): void => {
        this._adapter.logCatch(`Failed setting location mode`, reason);
      });
  }

  private async updateModeObject(newMode: LocationMode, preventLog: boolean = false): Promise<void> {
    this._currentLocationMode = newMode;
    if(!preventLog) {
      this.silly(`Received new LocationMode: ${newMode}`);
    }
    await this._adapter.upsertState(
      `${this._fullId}.locationMode`,
      COMMON_LOCATIONMODE,
      newMode,
      true,
      true,
    );
  }

  private async getLocationMode(): Promise<void> {
    this._loc.getLocationMode()
      .then((r: LocationModeResponse & ExtendedResponse): Promise<void> => this.updateModeObject(r.mode))
      .catch((reason: any): void => this._adapter.logCatch("Couldn't retrieve Location Mode", reason));
  }
}
