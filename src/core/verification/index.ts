/** 将当前扫描、上次报告快照和接受历史合并为单任务验证结论。 */
import type { ActionTask } from "../action/index.js";
import type { ListedAcceptance } from "../acceptance/index.js";
import type { TaskSnapshot } from "./snapshot.js";

export type RiskVerificationStatus =
  | "resolved"
  | "present"
  | "mitigated"
  | "accepted"
  | "expired"
  | "revoked"
  | "identity-changed"
  | "unknown";

export interface RiskVerificationResult {
  taskId: string;
  status: RiskVerificationStatus;
  remainingRuleIds: string[];
  disappearedRuleIds: string[];
  relatedTaskIds: string[];
  acceptance?: ListedAcceptance;
}

function taskRuleIds(task: ActionTask): string[] {
  return task.requirements.map((requirement) => requirement.ruleId);
}

interface PreviousTaskIdentity {
  family: string;
  source: ActionTask["source"];
  agent?: string;
  ruleIds: string[];
}

function sameIdentityFamily(task: ActionTask, previous: PreviousTaskIdentity): boolean {
  return (
    task.family === previous.family &&
    task.source === previous.source &&
    task.agent === previous.agent
  );
}

export function verifyRiskTask(input: {
  taskId: string;
  currentTasks: readonly ActionTask[];
  previous?: TaskSnapshot;
  acceptance?: ListedAcceptance;
}): RiskVerificationResult {
  const current = input.currentTasks.find((task) => task.taskId === input.taskId);
  const previousIdentity: PreviousTaskIdentity | undefined = input.previous
    ? {
        family: input.previous.family,
        source: input.previous.source,
        ...(input.previous.agent ? { agent: input.previous.agent } : {}),
        ruleIds: input.previous.rules.map((rule) => rule.ruleId),
      }
    : input.acceptance
      ? {
          family: input.acceptance.task.family,
          source: input.acceptance.task.source,
          ...(input.acceptance.task.agent
            ? { agent: input.acceptance.task.agent }
            : {}),
          ruleIds: input.acceptance.task.ruleIds,
        }
      : undefined;
  const previousRuleIds = previousIdentity?.ruleIds ?? [];

  if (current) {
    const remainingRuleIds = taskRuleIds(current);
    const disappearedRuleIds = previousRuleIds.filter(
      (ruleId) => !remainingRuleIds.includes(ruleId)
    );
    const base = {
      taskId: input.taskId,
      remainingRuleIds,
      disappearedRuleIds,
      relatedTaskIds: [],
      ...(input.acceptance ? { acceptance: input.acceptance } : {}),
    };
    if (input.acceptance?.status === "active") {
      return { ...base, status: "accepted" };
    }
    if (input.acceptance?.status === "expired") {
      return { ...base, status: "expired" };
    }
    if (input.acceptance?.status === "revoked") {
      return { ...base, status: "revoked" };
    }
    return {
      ...base,
      status: disappearedRuleIds.length > 0 ? "mitigated" : "present",
    };
  }

  const related = previousIdentity
    ? input.currentTasks.filter((task) => {
        if (!sameIdentityFamily(task, previousIdentity)) return false;
        const rules = taskRuleIds(task);
        return previousRuleIds.some((ruleId) => rules.includes(ruleId));
      })
    : [];
  if (related.length > 0) {
    const remainingRuleIds = [...new Set(related.flatMap(taskRuleIds))];
    return {
      taskId: input.taskId,
      status: "identity-changed",
      remainingRuleIds,
      disappearedRuleIds: previousRuleIds.filter(
        (ruleId) => !remainingRuleIds.includes(ruleId)
      ),
      relatedTaskIds: related.map((task) => task.taskId),
      ...(input.acceptance ? { acceptance: input.acceptance } : {}),
    };
  }

  if (!previousIdentity) {
    return {
      taskId: input.taskId,
      status: "unknown",
      remainingRuleIds: [],
      disappearedRuleIds: [],
      relatedTaskIds: [],
    };
  }

  return {
    taskId: input.taskId,
    status: "resolved",
    remainingRuleIds: [],
    disappearedRuleIds: previousRuleIds,
    relatedTaskIds: [],
    ...(input.acceptance ? { acceptance: input.acceptance } : {}),
  };
}
