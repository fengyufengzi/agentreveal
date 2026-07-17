/**
 * CC Switch SQLite 解析（D1 §3）。
 *
 * 隐私红线：
 * - 只读打开数据库。
 * - 绝不返回/记录明文密钥。密钥仅用于在内存内计算指纹（SHA-256 前 12 位十六进制），
 *   用于"同 key 多处复用"关联；指纹不可逆推原文。
 * - base_url 属 endpoint 标识，可返回用于风险判定与展示。
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
/** 当前 adapter 已验证支持的 schema 版本。 */
const KNOWN_SCHEMA_VERSIONS = new Set([10]);
/** 匹配"疑似密钥"的字段名。 */
const SECRET_KEY_RE = /(api[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|secret|^key$|token)/i;
/** 匹配 base_url 字段名。 */
const BASEURL_KEY_RE = /(base[_-]?url|baseurl|endpoint)/i;
/** 计算密钥指纹（不可逆）。 */
function fingerprint(secret) {
    return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}
/** URL 合法性粗判。 */
function looksLikeUrl(v) {
    return /^https?:\/\//i.test(v);
}
/**
 * 递归遍历 settings_config JSON，提取 base_url 与密钥指纹。
 * 覆盖各 app_type 的差异结构（claude 用 env.*、openclaw 用 baseUrl/apiKey、codex 用 auth.* + config 字符串）。
 */
function extractFromConfig(cfg) {
    let baseUrl;
    let secret;
    const walk = (node) => {
        if (node === null)
            return;
        if (typeof node === "string")
            return;
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (typeof node !== "object")
            return;
        for (const [k, v] of Object.entries(node)) {
            if (typeof v === "string") {
                if (!baseUrl && BASEURL_KEY_RE.test(k) && looksLikeUrl(v)) {
                    baseUrl = v;
                }
                else if (!secret && SECRET_KEY_RE.test(k) && v.trim().length > 0) {
                    secret = v;
                }
                else if (k === "config" && v.includes("base_url")) {
                    // codex：base_url 埋在 config 的 TOML 字符串里
                    const m = v.match(/base_url\s*=\s*["']([^"']+)["']/i);
                    if (m && !baseUrl && looksLikeUrl(m[1]))
                        baseUrl = m[1];
                }
            }
            else if (v && typeof v === "object") {
                walk(v);
            }
        }
    };
    walk(cfg);
    return {
        baseUrl,
        keyPresent: secret !== undefined,
        keyFingerprint: secret ? fingerprint(secret) : undefined,
    };
}
/**
 * 读取并归一化 CC Switch SQLite 数据库。
 * 调用方需自行确保 dbPath 存在（discover 已判定）。
 */
export function parseCcSwitchDb(dbPath) {
    // node:sqlite 仍会打印 ExperimentalWarning；按需加载可避免污染不需要 SQLite 的命令。
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
        const schemaVersion = db.prepare("PRAGMA user_version").get()
            .user_version ?? 0;
        const rawProviders = db
            .prepare("SELECT app_type, name, is_current, in_failover_queue, category, settings_config FROM providers")
            .all();
        const providers = rawProviders.map((r) => {
            let cfg = {};
            try {
                cfg = JSON.parse(String(r.settings_config ?? "{}"));
            }
            catch {
                /* 结构损坏则按空处理 */
            }
            const ext = extractFromConfig(cfg);
            return {
                appType: String(r.app_type),
                name: String(r.name),
                isCurrent: Number(r.is_current) === 1,
                inFailoverQueue: Number(r.in_failover_queue) === 1,
                category: r.category ? String(r.category) : undefined,
                baseUrl: ext.baseUrl,
                keyPresent: ext.keyPresent,
                keyFingerprint: ext.keyFingerprint,
            };
        });
        let proxies = [];
        try {
            const rawProxies = db
                .prepare("SELECT app_type, proxy_enabled, listen_address, listen_port, auto_failover_enabled FROM proxy_config")
                .all();
            proxies = rawProxies.map((r) => ({
                appType: String(r.app_type),
                enabled: Number(r.proxy_enabled) === 1,
                listenAddress: String(r.listen_address),
                listenPort: Number(r.listen_port),
                autoFailover: Number(r.auto_failover_enabled) === 1,
            }));
        }
        catch {
            /* 旧版可能无 proxy_config 表 */
        }
        return {
            schemaVersion,
            schemaKnown: KNOWN_SCHEMA_VERSIONS.has(schemaVersion),
            providers,
            proxies,
        };
    }
    finally {
        db.close();
    }
}
//# sourceMappingURL=parse.js.map