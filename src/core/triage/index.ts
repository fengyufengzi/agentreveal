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
import type { ScanReport } from "../scan/index.js";

export interface TriagedReport {
  /** 默认命令使用的活动结果；已接受任务不再计数、展示或影响退出码。 */
  activeReport: ScanReport;
  /** 仍保留完整任务，供 HTML 审计区展示。 */
  acceptedTasks: ActionTask[];
  activeAcceptances: ListedAcceptance[];
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
  records: readonly ListedAcceptance[]
): TriagedReport {
  const activeAcceptances = records.filter((record) => record.status === "active");
  const acceptedIds = new Set(activeAcceptances.map((record) => record.taskId));
  const acceptedTasks = buildActionTasks(buildActionPlan(report)).filter((task) =>
    acceptedIds.has(task.taskId)
  );

  const results = report.results.map((result) => ({
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
  const correlations = (report.correlations ?? []).filter((finding) => {
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
  };
}
