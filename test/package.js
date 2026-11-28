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

// Regression guard: a static import of the native "sharp" crashes the adapter on start where its
// binary cannot be loaded (#1024, #797). It may only be loaded with import() in ImageService.loadSharp().
describe('native image library "sharp" (#1024)', () => {
    it('is not imported statically by any source file', () => {
        const sourceFiles = [];
        const collect = dir => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    collect(fullPath);
                } else if (/\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
                    sourceFiles.push(fullPath);
                }
            }
        };
        collect(path.join(__dirname, '..', 'src'));
        assert.ok(sourceFiles.length > 0, 'No source files found');

        const staticImport = /^\s*(?:import(?!\s+type\b)[^;]*?\bfrom\s*|import\s*|export[^;]*?\bfrom\s*)['"]sharp['"]|\brequire\(\s*['"]sharp['"]\s*\)/m;
        const offenders = sourceFiles.filter(file => staticImport.test(fs.readFileSync(file, 'utf8')));
        assert.deepEqual(offenders, [], `"sharp" is imported statically in: ${offenders.join(', ')}`);
    });
});
