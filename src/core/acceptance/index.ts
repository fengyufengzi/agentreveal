/**
 * 本地风险接受记录。
 *
 * schema v2 使用 taskId + scopeId 隔离项目。旧 v1 无作用域记录只作为 legacy 审计保留，
 * 不会继续影响扫描结果。文件写入使用同目录临时文件、fsync 和原子 rename。
 */
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ActionTask } from "../action/index.js";
import { atomicWriteFile } from "../fs-safety.js";

const ACCEPTANCE_SCHEMA_VERSION = 2 as const;
const LEGACY_SCHEMA_VERSION = 1 as const;

export type AcceptanceStatus = "active" | "expired" | "revoked" | "legacy";

/** 持久化时只保留任务摘要，不复制 evidence 或完整报告。 */
export interface AcceptanceTaskSummary {
  taskId: string;
  family: string;
  source: ActionTask["source"];
  agent?: string;
  displayName: string;
  disposition: ActionTask["disposition"];
  priority: ActionTask["priority"];
  severity: ActionTask["severity"];
  ruleIds: string[];
  /** 旧 v2 记录可能没有；新记录保存每条规则的完整处置摘要。 */
  rules?: AcceptanceRuleSummary[];
  /** 仅兼容早期 v2；新记录不保存可能含内部端点的动态标题。 */
  titles: string[];
}

export interface AcceptanceRuleSummary {
  ruleId: string;
  disposition: ActionTask["disposition"];
  priority: ActionTask["priority"];
  severity: ActionTask["severity"];
  fixMode: ActionTask["requirements"][number]["fixMode"];
  acceptWhen?: string;
}

interface AcceptanceRecordBase {
  taskId: string;
  reason: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  task: AcceptanceTaskSummary;
}

export interface AcceptanceRecord extends AcceptanceRecordBase {
  scopeId: string;
}

export interface LegacyAcceptanceRecord extends AcceptanceRecordBase {
  scopeId?: undefined;
}

export type ListedAcceptance =
  | (AcceptanceRecord & { status: Exclude<AcceptanceStatus, "legacy"> })
  | (LegacyAcceptanceRecord & { status: "legacy" });

export interface AcceptanceDocument {
  schemaVersion: typeof ACCEPTANCE_SCHEMA_VERSION;
  /** `${scopeId}:${taskId}` 是主键；数组保留该作用域内的全部接受历史。 */
  acceptances: Record<string, AcceptanceRecord[]>;
  /** v1 记录没有可信作用域，只保留审计，不参与匹配。 */
  legacyAcceptances: Record<string, LegacyAcceptanceRecord[]>;
}

interface LegacyAcceptanceDocument {
  schemaVersion: typeof LEGACY_SCHEMA_VERSION;
  acceptances: Record<string, unknown[]>;
}

export interface AcceptanceStoreOptions {
  /** 默认 ~/.agentreveal/acceptances.json；测试和嵌入场景可注入。 */
  path?: string;
  /** 默认 process.cwd()；仅用于计算不可逆的当前项目 scopeId。 */
  cwd?: string;
  /** 测试或嵌入场景可直接注入已验证的 scopeId。 */
  scopeId?: string;
  /** 注入时钟，保证过期逻辑可重复测试。 */
  now?: () => Date;
}

export interface AcceptOptions {
  expiresAt?: string | Date;
}

export interface ListAcceptanceOptions {
  /** 默认返回当前作用域完整历史；设为 true 时只返回当前有效记录。 */
  activeOnly?: boolean;
  /** 审计工具可查看其它作用域；默认只显示当前项目。 */
  allScopes?: boolean;
  /** 显示无作用域且永不生效的 v1 历史。 */
  includeLegacy?: boolean;
}

export function defaultAcceptancePath(home = homedir()): string {
  return join(home, ".agentreveal", "acceptances.json");
}

export function canonicalProjectPath(cwd = process.cwd()): string {
  const canonical = realpathSync.native(resolve(cwd)).normalize("NFC");
  const normalized = process.platform === "win32"
    ? canonical.replaceAll("\\", "/")
    : canonical;
  return process.platform === "win32" || pathUsesCaseInsensitiveLookup(canonical)
    ? normalized.toLowerCase()
    : normalized;
}

