"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RingApiClient = void 0;
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const ownRingCamera_1 = require("./ownRingCamera");
const constants_1 = require("./constants");
const ownRingLocation_1 = require("./ownRingLocation");
const ownRingDevice_1 = require("./ownRingDevice");
const ownRingIntercom_1 = require("./ownRingIntercom");
class RingApiClient {
    refreshing = false;
    cameras = {};
    intercoms = {};
    _refreshInterval = null;
    _retryTimeout = null;
    get locations() {
        return this._locations;
    }
    _locations = {};
    validateRefreshToken() {
        const token = this.adapter.config.refreshtoken;
        if (!token || token === '') {
            this.adapter.log.error(`Refresh Token missing.`);
            return false;
        }
        if (token.length < 10) {
            this.adapter.log.error(`Refresh Token is oddly short.`);
            return false;
        }
        return true;
    }
    async getApi() {
        if (this._api) {
            return this._api;
        }
        if (!this.adapter.config.refreshtoken) {
            throw new Error('Refresh Token needed.');
        }
        // "ring-client-api" is ESM only and cannot be require()d from this CommonJS build
        const { RingApi: RingApiCtor } = await import('ring-client-api');
        this._api = new RingApiCtor({
            controlCenterDisplayName: 'iobroker.ring',
            refreshToken: await this.adapter.getRefreshToken(),
            systemId: `${this.adapter.host}.ring_v${this.adapter.version}_${Math.random() * Math.pow(10, 6)}`,
            cameraStatusPollingSeconds: 120,
            locationModePollingSeconds: 120,
            // overwrite "ffmpeg for homebridge" with many missing libraries, use actual ffmpeg-static!
            ffmpegPath: ffmpeg_static_1.default ? ffmpeg_static_1.default : undefined,
            // debug: true
        });
        this._api.onRefreshTokenUpdated.subscribe((data) => {
            this.adapter.log.info(`Received new Refresh Token. Will use the new one until the token in config gets changed`);
            this.adapter
                .upsertState('next_refresh_token', constants_1.COMMON_NEW_TOKEN, data.newRefreshToken)
                .catch((e) => {
                this.adapter.log.error(`Failed to store new refresh token: ${e}`);
            });
            this.adapter
                .upsertState('old_user_refresh_token', constants_1.COMMON_OLD_TOKEN, this.adapter.config.refreshtoken)
                .catch((e) => {
                this.adapter.log.error(`Failed to store old refresh token: ${e}`);
            });
        });
        const profile = await this._api
            .getProfile()
            .catch((reason) => this.handleApiError(reason));
        if (profile === undefined) {
            this.warn("Couldn't Retrieve profile, please make sure your api-token is fresh and correct");
        }
        return this._api;
    }
    adapter;
    _api;
    constructor(adapter) {
        this.adapter = adapter;
    }
    async init() {
        await this.refreshAll(true);
        if (this.adapter.config.renew_registration > 0) {
            this._refreshInterval =
                this.adapter.setInterval(this.refreshAll.bind(this), this.adapter.config.renew_registration * 3600 * 1000) ?? null;
        }
    }
    async refreshAll(initial = false) {
        /**
         *  TH 2022-05-30: It seems like Ring Api drops its socket connection from time to time,
         *  so we should reconnect ourselves
         */
        this.debug(`Refresh Ring Connection`);
        this.refreshing = true;
        this._api?.disconnect();
        this._api = undefined;
        if (!(await this.retrieveLocations())) {
            if (initial) {
                this.adapter.terminate(`Failed to retrieve any locations for your ring Account.`);
            }
            if (this._retryTimeout !== null) {
                this.adapter.clearTimeout(this._retryTimeout);
                this._retryTimeout = null;
            }
            this.warn(`Couldn't load data from Ring Server on reconnect, will retry in 5 Minutes...`);
            this._retryTimeout = this.adapter.setTimeout(this.refreshAll.bind(this), 5 * 60 * 1000) ?? null;
        }
        else {
            if (this._retryTimeout !== null) {
                this.adapter.clearTimeout(this._retryTimeout);
                this._retryTimeout = null;
            }
        }
        if (Object.keys(this._locations).length === 0 && initial) {
            this.adapter.terminate(`We couldn't find any locations in your Ring Account`);
        }
        for (const key in this._locations) {
            const l = this._locations[key];
            this.debug(`Process Location ${l.name}`);
            const devices = await l.getDevices();
            this.debug(`Received ${devices.length} Devices in Location ${l.name}`);
            this.debug(`Location has ${l.loc.cameras.length} Cameras`);
            for (const c of l.loc.cameras) {
                this.updateCamera(c, l);
            }
            this.debug(`Location has ${l.loc.intercoms.length} Intercoms`);
            for (const i of l.loc.intercoms) {
                this.updateIntercom(i, l);
            }
        }
        this.refreshing = false;
        this.debug(`Refresh complete`);
    }
    processUserInput(targetId, channelID, stateID, state) {
        const targetDevice = this.cameras[targetId] ?? this.intercoms[targetId];
        const targetLocation = this._locations[targetId];
        if (!targetDevice && !targetLocation) {
            this.adapter.log.error(`Received State Change on Subscribed State, for unknown Device/Location "${targetId}"`);
            return;
        }
        else if (targetDevice) {
            targetDevice.processUserInput(channelID, stateID, state).catch((e) => {
                this.adapter.log.error(`Failed to process user input for device ${channelID} stateID ${stateID}: ${e}`);
            });
        }
        else if (targetLocation) {
            targetLocation.processUserInput(channelID, stateID, state);
        }
    }
    unload() {
        if (this._refreshInterval) {
            this.adapter.clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
        if (this._retryTimeout !== null) {
            this.adapter.clearTimeout(this._retryTimeout);
            this._retryTimeout = null;
        }
    }
    async retrieveLocations() {
        this.debug(`Retrieve Locations`);
        try {
            // getApi() belongs inside the try: it throws on a missing refresh token, and
            // refreshAll() is built around this method returning false, not rejecting.
            const api = await this.getApi();
            const locs = await api.getLocations();
            if (!locs.length) {
                this.debug('getLocations was successful, but received no locations');
                return false;
            }
            this.debug(`Received ${locs.length} Locations`);
            this._locations = {};
            for (const loc of locs) {
                const newLoc = new ownRingLocation_1.OwnRingLocation(loc, this.adapter, this);
                this._locations[newLoc.fullId] = newLoc;
            }
            return true;
        }
        catch (reason) {
            this.handleApiError(reason);
            return false;
        }
    }
    handleApiError(reason) {
        this.adapter.log.error(`Api Call failed`);
        this.adapter.log.debug(`Failure reason:\n${reason}`);
        this.adapter.log.debug(`Call Stack: \n${new Error().stack}`);
    }
    debug(message) {
        this.adapter.log.debug(message);
    }
    warn(message) {
        this.adapter.log.warn(message);
    }
    updateCamera(camera, location) {
        const fullID = ownRingCamera_1.OwnRingCamera.getFullId(camera, this.adapter);
        let ownRingCamera = this.cameras[fullID];
        if (ownRingCamera === undefined) {
            ownRingCamera = new ownRingCamera_1.OwnRingCamera(camera, location, this.adapter, this);
            this.cameras[fullID] = ownRingCamera;
        }
        else {
            ownRingCamera.updateByDevice(camera);
        }
    }
    updateIntercom(intercom, location) {
        const fullID = ownRingDevice_1.OwnRingDevice.getFullId(intercom, this.adapter);
        let ownRingIntercom = this.intercoms[fullID];
        if (ownRingIntercom === undefined) {
            ownRingIntercom = new ownRingIntercom_1.OwnRingIntercom(intercom, location, this.adapter, this);
            this.intercoms[fullID] = ownRingIntercom;
        }
        else {
            ownRingIntercom.updateByDevice(intercom);
        }
    }
    getLocation(locId) {
        return this.locations[locId];
    }
}
exports.RingApiClient = RingApiClient;
//# sourceMappingURL=ringApiClient.js.map