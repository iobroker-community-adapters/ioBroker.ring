/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */

'use strict';

const utils = require('@iobroker/adapter-core');
const objectHelper = require('@apollon/iobroker-tools').objectHelper; // Get common adapter utils
const doorbell = require(__dirname + '/lib/doorbell');
const doorbot = require(__dirname + '/lib/doorbot');
const datapoints = require(__dirname + '/lib/datapoints');
const semver = require('semver');
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

  // *****************************************************************************************************
  // is called when adapter shuts down - callback has to be called under any circumstances!
  // *****************************************************************************************************
  adapter.on('unload', (callback) => {
    try {
      adapter.log.info('Closing Adapter');
      callback();
    } catch (e) {
      callback();
    }
  });


  // *****************************************************************************************************
  // Listen for sendTo messages
  // *****************************************************************************************************
  adapter.on('message', (msg) => {
    adapter.sendTo(msg.from, msg.command, 'Execute command ' + msg.command, msg.callback);
  });

  // *****************************************************************************************************
  // Listen for object Changes
  // *****************************************************************************************************
  adapter.on('objectChange', (id, obj) => {
    // adapter.log.info('objectChange for id  ' + id);
  });



  // *****************************************************************************************************
  // Listen State chnages
  // *****************************************************************************************************
  adapter.on('stateChange', (id, state) => {
    objectHelper.handleStateChange(id, state);
  });

  // *****************************************************************************************************
  // is called when databases are connected and adapter received configuration.
  // start here!
  // *****************************************************************************************************
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

// *****************************************************************************************************
// Password decrypt
// *****************************************************************************************************
function decrypt(key, value) {
  let result = '';
  for (let i = 0; i < value.length; ++i) {
    result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
  }
  return result;
}

// *****************************************************************************************************
// Build Error Message
// *****************************************************************************************************
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

// *****************************************************************************************************
// Restart Adapter
// *****************************************************************************************************
function restartAdapter() {
  adapter.getForeignObject('system.adapter.' + adapter.namespace, (err, obj) => {
    if (obj) adapter.setForeignObject('system.adapter.' + adapter.namespace, obj);
  });
} // endFunctionRestartAdapter


// *****************************************************************************************************
// Set Info channel
// *****************************************************************************************************
async function setInfo(ring, id) {
  let doorb;
  try {
    // doorb = await ring.getDoorbell(id); // Info
    doorb = await ring.getAllRingsDevice(id);
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
      // if (states[stateId] != value) {

      objectHelper.setOrUpdateObject(stateId, {
        type: 'state',
        common: common
      }, ['name'], value, controlFunction);
      // }

      states[stateId] = value;
    }

    objectHelper.processObjectQueue(() => { });



  } catch (error) {
    throw (error);
  }
}

// *****************************************************************************************************
// Set Health infos
// *****************************************************************************************************
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
      native: {

      }
    }, ['name']);

    let info = datapoints.getObjectByName('health');
    for (let i in info) {
      let value = health[i] || null;
      let stateId = channelId + '.' + i;
      let common = info[i];
      // if (states[stateId] != value) {
      objectHelper.setOrUpdateObject(stateId, {
        type: 'state',
        common: common
      }, ['name'], value);
      // }
      states[stateId] = value;
    }
    objectHelper.processObjectQueue(() => { });
  } catch (error) {
    throw (error);
  }
}

// *****************************************************************************************************
// set Livestream 
// *****************************************************************************************************
async function setLivestream(ring, id, init) {
  try {
    let livestream = !init ? await ring.getLiveStream(id) : {};
    let deviceId = ring.getKind(id) + '_' + id;
    let channelId = deviceId + '.Livestream';

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
        name: 'Livestream ' + id
      },
      native: {

      }
    }, ['name']);

    let info = datapoints.getObjectByName('livestream');
    for (let i in info) {
      let controlFunction;
      let value = livestream[i] || null;
      if (init) {
        // let type = typeof value;
        let type = info[i].type;
        switch (type) {
          case 'number':
            value = 0;
            break;
          case 'object':
            value = {};
            break;
          default:
            value = '';
        }
      }
      let stateId = channelId + '.' + i;
      let common = info[i];
      if (i == 'expires_in') {
        /*
				controlFunction = function (value) {
				  if (value) {
					clearTimeout(timerLiveStream);
					timerLiveStream = setTimeout(() => {
					  (async () => {
						await setLivestream(ring, id, true);
					  })();
					}, value * 1000);
				  }
				};
				*/
      }
      if (i == 'livestreamrequest') {
        controlFunction = async (value) => {
          if (value == true) {
            try {
              await setLivestream(ring, id);
            } catch (error) {
              adapter.log.info(error);
            }
          }
        };
      }

      // if (states[stateId] != value) {
      objectHelper.setOrUpdateObject(stateId, {
        type: 'state',
        common: common
      }, ['name'], value, controlFunction);
      // }
      states[stateId] = value;

    }
    objectHelper.processObjectQueue(() => { });
  } catch (error) {
    throw (error);
  }
}

