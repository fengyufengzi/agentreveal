/**
 * Electron 桌面端使用的 typed service。
 *
 * 桌面端直接复用 core，不解析终端文本；本机 scope 由主进程固定提供，项目路径经目录选择器批准后传入。
 */
import { createHash } from "node:crypto";
import {
  chmodSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, resolve } from "node:path";
import { claudeCodeAdapter } from "../adapters/claude-code/index.js";
import type { ListedAcceptance } from "../core/acceptance/index.js";
import { AcceptanceStore } from "../core/acceptance/index.js";
import {
  buildActionPlan,
  buildActionTasks,
  taskMissingAcceptanceRules,
  type ActionTask,
} from "../core/action/index.js";
import {
  baselinePlanFingerprint,
  buildBaselinePlan,
  type BaselinePlan,
  type BaselineProfile,
} from "../core/baseline/index.js";
import {
  applyBaseline,
  restoreBaselineBackup,
  type ApplyResult,
} from "../core/apply/index.js";
import {
  createClaudeCredentialBackup,
  previewClaudeCredentialRestore,
  restoreClaudeCredentialBackup,
} from "../core/credential-backup/index.js";
import {
  addProviderTrust,
  listProviderTrust,
  providerTrustCandidateForTask,
  removeProviderTrust,
  type ProviderTrustKind,
  type ProviderTrustState,
} from "../core/config/trust.js";
import {
  activeRuleIgnoresSafely,
  addRuleIgnore,
  listRuleIgnores,
  removeRuleIgnore,
  ruleIgnoreCandidatesForTask,
  type ListedRuleIgnore,
  type RuleIgnoreState,
} from "../core/config/rule-ignore.js";
import { buildContext } from "../core/discovery/index.js";
import {
  buildFirstRunSummary,
  type FirstRunSummaryV1,
} from "../core/first-run/index.js";
import type { ConfigMap } from "../core/map/index.js";
import { withOutputContract } from "../core/output-contract.js";
import { renderHtmlReport } from "../core/report/html-report.js";
import { scanAll, type ScanReport } from "../core/scan/index.js";
import { applyAcceptances, type TriagedReport } from "../core/triage/index.js";
import {
  defaultTaskSnapshotPath,
  TaskSnapshotStore,
} from "../core/verification/snapshot.js";
import {
  verifyRiskTask,
  type RiskVerificationResult,
} from "../core/verification/index.js";

export const DESKTOP_SCHEMA_VERSION = 1 as const;
export type DesktopScopeKind = "machine" | "project";

export interface DesktopOverview {
  schemaVersion: typeof DESKTOP_SCHEMA_VERSION;
  generatedAt: string;
  privacy: {
    localOnly: true;
    uploadsData: false;
    readOnlyScan: true;
  };
  project: {
    path: string;
    name: string;
  };
  /**
   * Desktop 支持项目与整机两种范围；project 字段为兼容既有消费者继续保留。
   * 只有 project scope 才允许写入项目级接受、信任与忽略策略。
   */
  scope: {
    kind: DesktopScopeKind;
    path: string;
    name: string;
    projectPoliciesAvailable: boolean;
  };
  /** 与裸 CLI 完全共用的首次运行摘要契约。 */
  firstRun: FirstRunSummaryV1;
  summary: {
    configuredAgents: number;
    findingCount: number;
    taskCount: number;
    immediateTaskCount: number;
    informationalTaskCount: number;
    acceptedTaskCount: number;
    ignoredFindingCount: number;
  };
  report: ScanReport;
  map: ConfigMap;
  tasks: ActionTask[];
  topTasks: ActionTask[];
  acceptedTasks: DesktopAcceptedTask[];
  ignoredFindings: DesktopIgnoredFinding[];
  providerTrust: {
    configPath: string;
    entries: ProviderTrustState["entries"];
    auditEventCount: number;
  };
  /** 候选端点由 core 从当前任务证据中推导，renderer 不得自行提交任意端点。 */
  trustCandidates: Record<string, { endpoint: string }>;
  /** 候选由 core 从当前活动任务推导；renderer 只能回传 taskId + ruleId。 */
  ignoreCandidates: Record<string, Array<{ ruleId: string; agent: string }>>;
  ruleIgnores: {
    configPath: string;
    entries: RuleIgnoreState["entries"];
    auditEventCount: number;
  };
}

