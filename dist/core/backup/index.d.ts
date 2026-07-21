import { atomicWriteFile } from "../fs-safety.js";
declare const BACKUP_MANIFEST_VERSION: 1;
export interface BackupFileEntry {
    agent: string;
    originalPath: string;
    backupPath: string;
    mode: number;
    sha256: string;
}
export interface BackupManifest {
    schemaVersion: typeof BACKUP_MANIFEST_VERSION;
    id: string;
    createdAt: string;
    label: string;
    files: BackupFileEntry[];
}
export interface BackupTarget {
    agent: string;
    path: string;
}
export interface BackupRestoreFileState {
    originalPath: string;
    sha256: string;
}
interface RestoreTransactionOptions {
    /** 仅供失败路径测试注入；生产环境始终使用 atomicWriteFile。 */
    writeFile?: typeof atomicWriteFile;
}
export declare function createBackup(cwd: string, targets: BackupTarget[], label?: string): BackupManifest;
export declare function latestBackup(cwd: string): BackupManifest | undefined;
export declare function readBackup(cwd: string, id: string): BackupManifest;
/** 读取恢复目标的当前摘要；只返回路径与不可逆哈希，不返回配置内容。 */
export declare function backupRestoreFileState(manifest: BackupManifest): BackupRestoreFileState[];
/**
 * 按用户确认时的文件摘要事务恢复：恢复前拒绝并发修改，多文件失败时回滚已恢复文件。
 */
export declare function restoreBackupTransaction(manifest: BackupManifest, expectedCurrentState: BackupRestoreFileState[], options?: RestoreTransactionOptions): void;
export declare function restoreBackup(manifest: BackupManifest): void;
export {};
