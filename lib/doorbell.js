'use strict';
//  "ring-api": "^3.0.7"                    https://github.com/jimhigson/ring-api
//  "ring-api": "github:dgreif/ring-api"    https://github.com/dgreif/ring-api

let events = require('events');
let RingAPI = require('ring-api');


class Doorbell {

    constructor(adapter) {
        this.eventEmitter = new events.EventEmitter();
        this.adapter = adapter;
        this.ring = null;
        return (async () => {
            this.ring = await this.getRing();
            return this;
        })();
    }

    getRing() {
        try {
            if (!this.ring) {
                this.ring = RingAPI({
                    email: this.adapter.config.email,
                    password: this.adapter.config.password
                });
            }
            return this.ring;
        } catch (error) {
            throw ("Error in getRing(). Could not get instance " + error);
        }
    }

    getDevices() {
        try {
            let ring = this.getRing();
            let devices = ring.devices();
            return devices;
        } catch (error) {
            throw ("Error in getDevices(). Could not get instance " + error);
        }
    }


    getDoorbells() {
        return (async () => {
            try {
                let doorbells = [];
                let devices = await this.getDevices();
                for (let i in devices.doorbells) {
                    doorbells.push(devices.doorbells[i]);
                }
                return doorbells;
            } catch (error) {
                throw ("Error in getDoorbells(). Could not get instance " + error);
            }
        })();
    }

    getDoorbell(id) {
        return (async () => {
            try {
                let doorbells = await this.getDoorbells();
                for (let i in doorbells) {
                    if (doorbells[i].id == id) {
                        return doorbells[i];
                    }
                }
                return null;
            } catch (error) {
                throw ("Error in getDoorbell(id) " + error);
            }
        })();
    }

    getLiveStream(id) {
        return (async () => {
            try {
                let doorbell = await this.getDoorbell(id);
                if (doorbell) {
                    let livestream = await doorbell.liveStream;
                    return livestream;
                }
                return null;
            } catch (error) {
                throw ("Error in getLiveStream(id) " + error);
            }
        })();
    }

    getHealthSummarie(id) {
        return (async () => {
            try {
                let doorbell = await this.getDoorbell(id);
                if (doorbell) {
                    let health = await doorbell.health();
                    return health;
                }
                return null;
            } catch (error) {
                throw ("Error in getHealthSummarie(id) " + error);
            }
        })();
    }

    getHistory(id) {
        return (async () => {
            try {
                let histories = [];
                let tmphistories = await this.getRing().history();
                for (let i in tmphistories) {
                    if ((id && tmphistories[i].doorbot.hasOwnProperty('id') && tmphistories[i].doorbot.id == id) || !id) {
                        histories.push(tmphistories[i]);
                    }
                }
                return histories;
            } catch (error) {
                throw ("Error in getHistory(id) " + error);
            }
        })();
    }

    getLastVideos(id) {
        return (async () => {
            try {
                let histories = await this.getHistory(id);
                let videos = Promise.all(histories.map(h => h.videoUrl())); // return Videos 
                return videos;
            } catch (error) {
                throw ("Error in getLastVideos(id) " + error);
            }
        })();
    }

    dingDong(id) {
        return (async (resolve, reject) => {
            try {
                let ring = await this.getRing();
                ring.events.on('activity', (ding) => {
                    if ((id && ding.doorbot_id == id) || !id) {
                        this.eventEmitter.emit('dingdong', ding);
                    }
                });
                return this.eventEmitter;
            } catch (error) {
                throw ("Error in dingDong(id) " + error);
            }
        })();
    }

}

module.exports = {
    Doorbell: Doorbell
};