/**
 * 将扫描发现转换为面向用户的下一步行动。
 *
 * 本层负责 enrichment、归属保留、排序和汇总，并可在不丢失原始 ActionItem
 * 的前提下把同一根因聚合为 ActionTask；不修改原始 ScanReport。
 */
import { createHash } from "node:crypto";
import type {
  ActionPriority,
  AgentId,
  FindingAction,
  FindingConfidence,
  FindingDisposition,
  FindingFixMode,
  RiskFinding,
  RiskLevel,
} from "../../adapters/types.js";
import { getRuleAction } from "../../rules/action-matrix.js";
import type { ScanReport } from "../scan/index.js";

export type EnrichedFinding = RiskFinding & { action: FindingAction };

export interface ActionItem {
  /** 普通 Agent finding 或跨 Agent 关联 finding。 */
  source: "agent" | "correlation";
  /** correlation 没有单一 Agent 归属。 */
  agent?: AgentId;
  displayName: string;
  finding: EnrichedFinding;
  action: FindingAction;
}

export interface ActionSummary {
  total: number;
  /** fix/review/cleanup 的总数；observe 不计入待处理。 */
  needsAttention: number;
  /** P0/P1 且非 observe 的总数。 */
  immediate: number;
  byDisposition: Record<FindingDisposition, number>;
  byPriority: Record<ActionPriority, number>;
}

export interface ActionPlan {
  /** 按 P0 → P3 稳定排序，优先级相同则保留扫描顺序。 */
  items: ActionItem[];
  summary: ActionSummary;
}

/** 同一 Agent/来源下、共享根因身份的一组原始行动项。 */
export interface ActionTask {
  /** 由规范化根因身份计算的稳定 ID，不包含原始敏感证据。 */
  taskId: string;
  source: ActionItem["source"];
  agent?: AgentId;
  displayName: string;
  family: string;
  /** 组内最高行动优先级。 */
  priority: ActionPriority;
  /** 组内最高潜在影响。 */
  severity: RiskLevel;
  /** fix > review > cleanup > observe。 */
  disposition: FindingDisposition;
  /** 决定主文案的代表项：先 disposition，再 priority、severity、原始顺序。 */
  primary: ActionItem;
  /** 保留所有原始项，供证据、步骤与规则详情继续展示。 */
  items: ActionItem[];
  /** 按规则去重的完整处置要求；报告、接受和验证不得只读取 primary。 */
  requirements: ActionTaskRequirement[];
}

export interface ActionTaskRequirement {
  ruleId: string;
  priority: ActionPriority;
  severity: RiskLevel;
  disposition: FindingDisposition;
  confidence: FindingConfidence;
  fixMode: FindingFixMode;
  rationale: string;
  nextSteps: string[];
  verification: string[];
  acceptWhen?: string;
  baselineProfiles?: FindingAction["baselineProfiles"];
}

const PRIORITY_RANK: Record<ActionPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

const SEVERITY_RANK: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const DISPOSITION_RANK: Record<FindingDisposition, number> = {
  fix: 0,
  review: 1,
  cleanup: 2,
  observe: 3,
};

/**
 * deepScan 抛出未被 adapter 自身处理的异常时，报告必须明确这是扫描盲区，
 * 不能把 info severity 误展示成无需处理的配置观察。
 */
const DEEPSCAN_FAILED_ACTION: FindingAction = {
  disposition: "review",
  priority: "P1",
  confidence: "high",
  fixMode: "guided",
  rationale: "深度扫描未完成，当前结果可能遗漏该 Agent 的配置风险。",
  nextSteps: [
    "查看错误证据并确认相关配置文件仍然存在且当前用户可读。",
    "修复配置格式、文件权限或兼容性问题后重新运行 agentguard scan。",
  ],
  verification: [
    "重新扫描后不再出现 DEEPSCAN_FAILED。",
    "确认该 Agent 能正常展示完整发现，或明确显示未发现风险。",
  ],
  acceptWhen: "仅在已有等效的替代扫描覆盖时限时接受，并记录未覆盖原因。",
  group: { family: "scan-health", evidenceKeys: [] },
};

/** 新增规则尚未进入矩阵时的保守回退，避免报告产生无行动信息的 finding。 */
function fallbackAction(id: string): FindingAction {
  return {
    disposition: "review",
    priority: "P2",
    confidence: "low",
    fixMode: "guided",
    rationale: `规则 ${id} 尚未完成处置分类，需要人工确认其影响和预期配置。`,
    nextSteps: ["核对发现证据、配置用途和资源归属，再决定修复或接受。"],
    verification: ["重新扫描并确认该发现已消失，或已记录可接受条件。"],
    acceptWhen: "仅在确认配置归属、用途和暴露范围均符合预期后接受。",
    group: { family: "unmapped-rule", evidenceKeys: [] },
  };
}

