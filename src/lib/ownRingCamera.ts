import type {
    AnyCameraData,
    CameraData,
    CameraEvent,
    CameraEventResponse,
    CameraHealth,
    DingKind,
    PushNotificationDingV2,
    RingCamera,
} from 'ring-client-api' with { 'resolution-mode': 'import' };
import * as rxjs from 'rxjs';
import * as fs from 'node:fs';
import * as util from 'node:util';
import type Sharp from 'sharp';
import strftime from 'strftime';
import schedule from 'node-schedule';
import type { ExtendedResponse } from 'ring-client-api/rest-client' with { 'resolution-mode': 'import' };

import type { RingAdapter } from '../main';
import type { RingApiClient } from './ringApiClient';
import {
    CHANNEL_NAME_EVENTS,
    CHANNEL_NAME_HDSNAPSHOT,
    CHANNEL_NAME_HISTORY,
    CHANNEL_NAME_INFO,
    CHANNEL_NAME_LIGHT,
    CHANNEL_NAME_SIREN,
    CHANNEL_NAME_LIVESTREAM,
    CHANNEL_NAME_SNAPSHOT,
    COMMON_DEBUG_REQUEST,
    COMMON_EVENTS_DETECTIONTYPE,
    COMMON_EVENTS_DOORBELL,
    COMMON_EVENTS_MESSAGE,
    COMMON_EVENTS_MOMENT,
    COMMON_EVENTS_TYPE,
    COMMON_HDSNAPSHOT_AUTO,
    COMMON_HDSNAPSHOT_FILE,
    COMMON_HDSNAPSHOT_MOMENT,
    COMMON_HDSNAPSHOT_REQUEST,
    COMMON_HDSNAPSHOT_URL,
    COMMON_HISTORY_CREATED_AT,
    COMMON_HISTORY_KIND,
    COMMON_HISTORY_URL,
    COMMON_INFO_BATTERY_PERCENTAGE,
    COMMON_INFO_BATTERY_PERCENTAGE_CATEGORY,
    COMMON_INFO_SECOND_BATTERY_PERCENTAGE,
    COMMON_INFO_SECOND_BATTERY_PERCENTAGE_CATEGORY,
    COMMON_INFO_DESCRIPTION,
    COMMON_INFO_EXTERNAL_CONNECTION,
    COMMON_INFO_FIRMWARE,
    COMMON_INFO_HAS_BATTERY,
    COMMON_INFO_HAS_LIGHT,
    COMMON_INFO_HAS_SIREN,
    COMMON_INFO_ID,
    COMMON_INFO_KIND,
    COMMON_INFO_LATEST_SIGNAL_CATEGORY,
    COMMON_INFO_LATEST_SIGNAL_STRENGTH,
    COMMON_INFO_WIFI_NAME,
    COMMON_LIGHT_STATE,
    COMMON_LIGHT_SWITCH,
    COMMON_SIREN_SWITCH,
    COMMON_LIVESTREAM_AUTO,
    COMMON_LIVESTREAM_DURATION,
    COMMON_LIVESTREAM_FILE,
    COMMON_LIVESTREAM_MOMENT,
    COMMON_LIVESTREAM_REQUEST,
    COMMON_LIVESTREAM_URL,
    COMMON_MOTION,
    COMMON_ON_DEMAND,
    COMMON_SNAPSHOT_AUTO,
    COMMON_SNAPSHOT_FILE,
    COMMON_SNAPSHOT_MOMENT,
    COMMON_SNAPSHOT_REQUEST,
    COMMON_SNAPSHOT_URL,
    STATE_ID_DEBUG_REQUEST,
    STATE_ID_HDSNAPSHOT_REQUEST,
    STATE_ID_LIGHT_SWITCH,
    STATE_ID_SIREN_SWITCH,
    STATE_ID_LIVESTREAM_DURATION,
    STATE_ID_LIVESTREAM_REQUEST,
    STATE_ID_SNAPSHOT_REQUEST,
} from './constants';
import { LastAction } from './lastAction';
import { FileService } from './services/file-service';
import type { OwnRingLocation } from './ownRingLocation';
import { OwnRingDevice } from './ownRingDevice';
import type { FileInfo } from './services/file-info';
import type { StreamingSession } from 'ring-client-api/streaming/streaming-session' with {
    'resolution-mode': 'import',
};
import type { PathInfo } from './services/path-info';
import { EventBlocker } from './services/event-blocker';
import { DuplicateFilter } from './services/duplicate-filter';
import { ImageService } from './services/image-service';
import { TextService } from './services/text-service';

/**
 * Values of ring-client-api's `PushNotificationAction.Motion` / `.Ding`. Spelled out because the
 * module is ESM only and its values are not available synchronously in this CommonJS build.
 */
const PUSH_CATEGORY_MOTION = 'com.ring.pn.live-event.motion';
const PUSH_CATEGORY_DING = 'com.ring.pn.live-event.ding';
/** Ring repeats a notification for 25 minutes and longer (#711), an hour covers that with margin */
const REPEATED_NOTIFICATION_MEMORY_MS = 60 * 60 * 1000;

enum EventState {
    Idle,
    ReactingOnEvent,
    ReactingOnMotion,
    ReactingOnDoorbell,
}

export class OwnRingCamera extends OwnRingDevice {
    private readonly infoChannelId: string;
    private readonly historyChannelId: string;
    private readonly lightChannelId: string;
    private readonly sirenChannelId: string;
    private readonly eventsChannelId: string;
    private readonly snapshotChannelId: string;
    private readonly HDsnapshotChannelId: string;
    private readonly liveStreamChannelId: string;
    private lastAction: LastAction | undefined;
    private _ringDevice: RingCamera;
    private _durationLiveStream: number;
    private _lastLightCommand: number = 0;
    private _lastLiveStreamUrl: string = '';
    private _lastLiveStreamTimestamp: number = 0;
    private _lastSnapShotUrl: string = '';
    private _lastSnapshotTimestamp: number = 0;
    private _snapshotCount: number = 0;
    private _lastHDSnapShotUrl: string = '';
    private _lastHDSnapshotTimestamp: number = 0;
    private _HDsnapshotCount: number = 0;
    private _liveStreamCount: number = 0;
    private _lastLiveStreamDir: string = '';
    private _lastSnapShotDir: string = '';
    private _lastHDSnapShotDir: string = '';
    private _motionEventBlocker: EventBlocker;
    private _notifyEventBlocker: EventBlocker;
    private _doorbellEventBlocker: EventBlocker;
    /** Kept across updateByDevice(), a reconnect is exactly when repeated notifications arrive */
    private readonly _notificationFilter: DuplicateFilter = new DuplicateFilter(REPEATED_NOTIFICATION_MEMORY_MS);
    /** undefined until known whether the second battery states exist, see updateSecondBatteryObject() */
    private _hasSecondBattery: boolean | undefined;
    private _state: EventState = EventState.Idle;