export interface DesktopAcceptedTask {
  task: ActionTask;
  reason: string;
  createdAt: string;
  expiresAt?: string;
}

export interface DesktopIgnoredFinding {
  agent: string;
  displayName: string;
  ruleId: string;
  title: string;
  reason: string;
  createdAt: string;
  expiresAt?: string;
}

export interface DesktopReportResult {
  path: string;
  format: DesktopReportFormat;
  findingCount: number;
  acceptedTaskCount: number;
  ignoredFindingCount: number;
}

export type DesktopReportFormat = "html" | "json";

export interface DesktopRiskOperationResult {
  overview: DesktopOverview;
}

export interface DesktopAcceptResult extends DesktopRiskOperationResult {
  acceptance: {
    taskId: string;
    reason: string;
    createdAt: string;
    expiresAt?: string;
  };
}

export interface DesktopVerifyResult extends DesktopRiskOperationResult {
  verification: RiskVerificationResult;
}

export interface DesktopTrustResult extends DesktopRiskOperationResult {
  entry: {
    endpoint: string;
    kind: ProviderTrustKind;
  };
}

export interface DesktopRuleIgnoreResult extends DesktopRiskOperationResult {
  entry: {
    ruleId: string;
    agent: string;
  };
}

export interface DesktopBaselinePreview extends BaselinePlan {
  fingerprint: string;
}

export interface DesktopBaselineApplyResult extends DesktopRiskOperationResult {
  apply: ApplyResult;
  restoreAvailable: true;
}

export interface DesktopBaselineRestoreResult extends DesktopRiskOperationResult {
  restore: {
    backupId: string;
    files: number;
  };
}

export interface DesktopCredentialBackupResult {
  backup: {
    backupId: string;
    files: number;
    createdAt: string;
  };
  restoreAvailable: true;
}

export interface DesktopCredentialRestorePreview {
  backupId: string;
  files: number;
  changedFiles: number;
  fingerprint: string;
}

export interface DesktopCredentialRestoreResult extends DesktopRiskOperationResult {
  restore: {
    backupId: string;
    files: number;
  };
}

interface DesktopRestoreReceipt {
  files: Array<{ configPath: string; appliedHash: string }>;
}

const desktopRestoreReceipts = new Map<string, DesktopRestoreReceipt>();

interface DesktopCredentialBackupReceipt {
  taskId: string;
  configDir: string;
}

const desktopCredentialBackupReceipts = new Map<
  string,
  DesktopCredentialBackupReceipt
>();

function restoreReceiptKey(cwd: string, backupId: string): string {
  return `${cwd}\0${backupId}`;
}

function credentialReceiptKey(cwd: string, backupId: string): string {
  return `${cwd}\0credential\0${backupId}`;
}

function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** 返回真实目录路径；不存在、不是目录或空路径都会被拒绝。 */
export function resolveDesktopProjectPath(input: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error("请选择需要扫描的项目目录。");
  }
  const projectPath = realpathSync.native(resolve(input)).normalize("NFC");
  if (!statSync(projectPath).isDirectory()) {
    throw new Error("选择的路径不是目录。");
  }
  return projectPath;
}

function projectContext(cwd: string) {
  return { ...buildContext(), cwd };
}

function machineContext(home: string) {
  return { ...buildContext(), home, cwd: home };
}

function machineSnapshotStore(home: string) {
  return new TaskSnapshotStore({
    cwd: home,
    path: defaultTaskSnapshotPath(home),
  });
}

