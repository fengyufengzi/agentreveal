/**
 * 当前项目的低优先级规则忽略策略。
 *
 * 与 risk accept 不同：ignore 按 Agent + ruleId 持续生效，即使 evidence/taskId 变化；
 * 因此只允许 P2/P3 且不属于高风险家族的规则，并把策略与追加式审计写入项目配置。
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getRuleAction } from "../../rules/action-matrix.js";
import { RULE_IDS } from "../../rules/ids.js";
import { atomicWriteFile } from "../fs-safety.js";
import { describeParseFailure } from "../parse-failure.js";
const AGENTS = {
    "claude-code": true,
    codex: true,
    "cc-switch": true,
    opencode: true,
    gemini: true,
    openclaw: true,
    workspace: true,
};
const RULES = new Set(RULE_IDS);
const FORBIDDEN_FAMILIES = new Set([
    "provider.endpoint",
    "secret.plaintext",
    "secret.key-reuse",
    "permission.execution",
    "coverage.parse",
    "coverage.schema",
    "coverage.truncated",
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
function normalizeReason(reason) {
    const normalized = typeof reason === "string" ? reason.trim() : "";
    if (!normalized)
        throw new Error("必须填写项目忽略原因。");
    if (normalized.length > 500)
        throw new Error("项目忽略原因不能超过 500 个字符。");
    return normalized;
}
function parseRuleId(value, label = "ruleId") {
    if (typeof value !== "string" || !RULES.has(value)) {
        throw new Error(`${label} 不是已知 AgentGuard 规则。`);
    }
    return value;
}
function parseAgent(value, label = "agent") {
    if (typeof value !== "string" || !Object.hasOwn(AGENTS, value)) {
        throw new Error(`${label} 不是已知 Agent。`);
    }
    return value;
}
function normalizeDate(value, label) {
    if (value === undefined)
        return undefined;
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`${label} 必须是有效日期。`);
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()))
        throw new Error(`${label} 必须是有效日期。`);
    return date.toISOString();
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
        const failure = describeParseFailure(error, path, "JSON");
        throw new Error(`无法安全读取 ${failure.path}：${failure.reason}`);
    }
}
function parseEntry(value, index) {
    const item = asObject(value, `ruleIgnores[${index}]`);
    const reason = normalizeReason(item.reason);
    const createdAt = normalizeDate(item.createdAt, `ruleIgnores[${index}].createdAt`);
    if (!createdAt)
        throw new Error(`ruleIgnores[${index}].createdAt 不能为空。`);
    const expiresAt = normalizeDate(item.expiresAt, `ruleIgnores[${index}].expiresAt`);
    return {
        ruleId: parseRuleId(item.ruleId, `ruleIgnores[${index}].ruleId`),
        agent: parseAgent(item.agent, `ruleIgnores[${index}].agent`),
        reason,
        createdAt,
        ...(expiresAt ? { expiresAt } : {}),
    };
}
function readEntries(document) {
    const raw = document.ruleIgnores;
    if (raw === undefined)
        return [];
    if (!Array.isArray(raw))
        throw new Error("ruleIgnores 必须是数组。");
    const entries = raw.map(parseEntry);
    const identities = new Set();
    for (const entry of entries) {
        const identity = `${entry.agent}\0${entry.ruleId}`;
        if (identities.has(identity)) {
            throw new Error(`${entry.agent}/${entry.ruleId} 存在重复项目忽略。`);
        }
        identities.add(identity);
    }
    return entries;
}
function parseEvent(value, index) {
    const item = asObject(value, `ruleIgnoreAudit[${index}]`);
    if (item.action !== "add" && item.action !== "remove") {
        throw new Error(`ruleIgnoreAudit[${index}].action 无效。`);
    }
    const at = normalizeDate(item.at, `ruleIgnoreAudit[${index}].at`);
    if (!at)
        throw new Error(`ruleIgnoreAudit[${index}].at 不能为空。`);
    const expiresAt = normalizeDate(item.expiresAt, `ruleIgnoreAudit[${index}].expiresAt`);
    return {
        action: item.action,
        ruleId: parseRuleId(item.ruleId, `ruleIgnoreAudit[${index}].ruleId`),
        agent: parseAgent(item.agent, `ruleIgnoreAudit[${index}].agent`),
        reason: normalizeReason(item.reason),
        at,
        ...(expiresAt ? { expiresAt } : {}),
    };
}
function readAudit(document) {
    const raw = document.ruleIgnoreAudit;
    if (raw === undefined)
        return [];
    if (!Array.isArray(raw))
        throw new Error("ruleIgnoreAudit 必须是数组。");
    return raw.map(parseEvent);
}
function writeState(source, entries, audit) {
    const document = {
        ...source.document,
        ruleIgnores: entries,
        ruleIgnoreAudit: audit,
    };
    atomicWriteFile(source.path, JSON.stringify(document, null, 2) + "\n", source.mode);
}
function statusOf(entry, now) {
    return entry.expiresAt && new Date(entry.expiresAt).getTime() <= now.getTime()
        ? "expired"
        : "active";
}
/** 只有低优先级、非 fix、非高风险家族规则可以成为项目级忽略。 */
export function ruleIgnoreEligibility(ruleId) {
    const action = getRuleAction(ruleId);
    if (!action)
        return { allowed: false, reason: "未知规则不能加入项目忽略。" };
    if (action.priority === "P0" || action.priority === "P1") {
        return { allowed: false, reason: "P0/P1 规则不能通过项目级忽略隐藏。" };
    }
    if (action.disposition === "fix" || FORBIDDEN_FAMILIES.has(action.group.family)) {
        return { allowed: false, reason: "需要修复或属于高风险家族的规则不能加入项目忽略。" };
    }
    return { allowed: true };
}
export function ruleIgnoreCandidatesForTask(task) {
    if (!task.agent)
        return [];
    return task.requirements.flatMap((requirement) => {
        const eligibility = ruleIgnoreEligibility(requirement.ruleId);
        return eligibility.allowed
            ? [{ ruleId: requirement.ruleId, agent: task.agent }]
            : [];
    });
}
export function listRuleIgnores(cwd, now = new Date()) {
    const source = readDocument(cwd);
    return {
        configPath: source.path,
        entries: readEntries(source.document).map((entry) => ({
            ...entry,
            status: statusOf(entry, now),
        })),
        audit: readAudit(source.document),
    };
}
export function activeRuleIgnores(cwd, now = new Date()) {
    return listRuleIgnores(cwd, now).entries.filter((entry) => entry.status === "active");
}
/**
 * 扫描主流程中的项目策略读取必须 fail closed：配置损坏时不应用任何忽略，
 * 由 scan/config warning 告知用户；管理命令仍使用 listRuleIgnores 暴露错误。
 */
