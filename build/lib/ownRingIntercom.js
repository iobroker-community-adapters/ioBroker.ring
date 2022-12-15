'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
  return (mod && mod.__esModule) ? mod : {'default': mod};
};
Object.defineProperty(exports, '__esModule', {value: true});
exports.OwnRingIntercom = void 0;
const ownRingDevice_1 = require('./ownRingDevice');
const constants_1 = require('./constants');
const util_1 = __importDefault(require('util'));

class OwnRingIntercom extends ownRingDevice_1.OwnRingDevice {
  constructor(ringDevice, location, adapter, apiClient) {
    super(location, adapter, apiClient, ownRingDevice_1.OwnRingDevice.evaluateKind(ringDevice.deviceType, adapter, ringDevice), `${ringDevice.id}`, ringDevice.data.description);
    this._ringDevice = ringDevice;
    this.debug(`Create device`);
    this.infoChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_INFO}`;
    this.eventsChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_EVENTS}`;
    this.recreateDeviceObjectTree();
  }

  get ringDevice() {
    return this._ringDevice;
  }

  set ringDevice(device) {
    this._ringDevice = device;
    this.subscribeToEvents();
  }

  processUserInput(channelID, stateID, state) {
    switch (channelID) {
      case '':
        const targetBoolVal = state.val;
        switch (stateID) {
          case constants_1.STATE_ID_DEBUG_REQUEST:
            if (targetBoolVal) {
              this._adapter.log.info(`Device Debug Data for ${this.shortId}: ${util_1.default.inspect(this._ringDevice, false, 1)}`);
              this._adapter.upsertState(`${this.fullId}.${constants_1.STATE_ID_DEBUG_REQUEST}`, constants_1.COMMON_DEBUG_REQUEST, false);
            }
            break;
          case constants_1.STATE_ID_INTERCOM_UNLOCK:
            if (targetBoolVal) {
              this._adapter.log.info(`Unlock door request for ${this.shortId}.`);
              this._ringDevice.unlock().catch((reason) => {
                this.catcher('Couldn\'t unlock door.', reason);
              });
              this._adapter.upsertState(`${this.fullId}.${constants_1.STATE_ID_INTERCOM_UNLOCK}`, constants_1.COMMON_DEBUG_REQUEST, false);
            }
            break;
        }
        return;
      default:
        this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
    }
  }

  updateByDevice(intercom) {
    this.ringDevice = intercom;
    this.update(intercom.data);
  }

  async recreateDeviceObjectTree() {
    this.silly(`Recreate DeviceObjectTree`);
    this._adapter.createDevice(this.fullId, {
      name: `Device ${this.shortId} ("${this._ringDevice.data.description}")`
    });
    this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_INFO, {name: `Info ${this.shortId}`});
    this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_EVENTS);
    this._adapter.upsertState(`${this.fullId}.${constants_1.STATE_ID_DEBUG_REQUEST}`, constants_1.COMMON_DEBUG_REQUEST, false, true);
    this._adapter.upsertState(`${this.fullId}.${constants_1.STATE_ID_INTERCOM_UNLOCK}`, constants_1.COMMON_INTERCOM_UNLOCK_REQUEST, false, true);
  }

  update(data) {
    this.debug(`Recieved Update`);
    this.updateDeviceInfoObject(data);
  }

  async subscribeToEvents() {
    this.silly(`Start device subscriptions`);
    await this._ringDevice.subscribeToDingEvents().catch((r) => {
      this.catcher(`Failed subscribing to Ding Events for ${this._ringDevice.name}`, r);
    });
    this._ringDevice.onDing.subscribe({
      next: () => {
        this.onDing();
      },
      error: (err) => {
        this.catcher(`Ding Observer recieved error`, err);
      },
    });
  }

  updateDeviceInfoObject(data) {
    this._adapter.upsertState(`${this.infoChannelId}.id`, constants_1.COMMON_INFO_ID, data.device_id);
    this._adapter.upsertState(`${this.infoChannelId}.kind`, constants_1.COMMON_INFO_KIND, data.kind);
    this._adapter.upsertState(`${this.infoChannelId}.description`, constants_1.COMMON_INFO_DESCRIPTION, data.description);
  }

  onDing() {
    this.debug(`Recieved Ding Event`);
    this._adapter.upsertState(`${this.eventsChannelId}.ding`, constants_1.COMMON_EVENTS_INTERCOM_DING, true);
    setTimeout(() => {
      this._adapter.upsertState(`${this.eventsChannelId}.ding`, constants_1.COMMON_EVENTS_INTERCOM_DING, false);
    }, 5000);
  }
}

exports.OwnRingIntercom = OwnRingIntercom;
//# sourceMappingURL=ownRingIntercom.js.map
