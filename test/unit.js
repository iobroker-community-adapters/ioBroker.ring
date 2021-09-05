const path = require('path');
const { tests } = require('@iobroker/testing');

// Run unit tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
tests.integration(path.join(__dirname, '..'), {
  allowedExitCodes: [11],
});
