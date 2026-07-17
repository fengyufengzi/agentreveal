/**
 * OpenCode 风险规则。
 * 输入归一化数据，产出 RiskFinding[]。
 * evidence 均脱敏：只含 baseURL / 命令 / env 键名 / 权限取值，绝不含 apiKey 值。
 */
import type { RiskFinding } from "../types.js";
import { type ProviderTrustPolicy } from "../../rules/provider.js";
import { type OcData } from "./parse.js";
export declare function buildOpenCodeFindings(data: OcData, providerPolicy?: ProviderTrustPolicy): RiskFinding[];
