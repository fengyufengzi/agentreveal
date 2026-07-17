/**
 * CC Switch 风险规则（PRD §6.3 + D1 修订）。
 * 输入归一化数据，产出 RiskFinding[]。
 * 所有 evidence 均脱敏：只含 base_url / 指纹 / 计数，绝不含明文密钥。
 */
import type { RiskFinding } from "../types.js";
import { type ProviderTrustPolicy } from "../../rules/provider.js";
import type { CcSwitchData } from "./parse.js";
export declare function buildCcSwitchFindings(data: CcSwitchData, providerPolicy?: ProviderTrustPolicy): RiskFinding[];
