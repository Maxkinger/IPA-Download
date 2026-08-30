function compact(value) {
    return String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function normalizeAppPlatform(value) {
    const platform = compact(value);
    if (['ipad', 'ipados', 'tablet'].includes(platform)) return 'ipad';
    if (['vision', 'visionpro', 'visionos', 'applevisionpro'].includes(platform)) return 'vision';
    if (['tv', 'tvos', 'appletv'].includes(platform)) return 'appletv';
    return 'iphone';
}

export function isAppleTVPlatform(value) {
    return normalizeAppPlatform(value) === 'appletv';
}

export function lookupEntityForPlatform(value) {
    const platform = normalizeAppPlatform(value);
    if (platform === 'ipad') return 'iPadSoftware';
    if (platform === 'appletv') return 'tvSoftware';
    return 'software';
}

export function searchEntityForPlatform(value) {
    return isAppleTVPlatform(value) ? 'software,tvSoftware' : lookupEntityForPlatform(value);
}

export function metadataPlatformForPlatform(value) {
    return isAppleTVPlatform(value) ? 'atv9' : 'enterprisestore';
}
