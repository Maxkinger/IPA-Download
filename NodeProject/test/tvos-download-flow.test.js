import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Ipa} from '../src/ipa.js';
import {Store} from '../src/client.js';
import {t} from '../src/i18n.js';

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

test('uses the existing StoreServices download license before attempting purchase', async () => {
    const app = new Ipa(credentials);
    const events = [];
    const song = {URL: 'https://example.test/forward.ipa'};
    const originalPurchase = Store.purchase;

    app.info = async () => {
        events.push('download-info');
        return song;
    };
    Store.purchase = async () => {
        events.push('purchase');
        throw new Error('purchase should not be attempted for an existing license');
    };

    try {
        const result = await app.resolveDownloadSong('6503940939', '888154622');
        assert.equal(result, song);
        assert.deepEqual(events, ['download-info']);
    } finally {
        Store.purchase = originalPurchase;
    }
});

test('requests a license only after Apple reports that the app license is missing', async () => {
    const app = new Ipa(credentials);
    const events = [];
    const song = {URL: 'https://example.test/forward.ipa'};
    const originalPurchase = Store.purchase;
    let infoAttempts = 0;

    app.info = async () => {
        infoAttempts += 1;
        events.push(`download-info-${infoAttempts}`);
        if (infoAttempts === 1) {
            const error = new Error('license is required');
            error.code = 'LICENSE_REQUIRED';
            throw error;
        }
        return song;
    };
    app.isFreeApp = async () => true;
    Store.purchase = async () => {
        events.push('purchase');
        return {customerMessage: 'license acquired'};
    };

    try {
        const result = await app.resolveDownloadSong('6503940939', '888154622');
        assert.equal(result, song);
        assert.deepEqual(events, ['download-info-1', 'purchase', 'download-info-2']);
    } finally {
        Store.purchase = originalPurchase;
    }
});

test('accepts an Apple TV version family anchored by the resolved latest version', async () => {
    const originalAppInfo = Store.AppInfo;
    Store.AppInfo = async () => ({
        songList: [{
            metadata: {
                bundleDisplayName: 'Apple TV Fixture',
                bundleShortVersionString: '3.0',
                softwareVersionExternalIdentifiers: [700, '800', '900', '900'],
            },
        }],
    });
    try {
        const app = new Ipa(credentials, {lookupTVVersion: async () => '900'});
        app.user = {};
        app.persistCurrentSession = async () => {};

        const result = await app.listVersionIds('42', 'appletv');

        assert.equal(result.latestVersionId, '900');
        assert.deepEqual(result.versionIds, ['700', '800', '900']);
        assert.equal(result.platform, 'appletv');
    } finally {
        Store.AppInfo = originalAppInfo;
    }
});

test('falls back to the resolved Apple TV version for an unrelated version family', async () => {
    const originalAppInfo = Store.AppInfo;
    Store.AppInfo = async () => ({
        songList: [{
            metadata: {
                bundleDisplayName: 'Apple TV Fixture',
                bundleShortVersionString: '3.0',
                softwareVersionExternalIdentifiers: [100, '200'],
            },
        }],
    });
    try {
        const app = new Ipa(credentials, {lookupTVVersion: async () => '900'});
        app.user = {};
        app.persistCurrentSession = async () => {};

        const result = await app.listVersionIds('42', 'appletv');

        assert.deepEqual(result.versionIds, ['900']);
    } finally {
        Store.AppInfo = originalAppInfo;
    }
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

test('surfaces rejected-output cleanup failure with the validation error as cause', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'idapastel-output-cleanup-'));
    const output = join(directory, 'wrong-platform.ipa');
    writeFileSync(output, 'fixture');
    const validationError = Object.assign(new Error('wrong platform'), {code: 'TVOS_PLATFORM_MISMATCH'});
    const removalError = Object.assign(new Error('permission denied'), {code: 'EACCES'});
    const app = new Ipa(credentials, {
        validatePackage: async () => { throw validationError; },
        removeOutputFile: async () => { throw removalError; },
    });
    app.out = output;

    await assert.rejects(
        () => app.validateDownloadedPackage('appletv'),
        error => {
            assert.equal(error.code, 'OUTPUT_CLEANUP_FAILED');
            assert.equal(error.message, 'Failed to remove rejected download output');
            assert.equal(error.cause, validationError);
            assert.equal(error.cleanupError, removalError);
            assert.equal(error.primaryCode, 'TVOS_PLATFORM_MISMATCH');
            return true;
        },
    );
    assert.equal(existsSync(output), true);
    rmSync(directory, {recursive: true, force: true});
});

test('treats an already-missing rejected output as successfully removed', async () => {
    const validationError = Object.assign(new Error('wrong platform'), {code: 'TVOS_PLATFORM_MISMATCH'});
    const missingError = Object.assign(new Error('already gone'), {code: 'ENOENT'});
    const app = new Ipa(credentials, {
        validatePackage: async () => { throw validationError; },
        removeOutputFile: async () => { throw missingError; },
    });
    app.out = join(tmpdir(), 'idapastel-already-removed.ipa');

    await assert.rejects(
        () => app.validateDownloadedPackage('appletv'),
        error => error.code === 'TVOS_PLATFORM_MISMATCH',
    );
});

test('prints cleanup success only after temporary parts are removed', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'idapastel-temp-cleanup-'));
    writeFileSync(join(directory, 'part-0'), 'fixture');
    const app = new Ipa(credentials);
    app.cache = directory;
    const logs = [];
    const originalLog = console.log;
    console.log = message => logs.push(message);
    try {
        await app.cleanupTempParts();
    } finally {
        console.log = originalLog;
    }

    assert.equal(existsSync(directory), false);
    assert.deepEqual(logs, [t('cleanup_done')]);
});

test('surfaces temporary-tree cleanup failure without a false success log', async () => {
    const primaryError = Object.assign(new Error('download failed'), {code: 'DOWNLOAD_FAILED'});
    const removalError = Object.assign(new Error('directory busy'), {code: 'EBUSY'});
    const app = new Ipa(credentials, {
        removeTempTree: async () => { throw removalError; },
    });
    app.cache = '/private/tmp/idapastel-stuck-parts';
    const logs = [];
    const originalLog = console.log;
    console.log = message => logs.push(message);
    try {
        await assert.rejects(
            () => app.cleanupTempParts(primaryError),
            error => {
                assert.equal(error.code, 'TEMP_CLEANUP_FAILED');
                assert.equal(error.message, 'Failed to remove temporary download parts');
                assert.equal(error.cause, primaryError);
                assert.equal(error.cleanupError, removalError);
                assert.equal(error.primaryCode, 'DOWNLOAD_FAILED');
                return true;
            },
        );
    } finally {
        console.log = originalLog;
    }
    assert.equal(logs.includes(t('cleanup_done')), false);
});

test('never retries authentication for a coded cleanup failure', async () => {
    const app = new Ipa(credentials);
    app.usedCachedSession = true;
    let attempts = 0;
    let relogins = 0;
    app.login = async () => { relogins += 1; };
    const cleanupError = Object.assign(new Error('token session cleanup failed'), {
        code: 'TEMP_CLEANUP_FAILED',
    });

    await assert.rejects(
        () => app._withReauth(async () => {
            attempts += 1;
            throw cleanupError;
        }),
        error => error === cleanupError,
    );
    assert.equal(attempts, 1);
    assert.equal(relogins, 0);
});