/** 纯转换函数，便于用固定扫描夹具验证桌面与 core 的任务语义一致。 */
export function buildDesktopOverview(
  cwd: string,
  triaged: TriagedReport,
  generatedAt = new Date().toISOString(),
  trustState: ProviderTrustState = {
    configPath: resolve(cwd, ".agentguard.json"),
    entries: [],
    audit: [],
  },
  ruleIgnoreState: RuleIgnoreState = {
    configPath: resolve(cwd, ".agentguard.json"),
    entries: [],
    audit: [],
  },
  scopeKind: DesktopScopeKind = "project"
): DesktopOverview {
  const report = triaged.activeReport;
  const firstRun = buildFirstRunSummary(report, {
    acceptedTaskCount: triaged.acceptedTasks.length,
    ignoredFindingCount: triaged.ignoredFindings.length,
    platform: "darwin",
  });
  const tasks = firstRun.tasks;
  const trustCandidates = Object.fromEntries(
    [...tasks, ...triaged.acceptedTasks].flatMap((task) => {
      const candidate = providerTrustCandidateForTask(task);
      return candidate ? [[task.taskId, candidate] as const] : [];
    })
  );
  const ignoreCandidates = Object.fromEntries(
    tasks.flatMap((task) => {
      const candidates = ruleIgnoreCandidatesForTask(task);
      return candidates.length > 0 ? [[task.taskId, candidates] as const] : [];
    })
  );

  return {
    schemaVersion: DESKTOP_SCHEMA_VERSION,
    generatedAt,
    privacy: {
      localOnly: true,
      uploadsData: false,
      readOnlyScan: true,
    },
    project: {
      path: cwd,
      name: basename(cwd) || cwd,
    },
    scope: {
      kind: scopeKind,
      path: cwd,
      name: scopeKind === "machine" ? "这台 Mac" : basename(cwd) || cwd,
      projectPoliciesAvailable: scopeKind === "project",
    },
    firstRun,
    summary: firstRun.summary,
    report,
    map: firstRun.map,
    tasks,
    topTasks: firstRun.topTasks,
    acceptedTasks: triaged.acceptedTasks.flatMap((task) => {
      const record = triaged.activeAcceptances.find(
        (acceptance) => acceptance.taskId === task.taskId
      );
      return record
        ? [
            {
              task,
              reason: record.reason,
              createdAt: record.createdAt,
              ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
            },
          ]
        : [];
    }),
    ignoredFindings: triaged.ignoredFindings.map((entry) => ({
      agent: entry.agent,
      displayName: entry.displayName,
      ruleId: entry.finding.id,
      title: entry.finding.title,
      reason: entry.policy.reason,
      createdAt: entry.policy.createdAt,
      ...(entry.policy.expiresAt ? { expiresAt: entry.policy.expiresAt } : {}),
    })),
    providerTrust: {
      configPath: trustState.configPath,
      entries: trustState.entries,
      auditEventCount: trustState.audit.length,
    },
    trustCandidates,
    ignoreCandidates,
    ruleIgnores: {
      configPath: ruleIgnoreState.configPath,
      entries: ruleIgnoreState.entries,
      auditEventCount: ruleIgnoreState.audit.length,
    },
  };
}

function desktopOverview(
  cwd: string,
  triaged: TriagedReport,
  scopeKind: DesktopScopeKind = "project"
): DesktopOverview {
  if (scopeKind === "machine") {
    return buildDesktopOverview(
      cwd,
      triaged,
      new Date().toISOString(),
      { configPath: resolve(cwd, ".agentguard.json"), entries: [], audit: [] },
      { configPath: resolve(cwd, ".agentguard.json"), entries: [], audit: [] },
      scopeKind
    );
  }
  let trustState: ProviderTrustState;
  try {
    trustState = listProviderTrust(cwd);
  } catch {
    trustState = {
      configPath: resolve(cwd, ".agentguard.json"),
      entries: [],
      audit: [],
    };
  }
  let ruleIgnoreState: RuleIgnoreState;
  try {
    ruleIgnoreState = listRuleIgnores(cwd);
  } catch {
    ruleIgnoreState = {
      configPath: resolve(cwd, ".agentguard.json"),
      entries: [],
      audit: [],
    };
  }
  return buildDesktopOverview(
    cwd,
    triaged,
    new Date().toISOString(),
    trustState,
    ruleIgnoreState,
    scopeKind
  );
}

