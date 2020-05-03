/* eslint-disable no-prototype-builtins */
/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */

'use strict';

const { RingRestClient } = require('ring-client-api/lib/api/rest-client');
const utils = require('@iobroker/adapter-core');
const objectHelper = require('@apollon/iobroker-tools').objectHelper; // Get common adapter utils
const ringapiclient = require(__dirname + '/lib/ringapiclient');
const datapoints = require(__dirname + '/lib/datapoints');
const semver = require('semver');
const path = require('path');
const fs = require('fs');

let ring = null;
let ringdevices = {};
let errorcountmax = 10;
let errorcounter = 0;
let states = {};

const adapterName = require('./package.json').name.split('.').pop();
const adapterNodeVer = require('./package.json').engines.node;
let adapter;

function startAdapter(options) {
  options = options || {};
  options.name = adapterName;
  adapter = new utils.Adapter(options);

  /**
   * is called when adapter shuts down - callback has to be called under any circumstances!
   */
  adapter.on('unload', (callback) => {
    try {
      adapter.log.info('Closing Adapter');
      callback();
    } catch (e) {
      callback();
    }
  });

  /**
   * Listen for sendTo messages
   */
  adapter.on('message', (msg) => {
    adapter.sendTo(msg.from, msg.command, 'Execute command ' + msg.command, msg.callback);
  });

  /**
   *  Listen for object Changes
   */
  adapter.on('objectChange', (id, obj) => {
    // adapter.log.info('objectChange for id  ' + id);
  });

  /**
   * Listen State chnages
   */
  adapter.on('stateChange', (id, state) => {
    objectHelper.handleStateChange(id, state);
  });

  /**
   * is called when databases are connected and adapter received configuration.
   * start here!
   */
  adapter.on('ready', () => {
    adapter.getForeignObject('system.config', (err, obj) => {
      if (adapter.config.password) {
        if (obj && obj.native && obj.native.secret) {
          adapter.config.password = decrypt(obj.native.secret, adapter.config.password);
        } else {
          adapter.config.password = decrypt('Zgfr56gFe87jJOM', adapter.config.password);
        }
      }
      // adapter.subscribeStates(adapter.namespace + '.*.Livestream.livestreamrequest');
      adapter.subscribeStates('*');
      objectHelper.init(adapter);
      main();
    });

  });

  return adapter;
}

/**
 * Change the external Sentry Logging. After changing the Logging
 * the adapter restarts once
 * @param {*} id : adapter.config.sentry_enable for example
 */
async function setSentryLogging(value) {
  try {
    value = value === true;
    let idSentry = 'system.adapter.' + adapter.namespace + '.plugins.sentry.enabled';
    let stateSentry = await adapter.getForeignStateAsync(idSentry);
    if (stateSentry && stateSentry.val !== value) {
      await adapter.setForeignStateAsync(idSentry, value);
      adapter.log.info('Restarting Adapter because of changeing Sentry settings');
      adapter.restart();
      return true;
    }
  } catch (error) {
    return false;
  }
  return false;
}

/**
 * Get two face auth refreshtoken
 */
async function refreshToken() {
  if (!adapter.config.twofaceauth) return;
  adapter.log.info('Setting two face authentication and delete email and password from configuration afterwards');
  let restClient = new RingRestClient({
    email: adapter.config.email,
    password: adapter.config.password,
  });
  let auth = await restClient.getCurrentAuth();
  let refreshtoken = auth.refresh_token;
  if (refreshtoken) {
    adapter.log.info('Two face authentication successfully set. Adapter is restarting!');
    await adapter.extendForeignObjectAsync('system.adapter.' + adapter.namespace, {
      native: {
        twofaceauth: false,
        email: '',
        password: '',
        refreshtoken: refreshtoken
      }
    });
  }
}


/**
 *  Password decrypt
 * @param {*} key 
 * @param {*} value 
 */
function decrypt(key, value) {
  let result = '';
  for (let i = 0; i < value.length; ++i) {
    result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
  }
  return result;
}

/**
 * 
 * @param {*} key 
 * @param {*} value 
 */
function encrypt(key, value) {
  var result = '';
  for (var i = 0; i < value.length; ++i) {
    result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
  }
  return result;
}


/**
 * 
 * @param {*} file 
 */
function delFile(file) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}


/**
 * Build error messages
 * @param {*} error 
 */
function printErrorMessage(error) {
  if (error) {
    if (!Array.isArray(error)) {
      error = [error];
    }
    for (let i in error) {
      adapter.log.info(error[i]);
    }
  }
}

