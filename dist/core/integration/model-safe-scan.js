import { RULE_IDS } from "../../rules/ids.js";
import { buildActionPlan, buildActionTasks } from "../action/index.js";
import { withOutputContract } from "../output-contract.js";
export const MODEL_SAFE_TOP_RISK_LIMIT = 3;
export const MODEL_SAFE_CATEGORY_MESSAGES = {
    authentication: "检测到需要人工确认的认证来源风险。",
    configuration: "检测到需要人工确认的配置完整性风险。",
    correlation: "检测到跨 Agent 的集中或复用风险。",
    mcp: "检测到需要人工确认的 MCP 配置或权限风险。",
    permission: "检测到需要人工确认的执行或访问权限风险。",
    privacy: "检测到需要人工确认的数据暴露风险。",
    provider: "检测到需要人工确认的 Provider 或路由信任风险。",
    secret: "检测到需要人工处理的凭据存放或复用风险。",
    "supply-chain": "检测到需要人工确认的扩展或供应链风险。",
    workspace: "检测到项目工作区中的敏感文件风险。",
    other: "检测到需要人工复核的 Agent 配置风险。",
};
const KNOWN_RULE_IDS = new Set(RULE_IDS);
const MODEL_SAFE_RULE_IDS = new Set([
    ...RULE_IDS,
    "DEEPSCAN_FAILED",
    "UNMAPPED_RULE",
]);
const MODEL_SAFE_AGENTS = new Set([
    "claude-code",
    "codex",
    "cc-switch",
    "opencode",
    "gemini",
    "openclaw",
    "workspace",
    "cross-agent",
]);
const MODEL_SAFE_PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const MODEL_SAFE_SEVERITIES = new Set([
    "critical",
    "high",
    "medium",
    "low",
    "info",
]);
const MODEL_SAFE_DISPOSITIONS = new Set([
    "fix",
    "review",
    "cleanup",
]);
const MODEL_SAFE_CATEGORIES = new Set(Object.keys(MODEL_SAFE_CATEGORY_MESSAGES));
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function hasExactKeys(value, keys) {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return (actual.length === expected.length &&
        actual.every((key, index) => key === expected[index]));
}
function isCount(value) {
    return Number.isSafeInteger(value) && value >= 0;
}
function assertContract(condition, detail) {
    if (!condition)
        throw new Error(`模型安全扫描输出无效：${detail}。`);
}
/**
 * 在 Harness 边界重新验证完整 allowlist。任何 additive 字段也会拒绝，必须由
 * 新契约版本显式评审后才能进入模型相邻上下文。
 */