function applyProjectTriage(
  cwd: string,
  report: ScanReport,
  records: readonly ListedAcceptance[]
): TriagedReport {
  return applyAcceptances(report, records, activeRuleIgnoresSafely(cwd));
}

async function scanAndTriage(cwd: string): Promise<{
  fullReport: ScanReport;
  triaged: TriagedReport;
  fullTasks: ActionTask[];
}> {
  const fullReport = await scanAll(projectContext(cwd));
  const records = new AcceptanceStore({ cwd }).list({ activeOnly: true });
  const triaged = applyProjectTriage(cwd, fullReport, records);
  const fullTasks = buildActionTasks(buildActionPlan(fullReport));
  return { fullReport, triaged, fullTasks };
}

export async function scanDesktopProject(input: string): Promise<DesktopOverview> {
  const cwd = resolveDesktopProjectPath(input);
  const { triaged, fullTasks } = await scanAndTriage(cwd);
  new TaskSnapshotStore({ cwd }).capture(fullTasks);
  return desktopOverview(cwd, triaged);
}

/**
 * 扫描主进程固定提供的用户主目录，不读取或应用任何项目级策略。
 * homePath 不能来自 renderer；Electron 主进程必须使用 app.getPath("home") 注入。
 */
export async function scanDesktopMachine(input: string): Promise<DesktopOverview> {
  const cwd = resolveDesktopProjectPath(input);
  const fullReport = await scanAll(machineContext(cwd));
  const fullTasks = buildActionTasks(buildActionPlan(fullReport));
  machineSnapshotStore(cwd).capture(fullTasks);
  return desktopOverview(cwd, applyAcceptances(fullReport, [], []), "machine");
}

function assertTaskId(taskId: string): void {
  if (!/^task-[A-Za-z0-9_-]{6,128}$/.test(taskId)) {
    throw new Error("无效的任务 ID。");
  }
}

function normalizeReason(reason: string): string {
  if (typeof reason !== "string") throw new Error("接受原因不能为空。");
  const normalized = reason.trim();
  if (!normalized) throw new Error("接受原因不能为空。");
  if (normalized.length > 500) throw new Error("接受原因不能超过 500 个字符。");
  return normalized;
}

export async function acceptDesktopRisk(input: {
  projectPath: string;
  taskId: string;
  reason: string;
  expiresAt?: string;
}): Promise<DesktopAcceptResult> {
  const cwd = resolveDesktopProjectPath(input.projectPath);
  assertTaskId(input.taskId);
  const reason = normalizeReason(input.reason);
  const { fullReport, fullTasks } = await scanAndTriage(cwd);
  const task = fullTasks.find((candidate) => candidate.taskId === input.taskId);
  if (!task) throw new Error("当前扫描中已找不到该任务，请刷新后重试。");

  const missingAcceptanceRules = taskMissingAcceptanceRules(task);
  if (missingAcceptanceRules.length > 0) {
    throw new Error(
      `当前任务不能接受：${missingAcceptanceRules.join("、")} 没有已定义的安全接受条件。`
    );
  }
  if (task.priority === "P0" && !input.expiresAt) {
    throw new Error("P0 任务只能限时接受，请设置到期日期。");
  }

  const snapshots = new TaskSnapshotStore({ cwd });
  snapshots.capture(fullTasks);
  const store = new AcceptanceStore({ cwd });
  const record = store.accept(task, reason, {
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  });
  const triaged = applyProjectTriage(
    cwd,
    fullReport,
    store.list({ activeOnly: true })
  );
  return {
    acceptance: {
      taskId: record.taskId,
      reason: record.reason,
      createdAt: record.createdAt,
      ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
    },
    overview: desktopOverview(cwd, triaged),
  };
}

