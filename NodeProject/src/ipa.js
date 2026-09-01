import {promises as fsPromises} from 'fs';
import os from 'os';
import {createHash} from 'crypto';
import path from 'path';
import {Store} from './client.js';
import {appPriceInfo} from './catalog.js';
import {readCookieJar, restoreCookieJar} from './gsa.js';
import {SignatureClient} from './Signature.js';
import {download} from './downloader.js';
import {t} from './i18n.js';
import {isAppleTVPlatform} from './platform.js';
import {lookupLatestTVExternalVersionID} from './tvos-version.js';
import {validatePackageForPlatform} from './package-platform.js';

const SESSION_TTL_MS = Number(process.env.IPA_SESSION_TTL_MS || 365 * 24 * 60 * 60 * 1000);
// Every authentication implementation gets its own session generation. Never
// carry cookies or password tokens across generations: Apple binds parts of
// the StoreServices session to the authentication flow that created them.
export const SESSION_FLOW_VERSION = 'appstore-sap-v2';
const ACCEPTED_SESSION_FLOW_VERSIONS = new Set([SESSION_FLOW_VERSION]);

const TVOS_ERROR_KEYS = Object.freeze({
    TVOS_NO_APP: 'tvos_no_app',
    TVOS_NO_OFFER: 'tvos_no_offer',
    TVOS_NO_VERSION: 'tvos_no_version',
    TVOS_PLATFORM_MISMATCH: 'tvos_wrong_platform',
    TVOS_INFO_MISSING: 'tvos_info_missing',
    TVOS_INFO_INVALID: 'tvos_info_invalid',
});

const CLEANUP_ERROR_CODES = new Set([
    'OUTPUT_CLEANUP_FAILED',
    'TEMP_CLEANUP_FAILED',
]);

function cleanupFailure(code, message, cleanupError, primaryError = null) {
    const error = new Error(message, {cause: primaryError || cleanupError});
    error.code = code;
    error.cleanupError = cleanupError;
    if (primaryError) {
        error.primaryError = primaryError;
        error.primaryCode = primaryError.code;
    }
    return error;
}

function localizedTVError(error) {
    const key = TVOS_ERROR_KEYS[error?.code];
    if (!key) return error;
    const localized = new Error(t(key));
    localized.code = error.code;
    return localized;
}

function isLicenseRequiredError(error) {
    return error?.code === 'LICENSE_REQUIRED'
        || String(error?.failureType || '') === '9610'
        || /license\s+(?:not found|required)/i.test(String(error?.customerMessage || error?.message || ''));
}

function appSupportDir() {
    if (process.env.IPA_SESSION_DIR) return process.env.IPA_SESSION_DIR;
    if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'IDAPastel', 'sessions');
    }
    if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || os.homedir(), 'IDAPastel', 'sessions');
    }
    return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'IDAPastel', 'sessions');
}

function sessionFileFor(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const digest = createHash('sha256').update(normalizedEmail).digest('hex');
    return path.join(appSupportDir(), `${digest}.json`);
}

function validSessionFor(email, session) {
    if (!session || typeof session !== 'object') return false;
    if (!ACCEPTED_SESSION_FLOW_VERSIONS.has(session.flowVersion)) return false;
    if (String(session.appleAccount || '').trim().toLowerCase() !== String(email || '').trim().toLowerCase()) return false;
    if (SESSION_TTL_MS > 0 && session.savedAt && Date.now() - Number(session.savedAt) > SESSION_TTL_MS) return false;
    const authHeaders = session.user?.authHeaders;
    return Boolean(authHeaders?.['X-Token'] && authHeaders?.['X-Dsid']);
}

export class Ipa {
    constructor({APPLE_ID, PASSWORD, CODE}, {
        lookupTVVersion = lookupLatestTVExternalVersionID,
        validatePackage = validatePackageForPlatform,
        removeOutputFile = file => fsPromises.unlink(file),
        removeTempTree = directory => fsPromises.rm(directory, {recursive: true, force: true}),
    } = {}) {
        this.creds = {APPLE_ID, PASSWORD, CODE};
        this.lookupTVVersion = lookupTVVersion;
        this.validatePackage = validatePackage;
        this.removeOutputFile = removeOutputFile;
        this.removeTempTree = removeTempTree;
        this.user = null;
        this.auth = {};
        this.dir = '.';
        this.out = '';
        this.cache = '';
        this.sessionFile = sessionFileFor(APPLE_ID);
        this.usedCachedSession = false;
    }

