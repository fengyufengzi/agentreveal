import { actionTaskId, buildActionPlan, buildActionTasks, enrichFinding, } from "../action/index.js";
function itemForFinding(input) {
    const finding = input.finding.action
        ? input.finding
        : enrichFinding(input.finding);
    return {
        source: input.source,
        ...(input.agent ? { agent: input.agent } : {}),
        displayName: input.displayName,
        finding,
        action: finding.action,
    };
}
export function applyAcceptances(report, records) {
    const activeAcceptances = records.filter((record) => record.status === "active");
    const acceptedIds = new Set(activeAcceptances.map((record) => record.taskId));
    const acceptedTasks = buildActionTasks(buildActionPlan(report)).filter((task) => acceptedIds.has(task.taskId));
    const results = report.results.map((result) => ({
        ...result,
        findings: result.findings.filter((finding) => {
            const item = itemForFinding({
                source: "agent",
                agent: result.agent,
                displayName: result.displayName,
                finding,
            });
            return !acceptedIds.has(actionTaskId(item));
        }),
    }));
    const correlations = (report.correlations ?? []).filter((finding) => {
        const item = itemForFinding({
            source: "correlation",
            displayName: "跨 Agent 关联",
            finding,
        });
        return !acceptedIds.has(actionTaskId(item));
    });
    return {
        activeReport: {
            results,
            allFindings: results.flatMap((result) => result.findings),
            correlations,
        },
        acceptedTasks,
        activeAcceptances,
    };
}
//# sourceMappingURL=index.js.map