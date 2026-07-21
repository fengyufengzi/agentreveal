/**
 * 配置地图：从 scan 结果派生"每个 Agent 连接了谁、风险在哪里"的紧凑视图（PRD §5.2 / §7.x）。
 * 关键：展开 Agent → CC Switch 代理 → 真实上游的两跳链路（PRD §6.3 修订）。
 * 不接触原始密钥——仅消费已脱敏的 findings。
 */
import type { AgentId, RiskLevel } from "../../adapters/types.js";
import type { AgentScanResult, ScanReport } from "../scan/index.js";

const SEVERITY_RANK: Record<RiskLevel, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

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

/** 去掉 scheme，便于紧凑展示；非 URL 原样返回。 */
function stripScheme(v: string): string {
  return v.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/** 从一个 Agent 的 provider 类 findings 收集端点摘要。 */
function collectEndpoints(r: AgentScanResult): string[] {
  const set = new Set<string>();
  for (const f of r.findings) {
    if (f.category !== "provider" || !f.evidence) continue;
    const ev = f.evidence;
    for (const cand of [ev.baseUrl, ev.realUpstream, ev.proxyUrl, ev.proxy]) {
      if (typeof cand === "string" && cand.length > 0) set.add(stripScheme(cand));
    }
  }
  return [...set];
}

/** 取该 Agent findings 的最高严重度。 */
function maxRisk(r: AgentScanResult): MapRisk {
  if (!r.discovery.configFound) return "n/a";
  if (r.findings.length === 0) return "ok";
  let top: RiskLevel = "info";
  for (const f of r.findings) {
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[top]) top = f.severity;
  }
  return top;
}

function toRow(r: AgentScanResult): MapRow {
  const count = (cat: string) =>
    r.findings.filter((f) => f.category === cat).length;
  return {
    agent: r.agent,
    displayName: r.displayName,
    configured: r.discovery.configFound,
    source: r.discovery.source,
    endpoints: collectEndpoints(r),
    mcpCount: count("mcp"),
    secretCount: count("secret"),
    sensitiveCount: count("sensitive"),
    permissionCount: count("permission"),
    findingCount: r.findings.length,
    risk: maxRisk(r),
  };
}

/** 从所有 findings 中提取代理两跳链路（携带 realUpstream 的 provider finding）。 */
function collectProxyChains(report: ScanReport): ProxyHop[] {
  const hops: ProxyHop[] = [];
  for (const r of report.results) {
    for (const f of r.findings) {
      const ev = f.evidence;
      if (!ev) continue;
      const upstream = ev.realUpstream;
      const proxy = ev.proxy;
      if (typeof upstream === "string" && typeof proxy === "string") {
        const owner = ev.proxyOwner;
        const authMode = ev.authMode;
        const agentLabel = ev.appLabel;
        hops.push({
          via: String(ev.appType ?? r.agent),
          proxy,
          upstream,
          ...(typeof agentLabel === "string" ? { agentLabel } : {}),
          ...(typeof owner === "string" ? { owner } : {}),
          ...(typeof authMode === "string" ? { authMode } : {}),
        });
      }
    }
  }
  return hops;
}

/** 由 scan 报告构建配置地图。 */
export function buildMap(report: ScanReport): ConfigMap {
  return {
    rows: report.results.map(toRow),
    proxyChains: collectProxyChains(report),
  };
}
