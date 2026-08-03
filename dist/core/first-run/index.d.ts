import { type ActionTask } from "../action/index.js";
import { type ConfigMap } from "../map/index.js";
import { type RemediationGuide } from "../remediation/index.js";
import type { ScanReport } from "../scan/index.js";
import type { PostureReport } from "../posture/report.js";
import type { DriftComparison } from "../posture/types.js";
import type { DriftEvent } from "../posture/types.js";
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
    /** E2+ 可选扩展；旧 v1 消费方可忽略。 */
    posture?: PostureReport;
    /** E3+ 可选扩展；没有可信基线时为 no-baseline。 */
    drift?: DriftComparison;
    /** 与 Top 3 行动共用容量的高优先级变化。 */
    topDriftEvents?: DriftEvent[];
}
export type FirstRunSummaryV1 = FirstRunSummaryPayload & {
    schemaVersion: 1;
    command: "first-run";
};
export interface FirstRunSummaryOptions {
    acceptedTaskCount?: number;
    ignoredFindingCount?: number;
    platform?: NodeJS.Platform;
    posture?: PostureReport;
    drift?: DriftComparison;
}
/** 从应用 acceptance 后的活动报告构建统一首次运行契约。 */
export declare function buildFirstRunSummary(report: ScanReport, options?: FirstRunSummaryOptions): FirstRunSummaryV1;
