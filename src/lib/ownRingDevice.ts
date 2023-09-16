import { RingAdapter } from "../main";
import { RingApiClient } from "./ringApiClient";
import { RingCamera, RingCameraKind, RingDeviceType, RingIntercom } from "ring-client-api";
import util from "util";
import { OwnRingLocation } from "./ownRingLocation";

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
    description: string
  ) {
    this._adapter = adapter;
    this._locationId = location.fullId;
    this._client = apiClient;
    this.kind = kind;
    this.shortId = shortId;
    this.fullId = `${this.kind}_${this.shortId}`
    this.description = description;
  }

  protected _locationId: string;

  get locationId(): string {
    return this._locationId;
  }

  public static getFullId(device: RingCamera | RingIntercom, adapter: RingAdapter): string {
    return `${this.evaluateKind(device.deviceType as string, adapter, device)}_${device.id}`;
  }

  public static evaluateKind(deviceType: string, adapter: RingAdapter, device: any): string {
    switch (deviceType) {
      case RingCameraKind.doorbot:
      case RingCameraKind.doorbell:
      case RingCameraKind.doorbell_v3:
      case RingCameraKind.doorbell_v4:
      case RingCameraKind.doorbell_v5:
      case RingCameraKind.doorbell_graham_cracker:
      case RingCameraKind.doorbell_portal:
      case RingCameraKind.doorbell_scallop:
      case RingCameraKind.doorbell_scallop_lite:
      case RingCameraKind.hp_cam_v1:
      case RingCameraKind.hp_cam_v2:
      case RingCameraKind.lpd_v1:
      case RingCameraKind.lpd_v2:
      case RingCameraKind.floodlight_v1:
      case RingCameraKind.floodlight_v2:
      case RingCameraKind.floodlight_pro:
      case RingCameraKind.spotlightw_v2:
      case RingCameraKind.jbox_v1:
      case "doorbell_oyster":
      case "lpd_v3":
      case "lpd_v4":
        return `doorbell`;
      case RingCameraKind.cocoa_camera:
      case RingCameraKind.cocoa_doorbell:
      case "cocoa_doorbell_v2":
      case RingCameraKind.cocoa_floodlight:
        return `cocoa`;
      case RingCameraKind.stickup_cam:
      case RingCameraKind.stickup_cam_v3:
      case RingCameraKind.stickup_cam_v4:
      case RingCameraKind.stickup_cam_mini:
      case RingCameraKind.stickup_cam_lunar:
      case RingCameraKind.stickup_cam_elite:
      case RingCameraKind.stickup_cam_longfin:
      case "stickup_cam_longfin":
        return `stickup`
      case RingDeviceType.IntercomHandsetAudio:
        return `intercom`
      default:
        adapter.log.error(
          `Device with Type ${deviceType} not yet supported, please inform dev Team via Github`
        );
        adapter.log.info(`Unsupported Device Info: ${util.inspect(device, false, 1)}`);
    }
    return "unknown";
  }

  public abstract processUserInput(channelID: string, stateID: string, state: ioBroker.State): void;

  protected abstract recreateDeviceObjectTree(): Promise<void>;

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
