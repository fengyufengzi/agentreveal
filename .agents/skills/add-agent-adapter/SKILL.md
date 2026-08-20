---
name: add-agent-adapter
description: Add or extend an AgentReveal adapter for an AI coding agent, including discovery, privacy-preserving parsing, findings, registration, synthetic fixtures, tests, and support documentation. Use for new Agent support, new config locations or formats, or deeper scanning of an existing adapter.
---

# Add an Agent adapter

Implement adapter work without reading real user configuration during tests or allowing credential values into outputs.

## 1. Establish scope

1. Read `AGENTS.md`, `src/adapters/types.ts`, `src/adapters/index.ts`, and the closest existing adapter.
2. Confirm the Agent and configuration format are within the current product direction.
3. Decide separately which behavior belongs to discovery, parsing, rules, remediation, and baseline.
4. Prefer extending an existing adapter when the source and semantics are the same.

## 2. Preserve the adapter boundary

- Implement `discover()` as a tolerant, read-only existence and location check.
- Return `configFound: false` rather than throwing when an optional tool is absent.
- Keep format parsing in `parse.ts`; normalize only fields required by findings.
- Keep rule production in `risk.ts`; do not mix user-facing action semantics into parser code.
- Register the adapter in `src/adapters/index.ts` and add its stable `AgentId` in `src/adapters/types.ts`.
- Reuse `classifyBaseUrl` and project Provider policy instead of maintaining a private endpoint classifier.

## 3. Enforce privacy

- Never return raw credential values from parse functions.
- Represent secrets with existence, key names, counts, or the repository's irreversible fingerprint pattern.
- Do not copy arbitrary config objects into evidence or exception messages.
- Do not read the contents of credential-only files during discovery when existence is sufficient.
- Use synthetic values, `example.com`, and `/Users/example/project` in fixtures and docs.

## 4. Add complete behavior

1. Add discovery tests for missing, default, overridden, and malformed paths.
2. Add parser tests for supported fields, environment references, missing optional fields, and damaged input.
3. Add finding tests for positive, negative, and boundary cases.
4. Serialize the complete findings result and assert every synthetic secret value is absent.
5. If adding RuleIds, switch to `$add-security-rule` and complete the action matrix workflow.
6. If adding baseline writes, add dry-run, permission preservation, backup, concurrent-change, rollback, and restore tests.
7. Update README, `docs/product-capabilities.md`, and research evidence when support claims or config paths change.

## 5. Validate

Run the adapter test first, then the full repository gate:

```bash
npm run build
node --test test/<agent>.test.mjs
npm run check
npm run sanitize:staged
```

Reject completion if the adapter needs a real home directory, leaks a synthetic credential, silently swallows parse failure, or
claims cross-platform support that has not been tested.
