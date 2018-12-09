'use strict';

const utils = require(__dirname + '/lib/utils'); // Get common adapter utils
let adapter = new utils.Adapter('ring');
let Doorbell2 = require(__dirname + '/lib/doorbell2');
let Doorbell = require(__dirname + '/lib/doorbell');


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
        //noinspection JSUnresolvedVariable
        adapter.config.password = decrypt(obj.native.secret, adapter.config.password);
      } else {
        //noinspection JSUnresolvedVariable
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

  //let ring2  = new Doorbell2(adapter);
  //ring2.test();

  let ring = new Doorbell(adapter);
  let events = ring.getEvent();

  let dingdong = ring.dingDong();
  dingdong();
  events.on('dingdong', (ding) => {
    adapter.log.info(JSON.stringify(ding));
  });

  /*
  ring.getLiveStream()().then((urls) => {
    adapter.log.info(JSON.stringify(urls));
  }).catch((error) => {
  });

  ring.getHealthSummarie()().then((healths) => {
    adapter.log.info(JSON.stringify(healths));
  }).catch((error) => {
  });
  */

  let actions = [
    () => ring.getLiveStream()(),
    () => ring.getHealthSummarie()(),
    () => ring.getHistory()(),
    () => ring.getLastVideos()() 
    
  ];
  let promise = Promise.resolve();
  let results = [];
  for (let action of actions) {
    promise = promise.then(action).then((r) => results.push(r));
  }
  promise.then(() => adapter.log.info("Done with results " + JSON.stringify(results)));

}