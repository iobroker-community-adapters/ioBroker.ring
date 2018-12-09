'use strict';

const utils = require(__dirname + '/lib/utils'); // Get common adapter utils
let adapter = new utils.Adapter('ring');
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

  let ring  = new Doorbell(adapter);
  ring.test();

}