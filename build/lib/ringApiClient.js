'use strict';
Object.defineProperty(exports, '__esModule', {value: true});
exports.RingApiClient = void 0;
const api_1 = require('ring-client-api/lib/api/api');
const ownRingDevice_1 = require('./ownRingDevice');
const constants_1 = require('./constants');

class RingApiClient {
    constructor(adapter) {
        this.devices = {};
        this._refreshInterval = null;
        this._locations = [];
        this.adapter = adapter;
    }

    get locations() {
        return this._locations;
    }
    validateRefreshToken() {
        const token = this.adapter.config.refreshtoken;
        if (!token || token === '') {
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
        } else {
            this._api = new api_1.RingApi({
                refreshToken: await this.adapter.getRefreshToken(),
                cameraStatusPollingSeconds: 600
            });
            this._api.onRefreshTokenUpdated.subscribe((data) => {
                this.adapter.log.info(`Recieved new Refresh Token. Will use the new one until the token in config gets changed`);
                this.adapter.upsertState('next_refresh_token', constants_1.COMMON_NEW_TOKEN, data.newRefreshToken);
                this.adapter.upsertState('old_user_refresh_token', constants_1.COMMON_OLD_TOKEN, this.adapter.config.refreshtoken);
            });
        }
        return this._api;
    }
    async init() {
        await this.retrieveLocations();
        if (this._locations.length === 0) {
            this.adapter.terminate(`We couldn't find any locations in your Ring Account`);
            return;
        }
        for (const l of this._locations) {
            l.onDataUpdate.subscribe((message) => {
                this.debug(`Recieved Location Update Event: "${message}"`);
            });
        }
        await this.refreshAll();
        this._refreshInterval = setInterval(this.refreshAll.bind(this), 120 * 60 * 1000);
    }
    async refreshAll() {
        this.debug(`Refresh all Cameras`);
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
        this.debug(`Refresh complete`);
    }
    processUserInput(deviceID, channelID, stateID, state) {
        if (!this.devices[deviceID]) {
            this.adapter.log.error(`Recieved State Change on Subscribed State, for unknown Device "${deviceID}"`);
            return;
        }
        const targetDevice = this.devices[deviceID];
        targetDevice.processUserInput(channelID, stateID, state);
    }
    unload() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
    }
    async retrieveLocations() {
        this.debug(`Retrieve Locations`);
        await (await this.getApi()).getLocations()
          .then((locs) => {
              this.debug(`Recieved ${locs.length} Locations`);
              this._locations = locs;
          }, this.handleApiError.bind(this));
    }
    handleApiError(reason) {
        this.adapter.log.error(`Api Call failed`);
        this.adapter.log.debug(`Failure reason:\n${reason}`);
        this.adapter.log.debug(`Call Stack: \n${(new Error()).stack}`);
    }
    debug(message) {
        this.adapter.log.debug(message);
    }
    updateDev(device, locationIndex = 0) {
        const fullID = ownRingDevice_1.OwnRingDevice.getFullId(device, this.adapter);
        let ownDev = this.devices[fullID];
        if (ownDev === undefined) {
            ownDev = new ownRingDevice_1.OwnRingDevice(device, locationIndex, this.adapter, this);
            this.devices[fullID] = ownDev;
        }
        else {
            ownDev.updateByDevice(device);
        }
    }
}
exports.RingApiClient = RingApiClient;
//# sourceMappingURL=ringApiClient.js.map