    public constructor(
        ringDevice: RingCamera,
        location: OwnRingLocation,
        adapter: RingAdapter,
        apiClient: RingApiClient,
    ) {
        super(
            location,
            adapter,
            apiClient,
            OwnRingCamera.evaluateKind(ringDevice.deviceType as string, adapter, ringDevice),
            `${ringDevice.id}`,
            ringDevice.data.description,
        );
        this._motionEventBlocker = new EventBlocker(
            this._adapter,
            this._adapter.config.ignore_events_Motion,
            this._adapter.config.keep_ignoring_if_retriggered,
        );
        this._notifyEventBlocker = new EventBlocker(
            this._adapter,
            this._adapter.config.ignore_events_Motion,
            this._adapter.config.keep_ignoring_if_retriggered,
        );
        this._doorbellEventBlocker = new EventBlocker(
            this._adapter,
            this._adapter.config.ignore_events_Doorbell,
            this._adapter.config.keep_ignoring_if_retriggered,
        );
        this._durationLiveStream = this._adapter.config.recordtime_livestream;
        this._ringDevice = ringDevice;
        this.infoChannelId = `${this.fullId}.${CHANNEL_NAME_INFO}`;
        this.historyChannelId = `${this.fullId}.${CHANNEL_NAME_HISTORY}`;
        this.lightChannelId = `${this.fullId}.${CHANNEL_NAME_LIGHT}`;
        this.sirenChannelId = `${this.fullId}.${CHANNEL_NAME_SIREN}`;
        this.snapshotChannelId = `${this.fullId}.${CHANNEL_NAME_SNAPSHOT}`;
        this.HDsnapshotChannelId = `${this.fullId}.${CHANNEL_NAME_HDSNAPSHOT}`;
        this.liveStreamChannelId = `${this.fullId}.${CHANNEL_NAME_LIVESTREAM}`;
        this.eventsChannelId = `${this.fullId}.${CHANNEL_NAME_EVENTS}`;

        this.recreateDeviceObjectTree().catch(e => this.catcher("Couldn't create Device Object Tree.", e));
        this.updateDeviceInfoObject(ringDevice.data as CameraData).catch(e =>
            this.catcher("Couldn't update Device Info Object.", e),
        );
        this.updateHealth();
        this.updateHistory().catch(e => this.catcher("Couldn't update History.", e));
        this.autoSched();
        this.subscribeToEvents().catch(e => this.catcher("Couldn't subscribe to events.", e));
    }

    public async startLivestream(duration?: number): Promise<void> {
        this.silly(`${this.shortId}.startLivestream()`);
        duration ??= this._durationLiveStream;
        const { visURL, visPath, fullPath }: FileInfo | { fullPath: ''; visPath: ''; visURL: '' } =
            await this.prepareLivestreamTargetFile().catch((reason: any): { fullPath: ''; visPath: ''; visURL: '' } => {
                this.catcher("Couldn't prepare Livestream Target File.", reason);
                return { visURL: '', visPath: '', fullPath: '' };
            });
        if (!visURL || !visPath || !fullPath) {
            await this.updateLivestreamRequest(false);
            return;
        }
        if (this._ringDevice.isOffline) {
            this.info("Is offline --> won't take LiveStream");
            await this.updateLivestreamRequest(false);
            return;
        }
        const tempPath = `${await FileService.getTempDir(this._adapter)}/temp_${this.shortId}_livestream.mp4`;
        // Without overlay the H.264 stream of the camera is copied. An empty list must not be passed:
        // ring-client-api only falls back to "-vcodec copy" for a missing value, so [] made ffmpeg
        // re-encode every recording - which on weak CPUs falls behind and shows artifacts (#674).
        // The overlay needs re-encoding; "ultrafast" keeps that close to real time.
        const video: string[] = this._adapter.config.overlay_Livestream
            ? [
                  ...ImageService.videoFilter(
                      true,
                      this._adapter.dateFormat,
                      this._adapter.language,
                      this._ringDevice.data.description,
                  ),
                  '-preset',
                  'ultrafast',
              ]
            : ['-vcodec', 'copy'];
        const liveCall: StreamingSession | null = await this._ringDevice
            .streamVideo({
                video,
                output: ['-t', duration.toString(), tempPath],
            })
            .catch((reason: any): null => {
                this.catcher("Couldn't create Livestream (stream video).", reason);
                return null;
            });
        if (!liveCall) {
            this.warn("Couldn't create Livestream (empty result).");
            await this.updateLivestreamRequest(false);
            return;
        }

        const liveCallSucceeded: boolean | null = await rxjs
            .firstValueFrom(liveCall.onCallEnded)
            .then((_result: void): boolean => {
                return true;
            })
            .catch((reason: any): null => {
                this.catcher("Couldn't create Livestream (first value).", reason);
                return null;
            });

        if (!fs.existsSync(tempPath) || !liveCallSucceeded) {
            this.warn(`Couldn't create Livestream (temp path: ${tempPath}, live call: ${liveCallSucceeded}).`);
            await this.updateLivestreamRequest(false);
            return;
        }
        const video: Buffer = fs.readFileSync(tempPath);

        // clean up
        fs.unlink(tempPath, (err: NodeJS.ErrnoException | null): void => {
            if (err) {
                this.catcher("Couldn't delete temp file.", err);
            }
        });
        if (this._lastLiveStreamDir !== '' && this._adapter.config.del_old_livestream) {
            await FileService.deleteFileIfExist(this._lastLiveStreamDir, this._adapter);
        }

        if (visPath) {
            this.silly(`Locally storing FileStream (Length: ${video.length})`);
            await FileService.writeFile(visPath, video, this._adapter);
            this._lastLiveStreamUrl = visURL;
        }
        this.silly(`Writing FileStream (Length: ${video.length}) to "${fullPath}"`);
        await FileService.writeFile(fullPath, video, this._adapter);
        this._lastLiveStreamDir = fullPath;
        this._lastLiveStreamTimestamp = Date.now();
        await this.updateLiveStreamObject();
        this.debug(`Done creating livestream to ${fullPath}`);
    }