export async function verifyDesktopRisk(input: {
  projectPath: string;
  taskId: string;
  scopeKind?: DesktopScopeKind;
}): Promise<DesktopVerifyResult> {
  const cwd = resolveDesktopProjectPath(input.projectPath);
  assertTaskId(input.taskId);
  if (input.scopeKind === "machine") {
    const fullReport = await scanAll(machineContext(cwd));
    const fullTasks = buildActionTasks(buildActionPlan(fullReport));
    const snapshots = machineSnapshotStore(cwd);
    const previous = snapshots.get(input.taskId);
    const verification = verifyRiskTask({
      taskId: input.taskId,
      currentTasks: fullTasks,
      ...(previous ? { previous } : {}),
    });
    snapshots.capture(fullTasks);
    return {
      verification,
      overview: desktopOverview(
        cwd,
        applyAcceptances(fullReport, [], []),
        "machine"
      ),
    };
  }
  const { fullReport, fullTasks } = await scanAndTriage(cwd);
  const snapshots = new TaskSnapshotStore({ cwd });
  const store = new AcceptanceStore({ cwd });
  const previous = snapshots.get(input.taskId);
  const acceptance = store
    .list()
    .find((record) => record.taskId === input.taskId);
  const verification = verifyRiskTask({
    taskId: input.taskId,
    currentTasks: fullTasks,
    ...(previous ? { previous } : {}),
    ...(acceptance ? { acceptance } : {}),
  });
  snapshots.capture(fullTasks);
  const triaged = applyProjectTriage(
    cwd,
    fullReport,
    store.list({ activeOnly: true })
  );
  return {
    verification,
    overview: desktopOverview(cwd, triaged),
  };
}

export async function revokeDesktopRisk(input: {
  projectPath: string;
  taskId: string;
}): Promise<DesktopRiskOperationResult> {
  const cwd = resolveDesktopProjectPath(input.projectPath);
  assertTaskId(input.taskId);
  const store = new AcceptanceStore({ cwd });
  store.revoke(input.taskId);
  const { fullReport, fullTasks } = await scanAndTriage(cwd);
  new TaskSnapshotStore({ cwd }).capture(fullTasks);
  const triaged = applyProjectTriage(
    cwd,
    fullReport,
    store.list({ activeOnly: true })
  );
  return { overview: desktopOverview(cwd, triaged) };
}

export async function trustDesktopProvider(input: {
  projectPath: string;
  taskId: string;
  kind: ProviderTrustKind;
  reason: string;
}): Promise<DesktopTrustResult> {
  const cwd = resolveDesktopProjectPath(input.projectPath);
  assertTaskId(input.taskId);
  if (input.kind !== "trusted" && input.kind !== "internal") {
    throw new Error("信任类型仅支持 trusted 或 internal。");
  }
  const reason = normalizeReason(input.reason);
  const { fullTasks } = await scanAndTriage(cwd);
  const task = fullTasks.find((candidate) => candidate.taskId === input.taskId);
  if (!task) throw new Error("当前扫描中已找不到该任务，请刷新后重试。");
  const candidate = providerTrustCandidateForTask(task);
  if (!candidate) {
    throw new Error("该任务不是可登记的未知 Provider 端点，不能使用信任操作。");
  }

  addProviderTrust({
    cwd,
    endpoint: candidate.endpoint,
    kind: input.kind,
    reason,
  });
  const { triaged, fullTasks: nextTasks } = await scanAndTriage(cwd);
  new TaskSnapshotStore({ cwd }).capture(nextTasks);
  return {
    entry: { endpoint: candidate.endpoint, kind: input.kind },
    overview: desktopOverview(cwd, triaged),
  };
}

export async function removeDesktopProviderTrust(input: {
  projectPath: string;
  endpoint: string;
  kind: ProviderTrustKind;
  reason: string;
}): Promise<DesktopTrustResult> {
  const cwd = resolveDesktopProjectPath(input.projectPath);
  const reason = normalizeReason(input.reason);
  const state = removeProviderTrust({
    cwd,
    endpoint: input.endpoint,
    kind: input.kind,
    reason,
  });
  const event = state.audit.at(-1);
  if (!event) throw new Error("信任审计写入失败。");
  const { triaged, fullTasks } = await scanAndTriage(cwd);
  new TaskSnapshotStore({ cwd }).capture(fullTasks);
  return {
    entry: { endpoint: event.endpoint, kind: event.kind },
    overview: desktopOverview(cwd, triaged),
  };
}

