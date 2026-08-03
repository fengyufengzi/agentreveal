import type { ListedAcceptance } from "../core/acceptance/index.js";
import { type ActionTask } from "../core/action/index.js";
import { type BaselinePlan, type BaselineProfile } from "../core/baseline/index.js";
import { type ApplyResult } from "../core/apply/index.js";
import { type ClaudePostMigrationVerification, type ClaudeCredentialMigrationPreview } from "../core/credential-migration/index.js";
import type { RemediationTransactionSummary } from "../core/remediation-transaction/index.js";
import { type ProviderTrustKind, type ProviderTrustState } from "../core/config/trust.js";
import { type ListedRuleIgnore, type RuleIgnoreState } from "../core/config/rule-ignore.js";
import { type FirstRunSummaryV1 } from "../core/first-run/index.js";
import type { ConfigMap } from "../core/map/index.js";
import { type ScanReport } from "../core/scan/index.js";
import { type BaselineMutationResult, type BaselinePreview, type DriftComparison, type EffectiveAgentState, type PostureReport } from "../core/posture/index.js";
import type { DiscoveryContext } from "../adapters/types.js";
import { type TriagedReport } from "../core/triage/index.js";
import { type RiskVerificationResult } from "../core/verification/index.js";
export declare const DESKTOP_SCHEMA_VERSION: 1;
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
    posture?: PostureReport;
    drift?: DriftComparison;
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
    trustCandidates: Record<string, {
        endpoint: string;
    }>;
    /** 候选由 core 从当前活动任务推导；renderer 只能回传 taskId + ruleId。 */
    ignoreCandidates: Record<string, Array<{
        ruleId: string;
        agent: string;
    }>>;
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
    transaction: RemediationTransactionSummary;
}
export interface DesktopBaselineRestoreResult extends DesktopRiskOperationResult {
    restore: {
        backupId: string;
        files: number;
    };
    transaction: RemediationTransactionSummary;
}
export interface DesktopCredentialBackupResult {
    backup: {
        backupId: string;
        files: number;
        createdAt: string;
    };
    migration: ClaudeCredentialMigrationPreview;
    verification: ClaudePostMigrationVerification;
    retention: {
        policy: "until-user-confirmed-cleanup";
        autoDelete: false;
        secureErase: false;
    };
    restoreAvailable: true;
    transaction: RemediationTransactionSummary;
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
    transaction: RemediationTransactionSummary;
}
export interface DesktopCredentialMigrationResult extends DesktopRiskOperationResult {
    transaction: RemediationTransactionSummary & {
        taskId: string;
        phase: "verified" | "rolled-back";
        backupId: string;
        plaintextFieldsRemoved: number;
        apiKeyHelperConfigured: boolean;
    };
    verification: ClaudePostMigrationVerification;
}
export interface DesktopCredentialBackupCleanupResult extends DesktopRiskOperationResult {
    cleanup: {
        backupId: string;
        files: number;
    };
    transaction: RemediationTransactionSummary & {
        taskId: string;
        phase: "backup-cleaned";
    };
}
export interface DesktopPostureBaselinePreview extends BaselinePreview {
    hasBaseline: boolean;
}
export interface DesktopPostureMutationResult extends DesktopRiskOperationResult {
    mutation: BaselineMutationResult;
}
/** 返回真实目录路径；不存在、不是目录或空路径都会被拒绝。 */
export declare function resolveDesktopProjectPath(input: string): string;
/**
 * E1 的 Desktop typed service 入口；E2 才把结果加入 renderer schema。
 * 保持直接委托 core，防止桌面端复制配置优先级。
 */
export declare function inspectDesktopEffectiveStates(ctx: DiscoveryContext): Promise<EffectiveAgentState[]>;
/** 纯转换函数，便于用固定扫描夹具验证桌面与 core 的任务语义一致。 */
export declare function buildDesktopOverview(cwd: string, triaged: TriagedReport, generatedAt?: string, trustState?: ProviderTrustState, ruleIgnoreState?: RuleIgnoreState, scopeKind?: DesktopScopeKind, posture?: PostureReport, drift?: DriftComparison): DesktopOverview;
export declare function scanDesktopProject(input: string): Promise<DesktopOverview>;
/**
 * 扫描主进程固定提供的用户主目录，不读取或应用任何项目级策略。
 * homePath 不能来自 renderer；Electron 主进程必须使用 app.getPath("home") 注入。
 */