    public async takeHDSnapshot(): Promise<void> {
        // from very short Livestream
        this.silly(`${this.shortId}.takeHDSnapshot()`);
        // const duration = 2.0;
        const { visURL, visPath }: { visURL: string; visPath: string } | { visPath: ''; visURL: '' } =
            await FileService.getVisUrl(this._adapter, this.fullId, 'HDSnapshot.jpg').catch(
                (reason: any): { visPath: ''; visURL: '' } => {
                    this.catcher("Couldn't get Vis URL.", reason);
                    return { visURL: '', visPath: '' };
                },
            );
        if (!visURL || !visPath) {
            this.warn('Vis not available! Please install e.g. flot or other Vis related adapter');
            await this.updateHDSnapshotRequest(false);
            return;
        }

        const { fullPath, dirname }: PathInfo = FileService.getPath(
            this._adapter.config.path_snapshot,
            `HD${this._adapter.config.filename_snapshot}`,
            ++this._HDsnapshotCount,
            this.shortId,
            this.fullId,
            this.kind,
        );

        if (!(await FileService.prepareFolder(dirname))) {
            this.warn("Prepare folder problem --> won't take HD Snapshot");
            await this.updateHDSnapshotRequest(false);
            return;
        }
        await FileService.deleteFileIfExist(fullPath, this._adapter);
        if (this._ringDevice.isOffline) {
            this.info("Is offline --> won't take HD Snapshot");
            await this.updateHDSnapshotRequest(false);
            return;
        }
        const { night_contrast, night_sharpen }: { night_contrast: boolean; night_sharpen: boolean } =
            this.getActiveNightImageOptions();
        const tempPath = `${await FileService.getTempDir(this._adapter)}/temp_${this.shortId}_livestream.jpg`;
        const liveCall: StreamingSession | null = await this._ringDevice
            .streamVideo({
                video: ImageService.videoFilter(
                    this._adapter.config.overlay_HDsnapshot,
                    this._adapter.dateFormat,
                    this._adapter.language,
                    this._ringDevice.data.description,
                    night_contrast ? this._adapter.config.contrast_HDsnapshot : 0,
                ),
                // output: ["-t", duration.toString(), "-f", "mjpeg", "-q:v", 3, "-frames:v", 1, tempPath]
                output: ['-f', 'mjpeg', '-q:v', 3, '-frames:v', 1, tempPath],
            })
            .catch((reason: any): null => {
                this.catcher("Couldn't create HD Snapshot (stream Video).", reason);
                return null;
            });
        if (!liveCall) {
            this.warn("Couldn't create HD Snapshot (empty result).");
            await this.updateHDSnapshotRequest(false);
            return;
        }
        const liveCallSucceeded: boolean | null = await rxjs
            .firstValueFrom(liveCall.onCallEnded)
            .then((_result: void): boolean => {
                return true;
            })
            .catch((reason: any): null => {
                this.catcher("Couldn't create HD Snapshot (first value).", reason);
                return null;
            });

        if (!fs.existsSync(tempPath) || !liveCallSucceeded) {
            this.warn(`Couldn't create HD Snapshot (temp path: ${tempPath}, live call: ${liveCallSucceeded}).`);
            await this.updateHDSnapshotRequest(false);
            return;
        }
        this.silly('HD Snapshot from livestream created.');

        let jpg: Buffer = fs.readFileSync(tempPath);
        if (!jpg.length) {
            // ffmpeg can end without a frame; "sharp" would throw "Input Buffer is empty" on it (#615)
            this.warn(`Couldn't create HD Snapshot (empty image in ${tempPath}).`);
            fs.unlink(tempPath, (err: NodeJS.ErrnoException | null): void => {
                if (err) {
                    this.catcher(`Couldn't delete temp file ${tempPath}`, err);
                }
            });
            await this.updateHDSnapshotRequest(false);
            return;
        }

        if (night_sharpen && this._adapter.config.sharpen_HDsnapshot && this._adapter.config.sharpen_HDsnapshot > 0) {
            const sharpen: undefined | { sigma: number } =
                this._adapter.config.sharpen_HDsnapshot == 1
                    ? undefined
                    : { sigma: this._adapter.config.sharpen_HDsnapshot - 1 };
            const sharp: typeof Sharp | null = await ImageService.loadSharp(this._adapter);
            if (sharp) {
                try {
                    jpg = await sharp(jpg).sharpen(sharpen).toBuffer();
                } catch (reason: any) {
                    this.catcher("Couldn't sharpen HD Snapshot.", reason);
                }
            }
        }

        // clean up
        fs.unlink(tempPath, (err: NodeJS.ErrnoException | null): void => {
            if (err) {
                this.catcher(`Couldn't delete temp file ${tempPath}`, err);
            }
        });
        if (this._lastHDSnapShotDir !== '' && this._adapter.config.del_old_HDsnapshot) {
            await FileService.deleteFileIfExist(this._lastHDSnapShotDir, this._adapter);
        }

        if (visPath) {
            this.silly(`Locally storing HD Snapshot (Length: ${jpg.length})`);
            await FileService.writeFile(visPath, jpg, this._adapter);
            this._lastHDSnapShotUrl = visURL;
        }
        this.silly(`Writing HD Snapshot to ${fullPath} (Length: ${jpg.length})`);
        await FileService.writeFile(fullPath, jpg, this._adapter);
        this._lastHDSnapShotDir = fullPath;
        this._lastHDSnapshotTimestamp = Date.now();
        await this.updateHDSnapshotObject();
        this.debug(`Done creating HDSnapshot to ${visPath}`);
    }

    public async toggleSiren(state: boolean): Promise<void> {
        if (!this._ringDevice.hasSiren) {
            this.warn(`Device ${this.shortId} does not support siren capabilities.`);
            return;
        }
        this.debug(`Toggling siren state for ${this.shortId} to ${state}`);
        try {
            await this._ringDevice.setSiren(state);
            await this._adapter.upsertState(
                `${this.sirenChannelId}.${STATE_ID_SIREN_SWITCH}`,
                COMMON_SIREN_SWITCH,
                state,
                true,
            );
            this.debug(`Siren state set to ${state} successfully.`);
        } catch (err) {
            this.catcher(`Couldn't toggle siren state for ${this.shortId}.`, err);
        }
    }

    public async takeSnapshot(uuid?: string, eventBased: boolean = false): Promise<void> {
        this.silly(`${this.shortId}.takeSnapshot()`);

        const { visURL, visPath }: { visURL: string; visPath: string } = await FileService.getVisUrl(
            this._adapter,
            this.fullId,
            'Snapshot.jpg',
        );
        if (!visURL || !visPath) {
            this.warn('Vis not available');
        }

        const { fullPath, dirname }: PathInfo = FileService.getPath(
            this._adapter.config.path_snapshot,
            this._adapter.config.filename_snapshot,
            ++this._snapshotCount,
            this.shortId,
            this.fullId,
            this.kind,
        );

        if (!(await FileService.prepareFolder(dirname))) {
            this.warn(`prepare folder problem --> won't take Snapshot`);
            await this.updateSnapshotRequest(false);
            return;
        }
        await FileService.deleteFileIfExist(fullPath, this._adapter);

        if (this._ringDevice.isOffline) {
            this.info(`is offline --> won't take Snapshot`);
            await this.updateSnapshotRequest(false);
            return;
        }

        const image: Buffer & ExtendedResponse = await this._ringDevice
            .getNextSnapshot({ force: true, uuid: uuid })
            .then((result: Buffer & ExtendedResponse): Buffer & ExtendedResponse => result)
            .catch((err: any): Buffer & ExtendedResponse => {
                if (eventBased) {
                    this.warn('Taking Snapshot on Event failed.');
                } else {
                    this.catcher("Couldn't get Snapshot from api.", err);
                }
                this.updateSnapshotRequest(false).catch(err => this.catcher('Cannot update snapshot request.', err));
                return err;
            });

        if (!image.byteLength) {
            if (eventBased) {
                this.warn('Taking Snapshot on Event failed (no image).');
            } else {
                this.warn("Couldn't create snapshot from image");
            }
            await this.updateSnapshotRequest(false);
            return;
        }
        this.silly(`Response timestamp: ${image.responseTimestamp}, 
                  Byte Length: ${image.byteLength},
                  Byte Offset: ${image.byteOffset},
                  Length: ${image.length},
                  Time in ms: ${image.timeMillis}`);

        let image_txt: Buffer = image;
        if (this._adapter.config.overlay_snapshot) {
            image_txt = await ImageService.addTextToJpgBuffer(
                this._adapter,
                image,
                this._ringDevice.data.description,
                strftime(
                    `${TextService.getTodayName(this._adapter.language)}, ${TextService.getDateFormat(this._adapter.dateFormat)} %T`,
                ),
            ).catch((reason: any): Buffer => {
                // store the snapshot without text - the error itself used to be written as the image
                this.catcher("Couldn't add text to Snapshot.", reason);
                return image;
            });
        }

        if (this._lastSnapShotDir !== '' && this._adapter.config.del_old_snapshot) {
            await FileService.deleteFileIfExist(this._lastSnapShotDir, this._adapter);
        }
        this._lastSnapShotUrl = visURL;
        this._lastSnapShotDir = fullPath;
        this._lastSnapshotTimestamp = image.timeMillis;

        if (visPath) {
            this.silly(`Locally storing Snapshot (Length: ${image.length})`);
            await FileService.writeFile(visPath, image_txt, this._adapter);
        }
        this.silly(`Writing Snapshot (Length: ${image.length}) to "${fullPath}"`);
        await FileService.writeFile(fullPath, image_txt, this._adapter);
        await this.updateSnapshotObject();
        this.debug(`Done creating snapshot to ${fullPath}`);
    }