export async function ignoreDesktopRule(input: {
  projectPath: string;
  taskId: string;
  ruleId: string;
  reason: string;
  expiresAt?: string;
}): Promise<DesktopRuleIgnoreResult> {
  const cwd = resolveDesktopProjectPath(input.projectPath);
  assertTaskId(input.taskId);
  const reason = normalizeReason(input.reason);
  const { triaged } = await scanAndTriage(cwd);
  const task = buildActionTasks(buildActionPlan(triaged.activeReport)).find(
    (candidate) => candidate.taskId === input.taskId
  );
  if (!task) throw new Error("当前待办中已找不到该任务，请刷新后重试。");
  const candidate = ruleIgnoreCandidatesForTask(task).find(
    (entry) => entry.ruleId === input.ruleId
  );
  if (!candidate) {
    throw new Error("该规则不是当前任务中允许项目级忽略的低优先级规则。");
  }
  addRuleIgnore({
    cwd,
    ruleId: candidate.ruleId,
    agent: candidate.agent,
    reason,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  });
  const { triaged: next, fullTasks } = await scanAndTriage(cwd);
  new TaskSnapshotStore({ cwd }).capture(fullTasks);
  return {
    entry: { ruleId: candidate.ruleId, agent: candidate.agent },
    overview: desktopOverview(cwd, next),
  };
}

export async function removeDesktopRuleIgnore(input: {
  projectPath: string;
  ruleId: string;
  agent: string;
  reason: string;
}): Promise<DesktopRuleIgnoreResult> {
  const cwd = resolveDesktopProjectPath(input.projectPath);
  const reason = normalizeReason(input.reason);
  removeRuleIgnore({
    cwd,
    ruleId: input.ruleId,
    agent: input.agent,
    reason,
  });
  const { triaged, fullTasks } = await scanAndTriage(cwd);
  new TaskSnapshotStore({ cwd }).capture(fullTasks);
  return {
    entry: { ruleId: input.ruleId, agent: input.agent },
    overview: desktopOverview(cwd, triaged),
  };
}

function normalizedScopeKind(value?: DesktopScopeKind): DesktopScopeKind {
  if (value === undefined || value === "project") return "project";
  if (value === "machine") return "machine";
  throw new Error("未知的 Desktop 扫描范围。");
}

async function scanDesktopScope(
  cwd: string,
  scopeKind: DesktopScopeKind
): Promise<DesktopOverview> {
  return scopeKind === "machine"
    ? scanDesktopMachine(cwd)
    : scanDesktopProject(cwd);
}

function credentialContext(cwd: string, scopeKind: DesktopScopeKind) {
  return scopeKind === "machine" ? machineContext(cwd) : projectContext(cwd);
}

export async function backupDesktopClaudeRemediation(input: {
  projectPath: string;
  taskId: string;
  scopeKind?: DesktopScopeKind;
}): Promise<DesktopCredentialBackupResult> {
  const cwd = resolveDesktopProjectPath(input.projectPath);
  assertTaskId(input.taskId);
  const scopeKind = normalizedScopeKind(input.scopeKind);
  const overview = await scanDesktopScope(cwd, scopeKind);
  const task = overview.tasks.find((candidate) => candidate.taskId === input.taskId);

  const ctx = credentialContext(cwd, scopeKind);
  const discovery = await claudeCodeAdapter.discover(ctx);
  if (!discovery.configFound || !discovery.configPath) {
    throw new Error("当前扫描中未发现 Claude Code 配置。");
  }
  const backup = createClaudeCredentialBackup({
    cwd,
    task,
    taskId: input.taskId,
    configDir: discovery.configPath,
  });
  desktopCredentialBackupReceipts.set(
    credentialReceiptKey(cwd, backup.backupId),
    { taskId: input.taskId, configDir: discovery.configPath }
  );
  return {
    backup: {
      backupId: backup.backupId,
      files: backup.files,
      createdAt: backup.createdAt,
    },
    restoreAvailable: true,
  };
}

