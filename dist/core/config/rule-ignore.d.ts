import type { AgentId } from "../../adapters/types.js";
import { type RuleId } from "../../rules/ids.js";
import type { ActionTask } from "../action/index.js";
export interface RuleIgnoreEntry {
    ruleId: RuleId;
    agent: AgentId;
    reason: string;
    createdAt: string;
    expiresAt?: string;
}
export interface ListedRuleIgnore extends RuleIgnoreEntry {
    status: "active" | "expired";
}
export interface RuleIgnoreEvent {
    action: "add" | "remove";
    ruleId: RuleId;
    agent: AgentId;
    reason: string;
    at: string;
    expiresAt?: string;
}
export interface RuleIgnoreState {
    configPath: string;
    entries: ListedRuleIgnore[];
    audit: RuleIgnoreEvent[];
}
export interface RuleIgnoreCandidate {
    ruleId: RuleId;
    agent: AgentId;
}
/** 只有低优先级、非 fix、非高风险家族规则可以成为项目级忽略。 */
export declare function ruleIgnoreEligibility(ruleId: string): {
    allowed: boolean;
    reason?: string;
};
export declare function ruleIgnoreCandidatesForTask(task: ActionTask): RuleIgnoreCandidate[];
export declare function listRuleIgnores(cwd: string, now?: Date): RuleIgnoreState;
export declare function activeRuleIgnores(cwd: string, now?: Date): ListedRuleIgnore[];
/**
 * 扫描主流程中的项目策略读取必须 fail closed：配置损坏时不应用任何忽略，
 * 由 scan/config warning 告知用户；管理命令仍使用 listRuleIgnores 暴露错误。
 */
export declare function activeRuleIgnoresSafely(cwd: string, now?: Date): ListedRuleIgnore[];
export declare function addRuleIgnore(input: {
    cwd: string;
    ruleId: string;
    agent: string;
    reason: string;
    expiresAt?: string;
    now?: Date;
}): RuleIgnoreState;
export declare function removeRuleIgnore(input: {
    cwd: string;
    ruleId: string;
    agent: string;
    reason: string;
    now?: Date;
}): RuleIgnoreState;