export function validateModelSafeScan(value) {
    assertContract(isRecord(value), "顶层必须是对象");
    assertContract(hasExactKeys(value, ["schemaVersion", "command", "privacy", "summary", "topRisks"]), "顶层字段不在 allowlist");
    assertContract(value.schemaVersion === 1, "schemaVersion 不受支持");
    assertContract(value.command === "integration.scan", "command 不受支持");
    const privacy = value.privacy;
    assertContract(isRecord(privacy), "privacy 必须是对象");
    const privacyKeys = [
        "localOnly",
        "uploadsData",
        "readOnlyScan",
        "excludesAbsolutePaths",
        "excludesEndpoints",
        "excludesEvidence",
        "excludesTaskIds",
        "excludesCommands",
        "excludesUserText",
    ];
    assertContract(hasExactKeys(privacy, privacyKeys), "privacy 字段不在 allowlist");
    for (const key of privacyKeys) {
        const expected = key === "uploadsData" ? false : true;
        assertContract(privacy[key] === expected, `privacy.${key} 声明不正确`);
    }
    const summary = value.summary;
    assertContract(isRecord(summary), "summary 必须是对象");
    const summaryKeys = [
        "configuredAgents",
        "findingCount",
        "actionableTaskCount",
        "immediateTaskCount",
        "informationalTaskCount",
        "acceptedTaskCount",
        "ignoredFindingCount",
        "omittedActionableTaskCount",
    ];
    assertContract(hasExactKeys(summary, summaryKeys), "summary 字段不在 allowlist");
    for (const key of summaryKeys) {
        assertContract(isCount(summary[key]), `summary.${key} 必须是非负安全整数`);
    }
    assertContract(summary.immediateTaskCount <= summary.actionableTaskCount, "立即任务数大于行动任务数");
    assertContract(summary.omittedActionableTaskCount ===
        Math.max(0, summary.actionableTaskCount - MODEL_SAFE_TOP_RISK_LIMIT), "省略任务数与行动任务数不一致");
    const topRisks = value.topRisks;
    assertContract(Array.isArray(topRisks), "topRisks 必须是数组");
    assertContract(topRisks.length ===
        Math.min(summary.actionableTaskCount, MODEL_SAFE_TOP_RISK_LIMIT), "Top 3 数量与行动任务数不一致");
    for (const [index, risk] of topRisks.entries()) {
        assertContract(isRecord(risk), `topRisks[${index}] 必须是对象`);
        assertContract(hasExactKeys(risk, [
            "source",
            "agent",
            "category",
            "ruleIds",
            "priority",
            "severity",
            "disposition",
            "message",
            "requiresHumanAction",
            "verificationRequired",
        ]), `topRisks[${index}] 字段不在 allowlist`);
        assertContract(risk.source === "agent" || risk.source === "correlation", `topRisks[${index}].source 不受支持`);
        assertContract(typeof risk.agent === "string" && MODEL_SAFE_AGENTS.has(risk.agent), `topRisks[${index}].agent 不受支持`);
        assertContract((risk.source === "correlation") === (risk.agent === "cross-agent"), `topRisks[${index}] 来源与 Agent 不一致`);
        assertContract(typeof risk.category === "string" && MODEL_SAFE_CATEGORIES.has(risk.category), `topRisks[${index}].category 不受支持`);
        assertContract(risk.message ===
            MODEL_SAFE_CATEGORY_MESSAGES[risk.category], `topRisks[${index}].message 不是固定文案`);
        assertContract(Array.isArray(risk.ruleIds) && risk.ruleIds.length > 0, `topRisks[${index}].ruleIds 必须是非空数组`);
        assertContract(risk.ruleIds.every((ruleId) => typeof ruleId === "string" && MODEL_SAFE_RULE_IDS.has(ruleId)), `topRisks[${index}].ruleIds 含未知规则`);
        assertContract(new Set(risk.ruleIds).size === risk.ruleIds.length, `topRisks[${index}].ruleIds 含重复项`);
        assertContract(typeof risk.priority === "string" && MODEL_SAFE_PRIORITIES.has(risk.priority), `topRisks[${index}].priority 不受支持`);
        assertContract(typeof risk.severity === "string" && MODEL_SAFE_SEVERITIES.has(risk.severity), `topRisks[${index}].severity 不受支持`);
        assertContract(typeof risk.disposition === "string" &&
            MODEL_SAFE_DISPOSITIONS.has(risk.disposition), `topRisks[${index}].disposition 不受支持`);
        assertContract(risk.requiresHumanAction === true && risk.verificationRequired === true, `topRisks[${index}] 人工处置声明不正确`);
    }
    return value;
}
function normalizeRuleId(ruleId) {
    if (ruleId === "DEEPSCAN_FAILED")
        return ruleId;
    return KNOWN_RULE_IDS.has(ruleId) ? ruleId : "UNMAPPED_RULE";
}
function normalizeCategory(category) {
    switch (category) {
        case "authentication":
            return "authentication";
        case "compat":
        case "config":
            return "configuration";
        case "correlation":
            return "correlation";
        case "mcp":
            return "mcp";
        case "permission":
            return "permission";
        case "privacy":
            return "privacy";
        case "provider":
        case "provider-route":
            return "provider";
        case "secret":
            return "secret";
        case "supply-chain":
            return "supply-chain";
        case "sensitive":
        case "workspace":
            return "workspace";
        default:
            return "other";
    }
}
function isImmediate(priority) {
    return priority === "P0" || priority === "P1";
}
/**
 * 从已完成 acceptance / ignore 过滤的活动报告建立模型安全摘要。
 * 调用方必须传入活动报告；本函数不读取或写入任何本机状态。
 */
export function buildModelSafeScan(report, options = {}) {
    const tasks = buildActionTasks(buildActionPlan(report));
    const actionable = tasks.filter((task) => task.disposition !== "observe");
    const informational = tasks.filter((task) => task.disposition === "observe");
    const topRisks = actionable
        .slice(0, MODEL_SAFE_TOP_RISK_LIMIT)
        .map((task) => {
        const category = normalizeCategory(task.primary.finding.category);
        return {
            source: task.source,
            agent: task.agent ?? "cross-agent",
            category,
            ruleIds: [
                ...new Set(task.requirements.map((requirement) => normalizeRuleId(requirement.ruleId))),
            ],
            priority: task.priority,
            severity: task.severity,
            disposition: task.disposition,
            message: MODEL_SAFE_CATEGORY_MESSAGES[category],
            requiresHumanAction: true,
            verificationRequired: true,
        };
    });
    return validateModelSafeScan(withOutputContract("integration.scan", {
        privacy: {
            localOnly: true,
            uploadsData: false,
            readOnlyScan: true,
            excludesAbsolutePaths: true,
            excludesEndpoints: true,
            excludesEvidence: true,
            excludesTaskIds: true,
            excludesCommands: true,
            excludesUserText: true,
        },
        summary: {
            configuredAgents: report.results.filter((result) => result.agent !== "workspace" && result.discovery.configFound).length,
            findingCount: report.allFindings.length + (report.correlations?.length ?? 0),
            actionableTaskCount: actionable.length,
            immediateTaskCount: actionable.filter((task) => isImmediate(task.priority))
                .length,
            informationalTaskCount: informational.length,
            acceptedTaskCount: options.acceptedTaskCount ?? 0,
            ignoredFindingCount: options.ignoredFindingCount ?? 0,
            omittedActionableTaskCount: Math.max(0, actionable.length - MODEL_SAFE_TOP_RISK_LIMIT),
        },
        topRisks,
    }));
}
//# sourceMappingURL=model-safe-scan.js.map