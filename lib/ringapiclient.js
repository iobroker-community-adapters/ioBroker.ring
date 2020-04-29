/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */

'use strict';

const { RingApi } = require('ring-client-api');
const events = require('events');
const fs = require('fs');
const path = require('path');
const datapoints = require(__dirname + '/datapoints');
/*
const semver = require('semver');
const { bindToRandomPort, getSsrc } = require('ring-client-api');
const { RtpOptions, SipSession } = require('ring-client-api');
const { RingDeviceType } = require('ring-client-api');
const { ReplaySubject } = require('rxjs');
const { filter, map, take } = require('rxjs/operators');
const { createSocket } = require('dgram');
const { spawn } = require('child_process');
const express = require('express');
const RtspServer = require('rtsp-streaming-server').default;
*/

/**
 * Checks if propertis of object A and object B are equal
 * @param {object} obja - Object A
 * @param {object} objb - Object B
 */
function propertiesObjAinObjB(obja, objb) {
  if (obja === objb) return true;
  if (!(obja instanceof Object) || !(objb instanceof Object)) return false;
  if (obja.constructor !== objb.constructor) return false;
  for (let p in obja) {
    if (!obja.hasOwnProperty(p)) continue;
    if (!objb.hasOwnProperty(p)) return false;
    if (obja[p] === objb[p]) continue;
    if (typeof (obja[p]) !== 'object') return false;
    if (!this.propertiesObjAinObjB(obja[p], objb[p])) return false; // Objects and Arrays must be tested recursively
  }
  return true;
}

function hasOwnProperties(target, path, value) {
  if (typeof target !== 'object' || target === null) { return false; }
  let parts = path.split('.');
  while (parts.length) {
    let property = parts.shift();
    if (!(target.hasOwnProperty(property))) {
      return false;
    }
    target = target[property];
  }
  if (value) {
    return target === value;
  } else {
    return true;
  }
}

class RingApiClient {

  constructor(adapter) {
    this.adapter = adapter;
    this.eventEmitter = new events.EventEmitter();
    this.ring = null;
    this.kind = {};
    this.livestream_count = 0;
    this.snapshot_count = 0;
    this.ring = this.getRing();
    this.deleteOldSates();
  }


  /**
   * Delete old states
   */
  async deleteOldSates() {
    try {
      let dbids = await this.getAllRingsDevices();
      for (let j in dbids) {
        let dbid = dbids[j].id;
        let kind = this.getKind(dbid) + '_' + dbid;
        let obj = await this.adapter.getAdapterObjectsAsync();
        let dps = datapoints.getAll();
        for (let id in obj) {
          id = id.replace(this.adapter.namespace + '.', '');
          if (!hasOwnProperties(dps, id.replace(kind + '.', '')) && id != kind) {
            await this.adapter.delObjectAsync(id);
            this.adapter.log.info('Delete old object ' + id);
          }
        }
      }
    } catch (error) {
      throw ('Could not not delete old objecects in deleteOldSates() . ' + error);
    }
  }

  // okay
  errorMessage(text, error) {
    if (Array.isArray(error)) {
      error.push(text);
      return error;
    } else {
      return [error, text];
    }
  }

  // okay
  setKind(id, kind) {
    this.kind[id] = kind;
  }

  // okay
  getKind(id) {
    return this.kind[id];
  }

  // okday
  getRing() {
    try {
      if (!this.ring) {
        if (this.adapter.config.refreshtoken) {
          this.ring = new RingApi({
            refreshToken: this.adapter.config.refreshtoken,
            cameraStatusPollingSeconds: 20,
            cameraDingsPollingSeconds: 1
          });
        } else {
          this.ring = new RingApi({
            email: this.adapter.config.email,
            password: this.adapter.config.password,
            cameraStatusPollingSeconds: 20,
            cameraDingsPollingSeconds: 1
          });
        }
      }
      this.adapter.log.debug('Ring: ' + JSON.stringify(this.ring));
      return this.ring;
    } catch (error) {
      // throw (this.errorMessage('Could not get ring instance in method getRing(). ', error));
      throw ('Could not get ring instance in method getRing(). ' + error);
    }
  }

  // okay
  async getLocations() {
    let locations;
    try {
      let ring = await this.getRing();
      locations = await ring.getLocations();
      // this.adapter.log.debug('Devices: ' + JSON.stringify(locations));
      return locations;
    } catch (error) {
      // throw (this.errorMessage('Could not get device instance in method getDevices(). ', error));
      throw ('Could not get device instance in method getDevices(). ' + error);
    }
  }

