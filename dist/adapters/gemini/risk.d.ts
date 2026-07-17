/**
 * Gemini CLI 风险规则。
 * 输入归一化数据，产出 RiskFinding[]。
 * evidence 均脱敏：只含 endpoint / 键名 / server 名 / authType，绝不含密钥值。
 */
import type { RiskFinding } from "../types.js";
import { type ProviderTrustPolicy } from "../../rules/provider.js";
import { type GeminiData } from "./parse.js";
export declare function buildGeminiFindings(data: GeminiData, providerPolicy?: ProviderTrustPolicy): RiskFinding[];
