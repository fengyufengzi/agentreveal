/**
 * Codex 风险规则。
 * 输入归一化数据，产出 RiskFinding[]。
 * evidence 均脱敏：只含 base_url / 命令 / 路径 / env 键名 / 计数，绝不含 token 值。
 */
import type { RiskFinding } from "../types.js";
import { type ProviderTrustPolicy } from "../../rules/provider.js";
import { type CodexData } from "./parse.js";
export declare function buildCodexFindings(data: CodexData, providerPolicy?: ProviderTrustPolicy): RiskFinding[];
