import type { RingCamera, RingIntercom } from 'ring-client-api' with { 'resolution-mode': 'import' };

import type { RingAdapter } from '../main';
import type { RingApiClient } from './ringApiClient';
import type { OwnRingLocation } from './ownRingLocation';

export abstract class OwnRingDevice {
    protected fullId: string;
    protected kind: string;
    protected shortId: string;
    protected description: string;

    protected _adapter: RingAdapter;
    protected _client: RingApiClient;

    protected constructor(
        location: OwnRingLocation,
        adapter: RingAdapter,
        apiClient: RingApiClient,
        kind: string,
        shortId: string,
        description: string,
    ) {
        this._adapter = adapter;
        this._locationId = location.fullId;
        this._client = apiClient;
        this.kind = kind;
        this.shortId = shortId;
        this.fullId = `${this.kind}_${this.shortId}`;
        this.description = description;
    }

    protected _locationId: string;

    public get locationId(): string {
        return this._locationId;
    }

    public static getFullId(device: RingCamera | RingIntercom, adapter: RingAdapter): string {
        return `${this.evaluateKind(device.deviceType as string, adapter, device)}_${device.id}`;
    }

    /**
     * The device types below are spelled out as string literals on purpose: "ring-client-api" is
     * ESM only, so its `RingCameraKind` / `RingDeviceType` constants cannot be require()d from
     * this synchronous static method. The literals are the exact values of those constants, plus
     * the kinds Ring ships before the library knows about them.
     */
    public static evaluateKind(deviceType: string, adapter: RingAdapter, device: any): string {
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
                adapter.log.error(
                    `Device with Type ${deviceType} not yet supported, please inform dev Team via Github`,
                );
                adapter.log.info(
                    `Unsupported Device Info: id=${device?.id}, ` +
                        `model=${device?.model ?? 'unknown'}, ` +
                        `description=${device?.data?.description ?? 'unknown'}, ` +
                        `hasSiren=${device?.hasSiren ?? 'unknown'}, hasLight=${device?.hasLight ?? 'unknown'}`,
                );
        }
        return 'unknown';
    }

    public abstract processUserInput(channelID: string, stateID: string, state: ioBroker.State): void;

    protected abstract recreateDeviceObjectTree(): Promise<void>;

    protected error(message: string): void {
        this._adapter.log.error(`Device ${this.shortId} ("${this.description}"): ${message}`);
    }
    protected debug(message: string): void {
        this._adapter.log.debug(`Device ${this.shortId} ("${this.description}"): ${message}`);
    }

    protected silly(message: string): void {
        this._adapter.log.silly(`Device ${this.shortId} ("${this.description}"): ${message}`);
    }

    protected info(message: string): void {
        this._adapter.log.info(`Device ${this.shortId} ("${this.description}"): ${message}`);
    }

    protected warn(message: string): void {
        this._adapter.log.warn(`Device ${this.shortId} ("${this.description}"): ${message}`);
    }

    protected catcher(message: string, reason: any): void {
        this._adapter.logCatch(message, reason);
    }
}
