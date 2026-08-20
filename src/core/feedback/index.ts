/**
 * 高价值规则最小反馈契约。
 *
 * 该契约故意不接受自由文本、taskId、时间、路径、端点或配置证据，避免把
 * 完整报告或本机身份信息包装成“反馈”持久化或提交。
 */
import { RULE_IDS, type RuleId } from "../../rules/ids.js";

export const RULE_FEEDBACK_SCHEMA_VERSION = 1 as const;

export const RULE_FEEDBACK_JUDGMENTS = [
  "expected",
  "false-positive",
  "unclear",
] as const;

export const RULE_FEEDBACK_OUTCOMES = [
  "not-attempted",
  "resolved",
  "mitigated",
  "still-present",
  "accepted",
  "ignored",
  "abandoned",
] as const;

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

const ALLOWED_KEYS = new Set([
  "schemaVersion",
  "command",
  "productVersion",
  "ruleId",
  "judgment",
  "actionOutcome",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRuleId(value: unknown): value is RuleId {
  return typeof value === "string" && (RULE_IDS as readonly string[]).includes(value);
}

function isJudgment(value: unknown): value is RuleFeedbackJudgment {
  return (
    typeof value === "string" &&
    (RULE_FEEDBACK_JUDGMENTS as readonly string[]).includes(value)
  );
}

function isOutcome(value: unknown): value is RuleFeedbackOutcome {
  return (
    typeof value === "string" &&
    (RULE_FEEDBACK_OUTCOMES as readonly string[]).includes(value)
  );
}

function isProductVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 64 &&
    /^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(value)
  );
}

/** 严格验证收到的反馈；任何额外字段都拒绝，避免隐私范围悄悄扩大。 */
export function validateRuleFeedback(value: unknown): RuleFeedbackV1 {
  if (!isRecord(value)) throw new Error("规则反馈必须是 JSON 对象。");
  const unexpected = Object.keys(value).filter((key) => !ALLOWED_KEYS.has(key));
  if (unexpected.length > 0) {
    throw new Error(`规则反馈包含不允许的字段：${unexpected.sort().join(", ")}`);
  }
  if (value.schemaVersion !== RULE_FEEDBACK_SCHEMA_VERSION) {
    throw new Error(`规则反馈 schemaVersion 必须是 ${RULE_FEEDBACK_SCHEMA_VERSION}。`);
  }
  if (value.command !== "feedback") {
    throw new Error('规则反馈 command 必须是 "feedback"。');
  }
  if (!isProductVersion(value.productVersion)) {
    throw new Error("productVersion 不是安全的版本标识。");
  }
  if (!isRuleId(value.ruleId)) throw new Error("ruleId 不在当前规则矩阵中。");
  if (!isJudgment(value.judgment)) {
    throw new Error(`judgment 必须是：${RULE_FEEDBACK_JUDGMENTS.join(" | ")}。`);
  }
  if (!isOutcome(value.actionOutcome)) {
    throw new Error(`actionOutcome 必须是：${RULE_FEEDBACK_OUTCOMES.join(" | ")}。`);
  }
  return {
    schemaVersion: RULE_FEEDBACK_SCHEMA_VERSION,
    command: "feedback",
    productVersion: value.productVersion,
    ruleId: value.ruleId,
    judgment: value.judgment,
    actionOutcome: value.actionOutcome,
  };
}

export function buildRuleFeedback(input: {
  productVersion: string;
  ruleId: string;
  judgment: string;
  actionOutcome: string;
}): RuleFeedbackV1 {
  return validateRuleFeedback({
    schemaVersion: RULE_FEEDBACK_SCHEMA_VERSION,
    command: "feedback",
    ...input,
  });
}