    public async updateHistory(): Promise<void> {
        this.silly(`Update History`);
        await this._ringDevice.getEvents({ limit: 50 }).then(async (r: CameraEventResponse): Promise<void> => {
            this.silly(`Received Event History`);
            const lastAction: CameraEvent | undefined = r.events.find((event: CameraEvent): boolean => {
                const kind: DingKind = event.kind;
                switch (kind) {
                    case 'motion':
                    case 'ding':
                    case 'alarm':
                    case 'on_demand':
                        return true;
                }
                return false;
            });
            if (lastAction === undefined) {
                return;
            }
            const url: string = await this._ringDevice.getRecordingUrl(lastAction.ding_id_str);
            this.lastAction = new LastAction(lastAction, url);
            await this.updateHistoryObject(this.lastAction);
        });
    }

    public override async processUserInput(channelID: string, stateID: string, state: ioBroker.State): Promise<void> {
        switch (channelID) {
            case '': {
                if (stateID !== STATE_ID_DEBUG_REQUEST) {
                    return;
                }
                const targetVal: boolean = state.val as boolean;
                if (targetVal) {
                    this.info(`Device Debug Data for ${this.shortId}: ${util.inspect(this._ringDevice, false, 1)}`);
                    await this._adapter.upsertState(
                        `${this.fullId}.${STATE_ID_DEBUG_REQUEST}`,
                        COMMON_DEBUG_REQUEST,
                        false,
                    );
                }
                return;
            }

            case 'Siren':
                if (!this._ringDevice.hasSiren) {
                    return;
                }
                if (stateID === STATE_ID_SIREN_SWITCH) {
                    const targetVal: boolean = state.val as boolean;
                    this.debug(`Set siren for ${this.shortId} to value ${targetVal}`);
                    const success = await this._ringDevice.setSiren(targetVal);
                    if (success) {
                        await this._adapter.upsertState(
                            `${this.sirenChannelId}.${STATE_ID_SIREN_SWITCH}`,
                            COMMON_SIREN_SWITCH,
                            targetVal,
                            true,
                        );
                    }
                } else {
                    this.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                }
                break;

            case 'Light':
                if (!this._ringDevice.hasLight) {
                    return;
                }
                if (stateID === STATE_ID_LIGHT_SWITCH) {
                    const targetVal: boolean = state.val as boolean;
                    this.debug(`Set light for ${this.shortId} to value ${targetVal}`);
                    this._lastLightCommand = Date.now();
                    const success = await this._ringDevice.setLight(targetVal);
                    if (success) {
                        await this._adapter.upsertState(
                            `${this.lightChannelId}.light_state`,
                            COMMON_LIGHT_STATE,
                            targetVal,
                        );
                        await this._adapter.upsertState(
                            `${this.lightChannelId}.light_switch`,
                            COMMON_LIGHT_SWITCH,
                            targetVal,
                            true,
                        );
                        this._adapter.setTimeout((): void => void this.updateHealth(), 65000);
                    }
                } else {
                    this.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                }
                break;

            case 'Snapshot':
                if (stateID === STATE_ID_SNAPSHOT_REQUEST) {
                    const targetVal: boolean = state.val as boolean;
                    this.debug(`Get Snapshot request for ${this.shortId} to value ${targetVal}`);
                    if (targetVal) {
                        await this.takeSnapshot().catch((reason: any): void => {
                            this.updateSnapshotRequest(false).catch(e =>
                                this.catcher('Cannot update snapshot request', e),
                            );
                            this.catcher("Couldn't retrieve Snapshot.", reason);
                        });
                    }
                } else {
                    this.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                }
                break;

            case 'HD Snapshot':
                if (stateID === STATE_ID_HDSNAPSHOT_REQUEST) {
                    const targetVal: boolean = state.val as boolean;
                    this.debug(`Get HDSnapshot request for ${this.shortId} to value ${targetVal}`);
                    if (targetVal) {
                        await this.takeHDSnapshot().catch((reason: any): void => {
                            this.updateHDSnapshotRequest(false).catch(e =>
                                this.catcher('Cannot update HD snapshot request', e),
                            );
                            this.catcher("Couldn't retrieve HDSnapshot.", reason);
                        });
                    }
                } else {
                    this.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                }
                break;
            case 'Livestream':
                if (stateID === STATE_ID_LIVESTREAM_REQUEST) {
                    const targetVal: boolean = state.val as boolean;
                    this.debug(`Get Livestream request for ${this.shortId} to value ${targetVal}`);
                    if (targetVal) {
                        await this.startLivestream().catch((reason: any): void => {
                            this.updateLivestreamRequest(false).catch(e =>
                                this.catcher('Cannot update Livestream request', e),
                            );
                            this.catcher("Couldn't retrieve Livestream.", reason);
                        });
                    }
                } else if (stateID === STATE_ID_LIVESTREAM_DURATION) {
                    const targetVal: number = isNaN(state.val as number) ? 20 : (state.val as number);
                    this.debug(`Get Livestream duration for ${this.shortId} to value ${targetVal}`);
                    this.setDurationLivestream(targetVal);
                } else {
                    this.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                }
                break;

            default:
                this.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
        }
    }

