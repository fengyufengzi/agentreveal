/** 将本地风险接受状态应用到扫描结果，不修改原始 ScanReport。 */
import type { RiskFinding } from "../../adapters/types.js";
import {
  actionTaskId,
  buildActionPlan,
  buildActionTasks,
  enrichFinding,
  type ActionItem,
  type ActionTask,
  type EnrichedFinding,
} from "../action/index.js";
import type { ListedAcceptance } from "../acceptance/index.js";
import type { ListedRuleIgnore } from "../config/rule-ignore.js";
import type { ScanReport } from "../scan/index.js";

export interface IgnoredFinding {
  agent: NonNullable<ActionItem["agent"]>;
  displayName: string;
  finding: EnrichedFinding;
  policy: ListedRuleIgnore;
}

export interface RuleIgnoredReport {
  report: ScanReport;
  ignoredFindings: IgnoredFinding[];
  activeRuleIgnores: ListedRuleIgnore[];
}

export interface TriagedReport {
  /** 默认命令使用的活动结果；已接受任务不再计数、展示或影响退出码。 */
  activeReport: ScanReport;
  /** 仍保留完整任务，供 HTML 审计区展示。 */
  acceptedTasks: ActionTask[];
  activeAcceptances: ListedAcceptance[];
  /** 被项目级规则策略隐藏的原始发现，供审计区展示和撤销后恢复。 */
  ignoredFindings: IgnoredFinding[];
  activeRuleIgnores: ListedRuleIgnore[];
}

function itemForFinding(input: {
  source: ActionItem["source"];
  agent?: ActionItem["agent"];
  displayName: string;
  finding: RiskFinding;
}): ActionItem {
  const finding: EnrichedFinding = input.finding.action
    ? (input.finding as EnrichedFinding)
    : enrichFinding(input.finding);
  return {
    source: input.source,
    ...(input.agent ? { agent: input.agent } : {}),
    displayName: input.displayName,
    finding,
    action: finding.action,
  };
}

export function applyAcceptances(
  report: ScanReport,
  records: readonly ListedAcceptance[],
  ruleIgnores: readonly ListedRuleIgnore[] = []
): TriagedReport {
  const activeAcceptances = records.filter((record) => record.status === "active");
  const acceptedIds = new Set(activeAcceptances.map((record) => record.taskId));
  const ignored = applyRuleIgnores(report, ruleIgnores);
  const unignoredReport = ignored.report;
  const acceptedTasks = buildActionTasks(buildActionPlan(unignoredReport)).filter((task) =>
    acceptedIds.has(task.taskId)
  );

  const results = unignoredReport.results.map((result) => ({
    ...result,
    findings: result.findings.filter((finding) => {
      const item = itemForFinding({
        source: "agent",
        agent: result.agent,
        displayName: result.displayName,
        finding,
      });
      return !acceptedIds.has(actionTaskId(item));
    }),
  }));
  const correlations = (unignoredReport.correlations ?? []).filter((finding) => {
    const item = itemForFinding({
      source: "correlation",
      displayName: "跨 Agent 关联",
      finding,
    });
    return !acceptedIds.has(actionTaskId(item));
  });

  return {
    activeReport: {
      results,
      allFindings: results.flatMap((result) => result.findings),
      correlations,
    },
    acceptedTasks,
    activeAcceptances,
    ignoredFindings: ignored.ignoredFindings,
    activeRuleIgnores: ignored.activeRuleIgnores,
  };
}

/** 只应用项目级规则策略，供 HTML 在保留完整技术证据时复用。 */
export function applyRuleIgnores(
  report: ScanReport,
  ruleIgnores: readonly ListedRuleIgnore[] = []
): RuleIgnoredReport {
  const activeRuleIgnores = ruleIgnores.filter((record) => record.status === "active");
  const ignorePolicies = new Map(
    activeRuleIgnores.map((record) => [`${record.agent}\0${record.ruleId}`, record])
  );
  const ignoredFindings: IgnoredFinding[] = [];

  const unignoredResults = report.results.map((result) => ({
    ...result,
    findings: result.findings.filter((finding) => {
      const policy = ignorePolicies.get(`${result.agent}\0${finding.id}`);
      if (policy) {
        ignoredFindings.push({
          agent: result.agent,
          displayName: result.displayName,
          finding: finding.action
            ? (finding as EnrichedFinding)
            : enrichFinding(finding),
          policy,
        });
        return false;
      }
      return true;
    }),
  }));
  const activeReport: ScanReport = {
    results: unignoredResults,
    allFindings: unignoredResults.flatMap((result) => result.findings),
    correlations: report.correlations ?? [],
  };
  return {
    report: activeReport,
    ignoredFindings,
    activeRuleIgnores,
  };
}
