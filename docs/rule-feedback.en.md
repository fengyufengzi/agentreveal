# AgentReveal Minimal Rule Feedback

[简体中文](rule-feedback.md)

This feedback is only for checking whether a high-value rule matches user expectations. It does not replace the broader
Pilot experience form. AgentReveal never uploads it automatically; the command only prints one minimal JSON object in the
current terminal.

## Generate feedback

Copy a stable rule ID from the scan result, then select a judgment and action outcome:

```bash
agentreveal feedback \
  --rule GEMINI_MCP_TRUST_BYPASS \
  --judgment expected \
  --outcome resolved
```

The output contains only `schemaVersion`, `command`, `productVersion`, `ruleId`, `judgment`, and `actionOutcome`. The command
does not read HOME, configuration, reports, or diagnostics; it does not write a file or make a network request. Users may
explicitly redirect the output after reviewing it.

`judgment` is one of `expected`, `false-positive`, or `unclear`. `actionOutcome` is one of `not-attempted`, `resolved`,
`mitigated`, `still-present`, `accepted`, `ignored`, or `abandoned`.

The strict contract rejects every additional field, including task IDs, timestamps, paths, endpoints, configuration,
reports, diagnostics, screenshots, credential values, and free-form comments. Submit the same fields through the dedicated
GitHub “Rule quality feedback” form; never attach a complete JSON/HTML report or configuration file.

Maintainers must not change or delete a rule from a single response or low frequency. A rule change requires a reproducible
synthetic positive/negative scenario and matching minimal real-world feedback, followed by the repository's complete
`add-security-rule` and compatibility review workflow. Sensitive-output reports must be handled privately as security
issues, not ordinary quality feedback.
