'use strict';

const utils = require(__dirname + '/lib/utils'); // Get common adapter utils
const adapter = new utils.Adapter('ring');
const objectHelper = require(__dirname + '/lib/objectHelper');
const doorbell = require(__dirname + '/lib/doorbell');
const datapoints = require(__dirname + '/lib/datapoints');
let ring = null;
let ringdevices = {};
let timerDingDong;
let timerLiveStream;
let states = {};

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
// is called when adapter shuts down - callback has to be called under any circumstances!
// *****************************************************************************************************
adapter.on('unload', (callback) => {
  try {
    adapter.log.info('Closing Adapter');
    callback();
  } catch (e) {
    // adapter.log.error('Error');
    callback();
  }
});


// *****************************************************************************************************
// Listen for sendTo messages
// *****************************************************************************************************
adapter.on('message', (msg) => {
  adapter.sendTo(msg.from, msg.command, "Execute command " + msg.command, msg.callback);
});

// *****************************************************************************************************
// Listen for object Changes
// *****************************************************************************************************
adapter.on('objectChange', (id, obj) => {
  adapter.log.info("objectChange for id  " + id);
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


// *****************************************************************************************************
// Set Info channel
// *****************************************************************************************************
async function setInfo(ring, id) {
  let doorb;
  try {
    doorb = await ring.getDoorbell(id); // Info
    let deviceId = 'RING_' + id;
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
        name: 'Info'
      },
      native: {

      }
    }, ['name']);

    let info = datapoints.getObjectByName('info');
    for (let i in info) {
      let value = doorb[i] || null;
      let stateId = channelId + '.' + i;
      let common = info[i];
      if (states[stateId] != value) {
        objectHelper.setOrUpdateObject(stateId, {
          type: 'state',
          common: common
        }, ['name'], value);
      }
      states[stateId] = value;
    }

    objectHelper.processObjectQueue(() => { });
  } catch (error) {
    adapter.log.error("Error: " + error);
  }
}

// *****************************************************************************************************
// Set Health infos
// *****************************************************************************************************
async function setHealth(ring, id) {
  try {
    let health = await ring.getHealthSummarie(id); // health
    let deviceId = 'RING_' + id;
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
        name: 'Info'
      },
      native: {

      }
    }, ['name']);

    let info = datapoints.getObjectByName('health');
    for (let i in info) {
      let value = health[i] || null;
      let stateId = channelId + '.' + i;
      let common = info[i];
      if (states[stateId] != value) {
        objectHelper.setOrUpdateObject(stateId, {
          type: 'state',
          common: common
        }, ['name'], value);
      }
      states[stateId] = value;
    }
    objectHelper.processObjectQueue(() => { });
  } catch (error) {
    adapter.log.info("Error: " + error);
  }
}

// *****************************************************************************************************
// set Livestream 
// *****************************************************************************************************
async function setLivestream(ring, id, init) {
  try {
    let livestream = !init ? await ring.getLiveStream(id) : {};
    let deviceId = 'RING_' + id;
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
        name: 'Info'
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
        controlFunction = function (value) {
          if (value == true) {
            (async () => {
              await setLivestream(ring, id);
            })();
          }
        };
      }

      if (states[stateId] != value) {
        objectHelper.setOrUpdateObject(stateId, {
          type: 'state',
          common: common
        }, ['name'], value, controlFunction);
      }
      states[stateId] = value;

    }
    objectHelper.processObjectQueue(() => { });
  } catch (error) {
    adapter.log.error("Error: " + error);
  }
}

// *****************************************************************************************************
// Ring and Motions infos
// *****************************************************************************************************
async function setDingDong(ring, id, ding, init) {

  let deviceId = 'RING_' + id;
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
      name: 'Info'
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
    if (i == 'expires_in') {
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
    }
    objectHelper.setOrUpdateObject(stateId, {
      type: 'state',
      common: common
    }, ['name'], value, controlFunction);

  }
  objectHelper.processObjectQueue(() => { });

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
    let deviceId = 'RING_' + id;
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
      if (history[i].kind == 'motion' || history[i].kind == 'ding') {
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

      if (states[stateId] != value) {
        objectHelper.setOrUpdateObject(stateId, {
          type: 'state',
          common: common
        }, ['name'], value);
      }
      states[stateId] = value;

    }
    objectHelper.processObjectQueue(() => { });
  } catch (error) {
    !history && adapter.log.error("Error: " + error);
  }
}

// *****************************************************************************************************
// Polling Health every x seconds
// *****************************************************************************************************
function poolHealth(ring, id) {

  setTimeout((async () => {
    try {
      await setHealth(ring, id);
      await setHistory(ring, id);
      poolHealth(ring, id);
    } catch (error) {
      adapter.log.error("Error: " + error);
      poolHealth(ring, id);
    }
  }), adapter.config.pollsec * 1000);

}

// *****************************************************************************************************
// Main Function for ring
// *****************************************************************************************************
async function ringer() {
  try {
    ring = ring || await new doorbell.Doorbell(adapter);
    let devices = await ring.getDevices();
    let dbids = await ring.getDoorbells();

    for (let j in dbids) {

      let id = dbids[j].id;

      if (!ringdevices[id]) {

        // let doorb = await ring.getDoorbell(id); // Info
        await setInfo(ring, id, true);
        await setHealth(ring, id);
        await setLivestream(ring, id, true);
        await setDingDong(ring, id, null);
        await setHistory(ring, id);
        await poolHealth(ring, id)

        await ring.event(id, (ding) => {
          adapter.log.info("Ding Dong for Id " + id + JSON.stringify(ding));
          (async () => {
            await setDingDong(ring, id, ding);
            await setHistory(ring, id);
          })();
        })

        ringdevices[id] = true;
      } else {
        let deviceId = 'RING_' + id;
        adapter.getObject(deviceId, (err, object) => {
          if (err || !object) {
            delete ringdevices[id];
          }
        });
      }
    }
  } catch (error) {
    // if, erro we will get a new ring connection
    ringdevices = {};
    states = {};
    ring = null; // we start from beginning
    adapter.log.error("Error: " + error);
  }
}


// *****************************************************************************************************
// Main
// *****************************************************************************************************
function main() {
  function poll_ringer() {
    (async () => {
      await ringer();
      setTimeout(() => {
        poll_ringer();
      }, adapter.config.pollsec * 1000);
    })();
  }
  poll_ringer();
}