    protected async recreateDeviceObjectTree(): Promise<void> {
        this.silly(`Recreate DeviceObjectTree`);

        await this._adapter.setObjectNotExistsAsync(this.fullId, {
            type: 'device',
            common: {
                name: `Device ${this.shortId} ("${this._ringDevice.data.description}")`,
            },
            native: {},
        });
        await this._adapter.setObjectNotExistsAsync(`${this.fullId}.${CHANNEL_NAME_INFO}`, {
            type: 'channel',
            common: {
                name: `Info ${this.shortId}`,
            },
            native: {},
        });
        await this._adapter.setObjectNotExistsAsync(`${this.fullId}.${CHANNEL_NAME_SNAPSHOT}`, {
            type: 'channel',
            common: {
                name: `Snapshot ${this.shortId}`,
            },
            native: {},
        });
        await this._adapter.setObjectNotExistsAsync(`${this.fullId}.${CHANNEL_NAME_HDSNAPSHOT}`, {
            type: 'channel',
            common: {
                name: `HD Snapshot ${this.shortId}`,
            },
            native: {},
        });
        await this._adapter.setObjectNotExistsAsync(`${this.fullId}.${CHANNEL_NAME_LIVESTREAM}`, {
            type: 'channel',
            common: {
                name: `Livestream ${this.shortId}`,
            },
            native: {},
        });
        await this._adapter.setObjectNotExistsAsync(`${this.fullId}.${CHANNEL_NAME_HISTORY}`, {
            type: 'channel',
            common: {
                name: `History`,
            },
            native: {},
        });
        await this._adapter.setObjectNotExistsAsync(`${this.fullId}.${CHANNEL_NAME_EVENTS}`, {
            type: 'channel',
            common: {
                name: `Events`,
            },
            native: {},
        });

        if (this._ringDevice.hasSiren) {
            this.debug(`Device with Siren Capabilities detected`);
            // Ersetzen von createChannel durch setObjectNotExistsAsync
            await this._adapter.setObjectNotExistsAsync(`${this.fullId}.${CHANNEL_NAME_SIREN}`, {
                type: 'channel',
                common: {
                    name: `Siren ${this.shortId}`,
                },
                native: {},
            });
            await this._adapter.upsertState(
                `${this.sirenChannelId}.${STATE_ID_SIREN_SWITCH}`,
                COMMON_SIREN_SWITCH,
                false,
                true,
                true,
            );
        }

        if (this._ringDevice.hasLight) {
            this.debug(`Device with Light Capabilities detected`);
            // Ersetzen von createChannel durch setObjectNotExistsAsync
            await this._adapter.setObjectNotExistsAsync(`${this.fullId}.${CHANNEL_NAME_LIGHT}`, {
                type: 'channel',
                common: {
                    name: `Light ${this.shortId}`,
                },
                native: {},
            });
            await this._adapter.upsertState(
                `${this.lightChannelId}.${STATE_ID_LIGHT_SWITCH}`,
                COMMON_LIGHT_SWITCH,
                false,
                true,
                true,
            );
        }

        this._lastSnapShotDir = await this._adapter.tryGetStringState(`${this.snapshotChannelId}.file`);
        this._lastHDSnapShotDir = await this._adapter.tryGetStringState(`${this.HDsnapshotChannelId}.file`);
        this._lastLiveStreamDir = await this._adapter.tryGetStringState(`${this.liveStreamChannelId}.file`);

        if (this._adapter.config.auto_snapshot === undefined) {
            this._adapter.config.auto_snapshot = false;
        }
        if (this._adapter.config.auto_HDsnapshot === undefined) {
            this._adapter.config.auto_HDsnapshot = false;
        }
        if (this._adapter.config.auto_livestream === undefined) {
            this._adapter.config.auto_livestream = false;
        }

        await this._adapter.upsertState(
            `${this.fullId}.${STATE_ID_DEBUG_REQUEST}`,
            COMMON_DEBUG_REQUEST,
            false,
            true,
            true,
        );

        await this._adapter.upsertState(
            `${this.snapshotChannelId}.${STATE_ID_SNAPSHOT_REQUEST}`,
            COMMON_SNAPSHOT_REQUEST,
            false,
            true,
            true,
        );
        await this._adapter.upsertState(
            `${this.HDsnapshotChannelId}.${STATE_ID_HDSNAPSHOT_REQUEST}`,
            COMMON_HDSNAPSHOT_REQUEST,
            false,
            true,
            true,
        );
        await this._adapter.upsertState(
            `${this.liveStreamChannelId}.${STATE_ID_LIVESTREAM_REQUEST}`,
            COMMON_LIVESTREAM_REQUEST,
            false,
            true,
            true,
        );
        await this._adapter.upsertState(
            `${this.liveStreamChannelId}.${STATE_ID_LIVESTREAM_DURATION}`,
            COMMON_LIVESTREAM_DURATION,
            this._durationLiveStream,
            true,
        );

        await this._adapter.upsertState(`${this.eventsChannelId}.ondemand`, COMMON_ON_DEMAND, false);

        // Created on start and not only with the first push event: without a working push connection
        // they would never appear, and scripts could not subscribe to them before the first event.
        await this._adapter.initEventState(`${this.eventsChannelId}.motion`, COMMON_MOTION);
        if (this._ringDevice.isDoorbot || String(this._ringDevice.deviceType).includes('doorbell')) {
            await this._adapter.initEventState(`${this.eventsChannelId}.doorbell`, COMMON_EVENTS_DOORBELL);
        }

        await this._adapter.upsertState(
            `${this.snapshotChannelId}.auto`,
            COMMON_SNAPSHOT_AUTO,
            this._adapter.config.auto_snapshot,
        );
        await this._adapter.upsertState(
            `${this.HDsnapshotChannelId}.auto`,
            COMMON_HDSNAPSHOT_AUTO,
            this._adapter.config.auto_HDsnapshot,
        );
        await this._adapter.upsertState(
            `${this.liveStreamChannelId}.auto`,
            COMMON_LIVESTREAM_AUTO,
            this._adapter.config.auto_livestream,
        );

        // Remove legacy states
        await this._adapter.delObjectAsync(`${this.snapshotChannelId}.snapshot_file`);
        await this._adapter.delObjectAsync(`${this.snapshotChannelId}.snapshot_url`);
        await this._adapter.delObjectAsync(`${this.HDsnapshotChannelId}.snapshot_file`);
        await this._adapter.delObjectAsync(`${this.HDsnapshotChannelId}.snapshot_url`);
        await this._adapter.delObjectAsync(`${this.liveStreamChannelId}.livestream_file`);
        await this._adapter.delObjectAsync(`${this.liveStreamChannelId}.livestream_url`);
    }

