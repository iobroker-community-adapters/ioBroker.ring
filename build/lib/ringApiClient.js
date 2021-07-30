"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RingApiClient = void 0;
const api_1 = require("ring-client-api/lib/api/api");
const ownRingDevice_1 = require("./ownRingDevice");
class RingApiClient {
    constructor(adapter) {
        this.devices = {};
        this._locations = [];
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
    get api() {
        if (this._api) {
            return this._api;
        }
        if (!this.adapter.config.refreshtoken) {
            throw (`Refresh Token needed.`);
        }
        else {
            this._api = new api_1.RingApi({
                refreshToken: this.adapter.config.refreshtoken,
                cameraStatusPollingSeconds: 20,
                cameraDingsPollingSeconds: 1
            });
        }
        return this._api;
    }
    async retrieveLocations() {
        this.debug(`Retrieve Locations`);
        await this.api.getLocations()
            .then((locs) => {
            this.debug(`Recieved Locations`);
            this._locations = locs;
        }, this.handleApiError);
    }
    async init() {
        await this.retrieveLocations();
        if (this._locations.length === 0) {
            this.adapter.terminate(`We couldn't find any locations in your Ring Account`);
            return;
        }
        for (let i = 0; i < this._locations.length; i++) {
            this.debug(`Process Location ${i}`);
            const loc = this._locations[i];
            const devices = await loc.getDevices();
            this.debug(`Recieved ${devices.length} Devices in Location ${i}`);
            this.debug(`Location has ${loc.cameras.length} Cameras`);
            for (const c of loc.cameras) {
                this.updateDev(c, i);
            }
        }
    }
    handleApiError(reason) {
        this.adapter.log.error(`Api Call failed`);
        this.adapter.log.debug(`Failure reason:\n${reason}`);
        this.adapter.log.debug(`Call Stack: \n${(new Error()).stack}`);
    }
    debug(retrieveLocations) {
        this.adapter.log.debug(retrieveLocations);
    }
    updateDev(d, locationIndex = 0) {
        let ownDev = this.devices[d.id];
        if (ownDev === undefined) {
            ownDev = new ownRingDevice_1.OwnRingDevice(d, locationIndex, this.adapter, this);
            this.devices[d.id] = ownDev;
        }
        else {
            ownDev.update(d);
        }
    }
}
exports.RingApiClient = RingApiClient;
//# sourceMappingURL=ringApiClient.js.map