function pathUsesCaseInsensitiveLookup(path: string): boolean {
  const original = statSync(path);
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const character = path[index];
    if (!/[A-Za-z]/.test(character)) continue;
    const toggled = character === character.toLowerCase()
      ? character.toUpperCase()
      : character.toLowerCase();
    const candidate = path.slice(0, index) + toggled + path.slice(index + 1);
    try {
      const alternate = statSync(candidate);
      return alternate.dev === original.dev && alternate.ino === original.ino;
    } catch {
      // 大小写敏感文件系统上候选通常不存在，继续尝试其它字符。
    }
  }
  return false;
}

export function projectScopeId(cwd = process.cwd()): string {
  const digest = createHash("sha256")
    .update(`agentreveal-project-scope\0${canonicalProjectPath(cwd)}`, "utf8")
    .digest("hex");
  return `scope-${digest}`;
}

function emptyDocument(): AcceptanceDocument {
  return {
    schemaVersion: ACCEPTANCE_SCHEMA_VERSION,
    acceptances: {},
    legacyAcceptances: {},
  };
}

function assertTaskId(taskId: string): void {
  if (!/^task-[A-Za-z0-9_-]{6,128}$/.test(taskId)) {
    throw new Error("无效的任务 ID。必须使用 AgentReveal 生成的稳定 taskId。");
  }
}

function assertScopeId(scopeId: string): void {
  if (!/^scope-[a-f0-9]{64}$/.test(scopeId)) {
    throw new Error("无效的项目作用域 ID。");
  }
}

function acceptanceKey(scopeId: string, taskId: string): string {
  return `${scopeId}:${taskId}`;
}

function validIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateRuleSummaries(
  value: unknown,
  expectedRuleIds: readonly string[]
): AcceptanceRuleSummary[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("接受记录规则摘要无效。");
  const rules = value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("接受记录规则摘要无效。");
    }
    const rule = entry as Partial<AcceptanceRuleSummary>;
    if (
      typeof rule.ruleId !== "string" ||
      !["fix", "review", "cleanup", "observe"].includes(String(rule.disposition)) ||
      !["P0", "P1", "P2", "P3"].includes(String(rule.priority)) ||
      !["critical", "high", "medium", "low", "info"].includes(String(rule.severity)) ||
      !["baseline", "guided", "manual", "none"].includes(String(rule.fixMode)) ||
      (rule.acceptWhen !== undefined && typeof rule.acceptWhen !== "string")
    ) {
      throw new Error("接受记录规则摘要无效。");
    }
    return rule as AcceptanceRuleSummary;
  });
  const ids = [...new Set(rules.map((rule) => rule.ruleId))].sort();
  const expected = [...new Set(expectedRuleIds)].sort();
  if (ids.join("\0") !== expected.join("\0")) {
    throw new Error("接受记录规则摘要与 ruleIds 不一致。");
  }
  return rules;
}

function validateTaskSummary(
  value: unknown,
  expectedTaskId: string
): AcceptanceTaskSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`接受记录任务摘要无效：${expectedTaskId}`);
  }
  const task = value as Partial<AcceptanceTaskSummary>;
  if (
    task.taskId !== expectedTaskId ||
    typeof task.family !== "string" ||
    !["agent", "correlation"].includes(String(task.source)) ||
    (task.agent !== undefined && typeof task.agent !== "string") ||
    typeof task.displayName !== "string" ||
    !["fix", "review", "cleanup", "observe"].includes(String(task.disposition)) ||
    !["P0", "P1", "P2", "P3"].includes(String(task.priority)) ||
    !["critical", "high", "medium", "low", "info"].includes(String(task.severity)) ||
    !isStringArray(task.ruleIds) ||
    !isStringArray(task.titles)
  ) {
    throw new Error(`接受记录任务摘要无效：${expectedTaskId}`);
  }
  const summary = task as AcceptanceTaskSummary;
  const rules = validateRuleSummaries(summary.rules, summary.ruleIds);
  return { ...summary, ...(rules ? { rules } : {}) };
}

function validateRecordBase(
  value: unknown,
  expectedTaskId: string
): LegacyAcceptanceRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`接受记录无效：${expectedTaskId}`);
  }
  const record = value as Partial<AcceptanceRecord>;
  if (
    record.taskId !== expectedTaskId ||
    typeof record.reason !== "string" ||
    record.reason.trim().length === 0 ||
    !validIsoDate(record.createdAt) ||
    (record.expiresAt !== undefined && !validIsoDate(record.expiresAt)) ||
    (record.revokedAt !== undefined && !validIsoDate(record.revokedAt))
  ) {
    throw new Error(`接受记录无效：${expectedTaskId}`);
  }
  return {
    taskId: expectedTaskId,
    reason: record.reason,
    createdAt: record.createdAt,
    ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
    ...(record.revokedAt ? { revokedAt: record.revokedAt } : {}),
    task: validateTaskSummary(record.task, expectedTaskId),
  };
}

