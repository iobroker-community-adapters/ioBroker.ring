import {Location} from "ring-client-api/lib/api/location";
import {CameraEvent, CameraEventResponse, CameraHealth, DingKind, RingCamera, RingCameraKind} from "ring-client-api";
import {RingAdapter} from "../main";
import {RingApiClient} from "./ringApiClient";
import {
    COMMON_HISTORY_CREATED_AT, COMMON_HISTORY_KIND,
    COMMON_HISTORY_URL,
    COMMON_INFO_BATTERY_PERCENTAGE,
    COMMON_INFO_BATTERY_PERCENTAGE_CATEGORY,
    COMMON_INFO_DESCRIPTION,
    COMMON_INFO_EXTERNAL_CONNECTION,
    COMMON_INFO_FIRMWARE, COMMON_INFO_HAS_BATTERY, COMMON_INFO_HAS_LIGHT, COMMON_INFO_HAS_SIREN,
    COMMON_INFO_ID,
    COMMON_INFO_KIND,
    COMMON_INFO_LATEST_SIGNAL_CATEGORY,
    COMMON_INFO_LATEST_SIGNAL_STRENGTH,
    COMMON_INFO_WIFI_NAME
} from "./constants";
import {LastAction} from "./lastAction";

export class OwnRingDevice {
    private fullId: string;
    private infoChannelId: string;
    private historyChannelId: string;
    private kind: string;
    private lightChannelId: string;
    private path: string;
    private shortId: string;

    private _adapter: RingAdapter;
    private _client: RingApiClient;
    private _locationIndex: number;
    private _ringDevice: RingCamera;
    private lastAction: LastAction | undefined;


    get locationIndex(): number {
        return this._locationIndex;
    }

    get location(): Location | undefined {
        if (this._client.locations.length < this._locationIndex) {
            this._adapter.log.error(`Can't find a Location with index ${this._locationIndex}`);
            return undefined;
        }
        return this._client.locations[this._locationIndex];
    }

    get ringDevice(): RingCamera {
        return this._ringDevice;
    }

    public constructor(ringDevice: RingCamera, locationIndex: number, adapter: RingAdapter, apiClient: RingApiClient) {
        this._adapter = adapter;
        this.debug(`Create device with ID: ${ringDevice.id}`);
        this._ringDevice = ringDevice;
        this._locationIndex = locationIndex;
        this._client = apiClient;
        this.path = `${this._locationIndex}.`
        this.kind = this.evaluateKind();
        this.shortId = `${ringDevice.id}`;
        this.fullId = `${this.kind}_${this.shortId}`;
        this.infoChannelId = `${this.fullId}.Info`;
        this.historyChannelId = `${this.fullId}.History`;
        this.lightChannelId = `${this.fullId}.Light`;
        this.recreateDeviceObjectTree();
        this.updateDeviceInfoObject();
        this.updateHealth();

        // noinspection JSIgnoredPromiseFromCall
        this.updateHistory();
    }

    public update(ringDevice: RingCamera) {
        this._ringDevice = ringDevice;
    }

    private recreateDeviceObjectTree() {
        this.silly(`Recreate DeviceObjectTree for ${this.fullId}`);
        this._adapter.deleteDevice(this.fullId);
        this._adapter.createDevice(this.fullId, {
            name: `Device ${this.shortId} ("${this._ringDevice.data.description}")`
        });
        this._adapter.createChannel(this.infoChannelId, `Info ${this.shortId}`);
        this._adapter.createChannel(this.historyChannelId, `History`);
        if (this._ringDevice.hasLight) {
            this._adapter.createChannel(this.lightChannelId, `Light ${this.shortId}`);
        }
    }

    public updateHealth() {
        this.silly(`Update Health for ${this.fullId}`);
        this._ringDevice.getHealth().then(this.updateHealthObject.bind(this))
    }

