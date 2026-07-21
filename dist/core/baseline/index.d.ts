import type { AgentId, DiscoveryContext } from "../../adapters/types.js";
export type BaselineProfile = "safe" | "balanced";
export interface BaselineChange {
    agent: AgentId;
    configPath: string;
    path: string;
    from: unknown;
    to: unknown;
    reason: string;
}
export interface BaselineFilePlan {
    agent: AgentId;
    configPath: string;
    changes: BaselineChange[];
    diff: string;
}
export interface BaselineFileEdit extends BaselineFilePlan {
    nextConfig: Record<string, unknown>;
    /** 生成计划时源文件的哈希；apply 前用于检测并发修改。 */
    sourceHash: string;
}
export interface BaselinePlan {
    profile: BaselineProfile;
    dryRun: true;
    files: BaselineFilePlan[];
    warnings: string[];
}
/**
 * 对用户实际看到的 profile + 文件变更计算稳定指纹。
 * apply 可据此拒绝与已确认预览不一致的计划；指纹不暴露配置内容。
 */
export declare function baselinePlanFingerprint(plan: Pick<BaselinePlan, "profile" | "files">): string;
export declare function buildBaselineEdits(profile: BaselineProfile, ctx?: DiscoveryContext): Promise<{
    edits: BaselineFileEdit[];
    warnings: string[];
}>;
export declare function buildBaselinePlan(profile: BaselineProfile, ctx?: DiscoveryContext): Promise<BaselinePlan>;
