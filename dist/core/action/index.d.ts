import type { ActionPriority, AgentId, FindingAction, FindingConfidence, FindingDisposition, FindingFixMode, RiskFinding, RiskLevel } from "../../adapters/types.js";
import type { ScanReport } from "../scan/index.js";
export type EnrichedFinding = RiskFinding & {
    action: FindingAction;
};
export interface ActionItem {
    /** 普通 Agent finding 或跨 Agent 关联 finding。 */
    source: "agent" | "correlation";
    /** correlation 没有单一 Agent 归属。 */
    agent?: AgentId;
    displayName: string;
    finding: EnrichedFinding;
    action: FindingAction;
}
export interface ActionSummary {
    total: number;
    /** fix/review/cleanup 的总数；observe 不计入待处理。 */
    needsAttention: number;
    /** P0/P1 且非 observe 的总数。 */
    immediate: number;
    byDisposition: Record<FindingDisposition, number>;
    byPriority: Record<ActionPriority, number>;
}
export interface ActionPlan {
    /** 按 P0 → P3 稳定排序，优先级相同则保留扫描顺序。 */
    items: ActionItem[];
    summary: ActionSummary;
}
/** 同一 Agent/来源下、共享根因身份的一组原始行动项。 */
export interface ActionTask {
    /** 由规范化根因身份计算的稳定 ID，不包含原始敏感证据。 */
    taskId: string;
    source: ActionItem["source"];
    agent?: AgentId;
    displayName: string;
    family: string;
    /** 组内最高行动优先级。 */
    priority: ActionPriority;
    /** 组内最高潜在影响。 */
    severity: RiskLevel;
    /** fix > review > cleanup > observe。 */
    disposition: FindingDisposition;
    /** 决定主文案的代表项：先 disposition，再 priority、severity、原始顺序。 */
    primary: ActionItem;
    /** 保留所有原始项，供证据、步骤与规则详情继续展示。 */
    items: ActionItem[];
    /** 按规则去重的完整处置要求；报告、接受和验证不得只读取 primary。 */
    requirements: ActionTaskRequirement[];
}
export interface ActionTaskRequirement {
    ruleId: string;
    priority: ActionPriority;
    severity: RiskLevel;
    disposition: FindingDisposition;
    confidence: FindingConfidence;
    fixMode: FindingFixMode;
    rationale: string;
    nextSteps: string[];
    verification: string[];
    acceptWhen?: string;
    baselineProfiles?: FindingAction["baselineProfiles"];
}
/**
 * 附加统一行动元数据，并从 fixMode 推导旧版 fixable 字段。
 * baseline 是目前唯一可由 AgentReveal apply 执行的修复方式。
 */
export declare function enrichFinding(finding: RiskFinding): EnrichedFinding;
/**
 * 从完整扫描报告建立行动队列。allFindings 是 results 的扁平副本，因此只遍历
 * results 和 correlations，避免重复，同时保留每条 finding 的 Agent 归属。
 */
export declare function buildActionPlan(report: ScanReport): ActionPlan;
/**
 * 计算单个行动项所属的稳定任务 ID。
 * 风险接受、CLI 过滤与 HTML 报告必须共用这里的身份算法，避免各自拼接导致漂移。
 */
export declare function actionTaskId(item: ActionItem): string;
export declare function taskMissingAcceptanceRules(task: ActionTask): string[];
/**
 * 将行动项按根因聚合成稳定任务。既可直接接收 buildActionPlan 的结果，
 * 也可接收 ActionItem[]，便于报告层按需组合。
 */
export declare function buildActionTasks(plan: ActionPlan): ActionTask[];
export declare function buildActionTasks(items: readonly ActionItem[]): ActionTask[];
