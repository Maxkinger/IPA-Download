import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildTVDiscoverURL,
    extractTVChartAppIds,
    extractTVRankingAppIds,
} from '../src/tvos-ranking.js';

const rankingHTML = `
  <a href="/us/app/outside/id999">outside</a>
  <section data-test-id="shelf-wrapper" aria-label="Top Free">
    <a href="https://apps.apple.com/us/app/free-one/id111?platform=tv">one</a>
    <a href="https://apps.apple.com/us/app/shared/id333?platform=tv">shared</a>
  </section>
  <section data-test-id="shelf-wrapper" aria-label="Top Paid">
    <a href="https://apps.apple.com/us/app/shared/id333?platform=tv">shared</a>
    <a href="https://apps.apple.com/us/app/paid-one/id222?platform=tv">paid</a>
  </section>`;

const localizedRankingHTML = `
  <section data-test-id="shelf-wrapper" aria-label="免費 App 排行">
    <a href="/hk/tv/charts/36?chart=top-free">完整榜單</a>
    <a href="https://apps.apple.com/hk/app/free-one/id444?platform=tv">one</a>
    <a href="https://apps.apple.com/hk/app/free-two/id555?platform=tv">two</a>
  </section>
  <section data-test-id="shelf-wrapper" aria-label="付費排行">
    <a href="/hk/tv/charts/36?chart=top-paid">完整榜單</a>
    <a href="https://apps.apple.com/hk/app/paid-one/id666?platform=tv">one</a>
  </section>`;

test('extracts top free and paid IDs in shelf order', () => {
    assert.deepEqual(extractTVChartAppIds(rankingHTML, 'top-free', 10), ['111', '333']);
    assert.deepEqual(extractTVChartAppIds(rankingHTML, 'top-paid', 10), ['333', '222']);
    assert.deepEqual(extractTVRankingAppIds(rankingHTML, 10), ['111', '333', '222']);
});

test('builds the official discover URL and limits IDs', () => {
    assert.equal(buildTVDiscoverURL('US'), 'https://apps.apple.com/us/tv/discover?l=en-GB');
    assert.deepEqual(
        extractTVRankingAppIds('<section aria-label="Top Free"><a href="/us/app/a/id111"></a><a href="/us/app/b/id222"></a></section>', 1),
        ['111'],
    );
});

test('extracts localized shelves identified by official chart links', () => {
    assert.deepEqual(extractTVChartAppIds(localizedRankingHTML, 'top-free', 10), ['444', '555']);
    assert.deepEqual(extractTVChartAppIds(localizedRankingHTML, 'top-paid', 10), ['666']);
});
