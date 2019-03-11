/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */

'use strict';
//  'ring-api': '^3.0.7'                    https://github.com/jimhigson/ring-api
//  'ring-api': 'github:dgreif/ring-api'    https://github.com/dgreif/ring-api

let events = require('events');
let RingAPI = require('ring-api');


class Doorbell {

  constructor(adapter) {
    this.adapter = adapter;
    this.adapter.log.info('Using ring-api API');
    this.eventEmitter = new events.EventEmitter();
    this.ring = null;
    this.kind = {};
    return (async () => {
      this.ring = await this.getRing();
      return this;
    })();
  }

  errorMessage(text, error) {
    if (Array.isArray(error)) {
      error.push(text);
      return error;
    } else {
      return [error, text];
    }
  }

  setKind(id, kind) {
    this.kind[id] = kind;
  }

  getKind(id) {
    return this.kind[id];
  }

  async getRing() {
    try {
      if (!this.ring) {
        this.ring = await RingAPI({
          email: this.adapter.config.email,
          password: this.adapter.config.password
        });
      }
      this.adapter.log.debug('Ring: ' + JSON.stringify(this.ring));
      return this.ring;
    } catch (error) {
      // throw (this.errorMessage('Could not get ring instance in method getRing(). ', error));
      throw ('Could not get ring instance in method getRing(). ' + error);
    }
  }

  async getDevices() {
    let devices;
    try {
      let ring = await this.getRing();
      devices = await ring.devices();
      this.adapter.log.debug('Devices: ' + JSON.stringify(devices));
      return devices;
    } catch (error) {
      // throw (this.errorMessage('Could not get device instance in method getDevices(). ', error));
      throw ('Could not get device instance in method getDevices(). ' + error);
    }
  }

  async getAllRingsDevices() {
    try {
      let alls = [];
      let devices = await this.getDevices();
      for (let i in devices.doorbells) {
        this.setKind(devices.doorbells[i].id, 'doorbell');
        alls.push(devices.doorbells[i]);
        this.adapter.log.debug('Doorbell: ' + JSON.stringify(devices.doorbells[i]));
      }
      for (let i in devices.cameras) {
        this.setKind(devices.cameras[i].id, 'cameras');
        alls.push(devices.cameras[i]);
        this.adapter.log.debug('Cammera: ' + JSON.stringify(devices.cameras[i]));
      }
      for (let i in devices.chimes) {
        this.setKind(devices.chimes[i].id, 'chimes');
        alls.push(devices.chimes[i]);
        this.adapter.log.debug('Chimes: ' + JSON.stringify(devices.chimes[i]));
      }
      return alls;
    } catch (error) {
      throw ('Could not get all doorbell devices in getAllRingsDevices(). ' + error);
    }
  }

  async getAllRingsDevice(id) {
    try {
      let alls = await this.getAllRingsDevices();
      for (let i in alls) {
        if (alls[i].id == id) {
          this.adapter.log.debug('Doorbell for Id: ' + id + ' = ' + JSON.stringify(alls[i]));
          return alls[i];
        }
      }
      return null;
    } catch (error) {
      throw ('Could not get Doorbell for ' + id + ' in getAllRingsDevice(id). ' + error);
    }
  }

  async getLiveStream(id) {
    try {
      // let doorbell = await this.getDoorbell(id);
      let doorbell = await this.getAllRingsDevice(id);
      if (doorbell) {
        let livestream;
        if (doorbell.liveStream) livestream = await doorbell.liveStream;
        this.adapter.log.debug('LiveStream: ' + JSON.stringify(livestream));
        if (livestream) livestream.created_at = livestream.now.toString();
        return livestream;
      }
      this.adapter.log.debug('No LiveStream: ');
      return null;
    } catch (error) {
      // throw (this.errorMessage('Could not get Livestram for ' + id + ' in getLiveStream(id). ', error));
      throw ('Could not get Livestram for ' + id + ' in getLiveStream(id). ' + error);
    }
  }

  async getHealthSummarie(id) {
    try {
      // let doorbell = await this.getDoorbell(id);
      let doorbell = await this.getAllRingsDevice(id);
      if (doorbell) {
        let health;
        if (doorbell.health) health = await doorbell.health();
        this.adapter.log.debug('Health: ' + JSON.stringify(health));
        return health;
      }
      this.adapter.log.debug('No Health Message');
      return null;
    } catch (error) {
      // throw (this.errorMessage('Could not get Health for ' + id + ' in getHealthSummarie(id). ' , error));
      throw ('Could not get Health for ' + id + ' in getHealthSummarie(id). ' + error);
    }
  }

  async getHistory(id) {
    try {
      let histories = [];
      let ring = await this.getRing();
      let tmphistories = await ring.history();
      for (let i in tmphistories) {
        if ((id && tmphistories[i].doorbot.hasOwnProperty('id') && tmphistories[i].doorbot.id == id) || !id) {
          this.adapter.log.debug('History: ' + i + ' = ' + JSON.stringify(tmphistories[i]));
          histories.push(tmphistories[i]);
        }
      }
      return histories;
    } catch (error) {
      // throw (this.errorMessage('Could noch get Hisotry for ' + id + ' in getHistory(id).' , error));
      throw ('Could noch get Hisotry for ' + id + ' in getHistory(id).' + error);
    }
  }

  async getLastVideos(id) {
    try {
      let tmp = await this.getHistory(id) || [];
      let histories = [];
      histories = tmp.filter((obj) => obj.videoUrl);
      let videos = await Promise.all(histories.map((h) => h.videoUrl())); // return Videos
      for (let i in videos) {
        this.adapter.log.debug('Videos: ' + i + ' = ' + JSON.stringify(videos[i]));
      }
      return videos;
    } catch (error) {
      // throw (this.errorMessage('Could not get Last Video ' + id + ' in getLastVideos(id). ' , error));
      throw ('Could not get Last Video ' + id + ' in getLastVideos(id). ' + error);
    }
  }

  async setLight(id, value) {
    try {
      let camera = await this.getAllRingsDevice(id) || [];
      if (camera.lightOn && camera.lightOff) {
        if (value) {
          await camera.lightOn();
        } else {
          await camera.lightOff();
        }
      }
    } catch (error) {
      throw ('Could not get Last Video ' + id + ' in etLight(id). ' + error);
    }
  }

  event(id, callback) {
    return (async (resolve, reject) => {
      try {
        let ring = await this.getRing();
        let d = new Date();
        ring.events.on('activity', (ding) => {
          if ((id && ding.doorbot_id == id) || !id) {
            ding.created_at = d.toString();
            this.adapter.log.debug('Ding Dong for Id ' + id + JSON.stringify(ding));
            callback && callback(ding);
          }
        });
      } catch (error) {
        // throw (this.errorMessage('Could not get Ding Dong Event for ' + id + ' in dingDong(id). ' , error));
        throw ('Could not get Ding Dong Event for ' + id + ' in dingDong(id). ' + error);
      }
    })();
  }

}

module.exports = {
  Doorbell: Doorbell
};