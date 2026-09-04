import type { AdminConnection } from '@iobroker/gui-components';

/** One recorded file of a camera, newest first */
export interface Recording {
    /** file name inside the adapter's file directory */
    file: string;
    /** timestamp parsed out of the file name, undefined if the name carries none */
    timestamp?: number;
}

export type MediaType = 'image' | 'video';

/** One media slot of a camera: the live URL plus the recordings behind it */
export interface Media {
    /** Snapshot | HDSnapshot | Livestream - the part of the state id before ".url" */
    kind: string;
    type: MediaType;
    /** URL of the file the adapter last wrote, from the "<channel>.url" state */
    currentUrl: string;
    recordings: Recording[];
}

export interface Camera {
    /** object id without the namespace, e.g. "stickup_123456" */
    deviceId: string;
    /** full object id, e.g. "ring.0.stickup_123456" */
    fullId: string;
    name: string;
    media: Media[];
}

/**
 * The adapter writes the device name as `Device 123456 ("Front door")`. Older versions wrote
 * just the description. Take what is inside the quotes when they are there, the whole name
 * otherwise - the previous implementation blindly cut off the last two characters and produced
 * garbage for names without quotes.
 */
export function extractCameraName(objectName: unknown, fallback: string): string {
    const name =
        typeof objectName === 'string'
            ? objectName
            : typeof objectName === 'object' && objectName !== null
              ? ((objectName as Record<string, string>).en ?? '')
              : '';
    const quoted = /\("(.*)"\)\s*$/.exec(name);
    if (quoted) {
        return quoted[1];
    }
    return name || fallback;
}

/** The adapter appends `_<epoch millis>` before the extension when it keeps old files */
export function parseTimestamp(file: string): number | undefined {
    const stem = file.slice(0, file.lastIndexOf('.'));
    const tail = stem.slice(stem.lastIndexOf('_') + 1);
    if (!/^\d{10,}$/.test(tail)) {
        return undefined;
    }
    const ts = Number(tail);
    return Number.isFinite(ts) ? ts : undefined;
}

/**
 * Build the URL of a recorded file from the URL of the current one. The live URL looks like
 * `http://host:8082/ring.0/ring_0_stickup_1_Snapshot.jpg`, the recordings live one directory
 * deeper under the device id. Deriving the origin from the state keeps the web adapter's real
 * host, port and protocol - the old tab hard-coded `:8082` and broke on any other setup.
 */
export function buildRecordingUrl(currentUrl: string, namespace: string, deviceId: string, file: string): string {
    try {
        const url = new URL(currentUrl);
        return `${url.origin}/${namespace}/${deviceId}/${file}`;
    } catch {
        return '';
    }
}

function mediaTypeOf(file: string): MediaType | undefined {
    if (file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png')) {
        return 'image';
    }
    if (file.endsWith('.mp4')) {
        return 'video';
    }
    return undefined;
}

/**
 * The old tab only listed devices whose id started with `cocoa` or `stickup`, which silently
 * hid every doorbell. Any device that has media URL states is listed now.
 */
export async function loadCameras(socket: AdminConnection, namespace: string): Promise<Camera[]> {
    // "香" is the usual ioBroker range end: a character above everything an object id can contain
    const objects = await socket.getObjectViewSystem('device', `${namespace}.`, `${namespace}.香`);

    const cameras: Camera[] = [];
    for (const fullId of Object.keys(objects || {}).sort()) {
        const deviceId = fullId.slice(namespace.length + 1);
        if (deviceId.includes('.')) {
            continue; // only top level devices
        }

        const urlStates = await socket.getStates(`${fullId}.*.url`);
        const media: Media[] = [];
        for (const stateId of Object.keys(urlStates || {}).sort()) {
            const value = urlStates[stateId]?.val;
            if (typeof value !== 'string' || !value) {
                continue;
            }
            const type = mediaTypeOf(value);
            if (!type) {
                continue;
            }
            // "ring.0.stickup_1.HDsnapshot.url" -> "HDsnapshot"
            const parts = stateId.split('.');
            media.push({ kind: parts[parts.length - 2], type, currentUrl: value, recordings: [] });
        }

        if (!media.length) {
            continue;
        }

        const camera: Camera = {
            deviceId,
            fullId,
            name: extractCameraName(objects[fullId]?.common?.name, deviceId),
            media,
        };

        // one readDir per device, then hand every media slot the files that belong to it
        let files: { file: string }[] = [];
        try {
            files = await socket.readDir(namespace, deviceId);
        } catch {
            files = [];
        }

        for (const slot of camera.media) {
            const isHd = slot.kind.toLowerCase().includes('hd');
            slot.recordings = files
                .filter(entry => {
                    if (mediaTypeOf(entry.file) !== slot.type) {
                        return false;
                    }
                    if (slot.type === 'video') {
                        return true;
                    }
                    return entry.file.toLowerCase().includes('hdsnapshot') === isHd;
                })
                .map(entry => ({ file: entry.file, timestamp: parseTimestamp(entry.file) }))
                .filter(recording => recording.timestamp !== undefined)
                .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
        }

        cameras.push(camera);
    }

    return cameras;
}
