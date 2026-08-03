import type { RiskFinding } from "../../adapters/types.js";
import { type RuleId } from "../../rules/ids.js";
import type { ConfigSourceStatus, EffectiveConfigSource } from "./types.js";
export declare function findingRuleIds(findings: readonly RiskFinding[]): RuleId[];
export interface SourceContribution {
    source: Omit<EffectiveConfigSource, "status" | "fields">;
    fields: string[];
    activeFields: Set<string>;
    overriddenFields: Set<string>;
    unreadable?: boolean;
}
export declare function sourceStatus(input: SourceContribution): ConfigSourceStatus;
export declare function effectiveSources(contributions: readonly SourceContribution[]): EffectiveConfigSource[];
export declare function markFieldWinners(contributions: SourceContribution[]): void;
