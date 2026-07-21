import { type ActionItem, type ActionTask, type EnrichedFinding } from "../action/index.js";
import type { ListedAcceptance } from "../acceptance/index.js";
import type { ListedRuleIgnore } from "../config/rule-ignore.js";
import type { ScanReport } from "../scan/index.js";
export interface IgnoredFinding {
    agent: NonNullable<ActionItem["agent"]>;
    displayName: string;
    finding: EnrichedFinding;
    policy: ListedRuleIgnore;
}
export interface RuleIgnoredReport {
    report: ScanReport;
    ignoredFindings: IgnoredFinding[];
    activeRuleIgnores: ListedRuleIgnore[];
}
export interface TriagedReport {
    /** 默认命令使用的活动结果；已接受任务不再计数、展示或影响退出码。 */
    activeReport: ScanReport;
    /** 仍保留完整任务，供 HTML 审计区展示。 */
    acceptedTasks: ActionTask[];
    activeAcceptances: ListedAcceptance[];
    /** 被项目级规则策略隐藏的原始发现，供审计区展示和撤销后恢复。 */
    ignoredFindings: IgnoredFinding[];
    activeRuleIgnores: ListedRuleIgnore[];
}
export declare function applyAcceptances(report: ScanReport, records: readonly ListedAcceptance[], ruleIgnores?: readonly ListedRuleIgnore[]): TriagedReport;
/** 只应用项目级规则策略，供 HTML 在保留完整技术证据时复用。 */
export declare function applyRuleIgnores(report: ScanReport, ruleIgnores?: readonly ListedRuleIgnore[]): RuleIgnoredReport;
