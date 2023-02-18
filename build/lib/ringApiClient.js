"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RingApiClient = void 0;
const ring_client_api_1 = require("ring-client-api");
const ownRingCamera_1 = require("./ownRingCamera");
const constants_1 = require("./constants");
const ownRingLocation_1 = require("./ownRingLocation");
const ownRingDevice_1 = require("./ownRingDevice");
const ownRingIntercom_1 = require("./ownRingIntercom");
class RingApiClient {
    get locations() {
        return this._locations;
    }
    validateRefreshToken() {
        const token = this.adapter.config.refreshtoken;
        if (!token || token === "") {
            this.adapter.log.error(`Refresh Token missing.`);
            return false;
        }
        if (token.length < 10) {
            this.adapter.log.error(`Refresh Token is odly short.`);
            return false;
        }
        return true;
    }
    async getApi() {
        if (this._api) {
            return this._api;
        }
        if (!this.adapter.config.refreshtoken) {
            throw (`Refresh Token needed.`);
        }
        this._api = new ring_client_api_1.RingApi({
            controlCenterDisplayName: "iobroker.ring",
            refreshToken: await this.adapter.getRefreshToken(),
            systemId: `${this.adapter.host}.ring_v${this.adapter.version}_${Math.random() * Math.pow(10, 6)}`,
            cameraStatusPollingSeconds: 120,
            locationModePollingSeconds: 120,
            // debug: true
        });
        this._api.onRefreshTokenUpdated.subscribe((data) => {
            this.adapter.log.info(`Recieved new Refresh Token. Will use the new one until the token in config gets changed`);
            this.adapter.upsertState("next_refresh_token", constants_1.COMMON_NEW_TOKEN, data.newRefreshToken);
            this.adapter.upsertState("old_user_refresh_token", constants_1.COMMON_OLD_TOKEN, this.adapter.config.refreshtoken);
        });
        const profile = await this._api.getProfile()
            .catch((reason) => {
            this.handleApiError(reason);
        });
        if (profile === undefined) {
            this.warn("Couldn't Retrieve profile, please make sure your api-token is fresh and correct");
        }
        return this._api;
    }
    constructor(adapter) {
        this.refreshing = false;
        this.cameras = {};
        this.intercoms = {};
        this._refreshInterval = null;
        this._retryTimeout = null;
        this._locations = {};
        this.adapter = adapter;
    }
    async init() {
        await this.refreshAll(true);
        this._refreshInterval = setInterval(this.refreshAll.bind(this), 120 * 60 * 1000);
    }
    async refreshAll(initial = false) {
        var _a;
        /**
         *  TH 2022-05-30: It seems like Ring Api drops it's socket connection from time to time
         *  so we should reconnect ourselves
         */
        this.debug(`Refresh Ring Connection`);
        this.refreshing = true;
        (_a = this._api) === null || _a === void 0 ? void 0 : _a.disconnect();
        this._api = undefined;
        if (!await this.retrieveLocations()) {
            if (initial) {
                this.adapter.terminate(`Failed to retrieve any locations for your ring Account.`);
                return;
            }
            if (this._retryTimeout !== null) {
                clearTimeout(this._retryTimeout);
                this._retryTimeout = null;
            }
            this.warn(`Couldn't load data from Ring Server on reconnect, will retry in 5 Minutes...`);
            this._retryTimeout = setTimeout(this.refreshAll.bind(this), 5 * 60 * 1000);
        }
        else {
            if (this._retryTimeout !== null) {
                clearTimeout(this._retryTimeout);
                this._retryTimeout = null;
            }
        }
        if (Object.keys(this._locations).length === 0 && initial) {
            this.adapter.terminate(`We couldn't find any locations in your Ring Account`);
            return;
        }
        for (const key in this._locations) {
            const l = this._locations[key];
            this.debug(`Process Location ${l.name}`);
            const devices = await l.getDevices();
            this.debug(`Recieved ${devices.length} Devices in Location ${l.name}`);
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
        var _a;
        const targetDevice = (_a = this.cameras[targetId]) !== null && _a !== void 0 ? _a : this.intercoms[targetId];
        const targetLocation = this._locations[targetId];
        if (!targetDevice && !targetLocation) {
            this.adapter.log.error(`Recieved State Change on Subscribed State, for unknown Device/Location "${targetId}"`);
            return;
        }
        else if (targetDevice) {
            targetDevice.processUserInput(channelID, stateID, state);
        }
        else if (targetLocation) {
            targetLocation.processUserInput(channelID, stateID, state);
        }
    }
    unload() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
        if (this._retryTimeout !== null) {
            clearTimeout(this._retryTimeout);
            this._retryTimeout = null;
        }
    }
    async retrieveLocations() {
        this.debug(`Retrieve Locations`);
        return new Promise(async (res) => {
            (await this.getApi()).getLocations()
                .catch((reason) => {
                this.handleApiError(reason);
                res(false);
            })
                .then((locs) => {
                var _a;
                if (typeof locs != "object" || ((_a = locs === null || locs === void 0 ? void 0 : locs.length) !== null && _a !== void 0 ? _a : 0) == 0) {
                    this.debug("getLocations was successful, but received no array");
                    res(false);
                    return;
                }
                this.debug(`Received ${locs === null || locs === void 0 ? void 0 : locs.length} Locations`);
                this._locations = {};
                for (const loc of locs) {
                    const newLoc = new ownRingLocation_1.OwnRingLocation(loc, this.adapter, this);
                    this._locations[newLoc.fullId] = newLoc;
                }
                res(true);
            });
        });
    }
    handleApiError(reason) {
        this.adapter.log.error(`Api Call failed`);
        this.adapter.log.debug(`Failure reason:\n${reason}`);
        this.adapter.log.debug(`Call Stack: \n${(new Error()).stack}`);
    }
    silly(message) {
        this.adapter.log.silly(message);
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