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
export declare function createBackup(cwd: string, targets: BackupTarget[], label?: string): BackupManifest;
export declare function latestBackup(cwd: string): BackupManifest | undefined;
export declare function readBackup(cwd: string, id: string): BackupManifest;
export declare function restoreBackup(manifest: BackupManifest): void;
export {};