/**
 * 附加统一行动元数据，并从 fixMode 推导旧版 fixable 字段。
 * baseline 是目前唯一可由 AgentGuard apply 执行的修复方式。
 */
export function enrichFinding(finding: RiskFinding): EnrichedFinding {
  const action =
    finding.id === "DEEPSCAN_FAILED"
      ? DEEPSCAN_FAILED_ACTION
      : (getRuleAction(finding.id) ?? fallbackAction(finding.id));

  return {
    ...finding,
    action,
    fixable: action.fixMode === "baseline",
  };
}

function emptySummary(): ActionSummary {
  return {
    total: 0,
    needsAttention: 0,
    immediate: 0,
    byDisposition: { fix: 0, review: 0, cleanup: 0, observe: 0 },
    byPriority: { P0: 0, P1: 0, P2: 0, P3: 0 },
  };
}

function summarize(items: ActionItem[]): ActionSummary {
  const summary = emptySummary();
  for (const item of items) {
    const { disposition, priority } = item.action;
    summary.total++;
    summary.byDisposition[disposition]++;
    summary.byPriority[priority]++;
    if (disposition !== "observe") {
      summary.needsAttention++;
      if (priority === "P0" || priority === "P1") summary.immediate++;
    }
  }
  return summary;
}

/**
 * 从完整扫描报告建立行动队列。allFindings 是 results 的扁平副本，因此只遍历
 * results 和 correlations，避免重复，同时保留每条 finding 的 Agent 归属。
 */
export function buildActionPlan(report: ScanReport): ActionPlan {
  const indexed: Array<{ item: ActionItem; index: number }> = [];
  let index = 0;

  for (const result of report.results) {
    for (const rawFinding of result.findings) {
      const finding = enrichFinding(rawFinding);
      indexed.push({
        index: index++,
        item: {
          source: "agent",
          agent: result.agent,
          displayName: result.displayName,
          finding,
          action: finding.action,
        },
      });
    }
  }

  for (const rawFinding of report.correlations ?? []) {
    const finding = enrichFinding(rawFinding);
    indexed.push({
      index: index++,
      item: {
        source: "correlation",
        displayName: "跨 Agent 关联",
        finding,
        action: finding.action,
      },
    });
  }

  indexed.sort(
    (a, b) =>
      PRIORITY_RANK[a.item.action.priority] -
        PRIORITY_RANK[b.item.action.priority] || a.index - b.index
  );

  const items = indexed.map(({ item }) => item);
  return { items, summary: summarize(items) };
}

/** 字符串证据统一大小写和空白；URL 额外移除结尾斜杠。 */
function normalizeEvidenceString(value: string): string {
  const normalized = value.trim().toLowerCase();
  return /^[a-z][a-z0-9+.-]*:\/\//.test(normalized)
    ? normalized.replace(/\/+$/, "")
    : normalized;
}

/**
 * 将证据值编码为稳定字符串。数组按规范化后的元素排序，对象按键排序；
 * taskId 只哈希该字符串，不直接暴露原始 evidence。
 */
function canonicalEvidence(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") {
    return JSON.stringify(normalizeEvidenceString(value));
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "number:nan";
    if (!Number.isFinite(value)) return `number:${String(value).toLowerCase()}`;
    return `number:${value}`;
  }
  if (typeof value === "boolean") return `boolean:${value}`;
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (Array.isArray(value)) {
    const members = value.map(canonicalEvidence).sort();
    return `[${members.join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, member]) => `${JSON.stringify(key)}:${canonicalEvidence(member)}`);
    return `{${entries.join(",")}}`;
  }
  return `${typeof value}:${String(value)}`;
}

function taskIdentity(item: ActionItem): string {
  const keys = [...item.action.group.evidenceKeys].sort((a, b) =>
    a.localeCompare(b)
  );
  const evidence = item.finding.evidence;
  const identityEvidence = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalEvidence(evidence?.[key])}`
  );
  return [
    `family:${item.action.group.family}`,
    `source:${item.source}`,
    `agent:${item.agent ?? ""}`,
    `evidence:{${identityEvidence.join(",")}}`,
  ].join("|");
}

function taskId(identity: string): string {
  const hashPrefix = createHash("sha256").update(identity).digest("hex").slice(0, 12);
  return `task-${hashPrefix}`;
}

/**
 * 计算单个行动项所属的稳定任务 ID。
 * 风险接受、CLI 过滤与 HTML 报告必须共用这里的身份算法，避免各自拼接导致漂移。
 */