  // okay
  async getAllRingsDeviceObjects() {
    try {
      let alls = [];
      let ring = await this.getRing();
      let locations = await this.getLocations();
      for (let i in locations) {
        let location = locations[i];
        let devices = await location.getDevices();
        // let cameras = await ring.getCameras();
        if (location.cameras) {
          for (let j in location.cameras) {
            let camera = location.cameras[j];
            if (camera && camera.isDoorbot) {
              this.setKind(camera.id, 'doorbell');
              alls.push(camera);
              this.adapter.log.debug('Doorbell: ' + JSON.stringify(camera.data));
            }
          }
        }
        if (location.devices) {
          for (let j in location.devices) {
            let device = location.devices[j];
            if (device && device.isDoorbot) {
              this.setKind(device.id, 'doorbell');
              alls.push(device);
              this.adapter.log.debug('Doorbell: ' + JSON.stringify(device.data));
            }
          }
        }
      }
      return alls;
    } catch (error) {
      throw ('Could not get all doorbell devices in getAllRingsDeviceObjects(). ' + error);
    }
  }

  // okay
  async getAllRingsDeviceObject(id) {
    try {
      let alls = await this.getAllRingsDeviceObjects();
      for (let i in alls) {
        if (alls[i].id == id) {
          this.adapter.log.debug('Doorbell for Id: ' + id + ' = ' + JSON.stringify(alls[i].data));
          return alls[i];
        }
      }
      return null;
    } catch (error) {
      throw ('Could not get Doorbell for ' + id + ' in getAllRingsDeviceObject(id). ' + error);
    }
  }

  // okay
  async getAllRingsDevices() {
    try {
      let alls = await this.getAllRingsDeviceObjects();
      let datas = [];
      for (let i in alls) {
        datas.push(alls[i].data);
      }
      return datas;
    } catch (error) {
      throw ('Could not get devices in getAllRingsDevices(). ' + error);
    }
  }

  // okay
  async getAllRingsDevice(id) {
    try {
      let devices = await this.getAllRingsDevices();
      if (devices) {
        for (let i in devices) {
          let device = devices[i];
          if (device.id == id) {
            return device;
          }
        }
      }
      return null;
    } catch (error) {
      throw ('Could not get Doorbell for ' + id + ' in etAllRingsDevice(id). ' + error);
    }
  }

  async getLiveStreamSIP(id) {
    try {
      let doorbell = await this.getAllRingsDeviceObject(id);
      let sip = await doorbell.createSipSession();
    } catch (error) {
      this.adapter.log.error('Error making LiveStream! ' + error);
      throw ('Could not get Livestram for ' + id + ' in etLiveStreamSIP(id). ' + error);
    }
  }

  async getLiveStream(id) {
    try {
      let maxstep = 5;
      let recordtime = this.adapter.config.recordtime_livestream;
      if (recordtime <= 0) return;
      let pathname = this.adapter.config.path;
      let filename = this.adapter.config.filename_livestream;
      filename = filename.replace('%d', Date.now());
      filename = filename.replace('%n', ++this.snapshot_count);
      let file = path.join(pathname, filename);
      if (Date.now() - this.running < maxstep * recordtime * 1000) return;
      this.running = Date.now();
      let doorbell = await this.getAllRingsDeviceObject(id);
      let sip = await doorbell.createSipSession();
      for (let step = 0; step < maxstep; step++) {
        this.adapter.log.info('Making Livestream (' + step + ')');
        if (!fs.existsSync(pathname)) fs.mkdirSync(pathname, { recursive: true });
        if (fs.existsSync(file)) fs.unlinkSync(file);
        this.adapter.log.info('Sarting LiveStream for ' + recordtime + ' sec.');
        await doorbell.recordToFile(file, recordtime);
        this.adapter.log.info('Stopping LiveStream!');
        if (fs.existsSync(file)) {
          const stats = fs.statSync(file);
          if (stats && stats.size > 0) {
            let video = fs.readFileSync(file);
            this.running = 0;
            this.eventEmitter.emit('onLivestream', { id: id, video: video, pathname: pathname, filename: filename });
            return { video: video, pathname: pathname, filename: filename };
          }
          fs.unlinkSync(file);
        }
      }
      this.running = 0;
    } catch (error) {
      this.adapter.log.error('Error making LiveStream! ' + error);
      // throw ('Could not get Livestram for ' + id + ' in getLiveStreamRTP(id). ' + error);
    }
  }


