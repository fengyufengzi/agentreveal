/**
 * 按操作系统生成安全、可复制的整改命令。
 *
 * 安全边界：
 * - 绝不把 finding evidence、标题或凭证值拼进命令。
 * - 只有现有 baseline 能力可标为 baseline；其它情况均为 guided/none。
 * - 凭证迁移命令只为明确支持的配置生成窄范围修改；其它 Agent 仍只提供安全存储或当前会话注入。
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
    kind: "preview" | "apply" | "backup" | "store" | "configure" | "inject" | "inspect" | "verify";
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
/** Claude 凭证迁移使用的稳定 Keychain service；只由已校验 taskId 派生。 */
export declare function claudeCredentialKeychainService(taskId: string): string;
/** 写入 Claude 设置的固定 helper，不包含凭证、路径或 renderer 输入。 */
export declare function claudeCredentialApiKeyHelper(taskId: string): string;
export declare function buildRemediationGuide(target: RiskFinding | ActionTask, options?: RemediationOptions): RemediationGuide;
