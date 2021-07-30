import {RingApi} from "ring-client-api/lib/api/api";
import {RingAdapter} from "../main";
import {Location} from "ring-client-api/lib/api/location";
import {RingCamera, RingDevice} from "ring-client-api";
import {OwnRingDevice} from "./ownRingDevice";

export class RingApiClient {
    private devices: {[id: string]: OwnRingDevice} = {};
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

    public async init(): Promise<void> {
        await this.retrieveLocations();
        if(this._locations.length === 0) {
            this.adapter.terminate(`We couldn't find any locations in your Ring Account`);
            return;
        }

        for (let i = 0; i< this._locations.length; i++) {
            this.debug(`Process Location ${i}`);
            const loc = this._locations[i];
            const devices = await loc.getDevices();
            this.debug(`Recieved ${devices.length} Devices in Location ${i}`);
            this.debug(`Location has ${loc.cameras.length} Cameras`);
            for(const c of loc.cameras) {
                this.updateDev(c, i);
            }
        }
    }

    private handleApiError(reason: any): void {
        this.adapter.log.error(`Api Call failed`);
        this.adapter.log.debug(`Failure reason:\n${reason}`);
        this.adapter.log.debug(`Call Stack: \n${(new Error()).stack}`);
    }

    private debug(retrieveLocations: string): void {
        this.adapter.log.debug(retrieveLocations);
    }

    private updateDev(d: RingCamera, locationIndex = 0) {
        let ownDev: OwnRingDevice = this.devices[d.id];
        if(ownDev === undefined) {
            ownDev = new OwnRingDevice(d, locationIndex, this.adapter, this);
            this.devices[d.id] = ownDev;
        } else {
            ownDev.update(d);
        }
    }
}
