'use strict';

const utils = require(__dirname + '/lib/utils'); // Get common adapter utils
let adapter = new utils.Adapter('ring');
let doorbell = require(__dirname + '/lib/doorbell');


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
// Main
// *****************************************************************************************************
function main() {
  // Pronise function 
 
  (async () => {

    try {
      let ring = await new doorbell.Doorbell(adapter);
      let devices = await ring.getDevices();
      let dbids = await ring.getDoorbells();

      for (let j in dbids) {

        let id = dbids[j].id;
        let doorb = await ring.getDoorbell(id);
        let livestream = await ring.getLiveStream(id);
        let health = await ring.getHealthSummarie(id);
        let history = await ring.getHistory(id);
        let urls = await ring.getLastVideos(id);
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
          health = await ring.getHealthSummarie(id);
        }), 60 * 1000);

        events.on('dingdong', (ding) => {
          adapter.log.info("Ding Dong for Id " + id + JSON.stringify(ding));
        });
      

      }
    } catch (error) {
      adapter.log.error("Error: " + error);
    }
  })();
}