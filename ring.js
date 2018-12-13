'use strict';

const utils = require(__dirname + '/lib/utils'); // Get common adapter utils
const adapter = new utils.Adapter('ring');
const objectHelper = require(__dirname + '/lib/objectHelper');
const doorbell = require(__dirname + '/lib/doorbell');
const datapoints = require(__dirname + '/lib/datapoints');
let ring = null;

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
// Listen for sendTo messages
// *****************************************************************************************************
adapter.on('objectChange', (id, obj) => {

  adapter.sendTo("Change ID " + id);

});



// *****************************************************************************************************
// Listen for sendTo messages
// *****************************************************************************************************
adapter.on('stateChange', (id, state) => {
  adapter.sendTo("Change ID " + id + " = " + state.val);
  let regex = /ring.+.RING_(.+).Livestream.livestreamrequest/gm;
  let m;
  if ((m = regex.exec(id)) !== null) {
    let rId = m[1] || null;
    if (rId && state.val == true) {
      (async () => {
        await setLivestream(ring, rId);
      })();
    }
  }
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
    main();
  });
});


// *****************************************************************************************************
// Add objects
// *****************************************************************************************************
async function setInfo(ring, id) {

  let doorb = await ring.getDoorbell(id); // Info
  let deviceId = adapter.namespace + '.RING_' + id;
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
    objectHelper.setOrUpdateObject(stateId, {
      type: 'state',
      common: common
    }, ['name'], value);
  }

  objectHelper.processObjectQueue(() => { });

}

// *****************************************************************************************************
// Add objects
// *****************************************************************************************************
async function setHealth(ring, id) {

  let health = await ring.getHealthSummarie(id); // health
  let deviceId = adapter.namespace + '.RING_' + id;
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
    objectHelper.setOrUpdateObject(stateId, {
      type: 'state',
      common: common
    }, ['name'], value);
  }

  objectHelper.processObjectQueue(() => { });

}

async function setLivestream(ring, id) {

  let livestream = await ring.getLiveStream(id);
  let deviceId = adapter.namespace + '.RING_' + id;
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
    let value = livestream[i] || null;
    let stateId = channelId + '.' + i;
    let common = info[i];
    objectHelper.setOrUpdateObject(stateId, {
      type: 'state',
      common: common
    }, ['name'], value);
  }

  objectHelper.processObjectQueue(() => { });

}

async function setDingDong(ring, id, ding) {

  let deviceId = adapter.namespace + '.RING_' + id;
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
    let value = null;
    if (ding && ding[i]) value = ding[i];
    let stateId = channelId + '.' + i;
    let common = info[i];
    objectHelper.setOrUpdateObject(stateId, {
      type: 'state',
      common: common
    }, ['name'], value);
  }

  objectHelper.processObjectQueue(() => { });

}

async function setHistory(ring, id) {

  let history = await ring.getHistory(id);
  let deviceId = adapter.namespace + '.RING_' + id;
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
  let counter = 0;
  for (let i in info) {
    let value = null;
    switch (i) {
      case 'history_url':
        value = history[counter].apiUri || null;
        break;
      default:
        value = history[counter][i] || null;
    }
    let stateId = channelId + '.' + i;
    let common = info[i];
    objectHelper.setOrUpdateObject(stateId, {
      type: 'state',
      common: common
    }, ['name'], value);
  }

  objectHelper.processObjectQueue(() => { });

}

// *****************************************************************************************************
// Main
// *****************************************************************************************************
function main() {
  // Pronise function 

  (async () => {

    objectHelper.init(adapter);

    try {
      ring = await new doorbell.Doorbell(adapter);
      let devices = await ring.getDevices();
      let dbids = await ring.getDoorbells();

      for (let j in dbids) {

        let id = dbids[j].id;
        // let doorb = await ring.getDoorbell(id); // Info
        await setInfo(ring, id);
        await setHealth(ring, id);
        await setLivestream(ring, id);
        await setDingDong(ring, id);
        await setHistory(ring, id);
        // let livestream = await ring.getLiveStream(id);
        // let health = await ring.getHealthSummarie(id);
        // let history = await ring.getHistory(id);
        // let urls = await ring.getLastVideos(id);
        let events = await ring.dingDong(id);

        /*
        adapter.log.info("LiveStream: " + JSON.stringify(livestream));
        adapter.log.info("Health: " + JSON.stringify(health));

        for (let i in history) {
          adapter.log.info("History: " + i + " = " + JSON.stringify(history[i]));
        }
        for (let i in urls) {
          adapter.log.info("Url: " + i + " = " + JSON.stringify(urls[i]));
        }
        */

        setInterval((async () => {
          await setHealth(ring, id);
          await setHistory(ring, id);
          // health = await ring.getHealthSummarie(id);
        }), 60 * 1000);

        events.on('dingdong', (ding) => {
          adapter.log.info("Ding Dong for Id " + id + JSON.stringify(ding));
          (async () => {
            await setDingDong(ring, id, ding);
            await setHistory(ring, id);
          })();
        });

        adapter.subscribeStates(adapter.namespace + ".*.Livestream.livestreamrequest");

      }
    } catch (error) {
      adapter.log.error("Error: " + error);
    }
  })();
}