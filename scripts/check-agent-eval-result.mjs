#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const scoreKeys = [
  "repositoryDiscovery",
  "behaviorCorrectness",
  "securityPrivacy",
  "validationQuality",
  "contributionCompleteness",
];
const localOrSecret =
  /(?:\/Users\/|\/home\/|\/var\/folders\/|[A-Za-z]:\\|gh[opsu]_[A-Za-z0-9]+|sk-[A-Za-z0-9_-]{12,})/;

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} 字段不符合脱敏摘要契约`);
  }
}

function safeSummary(value, label, minimum = 8, maximum = 500) {
  if (typeof value !== "string") throw new Error(`${label} 必须是字符串`);
  if (value.trim().length < minimum || value.length > maximum) {
    throw new Error(`${label} 长度无效`);
  }
  if (localOrSecret.test(value)) throw new Error(`${label} 包含本机路径或疑似凭证`);
}

export function validateAgentEvalResult(result, manifest) {
  exactKeys(
    result,
    ["schemaVersion", "evaluatedAt", "baselineCommit", "model", "status", "averageScore", "tasks"],
    "评测结果"
  );
  assert.equal(result.schemaVersion, 1, "未知的评测结果 schemaVersion");
  assert.ok(Number.isFinite(new Date(result.evaluatedAt).getTime()), "evaluatedAt 必须是有效时间");
  if (!/^[a-f0-9]{40}$/.test(result.baselineCommit)) {
    throw new Error("baselineCommit 必须是完整 Git SHA");
  }
  safeSummary(result.model, "model", 2, 100);
  assert.ok(result.status === "pass" || result.status === "fail", "status 仅支持 pass/fail");
  assert.ok(Array.isArray(result.tasks), "tasks 必须是数组");

  const definitions = new Map(manifest.tasks.map((task) => [task.id, task]));
  assert.equal(result.tasks.length, definitions.size, "结果必须覆盖全部评测任务");
  const seen = new Set();
  let scoreSum = 0;
  let blockingIssueCount = 0;

  for (const task of result.tasks) {
    if (!task || typeof task !== "object" || !definitions.has(task.id)) {
      throw new Error("结果包含未知评测任务");
    }
    if (seen.has(task.id)) throw new Error("结果包含重复评测任务");
    exactKeys(task, ["id", "summary", "scores", "totalScore", "checks", "reviewIssues"], task.id);
    seen.add(task.id);
    safeSummary(task.summary, `${task.id}.summary`, 10, 500);

    exactKeys(task.scores, scoreKeys, `${task.id}.scores`);
    for (const key of scoreKeys) {
      assert.ok(Number.isInteger(task.scores[key]) && task.scores[key] >= 0 && task.scores[key] <= 2, `${task.id}.${key}`);
    }
    const total = scoreKeys.reduce((sum, key) => sum + task.scores[key], 0);
    assert.equal(task.totalScore, total, `${task.id}.totalScore 与分项不一致`);
    scoreSum += total;

    assert.ok(Array.isArray(task.checks), `${task.id}.checks 必须是数组`);
    const checks = new Map();
    for (const check of task.checks) {
      exactKeys(check, ["command", "status", "runBy"], `${task.id}.check`);
      safeSummary(check.command, `${task.id}.check.command`, 3, 120);
      assert.ok(["passed", "failed", "not-run"].includes(check.status), `${task.id}.check.status`);
      assert.ok(["agent", "evaluator"].includes(check.runBy), `${task.id}.check.runBy`);
      assert.equal(checks.has(check.command), false, `${task.id} 重复记录命令：${check.command}`);
      checks.set(check.command, check);
    }
    for (const command of definitions.get(task.id).requiredChecks) {
      assert.equal(checks.has(command), true, `${task.id} 缺少 requiredCheck 证据：${command}`);
      const evidence = checks.get(command);
      if (evidence.status !== "passed" || evidence.runBy !== "agent") {
        assert.ok(task.scores.validationQuality <= 1, `${task.id} 未由 agent 通过 requiredChecks，验证质量不得记 2 分`);
      }
    }

    assert.ok(Array.isArray(task.reviewIssues), `${task.id}.reviewIssues 必须是数组`);
    for (const issue of task.reviewIssues) {
      exactKeys(issue, ["priority", "summary"], `${task.id}.reviewIssue`);
      assert.ok(["P0", "P1", "P2", "P3"].includes(issue.priority), `${task.id}.reviewIssue.priority`);
      safeSummary(issue.summary, `${task.id}.reviewIssue.summary`, 8, 300);
      if (issue.priority === "P0" || issue.priority === "P1") blockingIssueCount += 1;
    }
  }

  const average = Number((scoreSum / result.tasks.length).toFixed(2));
  assert.equal(result.averageScore, average, "averageScore 与任务分数不一致");
  const expectedStatus = average >= 8 && blockingIssueCount === 0 ? "pass" : "fail";
  assert.equal(result.status, expectedStatus, "status 与准入线或阻断问题不一致");
  return { averageScore: average, status: expectedStatus, blockingIssueCount };
}

function isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const resultPath = process.argv[2];
  if (!resultPath) {
    console.error("用法：npm run evals:result:check -- /path/to/sanitized-result.json");
    process.exitCode = 2;
  } else {
    try {
      const result = JSON.parse(readFileSync(resolve(resultPath), "utf8"));
      const manifest = JSON.parse(readFileSync(join(repoRoot, "evals", "tasks.json"), "utf8"));
      const summary = validateAgentEvalResult(result, manifest);
      console.log(`✓ AI 评测脱敏摘要通过（平均 ${summary.averageScore}/10，${summary.status}）`);
    } catch (error) {
      console.error(`✗ AI 评测脱敏摘要无效：${error.message}`);
      process.exitCode = 1;
    }
  }
}