    public async updateHistory() {
        this.silly(`Update History for ${this.fullId}`);
        this._ringDevice.getEvents({limit: 50})
            .then(async (r: CameraEventResponse) => {
                this.silly(`Recieved Event History for ${this.fullId}`);
                const lastAction = r.events.find((event) => {
                    const kind: DingKind = event.kind;
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
                this.lastAction = new LastAction(lastAction, url)
                this.updateHistoryObject(this.lastAction);
            });
    }

    private updateDeviceInfoObject() {
        this._adapter.upsertState(
            `${this.infoChannelId}.id`,
            COMMON_INFO_ID,
            this._ringDevice.data.device_id
        );
        this._adapter.upsertState(
            `${this.infoChannelId}.kind`,
            COMMON_INFO_KIND,
            this._ringDevice.data.kind
        );
        this._adapter.upsertState(
            `${this.infoChannelId}.description`,
            COMMON_INFO_DESCRIPTION,
            this._ringDevice.data.description
        );
        this._adapter.upsertState(
            `${this.infoChannelId}.external_connection`,
            COMMON_INFO_EXTERNAL_CONNECTION,
            this._ringDevice.data.external_connection
        );
        this._adapter.upsertState(
            `${this.infoChannelId}.hasLight`,
            COMMON_INFO_HAS_LIGHT,
            this._ringDevice.hasLight
        );
        this._adapter.upsertState(
            `${this.infoChannelId}.hasBattery`,
            COMMON_INFO_HAS_BATTERY,
            this._ringDevice.hasBattery
        );
        this._adapter.upsertState(
            `${this.infoChannelId}.hasSiren`,
            COMMON_INFO_HAS_SIREN,
            this._ringDevice.hasSiren
        );
    }

    private updateHistoryObject(lastAction: LastAction) {
        this._adapter.upsertState(
            `${this.historyChannelId}.created_at`,
            COMMON_HISTORY_CREATED_AT,
            lastAction.event.created_at
        );
        this._adapter.upsertState(
            `${this.historyChannelId}.history_url`,
            COMMON_HISTORY_URL,
            lastAction.historyUrl
        );
        this._adapter.upsertState(
            `${this.historyChannelId}.kind`,
            COMMON_HISTORY_KIND,
            lastAction.event.kind
        );
    }

    private updateHealthObject(health: CameraHealth) {
        this._adapter.upsertState(
            `${this.infoChannelId}.battery_percentage`,
            COMMON_INFO_BATTERY_PERCENTAGE,
            health.battery_percentage
        );
        this._adapter.upsertState(
            `${this.infoChannelId}.battery_percentage_category`,
            COMMON_INFO_BATTERY_PERCENTAGE_CATEGORY,
            health.battery_percentage_category
        );
        this._adapter.upsertState(
            `${this.infoChannelId}.wifi_name`,
            COMMON_INFO_WIFI_NAME,
            health.wifi_name
        );
        this._adapter.upsertState(
            `${this.infoChannelId}.latest_signal_strength`,
            COMMON_INFO_LATEST_SIGNAL_STRENGTH,
            health.latest_signal_strength
        );
        this._adapter.upsertState(
            `${this.infoChannelId}.latest_signal_category`,
            COMMON_INFO_LATEST_SIGNAL_CATEGORY,
            health.latest_signal_category
        );
        this._adapter.upsertState(
            `${this.infoChannelId}.firmware`,
            COMMON_INFO_FIRMWARE,
            health.firmware
        );
    }

    private evaluateKind(): string {
        switch (this.ringDevice.deviceType) {
            case RingCameraKind.doorbot:
            case RingCameraKind.doorbell:
            case RingCameraKind.doorbell_v3:
            case RingCameraKind.doorbell_v4:
            case RingCameraKind.doorbell_v5:
            case RingCameraKind.doorbell_portal:
            case RingCameraKind.doorbell_scallop:
            case RingCameraKind.doorbell_scallop_lite:
            case RingCameraKind.hp_cam_v1:
            case RingCameraKind.hp_cam_v2:
            case RingCameraKind.lpd_v1:
            case RingCameraKind.lpd_v2:
            case RingCameraKind.floodlight_v1:
            case RingCameraKind.floodlight_v2:
            case RingCameraKind.spotlightw_v2:
            case RingCameraKind.jbox_v1:
                return `doorbell`;
            case RingCameraKind.cocoa_camera:
            case RingCameraKind.cocoa_doorbell:
                return `cocoa`;
            case RingCameraKind.stickup_cam:
            case RingCameraKind.stickup_cam_v3:
            case RingCameraKind.stickup_cam_v4:
            case RingCameraKind.stickup_cam_mini:
            case RingCameraKind.stickup_cam_lunar:
            case RingCameraKind.stickup_cam_elite:
                return `stickup`
            default:
                this._adapter.log.error(
                    `Device with Type ${this.ringDevice.deviceType} not yet supported, please inform dev Team via Github`
                );
                this._adapter.log.debug(`Unsupported Device Info: ${JSON.stringify(this._ringDevice)}`);
        }
        return "unknown";
    }

    private debug(message: string) {
        this._adapter.log.debug(message);
    }

    private silly(message: string) {
        this._adapter.log.silly(message);
    }
}


