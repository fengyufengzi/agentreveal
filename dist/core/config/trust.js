/** 项目级 Provider 可信端点管理；写入 .agentguard.json 并保留追加式审计事件。 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { atomicWriteFile } from "../fs-safety.js";
const TRUSTABLE_PROVIDER_RULES = new Set([
    "CLAUDE_UNKNOWN_BASE_URL",
    "CODEX_CUSTOM_PROVIDER",
    "CCSWITCH_UNKNOWN_BASE_URL",
    "CCSWITCH_RELAY_ENDPOINT",
    "OPENCODE_CUSTOM_PROVIDER",
    "XAGENT_SHARED_ENDPOINT",
]);
function configCandidates(cwd) {
    return [join(cwd, ".agentguard.json"), join(cwd, "agentguard.config.json")];
}
function asObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} 必须是 JSON object。`);
    }
    return value;
}
function stringArray(value, label) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
        throw new Error(`${label} 必须是字符串数组。`);
    }
    return value;
}
function normalizedHostname(value) {
    try {
        const url = new URL(value.includes("://") ? value : `https://${value}`);
        if (!url.hostname || (url.protocol !== "http:" && url.protocol !== "https:")) {
            return undefined;
        }
        if (url.username || url.password)
            return undefined;
        return url.hostname.toLowerCase().replace(/\.$/, "");
    }
    catch {
        return undefined;
    }
}
/** URL、host、host:port 最终都保存为 host；通配符只允许最左侧 `*.`。 */
export function normalizeProviderEndpoint(input) {
    if (typeof input !== "string" || input.trim().length === 0) {
        throw new Error("端点不能为空。");
    }
    const raw = input.trim().toLowerCase();
    const wildcard = raw.startsWith("*.");
    const host = normalizedHostname(wildcard ? raw.slice(2) : raw);
    if (!host || (!host.includes(".") && host !== "localhost" && isIP(host) === 0)) {
        throw new Error("端点必须是有效 URL、域名、IP 或 *.example.com 通配符。");
    }
    if (wildcard && (isIP(host) !== 0 || host === "localhost")) {
        throw new Error("通配符信任只支持 *.example.com 形式的域名。");
    }
    return wildcard ? `*.${host}` : host;
}
/** 只允许未知/疑似中转规则提供信任入口；HTTP、密钥和权限规则永远不提供。 */
export function providerTrustCandidateForTask(task) {
    for (const item of task.items) {
        if (!TRUSTABLE_PROVIDER_RULES.has(item.finding.id))
            continue;
        const evidence = item.finding.evidence;
        for (const key of ["baseUrl", "endpoint"]) {
            const value = evidence?.[key];
            if (typeof value !== "string")
                continue;
            try {
                return { endpoint: normalizeProviderEndpoint(value) };
            }
            catch {
                // 无法规范化的端点仍应作为风险显示，但不能写入项目级信任策略。
            }
        }
    }
    return undefined;
}
function normalizeReason(reason) {
    const normalized = typeof reason === "string" ? reason.trim() : "";
    if (!normalized)
        throw new Error("必须填写信任变更原因。");
    if (normalized.length > 500)
        throw new Error("信任变更原因不能超过 500 个字符。");
    return normalized;
}
function readDocument(cwd) {
    const existing = configCandidates(cwd).find(existsSync);
    const path = existing ?? configCandidates(cwd)[0];
    if (!existing)
        return { path, mode: 0o644, document: {} };
    try {
        return {
            path,
            mode: statSync(path).mode & 0o777,
            document: asObject(JSON.parse(readFileSync(path, "utf8")), "AgentGuard 配置"),
        };
    }
    catch (error) {
        throw new Error(`无法安全更新 ${path}：${error instanceof Error ? error.message : String(error)}`);
    }
}
function readEntries(document) {
    const providers = document.providers === undefined
        ? {}
        : asObject(document.providers, "providers");
    const trusted = [
        ...stringArray(providers.trusted, "providers.trusted"),
        ...stringArray(providers.trustedEndpoints, "providers.trustedEndpoints"),
    ].map(normalizeProviderEndpoint);
    const internal = [
        ...stringArray(providers.internal, "providers.internal"),
        ...stringArray(providers.internalEndpoints, "providers.internalEndpoints"),
    ].map(normalizeProviderEndpoint);
    const overlap = trusted.find((endpoint) => internal.includes(endpoint));
    if (overlap) {
        throw new Error(`${overlap} 不能同时标记为 trusted 和 internal。`);
    }
    return [
        ...[...new Set(trusted)].map((endpoint) => ({ endpoint, kind: "trusted" })),
        ...[...new Set(internal)].map((endpoint) => ({ endpoint, kind: "internal" })),
    ];
}
function readAudit(document) {
    const value = document.providerTrustAudit;
    if (value === undefined)
        return [];
    if (!Array.isArray(value))
        throw new Error("providerTrustAudit 必须是数组。");
    return value.map((event, index) => {
        if (!event || typeof event !== "object" || Array.isArray(event)) {
            throw new Error(`providerTrustAudit[${index}] 必须是 object。`);
        }
        const item = event;
        const valid = ((item.action === "add" || item.action === "remove") &&
            (item.kind === "trusted" || item.kind === "internal") &&
            typeof item.endpoint === "string" &&
            typeof item.reason === "string" &&
            typeof item.at === "string");
        if (!valid)
            throw new Error(`providerTrustAudit[${index}] 格式无效。`);
        normalizeProviderEndpoint(item.endpoint);
        if (!normalizeReason(item.reason)) {
            throw new Error(`providerTrustAudit[${index}] 原因无效。`);
        }
        const at = new Date(item.at);
        if (!Number.isFinite(at.getTime())) {
            throw new Error(`providerTrustAudit[${index}] 时间无效。`);
        }
        return item;
    });
}
function writeState(source, entries, audit) {
    const providers = source.document.providers === undefined
        ? {}
        : { ...asObject(source.document.providers, "providers") };
    providers.trusted = entries.filter((entry) => entry.kind === "trusted").map((entry) => entry.endpoint);
    providers.internal = entries.filter((entry) => entry.kind === "internal").map((entry) => entry.endpoint);
    delete providers.trustedEndpoints;
    delete providers.internalEndpoints;
    const document = {
        ...source.document,
        providers,
        providerTrustAudit: audit,
    };
    atomicWriteFile(source.path, JSON.stringify(document, null, 2) + "\n", source.mode);
}
export function listProviderTrust(cwd) {
    const source = readDocument(cwd);
    return {
        configPath: source.path,
        entries: readEntries(source.document),
        audit: readAudit(source.document),
    };
}
export function addProviderTrust(input) {
    if (input.kind !== "trusted" && input.kind !== "internal") {
        throw new Error("信任类型仅支持 trusted 或 internal。");
    }
    const endpoint = normalizeProviderEndpoint(input.endpoint);
    const reason = normalizeReason(input.reason);
    const source = readDocument(input.cwd);
    const entries = readEntries(source.document);
    const existing = entries.find((entry) => entry.endpoint === endpoint);
    if (existing) {
        throw new Error(existing.kind === input.kind
            ? `${endpoint} 已处于 ${input.kind} 状态。`
            : `${endpoint} 已标记为 ${existing.kind}；请先移除再更改类型。`);
    }
    const at = input.now ?? new Date();
    if (!Number.isFinite(at.getTime()))
        throw new Error("当前时间无效。");
    const nextEntries = [...entries, { endpoint, kind: input.kind }];
    const audit = [
        ...readAudit(source.document),
        { action: "add", endpoint, kind: input.kind, reason, at: at.toISOString() },
    ];
    writeState(source, nextEntries, audit);
    return { configPath: source.path, entries: nextEntries, audit };
}
export function removeProviderTrust(input) {
    if (input.kind !== "trusted" && input.kind !== "internal") {
        throw new Error("信任类型仅支持 trusted 或 internal。");
    }
    const endpoint = normalizeProviderEndpoint(input.endpoint);
    const reason = normalizeReason(input.reason);
    const source = readDocument(input.cwd);
    const entries = readEntries(source.document);
    if (!entries.some((entry) => entry.endpoint === endpoint && entry.kind === input.kind)) {
        throw new Error(`${endpoint} 当前没有 ${input.kind} 信任记录。`);
    }
    const at = input.now ?? new Date();
    if (!Number.isFinite(at.getTime()))
        throw new Error("当前时间无效。");
    const nextEntries = entries.filter((entry) => !(entry.endpoint === endpoint && entry.kind === input.kind));
    const audit = [
        ...readAudit(source.document),
        { action: "remove", endpoint, kind: input.kind, reason, at: at.toISOString() },
    ];
    writeState(source, nextEntries, audit);
    return { configPath: source.path, entries: nextEntries, audit };
}
//# sourceMappingURL=trust.js.map