"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnRingIntercom = void 0;
const util_1 = __importDefault(require("util"));
const ownRingDevice_1 = require("./ownRingDevice");
const event_blocker_1 = require("./services/event-blocker");
const constants_1 = require("./constants");
class OwnRingIntercom extends ownRingDevice_1.OwnRingDevice {
    constructor(ringDevice, location, adapter, apiClient) {
        super(location, adapter, apiClient, ownRingDevice_1.OwnRingDevice.evaluateKind(ringDevice.deviceType, adapter, ringDevice), `${ringDevice.id}`, ringDevice.data.description);
        // Initialize event blocker to manage ding events
        this._dingEventBlocker = new event_blocker_1.EventBlocker(this._adapter.config.ignore_events_Doorbell, this._adapter.config.keep_ignoring_if_retriggered);
        this._ringIntercom = ringDevice;
        this.infoChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_INFO}`;
        this.eventsChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_EVENTS}`;
        // Create the device object tree in ioBroker
        this.recreateDeviceObjectTree();
        // Subscribe to events from the intercom
        this.subscribeToEvents();
        // Subscribe to data changes from the intercom
        this._ringIntercom.onData.subscribe({
            next: (data) => {
                this.update(data);
            },
            error: (err) => {
                this.catcher(`Data Observer received error`, err);
            },
        });
        // Subscribe to battery level changes
        this._ringIntercom.onBatteryLevel.subscribe({
            next: () => {
                this.updateBatteryInfo();
            },
            error: (err) => {
                this.catcher(`Battery Level Observer received error`, err);
            },
        });
    }
    processUserInput(channelID, stateID, state) {
        switch (channelID) {
            case "":
                const targetBoolVal = state.val;
                switch (stateID) {
                    case constants_1.STATE_ID_DEBUG_REQUEST:
                        if (targetBoolVal) {
                            this.info(`Device Debug Data for ${this.shortId}: ${util_1.default.inspect(this._ringIntercom, false, 1)}`);
                            this._adapter.upsertState(`${this.fullId}.${constants_1.STATE_ID_DEBUG_REQUEST}`, constants_1.COMMON_DEBUG_REQUEST, false);
                        }
                        break;
                    case constants_1.STATE_ID_INTERCOM_UNLOCK:
                        if (targetBoolVal) {
                            this.info(`Unlock door request for ${this.shortId}.`);
                            this._ringIntercom.unlock().catch((reason) => {
                                this.catcher("Couldn't unlock door.", reason);
                            });
                            this._adapter.upsertState(`${this.fullId}.${constants_1.STATE_ID_INTERCOM_UNLOCK}`, constants_1.COMMON_INTERCOM_UNLOCK_REQUEST, false);
                        }
                        break;
                    default:
                        this.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                }
                return;
            default:
                this.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
        }
    }
    updateByDevice(intercom) {
        this._ringIntercom = intercom;
        this.subscribeToEvents();
        this.update(intercom.data);
    }
    async recreateDeviceObjectTree() {
        this.silly(`Recreate DeviceObjectTree`);
        this._adapter.createDevice(this.fullId, {
            name: `Device ${this.shortId} ("${this._ringIntercom.data.description}")`,
        });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_INFO, {
            name: `Info ${this.shortId}`,
        });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_EVENTS);
        // Create states in the Info channel
        await this._adapter.upsertState(`${this.infoChannelId}.id`, constants_1.COMMON_INFO_ID, this._ringIntercom.data.device_id);
        await this._adapter.upsertState(`${this.infoChannelId}.kind`, constants_1.COMMON_INFO_KIND, this._ringIntercom.data.kind);
        await this._adapter.upsertState(`${this.infoChannelId}.description`, constants_1.COMMON_INFO_DESCRIPTION, this._ringIntercom.data.description);
        // Firmware version might be available under 'firmware_version'
        await this._adapter.upsertState(`${this.infoChannelId}.firmware`, constants_1.COMMON_INFO_FIRMWARE, this._ringIntercom.data.firmware_version);
        // Create battery data points
        await this._adapter.upsertState(`${this.infoChannelId}.battery_percentage`, constants_1.COMMON_INFO_BATTERY_PERCENTAGE, null);
        await this._adapter.upsertState(`${this.infoChannelId}.battery_percentage_category`, constants_1.COMMON_INFO_BATTERY_PERCENTAGE_CATEGORY, null);
        // Create states in the Events channel
        await this._adapter.upsertState(`${this.eventsChannelId}.ding`, constants_1.COMMON_EVENTS_INTERCOM_DING, false);
        // Create states for debug and unlock requests
        await this._adapter.upsertState(`${this.fullId}.${constants_1.STATE_ID_DEBUG_REQUEST}`, constants_1.COMMON_DEBUG_REQUEST, false, true, true);
        await this._adapter.upsertState(`${this.fullId}.${constants_1.STATE_ID_INTERCOM_UNLOCK}`, constants_1.COMMON_INTERCOM_UNLOCK_REQUEST, false, true, true);
    }
    update(data) {
        this.debug(`Received Update`);
        this.updateDeviceInfoObject(data);
        this.updateBatteryInfo();
    }
    updateDeviceInfoObject(data) {
        this._adapter.upsertState(`${this.infoChannelId}.id`, constants_1.COMMON_INFO_ID, data.device_id);
        this._adapter.upsertState(`${this.infoChannelId}.kind`, constants_1.COMMON_INFO_KIND, data.kind);
        this._adapter.upsertState(`${this.infoChannelId}.description`, constants_1.COMMON_INFO_DESCRIPTION, data.description);
        // Update firmware version if available
        this._adapter.upsertState(`${this.infoChannelId}.firmware`, constants_1.COMMON_INFO_FIRMWARE, data.firmware_version);
    }
    updateBatteryInfo() {
        const batteryLevel = this._ringIntercom.batteryLevel;
        let batteryPercentage = -1;
        if (batteryLevel !== null && batteryLevel !== undefined) {
            batteryPercentage = batteryLevel;
        }
        // Update battery percentage state
        this._adapter.upsertState(`${this.infoChannelId}.battery_percentage`, constants_1.COMMON_INFO_BATTERY_PERCENTAGE, batteryPercentage);
        // Determine battery category based on percentage
        let batteryCategory = "Unknown";
        if (batteryPercentage >= 75) {
            batteryCategory = "Full";
        }
        else if (batteryPercentage >= 50) {
            batteryCategory = "High";
        }
        else if (batteryPercentage >= 25) {
            batteryCategory = "Medium";
        }
        else if (batteryPercentage >= 0) {
            batteryCategory = "Low";
        }
        // Update battery category state
        this._adapter.upsertState(`${this.infoChannelId}.battery_percentage_category`, constants_1.COMMON_INFO_BATTERY_PERCENTAGE_CATEGORY, batteryCategory);
    }
    async subscribeToEvents() {
        this.silly(`Start device subscriptions`);
        await this._ringIntercom
            .subscribeToDingEvents()
            .catch((r) => {
            this.catcher(`Failed subscribing to Ding Events for ${this._ringIntercom.name}`, r);
        });
        this._ringIntercom.onDing.subscribe({
            next: () => {
                this.onDing();
            },
            error: (err) => {
                this.catcher(`Ding Observer received error`, err);
            },
        });
    }
    onDing() {
        if (this._dingEventBlocker.checkBlock()) {
            this.debug(`Ignore Ding event...`);
            return;
        }
        this.debug(`Received Ding Event`);
        this._adapter.upsertState(`${this.eventsChannelId}.ding`, constants_1.COMMON_EVENTS_INTERCOM_DING, true);
        setTimeout(() => {
            this._adapter.upsertState(`${this.eventsChannelId}.ding`, constants_1.COMMON_EVENTS_INTERCOM_DING, false);
        }, 1000);
    }
}
exports.OwnRingIntercom = OwnRingIntercom;
//# sourceMappingURL=ownRingIntercom.js.map