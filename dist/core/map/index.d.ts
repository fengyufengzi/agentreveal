/**
 * 配置地图：从 scan 结果派生"每个 Agent 连接了谁、风险在哪里"的紧凑视图（PRD §5.2 / §7.x）。
 * 关键：展开 Agent → CC Switch 代理 → 真实上游的两跳链路（PRD §6.3 修订）。
 * 不接触原始密钥——仅消费已脱敏的 findings。
 */
import type { AgentId, RiskLevel } from "../../adapters/types.js";
import type { ScanReport } from "../scan/index.js";
/** 地图里的风险标签：configured 但无 finding 记为 "ok"，未配置为 "n/a"。 */
export type MapRisk = RiskLevel | "ok" | "n/a";
/** 一个 Agent 的地图行。 */
export interface MapRow {
    agent: AgentId;
    displayName: string;
    configured: boolean;
    source?: string;
    /** 该 Agent 连接/涉及的端点摘要（去 scheme、去重），来自 provider 类 findings。 */
    endpoints: string[];
    mcpCount: number;
    secretCount: number;
    sensitiveCount: number;
    permissionCount: number;
    findingCount: number;
    risk: MapRisk;
}
/** 一条代理链路（两跳）。 */
export interface ProxyHop {
    /** 归属 Agent（如 claude / codex）。 */
    via: string;
    /** 供 UI 展示的 Agent 名称。 */
    agentLabel?: string;
    /** 本地代理监听地址。 */
    proxy: string;
    /** 真实上游（可能是 URL 或 Provider 名）。 */
    upstream: string;
    /** 本地代理所有者，如 CC Switch。 */
    owner?: string;
    /** Agent live 配置里的鉴权模式说明，不含真实凭证。 */
    authMode?: string;
}
export interface ConfigMap {
    rows: MapRow[];
    proxyChains: ProxyHop[];
}
/** 由 scan 报告构建配置地图。 */
export declare function buildMap(report: ScanReport): ConfigMap;