export function actionTaskId(item: ActionItem): string {
  return taskId(taskIdentity(item));
}

function shouldReplacePrimary(candidate: ActionItem, current: ActionItem): boolean {
  const dispositionDelta =
    DISPOSITION_RANK[candidate.action.disposition] -
    DISPOSITION_RANK[current.action.disposition];
  if (dispositionDelta !== 0) return dispositionDelta < 0;

  const priorityDelta =
    PRIORITY_RANK[candidate.action.priority] -
    PRIORITY_RANK[current.action.priority];
  if (priorityDelta !== 0) return priorityDelta < 0;

  const severityDelta =
    SEVERITY_RANK[candidate.finding.severity] -
    SEVERITY_RANK[current.finding.severity];
  return severityDelta < 0;
}

type IndexedTask = Omit<ActionTask, "requirements"> & { firstIndex: number };

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/** 同一规则可能由多个等价 finding 命中；要求按规则 ID 去重并保留最高等级。 */
function buildTaskRequirements(items: readonly ActionItem[]): ActionTaskRequirement[] {
  const requirements = new Map<string, ActionTaskRequirement>();
  for (const item of items) {
    const { finding, action } = item;
    const existing = requirements.get(finding.id);
    if (!existing) {
      requirements.set(finding.id, {
        ruleId: finding.id,
        priority: action.priority,
        severity: finding.severity,
        disposition: action.disposition,
        confidence: action.confidence,
        fixMode: action.fixMode,
        rationale: action.rationale,
        nextSteps: uniqueStrings(action.nextSteps),
        verification: uniqueStrings(action.verification),
        ...(action.acceptWhen ? { acceptWhen: action.acceptWhen } : {}),
        ...(action.baselineProfiles
          ? { baselineProfiles: { ...action.baselineProfiles } }
          : {}),
      });
      continue;
    }

    if (PRIORITY_RANK[action.priority] < PRIORITY_RANK[existing.priority]) {
      existing.priority = action.priority;
    }
    if (SEVERITY_RANK[finding.severity] < SEVERITY_RANK[existing.severity]) {
      existing.severity = finding.severity;
    }
    if (DISPOSITION_RANK[action.disposition] < DISPOSITION_RANK[existing.disposition]) {
      existing.disposition = action.disposition;
    }
    existing.nextSteps = uniqueStrings([...existing.nextSteps, ...action.nextSteps]);
    existing.verification = uniqueStrings([
      ...existing.verification,
      ...action.verification,
    ]);
  }
  return [...requirements.values()];
}

export function taskMissingAcceptanceRules(task: ActionTask): string[] {
  return task.requirements
    .filter(
      (requirement) =>
        requirement.disposition !== "observe" && !requirement.acceptWhen
    )
    .map((requirement) => requirement.ruleId);
}

/**
 * 将行动项按根因聚合成稳定任务。既可直接接收 buildActionPlan 的结果，
 * 也可接收 ActionItem[]，便于报告层按需组合。
 */
export function buildActionTasks(plan: ActionPlan): ActionTask[];
export function buildActionTasks(items: readonly ActionItem[]): ActionTask[];
export function buildActionTasks(
  input: ActionPlan | readonly ActionItem[]
): ActionTask[] {
  const items: readonly ActionItem[] = Array.isArray(input)
    ? input
    : (input as ActionPlan).items;
  const byIdentity = new Map<string, IndexedTask>();

  items.forEach((item, index) => {
    const identity = taskIdentity(item);
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, {
        taskId: actionTaskId(item),
        source: item.source,
        agent: item.agent,
        displayName: item.displayName,
        family: item.action.group.family,
        priority: item.action.priority,
        severity: item.finding.severity,
        disposition: item.action.disposition,
        primary: item,
        items: [item],
        firstIndex: index,
      });
      return;
    }

    existing.items.push(item);
    if (shouldReplacePrimary(item, existing.primary)) existing.primary = item;
    if (PRIORITY_RANK[item.action.priority] < PRIORITY_RANK[existing.priority]) {
      existing.priority = item.action.priority;
    }
    if (SEVERITY_RANK[item.finding.severity] < SEVERITY_RANK[existing.severity]) {
      existing.severity = item.finding.severity;
    }
    if (
      DISPOSITION_RANK[item.action.disposition] <
      DISPOSITION_RANK[existing.disposition]
    ) {
      existing.disposition = item.action.disposition;
    }
  });

  return [...byIdentity.values()]
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        a.firstIndex - b.firstIndex
    )
    .map(({ firstIndex: _firstIndex, ...task }) => ({
      ...task,
      requirements: buildTaskRequirements(task.items),
    }));
}
