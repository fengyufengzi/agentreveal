/**
 * scan 编排：先 discovery，再对实现了 deepScan 的 adapter 做深度解析，汇总 RiskFinding。
 * 单个 adapter 抛错不影响其他，保证整体扫描鲁棒。
 */
import type {
  AgentDiscovery,
  AgentId,
  DiscoveryContext,
  RiskFinding,
} from "../../adapters/types.js";
import { adapters } from "../../adapters/index.js";
import { loadAgentGuardConfig } from "../config/index.js";
import { buildContext } from "../discovery/index.js";
import { correlate } from "../correlate/index.js";
import { scanSensitiveFiles } from "../sensitive/index.js";
import { enrichFinding } from "../action/index.js";

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
export async function scanAll(
  ctx: DiscoveryContext = buildContext()
): Promise<ScanReport> {
  const agentGuardConfig = loadAgentGuardConfig(ctx.cwd);
  const scanCtx: DiscoveryContext = {
    ...ctx,
    providerPolicy: {
      trustedEndpoints: [
        ...(agentGuardConfig.providerPolicy.trustedEndpoints ?? []),
        ...(ctx.providerPolicy?.trustedEndpoints ?? []),
      ],
      internalEndpoints: [
        ...(agentGuardConfig.providerPolicy.internalEndpoints ?? []),
        ...(ctx.providerPolicy?.internalEndpoints ?? []),
      ],
    },
  };

  const agentResults = await Promise.all(
    adapters.map(async (a): Promise<AgentScanResult> => {
      let discovery: AgentDiscovery;
      try {
          discovery = await a.discover(scanCtx);
      } catch {
        return {
          agent: a.agent,
          displayName: a.displayName,
          discovery: {
            agent: a.agent,
            displayName: a.displayName,
            configFound: false,
            notes: ["discovery 过程出错，已跳过"],
          },
          findings: [],
        };
      }

      let findings: RiskFinding[] = [];
      if (discovery.configFound && a.deepScan) {
        try {
          findings = await a.deepScan(scanCtx, discovery);
        } catch (err) {
          findings = [
            {
              id: "DEEPSCAN_FAILED",
              category: "compat",
              severity: "info",
              title: `${a.displayName} 深度扫描出错，已跳过`,
              evidence: {
                error: err instanceof Error ? err.message : String(err),
              },
              fixable: false,
            },
          ];
        }
      }

      findings = findings.map(enrichFinding);

      return {
        agent: a.agent,
        displayName: a.displayName,
        discovery,
        findings,
      };
    })
  );

  const workspaceResult: AgentScanResult = {
    agent: "workspace",
    displayName: "当前项目",
    discovery: {
      agent: "workspace",
      displayName: "当前项目",
      configFound: true,
      configPath: ctx.cwd,
      source: "当前工作目录",
      notes: [
        "只检查敏感文件名和相对路径，不读取文件内容",
        ...(agentGuardConfig.configPath
          ? [`读取 AgentGuard 配置：${agentGuardConfig.configPath}`]
          : []),
        ...agentGuardConfig.warnings.map((w) => `AgentGuard 配置解析失败：${w}`),
      ],
    },
    findings: scanSensitiveFiles(ctx.cwd).map(enrichFinding),
  };

  const results = [...agentResults, workspaceResult];
  const allFindings = results.flatMap((r) => r.findings);
  const correlations = correlate(agentResults, scanCtx.providerPolicy).map(
    enrichFinding
  );
  return { results, allFindings, correlations };
}
