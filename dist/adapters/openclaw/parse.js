/**
 * OpenClaw 配置解析（discovery → deepScan 之间的归一化层）。
 *
 * 约定：
 * - 只读 openclaw.json，不读 service-env 任何凭据内容。
 * - 不读取 plugin 源码或 skill 源码；只检查配置字段名。
 * - 解析失败不抛错，返回 { ok:false, reason } 让 risk.ts 决定如何降级。
 */
import { readFileSync } from "node:fs";
import { describeParseFailure } from "../../core/parse-failure.js";
const SERVICE_ENV_GLOB_HINT = "service-env";
// 直接列举常见的 env 文件名以避免 glob 库依赖。
const KNOWN_SERVICE_ENV_FILES = [
    "ai.openclaw.gateway.env",
    "openclaw.gateway.env",
    "gateway.env",
];
/** 只判断值是否为外部环境变量引用，不返回或记录 secret 本身。 */
function isLiteralSecret(value) {
    if (typeof value !== "string" || value.length === 0)
        return false;
    return !/^\$(?:\{[A-Z_][A-Z0-9_]*\}|[A-Z_][A-Z0-9_]*)$/i.test(value.trim());
}
/**
 * 安全探测 OpenClaw 配置：捕获所有解析错误并降级。
 * evidence 仅含结构信息（字段名/路径/计数），绝不含 secret 值。
 */
export function parseOpenClaw(configPath, homeDir, serviceEnvDir) {
    if (!configPath)
        return { ok: false, reason: "配置文件不存在" };
    let raw;
    try {
        raw = readFileSync(configPath, "utf8");
    }
    catch (e) {
        return { ok: false, reason: describeParseFailure(e, configPath, "JSON").reason };
    }
    let json;
    try {
        json = JSON.parse(raw);
    }
    catch (e) {
        return { ok: false, reason: describeParseFailure(e, configPath, "JSON").reason };
    }
    // —— gateway ——
    const gwRaw = (json.gateway ?? {});
    const gw = {};
    if (typeof gwRaw.port === "number")
        gw.port = gwRaw.port;
    if (typeof gwRaw.mode === "string")
        gw.mode = gwRaw.mode;
    if (typeof gwRaw.bind === "string")
        gw.bind = gwRaw.bind;
    const authRaw = (gwRaw.auth ?? {});
    if (isLiteralSecret(authRaw.token)) {
        gw.auth = { token: "***" };
    }
    if (isLiteralSecret(authRaw.password)) {
        gw.auth = { ...(gw.auth ?? {}), password: "***" };
    }
    if (gwRaw.tailscale && typeof gwRaw.tailscale === "object") {
        const ts = gwRaw.tailscale;
        gw.tailscale = {
            mode: typeof ts.mode === "string" ? ts.mode : undefined,
            hostname: typeof ts.hostname === "string" ? ts.hostname : undefined,
        };
    }
    else if (gwRaw.tailscale === true) {
        gw.tailscale = true;
    }
    // —— channels: secret 存在性探测 ——
    const channels = [];
    const channelsTop = (json.channels ?? {});
    for (const [name, value] of Object.entries(channelsTop)) {
        if (!value || typeof value !== "object")
            continue;
        const v = value;
        const hasAppSecret = isLiteralSecret(v.appSecret);
        const hasToken = isLiteralSecret(v.token);
        if (hasAppSecret || hasToken) {
            channels.push({ channel: name, hasAppSecret, hasToken });
        }
    }
    // —— plugins ——
    const plugins = [];
    const pluginsTop = (json.plugins ?? {});
    for (const [name, value] of Object.entries(pluginsTop)) {
        if (!value || typeof value !== "object")
            continue;
        const v = value;
        plugins.push({
            name,
            source: typeof v.source === "string" ? v.source : undefined,
            enabled: typeof v.enabled === "boolean" ? v.enabled : undefined,
        });
    }
    // —— agents ——
    const agents = [];
    const agentsRoot = (json.agents ?? {});
    if (Array.isArray(agentsRoot.list)) {
        for (const a of agentsRoot.list) {
            if (!a || typeof a !== "object")
                continue;
            const v = a;
            if (typeof v.id !== "string")
                continue;
            agents.push({
                id: v.id,
                name: typeof v.name === "string" ? v.name : undefined,
                workspace: typeof v.workspace === "string" ? v.workspace : undefined,
                agentDir: typeof v.agentDir === "string" ? v.agentDir : undefined,
            });
        }
    }
    // —— meta ——
    const metaRaw = (json.meta ?? {});
    const meta = {
        lastTouchedVersion: typeof metaRaw.lastTouchedVersion === "string"
            ? metaRaw.lastTouchedVersion
            : undefined,
        lastTouchedAt: typeof metaRaw.lastTouchedAt === "string" ? metaRaw.lastTouchedAt : undefined,
    };
    // —— service-env 探测（不读文件内容） ——
    let serviceEnvPresent = false;
    if (serviceEnvDir) {
        for (const f of KNOWN_SERVICE_ENV_FILES) {
            try {
                const { statSync } = require("node:fs");
                statSync(`${serviceEnvDir}/${f}`);
                serviceEnvPresent = true;
                break;
            }
            catch {
                // ignore
            }
        }
    }
    return {
        ok: true,
        data: {
            configFound: true,
            configPath,
            meta,
            gateway: Object.keys(gw).length > 0 ? gw : undefined,
            channels,
            plugins,
            agents,
            serviceEnvPresent,
        },
    };
}
//# sourceMappingURL=parse.js.map