    private async prepareLivestreamTargetFile(): Promise<FileInfo> {
        const { visURL, visPath }: { visURL: string; visPath: string } | { visPath: ''; visURL: '' } =
            await FileService.getVisUrl(this._adapter, this.fullId, 'Livestream.mp4').catch(
                (reason: any): { visPath: ''; visURL: '' } => {
                    this.catcher("Couldn't get Vis URL.", reason);
                    return { visURL: '', visPath: '' };
                },
            );
        if (!visURL || !visPath) {
            throw new Error('Vis not available');
        }

        const { fullPath, dirname }: PathInfo = FileService.getPath(
            this._adapter.config.path_livestream,
            this._adapter.config.filename_livestream,
            ++this._liveStreamCount,
            this.shortId,
            this.fullId,
            this.kind,
        );

        const folderPrepared: boolean = await FileService.prepareFolder(dirname).catch((reason: any): boolean => {
            this.catcher("Couldn't prepare folder.", reason);
            return false;
        });
        if (!folderPrepared) {
            this.warn(`Failed to prepare Livestream folder ("${fullPath}")`);
            throw new Error('Failed to prepare Livestream folder');
        }
        await FileService.deleteFileIfExist(fullPath, this._adapter);
        return { visURL: visURL, visPath: visPath, fullPath: fullPath };
    }

    private getActiveNightImageOptions(): { night_contrast: boolean; night_sharpen: boolean } {
        let night_contrast = false;
        let night_sharpen = false;

        if (this._adapter.Sunrise > 0 && this._adapter.Sunset > 0) {
            const today: number = Date.now();
            this.silly(`Now: ${today}, sunrise: ${this._adapter.Sunrise}, sunset: ${this._adapter.Sunset}`);
            const isNight: boolean = today < this._adapter.Sunrise || today > this._adapter.Sunset;
            this.debug(`is Night: ${isNight}`);
            night_contrast =
                (this._adapter.config.night_contrast_HDsnapshot && isNight) ||
                !this._adapter.config.night_contrast_HDsnapshot;
            night_sharpen =
                (this._adapter.config.night_sharpen_HDsnapshot && isNight) ||
                !this._adapter.config.night_sharpen_HDsnapshot;
        }
        return { night_contrast, night_sharpen };
    }

    public updateByDevice(ringDevice: RingCamera): void {
        this._ringDevice = ringDevice;
        this.subscribeToEvents().catch(e => this.catcher("Couldn't subscribe to events.", e));
        this._state = EventState.Idle;
        this.update(ringDevice.data).catch(e => this.catcher("Couldn't update device data.", e));
    }

    private async update(data: AnyCameraData): Promise<void> {
        this.debug(`Received Update`);
        await this.updateDeviceInfoObject(data as CameraData);
        this.updateHealth();
        this.updateHistory().catch(e => this.catcher("Couldn't update History.", e));
    }

    public setDurationLivestream(val: number): void {
        this.silly(`${this.shortId}.durationLivestream()`);
        this._durationLiveStream = val;
        this._adapter
            .upsertState(
                `${this.liveStreamChannelId}.${STATE_ID_LIVESTREAM_DURATION}`,
                COMMON_LIVESTREAM_DURATION,
                this._durationLiveStream,
            )
            .catch(e =>
                this.catcher(`Cannot upsert state ${this.liveStreamChannelId}.${STATE_ID_LIVESTREAM_DURATION}`, e),
            );
        this.debug(`Livestream duration set to: ${val}`);
    }

    public updateHealth(): void {
        this.silly(`Update Health`);
        this._ringDevice
            .getHealth()
            .then(this.updateHealthObject.bind(this))
            .catch(e => this.catcher("Couldn't update Health.", e));
    }

    /**
     * Cron rule (with seconds) for "every `intervalSeconds`", started at second `offsetSeconds` of the
     * minute so that snapshot, HD snapshot and livestream do not all start at the same moment.
     * The finer fields have to be fixed: a daily rule with "*" for minute and hour runs every minute (#828).
     */
    public static getAutoSaveCron(intervalSeconds: number, offsetSeconds: number): string {
        const every = (unit: number): number => Math.max(1, Math.round(intervalSeconds / unit));
        if (intervalSeconds < 60) {
            return `*/${every(1)} * * * * *`;
        }
        if (intervalSeconds < 3600) {
            return `${offsetSeconds} */${every(60)} * * * *`;
        }
        if (intervalSeconds < 86400) {
            return `${offsetSeconds} 0 */${every(3600)} * * *`;
        }
        return `${offsetSeconds} 0 0 */${every(86400)} * *`;
    }

    private autoSched(): void {
        const media: { val: number; fct: (rec?: number) => void; name: string; start: number }[] = [
            {
                name: 'Snaspshot',
                val: this._adapter.config.save_snapshot,
                fct: (): void => {
                    this.takeSnapshot().catch(e => this.catcher('Cannot take snapshot', e));
                },
                start: 0,
            },
            {
                name: 'HD Snapshot',
                val: this._adapter.config.save_HDsnapshot,
                fct: (): void => {
                    this.takeHDSnapshot().catch(e => this.catcher('Cannot take HD snapshot', e));
                },
                start: 20,
            },
            {
                name: 'Livestream',
                val: this._adapter.config.save_livestream,
                fct: (): void => {
                    this.startLivestream(this._adapter.config.recordtime_auto_livestream).catch(e =>
                        this.catcher('Cannot start livestream', e),
                    );
                },
                start: 40,
            },
        ];

        for (const m of media) {
            if (m.val > 0) {
                const t: string = OwnRingCamera.getAutoSaveCron(m.val, m.start);
                this.info(`Create scheduled Job for ${m.name} at "${t}"`);
                this._adapter.registerScheduledJob(
                    schedule.scheduleJob(
                        `Auto save ${m.name}_${this._adapter.namespace}_${this.shortId}`,
                        t,
                        async (): Promise<void> => {
                            const recAct: any = await this._adapter.getStateAsync(`${this.eventsChannelId}.ondemand`);
                            if (!recAct || !recAct.val) {
                                this.info(`Cronjob Auto save ${m.name} starts`);
                                this._adapter
                                    .upsertState(`${this.eventsChannelId}.ondemand`, COMMON_ON_DEMAND, true)
                                    .catch(e =>
                                        this.catcher(`Cannot upsert state ${this.eventsChannelId}.ondemand`, e),
                                    );
                                m.fct(this._adapter.config.recordtime_auto_livestream);
                            } else {
                                this.warn(
                                    `Cronjob ${m.name} not executed because another job is already running. Please adapt timer and/or duration time!`,
                                );
                            }
                        },
                    ),
                );
            }
        }
    }

    private async subscribeToEvents(): Promise<void> {
        this.silly(`Start device subscriptions`);
        await this._ringDevice.subscribeToDingEvents().catch((r: any): void => {
            this.catcher(`Failed subscribing to Ding Events for ${this._ringDevice.name}`, r);
        });
        await this._ringDevice.subscribeToMotionEvents().catch((r: any): void => {
            this.catcher(`Failed subscribing to Motion Events for ${this._ringDevice.name}`, r);
        });
        this._ringDevice.onData.subscribe(this.update.bind(this));
        // Motion and doorbell are derived from the notifications themselves and not taken from
        // onMotionDetected / onDoorbellPressed: those pass repeated notifications on as new events.
        this._ringDevice.onNewNotification.subscribe({
            next: (ding: PushNotificationDingV2): void => {
                this.onPushNotification(ding);
            },
            error: (err: Error): void => {
                this.catcher(`Notify Observer received error`, err);
            },
        });
    }

