import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Ipa} from '../src/ipa.js';

const credentials = {APPLE_ID: 'user@example.com', PASSWORD: 'secret', CODE: ''};

test('resolves only an implicit Apple TV version', async () => {
    const app = new Ipa(credentials, {
        lookupTVVersion: async () => '123456',
        validatePackage: async () => {},
    });
    assert.equal(await app.resolveAppVersionID('42', '', 'appletv'), '123456');
    assert.equal(await app.resolveAppVersionID('42', '777', 'appletv'), '777');
    assert.equal(await app.resolveAppVersionID('42', '', 'iphone'), '');
});

test('removes a package rejected by Apple TV validation', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'idapastel-download-flow-'));
    const output = join(directory, 'wrong-platform.ipa');
    writeFileSync(output, 'fixture');
    const app = new Ipa(credentials, {
        lookupTVVersion: async () => '123456',
        validatePackage: async () => {
            const error = new Error('wrong platform');
            error.code = 'TVOS_PLATFORM_MISMATCH';
            throw error;
        },
    });
    app.out = output;
    await assert.rejects(() => app.validateDownloadedPackage('appletv'));
    assert.equal(existsSync(output), false);
    rmSync(directory, {recursive: true, force: true});
});
