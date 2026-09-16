import test from 'node:test';
import assert from 'node:assert/strict';
import plist from 'plist';
import {storeAppInfo} from '../src/client.js';

const authContext = {
    authHeaders: {'X-Dsid': '12345'},
    pod: '25',
    cookieJar: '/tmp/idapastel-store-empty-response.cookies',
};

test('retries an empty AppInfo response and falls back to redownload', () => {
    const requests = [];
    const response = Buffer.from(plist.build({
        songList: [{
            metadata: {
                bundleDisplayName: 'MoonSofa',
                bundleShortVersionString: '0.2.0',
                softwareVersionExternalIdentifiers: ['890000001', '890000002'],
            },
        }],
    }));

    const request = (method, url, options) => {
        requests.push({method, url, options});
        if (requests.length <= 3) return {status: 204, headers: '', body: Buffer.alloc(0)};
        return {status: 200, headers: '', body: response};
    };

    const result = storeAppInfo('6807652177', '', authContext, {
        listVersions: true,
        request,
        guid: 'test-guid',
    });

    assert.equal(result.songList[0].metadata.bundleDisplayName, 'MoonSofa');
    assert.equal(requests.length, 4);
    assert.equal(requests[0].url.includes('volumeStoreDownloadProduct'), true);
    assert.equal(requests[3].url, 'https://downloaddispatch.itunes.apple.com/r/redownload?guid=test-guid');
    assert.equal(plist.parse(requests[0].options.body).salableAdamId, '6807652177');
    assert.equal(plist.parse(requests[3].options.body).externalVersionId, undefined);
});

test('does not downgrade an authenticated StoreServices failure to redownload', () => {
    const requests = [];
    const request = (method, url) => {
        requests.push({method, url});
        return {status: 403, headers: '', body: Buffer.alloc(0)};
    };

    assert.throws(
        () => storeAppInfo('6807652177', '', authContext, {request, guid: 'test-guid'}),
        error => error.code === 'TOKEN_EXPIRED',
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url.includes('redownload'), false);
});

test('reports the failing fallback endpoint after both StoreServices responses stay empty', () => {
    const requests = [];
    const request = (method, url) => {
        requests.push({method, url});
        return {status: 204, headers: '', body: Buffer.alloc(0)};
    };

    assert.throws(
        () => storeAppInfo('6807652177', '', authContext, {request, guid: 'test-guid'}),
        error => error.code === 'STORE_EMPTY_RESPONSE'
            && error.httpStatus === 204
            && error.endpoint.includes('redownload')
            && error.message.includes('HTTP 204')
            && error.message.includes('redownload'),
    );
    assert.equal(requests.length, 6);
});
