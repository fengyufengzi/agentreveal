import type { ActionTask } from "../action/index.js";
import { atomicWriteFile } from "../fs-safety.js";
export interface ClaudeCredentialMigrationPreview {
    taskId: string;
    phase: "previewed";
    keychainService: string;
    files: number;
    plaintextFields: number;
    fingerprint: string;
}
export interface ClaudeCredentialMigrationApplyResult {
    taskId: string;
    phase: "applied";
    files: number;
    plaintextFieldsRemoved: number;
    apiKeyHelperConfigured: true;
    appliedFingerprint: string;
}
export interface ClaudePostMigrationVerification {
    command: "claude auth status --text";
    label: string;
    successEvidence: string[];
}
interface ApplyOptions {
    /** 仅用于失败路径测试；生产始终使用 atomicWriteFile。 */
    writeFile?: typeof atomicWriteFile;
}
export declare function previewClaudeCredentialMigration(input: {
    task: ActionTask | undefined;
    taskId: string;
    configDir: string;
}): ClaudeCredentialMigrationPreview;
/** 上游 Claude Code 提供的只读认证状态检查；不代替一次真实最小请求。 */
export declare function claudePostMigrationVerification(): ClaudePostMigrationVerification;
/** 删除迁移备份前重新确认设置仍保持固定 helper 且没有真实明文凭证。 */
export declare function verifyClaudeCredentialMigrationState(input: {
    taskId: string;
    configPaths: string[];
}): {
    files: number;
    apiKeyHelperConfigured: true;
};
/**
 * 重新校验 task、计划指纹和备份原始摘要后执行原子多文件修改。
 * 任一写入或校验失败都会恢复事务开始前的内容与权限。
 */
export declare function applyClaudeCredentialMigration(input: {
    cwd: string;
    task: ActionTask | undefined;
    taskId: string;
    configDir: string;
    backupId: string;
    expectedFingerprint: string;
}, options?: ApplyOptions): ClaudeCredentialMigrationApplyResult;
export {};