    async loadSessionEntry() {
        try {
            const raw = await fsPromises.readFile(this.sessionFile, 'utf8');
            return JSON.parse(raw);
        } catch (error) {
            if (error?.code !== 'ENOENT') await this.clearSession();
            return null;
        }
    }

    async loadSession() {
        const session = await this.loadReusableSessionEntry();
        return session?.user || null;
    }

    async saveSession(user) {
        const session = {
            appleAccount: String(this.creds.APPLE_ID || '').trim().toLowerCase(),
            flowVersion: SESSION_FLOW_VERSION,
            savedAt: Date.now(),
            user: {
                accountInfo: user.accountInfo,
                dsPersonId: user.dsPersonId,
                pod: user.pod || '',
                authHeaders: user.authHeaders,
                cookieText: user.cookieText || '',
            }
        };
        await fsPromises.mkdir(path.dirname(this.sessionFile), {recursive: true, mode: 0o700});
        await fsPromises.writeFile(this.sessionFile, JSON.stringify(session), {mode: 0o600});
    }

    async clearSession() {
        await fsPromises.rm(this.sessionFile, {force: true}).catch(() => {});
        this.usedCachedSession = false;
    }

    async loadReusableSessionEntry({force = false} = {}) {
        const session = await this.loadSessionEntry();
        if (!session) return null;

        // A forced login must start with a clean cookie jar. Invalid, expired,
        // corrupt, and legacy-flow sessions are removed instead of being fed
        // into a new StoreServices authentication request.
        if (force || !validSessionFor(this.creds.APPLE_ID, session)) {
            await this.clearSession();
            return null;
        }
        return session;
    }

    applyUser(user, usedCachedSession) {
        this.user = user;
        this.auth = {
            authHeaders: user.authHeaders,
            pod: user.pod || '',
            cookieJar: restoreCookieJar(user.cookieText, this.creds.APPLE_ID),
        };
        this.usedCachedSession = usedCachedSession;
    }

    async login({force = false} = {}) {
        const reusableSession = await this.loadReusableSessionEntry({force});
        if (reusableSession) {
            console.log(t('login_local_session', {id: this.creds.APPLE_ID}));
            this.applyUser(reusableSession.user, true);
            return;
        }

        const user = await Store.login(this.creds.APPLE_ID, this.creds.PASSWORD, this.creds.CODE, null);
        console.log(t('login_success', {name: `${user.accountInfo.address.firstName} ${user.accountInfo.address.lastName}`}));
        this.applyUser(user, false);
        await this.saveSession(user).catch(error => {
            console.log(t('save_session_failed', {message: error.message}));
        });
    }

    async persistCurrentSession() {
        if (!this.user) return;
        const cookieText = readCookieJar(this.auth.cookieJar);
        if (cookieText) this.user.cookieText = cookieText;
        await this.saveSession(this.user);
    }

    async info(APPID, appVerId) {
        const appInfo = await Store.AppInfo(APPID, appVerId, this.auth);
        const s = appInfo?.songList?.[0];
        const name = s?.metadata?.bundleDisplayName || 'UnknownApp';
        const ver = s?.metadata?.bundleShortVersionString || 'UnknownVer';
        console.log(t('app_info', {name, ver}));
        const noUpdateSuffix = process.env.IPA_REMOVE_APP_STORE_UPDATE_METADATA === '1' ? '_no-update' : '';
        this.out = path.join(this.dir, `${name}_${ver}${noUpdateSuffix}.ipa`);
        return s;
    }

    async resolveAppVersionID(APPID, appVerId, platform) {
        const explicit = String(appVerId || '').trim();
        if (explicit || !isAppleTVPlatform(platform)) return explicit;
        try {
            return await this.lookupTVVersion(APPID, {country: process.env.IPA_APP_COUNTRY || 'us'});
        } catch (error) {
            throw localizedTVError(error);
        }
    }

