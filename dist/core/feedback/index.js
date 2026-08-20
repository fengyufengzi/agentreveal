/**
 * 高价值规则最小反馈契约。
 *
 * 该契约故意不接受自由文本、taskId、时间、路径、端点或配置证据，避免把
 * 完整报告或本机身份信息包装成“反馈”持久化或提交。
 */
import { RULE_IDS } from "../../rules/ids.js";
export const RULE_FEEDBACK_SCHEMA_VERSION = 1;
export const RULE_FEEDBACK_JUDGMENTS = [
    "expected",
    "false-positive",
    "unclear",
];
export const RULE_FEEDBACK_OUTCOMES = [
    "not-attempted",
    "resolved",
    "mitigated",
    "still-present",
    "accepted",
    "ignored",
    "abandoned",
];
const ALLOWED_KEYS = new Set([
    "schemaVersion",
    "command",
    "productVersion",
    "ruleId",
    "judgment",
    "actionOutcome",
]);
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isRuleId(value) {
    return typeof value === "string" && RULE_IDS.includes(value);
}
function isJudgment(value) {
    return (typeof value === "string" &&
        RULE_FEEDBACK_JUDGMENTS.includes(value));
}
function isOutcome(value) {
    return (typeof value === "string" &&
        RULE_FEEDBACK_OUTCOMES.includes(value));
}
function isProductVersion(value) {
    return (typeof value === "string" &&
        value.length >= 1 &&
        value.length <= 64 &&
        /^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(value));
}
/** 严格验证收到的反馈；任何额外字段都拒绝，避免隐私范围悄悄扩大。 */
export function validateRuleFeedback(value) {
    if (!isRecord(value))
        throw new Error("规则反馈必须是 JSON 对象。");
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
    if (!isRuleId(value.ruleId))
        throw new Error("ruleId 不在当前规则矩阵中。");
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
export function buildRuleFeedback(input) {
    return validateRuleFeedback({
        schemaVersion: RULE_FEEDBACK_SCHEMA_VERSION,
        command: "feedback",
        ...input,
    });
}
//# sourceMappingURL=index.js.map