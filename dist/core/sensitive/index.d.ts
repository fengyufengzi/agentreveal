import type { RiskFinding } from "../../adapters/types.js";
export interface SensitiveScanOptions {
    maxDepth?: number;
    maxFindings?: number;
}
/** 扫描当前项目目录中的敏感文件名，返回已脱敏的风险发现。 */
export declare function scanSensitiveFiles(cwd: string, opts?: SensitiveScanOptions): RiskFinding[];
