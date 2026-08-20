/**
 * Drift 对比解释卡：把 DriftEvent 的 (kind, change, severity) 派生为人类可读的"分类标签"，
 * 让终端与 HTML 报告共用一套语义。
 *
 * 重要约束（沿用 ADR-0002/0005 与 output-contract v1）：
 *   - 不改 DriftEvent schema，不新增 enum；
 *   - 此层只用于 view/present，CLI/JSON 仍按现有 contract 输出；
 *   - 派生是纯函数，可在 render 阶段调用。
 */
export const DRIFT_CARD_CLASSES = [
    "new-coverage",
    "lost-coverage",
    "changed-coverage",
    "conflict",
    "expansion",
    "contraction",
    "regression",
    "policy-expired",
    "agent-lifecycle",
    "agent-version",
];
const CARD_LABEL = {
    "new-coverage": "新增覆盖",
    "lost-coverage": "失去覆盖",
    "changed-coverage": "覆盖变化",
    conflict: "冲突",
    expansion: "能力扩大",
    contraction: "能力收缩",
    regression: "已解决项回归",
    "policy-expired": "策略到期",
    "agent-lifecycle": "Agent 增减",
    "agent-version": "Agent 升级",
};
const CARD_GUIDANCE = {
    "new-coverage": "新出现一项之前没有的覆盖：核对是否来自预期配置或新安装的 Agent。",
    "lost-coverage": "之前存在的能力或来源消失：核对是否被卸载、禁用或被环境覆盖。",
    "changed-coverage": "两边都存在但内容变化：通常来自配置编辑或自动同步。",
    conflict: "多来源或权限相互竞争：必须人工确认哪个生效。",
    expansion: "权限/能力扩大：优先复核是否来自预期改动。",
    contraction: "权限/能力收缩：通常来自安全加固，复扫确认是否还有遗漏入口。",
    regression: "之前已解决的风险再次出现：必须重新执行完整处置并复扫。",
    "policy-expired": "接受 / 忽略策略已到期：复审风险，决定续期或重新处置。",
    "agent-lifecycle": "Agent 自身新增或移除：核对是否来自预期安装/卸载。",
    "agent-version": "Agent 自身版本变化：通常与新规则 / 新增 finding 一同出现。",
};
export function classifyDriftEvent(event) {
    const k = event.kind;
    const c = event.change;
    const sev = event.severity;
    if (k === "agent-added" || k === "agent-removed")
        return "agent-lifecycle";
    if (k === "agent-version-changed")
        return "agent-version";
    if (k === "acceptance-expired" || k === "ignore-expired")
        return "policy-expired";
    if (k === "risk-reappeared")
        return "regression";
    if (k === "risk-added")
        return "new-coverage";
    if (k === "risk-resolved")
        return "lost-coverage";
    if (k === "auth-source-changed")
        return "conflict";
    if (k === "provider-route-changed" && sev === "high")
        return "conflict";
    if (k === "config-source-changed" && isConflictingSource(event))
        return "conflict";
    if (k === "permission-changed") {
        if (sev === "high")
            return "expansion";
        if (sev === "low")
            return "contraction";
        return "changed-coverage";
    }
    if (k === "integration-added")
        return "new-coverage";
    if (k === "integration-removed")
        return "lost-coverage";
    if (k === "integration-changed")
        return "changed-coverage";
    return classifyByChange(c);
}
function classifyByChange(change) {
    switch (change) {
        case "added": return "new-coverage";
        case "removed": return "lost-coverage";
        case "reappeared": return "regression";
        case "changed":
        default: return "changed-coverage";
    }
}
/**
 * config-source-changed 的"冲突"判定：来源处于"已冲突"状态时升级。
 * 当前 implementation 依赖 previousCategory 提示——它是
 * ConfigSourceStatus 字符串（active / conflicting / inactive）。
 */
function isConflictingSource(event) {
    if (!event.previousCategory)
        return false;
    return /conflicting|conflict/i.test(event.previousCategory);
}
export function cardLabel(cls) {
    return CARD_LABEL[cls];
}
export function cardGuidance(cls) {
    return CARD_GUIDANCE[cls];
}
export function buildDriftCard(event) {
    const cls = classifyDriftEvent(event);
    return { cls, label: cardLabel(cls), guidance: cardGuidance(cls) };
}
/**
 * 派生"上次 vs 这次"对比行：仅在 previousCategory 存在时输出。
 * 输出形如 "上次：environment · 这次：session[active]"。
 * 渲染层会 HTML 转义。
 */
export function previousVsCurrent(event) {
    if (!event.previousCategory)
        return undefined;
    // 当前摘要已包含"当前"语义，避免重复；以"上次：..."形式。
    return `上次：${event.previousCategory}`;
}
/**
 * helper：把 DriftEvent 列表按"分类 → priority → severity"稳定排序。
 * 不改原数组顺序的对外契约，仅供 view 层使用。
 */
export function sortByCardPriority(events) {
    const PRIORITY_RANK = {
        conflict: 0,
        regression: 1,
        expansion: 2,
        "policy-expired": 3,
        "new-coverage": 4,
        "changed-coverage": 5,
        "lost-coverage": 6,
        contraction: 7,
        "agent-lifecycle": 8,
        "agent-version": 9,
    };
    const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    const PRI_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return events
        .map((e) => ({ event: e, card: buildDriftCard(e) }))
        .sort((a, b) => {
        const c = PRIORITY_RANK[a.card.cls] - PRIORITY_RANK[b.card.cls];
        if (c !== 0)
            return c;
        const p = PRI_RANK[a.event.priority] - PRI_RANK[b.event.priority];
        if (p !== 0)
            return p;
        return SEV_RANK[a.event.severity] - SEV_RANK[b.event.severity];
    });
}
export const _internal = { CARD_LABEL, CARD_GUIDANCE };
//# sourceMappingURL=drift-explain.js.map