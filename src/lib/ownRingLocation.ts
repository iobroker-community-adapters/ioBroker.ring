import { Location } from "ring-client-api/lib/api/location";
import util from "util";
import { RingAdapter } from "../main";
import { RingApiClient } from "./ringApiClient";
import { LocationMode, LocationModeInput, RingDevice } from "ring-client-api";
import {
  COMMON_DEBUG_REQUEST, COMMON_LOCATIONMODE, LOCATION_MODE_OPTIONS,
  STATE_ID_DEBUG_REQUEST, STATE_ID_LOCATIONMODE,
} from "./constants";

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
    this._loc.onDataUpdate.subscribe((message) => {
      this.debug(`Recieved Location Update Event: "${message}"`);
    });
    this._loc.onConnected.subscribe((connected) => {
      this.debug(`Recieved Location Connection Status Change to ${connected}`);
      if(!connected && !apiClient.refreshing) {
        this.warn(`Lost connection to Location ${this._loc.name}... Will try a reconnect in 5s`);
        setTimeout(() => {
          this._client.refreshAll();
        }, 5000);
      }
    });
    this._loc.onLocationMode.subscribe((newMode) => {
      this.updateModeObject(newMode);
    });
    this.silly(`Location Debug Data: ${util.inspect(this._loc, false, 2)}`);
    this.recreateDeviceObjectTree();
    this.getLocationMode();
  }

  private async recreateDeviceObjectTree(): Promise<void> {
    this.silly(`Recreate LocationObjectTree`);
    this._adapter.createDevice(this._fullId, {
      name: `Location ${this.id} ("${this.name}")`
    });
    // this._adapter.createChannel(this._fullId, CHANNEL_NAME_INFO, {name: `Info ${this.id}`});
    this._adapter.upsertState(
      `${this._fullId}.${STATE_ID_DEBUG_REQUEST}`,
      COMMON_DEBUG_REQUEST,
      false,
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
    const targetVal = state.val as boolean;
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
    const parsedNumber = parseInt(state.val as string, 10);
    let desiredState;
    if(typeof desiredState == "number") {
      desiredState = LOCATION_MODE_OPTIONS[state.val as number];
    } else if(!isNaN(parsedNumber)) {
      desiredState = LOCATION_MODE_OPTIONS[state.val as number];
    } else {
      desiredState = state.val as string;
    }
    if(desiredState == this._currentLocationMode) {
      return;
    }
    if(["home", "away", "disarmed"].indexOf(desiredState) === -1) {
      this.updateModeObject(this._currentLocationMode, true);
      this.warn(`Invalid input "${desiredState}"... Only "home","away" and "disarmed" are chooseable by user.`);
      return;
    }
    this.debug(`Change Location Mode to ${desiredState}`)
    this._loc.setLocationMode(desiredState as LocationModeInput)
      .then((r) => {
        this.updateModeObject(r.mode);
      })
      .catch((reason) => { this._adapter.logCatch(`Failed setting location mode`, reason)});
  }

  private updateModeObject(newMode: LocationMode, preventLog = false): void {
    this._currentLocationMode = newMode;
    if(!preventLog) {
      this.silly(`Recieved new LocationMode: ${newMode}`)
    }
    this._adapter.upsertState(
      `${this._fullId}.locationMode`,
      COMMON_LOCATIONMODE,
      newMode,
      true
    );
  }

  private async getLocationMode(): Promise<void> {
    this._loc.getLocationMode()
      .then((r) => {
        this.updateModeObject(r.mode)
      })
      .catch((reason) => {
        this._adapter.logCatch("Couldn't retrieve Location Mode", reason);
      });
  }
}
