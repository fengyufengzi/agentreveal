import type {
  ActionPriority,
  AgentId,
  RiskLevel,
} from "../../adapters/types.js";
import type { ProviderType } from "../../rules/provider.js";
import type { RuleId } from "../../rules/ids.js";

export type EffectiveAgentId = Exclude<AgentId, "workspace">;

export const EFFECTIVE_CONFIDENCE = [
  "confirmed",
  "inferred",
  "incomplete",
] as const;
export type EffectiveConfidence = (typeof EFFECTIVE_CONFIDENCE)[number];

export const CONFIG_SOURCE_KINDS = [
  "managed",
  "system",
  "cli",
  "profile",
  "project-local",
  "project-shared",
  "user",
  "environment",
  "proxy",
] as const;
export type ConfigSourceKind = (typeof CONFIG_SOURCE_KINDS)[number];

export const CONFIG_SOURCE_SCOPES = [
  "machine",
  "user",
  "project",
  "session",
] as const;
export type ConfigSourceScope = (typeof CONFIG_SOURCE_SCOPES)[number];

export const CONFIG_SOURCE_STATUSES = [
  "active",
  "overridden",
  "conflicting",
  "unreadable",
] as const;
export type ConfigSourceStatus = (typeof CONFIG_SOURCE_STATUSES)[number];

export interface EffectiveConfigSource {
  kind: ConfigSourceKind;
  scope: ConfigSourceScope;
  status: ConfigSourceStatus;
  /** 本机运行时可展示；持久化快照只能保存 keyed HMAC。 */
  path?: string;
  /** 只列字段名，不包含配置值。 */
  fields: string[];
}

export const AUTH_METHODS = [
  "cloud-provider",
  "oauth",
  "api-key",
  "keychain-helper",
  "environment",
  "config-file",
  "proxy-injected",
  "none",
  "unknown",
] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];

export const AUTH_STATUSES = [
  "active",
  "overridden",
  "conflicting",
  "missing",
  "unknown",
] as const;
export type AuthStatus = (typeof AUTH_STATUSES)[number];

export interface EffectiveAuthConflict {
  /** 稳定的非敏感冲突代码，不使用动态错误文本。 */
  code: string;
  sourceKinds: ConfigSourceKind[];
}

export interface EffectiveAuthPosture {
  method: AuthMethod;
  sourceKind?: ConfigSourceKind;
  status: AuthStatus;
  conflicts: EffectiveAuthConflict[];
}

export const PERMISSION_CAPABILITIES = [
  "filesystem-read",
  "filesystem-write",
  "outside-project-write",
  "command-execute",
  "network-access",
  "mcp-call",
] as const;
export type PermissionCapability = (typeof PERMISSION_CAPABILITIES)[number];

export const PERMISSION_DECISIONS = [
  "allow",
  "ask",
  "deny",
  "unknown",
] as const;
export type PermissionDecision = (typeof PERMISSION_DECISIONS)[number];

export const PERMISSION_SCOPES = [
  "project",
  "outside-project",
  "global",
  "custom",
  "unknown",
] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

export interface EffectivePermission {
  capability: PermissionCapability;
  decision: PermissionDecision;
  scope: PermissionScope;
  sourceKind?: ConfigSourceKind;
}

