/**
 * OpenCode 配置解析（D1 §5）。
 *
 * 隐私红线：
 * - 只读文件。绝不返回/记录任何 apiKey 明文。
 * - provider.apiKey 仅判断"是否为明文字面量"（区别于 {env:...} 引用），不返回值。
 * - MCP env / headers 仅暴露键名，绝不暴露键值。
 * - baseURL 属 endpoint 标识，可返回用于风险判定与展示。
 */
import { readFileSync } from "node:fs";
const SECRET_ENV_RE = /(api[_-]?key|auth|token|secret|password|bearer)/i;
function asRecord(v) {
    return v && typeof v === "object" && !Array.isArray(v)
        ? v
        : {};
}
function str(v) {
    return typeof v === "string" && v.length > 0 ? v : undefined;
}
/** 是否为 {env:...} / {file:...} 变量引用而非明文。 */
function isReference(v) {
    return /^\{(env|file):/i.test(v.trim());
}
export function looksLikeSecretEnv(key) {
    return SECRET_ENV_RE.test(key);
}
function parseProviders(cfg) {
    const out = [];
    for (const [name, raw] of Object.entries(asRecord(cfg.provider))) {
        const p = asRecord(raw);
        const opts = asRecord(p.options);
        const apiKey = opts.apiKey ?? p.apiKey;
        out.push({
            name,
            baseUrl: str(opts.baseURL) ?? str(opts.baseUrl) ?? str(p.baseURL),
            plaintextKey: typeof apiKey === "string" &&
                apiKey.trim().length > 0 &&
                !isReference(apiKey),
        });
    }
    return out;
}
function parseMcp(cfg) {
    const out = [];
    for (const [name, raw] of Object.entries(asRecord(cfg.mcp))) {
        const s = asRecord(raw);
        const type = str(s.type);
        const cmd = Array.isArray(s.command) ? s.command : undefined;
        // enabled 缺省为 true，仅显式 false 关闭。
        const enabled = s.enabled !== false;
        const envKeys = [
            ...Object.keys(asRecord(s.environment)),
            ...Object.keys(asRecord(s.headers)),
        ];
        out.push({
            name,
            type,
            command: cmd ? String(cmd[0]) : undefined,
            url: str(s.url),
            enabled,
            envKeys,
        });
    }
    return out;
}
/** 归一化 permission 字段（可为字符串或对象）。 */
function parsePermission(cfg) {
    const perm = cfg.permission;
    if (typeof perm === "string") {
        return { bash: perm, edit: perm, wildcard: perm === "allow" };
    }
    const p = asRecord(perm);
    const bash = str(p.bash);
    const edit = str(p.edit);
    const vals = [bash, edit, str(p.webfetch)].filter(Boolean);
    const wildcard = vals.length > 0 && vals.every((v) => v === "allow");
    return { bash, edit, wildcard };
}
/**
 * 读取并归一化 OpenCode 配置。
 * @param configPath opencode.json 路径（discover 已判定存在）。
 */
export function parseOpenCode(configPath) {
    let cfg = {};
    let configParsed = false;
    try {
        cfg = asRecord(JSON.parse(readFileSync(configPath, "utf8")));
        configParsed = true;
    }
    catch {
        /* 结构损坏则按空处理 */
    }
    const perm = parsePermission(cfg);
    return {
        configParsed,
        providers: parseProviders(cfg),
        mcpServers: parseMcp(cfg),
        permissionBash: perm.bash,
        permissionEdit: perm.edit,
        permissionWildcard: perm.wildcard,
        autoupdate: typeof cfg.autoupdate === "boolean" ? cfg.autoupdate : undefined,
        share: str(cfg.share),
    };
}
//# sourceMappingURL=parse.js.map