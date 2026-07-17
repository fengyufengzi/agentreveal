/**
 * 按操作系统生成安全、可复制的整改命令。
 *
 * 安全边界：
 * - 绝不把 finding evidence、标题或凭证值拼进命令。
 * - 只有现有 baseline 能力可标为 baseline；其它情况均为 guided/none。
 * - 凭证迁移命令只负责安全存储或当前会话注入，仍需用户按 action 指引更新配置并轮换旧凭证。
 */
import type { RiskFinding } from "../../adapters/types.js";
import { type ActionTask } from "../action/index.js";
export type RemediationPlatform = "darwin" | "linux" | "win32";
export type ResolvedPlatform = RemediationPlatform | "unsupported";
export type RemediationMode = "baseline" | "guided" | "none";
export interface RemediationCommand {
    id: string;
    label: string;
    command: string;
    shell: "sh" | "powershell";
    kind: "preview" | "apply" | "store" | "inject" | "inspect" | "verify";
    /** false 表示命令只辅助人工处置，不能声称已自动修复 finding。 */
    completesRemediation: boolean;
}
export interface RemediationGuide {
    platform: ResolvedPlatform;
    mode: RemediationMode;
    ruleIds: string[];
    commands: RemediationCommand[];
    notes: string[];
}
export interface RemediationOptions {
    /** 缺省读取 process.platform；测试和跨平台报告可显式指定。 */
    platform?: NodeJS.Platform;
    /** baseline 命令使用的 profile；缺省 balanced。 */
    profile?: "safe" | "balanced";
}
export declare function buildRemediationGuide(target: RiskFinding | ActionTask, options?: RemediationOptions): RemediationGuide;