function desktopCredentialReceipt(cwd: string, backupId: string) {
  const receipt = desktopCredentialBackupReceipts.get(
    credentialReceiptKey(cwd, backupId)
  );
  if (!receipt) {
    throw new Error("桌面端只能恢复本次应用会话创建的 Claude 配置备份。");
  }
  return receipt;
}

export function previewDesktopClaudeRestore(input: {
  projectPath: string;
  backupId: string;
}): DesktopCredentialRestorePreview {
  const cwd = resolveDesktopProjectPath(input.projectPath);
  const receipt = desktopCredentialReceipt(cwd, input.backupId);
  const preview = previewClaudeCredentialRestore({
    cwd,
    backupId: input.backupId,
    configDir: receipt.configDir,
  });
  if (preview.taskId !== receipt.taskId) {
    throw new Error("Claude 配置备份 manifest 完整性校验失败。");
  }
  return preview;
}

export async function restoreDesktopClaudeBackup(input: {
  projectPath: string;
  backupId: string;
  expectedFingerprint: string;
  scopeKind?: DesktopScopeKind;
}): Promise<DesktopCredentialRestoreResult> {
  const cwd = resolveDesktopProjectPath(input.projectPath);
  if (!/^[a-f0-9]{64}$/.test(input.expectedFingerprint)) {
    throw new Error("Claude 配置恢复预览指纹无效，请重新预览。");
  }
  const scopeKind = normalizedScopeKind(input.scopeKind);
  const receipt = desktopCredentialReceipt(cwd, input.backupId);
  const restored = restoreClaudeCredentialBackup({
    cwd,
    backupId: input.backupId,
    configDir: receipt.configDir,
    expectedFingerprint: input.expectedFingerprint,
  });
  if (restored.taskId !== receipt.taskId) {
    throw new Error("Claude 配置备份 manifest 完整性校验失败。");
  }
  desktopCredentialBackupReceipts.delete(
    credentialReceiptKey(cwd, input.backupId)
  );
  return {
    restore: {
      backupId: input.backupId,
      files: restored.files,
    },
    overview: await scanDesktopScope(cwd, scopeKind),
  };
}

export async function previewDesktopBaseline(
  input: string,
  profile: BaselineProfile
): Promise<DesktopBaselinePreview> {
  if (profile !== "safe" && profile !== "balanced") {
    throw new Error("未知 baseline profile。");
  }
  const cwd = resolveDesktopProjectPath(input);
  const plan = await buildBaselinePlan(profile, projectContext(cwd));
  return { ...plan, fingerprint: baselinePlanFingerprint(plan) };
}

export async function applyDesktopBaseline(input: {
  projectPath: string;
  profile: BaselineProfile;
  expectedPlanFingerprint: string;
  scopeKind?: DesktopScopeKind;
}): Promise<DesktopBaselineApplyResult> {
  const cwd = resolveDesktopProjectPath(input.projectPath);
  if (input.profile !== "safe" && input.profile !== "balanced") {
    throw new Error("未知 baseline profile。");
  }
  if (!/^[a-f0-9]{64}$/.test(input.expectedPlanFingerprint)) {
    throw new Error("baseline 预览指纹无效，请重新生成预览。");
  }
  const result = await applyBaseline(input.profile, projectContext(cwd), {
    expectedPlanFingerprint: input.expectedPlanFingerprint,
  });
  if (!result.backupId || result.files.length === 0) {
    throw new Error("当前没有可应用的 baseline 变更，请重新生成预览。");
  }
  desktopRestoreReceipts.set(restoreReceiptKey(cwd, result.backupId), {
    files: result.files.map((file) => ({
      configPath: file.configPath,
      appliedHash: fileHash(file.configPath),
    })),
  });
  const overview = input.scopeKind === "machine"
    ? await scanDesktopMachine(cwd)
    : await scanDesktopProject(cwd);
  return {
    apply: result,
    restoreAvailable: true,
    overview,
  };
}

