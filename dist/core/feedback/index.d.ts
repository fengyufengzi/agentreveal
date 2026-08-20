/**
 * 高价值规则最小反馈契约。
 *
 * 该契约故意不接受自由文本、taskId、时间、路径、端点或配置证据，避免把
 * 完整报告或本机身份信息包装成“反馈”持久化或提交。
 */
import { type RuleId } from "../../rules/ids.js";
export declare const RULE_FEEDBACK_SCHEMA_VERSION: 1;
export declare const RULE_FEEDBACK_JUDGMENTS: readonly ["expected", "false-positive", "unclear"];
export declare const RULE_FEEDBACK_OUTCOMES: readonly ["not-attempted", "resolved", "mitigated", "still-present", "accepted", "ignored", "abandoned"];
export type RuleFeedbackJudgment = (typeof RULE_FEEDBACK_JUDGMENTS)[number];
export type RuleFeedbackOutcome = (typeof RULE_FEEDBACK_OUTCOMES)[number];
export interface RuleFeedbackV1 {
    schemaVersion: typeof RULE_FEEDBACK_SCHEMA_VERSION;
    command: "feedback";
    productVersion: string;
    ruleId: RuleId;
    judgment: RuleFeedbackJudgment;
    actionOutcome: RuleFeedbackOutcome;
}
/** 严格验证收到的反馈；任何额外字段都拒绝，避免隐私范围悄悄扩大。 */
export declare function validateRuleFeedback(value: unknown): RuleFeedbackV1;
export declare function buildRuleFeedback(input: {
    productVersion: string;
    ruleId: string;
    judgment: string;
    actionOutcome: string;
}): RuleFeedbackV1;
