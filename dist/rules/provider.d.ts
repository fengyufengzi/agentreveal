/**
 * Provider 分类规则库（PRD §6.6）。
 * 输入一个 base_url，判定其信任类型与风险等级，并给出可解释的原因。
 * 设计：不武断阻断，未知只提示；企业内网可后续由用户白名单标记为 internal。
 * 复用：CC Switch / OpenCode / Claude Code 等 adapter 共用。
 */
import type { RiskLevel } from "../adapters/types.js";
export type ProviderType = "official" | "domestic_official" | "local" | "enterprise_internal" | "relay_or_proxy" | "openai_compatible_unknown" | "unknown";
export interface ProviderClass {
    type: ProviderType;
    level: RiskLevel;
    reason: string;
    /** 附加提示，如使用了非 TLS 的 http。 */
    flags: string[];
}
export interface ProviderTrustPolicy {
    /** 用户显式标记可信的端点/域名。支持完整 URL、host、*.example.com。 */
    trustedEndpoints?: string[];
    /** 企业/内网自建端点。支持完整 URL、host、*.example.com。 */
    internalEndpoints?: string[];
}
/**
 * 对 base_url 做分类判定。
 */
export declare function classifyBaseUrl(url: string, policy?: ProviderTrustPolicy): ProviderClass;
