import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
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
    const directory = await mkdtemp(join(tmpdir(), 'ipa-tvos-ranking-'));
    const cachePath = join(directory, 'tv-ranking-cache.json');
    const requests = [];
    const client = {async get(url, options = {}) {
        requests.push({url, options});
        if (url === 'https://apps.apple.com/us/tv/discover?l=en-GB') {
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

    try {
        const response = await featuredApps({
            country: 'us', platform: 'appletv', limit: 10, offset: 0, client, cachePath,
        });

        assert.equal(response.count, 1);
        assert.equal(response.results[0].platform, 'appletv');
        assert.deepEqual(requests.map(request => request.url), [
            'https://apps.apple.com/us/tv/discover?l=en-GB',
            'https://itunes.apple.com/lookup',
        ]);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

function featuredRankingClient(requests, country, id = 111) {
    return {async get(url, options = {}) {
        requests.push({url, options});
        if (url === `https://apps.apple.com/${country}/tv/discover?l=en-GB`) {
            return {data: `<section aria-label="Top Free"><a href="/${country}/app/free/id${id}"></a></section>`};
        }
        assert.equal(url, 'https://itunes.apple.com/lookup');
        assert.equal(options.params.entity, 'tvSoftware');
        return {data: {results: [{
            trackId: id,
            trackName: `${country} TV App`,
            supportedDevices: ['AppleTV4-AppleTV4'],
        }]}};
    }};
}

async function loadFreshCatalog() {
    return import(`${pathToFileURL(new URL('../src/catalog.js', import.meta.url).pathname).href}?fresh=${Date.now()}-${Math.random()}`);
}

test('restores a same-country Apple TV ranking from the persistent cache', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ipa-tvos-ranking-'));
    const cachePath = join(directory, 'tv-ranking-cache.json');
    const firstRequests = [];

    try {
        await featuredApps({
            country: 'gb', platform: 'appletv', client: featuredRankingClient(firstRequests, 'gb'), cachePath,
        });
        const {featuredApps: freshFeaturedApps} = await loadFreshCatalog();
        const secondRequests = [];
        const result = await freshFeaturedApps({
            country: 'gb', platform: 'appletv', client: featuredRankingClient(secondRequests, 'gb'), cachePath,
        });

        assert.equal(result.results[0].name, 'gb TV App');
        assert.deepEqual(firstRequests.map(request => request.url), [
            'https://apps.apple.com/gb/tv/discover?l=en-GB',
            'https://itunes.apple.com/lookup',
        ]);
        assert.deepEqual(secondRequests, []);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

test('keeps persisted Apple TV rankings isolated by country', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ipa-tvos-ranking-'));
    const cachePath = join(directory, 'tv-ranking-cache.json');
    const usRequests = [];
    const caRequests = [];

    try {
        await featuredApps({
            country: 'us', platform: 'appletv', client: featuredRankingClient(usRequests, 'us'), cachePath,
        });
        const result = await featuredApps({
            country: 'ca', platform: 'appletv', client: featuredRankingClient(caRequests, 'ca', 222), cachePath,
        });

        assert.equal(result.results[0].name, 'ca TV App');
        assert.deepEqual(caRequests.map(request => request.url), [
            'https://apps.apple.com/ca/tv/discover?l=en-GB',
            'https://itunes.apple.com/lookup',
        ]);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

test('refreshes an expired persisted Apple TV ranking', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ipa-tvos-ranking-'));
    const cachePath = join(directory, 'tv-ranking-cache.json');
    const requests = [];

    try {
        await writeFile(cachePath, JSON.stringify({
            version: 1,
            countries: {
                au: {expiresAt: Date.now() - 1, apps: [{id: '999', name: 'Expired'}]},
            },
        }));
        const {featuredApps: freshFeaturedApps} = await loadFreshCatalog();
        const result = await freshFeaturedApps({
            country: 'au', platform: 'appletv', client: featuredRankingClient(requests, 'au', 333), cachePath,
        });

        assert.equal(result.results[0].id, '333');
        assert.deepEqual(requests.map(request => request.url), [
            'https://apps.apple.com/au/tv/discover?l=en-GB',
            'https://itunes.apple.com/lookup',
        ]);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

test('does not fall back to RSS when Apple TV discover fails or has no shelf', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ipa-tvos-ranking-'));
    const cachePath = join(directory, 'tv-ranking-cache.json');
    const emptyRequests = [];
    const failedRequests = [];

    try {
        const empty = await featuredApps({
            country: 'fr', platform: 'appletv', cachePath,
            client: {async get(url) {
                emptyRequests.push(url);
                return {data: '<a href="/fr/app/outside/id999"></a>'};
            }},
        });
        assert.deepEqual(empty.results, []);
        assert.deepEqual(emptyRequests, ['https://apps.apple.com/fr/tv/discover?l=en-GB']);

        await assert.rejects(featuredApps({
            country: 'de', platform: 'appletv', cachePath,
            client: {async get(url) {
                failedRequests.push(url);
                throw new Error('discover unavailable');
            }},
        }), /discover unavailable/);
        assert.deepEqual(failedRequests, ['https://apps.apple.com/de/tv/discover?l=en-GB']);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
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

test('country menu selection routes storefront changes through the platform availability gate', async () => {
    const source = await readFile(new URL('../../Pastel/PastelApp.swift', import.meta.url), 'utf8');
    const start = source.indexOf('    private func selectCountry(_ country: AppStoreCountry) {');
    const end = source.indexOf('    private var versionsWorkspace:', start);
    const selectCountry = source.slice(start, end);

    assert.notEqual(start, -1, 'selectCountry should exist');
    assert.notEqual(end, -1, 'selectCountry should end before versionsWorkspace');
    assert.match(selectCountry, /applyStorefrontCountry\(country\.code,\s*reload:\s*true\)/);
    assert.doesNotMatch(selectCountry, /\bselectedCountryCode\s*=/);
    assert.doesNotMatch(selectCountry, /\bcatalog\.country\s*=/);
});

test('downloaded app navigation routes storefront changes through the platform availability gate', async () => {
    const source = await readFile(new URL('../../Pastel/PastelApp.swift', import.meta.url), 'utf8');
    const start = source.indexOf('    private func searchForApp(_ group: DownloadedAppGroup) {');
    const end = source.indexOf('    private func prepareVersionsFromDownload()', start);
    const searchForApp = source.slice(start, end);

    assert.notEqual(start, -1, 'searchForApp should exist');
    assert.notEqual(end, -1, 'searchForApp should end before prepareVersionsFromDownload');
    assert.match(searchForApp, /applyStorefrontCountry\(code,\s*reload:\s*false\)/);
    assert.doesNotMatch(searchForApp, /\bselectedCountryCode\s*=/);
    assert.doesNotMatch(searchForApp, /\bcatalog\.country\s*=/);
});

test('Apple TV history exposes every trusted version ID and permits multi-version downloads', async () => {
    const policy = await readFile(new URL('../../Pastel/AppleVersionIDsRequestPolicy.swift', import.meta.url), 'utf8');
    const app = await readFile(new URL('../../Pastel/PastelApp.swift', import.meta.url), 'utf8');
    const tvPolicyStart = policy.indexOf('        if request.isAppleTV {');
    const tvPolicyEnd = policy.indexOf('\n        return .apply(', tvPolicyStart);
    const tvPolicy = policy.slice(tvPolicyStart, tvPolicyEnd);
    const selectAllStart = app.indexOf('    private func selectAllVersionRows() {');
    const selectAllEnd = app.indexOf('\n    private func selectAllDownloadedRows()', selectAllStart);
    const selectAll = app.slice(selectAllStart, selectAllEnd);
    const batchDownloadStart = app.indexOf('    private func downloadSelectedVersions() {');
    const batchDownloadEnd = app.indexOf('\n    private func showsBatchDownloadMenu(', batchDownloadStart);
    const batchDownload = app.slice(batchDownloadStart, batchDownloadEnd);
    const batchMenuStart = app.indexOf('    private func showsBatchDownloadMenu(for record: VersionRecord) -> Bool {');
    const batchMenuEnd = app.indexOf('\n    private func handleSelectAllShortcut()', batchMenuStart);
    const batchMenu = app.slice(batchMenuStart, batchMenuEnd);
    const unavailableStatusStart = app.indexOf('    private func unavailableAppleVersionStatus(for request: AppleVersionIDsRequestContext) -> String {');
    const unavailableStatusEnd = app.indexOf('\n    private func appIsFreeFlag()', unavailableStatusStart);
    const unavailableStatus = app.slice(unavailableStatusStart, unavailableStatusEnd);

    assert.notEqual(tvPolicyStart, -1, 'Apple TV response policy should exist');
    assert.notEqual(tvPolicyEnd, -1, 'Apple TV response policy should end before the default policy');
    assert.match(tvPolicy, /visibleVersionIDs:\s*Array\(response\.versionIDs\.reversed\(\)\)/);
    assert.doesNotMatch(tvPolicy, /latestVersionID/);
    assert.doesNotMatch(app, /Apple TV 目前仅提供 Apple 来源的最新版本或手动版本 ID。/);
    assert.notEqual(selectAllStart, -1, 'select all versions should exist');
    assert.match(selectAll, /selectedVersionIDs\s*=\s*Set\(catalog\.versionResults\.map\(\\\.id\)\)/);
    assert.doesNotMatch(selectAll, /activeAppIsAppleTV|prefix\(1\)/);
    assert.notEqual(batchDownloadStart, -1, 'batch download should exist');
    assert.doesNotMatch(batchDownload, /activeAppIsAppleTV/);
    assert.notEqual(batchMenuStart, -1, 'batch menu visibility should exist');
    assert.match(batchMenu, /selectedVersionIDs\.count\s*>\s*1\s*&&\s*selectedVersionIDs\.contains\(record\.id\)/);
    assert.doesNotMatch(batchMenu, /activeAppIsAppleTV/);
    assert.notEqual(unavailableStatusStart, -1, 'Apple version unavailability status should exist');
    assert.notEqual(unavailableStatusEnd, -1, 'Apple version unavailability status should end before free-app detection');
    assert.match(
        unavailableStatus,
        /request\.isAppleTV\s*\?\s*String\(localized: "Apple TV 历史版本目前仅由 Apple 来源提供，请重试或输入手动版本 ID。"\)\s*:\s*String\(localized: "未能从 Apple 获取版本，请改用其他来源。"\)/,
        'Apple TV must not receive the generic alternative-source guidance',
    );
});

test('ordinary download failures publish a consumable alert that retries the original configuration', async () => {
    const source = await readFile(new URL('../../Pastel/PastelApp.swift', import.meta.url), 'utf8');
    const managerStart = source.indexOf('@MainActor\nfinal class DownloadManager: ObservableObject {');
    const managerEnd = source.indexOf('\nstruct AppSearchResult:', managerStart);
    const manager = source.slice(managerStart, managerEnd);
    const contentStart = source.indexOf('struct ContentView: View {');
    const contentEnd = source.indexOf('\nprivate struct DownloadErrorIndicator:', contentStart);
    const content = source.slice(contentStart, contentEnd);

    assert.notEqual(managerStart, -1, 'DownloadManager should exist');
    assert.notEqual(managerEnd, -1, 'DownloadManager should end before AppSearchResult');
    assert.match(manager, /struct\s+FailureEvent:\s*Identifiable/);
    assert.match(manager, /@Published\s+private\(set\)\s+var\s+latestDownloadFailure:\s*FailureEvent\?/);
    assert.match(manager, /guard\s+!config\.listVersionIDs\s+else\s+\{\s*return\s*\}/);
    assert.match(manager, /func\s+retryFailedDownload\([^)]*FailureEvent[^)]*\)[^{]*\{[\s\S]*?configs\[failure\.jobID\][\s\S]*?start\(id:\s*failure\.jobID,\s*label:\s*failure\.label,\s*config:\s*config\)/);

    assert.notEqual(contentStart, -1, 'ContentView should exist');
    assert.notEqual(contentEnd, -1, 'ContentView should include its download alert');
    assert.match(content, /\.alert\([\s\S]*?isPresented:\s*Binding\([\s\S]*?downloads\.latestDownloadFailure\s*!=\s*nil[\s\S]*?presenting:\s*downloads\.latestDownloadFailure/);
    assert.match(content, /下载失败：\\\(downloads\.latestDownloadFailure\?\.label \?\?/);
    assert.match(content, /downloadErrorMessage\(from:\s*failure\.log,\s*platform:\s*failure\.platform\)/);
    assert.match(content, /Button\(String\(localized:\s*"关闭"\),\s*role:\s*\.cancel\)\s*\{\s*downloads\.consumeDownloadFailure\(failure\)/);
    assert.match(content, /Button\(String\(localized:\s*"重试"\)\)\s*\{\s*downloads\.consumeDownloadFailure\(failure\)[\s\S]*?downloads\.retryFailedDownload\(failure\)/);
    assert.match(content, /if\s+downloadRequiresRelogin\(from:\s*failure\.log\)\s*\{[\s\S]*?showRelogin\(\)/);
});
