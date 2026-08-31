import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
    extractAppleAppIdsFromHTML,
    extractAppStoreCountry,
    featuredApps,
    searchApps,
} from '../src/catalog.js';

const miaoProjectHTML = `
    <a href="https://apps.apple.com/us/app/miao-project/id1563875379">Miao Project</a>
    <a href="https://apps.apple.com/us/app/miao-project/id1563875379?uo=4">duplicate</a>
`;

const miaoProjectResult = {
    trackId: 1563875379,
    trackName: 'Miao Project',
    artistName: '林杰 薛',
    bundleId: 'tv.paladinfeng.miao',
    version: '2.5.1',
    minimumOsVersion: '15.0',
    formattedPrice: '$9.99',
    fileSizeBytes: 115485696,
    artworkUrl100: 'https://example.test/miao.jpg',
    trackViewUrl: 'https://apps.apple.com/us/app/miao-project/id1563875379',
    supportedDevices: ['AppleTV4-AppleTV4'],
    kind: 'software',
};

test('extracts and deduplicates App Store IDs from Apple TV web search HTML', () => {
    assert.deepEqual(extractAppleAppIdsFromHTML(miaoProjectHTML), ['1563875379']);
});

test('uses storefront embedded in an App Store URL for direct lookup', async () => {
    const requests = [];
    const client = {
        async get(url, options = {}) {
            requests.push({url, options});
            assert.equal(url, 'https://itunes.apple.com/lookup');
            assert.equal(options.params.country, 'us');
            assert.equal(options.params.entity, 'tvSoftware');
            return {data: {resultCount: 1, results: [miaoProjectResult]}};
        },
    };

    const response = await searchApps(
        'https://apps.apple.com/us/app/miao-project/id1563875379',
        {country: 'cn', platform: 'appletv', limit: 30, client},
    );

    assert.equal(response.count, 1);
    assert.equal(response.results[0].id, '1563875379');
    assert.equal(requests.length, 1);
    assert.equal(extractAppStoreCountry('https://apps.apple.com/us/app/miao-project/id1563875379'), 'us');
});

test('falls back to Apple TV web search when iTunes keyword search is empty', async () => {
    const requests = [];
    const client = {
        async get(url, options = {}) {
            requests.push({url, options});
            if (url === 'https://itunes.apple.com/search') {
                return {data: {resultCount: 0, results: []}};
            }
            if (url === 'https://apps.apple.com/us/tv/search') {
                assert.equal(options.params.term, 'Miao Project');
                return {data: miaoProjectHTML};
            }
            if (url === 'https://itunes.apple.com/lookup') {
                assert.equal(options.params.id, '1563875379');
                assert.equal(options.params.country, 'us');
                assert.equal(options.params.entity, 'tvSoftware');
                return {data: {resultCount: 1, results: [miaoProjectResult]}};
            }
            throw new Error(`unexpected URL: ${url}`);
        },
    };

    const response = await searchApps('Miao Project', {
        country: 'us',
        platform: 'appletv',
        limit: 30,
        client,
    });

    assert.equal(response.queryType, 'search');
    assert.equal(response.count, 1);
    assert.equal(response.results[0].name, 'Miao Project');
    assert.equal(response.results[0].platform, 'appletv');
    assert.deepEqual(requests.map(request => request.url), [
        'https://itunes.apple.com/search',
        'https://apps.apple.com/us/tv/search',
        'https://itunes.apple.com/lookup',
    ]);
});

test('featured Apple TV requests discover then tvSoftware lookup', async () => {
    const requests = [];
    const client = {async get(url, options = {}) {
        requests.push({url, options});
        if (url === 'https://apps.apple.com/us/tv/discover') {
            return {data: '<section aria-label="Top Free"><a href="/us/app/free/id111"></a></section>'};
        }
        assert.equal(url, 'https://itunes.apple.com/lookup');
        assert.equal(options.params.entity, 'tvSoftware');
        return {data: {results: [{
            trackId: 111,
            trackName: 'TV App',
            supportedDevices: ['AppleTV4-AppleTV4'],
        }]}};
    }};

    const response = await featuredApps({
        country: 'us', platform: 'appletv', limit: 10, offset: 0, client,
    });

    assert.equal(response.count, 1);
    assert.equal(response.results[0].platform, 'appletv');
    assert.deepEqual(requests.map(request => request.url), [
        'https://apps.apple.com/us/tv/discover',
        'https://itunes.apple.com/lookup',
    ]);
});

test('loadFeatured invokes the Node featured command without an Apple TV early return', async () => {
    const source = await readFile(new URL('../../Pastel/PastelApp.swift', import.meta.url), 'utf8');
    const start = source.indexOf('    func loadFeatured() {');
    const end = source.indexOf('    func loadMoreFeaturedIfNeeded(', start);
    const loadFeatured = source.slice(start, end);

    assert.notEqual(start, -1, 'loadFeatured should exist');
    assert.notEqual(end, -1, 'loadFeatured should end before pagination loading');
    assert.match(loadFeatured, /NodeRuntime\.runJSON/);
    assert.match(loadFeatured, /"main\.js",\s*"featured"/);
    assert.doesNotMatch(loadFeatured, /if\s+platform\s*==\s*AppSearchPlatform\.appleTV\.rawValue\s*\{/);
    assert.doesNotMatch(loadFeatured, /Apple TV 暂无推荐榜单，请搜索 App 或输入 App ID。/);
});
