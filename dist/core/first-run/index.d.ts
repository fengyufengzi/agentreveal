import { type ActionTask } from "../action/index.js";
import { type ConfigMap } from "../map/index.js";
import { type RemediationGuide } from "../remediation/index.js";
import type { ScanReport } from "../scan/index.js";
export declare const FIRST_RUN_TOP_TASK_LIMIT: 3;
export type FirstRunBucketId = "mustHandle" | "shouldReview" | "informational";
export interface FirstRunTaskBucket {
    label: string;
    count: number;
    taskIds: string[];
}
export interface FirstRunNextCommand {
    id: string;
    kind: "report" | "map" | "verify" | "accept" | "trust" | "ignore";
    label: string;
    command: string;
    taskId?: string;
}
export interface FirstRunSummaryPayload {
    privacy: {
        localOnly: true;
        uploadsData: false;
        readOnlyScan: true;
    };
    summary: {
        configuredAgents: number;
        findingCount: number;
        taskCount: number;
        immediateTaskCount: number;
        informationalTaskCount: number;
        acceptedTaskCount: number;
        ignoredFindingCount: number;
    };
    map: ConfigMap;
    /** 当前活动报告派生的全部任务，包含 observe，顺序与统一行动模型一致。 */
    tasks: ActionTask[];
    /** 首屏统一展示的前三个非 observe 任务。 */
    topTasks: ActionTask[];
    buckets: Record<FirstRunBucketId, FirstRunTaskBucket>;
    /** 当前操作系统的安全命令模板；命令不会包含原始凭证。 */
    remediationGuides: Record<string, RemediationGuide>;
    nextCommands: FirstRunNextCommand[];
}
export type FirstRunSummaryV1 = FirstRunSummaryPayload & {
    schemaVersion: 1;
    command: "first-run";
};
export interface FirstRunSummaryOptions {
    acceptedTaskCount?: number;
    ignoredFindingCount?: number;
    platform?: NodeJS.Platform;
}
/** 从应用 acceptance 后的活动报告构建统一首次运行契约。 */
export declare function buildFirstRunSummary(report: ScanReport, options?: FirstRunSummaryOptions): FirstRunSummaryV1;
