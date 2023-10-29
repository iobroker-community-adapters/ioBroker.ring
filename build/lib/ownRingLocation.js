"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnRingLocation = void 0;
const util_1 = __importDefault(require("util"));
const constants_1 = require("./constants");
class OwnRingLocation {
    get loc() {
        return this._loc;
    }
    get id() {
        return this._loc.id;
    }
    get fullId() {
        return this._fullId;
    }
    get name() {
        return this._loc.name;
    }
    constructor(location, adapter, apiClient) {
        this._currentLocationMode = "unset";
        this._loc = location;
        this._fullId = `Location_${this.id}`;
        this._adapter = adapter;
        this._client = apiClient;
        this._loc.onDataUpdate.subscribe((message) => {
            this.debug(`Received Location Update Event: "${message}"`);
        });
        this._loc.onConnected.subscribe((connected) => {
            this.debug(`Received Location Connection Status Change to ${connected}`);
            if (!connected && !apiClient.refreshing) {
                this.warn(`Lost connection to Location ${this._loc.name}... Will try a reconnect in 5s`);
                setTimeout(() => {
                    this._client.refreshAll();
                }, 5000);
            }
        });
        this._loc.onLocationMode.subscribe((newMode) => {
            this.updateModeObject(newMode);
        });
        this.silly(`Location Debug Data: ${util_1.default.inspect(this._loc, false, 2)}`);
        this.recreateDeviceObjectTree();
        this.getLocationMode();
    }
    async recreateDeviceObjectTree() {
        this.silly(`Recreate LocationObjectTree`);
        this._adapter.createDevice(this._fullId, {
            name: `Location ${this.id} ("${this.name}")`,
        });
        // this._adapter.createChannel(this._fullId, CHANNEL_NAME_INFO, {name: `Info ${this.id}`});
        this._adapter.upsertState(`${this._fullId}.${constants_1.STATE_ID_DEBUG_REQUEST}`, constants_1.COMMON_DEBUG_REQUEST, false, true, true);
    }
    silly(message) {
        this._adapter.log.silly(`Location ${this.id} ("${this.name}"): ${message}`);
    }
    debug(message) {
        this._adapter.log.debug(`Location ${this.id} ("${this.name}"): ${message}`);
    }
    warn(message) {
        this._adapter.log.warn(`Location ${this.id} ("${this.name}"): ${message}`);
    }
    async getDevices() {
        return this.loc.getDevices();
    }
    processUserInput(channelID, stateID, state) {
        switch (channelID) {
            case "":
                if (stateID === constants_1.STATE_ID_DEBUG_REQUEST) {
                    this.performDebugOnUserRequest(state);
                    return;
                }
                if (stateID === constants_1.STATE_ID_LOCATIONMODE) {
                    this.performLocationModeChange(state);
                    return;
                }
                this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
                return;
            default:
                this._adapter.log.error(`Unknown State/Switch with channel "${channelID}" and state "${stateID}"`);
        }
    }
    performDebugOnUserRequest(state) {
        const targetVal = state.val;
        if (targetVal) {
            this._adapter.log.info(`Location Debug Data for ${this.id}: ${util_1.default.inspect(this._loc, false, 1)}`);
            this._adapter.upsertState(`${this._fullId}.${constants_1.STATE_ID_DEBUG_REQUEST}`, constants_1.COMMON_DEBUG_REQUEST, false);
        }
    }
    async performLocationModeChange(state) {
        const parsedNumber = parseInt(state.val, 10);
        let desiredState;
        if (typeof state.val == "number") {
            desiredState = constants_1.LOCATION_MODE_OPTIONS[state.val];
        }
        else if (!isNaN(parsedNumber)) {
            desiredState = constants_1.LOCATION_MODE_OPTIONS[parsedNumber];
        }
        else {
            desiredState = state.val;
        }
        if (desiredState == this._currentLocationMode) {
            return;
        }
        if (["home", "away", "disarmed"].indexOf(desiredState) === -1) {
            this.updateModeObject(this._currentLocationMode, true);
            this.warn(`Invalid input "${desiredState}"... Only "home","away" and "disarmed" are choose-able by user.`);
            return;
        }
        this.debug(`Change Location Mode to ${desiredState}`);
        this._loc.setLocationMode(desiredState)
            .then((r) => this.updateModeObject(r.mode))
            .catch((reason) => { this._adapter.logCatch(`Failed setting location mode`, reason); });
    }
    updateModeObject(newMode, preventLog = false) {
        this._currentLocationMode = newMode;
        if (!preventLog) {
            this.silly(`Received new LocationMode: ${newMode}`);
        }
        this._adapter.upsertState(`${this._fullId}.locationMode`, constants_1.COMMON_LOCATIONMODE, newMode, true, true);
    }
    async getLocationMode() {
        this._loc.getLocationMode()
            .then((r) => this.updateModeObject(r.mode))
            .catch((reason) => this._adapter.logCatch("Couldn't retrieve Location Mode", reason));
    }
}
exports.OwnRingLocation = OwnRingLocation;
//# sourceMappingURL=ownRingLocation.js.map