export async function restoreDesktopBaseline(input: {
  projectPath: string;
  backupId: string;
  scopeKind?: DesktopScopeKind;
}): Promise<DesktopBaselineRestoreResult> {
  const cwd = resolveDesktopProjectPath(input.projectPath);
  const key = restoreReceiptKey(cwd, input.backupId);
  const receipt = desktopRestoreReceipts.get(key);
  if (!receipt) {
    throw new Error("桌面端只能恢复本次应用会话创建的备份；其它备份请使用 CLI restore。");
  }
  for (const file of receipt.files) {
    let currentHash: string;
    try {
      currentHash = fileHash(file.configPath);
    } catch {
      throw new Error(`应用后配置已不存在，已停止恢复：${file.configPath}`);
    }
    if (currentHash !== file.appliedHash) {
      throw new Error(
        `应用后配置又发生了变化，恢复会覆盖新修改，已安全停止：${file.configPath}`
      );
    }
  }
  const restored = restoreBaselineBackup(cwd, input.backupId);
  desktopRestoreReceipts.delete(key);
  const overview = input.scopeKind === "machine"
    ? await scanDesktopMachine(cwd)
    : await scanDesktopProject(cwd);
  return {
    restore: restored,
    overview,
  };
}

function validateReportOutput(outputPath: string, format: DesktopReportFormat): string {
  if (typeof outputPath !== "string" || !isAbsolute(outputPath)) {
    throw new Error("报告输出路径必须是绝对路径。");
  }
  const normalized = resolve(outputPath);
  const expectedExtension = format === "html" ? ".html" : ".json";
  if (extname(normalized).toLowerCase() !== expectedExtension) {
    throw new Error(`报告文件必须使用 ${expectedExtension} 扩展名。`);
  }
  if (!statSync(dirname(normalized)).isDirectory()) {
    throw new Error("报告输出目录不存在。");
  }
  return normalized;
}

export async function exportDesktopReport(input: {
  projectPath: string;
  outputPath: string;
  format: DesktopReportFormat;
  scopeKind?: DesktopScopeKind;
}): Promise<DesktopReportResult> {
  if (input.format !== "html" && input.format !== "json") {
    throw new Error("仅支持导出 HTML 或 JSON 报告。");
  }
  const cwd = resolveDesktopProjectPath(input.projectPath);
  const outputPath = validateReportOutput(input.outputPath, input.format);
  const scan = input.scopeKind === "machine"
    ? await (async () => {
        const fullReport = await scanAll(machineContext(cwd));
        const fullTasks = buildActionTasks(buildActionPlan(fullReport));
        machineSnapshotStore(cwd).capture(fullTasks);
        return {
          fullReport,
          triaged: applyAcceptances(fullReport, [], []),
        };
      })()
    : await scanAndTriage(cwd);
  const { fullReport, triaged } = scan;

  const content =
    input.format === "html"
      ? renderHtmlReport(fullReport, {
          acceptances: triaged.activeAcceptances,
          ruleIgnores: triaged.activeRuleIgnores,
        })
      : JSON.stringify(
          withOutputContract("report.json", {
            ...triaged.activeReport,
            acceptedTaskCount: triaged.acceptedTasks.length,
            ignoredFindingCount: triaged.ignoredFindings.length,
          }),
          null,
          2
        );

  writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
  chmodSync(outputPath, 0o600);
  return {
    path: outputPath,
    format: input.format,
    findingCount:
      triaged.activeReport.allFindings.length +
      (triaged.activeReport.correlations?.length ?? 0),
    acceptedTaskCount: triaged.acceptedTasks.length,
    ignoredFindingCount: triaged.ignoredFindings.length,
  };
}

/** 只用于测试或嵌入方显式注入接受记录，不会被 Electron IPC 暴露。 */
export function triageDesktopFixture(
  report: ScanReport,
  records: readonly ListedAcceptance[] = [],
  ruleIgnores: readonly ListedRuleIgnore[] = []
): TriagedReport {
  return applyAcceptances(report, records, ruleIgnores);
}
