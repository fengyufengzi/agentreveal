import { FIRST_RUN_TOP_TASK_LIMIT } from "../first-run/index.js";
import { formatPosture } from "./posture-format.js";
import { formatDrift } from "./drift-format.js";
const SEVERITY_LABEL = {
    critical: "严重",
    high: "高危",
    medium: "中危",
    low: "低危",
    info: "提示",
};
function taskCommands(summary, taskId) {
    return summary.nextCommands.filter((item) => item.taskId === taskId);
}
function formatConnections(summary) {
    const lines = ["实际连接链路"];
    if (summary.map.proxyChains.length > 0) {
        for (const chain of summary.map.proxyChains) {
            lines.push(`  ${chain.via}: ${chain.proxy} → ${chain.upstream}`);
        }
        return lines;
    }
    const connected = summary.map.rows.filter((row) => row.endpoints.length > 0);
    if (connected.length === 0) {
        lines.push("  当前扫描没有可展示的 Provider 或代理链路。");
        return lines;
    }
    for (const row of connected) {
        lines.push(`  ${row.displayName}: ${row.endpoints.join("、")}`);
    }
    return lines;
}
export function formatFirstRun(summary) {
    const lines = [
        "AgentGuard",
        "本机运行 · 默认只读 · 不自动上传",
        "",
        ...(summary.posture
            ? [formatPosture(summary.posture), ""]
            : []),
        ...(summary.drift ? [formatDrift(summary.drift), ""] : []),
        ...formatConnections(summary),
        "",
        "行动摘要",
        `  必须处理 ${summary.buckets.mustHandle.count} · ` +
            `建议确认 ${summary.buckets.shouldReview.count} · ` +
            `信息提示 ${summary.buckets.informational.count} · ` +
            `已接受 ${summary.summary.acceptedTaskCount} · ` +
            `项目忽略 ${summary.summary.ignoredFindingCount}`,
        "",
        `建议先完成（最多 ${FIRST_RUN_TOP_TASK_LIMIT} 项）`,
    ];
    if (summary.topTasks.length === 0) {
        if ((summary.topDriftEvents?.length ?? 0) === 0) {
            lines.push("  当前没有需要处理的行动任务。");
        }
    }
    for (const [index, entry] of (summary.topDriftEvents ?? []).entries()) {
        lines.push(`  ${index + 1}. [${entry.priority}/${SEVERITY_LABEL[entry.severity]}] ${entry.currentSummary}`, `     ${entry.agentId} · ${entry.eventId}`, `     下一步：${entry.action[0] ?? "审核变化是否符合预期。"}`, `     验证：${entry.verification[0] ?? "复扫确认变化状态。"}`);
    }
    summary.topTasks.forEach((task, index) => {
        const action = task.primary.action;
        lines.push(`  ${index + 1 + (summary.topDriftEvents?.length ?? 0)}. [${task.priority}/${SEVERITY_LABEL[task.severity]}] ` +
            task.primary.finding.title);
        lines.push(`     ${task.displayName} · ${task.taskId}`);
        lines.push(`     为什么：${action.rationale}`);
        if (action.nextSteps[0])
            lines.push(`     下一步：${action.nextSteps[0]}`);
        const guide = summary.remediationGuides[task.taskId];
        const remediation = guide?.commands.filter((command) => command.kind !== "verify");
        for (const command of remediation?.slice(0, 2) ?? []) {
            lines.push(`     ${command.label}：${command.command}`);
        }
        for (const command of taskCommands(summary, task.taskId)) {
            lines.push(`     ${command.label}：${command.command}`);
        }
    });
    const hidden = summary.summary.taskCount - summary.topTasks.length;
    if (hidden > 0) {
        lines.push("", `另有 ${hidden} 个行动任务未在首屏展开。`);
    }
    lines.push("", "继续查看");
    for (const command of summary.nextCommands.filter((item) => !item.taskId)) {
        lines.push(`  ${command.label}：${command.command}`);
    }
    return lines.join("\n");
}
//# sourceMappingURL=first-run-format.js.map