function validateScopedRecord(
  value: unknown,
  expectedTaskId: string,
  expectedScopeId: string
): AcceptanceRecord {
  const base = validateRecordBase(value, expectedTaskId);
  const scopeId = (value as Partial<AcceptanceRecord>).scopeId;
  if (scopeId !== expectedScopeId) {
    throw new Error(`接受记录作用域无效：${expectedTaskId}`);
  }
  return { ...base, scopeId: expectedScopeId };
}

function validateLegacyCollection(
  value: unknown
): Record<string, LegacyAcceptanceRecord[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("旧版接受记录结构无效。");
  }
  const legacy: Record<string, LegacyAcceptanceRecord[]> = {};
  for (const [taskId, history] of Object.entries(value)) {
    assertTaskId(taskId);
    if (!Array.isArray(history)) throw new Error(`接受记录历史无效：${taskId}`);
    legacy[taskId] = history.map((record) => validateRecordBase(record, taskId));
  }
  return legacy;
}

function validateDocument(value: unknown): AcceptanceDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("接受记录文件格式无效。");
  }
  const raw = value as {
    schemaVersion?: unknown;
    acceptances?: unknown;
    legacyAcceptances?: unknown;
  };

  if (raw.schemaVersion === LEGACY_SCHEMA_VERSION) {
    return {
      schemaVersion: ACCEPTANCE_SCHEMA_VERSION,
      acceptances: {},
      legacyAcceptances: validateLegacyCollection(raw.acceptances),
    };
  }

  if (
    raw.schemaVersion !== ACCEPTANCE_SCHEMA_VERSION ||
    !raw.acceptances ||
    typeof raw.acceptances !== "object" ||
    Array.isArray(raw.acceptances)
  ) {
    throw new Error("接受记录文件版本或结构无效。");
  }

  const acceptances: Record<string, AcceptanceRecord[]> = {};
  for (const [key, history] of Object.entries(raw.acceptances)) {
    if (!Array.isArray(history) || history.length === 0) {
      throw new Error(`接受记录历史无效：${key}`);
    }
    const first = history[0] as Partial<AcceptanceRecord>;
    if (typeof first.scopeId !== "string" || typeof first.taskId !== "string") {
      throw new Error(`接受记录主键无效：${key}`);
    }
    assertScopeId(first.scopeId);
    assertTaskId(first.taskId);
    if (key !== acceptanceKey(first.scopeId, first.taskId)) {
      throw new Error(`接受记录主键无效：${key}`);
    }
    acceptances[key] = history.map((record) =>
      validateScopedRecord(record, first.taskId as string, first.scopeId as string)
    );
  }

  const legacyAcceptances = raw.legacyAcceptances === undefined
    ? {}
    : validateLegacyCollection(raw.legacyAcceptances);
  return { schemaVersion: ACCEPTANCE_SCHEMA_VERSION, acceptances, legacyAcceptances };
}

function taskSummary(task: ActionTask): AcceptanceTaskSummary {
  const uniqueSorted = (values: string[]): string[] =>
    [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );

  return {
    taskId: task.taskId,
    family: task.family,
    source: task.source,
    ...(task.agent ? { agent: task.agent } : {}),
    displayName: task.displayName,
    disposition: task.disposition,
    priority: task.priority,
    severity: task.severity,
    ruleIds: uniqueSorted(task.items.map((item) => item.finding.id)),
    rules: task.requirements.map((requirement) => ({
      ruleId: requirement.ruleId,
      disposition: requirement.disposition,
      priority: requirement.priority,
      severity: requirement.severity,
      fixMode: requirement.fixMode,
      ...(requirement.acceptWhen ? { acceptWhen: requirement.acceptWhen } : {}),
    })),
    // finding.title 可能含自定义端点或资源名；审计只保存规则级静态摘要。
    titles: [],
  };
}

function normalizeExpiresAt(
  value: string | Date | undefined,
  now: Date
): string | undefined {
  if (value === undefined) return undefined;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("expiresAt 不是有效日期。");
  if (parsed.getTime() <= now.getTime()) {
    throw new Error("expiresAt 必须晚于当前时间。");
  }
  return parsed.toISOString();
}

