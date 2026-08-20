/**
 * 面向模型上下文的最小扫描结果。
 *
 * 这是独立 allowlist 契约，不从完整 JSON 报告删字段。它只能包含固定枚举、
 * 计数、规则 ID 和仓库内固定文案，不得透传 finding、evidence、taskId、路径、
 * 端点、命令或用户自由文本。
 */
import type { ActionPriority, AgentId, FindingDisposition, RiskLevel } from "../../adapters/types.js";
import { type RuleId } from "../../rules/ids.js";
import type { ScanReport } from "../scan/index.js";
export declare const MODEL_SAFE_TOP_RISK_LIMIT: 3;
export type ModelSafeRiskCategory = "authentication" | "configuration" | "correlation" | "mcp" | "permission" | "privacy" | "provider" | "secret" | "supply-chain" | "workspace" | "other";
export type ModelSafeRuleId = RuleId | "DEEPSCAN_FAILED" | "UNMAPPED_RULE";
export interface ModelSafeRisk {
    source: "agent" | "correlation";
    agent: AgentId | "cross-agent";
    category: ModelSafeRiskCategory;
    ruleIds: ModelSafeRuleId[];
    priority: ActionPriority;
    severity: RiskLevel;
    disposition: FindingDisposition;
    /** 只允许由 normalizeCategory 返回的固定仓库文案。 */
    message: string;
    requiresHumanAction: true;
    verificationRequired: true;
}
export interface ModelSafeScanOptions {
    acceptedTaskCount?: number;
    ignoredFindingCount?: number;
}
export interface ModelSafeScanPayload {
    privacy: {
        localOnly: true;
        uploadsData: false;
        readOnlyScan: true;
        excludesAbsolutePaths: true;
        excludesEndpoints: true;
        excludesEvidence: true;
        excludesTaskIds: true;
        excludesCommands: true;
        excludesUserText: true;
    };
    summary: {
        configuredAgents: number;
        findingCount: number;
        actionableTaskCount: number;
        immediateTaskCount: number;
        informationalTaskCount: number;
        acceptedTaskCount: number;
        ignoredFindingCount: number;
        omittedActionableTaskCount: number;
    };
    topRisks: ModelSafeRisk[];
}
export type ModelSafeScanV1 = ModelSafeScanPayload & {
    schemaVersion: 1;
    command: "integration.scan";
};
export declare const MODEL_SAFE_CATEGORY_MESSAGES: Record<ModelSafeRiskCategory, string>;
/**
 * 在 Harness 边界重新验证完整 allowlist。任何 additive 字段也会拒绝，必须由
 * 新契约版本显式评审后才能进入模型相邻上下文。
 */
export declare function validateModelSafeScan(value: unknown): ModelSafeScanV1;
/**
 * 从已完成 acceptance / ignore 过滤的活动报告建立模型安全摘要。
 * 调用方必须传入活动报告；本函数不读取或写入任何本机状态。
 */
export declare function buildModelSafeScan(report: ScanReport, options?: ModelSafeScanOptions): ModelSafeScanV1;