    private onPushNotification(ding: PushNotificationDingV2): void {
        const dingId: string | undefined = ding?.data?.event?.ding?.id;
        if (this._notificationFilter.isDuplicate(dingId)) {
            this.debug(`Ignoring repeated push notification for ding ${dingId}`);
            return;
        }
        // Same order as ring-client-api emitted them before: motion, doorbell, notification
        const category: string | undefined = ding?.android_config?.category;
        if (category === PUSH_CATEGORY_MOTION) {
            this.onMotion(true).catch(e => this.catcher('Cannot react on motion', e));
        } else if (category === PUSH_CATEGORY_DING) {
            this.onDoorbell(ding).catch(e => this.catcher('Cannot react on doorbell', e));
        }
        this.onNotify(ding).catch(e => this.catcher('Cannot react on notification', e));
    }

    private async updateDeviceInfoObject(data: CameraData): Promise<void> {
        await this._adapter.upsertState(`${this.infoChannelId}.id`, COMMON_INFO_ID, data.device_id);
        await this._adapter.upsertState(`${this.infoChannelId}.kind`, COMMON_INFO_KIND, data.kind as string);
        await this._adapter.upsertState(`${this.infoChannelId}.description`, COMMON_INFO_DESCRIPTION, data.description);
        await this._adapter.upsertState(
            `${this.infoChannelId}.external_connection`,
            COMMON_INFO_EXTERNAL_CONNECTION,
            data.external_connection,
        );
        await this._adapter.upsertState(
            `${this.infoChannelId}.hasLight`,
            COMMON_INFO_HAS_LIGHT,
            this._ringDevice.hasLight,
        );
        await this._adapter.upsertState(
            `${this.infoChannelId}.hasBattery`,
            COMMON_INFO_HAS_BATTERY,
            this._ringDevice.hasBattery,
        );
        await this._adapter.upsertState(
            `${this.infoChannelId}.hasSiren`,
            COMMON_INFO_HAS_SIREN,
            this._ringDevice.hasSiren,
        );
        await this.updateSecondBatteryObject(data);
    }

    /**
     * Cameras with two battery slots (e.g. Spotlight Cam Battery) report the second one only in the
     * device data - battery_percentage from the health check is the first slot alone (#150).
     * The states are created once a second battery was seen and show -1 while its slot is empty.
     */
    private async updateSecondBatteryObject(data: CameraData): Promise<void> {
        const percentageId = `${this.infoChannelId}.second_battery_percentage`;
        const level: number | null =
            OwnRingCamera.parseBatteryLevel(data.battery_life_2) ??
            OwnRingCamera.parseBatteryLevel(data.health?.second_battery_percentage);
        this._hasSecondBattery ??= !!(await this._adapter.getObjectAsync(percentageId));
        if (level === null && !this._hasSecondBattery) {
            return;
        }
        this._hasSecondBattery = true;
        await this._adapter.upsertState(percentageId, COMMON_INFO_SECOND_BATTERY_PERCENTAGE, level ?? -1);
        await this._adapter.upsertState(
            `${this.infoChannelId}.second_battery_percentage_category`,
            COMMON_INFO_SECOND_BATTERY_PERCENTAGE_CATEGORY,
            data.health?.second_battery_percentage_category ?? 'unknown',
        );
    }

    private static parseBatteryLevel(value: number | string | null | undefined): number | null {
        if (value === null || value === undefined || value === '') {
            return null;
        }
        const level: number = typeof value === 'number' ? value : parseFloat(value);
        return isNaN(level) ? null : level;
    }

    private async updateHistoryObject(lastAction: LastAction): Promise<void> {
        await this._adapter.upsertState(
            `${this.historyChannelId}.created_at`,
            COMMON_HISTORY_CREATED_AT,
            lastAction.event.created_at,
        );
        await this._adapter.upsertState(
            `${this.historyChannelId}.history_url`,
            COMMON_HISTORY_URL,
            lastAction.historyUrl,
        );
        await this._adapter.upsertState(`${this.historyChannelId}.kind`, COMMON_HISTORY_KIND, lastAction.event.kind);
    }

    private async updateSnapshotRequest(ack: boolean = true): Promise<void> {
        await this._adapter.upsertState(`${this.eventsChannelId}.ondemand`, COMMON_ON_DEMAND, false);
        // subscribe to true, because user request doesn't change value via upsertState
        await this._adapter.upsertState(
            `${this.snapshotChannelId}.${STATE_ID_SNAPSHOT_REQUEST}`,
            COMMON_SNAPSHOT_REQUEST,
            false,
            ack,
            true,
        );
    }

    private async updateHDSnapshotRequest(ack: boolean = true): Promise<void> {
        await this._adapter.upsertState(`${this.eventsChannelId}.ondemand`, COMMON_ON_DEMAND, false);
        // subscribe to true, because user request doesn't change value via upsertState
        await this._adapter.upsertState(
            `${this.HDsnapshotChannelId}.${STATE_ID_HDSNAPSHOT_REQUEST}`,
            COMMON_HDSNAPSHOT_REQUEST,
            false,
            ack,
            true,
        );
    }

    private async updateLivestreamRequest(ack: boolean = true): Promise<void> {
        await this._adapter.upsertState(`${this.eventsChannelId}.ondemand`, COMMON_ON_DEMAND, false);
        // subscribe to true, because user request doesn't change value via upsertState
        await this._adapter.upsertState(
            `${this.liveStreamChannelId}.${STATE_ID_LIVESTREAM_REQUEST}`,
            COMMON_LIVESTREAM_REQUEST,
            false,
            ack,
            true,
        );
        this._durationLiveStream = this._adapter.config.recordtime_livestream;
        await this._adapter.upsertState(
            `${this.liveStreamChannelId}.${STATE_ID_LIVESTREAM_DURATION}`,
            COMMON_LIVESTREAM_DURATION,
            this._durationLiveStream,
            ack,
        );
    }

    private async updateSnapshotObject(): Promise<void> {
        this.debug(`Update Snapshot Object`);
        if (this._lastSnapshotTimestamp !== 0) {
            await this._adapter.upsertState(
                `${this.snapshotChannelId}.file`,
                COMMON_SNAPSHOT_FILE,
                this._lastSnapShotDir,
            );
            await this._adapter.upsertState(
                `${this.snapshotChannelId}.moment`,
                COMMON_SNAPSHOT_MOMENT,
                this._lastSnapshotTimestamp,
            );
            await this._adapter.upsertState(
                `${this.snapshotChannelId}.url`,
                COMMON_SNAPSHOT_URL,
                this._lastSnapShotUrl,
            );
        }
        await this.updateSnapshotRequest();
    }

