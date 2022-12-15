import { OwnRingDevice } from "./ownRingDevice";
import { IntercomHandsetAudioData, RingIntercom } from "ring-client-api";
import { OwnRingLocation } from "./ownRingLocation";
import { RingAdapter } from "../main";
import { RingApiClient } from "./ringApiClient";
import { COMMON_DEBUG_REQUEST, STATE_ID_DEBUG_REQUEST, } from "./constants";
import util from "util";

export class OwnRingIntercom extends OwnRingDevice {
  public constructor(ringDevice: RingIntercom, location: OwnRingLocation, adapter: RingAdapter, apiClient: RingApiClient) {
    super(
      location,
      adapter,
      apiClient,
      OwnRingDevice.evaluateKind(ringDevice.deviceType as string, adapter, ringDevice),
      `${ringDevice.id}`,
      ringDevice.data.description
    );
    this._ringDevice = ringDevice;
    this.debug(`Create device`);
  }

  private _ringDevice: RingIntercom;

  get ringDevice(): RingIntercom {
    return this._ringDevice;
  }

  private set ringDevice(device) {
    this._ringDevice = device;
    this.subscribeToEvents();
  }

  public processUserInput(channelID: string, stateID: string, state: ioBroker.State): void {
    switch (channelID) {
      case "":
        if (stateID !== STATE_ID_DEBUG_REQUEST) {
          return;
        }
        const targetVal = state.val as boolean;
        if (targetVal) {
          this._adapter.log.info(`Device Debug Data for ${this.shortId}: ${util.inspect(this._ringDevice, false, 1)}`);
          this._adapter.upsertState(
            `${this.fullId}.${STATE_ID_DEBUG_REQUEST}`,
            COMMON_DEBUG_REQUEST,
            false
          );
        }
        return;
      default:
        this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
    }
  }

  public updateByDevice(intercom: RingIntercom): void {
    this.ringDevice = intercom;
    this.update(intercom.data);
  }

  protected async recreateDeviceObjectTree(): Promise<void> {
    this.silly(`Recreate DeviceObjectTree`);
    this._adapter.createDevice(this.fullId, {
      name: `Device ${this.shortId} ("${this._ringDevice.data.description}")`
    });
    this._adapter.upsertState(
      `${this.fullId}.${STATE_ID_DEBUG_REQUEST}`,
      COMMON_DEBUG_REQUEST,
      false,
      true
    );
  }

  private update(_data: IntercomHandsetAudioData): void {
    // TODO: FIll
  }

  private subscribeToEvents(): void {
    // TODO: FIll
  }
}
