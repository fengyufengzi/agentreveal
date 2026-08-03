import { getRuleAction } from "../../rules/action-matrix.js";
import { RULE_IDS } from "../../rules/ids.js";
import { AcceptanceStore, } from "../acceptance/index.js";
import { listRuleIgnores } from "../config/rule-ignore.js";
const KNOWN_RULE_IDS = new Set(RULE_IDS);
const KNOWN_AGENTS = new Set([
    "claude-code",
    "codex",
    "cc-switch",
    "opencode",
    "gemini",
    "openclaw",
    "workspace",
]);
function acceptanceAgent(record) {
    const agent = record.task.agent;
    return agent && KNOWN_AGENTS.has(agent) ? agent : "workspace";
}
function knownRuleIds(values) {
    return [...new Set(values.filter((value) => KNOWN_RULE_IDS.has(value)))].sort();
}
function acceptancePolicies(cwd, path, now) {
    const records = new AcceptanceStore({
        cwd,
        now: () => now,
        ...(path ? { path } : {}),
    }).list();
    const latestByTask = new Map();
    for (const record of records) {
        if (!latestByTask.has(record.taskId))
            latestByTask.set(record.taskId, record);
    }
    return [...latestByTask.values()].flatMap((record) => {
        if (record.status !== "active" && record.status !== "expired")
            return [];
        const ruleIds = knownRuleIds(record.task.ruleIds);
        if (ruleIds.length === 0)
            return [];
        return [{
                kind: "acceptance",
                agentId: acceptanceAgent(record),
                subject: record.taskId,
                status: record.status,
                ruleIds,
                priority: record.task.priority,
                severity: record.task.severity,
            }];
    });
}
function ignorePolicies(cwd, now) {
    return listRuleIgnores(cwd, now).entries.map((entry) => {
        const action = getRuleAction(entry.ruleId);
        return {
            kind: "ignore",
            agentId: entry.agent,
            subject: `${entry.agent}:${entry.ruleId}`,
            status: entry.status,
            ruleIds: [entry.ruleId],
            priority: action?.priority ?? "P3",
            severity: action?.priority === "P2" ? "medium" : "low",
        };
    });
}
/**
 * 策略文件异常不能掩盖有效配置扫描；对应配置读取流程会单独报告解析问题。
 */
export function loadDriftPolicyStates(cwd, options = {}) {
    const now = options.now ?? new Date();
    const output = [];
    try {
        output.push(...acceptancePolicies(cwd, options.acceptancePath, now));
    }
    catch {
        // fail closed：不把无法验证的接受记录写入可信状态。
    }
    try {
        output.push(...ignorePolicies(cwd, now));
    }
    catch {
        // fail closed：不把无法验证的忽略策略写入可信状态。
    }
    return output.sort((left, right) => left.kind.localeCompare(right.kind) ||
        left.agentId.localeCompare(right.agentId) ||
        left.subject.localeCompare(right.subject));
}
//# sourceMappingURL=policy.js.map