/**
 * restart adapter
 */
function restartAdapter() {
  adapter.getForeignObject('system.adapter.' + adapter.namespace, (err, obj) => {
    if (obj) adapter.setForeignObject('system.adapter.' + adapter.namespace, obj);
  });
} // endFunctionRestartAdapter


/**
 * set info channel
 * @param {*} ring 
 * @param {*} id 
 */
async function setInfo(ring, id) {
  try {
    let doorb = await ring.getAllRingsDevice(id);
    let kind = ring.getKind(id);
    let deviceId = kind + '_' + id;
    let channelId = deviceId + '.Info';

    // Create Deivce
    objectHelper.setOrUpdateObject(deviceId, {
      type: 'device',
      common: {
        name: 'Device ' + id
      },
      native: {}
    }, ['name']);

    // Create Channel
    objectHelper.setOrUpdateObject(channelId, {
      type: 'channel',
      common: {
        name: 'Info ' + id
      },
      native: {

      }
    }, ['name']);

    let info = datapoints.getObjectByName('info');
    for (let i in info) {
      let value = doorb[i] || null;
      let stateId = channelId + '.' + i;
      let common = info[i];
      let controlFunction;

      // if (!states.hasOwnProperty(stateId) || states[stateId] !== value) {
      objectHelper.setOrUpdateObject(stateId, {
        type: 'state',
        common: common
      }, ['name'], value, controlFunction);
      // }

      states[stateId] = value;
    }

    objectHelper.processObjectQueue(() => { });

  } catch (error) {
    throw ('Error setInfo(): ' + error);
  }
}

/**
 * health infos
 * @param {*} ring 
 * @param {*} id 
 */
async function setHealth(ring, id) {
  try {
    let health = await ring.getHealthSummarie(id); // health
    let deviceId = ring.getKind(id) + '_' + id;
    let channelId = deviceId + '.Info';

    // Create Deivce
    objectHelper.setOrUpdateObject(deviceId, {
      type: 'device',
      common: {
        name: 'Device ' + id
      },
      native: {}
    }, ['name']);

    // Create Channel
    objectHelper.setOrUpdateObject(channelId, {
      type: 'channel',
      common: {
        name: 'Info ' + id
      },
      native: {}
    }, ['name']);

    let info = datapoints.getObjectByName('health');
    for (let i in info) {
      let value = health[i] || null;
      let stateId = channelId + '.' + i;
      let common = info[i];
      // if (!states.hasOwnProperty(stateId) || states[stateId] !== value) {
      objectHelper.setOrUpdateObject(stateId, {
        type: 'state',
        common: common
      }, ['name'], value);
      // }
      states[stateId] = value;
    }
    objectHelper.processObjectQueue(() => { });
  } catch (error) {
    throw ('Error setHealth(): ' + error);
  }
}

/**
 * make snapshot
 * @param {*} ring 
 * @param {*} id 
 * @param {*} image 
 */
async function setSnapshot(ring, id, init) {
  try {
    let kind = ring.getKind(id);
    let deviceId = kind + '_' + id;
    let channelId = deviceId;
    let file = path.join(adapter.config.path, adapter.config.filename_snapshot);
    let snapshot = init ? undefined : await ring.getSnapshot(id, file);
    if (!init && !snapshot) return;
    let info = datapoints.getObjectByName('snapshot');
    let vis;
    // Create Deivce
    objectHelper.setOrUpdateObject(deviceId, {
      type: 'device',
      common: {
        name: 'Device ' + id
      },
      native: {}
    }, ['name']);
    for (let i in info) {
      let controlFunction;
      let value = null;
      let stateId = channelId + '.' + i;
      let common = info[i];
      let type = 'state';
      switch (i) {
        case 'jpg':
          if (snapshot) await adapter.setBinaryStateAsync(stateId, snapshot.image);
          break;
        case 'snapshot':
          type = 'meta';
          // http://<ip-iobroker>:<port-vis>/<ring-instanz>/<device>.snapshot/snapshot.jpg 
          // http://192.168.1.10:8082/ring.0/doorbell_4711.snapshot/snapshot.jpg
          if (snapshot) await adapter.writeFileAsync(adapter.namespace, deviceId + '/' + snapshot.filename, snapshot.image);
          break;
        case 'snapshot_url':
          vis = await adapter.getForeignObjectAsync('system.adapter.web.0');
          if (vis && vis.native) {
            let secure = vis.native.secure ? 'https' : 'http';
            if (snapshot) value = secure + '://' + adapter.host + ':' + vis.native.port + '/' + adapter.namespace + '/' + deviceId + '/' + snapshot.filename;
          }
          break;
        case 'snapshot_file':
          if (snapshot) {
            try {
              let oldState = await adapter.getStateAsync(stateId);
              if (oldState && oldState.val && adapter.config.del_old_snapshot) {

                delFile(oldState.val);
                await adapter.delFileAsync(adapter.namespace, deviceId + '/' + path.basename(oldState.val));
              }
            } catch (error) {
              //  
            }
            value = path.join(snapshot.pathname, snapshot.filename);
          }
          break;
        case 'snapshotrequest':
          controlFunction = async (value) => {
            if (value == true) {
              try {
                await setSnapshot(ring, id);
              } catch (error) {
                adapter.log.info(error);
              }
            }
          };
          break;
        default:
          break;
      }
      objectHelper.setOrUpdateObject(stateId, {
        type: type,
        common: common
      }, ['name'], value, controlFunction);
      // }
    }
    objectHelper.processObjectQueue(() => { });
  } catch (error) {
    throw ('Error setSanpshot): ' + error);
  }
}

