const DISPLAY_NAME = {
    opencode: "OpenCode",
    "claude-code": "Claude Code",
    gemini: "Gemini CLI",
    openclaw: "OpenClaw",
};
function displayNameOf(agent) {
    return DISPLAY_NAME[agent] ?? agent;
}
function value(v) {
    if (typeof v === "string")
        return `"${v}"`;
    return JSON.stringify(v);
}
export function formatBaseline(plan) {
    const lines = [];
    lines.push(`AgentReveal Baseline dry-run (${plan.profile})`);
    lines.push("");
    if (plan.warnings.length > 0) {
        lines.push("Warnings:");
        for (const w of plan.warnings)
            lines.push(`  - ${w}`);
        lines.push("");
    }
    if (plan.files.length === 0) {
        lines.push("未生成变更建议。");
        return lines.join("\n");
    }
    for (const file of plan.files) {
        lines.push(`▍${displayNameOf(file.agent)}  ${file.configPath}`);
        for (const c of file.changes) {
            lines.push(`  - ${c.path}: ${value(c.from)} → ${value(c.to)}`);
            lines.push(`    原因: ${c.reason}`);
        }
        lines.push("");
        lines.push(file.diff.trimEnd());
        lines.push("");
    }
    lines.push("dry-run 未写入任何文件。");
    return lines.join("\n");
}
//# sourceMappingURL=baseline-format.js.map