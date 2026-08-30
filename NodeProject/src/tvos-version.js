import axios from 'axios';

const BASE_URL = 'https://uclient-api.itunes.apple.com/WebObjects/MZStorePlatform.woa/wa/lookup';

function codedError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

export function buildTVVersionLookupURL(appID, country = 'us') {
    const url = new URL(BASE_URL);
    url.search = new URLSearchParams({
        version: '2', id: String(appID), p: 'mdm-lockup', caller: 'MDM',
        platform: 'atv9', cc: String(country || 'us').toLowerCase(), l: 'en',
    }).toString();
    return url.toString();
}

export function extractTVExternalVersionID(data, appID) {
    const item = data?.results?.[String(appID)];
    if (!item) throw codedError('TVOS_NO_APP', 'Apple TV metadata returned no app');
    const offer = Array.isArray(item.offers) ? item.offers[0] : null;
    if (!offer) throw codedError('TVOS_NO_OFFER', 'Apple TV metadata returned no offer');
    const direct = offer?.version?.externalId;
    if (direct !== undefined && direct !== null && String(direct) !== '') return String(direct);
    const fallback = new URLSearchParams(String(offer.buyParams || '')).get('appExtVrsId');
    if (fallback) return fallback;
    throw codedError('TVOS_NO_VERSION', 'Apple TV metadata returned no external version ID');
}

export async function lookupLatestTVExternalVersionID(appID, {country = 'us', client = axios} = {}) {
    const {data} = await client.get(buildTVVersionLookupURL(appID, country));
    return extractTVExternalVersionID(data, appID);
}
