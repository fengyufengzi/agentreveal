/**
 * 跨 Agent 关联分析：从各 Agent 已脱敏的 findings 中派生"集中点"风险。
 * 单个 Agent 的 finding 看不出关系型威胁——多个 Agent 共用同一本地代理 / 未知上游，
 * 才是真正的单点失陷面（PRD §5.2 跨 Agent 视图 / §6.3 代理链路修订）。
 *
 * 只读既有 findings，不接触原始文件与密钥；产出的 evidence 仅含端点/计数/Agent 名。
 */
import type { RiskFinding } from "../../adapters/types.js";
import { type ProviderTrustPolicy } from "../../rules/provider.js";
import type { AgentScanResult } from "../scan/index.js";
/**
 * 从各 Agent 的 findings 聚合跨 Agent 集中风险。
 * @returns category 为 "correlation" 的 RiskFinding[]（无集中点时为空）。
 */
export declare function correlate(results: AgentScanResult[], providerPolicy?: ProviderTrustPolicy): RiskFinding[];
