/**
 * CLI 与 Desktop 共用的首次运行摘要。
 *
 * 这里只消费已经脱敏的 ScanReport，并复用统一行动任务、配置地图和整改指引；
 * 不读取配置、不写状态，也不复制 adapter 或规则语义。
 */
import type { ActionPriority } from "../../adapters/types.js";
import {
  buildActionPlan,
  buildActionTasks,
  taskMissingAcceptanceRules,
  type ActionTask,
} from "../action/index.js";
import { providerTrustCandidateForTask } from "../config/trust.js";
import { ruleIgnoreCandidatesForTask } from "../config/rule-ignore.js";
import { buildMap, type ConfigMap } from "../map/index.js";
import { withOutputContract } from "../output-contract.js";
import {
  buildRemediationGuide,
  type RemediationGuide,
} from "../remediation/index.js";
import type { ScanReport } from "../scan/index.js";
import type { PostureReport } from "../posture/report.js";
import type { DriftComparison } from "../posture/types.js";
import type { DriftEvent } from "../posture/types.js";

export const FIRST_RUN_TOP_TASK_LIMIT = 3 as const;

export type FirstRunBucketId =
  | "mustHandle"
  | "shouldReview"
  | "informational";

export interface FirstRunTaskBucket {
  label: string;
  count: number;
  taskIds: string[];
}

export interface FirstRunNextCommand {
  id: string;
  kind: "report" | "map" | "verify" | "accept" | "trust" | "ignore";
  label: string;
  command: string;
  taskId?: string;
}

export interface FirstRunSummaryPayload {
  privacy: {
    localOnly: true;
    uploadsData: false;
    readOnlyScan: true;
  };
  summary: {
    configuredAgents: number;
    findingCount: number;
    taskCount: number;
    immediateTaskCount: number;
    informationalTaskCount: number;
    acceptedTaskCount: number;
    ignoredFindingCount: number;
  };
  map: ConfigMap;
  /** 当前活动报告派生的全部任务，包含 observe，顺序与统一行动模型一致。 */
  tasks: ActionTask[];
  /** 首屏统一展示的前三个非 observe 任务。 */
  topTasks: ActionTask[];
  buckets: Record<FirstRunBucketId, FirstRunTaskBucket>;
  /** 当前操作系统的安全命令模板；命令不会包含原始凭证。 */
  remediationGuides: Record<string, RemediationGuide>;
  nextCommands: FirstRunNextCommand[];
  /** E2+ 可选扩展；旧 v1 消费方可忽略。 */
  posture?: PostureReport;
  /** E3+ 可选扩展；没有可信基线时为 no-baseline。 */
  drift?: DriftComparison;
  /** 与 Top 3 行动共用容量的高优先级变化。 */
  topDriftEvents?: DriftEvent[];
}

export type FirstRunSummaryV1 = FirstRunSummaryPayload & {
  schemaVersion: 1;
  command: "first-run";
};

export interface FirstRunSummaryOptions {
  acceptedTaskCount?: number;
  ignoredFindingCount?: number;
  platform?: NodeJS.Platform;
  posture?: PostureReport;
  drift?: DriftComparison;
}

function isImmediate(priority: ActionPriority): boolean {
  return priority === "P0" || priority === "P1";
}

function bucket(
  label: string,
  tasks: readonly ActionTask[]
): FirstRunTaskBucket {
  return {
    label,
    count: tasks.length,
    taskIds: tasks.map((task) => task.taskId),
  };
}

