const path = require('path');
const { tests } = require('@iobroker/testing');

// Validate the package files
tests.packageFiles(path.join(__dirname, '..'));

// Regression guard: ring-client-api must actually load the fixed FCM decryption package,
// including when npm places a separate receiver version in a nested node_modules folder.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');

describe('FCM push notifications (#1056)', () => {
    it('uses @eneris/push-receiver >= 4.3.1 as resolved by ring-client-api', () => {
        const ringRequire = createRequire(require.resolve('ring-client-api'));
        const receiverEntry = ringRequire.resolve('@eneris/push-receiver');
        const receiverPackage = JSON.parse(
            fs.readFileSync(path.join(path.dirname(receiverEntry), '..', 'package.json'), 'utf8'),
        );
        const parsedVersion = /^(\d+)\.(\d+)\.(\d+)/.exec(receiverPackage.version);
        assert.ok(parsedVersion, 'Unable to parse installed push receiver version');

        const [major, minor, patch] = parsedVersion.slice(1).map(Number);
        assert.ok(
            major > 4 || (major === 4 && (minor > 3 || (minor === 3 && patch >= 1))),
            `ring-client-api loads vulnerable @eneris/push-receiver@${receiverPackage.version} from ${receiverEntry}`,
        );
    });
});
