"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnRingDevice = void 0;
const ring_client_api_1 = require("ring-client-api");
const constants_1 = require("./constants");
const lastAction_1 = require("./lastAction");
class OwnRingDevice {
    constructor(ringDevice, locationIndex, adapter, apiClient) {
        this._adapter = adapter;
        this.debug(`Create device with ID: ${ringDevice.id}`);
        this._ringDevice = ringDevice;
        this._locationIndex = locationIndex;
        this._client = apiClient;
        this.path = `${this._locationIndex}.`;
        this.kind = OwnRingDevice.evaluateKind(ringDevice, adapter);
        this.shortId = `${ringDevice.id}`;
        this.fullId = `${this.kind}_${this.shortId}`;
        this.infoChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_INFO}`;
        this.historyChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_HISTORY}`;
        this.lightChannelId = `${this.fullId}.${constants_1.CHANNEL_NAME_LIGHT}`;
        this.recreateDeviceObjectTree();
        this.updateDeviceInfoObject();
        this.updateHealth();
        // noinspection JSIgnoredPromiseFromCall
        this.updateHistory();
    }
    static getFullId(device, adapter) {
        return `${this.evaluateKind(device, adapter)}_${device.id}`;
    }
    static evaluateKind(device, adapter) {
        switch (device.deviceType) {
            case ring_client_api_1.RingCameraKind.doorbot:
            case ring_client_api_1.RingCameraKind.doorbell:
            case ring_client_api_1.RingCameraKind.doorbell_v3:
            case ring_client_api_1.RingCameraKind.doorbell_v4:
            case ring_client_api_1.RingCameraKind.doorbell_v5:
            case ring_client_api_1.RingCameraKind.doorbell_portal:
            case ring_client_api_1.RingCameraKind.doorbell_scallop:
            case ring_client_api_1.RingCameraKind.doorbell_scallop_lite:
            case ring_client_api_1.RingCameraKind.hp_cam_v1:
            case ring_client_api_1.RingCameraKind.hp_cam_v2:
            case ring_client_api_1.RingCameraKind.lpd_v1:
            case ring_client_api_1.RingCameraKind.lpd_v2:
            case ring_client_api_1.RingCameraKind.floodlight_v1:
            case ring_client_api_1.RingCameraKind.floodlight_v2:
            case ring_client_api_1.RingCameraKind.spotlightw_v2:
            case ring_client_api_1.RingCameraKind.jbox_v1:
                return `doorbell`;
            case ring_client_api_1.RingCameraKind.cocoa_camera:
            case ring_client_api_1.RingCameraKind.cocoa_doorbell:
                return `cocoa`;
            case ring_client_api_1.RingCameraKind.stickup_cam:
            case ring_client_api_1.RingCameraKind.stickup_cam_v3:
            case ring_client_api_1.RingCameraKind.stickup_cam_v4:
            case ring_client_api_1.RingCameraKind.stickup_cam_mini:
            case ring_client_api_1.RingCameraKind.stickup_cam_lunar:
            case ring_client_api_1.RingCameraKind.stickup_cam_elite:
                return `stickup`;
            default:
                adapter.log.error(`Device with Type ${device.deviceType} not yet supported, please inform dev Team via Github`);
                adapter.log.debug(`Unsupported Device Info: ${JSON.stringify(device)}`);
        }
        return "unknown";
    }
    get locationIndex() {
        return this._locationIndex;
    }
    get location() {
        if (this._client.locations.length < this._locationIndex) {
            this._adapter.log.error(`Can't find a Location with index ${this._locationIndex}`);
            return undefined;
        }
        return this._client.locations[this._locationIndex];
    }
    get ringDevice() {
        return this._ringDevice;
    }
    processUserInput(channelID, stateID, state) {
        switch (channelID) {
            case "Light":
                if (!this._ringDevice.hasLight) {
                    return;
                }
                if (stateID === constants_1.STATE_ID_LIGHT_SWITCH) {
                    const targetVal = state.val;
                    this._adapter.log.debug(`Set light for ${this.shortId} to value ${targetVal}`);
                    this._ringDevice.setLight(targetVal).then((success) => {
                        if (success) {
                            this._adapter.upsertState(`${this.lightChannelId}.light_state`, constants_1.COMMON_LIGHT_STATE, targetVal);
                        }
                    });
                }
                else {
                    this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                }
                break;
            default:
                this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
        }
    }
    recreateDeviceObjectTree() {
        this.silly(`Recreate DeviceObjectTree for ${this.fullId}`);
        this._adapter.createDevice(this.fullId, {
            name: `Device ${this.shortId} ("${this._ringDevice.data.description}")`
        });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_INFO, { name: `Info ${this.shortId}` });
        this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_HISTORY);
        if (this._ringDevice.hasLight) {
            this.debug(`Device with Light Capabilities detected "${this.fullId}"`);
            this._adapter.createChannel(this.fullId, constants_1.CHANNEL_NAME_LIGHT, { name: `Light ${this.shortId}` });
        }
    }
    update(ringDevice) {
        this.debug(`Recieved Update for ${this.fullId}`);
        this._ringDevice = ringDevice;
        this.updateDeviceInfoObject();
        this.updateHealth();
        // noinspection JSIgnoredPromiseFromCall
        this.updateHistory();
    }
    updateHealth() {
        this.silly(`Update Health for ${this.fullId}`);
        this._ringDevice.getHealth().then(this.updateHealthObject.bind(this));
    }
    async updateHistory() {
        this.silly(`Update History for ${this.fullId}`);
        this._ringDevice.getEvents({ limit: 50 })
            .then(async (r) => {
            this.silly(`Recieved Event History for ${this.fullId}`);
            const lastAction = r.events.find((event) => {
                const kind = event.kind;
                switch (kind) {
                    case "motion":
                    case "ding":
                    case "alarm":
                    case "on_demand":
                        return true;
                }
                return false;
            });
            if (lastAction === undefined) {
                return;
            }
            const url = await this._ringDevice.getRecordingUrl(lastAction.ding_id_str);
            this.lastAction = new lastAction_1.LastAction(lastAction, url);
            this.updateHistoryObject(this.lastAction);
        });
    }
    updateDeviceInfoObject() {
        this._adapter.upsertState(`${this.infoChannelId}.id`, constants_1.COMMON_INFO_ID, this._ringDevice.data.device_id);
        this._adapter.upsertState(`${this.infoChannelId}.kind`, constants_1.COMMON_INFO_KIND, this._ringDevice.data.kind);
        this._adapter.upsertState(`${this.infoChannelId}.description`, constants_1.COMMON_INFO_DESCRIPTION, this._ringDevice.data.description);
        this._adapter.upsertState(`${this.infoChannelId}.external_connection`, constants_1.COMMON_INFO_EXTERNAL_CONNECTION, this._ringDevice.data.external_connection);
        this._adapter.upsertState(`${this.infoChannelId}.hasLight`, constants_1.COMMON_INFO_HAS_LIGHT, this._ringDevice.hasLight);
        this._adapter.upsertState(`${this.infoChannelId}.hasBattery`, constants_1.COMMON_INFO_HAS_BATTERY, this._ringDevice.hasBattery);
        this._adapter.upsertState(`${this.infoChannelId}.hasSiren`, constants_1.COMMON_INFO_HAS_SIREN, this._ringDevice.hasSiren);
    }
    updateHistoryObject(lastAction) {
        this._adapter.upsertState(`${this.historyChannelId}.created_at`, constants_1.COMMON_HISTORY_CREATED_AT, lastAction.event.created_at);
        this._adapter.upsertState(`${this.historyChannelId}.history_url`, constants_1.COMMON_HISTORY_URL, lastAction.historyUrl);
        this._adapter.upsertState(`${this.historyChannelId}.kind`, constants_1.COMMON_HISTORY_KIND, lastAction.event.kind);
    }
    updateHealthObject(health) {
        this.debug(`Update Health Callback for "${this.fullId}"`);
        this._adapter.upsertState(`${this.infoChannelId}.battery_percentage`, constants_1.COMMON_INFO_BATTERY_PERCENTAGE, health.battery_percentage);
        this._adapter.upsertState(`${this.infoChannelId}.battery_percentage_category`, constants_1.COMMON_INFO_BATTERY_PERCENTAGE_CATEGORY, health.battery_percentage_category);
        this._adapter.upsertState(`${this.infoChannelId}.wifi_name`, constants_1.COMMON_INFO_WIFI_NAME, health.wifi_name);
        this._adapter.upsertState(`${this.infoChannelId}.latest_signal_strength`, constants_1.COMMON_INFO_LATEST_SIGNAL_STRENGTH, health.latest_signal_strength);
        this._adapter.upsertState(`${this.infoChannelId}.latest_signal_category`, constants_1.COMMON_INFO_LATEST_SIGNAL_CATEGORY, health.latest_signal_category);
        this._adapter.upsertState(`${this.infoChannelId}.firmware`, constants_1.COMMON_INFO_FIRMWARE, health.firmware);
        if (this._ringDevice.hasLight) {
            // this.silly(JSON.stringify(this._ringDevice.data));
            const floodlightOn = this._ringDevice.data.health.floodlight_on;
            this.debug(`Update Light within Health Update for "${this.fullId}" FLoodlight is ${floodlightOn}`);
            this._adapter.upsertState(`${this.lightChannelId}.light_state`, constants_1.COMMON_LIGHT_STATE, floodlightOn);
            this._adapter.upsertState(`${this.lightChannelId}.${constants_1.STATE_ID_LIGHT_SWITCH}`, constants_1.COMMON_LIGHT_SWITCH, floodlightOn, true);
        }
    }
    debug(message) {
        this._adapter.log.debug(message);
    }
    silly(message) {
        this._adapter.log.silly(message);
    }
}
exports.OwnRingDevice = OwnRingDevice;
//# sourceMappingURL=ownRingDevice.js.map