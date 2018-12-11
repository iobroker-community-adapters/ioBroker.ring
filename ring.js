'use strict';

const utils = require(__dirname + '/lib/utils'); // Get common adapter utils
let adapter = new utils.Adapter('ring');
let Doorbell2 = require(__dirname + '/lib/doorbell2');
let doorbell = require(__dirname + '/lib/doorbell');

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


function startRing(ring, callback) {

  if (ring) {

    ring.getDevices()().then((devices) => {
      adapter.log.info("Starting Ring");
      callback && callback(devices);
    }).catch((error) => {
      adapter.log.error("Error starting Ring!");
    });

  }


}

// *****************************************************************************************************
// Main
// *****************************************************************************************************
function main() {

  //let ring2  = new Doorbell2(adapter);
  //ring2.test();

  let ring = new doorbell.Doorbell(adapter);

  (async () => {


    let id = '17877585';
    let test = await new doorbell.Test(adapter);
    let devices = await test.getDevices();
    let dbids = await test.getDoorbells();
    let doorb = await test.getDoorbell(id);
    let livestream = await test.getLiveStream(id);
    let health = await test.getHealthSummarie(id);
    let history = await test.getHistory(id);
    let urls = await test.getLastVideos(id);
    let events = await test.dingDong(id);

    adapter.log.info("LiveStream: " + JSON.stringify(livestream));
    adapter.log.info("Health: " + JSON.stringify(health));

    for (let i in history) {
      adapter.log.info("History: " + i + " = " + JSON.stringify(history[i]));
    }

    for (let i in urls) {
      adapter.log.info("Url: " + i + " = " + JSON.stringify(urls[i]));
    }

    events.on('dingdong', (ding) => {
      adapter.log.info("Ding Dong " + JSON.stringify(ding));
    });


  })();

  /*
   startRing(ring, (devices) => {
 
 
     for (let i in devices) {
       adapter.log.info("Devices " + i + " = " + JSON.stringify(devices[i]));
     }
 
     let events = ring.getEvent();
     let dingdong = ring.dingDong();
     let huhu = dingdong();
     events.on('dingdong', (ding) => {
       for (let i in ding) {
         adapter.log.info("Ding Dong " + i + " = " + JSON.stringify(ding[i]));
       }
     });
 */
  /*
  ring.getLiveStream()().then((sip) => {
    for (let i in sip) {
      adapter.log.info("LiveStream: " + i + " = " + JSON.stringify(sip[i]));
    }
  }).catch((error) => {
  });
  */
  /*
  ring.getLiveStream()().then((sip) => {
    for (let i in sip) {
      adapter.log.info("LiveStream: " + i + " = " + JSON.stringify(sip[i]));
    }
    return ring.getHealthSummarie()();
  }).then((healths) => {
    for (let i in healths) {
      adapter.log.info("Healths: " + i + " = " + JSON.stringify(healths[i]));
    }
    return ring.getHistory()();
  }).then((history) => {
    for (let i in history) {
      adapter.log.info("History: " + i + " = " + JSON.stringify(history[i]));
    }
    return ring.getLastVideos()();
  }).then((urls) => {
    for (let i in urls) {
      adapter.log.info("Url: " + i + " = " + JSON.stringify(urls[i]));
    }
  }).catch((error) => {
  });


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
  */

  //  });

}