    private async updateHDSnapshotObject(): Promise<void> {
        this.debug(`Update HD Snapshot Object`);
        if (this._lastHDSnapshotTimestamp !== 0) {
            await this._adapter.upsertState(
                `${this.HDsnapshotChannelId}.file`,
                COMMON_HDSNAPSHOT_FILE,
                this._lastHDSnapShotDir,
            );
            await this._adapter.upsertState(
                `${this.HDsnapshotChannelId}.moment`,
                COMMON_HDSNAPSHOT_MOMENT,
                this._lastHDSnapshotTimestamp,
            );
            await this._adapter.upsertState(
                `${this.HDsnapshotChannelId}.url`,
                COMMON_HDSNAPSHOT_URL,
                this._lastHDSnapShotUrl,
            );
        }
        await this.updateHDSnapshotRequest();
    }

    private async updateLiveStreamObject(): Promise<void> {
        this.debug(`Update Livestream Object`);
        if (this._lastLiveStreamTimestamp !== 0) {
            await this._adapter.upsertState(
                `${this.liveStreamChannelId}.file`,
                COMMON_LIVESTREAM_FILE,
                this._lastLiveStreamDir,
            );
            await this._adapter.upsertState(
                `${this.liveStreamChannelId}.url`,
                COMMON_LIVESTREAM_URL,
                this._lastLiveStreamUrl,
            );
            await this._adapter.upsertState(
                `${this.liveStreamChannelId}.moment`,
                COMMON_LIVESTREAM_MOMENT,
                this._lastLiveStreamTimestamp,
            );
        }
        await this.updateLivestreamRequest();
    }

    private async updateHealthObject(health: CameraHealth): Promise<void> {
        this.debug('Update Health Callback');
        let batteryPercent: number = parseInt(health.battery_percentage ?? '-1');
        if (isNaN(batteryPercent)) {
            batteryPercent = -1;
        }
        await this._adapter.upsertState(
            `${this.infoChannelId}.battery_percentage`,
            COMMON_INFO_BATTERY_PERCENTAGE,
            batteryPercent,
        );
        await this._adapter.upsertState(
            `${this.infoChannelId}.battery_percentage_category`,
            COMMON_INFO_BATTERY_PERCENTAGE_CATEGORY,
            health.battery_percentage_category,
        );
        await this._adapter.upsertState(`${this.infoChannelId}.wifi_name`, COMMON_INFO_WIFI_NAME, health.wifi_name);
        await this._adapter.upsertState(
            `${this.infoChannelId}.latest_signal_strength`,
            COMMON_INFO_LATEST_SIGNAL_STRENGTH,
            health.latest_signal_strength,
        );
        await this._adapter.upsertState(
            `${this.infoChannelId}.latest_signal_category`,
            COMMON_INFO_LATEST_SIGNAL_CATEGORY,
            health.latest_signal_category,
        );
        await this._adapter.upsertState(`${this.infoChannelId}.firmware`, COMMON_INFO_FIRMWARE, health.firmware);
        if (this._ringDevice.hasLight && Date.now() - this._lastLightCommand > 60000) {
            // this.silly(JSON.stringify(this._ringDevice.data));
            const floodlightOn: boolean = (this._ringDevice.data as any).health.floodlight_on as boolean;
            this.debug(`Update Light within Health Update Floodlight is ${floodlightOn}`);
            await this._adapter.upsertState(`${this.lightChannelId}.light_state`, COMMON_LIGHT_STATE, floodlightOn);
        }
    }

    private async onNotify(value: PushNotificationDingV2): Promise<void> {
        this.debug(`Received Notify Event (${util.inspect(value, true, 1)})`);
        if (value) {
            if (this._notifyEventBlocker.checkBlock()) {
                this.debug(`ignore Notify event...`);
                return;
            }

            if (value.img != null) {
                await this.notifyRecording(EventState.ReactingOnEvent, value.img.snapshot_uuid);
            }

            const subType: string = value.data.event.ding.subtype;
            await this._adapter.upsertState(
                `${this.eventsChannelId}.type`,
                COMMON_EVENTS_TYPE,
                TextService.getDetectionType(subType, this._adapter.language),
            );
            await this._adapter.upsertState(
                `${this.eventsChannelId}.detectionType`,
                COMMON_EVENTS_DETECTIONTYPE,
                TextService.getDetectionType(value.data.event.ding.detection_type ?? subType, this._adapter.language),
            );
            await this._adapter.upsertState(`${this.eventsChannelId}.created_at`, COMMON_EVENTS_MOMENT, Date.now());
            await this._adapter.upsertState(
                `${this.eventsChannelId}.message`,
                COMMON_EVENTS_MESSAGE,
                value.android_config.body,
            );
        }
    }

    private async onMotion(value: boolean): Promise<void> {
        // value = true -> motion
        this.debug(`Received Motion Event (${util.inspect(value, true, 1)})`);
        if (value) {
            if (this._motionEventBlocker.checkBlock()) {
                this.debug(`ignore Motion event...`);
                return;
            }
            await this._adapter.upsertState(`${this.eventsChannelId}.motion`, COMMON_MOTION, value);
        }
    }

    private async onDoorbell(value: PushNotificationDingV2): Promise<void> {
        this.debug(`Received Doorbell Event (${util.inspect(value, true, 1)})`);
        if (value) {
            if (this._doorbellEventBlocker.checkBlock()) {
                this.debug(`ignore Doorbell event...`);
                return;
            }
            await this._adapter.upsertState(`${this.eventsChannelId}.doorbell`, COMMON_EVENTS_DOORBELL, true);
            this._adapter.setTimeout((): void => {
                this._adapter
                    .upsertState(`${this.eventsChannelId}.doorbell`, COMMON_EVENTS_DOORBELL, false)
                    .catch(e => this.catcher(`Cannot upsert state ${this.eventsChannelId}.doorbell`, e));
            }, 1000);
        }
    }

    private async notifyRecording(state: EventState, uuid: string): Promise<void> {
        let del_cnt = 1;
        while (this._state !== EventState.Idle) {
            this.debug(`delayed notify recording for ${del_cnt}s`);
            del_cnt++;
            await this._adapter.delay(1000);
        }

        this.silly(`Start recording for Event "${EventState[state]}"...`);
        this._state = state;
        try {
            /*
      if (this._adapter.config.auto_snapshot)
        if (subscr && !this._ringDevice.hasBattery)
          await this.takeSnapshot(uuid, true);
        else
          await this.takeSnapshot();
      */
            this._adapter.config.auto_snapshot && (await this.takeSnapshot(uuid, true));
            this._adapter.config.auto_HDsnapshot && (await this.takeHDSnapshot());
            this._adapter.config.auto_livestream &&
                (await this.startLivestream(this._adapter.config.recordtime_auto_livestream));
            // give some time to evaluate motion state, e.g. for node-red
            this._adapter.setTimeout((): void => {
                this._adapter
                    .upsertState(`${this.eventsChannelId}.motion`, COMMON_MOTION, false)
                    .catch(e => this.catcher(`Cannot set state ${this.eventsChannelId}.motion to false`, e));
            }, 200);
            this.debug('Recording of event finished.');
        } finally {
            this._state = EventState.Idle;
        }
        return;
    }
}
