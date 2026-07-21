/**
 * Claude Code 配置解析（D1 §1）。
 *
 * 隐私红线：
 * - 只读文件。绝不返回/记录任何 token / api_key 明文。
 * - settings.json env 中的密钥只在内存中区分真实值与已知代理占位符，绝不返回值。
 * - MCP env 仅暴露键名（用于识别是否内嵌密钥），绝不暴露键值。
 * - base_url（ANTHROPIC_BASE_URL）属 endpoint 标识，可返回用于风险判定与展示。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigParseError } from "../../core/parse-failure.js";
import { isProxyManagedPlaceholder } from "../../core/proxy-managed.js";
const SECRET_ENV_RE = /(api[_-]?key|auth[_-]?token|access[_-]?token|secret|token|password)/i;
const TOKEN_ENV_RE = /^(ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY)$/i;
function asRecord(v) {
    return v && typeof v === "object" && !Array.isArray(v)
        ? v
        : {};
}
function str(v) {
    return typeof v === "string" && v.length > 0 ? v : undefined;
}
function readJson(path) {
    if (!existsSync(path))
        return undefined;
    try {
        return asRecord(JSON.parse(readFileSync(path, "utf8")));
    }
    catch (error) {
        throw new ConfigParseError(path, "JSON", error);
    }
}
/** 从一个 mcpServers 映射解析 server 列表。 */
function parseMcp(map, scope) {
    const out = [];
    for (const [name, raw] of Object.entries(map)) {
        const s = asRecord(raw);
        out.push({
            name,
            scope,
            type: str(s.type),
            command: str(s.command),
            url: str(s.url),
            envKeys: Object.keys(asRecord(s.env)),
        });
    }
    return out;
}
export function looksLikeSecretEnv(key) {
    return SECRET_ENV_RE.test(key);
}
function isPlaintextCredential(value) {
    return (typeof value === "string" &&
        value.trim().length > 0 &&
        !isProxyManagedPlaceholder(value));
}
/**
 * 返回实际包含 Claude 明文字段的设置文件路径，不返回字段值。
 * Desktop 备份流程据此限定目标，避免复制无关配置。
 */
export function claudePlaintextSettingsFiles(configDir) {
    return ["settings.json", "settings.local.json"]
        .map((name) => join(configDir, name))
        .filter((path) => {
        const config = readJson(path);
        if (!config)
            return false;
        return Object.entries(asRecord(config.env)).some(([key, value]) => TOKEN_ENV_RE.test(key) &&
            isPlaintextCredential(value));
    });
}
/**
 * 读取并归一化 Claude Code 配置。
 * @param configDir 主配置目录（~/.claude 或 CLAUDE_CONFIG_DIR）。
 * @param home 用户主目录（用于定位 ~/.claude.json 全局状态）。
 */
export function parseClaudeCode(configDir, home) {
    const base = readJson(join(configDir, "settings.json"));
    const local = readJson(join(configDir, "settings.local.json"));
    const settingsFound = base !== undefined || local !== undefined;
    // 合并：env 浅合并（local 覆盖）、permissions.allow 取并集、标量 local 优先。
    const env = { ...asRecord(base?.env), ...asRecord(local?.env) };
    const perm = { ...asRecord(base?.permissions), ...asRecord(local?.permissions) };
    const allowOf = (cfg) => {
        const a = asRecord(cfg?.permissions).allow;
        return Array.isArray(a) ? a : [];
    };
    const permissionAllowRules = [...allowOf(base), ...allowOf(local)].filter((x) => typeof x === "string");
    const defaultMode = str(perm.defaultMode);
    const apiKeyHelper = str(local?.apiKeyHelper) ?? str(base?.apiKeyHelper);
    const hooks = Object.keys(asRecord(local?.hooks)).length > 0 ||
        Object.keys(asRecord(base?.hooks)).length > 0;
    const enableAllProjectMcp = local?.enableAllProjectMcpServers === true ||
        base?.enableAllProjectMcpServers === true;
    // 明文泄露是静态文件风险，不能只检查 local 覆盖后的有效值：被覆盖的 base 字段仍可能泄露。
    const tokenEntries = [base, local].flatMap((config) => Object.entries(asRecord(config?.env)).filter(([key]) => TOKEN_ENV_RE.test(key)));
    const authTokenPresent = tokenEntries.some(([, value]) => isPlaintextCredential(value));
    const proxyManagedPlaceholderPresent = tokenEntries.some(([, value]) => isProxyManagedPlaceholder(value));
    // 全局状态 ~/.claude.json：mcpServers（全局）+ projects[*].mcpServers（项目级）。
    const globalState = readJson(join(home, ".claude.json")) ?? {};
    const mcpServers = [
        ...parseMcp(asRecord(globalState.mcpServers), "global"),
    ];
    for (const proj of Object.values(asRecord(globalState.projects))) {
        const pm = asRecord(asRecord(proj).mcpServers);
        if (Object.keys(pm).length)
            mcpServers.push(...parseMcp(pm, "project"));
    }
    return {
        settingsFound,
        baseUrl: str(env.ANTHROPIC_BASE_URL),
        authTokenPresent,
        proxyManagedPlaceholderPresent,
        apiKeyHelperPresent: apiKeyHelper !== undefined,
        permissionAllowRules,
        defaultMode,
        bypassPermissions: defaultMode === "bypassPermissions",
        hooksPresent: hooks,
        enableAllProjectMcp,
        mcpServers,
    };
}
//# sourceMappingURL=parse.js.map