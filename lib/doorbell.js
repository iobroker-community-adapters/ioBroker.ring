'use strict';
//  "ring-api": "^3.0.7"                    https://github.com/jimhigson/ring-api
//  "ring-api": "github:dgreif/ring-api"    https://github.com/dgreif/ring-api

let events = require('events');
let RingAPI = require('ring-api');


class Doorbell {

    constructor(adapter) {
        this.eventEmitter = null;
        this.adapter = adapter;
        this.ring = null;
        return (async () => {
            this.ring = await this.getRing();
            return this;
        })();
    }

    async getRing() {
        try {
            if (!this.ring) {
                this.ring = await RingAPI({
                    email: this.adapter.config.email,
                    password: this.adapter.config.password
                });
                this.eventEmitter = new events.EventEmitter();
            }
            this.adapter.log.debug("Ring: " + JSON.stringify(this.ring));
            return this.ring;
        } catch (error) {
            throw ("Error in getRing(). Could not get instance " + error);
        }
    }

    async getDevices() {
        let devices;
        try {
            let ring = await this.getRing();
            devices = await ring.devices();
            this.adapter.log.debug("Devices: " + JSON.stringify(devices));
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
                    this.adapter.log.debug("Doorbell: " + JSON.stringify(devices.doorbells[i]));
                }
                return doorbells;
            } catch (error) {
                this.ring = devices ? this.ring : null;
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
                        this.adapter.log.debug("Doorbell for Id: " + id + " = " + JSON.stringify(doorbells[i]));
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
                    this.adapter.log.debug("LiveStream: " + JSON.stringify(livestream));
                    if(livestream) livestream.created_at = livestream.now.toString();
                    return livestream;
                }
                this.adapter.log.debug("No LiveStream: ");
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
                    this.adapter.log.debug("Health: " + JSON.stringify(health));
                    return health;
                }
                this.adapter.log.debug("No Health Message");
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
                let ring = await this.getRing();
                let tmphistories = await ring.history();
                for (let i in tmphistories) {
                    if ((id && tmphistories[i].doorbot.hasOwnProperty('id') && tmphistories[i].doorbot.id == id) || !id) {
                        this.adapter.log.debug("History: " + i + " = " + JSON.stringify(tmphistories[i]));
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
                let videos = await Promise.all(histories.map(h => h.videoUrl())); // return Videos
                for (let i in videos) {
                    this.adapter.log.debug("Videos: " + i + " = " + JSON.stringify(videos[i]));
                }
                return videos;
            } catch (error) {
                throw ("Error in getLastVideos(id) " + error);
            }
        })();
    }

    event(id, callback) {
        return (async (resolve, reject) => {
            try {
                let ring = await this.getRing();
                let d = new Date();
                ring.events.on('activity', (ding) => {
                    if ((id && ding.doorbot_id == id) || !id) {
                        ding.created_at = d.toString();
                        this.adapter.log.debug("Ding Dong for Id " + id + JSON.stringify(ding));
                        callback && callback(ding);
                    }
                });
            } catch (error) {
                throw ("Error in dingDong(id) " + error);
            }
        })();
    }

}

module.exports = {
    Doorbell: Doorbell
};