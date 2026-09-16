import getMAC from 'getmac';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';

export function normalizeDeviceGuid(value) {
    const cleaned = String(value || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
    if (cleaned.length !== 12) return '';
    if (cleaned === '000000000000' || cleaned === '020000000000' || cleaned === 'FFFFFFFFFFFF') return '';
    const firstByte = Number.parseInt(cleaned.slice(0, 2), 16);
    if (!Number.isFinite(firstByte) || (firstByte & 1) !== 0) return '';
    return cleaned;
}

function randomGuid() {
    return crypto.randomBytes(6).toString('hex').toUpperCase();
}

function systemGuid() {
    try {
        return normalizeDeviceGuid(getMAC());
    } catch {
        return '';
    }
}

export function resolveDeviceSupportDirectory({
    platform = process.platform,
    home = os.homedir(),
    env = process.env,
} = {}) {
    if (env.IPA_DEVICE_DIR) return env.IPA_DEVICE_DIR;
    if (env.IPA_SESSION_DIR) return path.dirname(env.IPA_SESSION_DIR);
    if (platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'IDAPastel');
    }
    if (platform === 'win32') {
        return path.join(env.APPDATA || home, 'IDAPastel');
    }
    return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'IDAPastel');
}

function supportDir() {
    return resolveDeviceSupportDirectory();
}

function guidFile() {
    return path.join(supportDir(), 'device-guid.txt');
}

export function getDeviceGuid() {
    const envGuid = normalizeDeviceGuid(process.env.IPA_DEVICE_GUID);
    if (envGuid) return envGuid;

    const file = guidFile();
    try {
        if (existsSync(file)) {
            const saved = normalizeDeviceGuid(readFileSync(file, 'utf8'));
            if (saved) return saved;
        }
    } catch {
        // Fall through and regenerate.
    }

    const guid = systemGuid() || randomGuid();
    try {
        mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
        writeFileSync(file, `${guid}\n`, {mode: 0o600});
    } catch {
        // A stable in-memory value is still better than failing the login.
    }
    return guid;
}
