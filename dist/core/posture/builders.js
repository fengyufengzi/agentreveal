import { RULE_IDS } from "../../rules/ids.js";
const RULE_SET = new Set(RULE_IDS);
export function findingRuleIds(findings) {
    return [
        ...new Set(findings
            .map((finding) => finding.id)
            .filter((id) => RULE_SET.has(id))),
    ].sort((left, right) => left.localeCompare(right));
}
export function sourceStatus(input) {
    if (input.unreadable)
        return "unreadable";
    if (input.activeFields.size > 0 && input.overriddenFields.size > 0) {
        return "conflicting";
    }
    if (input.activeFields.size > 0)
        return "active";
    return "overridden";
}
export function effectiveSources(contributions) {
    return contributions.map((entry) => ({
        ...entry.source,
        status: sourceStatus(entry),
        fields: [...new Set(entry.fields)].sort((left, right) => left.localeCompare(right)),
    }));
}
export function markFieldWinners(contributions) {
    const winners = new Map();
    contributions.forEach((entry, index) => {
        if (entry.unreadable)
            return;
        for (const field of entry.fields)
            winners.set(field, index);
    });
    contributions.forEach((entry, index) => {
        for (const field of entry.fields) {
            if (winners.get(field) === index)
                entry.activeFields.add(field);
            else
                entry.overriddenFields.add(field);
        }
    });
}
//# sourceMappingURL=builders.js.map