/**
 * make lviestream
 * @param {*} ring 
 * @param {*} id 
 * @param {*} image 
 */
async function setLivetream(ring, id, init) {
  try {
    let kind = ring.getKind(id);
    let deviceId = kind + '_' + id;
    let channelId = deviceId;
    // if(!init) await ring.getLiveStreamSIP(id);
    let file = path.join(adapter.config.path, adapter.config.filename_livestream);
    let livestream = init ? undefined : await ring.getLiveStream(id, file);
    if (!init && !livestream) return;
    let info = datapoints.getObjectByName('livestream');
    let vis;
    // Create Deivce
    objectHelper.setOrUpdateObject(deviceId, {
      type: 'device',
      common: {
        name: 'Device ' + id
      },
      native: {}
    }, ['name']);
    for (let i in info) {
      let controlFunction;
      let value = null;
      let stateId = channelId + '.' + i;
      let common = info[i];
      let type = 'state';
      switch (i) {
        case 'mp4':
          if (livestream) await adapter.setBinaryStateAsync(stateId, livestream.video);
          break;
        case 'livestream':
          type = 'meta';
          // http://<ip-iobroker>:<port-vis>/<ring-instanz>/<device>.livestream/livestream.jpg 
          // http://192.168.1.10:8082/ring.0/doorbell_4711.livestream/livestream.jpg
          if (livestream) {
            await adapter.writeFileAsync(adapter.namespace, deviceId + '/' + livestream.filename, livestream.video);
          }
          break;
        case 'livestream_url':
          vis = await adapter.getForeignObjectAsync('system.adapter.web.0');
          if (vis && vis.native && vis.native) {
            let secure = vis.native.secure ? 'https' : 'http';
            if (livestream) value = secure + '://' + adapter.host + ':' + vis.native.port + '/' + adapter.namespace + '/' + deviceId + '/' + livestream.filename;
          }
          break;
        case 'livestream_file':
          if (livestream) {
            try {
              let oldState = await adapter.getStateAsync(stateId);
              if (oldState && oldState.val && adapter.config.del_old_livestream) {
                delFile(oldState.val);
                await adapter.delFileAsync(adapter.namespace, deviceId + '/' + path.basename(oldState.val));
              }
            } catch (error) {
              //
            }
            value = path.join(livestream.pathname, livestream.filename);
          }
          break;
        case 'livestreamrequest':
          controlFunction = async (value) => {
            if (value == true) {
              try {
                await setLivetream(ring, id);
              } catch (error) {
                adapter.log.info(error);
              }
            }
          };
          break;
        default:
          break;
      }
      objectHelper.setOrUpdateObject(stateId, {
        type: type,
        common: common
      }, ['name'], value, controlFunction);
      // }
    }
    objectHelper.processObjectQueue(() => { });
  } catch (error) {
    throw ('Error setLivetream): ' + error);
  }
}

/**
 * Ring and Motions infos
 * @param {*} ring 
 * @param {*} id 
 * @param {*} ding 
 */
