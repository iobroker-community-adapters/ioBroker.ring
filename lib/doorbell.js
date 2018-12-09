'use strict';

let RingAPI = require('ring-api');
let events = require('events');


class Doorbell {

    constructor(adapter) {
        this.adapter = adapter;
        this.ring = null;
        this.devices = null;
        this.eventEmitter = new events.EventEmitter();
        this.dingDong();
    }

    // Promise Ring
    getRing() {
        // return promise
        return (async (resolve, reject) => {
            try {
                if (this.ring) {
                    return this.ring;
                } else {
                    let ring = await RingAPI({
                        email: this.adapter.config.email,
                        password: this.adapter.config.password
                    });
                    return ring;
                }
            } catch (e) {
                let text = 'We couldn\'t create the API instance. This might be because ring.com changed their API again ';
                text += 'or maybe your password is wrong, in any case, sorry can\'t help you today. Bye!';
                throw text;
            }
        })();
    }

    getLiveStream() {
        return (async (resolve, reject) => {
            try {
                if (!this.ring) {
                    this.ring = await RingAPI({
                        email: this.adapter.config.email,
                        password: this.adapter.config.password
                    });
                    if (!this.ring) {
                        throw "Error getLiveStream()";
                    }
                }
                if (!this.devices) {
                    this.devices = await this.ring.devices();
                    if (!this.devices) {
                        throw "Error getLiveStream()";
                    }
                }
                let livestream = await this.devices.doorbells[0].liveStream;
                return livestream;
            } catch (e) {
                throw 'Error getLiveStream()';
            }
        });

    }

    getHealthSummarie() {
        return (async (resolve, reject) => {
            try {
                let healths = [];
                if (!this.ring) {
                    this.ring = await RingAPI({
                        email: this.adapter.config.email,
                        password: this.adapter.config.password
                    });
                    if (!this.ring) {
                        throw 'Error getHealthSummarie()';
                    }
                }
                if (!this.devices) {
                    this.devices = await this.ring.devices();
                    if (!this.devices) {
                        throw 'Error getHealthSummarie()';
                    }
                }
                for (let i in this.devices.all) {
                    let device = this.devices.all[i];
                    let health = await device.health();
                    healths.push(health);
                    // this.adapter.log.info(JSON.stringify(health));
                }
                return healths;

            } catch (e) {
                throw 'Error getHealthSummarie()';
            }
        }); // ();
    }


    getHistory() {
        return (async (resolve, reject) => {
            try {
                if (!this.ring) {
                    this.ring = await RingAPI({
                        email: this.adapter.config.email,
                        password: this.adapter.config.password
                    });
                    if (!this.ring) {
                        throw 'Error getHistory()';
                    }
                }
                let history = await this.ring.history()
                return history;
            } catch (e) {
                throw 'Error getHistory()';
            }
        }); // ();
    }

    getLastVideos() {
        return (async (resolve, reject) => {
            try {
                if (!this.ring) {
                    this.ring = await RingAPI({
                        email: this.adapter.config.email,
                        password: this.adapter.config.password
                    });
                    if (!this.ring) {
                        throw 'Error getLastVideos()';
                    }
                }
                let history = await this.ring.history();
                let videos = await Promise.all(history.map(h => h.videoUrl()));
                return videos;
            } catch (e) {
                throw 'Error getLastVideos()';
            }
        });

    }

    dingDong() {
        return (async (resolve, reject) => {
            try {
                if (!this.ring) {
                    this.ring = await RingAPI({
                        email: this.adapter.config.email,
                        password: this.adapter.config.password
                    });
                    if (!this.ring) {
                        throw 'Error dingDong()';
                    }
                }
                this.ring.events.on('activity', (ding) => {
                    this.eventEmitter.emit('dingdong', ding);
                });
                this.adapter.log.info("Starting DingDong!");
                return;
            } catch (e) {
                throw 'Error dingDong()';
            }
        });
    }

    getEvent() {
        return this.eventEmitter;
    }

    /*
    test() {
        let i = 0;
        setInterval(() => {
            this.adapter.log.info("Lauf " + i++);
            this.getHealthSummarie((devicesall) => {
                for (let i in devicesall) {
                    let device = devicesall[i];
                    // this.adapter.log.info(JSON.stringify(device.health));
                }
            });
            // this.getLiveStream();

        }, 10 * 1000);

        this.dingDong((obj) => {
            // this.adapter.log.info(JSON.stringify(obj));
        });

    }
    */

}


module.exports = Doorbell;