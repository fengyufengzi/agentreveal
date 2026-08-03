import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const html = readFileSync(join(repoRoot, "desktop", "index.html"), "utf8");
const renderer = readFileSync(join(repoRoot, "desktop", "renderer.js"), "utf8");
const css = readFileSync(join(repoRoot, "desktop", "styles.css"), "utf8");

test("desktop accessibility: landmarks、状态和对话框具备稳定名称", () => {
  assert.match(html, /<main id="mainContent"[^>]+aria-labelledby="viewTitle"/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /role="alert" aria-live="assertive" aria-atomic="true"/);
  assert.match(html, /role="progressbar" aria-label="操作正在进行"/);
  for (const dialog of ["accept", "trust", "ignore"]) {
    assert.match(
      html,
      new RegExp(`<dialog id="${dialog}Dialog" aria-labelledby="${dialog}Title" aria-describedby="${dialog}Description"`)
    );
  }
});

test("desktop accessibility: 异步操作禁用动态区域并管理结果焦点", () => {
  assert.match(renderer, /content\.toggleAttribute\("inert", shouldInertContent\)/);
  assert.match(renderer, /state\.initialScanState !== "scanning"/);
  assert.match(renderer, /setDialogControlsWorking\(working\)/);
  assert.match(renderer, /aria-busy/);
  assert.match(renderer, /focusResultsHeading/);
  assert.match(renderer, /focusTask/);
  assert.match(renderer, /focusInitialScanHeading/);
  assert.match(renderer, /focusInitialScanError/);
  assert.match(renderer, /id="postureSectionTitle" tabindex="-1"/);
  assert.match(renderer, /postureSectionTitle"\)\?\.focus/);
  assert.match(renderer, /aria-labelledby="initialScanTitle" aria-describedby="initialScanDescription"/);
  assert.match(renderer, /id="initialScanTitle" tabindex="-1"/);
  assert.match(renderer, /id="initialScanErrorTitle" tabindex="-1"/);
  assert.match(renderer, /aria-label="已确认的检查范围"/);
  assert.match(renderer, /prefers-reduced-motion: reduce/);
  assert.match(renderer, /addEventListener\("cancel"/);
  assert.match(renderer, /if \(state\.working\) event\.preventDefault\(\)/);
});

test("desktop accessibility: Top 3、任务层级和标签页语义保持完整", () => {
  assert.match(renderer, /class="priority-queue" aria-labelledby="priorityQueueTitle"/);
  assert.match(renderer, /\.slice\(0, 3\)/);
  assert.match(renderer, /data-priority-task/);
  assert.match(renderer, /data-priority-drift/);
  assert.match(renderer, /class="sr-only">优先级/);
  assert.match(renderer, /aria-labelledby="\$\{headingId\}" aria-describedby="\$\{rationaleId\}"/);
  assert.match(renderer, /role="tabpanel"/);
  assert.match(renderer, /aria-labelledby="\$\{selectedTabId\}"/);
  assert.match(renderer, /较低优先级任务/);
  assert.match(css, /\.task-card:focus/);
  assert.match(css, /\.sr-only/);
  assert.match(css, /\.operation-progress/);
  assert.match(css, /\.initial-scan-view/);
  assert.match(css, /\.posture-workspace/);
  assert.match(css, /\.drift-event:focus/);
  assert.match(css, /body:not\(\.has-overview\)\.has-standalone-status \.scan-context-row/);
});
