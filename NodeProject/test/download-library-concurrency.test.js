import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('keeps detached download-library parsing off the main actor', async () => {
    const source = await readFile(new URL('../../Pastel/PastelApp.swift', import.meta.url), 'utf8');
    const helpers = [
        'filenameVersionAndVariant',
        'extractDownloadedItem',
        'downloadedMetadata',
        'mainAppInfoPlistData',
        'runUnzip',
        'isFileMaterialized',
        'extractAppIcon'
    ];

    for (const helper of helpers) {
        assert.match(
            source,
            new RegExp(`nonisolated private static func ${helper}\\(`),
            `${helper} must be callable by the detached download-library worker`
        );
    }
});

test('recognizes platform suffixes in downloaded IPA filenames', async () => {
    const source = await readFile(new URL('../../Pastel/PastelApp.swift', import.meta.url), 'utf8');

    assert.match(source, /\["iphone",\s*"ipad",\s*"appletv",\s*"vision"\]/);
    assert.match(source, /platform:\s*String/);
    assert.match(source, /metadataValue:\s*filenameInfo\.platform/);
});
