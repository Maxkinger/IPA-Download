import test from 'node:test';
import assert from 'node:assert/strict';
import {createWriteStream, mkdtempSync, rmSync} from 'node:fs';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import archiver from 'archiver';
import plist from 'plist';
import {validatePackageForPlatform} from '../src/package-platform.js';

const fixtureDir = mkdtempSync(join(tmpdir(), 'idapastel-platform-test-'));

async function createIPA(name, platforms, rawInfo = null) {
    const outputPath = join(fixtureDir, name);
    const output = createWriteStream(outputPath);
    const zip = archiver('zip');
    zip.pipe(output);
    if (rawInfo !== null || platforms !== null) {
        const data = rawInfo ?? Buffer.from(plist.build({CFBundleSupportedPlatforms: platforms}));
        zip.append(data, {
            name: 'Payload/Test.app/Info.plist',
        });
    }
    await zip.finalize();
    await once(output, 'close');
    return outputPath;
}

test.after(() => rmSync(fixtureDir, {recursive: true, force: true}));

test('validates Apple TV IPA platform declarations', async () => {
    const tvIPA = await createIPA('tv.ipa', ['AppleTVOS']);
    const phoneIPA = await createIPA('phone.ipa', ['iPhoneOS']);
    const malformedIPA = await createIPA('missing-info.ipa', null);
    const invalidInfoIPA = await createIPA('invalid-info.ipa', null, Buffer.from('not-a-plist'));

    await assert.doesNotReject(() => validatePackageForPlatform(tvIPA, 'appletv'));
    await assert.rejects(
        () => validatePackageForPlatform(phoneIPA, 'appletv'),
        error => error.code === 'TVOS_PLATFORM_MISMATCH'
    );
    await assert.rejects(
        () => validatePackageForPlatform(malformedIPA, 'appletv'),
        error => error.code === 'TVOS_INFO_MISSING'
    );
    await assert.rejects(
        () => validatePackageForPlatform(invalidInfoIPA, 'appletv'),
        error => error.code === 'TVOS_INFO_INVALID'
    );
    await assert.doesNotReject(() => validatePackageForPlatform(phoneIPA, 'iphone'));
});