export function activeRuleIgnoresSafely(cwd, now = new Date()) {
    try {
        return activeRuleIgnores(cwd, now);
    }
    catch {
        return [];
    }
}
export function addRuleIgnore(input) {
    const ruleId = parseRuleId(input.ruleId);
    const agent = parseAgent(input.agent);
    const eligibility = ruleIgnoreEligibility(ruleId);
    if (!eligibility.allowed)
        throw new Error(eligibility.reason);
    const reason = normalizeReason(input.reason);
    const now = input.now ?? new Date();
    const expiresAt = normalizeDate(input.expiresAt, "到期时间");
    if (expiresAt && new Date(expiresAt).getTime() <= now.getTime()) {
        throw new Error("到期时间必须晚于当前时间。");
    }
    const source = readDocument(input.cwd);
    const entries = readEntries(source.document);
    const existing = entries.find((entry) => entry.ruleId === ruleId && entry.agent === agent);
    if (existing && statusOf(existing, now) === "active") {
        throw new Error(`${agent}/${ruleId} 已存在有效的项目忽略。`);
    }
    const nextEntries = entries.filter((entry) => entry.ruleId !== ruleId || entry.agent !== agent);
    const createdAt = now.toISOString();
    const entry = {
        ruleId,
        agent,
        reason,
        createdAt,
        ...(expiresAt ? { expiresAt } : {}),
    };
    const audit = readAudit(source.document);
    writeState(source, [...nextEntries, entry], [
        ...audit,
        { action: "add", ruleId, agent, reason, at: createdAt, ...(expiresAt ? { expiresAt } : {}) },
    ]);
    return listRuleIgnores(input.cwd, now);
}
export function removeRuleIgnore(input) {
    const ruleId = parseRuleId(input.ruleId);
    const agent = parseAgent(input.agent);
    const reason = normalizeReason(input.reason);
    const now = input.now ?? new Date();
    const source = readDocument(input.cwd);
    const entries = readEntries(source.document);
    if (!entries.some((entry) => entry.ruleId === ruleId && entry.agent === agent)) {
        throw new Error(`未找到 ${agent}/${ruleId} 的项目忽略。`);
    }
    const at = now.toISOString();
    const audit = readAudit(source.document);
    writeState(source, entries.filter((entry) => entry.ruleId !== ruleId || entry.agent !== agent), [...audit, { action: "remove", ruleId, agent, reason, at }]);
    return listRuleIgnores(input.cwd, now);
}
//# sourceMappingURL=rule-ignore.js.map