async function setDingDong(ring, id, ding) {
  try {
    let kind = ring.getKind(id);
    let deviceId = kind + '_' + id;
    let channelId = deviceId;

    // Create Deivce
    objectHelper.setOrUpdateObject(deviceId, {
      type: 'device',
      common: {
        name: 'Device ' + id
      },
      native: {}
    }, ['name']);
    let info = datapoints.getObjectByName('dingdong');
    for (let i in info) {
      let controlFunction;
      let value = null;
      if (ding && ding.hasOwnProperty(i)) {
        value = ding[i];
      }
      let stateId = channelId + '.' + i;
      let common = info[i];
      let type = 'state';
      if (kind != 'cameras' && i == 'light') {
        continue;
      }
      switch (i) {
        case 'light':
          controlFunction = async (value) => {
            if (value == true) {
              try {
                await ring.setLight(ring, id, value);
              } catch (error) {
                adapter.log.info(error);
              }
            }
          };
          break;
        case 'expires_in':
          /*
            controlFunction = function (value) {
              if (value) {
                clearTimeout(timerDingDong);
                timerDingDong = setTimeout(() => {
                  (async () => {
                    await setDingDong(ring, id, ding, true);
                  })();
                }, value * 1000);
              }
            };
            */
          break;
        default:
          break;
      }
      // if (!states.hasOwnProperty(stateId) || states[stateId] !== value) {
      objectHelper.setOrUpdateObject(stateId, {
        type: type,
        common: common
      }, ['name'], value, controlFunction);
      // }
    }
    objectHelper.processObjectQueue(() => { });
  } catch (error) {
    throw ('Error setDingDong(): ' + error);
  }
}

/**
 * set History Infos. Only Motion and Dings will be shown
 * @param {*} ring 
 * @param {*} id 
 */
async function setHistory(ring, id) {
  let history;
  let videos;
  try {
    history = await ring.getHistory(id);
    videos = await ring.getLastVideos(id);

    let deviceId = ring.getKind(id) + '_' + id;
    let channelId = deviceId + '.History';
    // Create Deivce
    objectHelper.setOrUpdateObject(deviceId, {
      type: 'device',
      common: {
        name: 'Device ' + id
      },
      native: {}
    }, ['name']);

    // Create Channel
    objectHelper.setOrUpdateObject(channelId, {
      type: 'channel',
      common: {
        name: 'History'
      },
      native: {

      }
    }, ['name']);
    let info = datapoints.getObjectByName('history');
    let counter = null;
    for (let i in history) {
      if (history[i].kind == 'motion' || history[i].kind == 'ding' || history[i].kind == 'ringing' || history[i].kind == 'on_demand') {
        counter = i;
        break;
      }
    }
    for (let i in info) {
      let value = null;
      if (counter != null) {
        switch (i) {
          case 'history_url':
            value = videos && videos[counter] || null;
            // value = history[counter].apiUri || null;
            break;
          case 'created_at':
            value = history && history[counter][i].toString() || null;
            break;
          default:
            value = history && history[counter][i] || null;
        }
      }
      let stateId = channelId + '.' + i;
      let common = info[i];

      // if (!states.hasOwnProperty(stateId) || states[stateId] !== value) {
      objectHelper.setOrUpdateObject(stateId, {
        type: 'state',
        common: common
      }, ['name'], value);
      // }
      states[stateId] = value;

    }
    objectHelper.processObjectQueue(() => { });

  } catch (error) {
    if (!history) {
      throw (error);
    }
  }
}

/**
 * Polling Health every x seconds
 * @param {*} ring 
 * @param {*} id 
 */
async function pollHealth(ring, id) {

  let healthtimeout = setTimeout((async () => {
    try {
      await setHealth(ring, id);
      await setHistory(ring, id);
    } catch (error) {
      adapter.log.info(error);
    }
    await pollHealth(ring, id);
  }), adapter.config.pollsec * 1000);

  return healthtimeout;
}

/**
 * main function for ring
 */
