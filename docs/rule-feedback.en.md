# Minimal Rule Feedback

[简体中文](rule-feedback.md)

This workflow checks whether one rule that already appeared matches user expectations. It does not replace broader Pilot
feedback and is not the channel for application failures, feature requests, or security vulnerabilities. The public Pilot
collects only the minimal fields through a dedicated GitHub Issue form; users do not upload scan reports.

## Submit feedback

1. Find the stable rule ID in the CLI, HTML report, or macOS Desktop technical details. Do not use a `task-...` ID.
2. Open **New issue → Rule quality feedback** in this repository.
3. Submit one rule per Issue and keep the title prefix unchanged.
4. Select a judgment and action outcome, confirm the privacy statement, and submit.

The form requests only the product version, `ruleId`, `judgment`, and `actionOutcome`. `judgment` is `expected`,
`false-positive`, or `unclear`. `actionOutcome` is `not-attempted`, `resolved`, `mitigated`, `still-present`, `accepted`,
`ignored`, or `abandoned`. Select `resolved` only after a rescan confirms that the rule is gone.

Do not put configuration, JSON/HTML reports, diagnostics, screenshots, local paths, usernames, internal endpoints, model
names, task IDs, credentials, environment variable values, reasons, environment descriptions, or other free-form text in
the title, fields, comments, or attachments.

If the product exposed sensitive information that should not have appeared, do not open a public Issue. Report it privately
through the repository Security Advisory instead.

Maintainers treat one response only as a directional signal. A detector, severity, priority, or grouping change requires
reproducible synthetic positive and negative cases plus multiple independent minimal real-world responses supporting the same
conclusion. Missing or low-volume feedback is never sufficient grounds for removing a rule.