function buildNextCommands(topTasks: readonly ActionTask[]): FirstRunNextCommand[] {
  const commands: FirstRunNextCommand[] = [
    {
      id: "report",
      kind: "report",
      label: "生成完整 HTML 行动报告",
      command: "agentreveal report --format html",
    },
    {
      id: "map",
      kind: "map",
      label: "查看完整配置地图",
      command: "agentreveal map",
    },
  ];

  for (const task of topTasks) {
    commands.push({
      id: `verify:${task.taskId}`,
      kind: "verify",
      label: "处置后验证当前任务",
      command: `agentreveal risk verify ${task.taskId}`,
      taskId: task.taskId,
    });

    if (taskMissingAcceptanceRules(task).length === 0) {
      const expires = task.priority === "P0" ? " --expires YYYY-MM-DD" : "";
      commands.push({
        id: `accept:${task.taskId}`,
        kind: "accept",
        label: "确认暂不处理并保留审计",
        command:
          `agentreveal risk accept ${task.taskId} --reason "填写真实接受原因"` +
          `${expires} --confirm`,
        taskId: task.taskId,
      });
    }

    const trust = providerTrustCandidateForTask(task);
    if (trust) {
      commands.push({
        id: `trust:${task.taskId}`,
        kind: "trust",
        label: "确认自建或内部 Provider",
        command:
          `agentreveal trust add "${trust.endpoint}" --kind trusted ` +
          '--reason "填写端点所有者、用途和核实依据"',
        taskId: task.taskId,
      });
    }

    for (const candidate of ruleIgnoreCandidatesForTask(task)) {
      commands.push({
        id: `ignore:${task.taskId}:${candidate.ruleId}`,
        kind: "ignore",
        label: `项目内忽略规则 ${candidate.ruleId}`,
        command:
          `agentreveal ignore add ${task.taskId} --rule ${candidate.ruleId} ` +
          '--reason "填写审核依据；不要包含密钥或敏感信息"',
        taskId: task.taskId,
      });
    }
  }
  return commands;
}

/** 从应用 acceptance 后的活动报告构建统一首次运行契约。 */
export function buildFirstRunSummary(
  report: ScanReport,
  options: FirstRunSummaryOptions = {}
): FirstRunSummaryV1 {
  const tasks = buildActionTasks(buildActionPlan(report));
  const actionable = tasks.filter((task) => task.disposition !== "observe");
  const mustHandle = actionable.filter((task) => isImmediate(task.priority));
  const shouldReview = actionable.filter((task) => !isImmediate(task.priority));
  const informational = tasks.filter((task) => task.disposition === "observe");
  const topDriftEvents = (options.drift?.events ?? [])
    .filter((entry) => entry.change !== "removed")
    .slice(0, FIRST_RUN_TOP_TASK_LIMIT);
  const topTasks = actionable.slice(
    0,
    Math.max(0, FIRST_RUN_TOP_TASK_LIMIT - topDriftEvents.length)
  );
  const remediationGuides = Object.fromEntries(
    topTasks.map((task) => [
      task.taskId,
      buildRemediationGuide(task, { platform: options.platform }),
    ])
  );

  return withOutputContract("first-run", {
    privacy: {
      localOnly: true,
      uploadsData: false,
      readOnlyScan: true,
    },
    summary: {
      configuredAgents: report.results.filter(
        (result) => result.agent !== "workspace" && result.discovery.configFound
      ).length,
      findingCount:
        report.allFindings.length + (report.correlations?.length ?? 0),
      taskCount: actionable.length,
      immediateTaskCount: mustHandle.length,
      informationalTaskCount: informational.length,
      acceptedTaskCount: options.acceptedTaskCount ?? 0,
      ignoredFindingCount: options.ignoredFindingCount ?? 0,
    },
    map: buildMap(report),
    tasks,
    topTasks,
    buckets: {
      mustHandle: bucket("必须处理", mustHandle),
      shouldReview: bucket("建议确认", shouldReview),
      informational: bucket("信息提示", informational),
    },
    remediationGuides,
    nextCommands: buildNextCommands(topTasks),
    ...(options.posture ? { posture: options.posture } : {}),
    ...(options.drift ? { drift: options.drift } : {}),
    ...(options.drift ? { topDriftEvents } : {}),
  });
}
