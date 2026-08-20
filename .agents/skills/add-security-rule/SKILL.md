---
name: add-security-rule
description: Add, split, merge, or change an AgentReveal security rule with complete severity, priority, grouping, remediation, verification, acceptance, documentation, and privacy semantics. Use whenever finding IDs or rule behavior changes, including new adapter findings and cross-Agent rules.
---

# Add or change a security rule

Treat a rule as a user action contract, not merely a detector condition.

## 1. Prove the rule is needed

1. Read `AGENTS.md`, `src/rules/ids.ts`, `src/rules/action-matrix.ts`, and `docs/rule-disposition-matrix.md`.
2. Search existing finding IDs and group families for the same root cause.
3. Add a new rule only when the user needs different rationale, action, verification, acceptance, grouping, or severity.
4. Keep framework fallback `DEEPSCAN_FAILED` outside the concrete RuleId matrix.

## 2. Implement the complete contract

Update all applicable layers in one change:

1. Produce the finding in the relevant adapter/core rule code using redacted evidence.
2. Add the ID to `RULE_IDS` in a stable section.
3. Add a `FindingAction` to `ACTION_MATRIX`.
4. Choose each field independently:
   - `severity`: potential impact.
   - `priority`: recommended action order.
   - `confidence`: strength of current evidence.
   - `disposition`: fix, review, cleanup, or observe.
   - `fixMode`: baseline, guided, manual, or none.
5. Define concrete rationale, next steps, verification, and safe `acceptWhen` when acceptance is meaningful.
6. Choose `group.family` and minimal `evidenceKeys` so one root cause merges while distinct endpoints, paths, MCPs, and Agents remain separate.
7. Add remediation only for commands the target Agent and platform actually support.
8. Declare baseline profiles as `resolve` or `mitigate` based on real write behavior, never intent.
9. Add the row to `docs/rule-disposition-matrix.md` and update capability docs if user-visible scope changes.

## 3. Test semantics and privacy

- Test positive, negative, malformed, disabled, environment-reference, and trusted/internal Provider cases as applicable.
- Assert the complete findings and report serialization exclude every synthetic credential.
- Test task identity stability and non-merging of distinct evidence instances.
- Test that acceptance hides only the project-scoped task and preserves audit evidence.
- Test that Provider trust does not suppress insecure HTTP, plaintext credentials, or permissions.
- Update expected rule totals only after the source, RuleId list, matrix, and readable document contain the same IDs.

## 4. Validate

```bash
npm run build
node --test test/action-matrix.test.mjs test/action-plan.test.mjs test/remediation.test.mjs
npm run check
npm run sanitize:staged
```

Reject completion when a rule lacks a user action, duplicates an existing rule, stores raw evidence, uses severity as priority,
or offers acceptance without a specific safe condition.
