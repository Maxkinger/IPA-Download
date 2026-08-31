function cleanLimit(limit) {
    const value = Math.floor(Number(limit));
    return Number.isFinite(value) && value > 0 ? value : Infinity;
}

function idsFromShelf(html, label, limit) {
    const sectionPattern = /<section\b([^>]*)>([\s\S]*?)<\/section>/gi;
    const idPattern = /(?:https?:\/\/apps\.apple\.com\/[^"'\s>]+)?\/app\/[^"'?#\s>]*\/id(\d+)(?=[?"'#\s>]|$)/gi;
    const ids = [];
    const seen = new Set();
    let section;

    while ((section = sectionPattern.exec(String(html || ''))) !== null) {
        const ariaLabel = section[1].match(/\baria-label\s*=\s*(["'])(.*?)\1/i)?.[2];
        if (ariaLabel !== label) continue;

        let app;
        while ((app = idPattern.exec(section[2])) !== null) {
            if (seen.has(app[1])) continue;
            seen.add(app[1]);
            ids.push(app[1]);
            if (ids.length >= limit) return ids;
        }
    }

    return ids;
}

function buildTVDiscoverURL(country) {
    const cleanCountry = String(country || '').trim().toLowerCase() || 'cn';
    return `https://apps.apple.com/${cleanCountry}/tv/discover`;
}

function extractTVChartAppIds(html, chart, limit) {
    const label = chart === 'top-free' ? 'Top Free' : chart === 'top-paid' ? 'Top Paid' : '';
    return label ? idsFromShelf(html, label, cleanLimit(limit)) : [];
}

function extractTVRankingAppIds(html, limit) {
    const maximum = cleanLimit(limit);
    const ids = [];
    const seen = new Set();

    for (const chart of ['top-free', 'top-paid']) {
        for (const id of extractTVChartAppIds(html, chart, maximum)) {
            if (seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
            if (ids.length >= maximum) return ids;
        }
    }

    return ids;
}

export {
    buildTVDiscoverURL,
    extractTVChartAppIds,
    extractTVRankingAppIds,
};
