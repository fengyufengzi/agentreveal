import type { RiskFinding } from "../../adapters/types.js";
import { RULE_IDS, type RuleId } from "../../rules/ids.js";
import type {
  ConfigSourceStatus,
  EffectiveConfigSource,
} from "./types.js";

const RULE_SET = new Set<string>(RULE_IDS);

export function findingRuleIds(findings: readonly RiskFinding[]): RuleId[] {
  return [
    ...new Set(
      findings
        .map((finding) => finding.id)
        .filter((id): id is RuleId => RULE_SET.has(id))
    ),
  ].sort((left, right) => left.localeCompare(right));
}

export interface SourceContribution {
  source: Omit<EffectiveConfigSource, "status" | "fields">;
  fields: string[];
  activeFields: Set<string>;
  overriddenFields: Set<string>;
  unreadable?: boolean;
}

export function sourceStatus(input: SourceContribution): ConfigSourceStatus {
  if (input.unreadable) return "unreadable";
  if (input.activeFields.size > 0 && input.overriddenFields.size > 0) {
    return "conflicting";
  }
  if (input.activeFields.size > 0) return "active";
  return "overridden";
}

export function effectiveSources(
  contributions: readonly SourceContribution[]
): EffectiveConfigSource[] {
  return contributions.map((entry) => ({
    ...entry.source,
    status: sourceStatus(entry),
    fields: [...new Set(entry.fields)].sort((left, right) =>
      left.localeCompare(right)
    ),
  }));
}

export function markFieldWinners(
  contributions: SourceContribution[]
): void {
  const winners = new Map<string, number>();
  contributions.forEach((entry, index) => {
    if (entry.unreadable) return;
    for (const field of entry.fields) winners.set(field, index);
  });
  contributions.forEach((entry, index) => {
    for (const field of entry.fields) {
      if (winners.get(field) === index) entry.activeFields.add(field);
      else entry.overriddenFields.add(field);
    }
  });
}