async function setSnapshot(ring, id, image) {
  try {
    let kind = ring.getKind(id);
    let deviceId = kind + '_' + id;
    let stateId = deviceId + '.snapshot';
    let snapshotfile = ring.getSnapshotFilename(id);
    await adapter.setObjectNotExistsAsync(stateId, {
      type: 'meta',
      common: {
        name: 'Snapshot File',
        role: 'meta.user',
        read: true,
        write: false
      },
      native: {}
    });
    if (!image) {
      let doorbot = await ring.getAllRingsDevice(id);
      image = await ring.getSnapshot(doorbot);
    }
    if (image) {
      // http://<ip-iobroker>:<port-vis>/<instanz>/<device>.snapshot/snapshot.jpg 
      // http://192.168.1.10:8082/ring.0/doorbell_4711.snapshot/snapshot.jpg
      await adapter.writeFileAsync(adapter.namespace, deviceId + '.snapshot/snapshot.jpg', image);
      fs.writeFileSync(snapshotfile, image);
    }
  } catch (error) {
    throw ('Error setSanpshot): ' + error);
  }
}

// *****************************************************************************************************
// Ring and Motions infos
// *****************************************************************************************************
async function setDingDong(ring, id, ding, init) {
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

    // Create Channel
    objectHelper.setOrUpdateObject(channelId, {
      type: 'channel',
      common: {
        name: 'Info ' + id
      },
      native: {

      }
    }, ['name']);

    let info = datapoints.getObjectByName('dingdong');
    for (let i in info) {
      let controlFunction;
      let value = null;
      if (ding && ding[i]) {
        value = ding[i];
      }
      if (init) {
        // let type = typeof value;
        let type = info[i].type;
        switch (type) {
          case 'number':
            value = 0;
            break;
          case 'object':
            value = {};
            break;
          default:
            value = '';
        }
      }
      let stateId = channelId + '.' + i;
      let common = info[i];

      if (kind != 'cameras' && i == 'light') {
        continue;
      }

      switch (i) {
        case 'snapshot':
          await setSnapshot(ring, id, value);
          break;
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

      objectHelper.setOrUpdateObject(stateId, {
        type: 'state',
        common: common
      }, ['name'], value, controlFunction);
    }
    objectHelper.processObjectQueue(() => { });
  } catch (error) {
    throw ('Error setDingDong(): ' + error);
  }
}


// *****************************************************************************************************
// set History Infos. Only Motion and Dings will be shown
// *****************************************************************************************************
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
      if (history[i].kind == 'motion' || history[i].kind == 'ding' || history[i].kind == 'ringing') {
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

      // if (states[stateId] != value) {
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

// *****************************************************************************************************
// Polling Health every x seconds
// *****************************************************************************************************
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

// *****************************************************************************************************
// Main Function for ring
// *****************************************************************************************************
async function ringer() {
  let dbids;
  try {
    adapter.log.info('Using follwoing API: ' + adapter.config.api);
    if(adapter.config.api === 'ring-api') ring = ring || await new doorbell.Doorbell(adapter);
    if(adapter.config.api === 'doorbot') ring = ring || await new doorbot.Doorbell(adapter);
    adapter.log.debug('Ring ' + JSON.stringify(ring));
    // let devices = await ring.getDevices();
    // let dbids = await ring.getDoorbells();
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
            // let doorb = await ring.getDoorbell(id); // Info
            try { await setInfo(ring, id, true); } catch (error) { adapter.log.info(error); }
            try { await setHealth(ring, id); } catch (error) { adapter.log.info(error); }
            try { await setLivestream(ring, id, true); } catch (error) { adapter.log.info(error); }
            try { await setDingDong(ring, id, null); } catch (error) { adapter.log.info(error); }
            try { await setHistory(ring, id); } catch (error) { adapter.log.info(error); }
            // healthtimeout = await pollHealth(ring, id);

            // On Event ding or motion do something
            await ring.event(id, async (ding) => {
              adapter.log.info('Ding Dong for Id ' + id + ' (' + ding.kind + ', ' + ding.state + ')');
              adapter.log.debug('Ding Dong for Id ' + id + JSON.stringify(ding));
              try { await setDingDong(ring, id, ding); } catch (error) { adapter.log.info(error); }
              try { await setHistory(ring, id); } catch (error) { adapter.log.info(error); }
            });
            ringdevices[id] = true; // add Device to Array
          } else {
            try { await setHealth(ring, id); } catch (error) { adapter.log.info(error); }
            try { await setHistory(ring, id); } catch (error) { adapter.log.info(error); }
            // try { await setSnapshot(ring, id); } catch (error) { adapter.log.info(error); }
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


// *****************************************************************************************************
// Main
// *****************************************************************************************************
function main() {
  adapter.log.info('Starting Adapter ' + adapter.namespace + ' in version ' + adapter.version);
  if (!semver.satisfies(process.version, adapterNodeVer)) {
    adapter.log.error(`Required node version ${adapterNodeVer} not satisfied with current version ${process.version}.`);
    return;
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
  poll_ringer();
}

// If started as allInOne mode => return function to create instance
if (typeof module !== 'undefined' && module.parent) {
  module.exports = startAdapter;
} else {
  // or start the instance directly
  startAdapter();
}