export const INTEGRATION_KINDS = ["mcp", "skill", "hook"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export interface EffectiveIntegration {
  kind: IntegrationKind;
  /** 本机展示名、命令或 URL；持久化时只能保存 keyed HMAC。 */
  identity: string;
  enabled: boolean;
  version?: string;
  sourcePath?: string;
}

export const PROXY_KINDS = [
  "none",
  "cc-switch",
  "system",
  "custom",
  "unknown",
] as const;
export type ProxyKind = (typeof PROXY_KINDS)[number];

export interface EffectiveRoute {
  providerClass?: ProviderType;
  model?: string;
  proxyKind: ProxyKind;
  /** 仅用于本机当前结果和用户主动导出的报告。 */
  effectiveEndpoint?: string;
  /** 仅用于本机当前结果和用户主动导出的报告。 */
  realUpstream?: string;
}

/**
 * 运行时有效配置。它可以包含完成本机解释所需的路径和规范化端点，
 * 但不能直接序列化为 DriftSnapshot。
 */
export interface EffectiveAgentState {
  agentId: EffectiveAgentId;
  displayName: string;
  detectedVersion?: string;
  confidence: EffectiveConfidence;
  configSources: EffectiveConfigSource[];
  route: EffectiveRoute;
  auth: EffectiveAuthPosture;
  permissions: EffectivePermission[];
  integrations: EffectiveIntegration[];
  /** 只保留规则 ID；finding evidence 仍留在扫描结果中。 */
  findingIds: RuleId[];
  /** 运行时关联；可信快照不会保存 taskId。 */
  taskIds: string[];
}

export type HmacIdentity = `hmac-sha256:${string}`;

export interface ConfigSourceSnapshot {
  kind: ConfigSourceKind;
  scope: ConfigSourceScope;
  status: ConfigSourceStatus;
  fieldNames: string[];
  pathIdentity?: HmacIdentity;
}

export interface RouteSnapshot {
  providerClass?: ProviderType;
  proxyKind: ProxyKind;
  modelIdentity?: HmacIdentity;
  effectiveEndpointIdentity?: HmacIdentity;
  realUpstreamIdentity?: HmacIdentity;
}

export interface AuthSnapshot {
  method: AuthMethod;
  sourceKind?: ConfigSourceKind;
  status: AuthStatus;
  conflictCodes: string[];
}

export interface PermissionSnapshot {
  capability: PermissionCapability;
  decision: PermissionDecision;
  scope: PermissionScope;
  sourceKind?: ConfigSourceKind;
}

export interface IntegrationSnapshot {
  kind: IntegrationKind;
  identity: HmacIdentity;
  enabled: boolean;
  versionIdentity?: HmacIdentity;
  sourcePathIdentity?: HmacIdentity;
}

export interface DriftAgentSnapshot {
  agentId: EffectiveAgentId;
  detectedVersion?: string;
  confidence: EffectiveConfidence;
  configSources: ConfigSourceSnapshot[];
  route: RouteSnapshot;
  auth: AuthSnapshot;
  permissions: PermissionSnapshot[];
  integrations: IntegrationSnapshot[];
  ruleIds: RuleId[];
}

export const DRIFT_POLICY_KINDS = ["acceptance", "ignore"] as const;
export type DriftPolicyKind = (typeof DRIFT_POLICY_KINDS)[number];

export const DRIFT_POLICY_STATUSES = ["active", "expired"] as const;
export type DriftPolicyStatus = (typeof DRIFT_POLICY_STATUSES)[number];

/**
 * 运行时策略观察。subject 只用于生成本机 keyed HMAC，不能写入快照。
 */
export interface DriftPolicyState {
  kind: DriftPolicyKind;
  agentId: AgentId;
  subject: string;
  status: DriftPolicyStatus;
  ruleIds: RuleId[];
  priority: ActionPriority;
  severity: RiskLevel;
}

export interface DriftPolicySnapshot {
  kind: DriftPolicyKind;
  agentId: AgentId;
  subjectIdentity: HmacIdentity;
  status: DriftPolicyStatus;
  ruleIds: RuleId[];
  priority: ActionPriority;
  severity: RiskLevel;
}

export interface DriftSnapshot {
  schemaVersion: 1;
  capturedAt: string;
  agents: DriftAgentSnapshot[];
  /** 可选以兼容 E0 早期快照；新快照始终写入。 */
  policies?: DriftPolicySnapshot[];
}

export const DRIFT_EVENT_KINDS = [
  "agent-added",
  "agent-removed",
  "agent-version-changed",
  "config-source-changed",
  "provider-route-changed",
  "auth-source-changed",
  "permission-changed",
  "integration-added",
  "integration-removed",
  "integration-changed",
  "risk-added",
  "risk-resolved",
  "risk-reappeared",
  "acceptance-expired",
  "ignore-expired",
] as const;
export type DriftEventKind = (typeof DRIFT_EVENT_KINDS)[number];

export const DRIFT_CHANGE_KINDS = [
  "added",
  "removed",
  "changed",
  "reappeared",
] as const;
export type DriftChangeKind = (typeof DRIFT_CHANGE_KINDS)[number];

export interface DriftEvent {
  eventId: string;
  agentId: AgentId;
  kind: DriftEventKind;
  change: DriftChangeKind;
  priority: ActionPriority;
  severity: RiskLevel;
  currentSummary: string;
  previousCategory?: string;
  action: string[];
  verification: string[];
}

export const DRIFT_STATUSES = [
  "no-baseline",
  "unchanged",
  "changed",
  "unavailable",
] as const;
export type DriftStatus = (typeof DRIFT_STATUSES)[number];

export interface DriftComparison {
  status: DriftStatus;
  baselineCapturedAt?: string;
  currentCapturedAt: string;
  events: DriftEvent[];
  activeEventCount: number;
  resolvedEventCount: number;
  errorCode?: "BASELINE_UNAVAILABLE";
}

export const BASELINE_MUTATIONS = ["create", "replace", "remove"] as const;
export type BaselineMutation = (typeof BASELINE_MUTATIONS)[number];

export interface BaselinePreview {
  mutation: Extract<BaselineMutation, "create" | "replace">;
  currentFingerprint: string;
  storageRevision: string;
  previousCapturedAt?: string;
  agentCount: number;
  savedCategories: string[];
  excludesSensitiveContent: true;
}

export interface BaselineMutationResult {
  mutation: BaselineMutation;
  changed: boolean;
  capturedAt?: string;
  agentCount: number;
  storageRevision: string;
}

/**
 * CC Switch 等本地配置管理器对消费 Agent 的瞬时路由观察。
 * 只在一次有效状态计算中使用，不持久化为独立审计数据。
 */
export interface ManagedProxyRouteObservation {
  consumerAgentId: Extract<EffectiveAgentId, "claude-code" | "codex">;
  proxyKind: Extract<ProxyKind, "cc-switch">;
  localEndpoint: string;
  realUpstream?: string;
  providerClass?: ProviderType;
}

export interface EffectivePostureInspection {
  state: EffectiveAgentState;
  managedProxyRoutes?: ManagedProxyRouteObservation[];
}
