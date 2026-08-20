/**
 * AgentReveal 核心类型与 Adapter 接口
 *
 * 设计原则（对应 PRD / 一页版）：
 * - adapter 架构：新增 Agent 支持只需新增一个 adapter，不改核心引擎。
 * - 默认只读：discovery 阶段只探测路径存在性，不读取密钥内容。
 * - 字段命名对齐 PRD §10 数据结构设计。
 */
import type { ProviderTrustPolicy } from "../rules/provider.js";
import type { EffectivePostureInspection } from "../core/posture/types.js";

/** 风险等级（PRD §8）。 */
export type RiskLevel = "critical" | "high" | "medium" | "low" | "info";

/** 用户面对一条 finding 时应该采取的处置路径。 */
export type FindingDisposition = "fix" | "review" | "cleanup" | "observe";

/** 行动优先级；与潜在影响 severity 分离。 */
export type ActionPriority = "P0" | "P1" | "P2" | "P3";

/** 规则基于当前证据作出处置判断的可信度。 */
export type FindingConfidence = "high" | "medium" | "low";

/** AgentReveal 对该 finding 能提供的修复能力。 */
export type FindingFixMode = "baseline" | "guided" | "manual" | "none";

/** baseline 对风险是完整解决还是仅降低影响。 */
export type BaselineEffect = "resolve" | "mitigate";

/** 规则处置矩阵附加到每条 finding 的行动信息。 */
export interface FindingAction {
  disposition: FindingDisposition;
  priority: ActionPriority;
  confidence: FindingConfidence;
  fixMode: FindingFixMode;
  rationale: string;
  nextSteps: string[];
  verification: string[];
  acceptWhen?: string;
  /** baseline 不同 profile 对该风险的实际效果。 */
  baselineProfiles?: Partial<Record<"safe" | "balanced", BaselineEffect>>;
  /** 用于报告提示同一根因；不替代原始 finding。 */
  group: {
    family: string;
    /** 从 evidence 中选取实例身份，避免把不同端点或 MCP 错误合并。 */
    evidenceKeys: string[];
  };
}

/** 本项目 P0/P1 支持的 Agent 标识。 */
export type AgentId =
  | "claude-code"
  | "codex"
  | "cc-switch"
  | "opencode"
  | "gemini"
  | "openclaw"
  | "workspace";

/**
 * discovery 阶段的发现结果（对应 PRD §6.1 Agent 发现模块字段）。
 * 此阶段只回答"装没装、配没配、配置在哪、密钥文件在不在"，不解析内部风险。
 */
export interface AgentDiscovery {
  /** Agent 标识。 */
  agent: AgentId;
  /** 展示名，如 "Claude Code"。 */
  displayName: string;
  /** 是否发现配置（配置文件/目录存在）。 */
  configFound: boolean;
  /** 发现的主配置路径（未发现时为 undefined）。 */
  configPath?: string;
  /**
   * 是否检测到独立的凭证/密钥文件（仅探测存在性，不读内容）。
   * 例：Codex 的 auth.json、Gemini 的 .env、OpenCode 的 auth.json。
   */
  credentialFilePresent?: boolean;
  /** 命中的配置路径来源说明，便于报告解释（如 "CLAUDE_CONFIG_DIR" / "默认 ~/.codex"）。 */
  source?: string;
  /** discovery 阶段的初步备注（非风险判定，仅提示，如 "CC Switch 使用 SQLite"）。 */
  notes?: string[];
}

/**
 * 一条风险发现（PRD §10.3 RiskFinding）。
 * 由 risk-engine / adapter 的深度解析产出，discovery 阶段暂不生成。
 */
export interface RiskFinding {
  /** 规则 ID，如 "CCSWITCH_UNKNOWN_PROVIDER"。 */
  id: string;
  /** 风险类别，如 "provider" | "mcp" | "secret" | "permission"。 */
  category: string;
  severity: RiskLevel;
  title: string;
  description?: string;
  /** 证据（脱敏后），如 { agent, configPath, baseUrl }。绝不含完整密钥。 */
  evidence?: Record<string, unknown>;
  recommendation?: string;
  /** 不可自动修复项的分步手动整改指引。 */
  remediation?: string[];
  /** 是否可由 baseline apply 自动修复。 */
  fixable?: boolean;
  /** 用户下一步行动；由统一规则处置矩阵在扫描汇总阶段附加。 */
  action?: FindingAction;
}

/**
 * Adapter 接口：每个 Agent 一个实现。
 * MVP 骨架阶段只要求实现 discover()；deepScan() 为后续 adapter 深度解析预留。
 */
export interface Adapter {
  readonly agent: AgentId;
  readonly displayName: string;

  /**
   * 发现本机该 Agent 的配置。
   * 约定：未发现时不抛错，返回 configFound=false（对应 Spike 模块 B 验收）。
   */
  discover(ctx: DiscoveryContext): Promise<AgentDiscovery>;

  /**
   * 深度解析配置并产出风险发现。骨架阶段可未实现（返回 []）。
   */
  deepScan?(ctx: DiscoveryContext, found: AgentDiscovery): Promise<RiskFinding[]>;

  /**
   * 只读计算当前可证明的有效配置。不会由 renderer 或报告自行重算；
   * 缺少会话级 CLI 参数时必须降低 confidence，而不是假装已确认。
   */
  inspectPosture?(
    ctx: DiscoveryContext,
    found: AgentDiscovery
  ): Promise<EffectivePostureInspection>;
}

/**
 * discovery 运行上下文：集中提供环境信息，便于测试时注入。
 */
export interface DiscoveryContext {
  /** 用户 home 目录。 */
  home: string;
  /** 当前工作目录（敏感文件扫描等以此为基准）。 */
  cwd: string;
  /** 环境变量快照（含 CLAUDE_CONFIG_DIR / CODEX_HOME / XDG_CONFIG_HOME 等）。 */
  env: Record<string, string | undefined>;
  /** AgentReveal 项目配置里的 Provider 信任策略。 */
  providerPolicy?: ProviderTrustPolicy;
}
