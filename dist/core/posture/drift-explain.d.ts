/**
 * Drift 对比解释卡：把 DriftEvent 的 (kind, change, severity) 派生为人类可读的"分类标签"，
 * 让终端与 HTML 报告共用一套语义。
 *
 * 重要约束（沿用 ADR-0002/0005 与 output-contract v1）：
 *   - 不改 DriftEvent schema，不新增 enum；
 *   - 此层只用于 view/present，CLI/JSON 仍按现有 contract 输出；
 *   - 派生是纯函数，可在 render 阶段调用。
 */
import type { DriftEvent, DriftEventKind, DriftChangeKind } from "./types.js";
export declare const DRIFT_CARD_CLASSES: readonly ["new-coverage", "lost-coverage", "changed-coverage", "conflict", "expansion", "contraction", "regression", "policy-expired", "agent-lifecycle", "agent-version"];
export type DriftCardClass = (typeof DRIFT_CARD_CLASSES)[number];
export declare function classifyDriftEvent(event: DriftEvent): DriftCardClass;
export declare function cardLabel(cls: DriftCardClass): string;
export declare function cardGuidance(cls: DriftCardClass): string;
export interface DriftCard {
    cls: DriftCardClass;
    label: string;
    guidance: string;
}
export declare function buildDriftCard(event: DriftEvent): DriftCard;
/**
 * 派生"上次 vs 这次"对比行：仅在 previousCategory 存在时输出。
 * 输出形如 "上次：environment · 这次：session[active]"。
 * 渲染层会 HTML 转义。
 */
export declare function previousVsCurrent(event: DriftEvent): string | undefined;
/**
 * helper：把 DriftEvent 列表按"分类 → priority → severity"稳定排序。
 * 不改原数组顺序的对外契约，仅供 view 层使用。
 */
export declare function sortByCardPriority(events: readonly DriftEvent[]): Array<{
    event: DriftEvent;
    card: DriftCard;
}>;
export declare const _internal: {
    CARD_LABEL: Record<"new-coverage" | "lost-coverage" | "changed-coverage" | "conflict" | "expansion" | "contraction" | "regression" | "policy-expired" | "agent-lifecycle" | "agent-version", string>;
    CARD_GUIDANCE: Record<"new-coverage" | "lost-coverage" | "changed-coverage" | "conflict" | "expansion" | "contraction" | "regression" | "policy-expired" | "agent-lifecycle" | "agent-version", string>;
};
export type { DriftEvent, DriftEventKind, DriftChangeKind };
