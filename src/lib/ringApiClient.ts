import {RingApi} from "ring-client-api/lib/api/api";
import {RingAdapter} from "../main";
import {Location} from "ring-client-api/lib/api/location";
import {RingCamera} from "ring-client-api";
import {OwnRingDevice} from "./ownRingDevice";

export class RingApiClient {
    private devices: { [id: string]: OwnRingDevice } = {};
    private interval: ioBroker.Interval | undefined;

    get locations(): Location[] {
        return this._locations;
    }

    private _locations: Location[] = [];

    public validateRefreshToken(): boolean {
        const token: string = this.adapter.config.refreshtoken;
        if (!token || token === "") {
            this.adapter.log.error(`Refresh Token missing.`)
            return false;
        }
        if (token.length < 10) {
            this.adapter.log.error(`Refresh Token is odly short.`)
            return false;
        }

        return true;
    }

    get api(): RingApi {
        if (this._api) {
            return this._api;
        }
        if (!this.adapter.config.refreshtoken) {
            throw(`Refresh Token needed.`)
        } else {
            this._api = new RingApi({
                refreshToken: this.adapter.config.refreshtoken,
                cameraStatusPollingSeconds: 20,
                cameraDingsPollingSeconds: 1
            });
        }

        return this._api;
    }

    private adapter: RingAdapter;
    private _api: RingApi | undefined;

    public constructor(adapter: RingAdapter) {
        this.adapter = adapter;
    }

    public async init(): Promise<void> {
        await this.retrieveLocations();
        if (this._locations.length === 0) {
            this.adapter.terminate(`We couldn't find any locations in your Ring Account`);
            return;
        }

        this.refreshAll();
        this.interval = this.adapter.setInterval(() => {
            this.refreshAll();
        }, 60000);
    }

    public async refreshAll(): Promise<void> {
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
    }



    public processUserInput(deviceID: string, channelID: string, stateID: string, state: ioBroker.State): void {
        if(!this.devices[deviceID]) {
            this.adapter.log.error(`Recieved State Change on Subscribed State, for unknown Device "${deviceID}"`);
            return;
        }

        const targetDevice = this.devices[deviceID];

        targetDevice.processUserInput(channelID, stateID, state);
    }

    public unload(): void {
        if(this.interval) {
            this.adapter.clearInterval(this.interval);
            this.interval = undefined;
        }
    }

    private async retrieveLocations(): Promise<void> {
        this.debug(`Retrieve Locations`);
        await this.api.getLocations()
            .then(
                (locs) => {
                    this.debug(`Recieved Locations`);
                    this._locations = locs;
                },
                this.handleApiError
            );
    }

    private handleApiError(reason: any): void {
        this.adapter.log.error(`Api Call failed`);
        this.adapter.log.debug(`Failure reason:\n${reason}`);
        this.adapter.log.debug(`Call Stack: \n${(new Error()).stack}`);
    }

    private debug(retrieveLocations: string): void {
        this.adapter.log.debug(retrieveLocations);
    }

    private updateDev(device: RingCamera, locationIndex = 0): void {
        const fullID = OwnRingDevice.getFullId(device, this.adapter);
        let ownDev: OwnRingDevice = this.devices[fullID];
        if (ownDev === undefined) {
            ownDev = new OwnRingDevice(device, locationIndex, this.adapter, this);
            this.devices[fullID] = ownDev;
        } else {
            ownDev.update(device);
        }
    }
}