export declare function scanDesktopMachine(input: string): Promise<DesktopOverview>;
export declare function acceptDesktopRisk(input: {
    projectPath: string;
    taskId: string;
    reason: string;
    expiresAt?: string;
}): Promise<DesktopAcceptResult>;
export declare function verifyDesktopRisk(input: {
    projectPath: string;
    taskId: string;
    scopeKind?: DesktopScopeKind;
}): Promise<DesktopVerifyResult>;
export declare function revokeDesktopRisk(input: {
    projectPath: string;
    taskId: string;
}): Promise<DesktopRiskOperationResult>;
export declare function trustDesktopProvider(input: {
    projectPath: string;
    taskId: string;
    kind: ProviderTrustKind;
    reason: string;
}): Promise<DesktopTrustResult>;
export declare function removeDesktopProviderTrust(input: {
    projectPath: string;
    endpoint: string;
    kind: ProviderTrustKind;
    reason: string;
}): Promise<DesktopTrustResult>;
export declare function ignoreDesktopRule(input: {
    projectPath: string;
    taskId: string;
    ruleId: string;
    reason: string;
    expiresAt?: string;
}): Promise<DesktopRuleIgnoreResult>;
export declare function removeDesktopRuleIgnore(input: {
    projectPath: string;
    ruleId: string;
    agent: string;
    reason: string;
}): Promise<DesktopRuleIgnoreResult>;
export declare function previewDesktopPostureBaseline(input: {
    projectPath: string;
    scopeKind?: DesktopScopeKind;
}): Promise<DesktopPostureBaselinePreview>;
export declare function saveDesktopPostureBaseline(input: {
    projectPath: string;
    scopeKind?: DesktopScopeKind;
    expectedCurrentFingerprint: string;
    expectedStorageRevision: string;
    replace?: boolean;
}): Promise<DesktopPostureMutationResult>;
export declare function removeDesktopPostureBaseline(input: {
    projectPath: string;
    scopeKind?: DesktopScopeKind;
    expectedStorageRevision: string;
}): Promise<DesktopPostureMutationResult>;
export declare function verifyDesktopPosture(input: {
    projectPath: string;
    scopeKind?: DesktopScopeKind;
}): Promise<DesktopOverview>;
export declare function backupDesktopClaudeRemediation(input: {
    projectPath: string;
    taskId: string;
    scopeKind?: DesktopScopeKind;
}): Promise<DesktopCredentialBackupResult>;
export declare function previewDesktopClaudeRestore(input: {
    projectPath: string;
    backupId: string;
}): DesktopCredentialRestorePreview;
export declare function restoreDesktopClaudeBackup(input: {
    projectPath: string;
    backupId: string;
    expectedFingerprint: string;
    scopeKind?: DesktopScopeKind;
}): Promise<DesktopCredentialRestoreResult>;
export declare function applyDesktopClaudeMigration(input: {
    projectPath: string;
    taskId: string;
    backupId: string;
    expectedFingerprint: string;
    scopeKind?: DesktopScopeKind;
}): Promise<DesktopCredentialMigrationResult>;
export declare function cleanupDesktopClaudeCredentialBackup(input: {
    projectPath: string;
    taskId: string;
    backupId: string;
    scopeKind?: DesktopScopeKind;
}): Promise<DesktopCredentialBackupCleanupResult>;
export declare function previewDesktopBaseline(input: string, profile: BaselineProfile): Promise<DesktopBaselinePreview>;
export declare function applyDesktopBaseline(input: {
    projectPath: string;
    profile: BaselineProfile;
    expectedPlanFingerprint: string;
    scopeKind?: DesktopScopeKind;
}): Promise<DesktopBaselineApplyResult>;
export declare function restoreDesktopBaseline(input: {
    projectPath: string;
    backupId: string;
    scopeKind?: DesktopScopeKind;
}): Promise<DesktopBaselineRestoreResult>;
export declare function exportDesktopReport(input: {
    projectPath: string;
    outputPath: string;
    format: DesktopReportFormat;
    scopeKind?: DesktopScopeKind;
}): Promise<DesktopReportResult>;
/** 只用于测试或嵌入方显式注入接受记录，不会被 Electron IPC 暴露。 */
export declare function triageDesktopFixture(report: ScanReport, records?: readonly ListedAcceptance[], ruleIgnores?: readonly ListedRuleIgnore[]): TriagedReport;