    async validateDownloadedPackage(platform) {
        try {
            await this.validatePackage(this.out, platform);
        } catch (error) {
            try {
                await this.removeOutputFile(this.out);
            } catch (cleanupError) {
                if (cleanupError?.code !== 'ENOENT') {
                    throw cleanupFailure(
                        'OUTPUT_CLEANUP_FAILED',
                        'Failed to remove rejected download output',
                        cleanupError,
                        error,
                    );
                }
            }
            throw localizedTVError(error);
        }
    }

    async cleanupTempParts(primaryError = null) {
        try {
            await this.removeTempTree(this.cache);
        } catch (cleanupError) {
            if (cleanupError?.code !== 'ENOENT') {
                throw cleanupFailure(
                    'TEMP_CLEANUP_FAILED',
                    'Failed to remove temporary download parts',
                    cleanupError,
                    primaryError,
                );
            }
        }
        console.log(t('cleanup_done'));
    }

    // 判断 App 是否免费：优先用上层（App 界面）传入的价格信号，未知时用 iTunes lookup 兜底。
    // 仅免费 App 才允许主动申请购买许可；付费 App 一律不触发购买（已购买的会直接命中 AppInfo）。
    async isFreeApp(APPID) {
        const flag = process.env.IPA_APP_IS_FREE;
        if (flag === '1') return true;
        if (flag === '0') return false;
        const info = await appPriceInfo(APPID, {country: process.env.IPA_APP_COUNTRY || 'us'});
        // lookup 不可用（地区差异等）时按「免费」处理，保持免费 App 可用；付费 App 仍会在 buyProduct 阶段被 Apple 拒绝、不会扣费。
        return info ? info.isFree : true;
    }

    // 从 Apple 官方元数据获取该 App 的全部历史版本 ID（外部版本标识）。
    // 用于第三方来源不可用时的兜底：登录后读取 softwareVersionExternalIdentifiers。
    async listVersionIds(APPID, platform = 'iphone') {
        if (!this.user) throw new Error('Please login() first');
        return await this._withReauth(() => this._listVersionIdsOnce(APPID, platform));
    }

    async _listVersionIdsOnce(APPID, platform) {
        const appleTV = isAppleTVPlatform(platform);
        const resolvedVersionID = await this.resolveAppVersionID(APPID, '', platform);
        // 先直接查（已购买 / 已获取过的 App 无需再申请许可，不产生任何副作用）。
        let song = await Store.AppInfo(APPID, resolvedVersionID, this.auth).catch(error => ({_error: error}));
        if (song?._error) {
            // 用稳定的 error.code 判断「缺少许可」，不依赖文案语言；Apple 自身英文消息保留兜底。
            const noLicense = isLicenseRequiredError(song._error);
            if (!noLicense) throw song._error;
            // 缺少许可：仅免费 App 才主动申请；付费且未购买的 App 直接报错、绝不触发购买。
            if (!(await this.isFreeApp(APPID))) {
                throw new Error(t('paid_not_purchased'));
            }
            if (process.env.IPA_ALLOW_APP_ACQUIRE !== '1') {
                return {
                    appId: String(APPID),
                    requiresAcquisition: true,
                    versionIds: [],
                };
            }
            await Store.purchase(APPID, resolvedVersionID, this.auth);
            song = await Store.AppInfo(APPID, resolvedVersionID, this.auth);
        }
        const s = song?.songList?.[0];
        const meta = s?.metadata || {};
        const ids = Array.isArray(meta.softwareVersionExternalIdentifiers)
            ? meta.softwareVersionExternalIdentifiers.map(String)
            : [];
        if (appleTV) {
            const normalizedTVIDs = [...new Set(
                ids.map(id => String(id).trim()).filter(Boolean)
            )];
            const versionIds = normalizedTVIDs.includes(String(resolvedVersionID))
                ? normalizedTVIDs
                : [String(resolvedVersionID)];
            return {
                appId: String(APPID),
                name: meta.bundleDisplayName || 'UnknownApp',
                latestVersion: meta.bundleShortVersionString || '',
                latestVersionId: resolvedVersionID,
                versionIds,
                platform: 'appletv',
            };
        }
        return {
            appId: String(APPID),
            name: meta.bundleDisplayName || 'UnknownApp',
            latestVersion: meta.bundleShortVersionString || '',
            latestVersionId: String(meta.softwareVersionExternalIdentifier ?? (ids.length ? ids[ids.length - 1] : '')),
            versionIds: ids,
        };
    }

