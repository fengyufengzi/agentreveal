const CONFIDENCE_LABEL = {
    confirmed: "已确认",
    inferred: "推断",
    incomplete: "证据不完整",
};
const AUTH_LABEL = {
    "cloud-provider": "云厂商身份",
    oauth: "OAuth",
    "api-key": "API Key",
    "keychain-helper": "Keychain/helper",
    environment: "环境变量",
    "config-file": "配置文件",
    "proxy-injected": "代理注入",
    none: "无认证",
    unknown: "未确认",
};
function permissionLabel(permission) {
    return `${permission.capability}=${permission.decision}/${permission.scope}`;
}
export function formatPosture(report) {
    const lines = [
        "AgentGuard 当前真正生效",
        `Agent ${report.summary.agentCount} · 已确认 ${report.summary.confirmedCount} · ` +
            `推断 ${report.summary.inferredCount} · 证据不完整 ${report.summary.incompleteCount} · ` +
            `认证冲突 ${report.summary.authConflictCount}`,
    ];
    if (report.agents.length === 0) {
        lines.push("", "当前没有可计算有效状态的 Claude Code、Codex 或 CC Switch 配置。");
        return lines.join("\n");
    }
    for (const item of report.agents) {
        const state = item.state;
        lines.push("", `▍${state.displayName}  [${CONFIDENCE_LABEL[state.confidence]}]`, `  Provider：${state.route.providerClass ?? "未确认"} · 模型：${state.route.model ?? "未确认"}`, `  路由：${state.route.effectiveEndpoint ?? "未确认"} · 代理：${state.route.proxyKind}` +
            `${state.route.realUpstream ? ` · 真实上游：${state.route.realUpstream}` : ""}`, `  认证：${AUTH_LABEL[state.auth.method]} · 状态：${state.auth.status}` +
            `${state.auth.sourceKind ? ` · 来源：${state.auth.sourceKind}` : ""}`, `  权限：${state.permissions.map(permissionLabel).join(" · ") || "没有可用摘要"}`, `  集成：${state.integrations.filter((entry) => entry.enabled).length} 个已启用`);
        lines.push("  配置来源：");
        for (const source of state.configSources) {
            lines.push(`    - ${source.kind}/${source.scope} [${source.status}]` +
                `${source.path ? ` ${source.path}` : ""} · ${source.fields.join("、") || "无可识别字段"}`);
        }
        for (const uncertainty of item.uncertainty) {
            lines.push(`  未确认：${uncertainty.message}`);
        }
        for (const plan of item.remediationPlans) {
            lines.push(`  处置计划：${plan.title} [${plan.status}]`, `    当前：${plan.currentExplanation}`, `    目标：${plan.targetState}`);
            for (const [index, step] of plan.steps.entries()) {
                lines.push(`    ${index + 1}. ${step.title}：${step.detail}`);
            }
            lines.push(`    自动化：不自动执行；${plan.automation.reason}`);
        }
    }
    return lines.join("\n");
}
//# sourceMappingURL=posture-format.js.map