async function ringer() {
  let dbids;
  try {
    ring = ring || new ringapiclient.RingApiClient(adapter);
    dbids = await ring.getAllRingsDevices();
    errorcounter = 0;
  } catch (error) {
    // if, error we will get a new ring connection
    errorcounter++;
    ringdevices = {};
    states = {};
    ring = null; // we start from beginning
    adapter.log.info(error);
    if (errorcounter >= errorcountmax) {
      adapter.log.error('To many connection errors, restarting adapter');
      restartAdapter();
    }
    return;
  }
  try {
    if (ring && dbids) {
      for (let j in dbids) {
        let id = dbids[j].id;
        // If device exist skipp function!
        if (id) {
          if (!ringdevices[id]) {
            adapter.log.info('Starting Ring Device for Id ' + id);
            try { setInfo(ring, id, true); } catch (error) { adapter.log.info(error); }
            try { setHealth(ring, id); } catch (error) { adapter.log.info(error); }
            try { setDingDong(ring, id, true); } catch (error) { adapter.log.info(error); }
            try { setHistory(ring, id); } catch (error) { adapter.log.info(error); }
            try { setSnapshot(ring, id, true); } catch (error) { adapter.log.info(error); }
            try { setLivetream(ring, id, true); } catch (error) { adapter.log.info(error); }
            // healthtimeout = await pollHealth(ring, id);
            // On Event ding or motion do something
            await ring.eventOnNewDing(id, async (ding) => {
              adapter.log.info('Ding Dong for Id ' + id + ' (' + ding.kind + ', ' + ding.state + ')');
              adapter.log.debug('Ding Dong for Id ' + id + JSON.stringify(ding));
              try { await setDingDong(ring, id, ding); } catch (error) { adapter.log.info(error); }
              if (ding.kind != 'on_demand') {
                try { setSnapshot(ring, id); } catch (error) { adapter.log.info(error); }
                try { setLivetream(ring, id); } catch (error) { adapter.log.info(error); }
              }
            });
            await ring.eventOnSnapshot(id, async (data) => {
            });
            await ring.eventOnLivestream(id, async (data) => {
            });
            await ring.eventOnRefreshTokenUpdated(id, async (data) => {
              if (data) {
                if (data.newRefreshToken != adapter.config.refreshtoken) {
                  adapter.log.info('Old refresh token : ' + data.oldRefreshToken);
                  adapter.log.info('New refresh token : ' + data.newRefreshToken);
                  adapter.log.info('Two face authentication successfully set. Adapter is restarting!');
                  let obj = await adapter.getForeignObjectAsync('system.config');
                  let secret = obj && obj.native && obj.native.secret ? obj.native.secret : 'Zgfr56gFe87jJOM';
                  await adapter.extendForeignObjectAsync('system.adapter.' + adapter.namespace, {
                    native: {
                      twofaceauth: false,
                      email: adapter.config.email,
                      password: encrypt(secret, adapter.config.password),
                      refreshtoken: data.newRefreshToken
                    }
                  });
                }
              }
            });
            ringdevices[id] = true; // add Device to Array
          } else {
            try { await setHealth(ring, id); } catch (error) { adapter.log.info(error); }
            try { await setHistory(ring, id); } catch (error) { adapter.log.info(error); }
            let deviceId = ring.getKind(id) + '_' + id;
            adapter.getObject(deviceId, (err, object) => {
              if (err || !object) {
                delete ringdevices[id];
              }
            });
          }
        }
      }
    }
  } catch (error) {
    adapter.log.info(error);
  }
}

async function poll_ringer() {
  // await doorbot.main(adapter);
  let pollsec = adapter.config.pollsec;
  if (errorcounter > 0) {
    let wait = 60;
    pollsec = adapter.config.pollsec > wait ? adapter.config.pollsec : wait;
  }
  await ringer();
  setTimeout(async () => {
    await poll_ringer();
  }, pollsec * 1000);
}

/**
 * Main
 */
async function main() {
  try {
    adapter.log.info('Starting Adapter ' + adapter.namespace + ' in version ' + adapter.version);
    if (await setSentryLogging(adapter.config.sentry_enable)) return;
    await refreshToken();
    adapter.config.recordtime_livestream = adapter.config.recordtime_livestream || 0;
    adapter.config.path = adapter.config.path || path.join(adapter.adapterDir, adapter.namespace, 'snapshot'); // '/Users/thorsten.stueben/Downloads/public'
    adapter.config.filename_snapshot = adapter.config.filename_snapshot || 'snapshot.jpg';
    adapter.config.filename_livestream = adapter.config.filename_livestream || 'livestream.mp4';
    if (!fs.existsSync(adapter.config.path)) fs.mkdirSync(adapter.config.path, { recursive: true });
    if (!semver.satisfies(process.version, adapterNodeVer)) {
      adapter.log.error(`Required node version ${adapterNodeVer} not satisfied with current version ${process.version}.`);
      return;
    }
    await poll_ringer();
  } catch (e) {
    // 
  }
}

/**
 * If started as allInOne mode => return function to create instance
 */
if (typeof module !== 'undefined' && module.parent) {
  module.exports = startAdapter;
} else {
  // or start the instance directly
  startAdapter();
}