function statusAt(
  record: AcceptanceRecord,
  now: Date
): Exclude<AcceptanceStatus, "legacy"> {
  if (record.revokedAt) return "revoked";
  if (record.expiresAt && Date.parse(record.expiresAt) <= now.getTime()) {
    return "expired";
  }
  return "active";
}

export class AcceptanceStore {
  readonly path: string;
  readonly scopeId: string;
  private readonly now: () => Date;

  constructor(options: AcceptanceStoreOptions = {}) {
    this.path = options.path ?? defaultAcceptancePath();
    this.scopeId = options.scopeId ?? projectScopeId(options.cwd);
    assertScopeId(this.scopeId);
    this.now = options.now ?? (() => new Date());
  }

  private currentDate(): Date {
    const now = this.now();
    if (!Number.isFinite(now.getTime())) throw new Error("当前时间无效。");
    return now;
  }

  private read(): AcceptanceDocument {
    if (!existsSync(this.path)) return emptyDocument();
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.path, "utf8"));
    } catch (error) {
      throw new Error(
        `无法读取接受记录 ${this.path}：${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    return validateDocument(parsed);
  }

  private write(document: AcceptanceDocument): void {
    const directory = dirname(this.path);
    const directoryExisted = existsSync(directory);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!directoryExisted) chmodSync(directory, 0o700);
    atomicWriteFile(this.path, JSON.stringify(document, null, 2) + "\n", 0o600);
  }

  /** 新增当前项目的一次接受事件；其它项目和旧版记录不参与重复判断。 */
  accept(
    task: ActionTask,
    reason: string,
    options: AcceptOptions = {}
  ): AcceptanceRecord & { status: "active" } {
    assertTaskId(task.taskId);
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new Error("接受原因不能为空。");
    if (["说明接受原因", "填写真实接受原因", "请输入接受原因"].includes(normalizedReason)) {
      throw new Error("不能使用报告占位文本作为接受原因，请填写真实业务理由。");
    }

    const document = this.read();
    const now = this.currentDate();
    const key = acceptanceKey(this.scopeId, task.taskId);
    const history = document.acceptances[key] ?? [];
    if (history.some((record) => statusAt(record, now) === "active")) {
      throw new Error(`任务 ${task.taskId} 已在当前项目处于接受状态。`);
    }
    const expiresAt = normalizeExpiresAt(options.expiresAt, now);

    const record: AcceptanceRecord = {
      taskId: task.taskId,
      scopeId: this.scopeId,
      reason: normalizedReason,
      createdAt: now.toISOString(),
      ...(expiresAt ? { expiresAt } : {}),
      task: taskSummary(task),
    };
    document.acceptances[key] = [...history, record];
    this.write(document);
    return { ...record, status: "active" };
  }

  /** 默认返回当前项目历史；legacy 只在显式请求时展示且永不生效。 */
  list(options: ListAcceptanceOptions = {}): ListedAcceptance[] {
    const now = this.currentDate();
    const document = this.read();
    const scoped = Object.values(document.acceptances).flatMap((history) =>
      history
        .filter((record) => options.allScopes || record.scopeId === this.scopeId)
        .map((record): ListedAcceptance => ({ ...record, status: statusAt(record, now) }))
    );
    const legacy: ListedAcceptance[] = options.includeLegacy
      ? Object.values(document.legacyAcceptances).flatMap((history) =>
          history.map((record): ListedAcceptance => ({ ...record, status: "legacy" }))
        )
      : [];
    return [...scoped, ...legacy]
      .filter((record) => !options.activeOnly || record.status === "active")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** 当前项目是否存在未撤销且未过期的接受记录。 */
  isAccepted(taskId: string): boolean {
    assertTaskId(taskId);
    const now = this.currentDate();
    const key = acceptanceKey(this.scopeId, taskId);
    return (this.read().acceptances[key] ?? []).some(
      (record) => statusAt(record, now) === "active"
    );
  }

  /** 撤销当前项目最近一条尚未明确撤销的记录，从不删除历史。 */
  revoke(taskId: string): AcceptanceRecord & { status: "revoked" } {
    assertTaskId(taskId);
    const document = this.read();
    const key = acceptanceKey(this.scopeId, taskId);
    const history = document.acceptances[key] ?? [];
    const record = [...history].reverse().find((entry) => !entry.revokedAt);
    if (!record) throw new Error(`任务 ${taskId} 在当前项目没有可撤销的接受记录。`);

    const now = this.currentDate();
    record.revokedAt = now.toISOString();
    this.write(document);
    return { ...record, status: "revoked" };
  }
}
