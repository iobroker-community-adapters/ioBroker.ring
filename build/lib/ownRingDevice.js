"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnRingDevice = void 0;
const ring_client_api_1 = require("ring-client-api");
const util_1 = __importDefault(require("util"));
class OwnRingDevice {
    constructor(location, adapter, apiClient, kind, shortId, description) {
        this._adapter = adapter;
        this._locationId = location.fullId;
        this._client = apiClient;
        this.kind = kind;
        this.shortId = shortId;
        this.fullId = `${this.kind}_${this.shortId}`;
        this.description = description;
    }
    get locationId() {
        return this._locationId;
    }
    static getFullId(device, adapter) {
        return `${this.evaluateKind(device.deviceType, adapter, device)}_${device.id}`;
    }
    static evaluateKind(deviceType, adapter, device) {
        switch (deviceType) {
            case ring_client_api_1.RingCameraKind.doorbot:
            case ring_client_api_1.RingCameraKind.doorbell:
            case ring_client_api_1.RingCameraKind.doorbell_v3:
            case ring_client_api_1.RingCameraKind.doorbell_v4:
            case ring_client_api_1.RingCameraKind.doorbell_v5:
            case ring_client_api_1.RingCameraKind.doorbell_graham_cracker:
            case ring_client_api_1.RingCameraKind.doorbell_portal:
            case ring_client_api_1.RingCameraKind.doorbell_scallop:
            case ring_client_api_1.RingCameraKind.doorbell_scallop_lite:
            case ring_client_api_1.RingCameraKind.hp_cam_v1:
            case ring_client_api_1.RingCameraKind.hp_cam_v2:
            case ring_client_api_1.RingCameraKind.lpd_v1:
            case ring_client_api_1.RingCameraKind.lpd_v2:
            case ring_client_api_1.RingCameraKind.floodlight_v1:
            case ring_client_api_1.RingCameraKind.floodlight_v2:
            case ring_client_api_1.RingCameraKind.floodlight_pro:
            case ring_client_api_1.RingCameraKind.spotlightw_v2:
            case ring_client_api_1.RingCameraKind.jbox_v1:
            case "doorbell_oyster":
            case "lpd_v3":
            case "lpd_v4":
                return `doorbell`;
            case ring_client_api_1.RingCameraKind.cocoa_camera:
            case ring_client_api_1.RingCameraKind.cocoa_doorbell:
            case ring_client_api_1.RingCameraKind.cocoa_floodlight:
                return `cocoa`;
            case ring_client_api_1.RingCameraKind.stickup_cam:
            case ring_client_api_1.RingCameraKind.stickup_cam_v3:
            case ring_client_api_1.RingCameraKind.stickup_cam_v4:
            case ring_client_api_1.RingCameraKind.stickup_cam_mini:
            case ring_client_api_1.RingCameraKind.stickup_cam_lunar:
            case ring_client_api_1.RingCameraKind.stickup_cam_elite:
            case ring_client_api_1.RingCameraKind.stickup_cam_longfin:
                return `stickup`;
            case ring_client_api_1.RingDeviceType.IntercomHandsetAudio:
                return `intercom`;
            default:
                adapter.log.error(`Device with Type ${deviceType} not yet supported, please inform dev Team via Github`);
                adapter.log.info(`Unsupported Device Info: ${util_1.default.inspect(device, false, 1)}`);
        }
        return "unknown";
    }
    debug(message) {
        this._adapter.log.debug(`Device ${this.shortId} ("${this.description}"): ${message}`);
    }
    silly(message) {
        this._adapter.log.silly(`Device ${this.shortId} ("${this.description}"): ${message}`);
    }
    info(message) {
        this._adapter.log.info(`Device ${this.shortId} ("${this.description}"): ${message}`);
    }
    catcher(message, reason) {
        this._adapter.logCatch(message, reason);
    }
}
exports.OwnRingDevice = OwnRingDevice;
//# sourceMappingURL=ownRingDevice.js.map