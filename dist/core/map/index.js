const SEVERITY_RANK = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1,
};
/** 去掉 scheme，便于紧凑展示；非 URL 原样返回。 */
function stripScheme(v) {
    return v.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
/** 从一个 Agent 的 provider 类 findings 收集端点摘要。 */
function collectEndpoints(r) {
    const set = new Set();
    for (const f of r.findings) {
        if (f.category !== "provider" || !f.evidence)
            continue;
        const ev = f.evidence;
        for (const cand of [ev.baseUrl, ev.realUpstream, ev.proxyUrl, ev.proxy]) {
            if (typeof cand === "string" && cand.length > 0)
                set.add(stripScheme(cand));
        }
    }
    return [...set];
}
/** 取该 Agent findings 的最高严重度。 */
function maxRisk(r) {
    if (!r.discovery.configFound)
        return "n/a";
    if (r.findings.length === 0)
        return "ok";
    let top = "info";
    for (const f of r.findings) {
        if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[top])
            top = f.severity;
    }
    return top;
}
function toRow(r) {
    const count = (cat) => r.findings.filter((f) => f.category === cat).length;
    return {
        agent: r.agent,
        displayName: r.displayName,
        configured: r.discovery.configFound,
        source: r.discovery.source,
        endpoints: collectEndpoints(r),
        mcpCount: count("mcp"),
        secretCount: count("secret"),
        sensitiveCount: count("sensitive"),
        permissionCount: count("permission"),
        findingCount: r.findings.length,
        risk: maxRisk(r),
    };
}
/** 从所有 findings 中提取代理两跳链路（携带 realUpstream 的 provider finding）。 */
function collectProxyChains(report) {
    const hops = [];
    for (const r of report.results) {
        for (const f of r.findings) {
            const ev = f.evidence;
            if (!ev)
                continue;
            const upstream = ev.realUpstream;
            const proxy = ev.proxy;
            if (typeof upstream === "string" && typeof proxy === "string") {
                const owner = ev.proxyOwner;
                const authMode = ev.authMode;
                const agentLabel = ev.appLabel;
                hops.push({
                    via: String(ev.appType ?? r.agent),
                    proxy,
                    upstream,
                    ...(typeof agentLabel === "string" ? { agentLabel } : {}),
                    ...(typeof owner === "string" ? { owner } : {}),
                    ...(typeof authMode === "string" ? { authMode } : {}),
                });
            }
        }
    }
    return hops;
}
/** 由 scan 报告构建配置地图。 */
export function buildMap(report) {
    return {
        rows: report.results.map(toRow),
        proxyChains: collectProxyChains(report),
    };
}
//# sourceMappingURL=index.js.map