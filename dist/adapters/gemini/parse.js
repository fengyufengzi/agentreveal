/**
 * Gemini CLI 配置解析（settings.json + .env）。
 *
 * 隐私红线：
 * - 只读文件。绝不返回/记录任何 API key 明文。
 * - .env 中的密钥仅判断"是否存在"（value 非空且非 ${VAR} 引用），只收键名不收值。
 * - MCP env / headers 仅暴露键名（用于识别是否内嵌密钥），绝不暴露键值。
 * - MCP url / httpUrl 属 endpoint 标识，可返回用于风险判定与展示。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigParseError } from "../../core/parse-failure.js";
import { isProxyManagedPlaceholder } from "../../core/proxy-managed.js";
const SECRET_ENV_RE = /(api[_-]?key|auth[_-]?token|access[_-]?token|secret|token|password)/i;
const SHELL_TOOL = "run_shell_command";
function asRecord(v) {
    return v && typeof v === "object" && !Array.isArray(v)
        ? v
        : {};
}
function str(v) {
    return typeof v === "string" && v.length > 0 ? v : undefined;
}
function strArray(v) {
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}
function readJson(path) {
    try {
        return asRecord(JSON.parse(readFileSync(path, "utf8")));
    }
    catch (error) {
        throw new ConfigParseError(path, "JSON", error);
    }
}
export function looksLikeSecretEnv(key) {
    return SECRET_ENV_RE.test(key);
}
/** 解析 mcpServers 映射。 */
function parseMcp(map) {
    const out = [];
    for (const [name, raw] of Object.entries(map)) {
        const s = asRecord(raw);
        out.push({
            name,
            command: str(s.command),
            url: str(s.url) ?? str(s.httpUrl),
            trust: s.trust === true,
            envKeys: Object.keys(asRecord(s.env)),
            headerKeys: Object.keys(asRecord(s.headers)),
        });
    }
    return out;
}
/**
 * 解析 ~/.gemini/.env：仅收集 value 非空且非 ${VAR} 引用的键名。
 * 读不到 / 为空则返回 []。绝不返回任何 value。
 */
function parseEnvPresence(envPath) {
    let text;
    try {
        text = readFileSync(envPath, "utf8");
    }
    catch {
        return { plaintextKeys: [], proxyManagedPlaceholderPresent: false };
    }
    const plaintextKeys = [];
    let proxyManagedPlaceholderPresent = false;
    let baseUrl;
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#"))
            continue;
        const eq = line.indexOf("=");
        if (eq <= 0)
            continue;
        const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
        let value = line.slice(eq + 1).trim();
        // 去掉包裹引号
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!key)
            continue;
        if (key === "GOOGLE_GEMINI_BASE_URL" && /^https?:\/\//i.test(value)) {
            baseUrl = value;
            continue;
        }
        // 空值或纯 ${VAR} 引用视为"未内嵌明文"。
        if (value.length === 0)
            continue;
        if (/^\$\{[^}]+\}$/.test(value) || /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(value))
            continue;
        if (!SECRET_ENV_RE.test(key))
            continue;
        if (isProxyManagedPlaceholder(value)) {
            proxyManagedPlaceholderPresent = true;
            continue;
        }
        plaintextKeys.push(key);
    }
    return { plaintextKeys, proxyManagedPlaceholderPresent, baseUrl };
}
/**
 * 读取并归一化 Gemini CLI 配置。
 * @param settingsPath ~/.gemini/settings.json 路径。
 * @param configDir 配置目录（用于定位 .env）。
 */
export function parseGemini(settingsPath, configDir) {
    const settings = readJson(settingsPath) ?? {};
    const authType = str(asRecord(asRecord(settings.security).auth).selectedType);
    const mcpServers = parseMcp(asRecord(settings.mcpServers));
    const mcpExcluded = strArray(asRecord(settings.mcp).excluded);
    const tools = asRecord(settings.tools);
    const sandboxRaw = tools.sandbox;
    const sandbox = typeof sandboxRaw === "string" || typeof sandboxRaw === "boolean"
        ? sandboxRaw
        : undefined;
    // 仅在 coreTools 显式列出 run_shell_command 时判为启用（避免默认安装误报），
    // 且未被 excludeTools 屏蔽。
    const coreListsShell = strArray(tools.coreTools).some((t) => t === SHELL_TOOL || t.startsWith(SHELL_TOOL + "("));
    const shellExcluded = strArray(tools.excludeTools).some((t) => t === SHELL_TOOL || t.startsWith(SHELL_TOOL + "("));
    const shellToolAllowed = coreListsShell && !shellExcluded;
    const env = parseEnvPresence(join(configDir, ".env"));
    return {
        settingsParsed: true,
        authType,
        mcpServers,
        mcpExcluded,
        sandbox,
        shellToolAllowed,
        plaintextEnvKeys: env.plaintextKeys,
        proxyManagedPlaceholderPresent: env.proxyManagedPlaceholderPresent,
        baseUrl: env.baseUrl,
    };
}
//# sourceMappingURL=parse.js.map