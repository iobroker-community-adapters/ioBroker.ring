/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */

'use strict';

let events = require('events');
let doorbott = require('@schmupu/doorbot');
let fs = require('fs');


class RingAPI {

  constructor(auth) {
    this.auth = auth;
    this.ring = doorbott(auth);
  }

  devices() {
    return new Promise((resolve, reject) => {
      try {
        this.ring.devices((error, devices) => {
          if (error) return reject(error);
          resolve(devices);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  health(doorbot) {
    return new Promise((resolve, reject) => {
      try {
        this.ring.health(doorbot, (error, health) => {
          if (error) return reject(error);
          resolve(health);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  vod(doorbot) {
    return new Promise((resolve, reject) => {
      try {
        this.ring.vod(doorbot, (error, vod) => {
          if (error) return reject(error);
          resolve(vod);
        });
      } catch (error) {
        reject(error);
      }
    });
  }


  snapshot(doorbot) {
    return new Promise((resolve, reject) => {
      try {
        this.ring.snapshotTimestamps(doorbot, (error, timestamps) => {
          this.ring.snapshot(doorbot, (error, image) => {
            resolve(image);
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }



  history() {
    return new Promise((resolve, reject) => {
      try {
        this.ring.history((error, history) => {
          if (error) return reject(error);
          resolve(history);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  recording(historyid) {
    return new Promise((resolve, reject) => {
      try {
        this.ring.recording(historyid, (error, recording) => {
          if (error) return reject(error);
          resolve(recording);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  dings() {
    return new Promise((resolve, reject) => {
      try {
        this.ring.dings((error, ding) => {
          if (error) return reject(error);
          resolve(ding);
        });
      } catch (error) {
        reject(error);
      }
    });
  }


  lightOn(doorbot) {
    return new Promise((resolve, reject) => {
      try {
        this.ring.lightOn(doorbot, (error) => {
          if (error) return reject(error);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  lightOff(doorbot) {
    return new Promise((resolve, reject) => {
      try {
        this.ring.lightoff(doorbot, (error) => {
          if (error) return reject(error);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

}

class Doorbell {

  constructor(adapter) {
    this.eventEmitter = new events.EventEmitter();
    this.adapter = adapter;
    this.ring = undefined;
    this.kind = {};
    this.checktime = 1;
    this.snapshotfile = __dirname + '/../' + this.adapter.namespace + '.snapshot.jpg';
    (async () => {
      this.ring = await this.getRing();
      this._event();
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
        this.ring = new RingAPI({
          email: this.adapter.config.email,
          password: this.adapter.config.password,
          retries: 10, //authentication retries, optional, defaults to 0
          userAgent: 'My User Agent', //optional, defaults to @android:com.ringapp:2.0.67(423)
          api_version: 11, //optional in case you need to change it from the default of 9
          timeout: (10 * 60 * 1000) //Defaults to 5 minutes
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
      for (let i in devices.doorbots) {
        this.setKind(devices.doorbots[i].id, 'doorbell');
        alls.push(devices.doorbots[i]);
        this.adapter.log.debug('Doorbell: ' + JSON.stringify(devices.doorbots[i]));
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

  async getHealth(id) {
    try {
      this.adapter.log.debug('Health ID: ' + JSON.stringify(id));
      let health = await this.ring.health(id);
      this.adapter.log.debug('Health: ' + JSON.stringify(health));
      if (health) {
        health = health.device_health || {};
      } else {
        health = {};
      }
      return health;
    } catch (error) {
      // throw (this.errorMessage('Could not get Health for ' + id + ' in getHealthSummarie(id). ' , error));
      throw ('Could not get Health for ' + id + ' in getHealth(id). ' + error);
    }
  }

  async getSnapshot(id) {
    try {
      this.adapter.log.debug('Snapshot ID: ' + JSON.stringify(id));
      let image = await this.ring.snapshot(id);
      // fs.writeFileSync(this.snapshotfile, image);
      // await this.adapter.writeFileAsync(this.adapter.namespace, 'tts.userfiles/test.jpg', image);
      return image;
    } catch (error) {
      // throw (this.errorMessage('Could not get Health for ' + id + ' in getHealthSummarie(id). ' , error));
      throw ('Could not get Snapshot for ' + id + ' in getHealth(id). ' + error);
    }
  }

  async getHealthSummarie(id) {
    try {
      // let doorbell = await this.getDoorbell(id);
      this.adapter.log.debug('Health Summary ID: ' + JSON.stringify(id));
      let doorbell = await this.getAllRingsDevice(id);
      this.adapter.log.debug('Health Summary Doorbell: ' + JSON.stringify(doorbell));
      if (doorbell) {
        let health = await this.getHealth(doorbell);
        this.adapter.log.debug('Health Summary: ' + JSON.stringify(health));
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
      let promises = [];
      histories = tmp.filter((obj) => obj.id);
      for (let i in histories) {
        promises.push(this.ring.recording(histories[i].id));
      }
      let videos = await Promise.all(promises); // return Videos
      for (let i in videos) {
        this.adapter.log.debug('Videos: ' + i + ' = ' + JSON.stringify(videos[i]));
      }
      return videos;
    } catch (error) {
      // throw (this.errorMessage('Could not get Last Video ' + id + ' in getLastVideos(id). ' , error));
      throw ('Could not get Last Video ' + id + ' in getLastVideos(id). ' + error);
    }
  }

  async getLiveStream(id) {
    try {
      // let doorbell = await this.getDoorbell(id);
      let doorbell = await this.getAllRingsDevice(id);
      if (doorbell) {
        let livestream = await this.ring.vod(doorbell);
        this.adapter.log.debug('LiveStream: ' + JSON.stringify(livestream));
        if (livestream) livestream.created_at = (new Date(parseInt(livestream.now * 1000, 10)) || '').toString();
        return livestream;
      }
      this.adapter.log.debug('No LiveStream: ');
      return null;
    } catch (error) {
      // throw (this.errorMessage('Could not get Livestram for ' + id + ' in getLiveStream(id). ', error));
      throw ('Could not get Livestram for ' + id + ' in getLiveStream(id). ' + error);
    }
  }

  async setLight(id, value) {
    try {
      let camera = await this.getAllRingsDevice(id) || [];
      if (camera && camera.lightOn && camera.lightOff) {
        let ring = await this.getRing();
        if (value) {
          await ring.lightOn(camera);
        } else {
          await ring.lightOff(camera);
        }
      }
    } catch (error) {
      throw ('Could not get Last Video ' + id + ' in etLight(id). ' + error);
    }
  }

  _event() {
    try {
      const check = async () => {
        // Checking for ring activity
        let ring = await this.getRing();
        if (ring) {
          let json = await ring.dings();
          if (json && json.length > 0) {
            this.eventEmitter.emit('activity', json);
          }
          setTimeout(check, this.checktime * 1000);
        }
      };
      check();
    } catch (error) {
      throw ('Error in _event ' + error);
    }
  }


  event(id, callback) {
    return (async (resolve, reject) => {
      try {
        let d = new Date();
        this.eventEmitter.on('activity', async (ding) => {
          for (let i in ding) {
            if ((id && ding[i].doorbot_id === id) || !id) {
              let kind = this.getKind(id);
              if (kind && kind === 'doorbell') {
                let doorbell = await this.getAllRingsDevice(id);
                ding[i].snapshot = await this.getSnapshot(doorbell);
                ding[i].snapshot && fs.writeFileSync(this.snapshotfile, ding[i].snapshot);
              }
              ding[i].created_at = d.toString();
              this.adapter.log.debug('Ding Dong for Id ' + id + JSON.stringify(ding[i]));
              return callback && callback(ding[i]);
            }
          }
        });
      } catch (error) {
        // throw (this.errorMessage('Could not get Ding Dong Event for ' + id + ' in dingDong(id). ' , error));
        throw ('Could not get Ding Dong Event for ' + id + ' in dingDong(id). ' + error);
      }
    })();
  }

}

async function test(adapter) {

  /*
  let ring = new RingAPI({
    email: 'thorsten@stueben.de',
    password: 'Berlin1968rg!',
    retries: 10, //authentication retries, optional, defaults to 0
    userAgent: 'My User Agent', //optional, defaults to @android:com.ringapp:2.0.67(423)
    api_version: 11, //optional in case you need to change it from the default of 9
    timeout: (10 * 60 * 1000) //Defaults to 5 minutes
  });

  let devices = await ring.devices();
  let health = await ring.health(devices.doorbots[0]);
  let vod = await ring.vod(devices.doorbots[0]);
  let history = await ring.history();
  let recording = await ring.recording(history[1].id);
  let ding = await ring.dings();

  adapter.log.info(JSON.stringify(devices));
  adapter.log.info(JSON.stringify(health));
  adapter.log.info(JSON.stringify(vod));
  adapter.log.info(JSON.stringify(history));
  adapter.log.info(JSON.stringify(recording));
  adapter.log.info(JSON.stringify(ding));
  let a = 1;
*/

  let ring = new Doorbell(adapter);
  adapter.log.debug('Ring ' + JSON.stringify(ring));
  let devices = await ring.getDevices();
  // let dbids = await ring.getDoorbells();
  let dbids = await ring.getAllRingsDevices();
  let doorb = await ring.getAllRingsDevice('17877585');
  let health = await ring.getHealthSummarie('17877585');
  let history = await ring.getHistory('17877585');
  let video = await ring.getLastVideos('17877585');
  let livestream = await ring.getLiveStream('17877585');
  let b = 1;

}

module.exports = {
  Doorbell: Doorbell
};