"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RingApiClient = void 0;
const api_1 = require("ring-client-api/lib/api/api");
const ownRingDevice_1 = require("./ownRingDevice");
const constants_1 = require("./constants");
const ownRingLocation_1 = require("./ownRingLocation");
class RingApiClient {
    constructor(adapter) {
        this.refreshing = false;
        this.devices = {};
        this._refreshInterval = null;
        this._locations = {};
        this.adapter = adapter;
    }
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
        this._api = new api_1.RingApi({
            controlCenterDisplayName: "iobroker.ring",
            refreshToken: await this.adapter.getRefreshToken(),
            systemId: `${this.adapter.host}.ring`,
            cameraStatusPollingSeconds: 120,
            locationModePollingSeconds: 120,
            // debug: true
        });
        this._api.onRefreshTokenUpdated.subscribe((data) => {
            this.adapter.log.info(`Recieved new Refresh Token. Will use the new one until the token in config gets changed`);
            this.adapter.upsertState("next_refresh_token", constants_1.COMMON_NEW_TOKEN, data.newRefreshToken);
            this.adapter.upsertState("old_user_refresh_token", constants_1.COMMON_OLD_TOKEN, this.adapter.config.refreshtoken);
        });
        return this._api;
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
        await this.retrieveLocations();
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
                this.updateDev(c, l);
            }
        }
        this.refreshing = false;
        this.debug(`Refresh complete`);
    }
    processUserInput(targetId, channelID, stateID, state) {
        const targetDevice = this.devices[targetId];
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
    }
    async retrieveLocations() {
        this.debug(`Retrieve Locations`);
        const locs = await (await this.getApi()).getLocations().catch(this.handleApiError.bind(this));
        this.debug(`Recieved ${locs === null || locs === void 0 ? void 0 : locs.length} Locations`);
        this._locations = {};
        for (const loc of locs) {
            const newLoc = new ownRingLocation_1.OwnRingLocation(loc, this.adapter, this);
            this._locations[newLoc.fullId] = newLoc;
        }
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
    updateDev(device, location) {
        const fullID = ownRingDevice_1.OwnRingDevice.getFullId(device, this.adapter);
        let ownDev = this.devices[fullID];
        if (ownDev === undefined) {
            ownDev = new ownRingDevice_1.OwnRingDevice(device, location, this.adapter, this);
            this.devices[fullID] = ownDev;
        }
        else {
            ownDev.updateByDevice(device);
        }
    }
    getLocation(locId) {
        return this.locations[locId];
    }
}
exports.RingApiClient = RingApiClient;
//# sourceMappingURL=ringApiClient.js.map