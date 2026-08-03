---
name: review-macos-ui
description: Review and iteratively improve the AgentGuard macOS Desktop interface using the current product direction, synthetic visual states, optional Figma source designs, real-app inspection, accessibility semantics, and repository validation. Use for requests to audit, redesign, polish, compare, or continue a UI/UX iteration involving desktop/index.html, desktop/renderer.js, desktop/styles.css, macOS menus, dialogs, loading/error/empty states, keyboard focus, VoiceOver structure, responsive layouts, or visual regression.
---

# Review macOS UI

Improve AgentGuard's macOS experience without changing its security semantics or creating a second product model. Treat the running application and current code as implementation truth; treat Figma as a design reference when one is supplied.

Always read [references/review-checklist.md](references/review-checklist.md) completely before reviewing or changing the UI.

## 1. Establish scope and authority

1. Run `git status --short` and preserve existing changes.
2. Read `AGENTS.md`, `docs/README.md`, `docs/PRODUCT_DIRECTION.md`, the Desktop sections of `docs/product-capabilities.md`, and Accepted Desktop ADRs.
3. Inspect the relevant renderer, markup, styles, preview fixtures, and tests. Do not infer current behavior from old screenshots or plans.
4. Classify the request:
   - **Review/report:** inspect and report evidence; do not edit files.
   - **Design change:** implement, render, inspect, test, and document the change.
   - **Figma comparison:** read the supplied Figma source through the installed Figma connector when available, then compare it with the running app.
   - **Real-app walkthrough:** use Computer Use only when the user asks for operating the actual macOS app or when a rendered behavior cannot be verified from synthetic previews.
5. State the intended user outcome and the UI states in scope before editing.

If the request changes Desktop IPC, preload APIs, native dialogs, file access, or main-process behavior, also load `.agents/skills/change-desktop-ipc/SKILL.md` before editing. A visual request alone does not authorize a new privilege boundary.

## 2. Build an evidence baseline

Use the smallest evidence set that covers the requested states:

- Read `desktop/index.html`, `desktop/renderer.js`, and the relevant sections of `desktop/styles.css`.
- Read `test/desktop-accessibility.test.mjs`, `test/desktop-smoke.test.mjs`, and any feature-specific Desktop tests.
- Review `scripts/capture-desktop-preview.cjs` before trusting its fixtures or state coverage.
- Generate screenshots outside the repository:

```bash
preview_dir=$(mktemp -d /tmp/agentguard-ui-review.XXXXXX)
npm run desktop:preview:capture -- "$preview_dir"
```

- Inspect the relevant PNGs visually. Do not declare a visual change complete from source inspection alone.
- For a supplied Figma file, record which frame, component, variant, or token is being compared. Do not silently substitute another frame.

Never use live Agent configuration, endpoints, credentials, project names, or local reports for visual fixtures. Use only synthetic `example.com`, `/Users/example/project`, and obvious placeholder data.

## 3. Choose findings before changes

Rank UI findings without reusing AgentGuard security priorities:

- **阻断:** the user cannot complete or understand the primary workflow, focus is lost, content is inaccessible, or a UI claim is unsafe.
- **重要:** hierarchy, state feedback, discoverability, native behavior, or responsive layout materially slows the workflow.
- **打磨:** visual consistency or microcopy improvements that do not block the workflow.

For each finding, identify:

1. The affected state and user task.
2. Observable evidence from code, screenshot, Figma, or the running app.
3. The desired behavior.
4. The smallest safe implementation surface.
5. The verification method.

Avoid broad restyles when a smaller hierarchy, spacing, focus, copy, or state correction solves the problem.

## 4. Implement within the product boundary

- Preserve the core path: select project or choose machine scan → understand Top 3 → inspect evidence → act or accept → rescan/verify.
- Keep security severity distinct from action priority. Do not communicate either by color alone.
- Keep renderer business-free and unprivileged. Reuse typed core data and existing actions.
- Maintain local-only, read-only, explicit confirmation, backup, restore, and redaction promises in visible copy.
- Prefer macOS-native conventions for menus, focus, dialogs, window sizing, keyboard shortcuts, system appearance, reduced motion, and high contrast.
- Keep one clear primary action per state. Put evidence and exceptional policy actions behind progressive disclosure when appropriate.
- Preserve semantic HTML first. Add ARIA only where native semantics are insufficient.
- Keep dynamic controls unavailable with both visual and semantic feedback while operations run.
- Update synthetic preview fixtures when a changed state would otherwise be unreviewable.
- Update authoritative capability or user-step documentation when behavior changes.

Do not:

- invent new findings, remediation semantics, or success states in the renderer;
- claim an operation completed before core verification;
- copy a Figma layout that weakens keyboard access, privacy explanations, confirmation, or recovery;
- add arbitrary shell, file, network, or navigation access for a design convenience;
- commit generated screenshots, videos, reports, logs, release bundles, or local paths.

## 5. Render and iterate

After each coherent change:

1. Run syntax or targeted tests early.
2. Regenerate the affected synthetic screenshots.
3. Inspect light, dark, and the narrowest supported window when layout changed.
4. Inspect loading, success, cancellation, error, empty, expanded, and dialog states when the task touches them.
5. Check focus destination, tab order, accessible name, announcement behavior, and reduced-motion handling.
6. Compare again with Figma when it is the stated source, documenting intentional platform or safety differences.
7. Iterate until the rendered result and interaction semantics agree.

If the current fixture set cannot express an important state, add a synthetic state to `scripts/capture-desktop-preview.cjs` and a regression assertion. Never solve this by reading live local data.

## 6. Validate proportionally

For a read-only review, use the relevant source, targeted tests, and synthetic screenshots as the minimum evidence set. Run syntax checks and targeted Desktop tests when they help confirm a finding, but do not require `npm run check` or `npm run desktop:pack` when no files changed. Clearly label native dialogs, focus restoration, VoiceOver speech, and real scan timing as unverified unless the actual app was operated.

For Desktop presentation-only changes, run at minimum:

```bash
node --check desktop/renderer.js
node --test test/desktop-accessibility.test.mjs test/desktop-smoke.test.mjs
npm run desktop:preview:capture -- "$(mktemp -d /tmp/agentguard-ui-review.XXXXXX)"
git diff --check
```

Before reporting an implemented iteration complete, also run:

```bash
npm run check
npm run desktop:pack
```

Add the `change-desktop-ipc` validation set whenever the change crosses the renderer/main boundary. If a required command cannot run, state exactly which validation remains incomplete.

## 7. Report the outcome

Lead with what changed for the user. Include:

- states reviewed or changed;
- important intentional differences from Figma;
- accessibility and privacy effects;
- screenshots or files worth opening;
- exact validation results;
- remaining manual checks such as VoiceOver or real-device behavior.

Do not call an automated semantic check a complete VoiceOver walkthrough.
