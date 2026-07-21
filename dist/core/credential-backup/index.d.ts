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
export declare function assertClaudePlaintextTask(task: ActionTask | undefined, taskId: string): asserts task is ActionTask;
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