  // okay
  async getSnapshot(id) {
    try {
      let pathname = this.adapter.config.path;
      let filename = this.adapter.config.filename_snapshot;
      filename = filename.replace('%d', Date.now());
      filename = filename.replace('%n', ++this.snapshot_count);
      let file = path.join(pathname, filename);
      this.adapter.log.info('Making snapshot');
      if (!fs.existsSync(pathname)) fs.mkdirSync(pathname, { recursive: true });
      if (fs.existsSync(file)) fs.unlinkSync(file);
      let doorbell = await this.getAllRingsDeviceObject(id);
      let sip = await doorbell.createSipSession();
      let image = await doorbell.getSnapshot();
      if (image) {
        this.adapter.log.info('Done making snapshot');
        fs.writeFileSync(file, image);
        this.eventEmitter.emit('onSnapshot', { id: id, image: image, pathname: pathname, filename: filename });
        return { image: image, pathname: pathname, filename: filename };
      }
    } catch (error) {
      throw ('Could not get Snapshot for ' + id + ' in getSnapshot(). ' + error);
    }
    return null;
  }

  // okay
  async getHealthSummarie(id) {
    try {
      let doorbell = await this.getAllRingsDeviceObject(id);
      if (doorbell) {
        let health = await doorbell.getHealth();
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

  // okay
  async getHistory(id) {
    try {
      let histories = [];
      let doorbell = await this.getAllRingsDeviceObject(id);
      if (doorbell) {
        histories = (await doorbell.getEvents({recording_status: 'ready', limit: 50})).events;
      }
      return histories;
    } catch (error) {
      // throw (this.errorMessage('Could noch get Hisotry for ' + id + ' in getHistory(id).' , error));
      throw ('Could noch get Hisotry for ' + id + ' in getHistory(id).' + error);
    }
  }

  // okay
  async getLastVideos(id) {
    try {
      let videos = [];
      let doorbell = await this.getAllRingsDeviceObject(id);
      let history = (await doorbell.getEvents({recording_status: 'ready', limit: 10})).events;
      for( let h of history) {
        let untranscodedUrl = await doorbell.getRecordingUrl(
          h.ding_id_str
        );
        videos.push(untranscodedUrl);
      }
      return videos;
    } catch (error) {
      // throw (this.errorMessage('Could not get Last Video ' + id + ' in getLastVideos(id). ' , error));
      throw ('Could not get Last Video ' + id + ' in getLastVideos(id). ' + error);
    }
  }

  // okay
  async setLight(id, value) {
    try {
      let camera = await this.getAllRingsDeviceObject(id) || [];
      if (camera) {
        camera.setLight(value);
      }
    } catch (error) {
      throw ('Could not get Last Video ' + id + ' in etLight(id). ' + error);
    }
  }

  // okay
  eventOnNewDing(id, callback) {
    return (async (resolve, reject) => {
      try {
        let doorbell = await this.getAllRingsDeviceObject(id);
        doorbell.onNewDing.subscribe((data) => {
          if (data && data.doorbot_id == id) {
            if (!data.created_at) data.created_at = (new Date(parseInt(data.now * 1000, 10)) || '').toString();
            this.adapter.log.debug('New Ding Dong for Id ' + id + JSON.stringify(data));
            this.adapter.log.info('New Ding Dong for Id ' + id + JSON.stringify(data));
            callback && callback(data);
          }
        });
        doorbell.onActiveDings.subscribe((datas) => {
          for (let i in datas) {
            let data = datas[i];
            if (data && data.doorbot_id == id) {
              if (!data.created_at) data.created_at = (new Date(parseInt(data.now * 1000, 10)) || '').toString();
              this.adapter.log.debug('Acitve Ding Dong for Id ' + id + JSON.stringify(data));
              this.adapter.log.info('Acitve Ding Dong for Id ' + id + JSON.stringify(data));
              // callback && callback(data);
            }
          }
        });
      } catch (error) {
        // throw (this.errorMessage('Could not get Ding Dong Event for ' + id + ' in dingDong(id). ' , error));
        throw ('Could not get Ding Dong Event for ' + id + ' in dingDong(id). ' + error);
      }
    })();
  }

  // okay
  eventOnSnapshot(id, callback) {
    return (async (resolve, reject) => {
      try {
        this.eventEmitter.on('onSnapshot', (data) => {
          if (data.id == id) {
            callback && callback(data);
          }
        });
      } catch (error) {
        // throw (this.errorMessage('Could not get Ding Dong Event for ' + id + ' in dingDong(id). ' , error));
        throw ('Could not get Snapshost Event for ' + id + ' in dingDong(id). ' + error);
      }
    })();
  }

  // okay
  eventOnLivestream(id, callback) {
    return (async (resolve, reject) => {
      try {
        this.eventEmitter.on('onLivestream', (data) => {
          if (data.id == id) {
            callback && callback(data);
          }
        });
      } catch (error) {
        // throw (this.errorMessage('Could not get Ding Dong Event for ' + id + ' in dingDong(id). ' , error));
        throw ('Could not get Livestream Event for ' + id + ' in dingDong(id). ' + error);
      }
    })();
  }

}

module.exports = {
  RingApiClient: RingApiClient
};