import type { DiscoveryContext } from "../../adapters/types.js";
import { type BaselineFilePlan, type BaselineProfile } from "../baseline/index.js";
export interface ApplyResult {
    profile: BaselineProfile;
    planFingerprint: string;
    backupId: string;
    files: BaselineFilePlan[];
    warnings: string[];
}
export interface ApplyBaselineOptions {
    /** 桌面端等交互入口确认过的 dry-run 指纹；不一致时禁止写入。 */
    expectedPlanFingerprint?: string;
}
export interface ManualBackupResult {
    backupId: string;
    files: number;
    warnings: string[];
}
export declare function applyBaseline(profile: BaselineProfile, ctx?: DiscoveryContext, options?: ApplyBaselineOptions): Promise<ApplyResult>;
export declare function backupOpenCodeConfig(ctx?: DiscoveryContext): Promise<ManualBackupResult>;
export declare function restoreLatestBaselineBackup(cwd: string): {
    backupId: string;
    files: number;
} | undefined;
export declare function restoreBaselineBackup(cwd: string, id: string): {
    backupId: string;
    files: number;
};