    async resolveDownloadSong(APPID, appVerId) {
        try {
            // A previously acquired app can remain downloadable after it is
            // delisted. Query the download product first so that this path
            // does not depend on the public App Store listing or buyProduct.
            return await this.info(APPID, appVerId);
        } catch (error) {
            if (!isLicenseRequiredError(error)) throw error;
            if (!(await this.isFreeApp(APPID))) {
                throw new Error(t('paid_not_purchased'));
            }
            const purchaseResult = await Store.purchase(APPID, appVerId, this.auth);
            console.log(t('purchase_ok', {message: purchaseResult.customerMessage}));
            return await this.info(APPID, appVerId);
        }
    }

    async runDownload({dir = '.', APPID, appVerId, platform = 'iphone'} = {}) {
        if (!this.user) throw new Error('Please login() first');
        this.dir = dir;
        await fsPromises.mkdir(this.dir, {recursive: true});
        this.cache = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'idapastel-download-parts-'));
        console.log(t('temp_dir', {cache: this.cache}));
        let primaryError = null;
        try {
            const resolvedVersionID = await this.resolveAppVersionID(APPID, appVerId, platform);
            const song = await this.resolveDownloadSong(APPID, resolvedVersionID);
            const res = await download(song.URL, this.out, this.cache, this.auth.authHeaders || {});
            console.log(t('download_complete', {mb: (res.fileSize / 1024 / 1024).toFixed(2), parts: res.parts}));
            await this.validateDownloadedPackage(platform);
            // 稳定的机器标记：进入「校验/签名/存档」阶段，供 App 显示「打包中」（与显示文案解耦，不随语言变化）。
            console.log('@@IPA:phase=packaging');
            const signer = new SignatureClient(song, this.user.accountInfo.appleId, {
                includeAppStoreMetadata: process.env.IPA_REMOVE_APP_STORE_UPDATE_METADATA !== '1',
            });
            await signer.sign(this.out);

            console.log(t('file_archived', {out: this.out}));
        } catch (error) {
            primaryError = error;
            throw error;
        } finally {
            await this.persistCurrentSession().catch(() => {});
            let tempCleanupError = null;
            try {
                await this.cleanupTempParts(primaryError);
            } catch (error) {
                tempCleanupError = error;
            }
            Store.cleanup?.();
            if (tempCleanupError) throw tempCleanupError;
        }
    }

    async run(options = {}) {
        return await this._withReauth(() => this.runDownload(options));
    }

    // 执行 fn；若失败且疑似本地缓存会话过期，则清会话、强制重新登录（可能触发 2FA）后重试一次。
    async _withReauth(fn) {
        try {
            const result = await fn();
            await this.persistCurrentSession().catch(() => {});
            return result;
        } catch (error) {
            const message = error.message || String(error);
            // 用稳定的 error.code 判断商店会话过期（cookie/令牌失效），不依赖文案语言；Apple 英文消息保留兜底。
            const code = error.code;
            const sessionMayBeExpired = !CLEANUP_ERROR_CODES.has(code)
                && this.usedCachedSession
                && (code === 'TOKEN_EXPIRED'
                    || /401|403|Your password has changed\.?|password token is expired|token|session|authenticate|authorization|Sign In to the iTunes Store/i.test(message))
                && !/License not found|已拥有|already|not found/i.test(message);
            if (!sessionMayBeExpired) throw error;

            console.log(t('relogin'));
            await this.login({force: true});
            const result = await fn();
            await this.persistCurrentSession().catch(() => {});
            return result;
        }
    }
}
