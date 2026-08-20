/**
 * CLI 与 Desktop 共用的 JSON 行动报告。
 *
 * 保留既有 ScanReport 顶层字段，并追加统一行动摘要、全部任务和 Top 3；
 * 只消费已经脱敏的报告，不读取配置或凭证明文。
 */
import { buildFirstRunSummary } from "../first-run/index.js";
import { withOutputContract } from "../output-contract.js";
export function buildJsonReport(report, options = {}) {
    const firstRun = buildFirstRunSummary(report, {
        acceptedTaskCount: options.acceptedTaskCount,
        ignoredFindingCount: options.ignoredFindingCount,
        ...(options.posture ? { posture: options.posture } : {}),
        ...(options.drift ? { drift: options.drift } : {}),
    });
    return withOutputContract("report.json", {
        ...report,
        summary: firstRun.summary,
        tasks: firstRun.tasks,
        topTasks: firstRun.topTasks,
        acceptedTaskCount: options.acceptedTaskCount ?? 0,
        ignoredFindingCount: options.ignoredFindingCount ?? 0,
        ...(options.posture ? { posture: options.posture } : {}),
        ...(options.drift ? { drift: options.drift } : {}),
    });
}
//# sourceMappingURL=json-report.js.map