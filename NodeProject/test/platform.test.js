import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isAppleTVPlatform,
    lookupEntityForPlatform,
    metadataPlatformForPlatform,
    normalizeAppPlatform,
    searchEntityForPlatform,
} from '../src/platform.js';

test('normalizes Apple TV aliases', () => {
    for (const value of ['tv', 'tvos', 'tvOS', 'apple-tv', 'appletv', 'AppleTV']) {
        assert.equal(normalizeAppPlatform(value), 'appletv', value);
        assert.equal(isAppleTVPlatform(value), true, value);
    }
});

test('preserves existing platforms and defaults unknown values to iphone', () => {
    assert.equal(normalizeAppPlatform('iPadOS'), 'ipad');
    assert.equal(normalizeAppPlatform('visionOS'), 'vision');
    assert.equal(normalizeAppPlatform('watchOS'), 'iphone');
});

test('maps Apple TV API entities', () => {
    assert.equal(lookupEntityForPlatform('appletv'), 'tvSoftware');
    assert.equal(searchEntityForPlatform('appletv'), 'software,tvSoftware');
    assert.equal(metadataPlatformForPlatform('appletv'), 'atv9');
});
