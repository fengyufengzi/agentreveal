#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const manifest = JSON.parse(
  readFileSync(join(repoRoot, "evals", "tasks.json"), "utf8")
);

assert.equal(manifest.schemaVersion, 1, "未知的 AI 评测 schemaVersion");
assert.ok(Array.isArray(manifest.tasks), "evals.tasks 必须是数组");
assert.ok(manifest.tasks.length >= 5, "至少保留五个跨领域冷启动任务");

const ids = new Set();
const modes = new Map();
const forbiddenPromptHints =
  /(?:src|test|desktop|docs|scripts)\/|AGENTS\.md|SKILL\.md|ACTION_MATRIX|CODEOWNERS|npm run check/;

for (const task of manifest.tasks) {
  assert.match(task.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, "评测 ID 必须使用 kebab-case");
  assert.equal(ids.has(task.id), false, `重复评测 ID：${task.id}`);
  ids.add(task.id);
  assert.equal(typeof task.category, "string", `${task.id} category`);
  assert.ok(
    task.expectedMode === "implement" || task.expectedMode === "challenge",
    `${task.id} expectedMode`
  );
  modes.set(task.expectedMode, (modes.get(task.expectedMode) || 0) + 1);
  assert.ok(
    Number.isInteger(task.timeboxMinutes) &&
      task.timeboxMinutes >= 15 &&
      task.timeboxMinutes <= 60,
    `${task.id} timeboxMinutes`
  );
  assert.equal(typeof task.prompt, "string", `${task.id} prompt`);
  assert.ok(task.prompt.length >= 30 && task.prompt.length <= 300, `${task.id} prompt length`);
  assert.doesNotMatch(
    task.prompt,
    forbiddenPromptHints,
    `${task.id} prompt 泄露了仓库路径、技能或验证答案`
  );
  assert.ok(Array.isArray(task.requiredChecks) && task.requiredChecks.length > 0);
  assert.ok(task.requiredChecks.includes("npm run check"), `${task.id} 必须执行完整门禁`);
  assert.ok(Array.isArray(task.evaluationCriteria) && task.evaluationCriteria.length >= 3);
  assert.ok(Array.isArray(task.forbiddenOutcomes) && task.forbiddenOutcomes.length >= 3);
  for (const item of [...task.evaluationCriteria, ...task.forbiddenOutcomes]) {
    assert.equal(typeof item, "string", `${task.id} rubric item`);
    assert.ok(item.trim().length >= 8, `${task.id} rubric item length`);
  }
}

assert.ok((modes.get("implement") || 0) >= 2, "至少需要两个正常实现任务");
assert.ok((modes.get("challenge") || 0) >= 2, "至少需要两个应质疑或拒绝的任务");

console.log(
  `✓ AI 冷启动评测定义通过（${manifest.tasks.length} 个任务：${modes.get("implement")} 个实现，${modes.get("challenge")} 个边界挑战）`
);
