/**
 * Claude Code 风险规则。
 * 输入归一化数据，产出 RiskFinding[]。
 * evidence 均脱敏：只含 base_url / 规则字符串 / env 键名 / 计数，绝不含 token 值。
 */
import type { RiskFinding } from "../types.js";
import { type ProviderTrustPolicy } from "../../rules/provider.js";
import { type ClaudeData } from "./parse.js";
/** 危险的 permissions.allow 模式：无约束 Bash / 通配。 */
export declare function isDangerousAllow(rule: string): boolean;
export declare function buildClaudeCodeFindings(data: ClaudeData, providerPolicy?: ProviderTrustPolicy): RiskFinding[];
