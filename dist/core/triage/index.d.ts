import { type ActionTask } from "../action/index.js";
import type { ListedAcceptance } from "../acceptance/index.js";
import type { ScanReport } from "../scan/index.js";
export interface TriagedReport {
    /** 默认命令使用的活动结果；已接受任务不再计数、展示或影响退出码。 */
    activeReport: ScanReport;
    /** 仍保留完整任务，供 HTML 审计区展示。 */
    acceptedTasks: ActionTask[];
    activeAcceptances: ListedAcceptance[];
}
export declare function applyAcceptances(report: ScanReport, records: readonly ListedAcceptance[]): TriagedReport;
