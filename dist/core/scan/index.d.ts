/**
 * scan 编排：先 discovery，再对实现了 deepScan 的 adapter 做深度解析，汇总 RiskFinding。
 * 单个 adapter 抛错不影响其他，保证整体扫描鲁棒。
 */
import type { AgentDiscovery, AgentId, DiscoveryContext, RiskFinding } from "../../adapters/types.js";
/** 单个 Agent 的扫描结果：发现信息 + 该 Agent 的风险列表。 */
export interface AgentScanResult {
    agent: AgentId;
    displayName: string;
    discovery: AgentDiscovery;
    findings: RiskFinding[];
}
export interface ScanReport {
    results: AgentScanResult[];
    /** 全部 Agent 的风险扁平汇总，便于统计与排序。 */
    allFindings: RiskFinding[];
    /** 跨 Agent 派生的集中点风险（共用代理 / 未知上游）。 */
    correlations: RiskFinding[];
}
/**
 * 运行全部 adapter：discover → deepScan。
 * 未实现 deepScan 或未发现配置的 adapter 产出空风险列表。
 */
export declare function scanAll(ctx?: DiscoveryContext): Promise<ScanReport>;
