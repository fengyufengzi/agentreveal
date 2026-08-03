import type { ActionTask } from "../action/index.js";
export interface ClaudeCredentialBackupResult {
    backupId: string;
    taskId: string;
    files: number;
    createdAt: string;
}
export interface ClaudeCredentialRestorePreview {
    backupId: string;
    taskId: string;
    files: number;
    changedFiles: number;
    fingerprint: string;
}
export interface ClaudeCredentialRestoreResult {
    backupId: string;
    taskId: string;
    files: number;
}
export interface ClaudeCredentialMigrationBackup {
    taskId: string;
    files: Array<{
        originalPath: string;
        sha256: string;
        mode: number;
    }>;
}
export interface ClaudeCredentialBackupCleanupResult {
    backupId: string;
    taskId: string;
    files: number;
}
export declare function assertClaudePlaintextTask(task: ActionTask | undefined, taskId: string): asserts task is ActionTask;
/** 仅供受控迁移事务核对备份目标与原始摘要，不返回备份内容。 */
export declare function readClaudeCredentialBackupForMigration(input: {
    cwd: string;
    backupId: string;
    configDir: string;
}): ClaudeCredentialMigrationBackup;
/** 删除已完成迁移的 Claude 备份；调用方负责先验证当前迁移状态和用户确认。 */
export declare function deleteClaudeCredentialBackup(input: {
    cwd: string;
    backupId: string;
    configDir: string;
}): ClaudeCredentialBackupCleanupResult;
export declare function createClaudeCredentialBackup(input: {
    cwd: string;
    task: ActionTask | undefined;
    taskId: string;
    configDir: string;
}): ClaudeCredentialBackupResult;
export declare function previewClaudeCredentialRestore(input: {
    cwd: string;
    backupId: string;
    configDir: string;
}): ClaudeCredentialRestorePreview;
export declare function restoreClaudeCredentialBackup(input: {
    cwd: string;
    backupId: string;
    configDir: string;
    expectedFingerprint: string;
}): ClaudeCredentialRestoreResult;
