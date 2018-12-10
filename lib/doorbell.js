'use strict';

let events = require('events');
let RingAPI = require('ring-api');



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
                if (!this.ring) {
                    this.ring = await RingAPI({
                        email: this.adapter.config.email,
                        password: this.adapter.config.password
                    });
                    if (!this.ring) {
                        throw "Error getDevices()";
                    }
                }
                return this.ring;
            } catch (e) {
                let text = 'We couldn\'t create the API instance. This might be because ring.com changed their API again ';
                text += 'or maybe your password is wrong, in any case, sorry can\'t help you today. Bye!';
                throw text;
            }
        });
    }

    getDevices() {
        return (async (resolve, reject) => {
            try {
                if (!this.ring) {
                    this.ring = await RingAPI({
                        email: this.adapter.config.email,
                        password: this.adapter.config.password
                    });
                    if (!this.ring) {
                        throw "Error getDevices()";
                    }
                }
                if (!this.devices) {
                    this.devices = await this.ring.devices();
                    if (!this.devices) {
                        throw "Error getDevices()";
                    }
                }
                return this.devices;
            } catch (e) {
                throw 'Error getDevices()';
            }
        });
    }

    getLiveStream(id) {

        return (async (resolve, reject) => {
            try {
                let livestreams = [];
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
                for (let i in this.devices.doorbells) {
                    if ((id && this.devices.doorbells[i].id == id) || !id) {
                        let livestream = await this.devices.doorbells[i].liveStream;
                        livestreams.push(livestream);
                    }
                }
                return livestreams;
            } catch (e) {
                throw 'Error getLiveStream()';
            }
        });

    }

    getHealthSummarie(id) {
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
                for (let i in this.devices.doorbells) {
                    if ((id && this.devices.doorbells[i].id == id) || !id) {
                        let health = await this.devices.doorbells[i].health();
                        healths.push(health);
                    }
                }
                return healths;

            } catch (e) {
                throw 'Error getHealthSummarie()';
            }
        }); // ();
    }


    getHistory(id) {
        return (async (resolve, reject) => {
            try {
                let histories = [];
                if (!this.ring) {
                    this.ring = await RingAPI({
                        email: this.adapter.config.email,
                        password: this.adapter.config.password
                    });
                    if (!this.ring) {
                        throw 'Error getHistory()';
                    }
                }
                let tmphistories = await this.ring.history();
                for (let i in tmphistories) {
                    if ((id && tmphistories[i].doorbot.hasOwnProperty('id') && tmphistories[i].doorbot.id == id) || !id) {
                        histories.push(tmphistories[i]);
                    }
                }
                return histories;
            } catch (e) {
                throw 'Error getHistory()';
            }
        }); // ();
    }

    getLastVideos(id) {
        return new Promise((resolve, reject) => {
            this.getHistory(id)().then((histories) => {
                return (async (res, rej) => {
                    return Promise.all(histories.map(h => h.videoUrl())); // return Videos 
                })();
            }).then((videos) => {
                resolve(videos); // Get Videos from Promise
            }).catch((error) => {
                reject(error);
            });
        });
    }

    dingDong(id) {


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
                    if ((id && ding.doorbot_id == id) || !id) {
                        this.eventEmitter.emit('dingdong', ding);
                    }
                });
                this.adapter.log.info("Starting DingDong!");
                return this.eventEmitter;
            } catch (e) {
                throw 'Error dingDong()';
            }
        });
    }

    getEvent() {
        return this.eventEmitter;
    }

}


module.exports = Doorbell;