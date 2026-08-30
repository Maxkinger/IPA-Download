import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {resolveDeviceSupportDirectory} from '../src/device.js';

test('uses IDAPastel default device storage on every supported desktop platform', () => {
    const home = join('/', 'Users', 'fixture');

    assert.equal(
        resolveDeviceSupportDirectory({platform: 'darwin', home, env: {}}),
        join(home, 'Library', 'Application Support', 'IDAPastel'),
    );
    assert.equal(
        resolveDeviceSupportDirectory({platform: 'win32', home, env: {}}),
        join(home, 'IDAPastel'),
    );
    assert.equal(
        resolveDeviceSupportDirectory({platform: 'linux', home, env: {}}),
        join(home, '.config', 'IDAPastel'),
    );
});

test('keeps explicit Swift-provided device and session directory overrides', () => {
    assert.equal(
        resolveDeviceSupportDirectory({
            platform: 'darwin',
            home: '/unused',
            env: {IPA_DEVICE_DIR: '/private/idapastel/device'},
        }),
        '/private/idapastel/device',
    );
    assert.equal(
        resolveDeviceSupportDirectory({
            platform: 'linux',
            home: '/unused',
            env: {IPA_SESSION_DIR: '/private/idapastel/sessions'},
        }),
        '/private/idapastel',
    );
});
