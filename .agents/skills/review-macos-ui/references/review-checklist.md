# AgentReveal macOS UI review checklist

Use this checklist to plan and verify a review. Select only applicable rows, but never skip privacy, primary workflow, or accessibility when changing interactive UI.

## Review dimensions

| Dimension | Questions | Completion evidence |
|---|---|---|
| Primary workflow | Is the next action obvious? Can the user move from scope selection through scan, Top 3, action, and verification without learning internal architecture? | Rendered path and interaction test |
| Information hierarchy | Are task title, rationale, next action, Agent, priority, and severity ordered by decision value? Is technical evidence progressively disclosed? | Screenshot at normal and narrow widths |
| State feedback | Are idle, loading, success, cancellation, partial failure, error, empty, and disabled states distinguishable and truthful? | Synthetic state or reproducible walkthrough |
| macOS behavior | Do menus, shortcuts, dialogs, focus, window sizing, appearance, motion, and terminology feel native? | Packaged app or targeted Electron preview |
| Accessibility | Are landmarks, headings, tab order, focus destinations, names, descriptions, live announcements, contrast, non-color cues, reduced motion, and zoom usable? | Accessibility test plus keyboard walkthrough |
| Privacy and trust | Does copy accurately describe local processing, scope, read-only behavior, redaction, confirmation, backup, and recovery? Is no sensitive fixture data introduced? | Source review and sanitizer |
| Responsive layout | Does content remain readable at the minimum supported window, with long paths, long Chinese/English labels, and dense task data? | Compact screenshot and overflow inspection |
| Visual system | Are typography, spacing, radii, borders, shadows, status colors, and control hierarchy drawn from shared tokens and existing patterns? | Style diff and light/dark comparison |
| Interaction integrity | Are controls guarded while working? Are destructive or policy actions secondary and confirmed? Does completion trigger a rescan or verified state where required? | Renderer behavior and relevant tests |
| Regression safety | Can the changed state be rendered from synthetic data and protected by a focused assertion? | Updated fixture/test and clean visual capture |

## Minimum state matrix

Review the states touched by the change:

- First launch and project selection.
- Machine-scan alternative and permission explanation.
- Scan in progress.
- Results with urgent, review, clear, and cross-Agent states.
- Global Top 3 navigation and Agent switching.
- Task summary, expanded evidence, and remediation guidance.
- Report and policy menus.
- Risk acceptance, Provider trust, and rule-ignore dialogs.
- Baseline preview, native confirmation, applied state, verification, and restore.
- Cancellation, recoverable error, partial scan failure, and no configured Agent.
- Light, dark, high contrast, reduced transparency, reduced motion, and compact window.

Do not add every state to every review. Add missing synthetic coverage when a state is central to the requested change.

## Figma comparison

When a Figma source is available, compare:

1. Frame dimensions and intended platform.
2. Component and variant names.
3. Typography roles rather than isolated font sizes.
4. Color and spacing tokens rather than sampled one-off values.
5. Default, hover, focus, disabled, loading, selected, error, and expanded variants.
6. Keyboard and screen-reader behavior that static frames cannot express.
7. macOS and AgentReveal safety differences that justify intentional divergence.

Treat a Figma frame as incomplete when it omits an operational state. Fill the gap using product semantics and record the decision instead of guessing silently.

## Review note format

For each actionable issue, record:

```text
等级：阻断 / 重要 / 打磨
状态：受影响的页面或交互状态
证据：截图、Figma frame、代码或可复现步骤
问题：用户实际遇到的困难
目标：可观察的改进结果
验证：截图、键盘步骤或测试命令
```
