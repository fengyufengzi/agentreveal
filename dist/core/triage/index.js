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
export function applyAcceptances(report, records, ruleIgnores = []) {
    const activeAcceptances = records.filter((record) => record.status === "active");
    const acceptedIds = new Set(activeAcceptances.map((record) => record.taskId));
    const ignored = applyRuleIgnores(report, ruleIgnores);
    const unignoredReport = ignored.report;
    const acceptedTasks = buildActionTasks(buildActionPlan(unignoredReport)).filter((task) => acceptedIds.has(task.taskId));
    const results = unignoredReport.results.map((result) => ({
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
    const correlations = (unignoredReport.correlations ?? []).filter((finding) => {
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
        ignoredFindings: ignored.ignoredFindings,
        activeRuleIgnores: ignored.activeRuleIgnores,
    };
}
/** 只应用项目级规则策略，供 HTML 在保留完整技术证据时复用。 */
export function applyRuleIgnores(report, ruleIgnores = []) {
    const activeRuleIgnores = ruleIgnores.filter((record) => record.status === "active");
    const ignorePolicies = new Map(activeRuleIgnores.map((record) => [`${record.agent}\0${record.ruleId}`, record]));
    const ignoredFindings = [];
    const unignoredResults = report.results.map((result) => ({
        ...result,
        findings: result.findings.filter((finding) => {
            const policy = ignorePolicies.get(`${result.agent}\0${finding.id}`);
            if (policy) {
                ignoredFindings.push({
                    agent: result.agent,
                    displayName: result.displayName,
                    finding: finding.action
                        ? finding
                        : enrichFinding(finding),
                    policy,
                });
                return false;
            }
            return true;
        }),
    }));
    const activeReport = {
        results: unignoredResults,
        allFindings: unignoredResults.flatMap((result) => result.findings),
        correlations: report.correlations ?? [],
    };
    return {
        report: activeReport,
        ignoredFindings,
        activeRuleIgnores,
    };
}
//# sourceMappingURL=index.js.map