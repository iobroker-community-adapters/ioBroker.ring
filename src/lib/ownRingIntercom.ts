import { OwnRingDevice } from "./ownRingDevice";
import { IntercomHandsetAudioData, RingIntercom } from "ring-client-api";
import { OwnRingLocation } from "./ownRingLocation";
import { RingAdapter } from "../main";
import { RingApiClient } from "./ringApiClient";
import {
  CHANNEL_NAME_EVENTS,
  CHANNEL_NAME_INFO,
  COMMON_DEBUG_REQUEST,
  COMMON_EVENTS_INTERCOM_DING,
  COMMON_INFO_DESCRIPTION,
  COMMON_INFO_ID,
  COMMON_INFO_KIND,
  COMMON_INTERCOM_UNLOCK_REQUEST,
  STATE_ID_DEBUG_REQUEST,
  STATE_ID_INTERCOM_UNLOCK,
} from "./constants";
import util from "util";

export class OwnRingIntercom extends OwnRingDevice {
  private readonly infoChannelId: string;
  private readonly eventsChannelId: string;

  public constructor(ringDevice: RingIntercom, location: OwnRingLocation, adapter: RingAdapter, apiClient: RingApiClient) {
    super(
      location,
      adapter,
      apiClient,
      OwnRingDevice.evaluateKind(ringDevice.deviceType as string, adapter, ringDevice),
      `${ringDevice.id}`,
      ringDevice.data.description
    );
    this._ringIntercom = ringDevice;
    this.subscribeToEvents();
    this.infoChannelId = `${this.fullId}.${CHANNEL_NAME_INFO}`;
    this.eventsChannelId = `${this.fullId}.${CHANNEL_NAME_EVENTS}`;

    this.recreateDeviceObjectTree()
  }

  private _ringIntercom: RingIntercom;

  get ringIntercom(): RingIntercom {
    return this._ringIntercom;
  }

  private set ringIntercom(device) {
    this._ringIntercom = device;
    this.subscribeToEvents();
  }

  public processUserInput(channelID: string, stateID: string, state: ioBroker.State): void {
    switch (channelID) {
      case "":
        const targetBoolVal = state.val as boolean;
        switch (stateID) {
          case STATE_ID_DEBUG_REQUEST:
            if (targetBoolVal) {
              this._adapter.log.info(`Device Debug Data for ${this.shortId}: ${util.inspect(this._ringIntercom, false, 1)}`);
              this._adapter.upsertState(
                `${this.fullId}.${STATE_ID_DEBUG_REQUEST}`,
                COMMON_DEBUG_REQUEST,
                false
              );
            }
            break;
          case STATE_ID_INTERCOM_UNLOCK:
            if (targetBoolVal) {
              this._adapter.log.info(`Unlock door request for ${this.shortId}.`);
              this._ringIntercom.unlock().catch((reason) => {
                this.catcher("Couldn't unlock door.", reason);
              });
              this._adapter.upsertState(
                `${this.fullId}.${STATE_ID_INTERCOM_UNLOCK}`,
                COMMON_DEBUG_REQUEST,
                false
              );
            }
            break;
        }
        return;
      default:
        this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
    }
  }

  public updateByDevice(intercom: RingIntercom): void {
    this.ringIntercom = intercom;
    this.update(intercom.data);
  }

  protected async recreateDeviceObjectTree(): Promise<void> {
    this.silly(`Recreate DeviceObjectTree`);
    this._adapter.createDevice(this.fullId, {
      name: `Device ${this.shortId} ("${this._ringIntercom.data.description}")`
    });
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_INFO, {name: `Info ${this.shortId}`});
    this._adapter.createChannel(this.fullId, CHANNEL_NAME_EVENTS);
    this._adapter.upsertState(
      `${this.fullId}.${STATE_ID_DEBUG_REQUEST}`,
      COMMON_DEBUG_REQUEST,
      false,
      true
    );
    this._adapter.upsertState(
      `${this.fullId}.${STATE_ID_INTERCOM_UNLOCK}`,
      COMMON_INTERCOM_UNLOCK_REQUEST,
      false,
      true
    );
  }

  private update(data: IntercomHandsetAudioData): void {
    this.debug(`Recieved Update`);
    this.updateDeviceInfoObject(data);
  }

  private async subscribeToEvents(): Promise<void> {
    this.silly(`Start device subscriptions`);
    await this._ringIntercom.subscribeToDingEvents().catch((r) => {
      this.catcher(`Failed subscribing to Ding Events for ${this._ringIntercom.name}`, r);
    });
    this._ringIntercom.onDing.subscribe(
      {
        next: () => {
          this.onDing()
        },
        error: (err: Error) => {
          this.catcher(`Ding Observer recieved error`, err)
        },
      }
    )
  }

  private updateDeviceInfoObject(data: IntercomHandsetAudioData): void {
    this._adapter.upsertState(
      `${this.infoChannelId}.id`,
      COMMON_INFO_ID,
      data.device_id
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.kind`,
      COMMON_INFO_KIND,
      data.kind as string
    );
    this._adapter.upsertState(
      `${this.infoChannelId}.description`,
      COMMON_INFO_DESCRIPTION,
      data.description
    );
  }

  private onDing(): void {
    this.debug(`Recieved Ding Event`);
    this._adapter.upsertState(`${this.eventsChannelId}.ding`, COMMON_EVENTS_INTERCOM_DING, true);
    setTimeout(() => {
      this._adapter.upsertState(`${this.eventsChannelId}.ding`, COMMON_EVENTS_INTERCOM_DING, false);
    }, 100);
  }
}
