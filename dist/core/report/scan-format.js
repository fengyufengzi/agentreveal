/** 严重度排序权重（高在前）。 */
const SEVERITY_ORDER = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
};
/** 严重度标签（终端友好，无颜色依赖）。 */
const SEVERITY_TAG = {
    critical: "[严重]",
    high: "[高危]",
    medium: "[中危]",
    low: "[低危]",
    info: "[提示]",
};
/** evidence 序列化为单行，脱敏内容已在 adapter 层保证。 */
function formatEvidence(evidence) {
    const parts = Object.entries(evidence).map(([k, v]) => {
        const val = Array.isArray(v) ? v.join(", ") : String(v);
        return `${k}=${val}`;
    });
    return parts.join(" | ");
}
/** 单条 finding 的正文渲染（Agent 段与跨 Agent 关联段共用）。 */
function pushFindingLines(lines, f) {
    lines.push(`  ${SEVERITY_TAG[f.severity]} ${f.title}  (${f.id})`);
    if (f.description)
        lines.push(`        ${f.description}`);
    if (f.evidence)
        lines.push(`        证据: ${formatEvidence(f.evidence)}`);
    if (f.recommendation)
        lines.push(`        建议: ${f.recommendation}`);
    if (f.remediation?.length) {
        lines.push("        手动整改步骤:");
        f.remediation.forEach((step, i) => {
            lines.push(`          ${i + 1}) ${step}`);
        });
    }
}
/** 单个 Agent 段落。 */
function formatAgentSection(r) {
    const lines = [];
    const header = `▍${r.displayName}`;
    if (!r.discovery.configFound) {
        lines.push(`${header}  （未配置，跳过）`);
        return lines;
    }
    if (r.findings.length === 0) {
        lines.push(`${header}  ✓ 未发现风险`);
        return lines;
    }
    lines.push(`${header}  ${r.findings.length} 项`);
    const sorted = [...r.findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    for (const f of sorted) {
        pushFindingLines(lines, f);
    }
    return lines;
}
/** 统计各严重度数量（含跨 Agent 关联项）。 */
function countBySeverity(report) {
    const counts = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
    };
    for (const f of report.allFindings)
        counts[f.severity]++;
    for (const f of report.correlations)
        counts[f.severity]++;
    return counts;
}
/** 跨 Agent 关联段（无关联项则返回空）。 */
function formatCorrelationSection(report) {
    if (report.correlations.length === 0)
        return [];
    const lines = [];
    lines.push("▍跨 Agent 关联");
    const sorted = [...report.correlations].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    for (const f of sorted) {
        pushFindingLines(lines, f);
    }
    lines.push("");
    return lines;
}
/** 生成完整 scan 文本报告。 */
export function formatScan(report) {
    const lines = [];
    lines.push("AgentReveal Scan");
    lines.push("");
    for (const r of report.results) {
        for (const line of formatAgentSection(r))
            lines.push(line);
        lines.push("");
    }
    for (const line of formatCorrelationSection(report))
        lines.push(line);
    const c = countBySeverity(report);
    const total = report.allFindings.length + report.correlations.length;
    lines.push("─".repeat(48));
    lines.push(`Summary: 共 ${total} 项风险  ` +
        `严重 ${c.critical} · 高 ${c.high} · 中 ${c.medium} · 低 ${c.low} · 提示 ${c.info}` +
        `  （含跨 Agent 关联 ${report.correlations.length}）`);
    return lines.join("\n");
}
//# sourceMappingURL=scan-format.js.map