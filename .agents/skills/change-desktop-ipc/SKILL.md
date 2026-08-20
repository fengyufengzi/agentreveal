---
name: change-desktop-ipc
description: Add or modify AgentReveal Electron desktop IPC, preload APIs, renderer actions, diagnostics, and typed desktop service operations while preserving sandboxing and path authorization. Use for any desktop feature that crosses the renderer/main boundary or invokes native dialogs, file writes, reports, risk operations, or baseline actions.
---

# Change desktop IPC

Keep business semantics in the typed service and keep the renderer unprivileged.

## 1. Map the operation

1. Read `AGENTS.md`, `src/desktop/service.ts`, `desktop/main.cjs`, `desktop/preload.cjs`, and the closest existing flow.
2. Decide whether the operation is read-only, user-selected output, project-scoped state, or protected configuration write.
3. Reuse a core function through `src/desktop/service.ts`; do not parse CLI stdout or duplicate rule behavior in Electron.

## 2. Implement the boundary

- Add a narrow service method with typed input and output when business data changes.
- Expose one explicit `agentreveal:<operation>` handler in the main process.
- Call `assertMainFrame(event)` before processing.
- Validate every enum, ID, string length, fingerprint, path, and optional value in the main process.
- Require `assertApprovedProject` for project-scoped operations.
- Obtain arbitrary input/output paths from native selection dialogs; never accept renderer-supplied unrestricted paths.
- Require native confirmation plus current preview fingerprint for configuration writes.
- Add only the exact preload function needed by the renderer.
- Keep `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, navigation denial, and restrictive CSP.
- Do not introduce `child_process`, `shell: true`, arbitrary URL opening, or general file APIs.

## 3. Add privacy-safe diagnostics

- Add the fixed operation name to `desktop/diagnostics.cjs`.
- Wrap the main operation with `tracked()` or record the same started/success/failure/canceled lifecycle.
- Store only the operation, timestamp, outcome, and fixed error category.
- Never pass arguments, paths, endpoints, taskIds, config fragments, or raw errors into diagnostics.
- Keep diagnostic failure non-fatal to the primary operation.

## 4. Test and present the flow

- Add service tests for typed behavior, stable taskId, policy boundaries, and write recovery where applicable.
- Extend desktop smoke tests for main/preload/renderer wiring and prohibited capabilities.
- Extend executable main-process handler tests for frame checks, project authorization, invalid inputs, and denied native access;
  regex-only smoke coverage is not sufficient for a privileged boundary.
- Test diagnostic allowlisting and redaction for the new operation.
- Make renderer busy/error/cancel states explicit; do not imply success before a rescan verifies it.
- Update README, capability docs, pilot instructions, and release acceptance when the user workflow changes.

## 5. Validate

```bash
npm run build
node --test test/desktop-service.test.mjs test/desktop-smoke.test.mjs test/desktop-ipc-boundary.test.mjs test/desktop-diagnostics.test.mjs
npm run check
npm run desktop:pack
```

Inspect the packaged app for the expected assets and launch it once. Reject completion if the renderer can choose arbitrary paths,
bypass confirmation, invoke a generic command, or persist sensitive diagnostic context.
