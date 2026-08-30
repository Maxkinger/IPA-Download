import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildTVVersionLookupURL,
    extractTVExternalVersionID,
    lookupLatestTVExternalVersionID,
} from '../src/tvos-version.js';

test('builds the atv9 metadata URL', () => {
    const url = new URL(buildTVVersionLookupURL('42', 'US'));
    assert.equal(url.hostname, 'uclient-api.itunes.apple.com');
    assert.equal(url.searchParams.get('id'), '42');
    assert.equal(url.searchParams.get('platform'), 'atv9');
    assert.equal(url.searchParams.get('cc'), 'us');
    assert.equal(url.searchParams.get('p'), 'mdm-lockup');
    assert.equal(url.searchParams.get('caller'), 'MDM');
});

test('extracts string, numeric, and buyParams version IDs', () => {
    assert.equal(extractTVExternalVersionID({results: {'42': {offers: [{version: {externalId: '123'}}]}}}, '42'), '123');
    assert.equal(extractTVExternalVersionID({results: {'42': {offers: [{version: {externalId: 456}}]}}}, '42'), '456');
    assert.equal(extractTVExternalVersionID({results: {'42': {offers: [{buyParams: 'salableAdamId=42&appExtVrsId=789'}]}}}, '42'), '789');
});

test('emits coded errors for missing app, offer, and version', () => {
    assert.throws(
        () => extractTVExternalVersionID({results: {}}, '42'),
        error => error.code === 'TVOS_NO_APP'
    );
    assert.throws(
        () => extractTVExternalVersionID({results: {'42': {offers: []}}}, '42'),
        error => error.code === 'TVOS_NO_OFFER'
    );
    assert.throws(
        () => extractTVExternalVersionID({results: {'42': {offers: [{}]}}}, '42'),
        error => error.code === 'TVOS_NO_VERSION'
    );
});

test('uses the injected client', async () => {
    const client = {get: async () => ({data: {results: {'42': {offers: [{version: {externalId: '999'}}]}}}})};
    assert.equal(await lookupLatestTVExternalVersionID('42', {country: 'us', client}), '999');
});
