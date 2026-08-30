import {execFileSync} from 'node:child_process';
import StreamZip from 'node-stream-zip';
import plist from 'plist';
import {isAppleTVPlatform} from './platform.js';

function codedError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function parseInfoPlist(data) {
    const xml = execFileSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '--', '-'], {input: data});
    return plist.parse(xml.toString('utf8'));
}

export async function validatePackageForPlatform(ipaPath, platform) {
    if (!isAppleTVPlatform(platform)) return;
    const zip = new StreamZip.async({file: ipaPath});
    try {
        const entries = await zip.entries();
        const entry = Object.values(entries)
            .filter(item => /^Payload\/[^/]+\.app\/Info\.plist$/i.test(item.name))
            .sort((a, b) => a.name.length - b.name.length)[0];
        if (!entry) throw codedError('TVOS_INFO_MISSING', 'tvOS package has no main Info.plist');
        let info;
        try {
            info = parseInfoPlist(await zip.entryData(entry.name));
            if (!info || typeof info !== 'object' || Array.isArray(info)) throw new Error('Info.plist root is not a dictionary');
        } catch {
            throw codedError('TVOS_INFO_INVALID', 'tvOS package main Info.plist is invalid');
        }
        const platforms = Array.isArray(info.CFBundleSupportedPlatforms) ? info.CFBundleSupportedPlatforms : [];
        if (!platforms.includes('AppleTVOS')) {
            throw codedError('TVOS_PLATFORM_MISMATCH', 'downloaded package does not declare AppleTVOS support');
        }
    } finally {
        await zip.close().catch(() => {});
    }
}
