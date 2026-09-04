"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnRingDevice = void 0;
class OwnRingDevice {
    fullId;
    kind;
    shortId;
    description;
    _adapter;
    _client;
    constructor(location, adapter, apiClient, kind, shortId, description) {
        this._adapter = adapter;
        this._locationId = location.fullId;
        this._client = apiClient;
        this.kind = kind;
        this.shortId = shortId;
        this.fullId = `${this.kind}_${this.shortId}`;
        this.description = description;
    }
    _locationId;
    get locationId() {
        return this._locationId;
    }
    static getFullId(device, adapter) {
        return `${this.evaluateKind(device.deviceType, adapter, device)}_${device.id}`;
    }
    /**
     * The device types below are spelled out as string literals on purpose: "ring-client-api" is
     * ESM only, so its `RingCameraKind` / `RingDeviceType` constants cannot be require()d from
     * this synchronous static method. The literals are the exact values of those constants, plus
     * the kinds Ring ships before the library knows about them.
     */
    static evaluateKind(deviceType, adapter, device) {
        switch (deviceType) {
            case 'doorbot':
            case 'doorbell':
            case 'doorbell_v3':
            case 'doorbell_v4':
            case 'doorbell_v5':
            case 'doorbell_oyster':
            case 'doorbell_portal':
            case 'doorbell_scallop':
            case 'doorbell_scallop_lite':
            case 'doorbell_graham_cracker':
            case 'hp_cam_v1':
            case 'hp_cam_v2':
            case 'lpd_v1':
            case 'lpd_v2':
            case 'lpd_v4':
            case 'floodlight_v1':
            case 'floodlight_v2':
            case 'floodlight_pro':
            case 'spotlightw_v2':
            case 'jbox_v1':
            case 'doorbell_sunray':
            case 'df_doorbell_clownfish':
            case 'lpd_v3':
                return `doorbell`;
            case 'cocoa_camera':
            case 'cocoa_doorbell':
            case 'cocoa_doorbell_v2':
            case 'cocoa_doorbell_v3':
            case 'cocoa_floodlight':
                return `cocoa`;
            case 'stickup_cam':
            case 'stickup_cam_v3':
            case 'stickup_cam_v4':
            case 'stickup_cam_mini':
            case 'stickup_cam_lunar':
            case 'stickup_cam_elite':
            case 'stickup_cam_longfin':
            case 'stickup_cam_mini_ptz_v1':
            case 'stickup_cam_mini_v2':
            case 'stickup_cam_medusa':
                return `stickup`;
            case 'intercom_handset_audio':
                return `intercom`;
            default:
                adapter.log.error(`Device with Type ${deviceType} not yet supported, please inform dev Team via Github`);
                adapter.log.info(`Unsupported Device Info: id=${device?.id}, ` +
                    `model=${device?.model ?? 'unknown'}, ` +
                    `description=${device?.data?.description ?? 'unknown'}, ` +
                    `hasSiren=${device?.hasSiren ?? 'unknown'}, hasLight=${device?.hasLight ?? 'unknown'}`);
        }
        return 'unknown';
    }
    error(message) {
        this._adapter.log.error(`Device ${this.shortId} ("${this.description}"): ${message}`);
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
    warn(message) {
        this._adapter.log.warn(`Device ${this.shortId} ("${this.description}"): ${message}`);
    }
    catcher(message, reason) {
        this._adapter.logCatch(message, reason);
    }
}
exports.OwnRingDevice = OwnRingDevice;
//# sourceMappingURL=ownRingDevice.js.map