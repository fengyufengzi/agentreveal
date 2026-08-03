import type { DriftPolicyState } from "./types.js";
/**
 * 策略文件异常不能掩盖有效配置扫描；对应配置读取流程会单独报告解析问题。
 */
export declare function loadDriftPolicyStates(cwd: string, options?: {
    acceptancePath?: string;
    now?: Date;
}): DriftPolicyState[];
