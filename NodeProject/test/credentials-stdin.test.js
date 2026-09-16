import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {Readable} from 'node:stream';
import {readCredentials} from '../src/credentials.js';

test('reads secrets exclusively from the stdin payload', async () => {
    const input = Readable.from([JSON.stringify({
        appleAccount: 'person@example.test',
        password: 'pipe-secret',
        code: '123456',
        sessionKey: Buffer.alloc(32, 7).toString('base64'),
    })]);

    const credentials = await readCredentials(input);
    assert.equal(credentials.password, 'pipe-secret');
    assert.equal(credentials.code, '123456');
});

test('rejects incomplete stdin credentials', async () => {
    await assert.rejects(
        readCredentials(Readable.from(['{"appleAccount":"person@example.test"}'])),
        /Incomplete stdin credentials/,
    );
});

test('GUI Node launches provide full credentials through stdin', async () => {
    const source = await readFile(new URL('../../Pastel/PastelApp.swift', import.meta.url), 'utf8');
    const downloadStart = source.indexOf('    func start(id: String, label: String, config: RunConfig) -> Bool {');
    const downloadEnd = source.indexOf('\n    func consumeDownloadFailure', downloadStart);
    const validationStart = source.indexOf('    private func runValidation(code: String) {');
    const validationEnd = source.indexOf('\n    private func finishValidation', validationStart);
    const downloadLauncher = source.slice(downloadStart, downloadEnd);
    const validationLauncher = source.slice(validationStart, validationEnd);

    assert.notEqual(downloadStart, -1, 'download launcher should exist');
    assert.notEqual(downloadEnd, -1, 'download launcher should have a bounded body');
    assert.notEqual(validationStart, -1, 'account validation launcher should exist');
    assert.notEqual(validationEnd, -1, 'account validation launcher should have a bounded body');
    for (const launcher of [downloadLauncher, validationLauncher]) {
        assert.match(launcher, /NodeSessionKeyStore/);
        assert.match(launcher, /standardInput/);
        assert.match(launcher, /sessionKey/);
        assert.match(launcher, /fileHandleForWriting\.close/);
        assert.doesNotMatch(launcher, /env\["APPLE_(?:ID|PWD|CODE)"\]/);
    }
});
