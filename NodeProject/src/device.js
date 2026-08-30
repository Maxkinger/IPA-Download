import getMAC from 'getmac';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';

function normalizeGuid(value) {
    const cleaned = String(value || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
    return cleaned.length >= 12 ? cleaned.slice(0, 12) : '';
}

function randomGuid() {
    return crypto.randomBytes(6).toString('hex').toUpperCase();
}

function systemGuid() {
    try {
        return normalizeGuid(getMAC());
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
    const envGuid = normalizeGuid(process.env.IPA_DEVICE_GUID);
    if (envGuid) return envGuid;

    const file = guidFile();
    try {
        if (existsSync(file)) {
            const saved = normalizeGuid(readFileSync(file, 'utf8'));
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
