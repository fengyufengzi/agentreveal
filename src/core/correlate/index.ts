/**
 * 跨 Agent 关联分析：从各 Agent 已脱敏的 findings 中派生"集中点"风险。
 * 单个 Agent 的 finding 看不出关系型威胁——多个 Agent 共用同一本地代理 / 未知上游，
 * 才是真正的单点失陷面（PRD §5.2 跨 Agent 视图 / §6.3 代理链路修订）。
 *
 * 只读既有 findings，不接触原始文件与密钥；产出的 evidence 仅含端点/计数/Agent 名。
 */
import type { RiskFinding } from "../../adapters/types.js";
import { classifyBaseUrl, type ProviderTrustPolicy } from "../../rules/provider.js";
import type { AgentScanResult } from "../scan/index.js";

/** 去掉 scheme 与尾斜杠，便于按端点归并。 */
function stripScheme(v: string): string {
  return v.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/**
 * 判定端点类型。兼容裸 host:port（如代理监听地址 127.0.0.1:15721）与完整 URL。
 * 无 scheme 时按 http 补全，仅用于分类，不影响展示。
 */
function endpointType(raw: string, policy: ProviderTrustPolicy): string {
  const url = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return classifyBaseUrl(url, policy).type;
}

/** 该上游端点是否"值得关注"（非官方、非本地）。官方/国内官方集中不算风险。 */
function isNoteworthyUpstream(type: string): boolean {
  return (
    type === "openai_compatible_unknown" ||
    type === "unknown" ||
    type === "relay_or_proxy"
  );
}

/** 往 Map<endpoint, Set<agent>> 里登记一次触达。 */
function add(map: Map<string, Set<string>>, endpoint: string, agent: string): void {
  const set = map.get(endpoint) ?? new Set<string>();
  set.add(agent);
  map.set(endpoint, set);
}

/**
 * 从各 Agent 的 findings 聚合跨 Agent 集中风险。
 * @returns category 为 "correlation" 的 RiskFinding[]（无集中点时为空）。
 */
export function correlate(
  results: AgentScanResult[],
  providerPolicy: ProviderTrustPolicy = {}
): RiskFinding[] {
  // 端点 → 使用它的 Agent 集合。代理与上游分开归并，语义不同。
  const proxyMap = new Map<string, Set<string>>();
  const upstreamMap = new Map<string, Set<string>>();

  for (const r of results) {
    const agent = r.displayName;
    for (const f of r.findings) {
      const ev = f.evidence;
      if (!ev) continue;
      // 每个端点值（代理监听地址 / base_url / 真实上游）都按类型归并：
      // 本地地址 → 共享代理桶；非官方公网端点 → 共享上游桶。
      for (const cand of [ev.proxy, ev.baseUrl, ev.realUpstream]) {
        if (typeof cand !== "string" || cand.length === 0) continue;
        const key = stripScheme(cand);
        const type = endpointType(cand, providerPolicy);
        if (type === "local") {
          add(proxyMap, key, agent);
        } else if (isNoteworthyUpstream(type)) {
          add(upstreamMap, key, agent);
        }
      }
    }
  }

  const findings: RiskFinding[] = [];

  for (const [proxy, agents] of proxyMap) {
    if (agents.size < 2) continue;
    const list = [...agents];
    findings.push({
      id: "XAGENT_SHARED_PROXY",
      category: "correlation",
      severity: "high",
      title: `${list.length} 个 Agent 共用同一本地代理 ${proxy}`,
      description:
        "多个 Agent 的流量都汇聚到同一本地代理端口，该单点一旦被劫持即可见全部 Agent 的提示词与密钥；勿因 127.0.0.1 而误判为安全本地服务。",
      evidence: { proxy, agents: list, count: list.length },
      recommendation: "确认该代理进程可信；为不同 Agent 评估是否需要独立/直连出口。",
      fixable: false,
    });
  }

  for (const [endpoint, agents] of upstreamMap) {
    if (agents.size < 2) continue;
    const list = [...agents];
    findings.push({
      id: "XAGENT_SHARED_ENDPOINT",
      category: "correlation",
      severity: "medium",
      title: `${list.length} 个 Agent 连接同一非官方端点 ${endpoint}`,
      description:
        "多个 Agent 把源码上下文发往同一未知/中转端点，中转方可集中获取多来源上下文。",
      evidence: { endpoint, agents: list, count: list.length },
      recommendation: "核实该端点归属；避免多个 Agent 共享不可信中转。",
      fixable: false,
    });
  }

  return findings;
}
