import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { collectAgentEvalPreflight } from "../scripts/agent-eval-preflight.mjs";
import { validateAgentEvalResult } from "../scripts/check-agent-eval-result.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const manifest = JSON.parse(readFileSync(join(repoRoot, "evals", "tasks.json"), "utf8"));

function fakeRunner({ dirty = "", npmMissing = false } = {}) {
  return (command, args) => {
    if (command === "node" && args[0] === "--version") return { status: 0, stdout: "v22.14.0\n" };
    if (command === "npm" && args[0] === "--version") {
      if (npmMissing) return { status: null, stdout: "", stderr: "", error: { code: "ENOENT" } };
      return { status: 0, stdout: "10.9.2\n" };
    }
    if (command === "git" && args[0] === "--version") return { status: 0, stdout: "git version 2.50.1\n" };
    if (command === "codex" && args[0] === "--version") return { status: 0, stdout: "codex-cli 0.145.0\n" };
    if (command === "git" && args[1] === "--is-inside-work-tree") return { status: 0, stdout: "true\n" };
    if (command === "git" && args[1] === "HEAD") return { status: 0, stdout: `${"a".repeat(40)}\n` };
    if (command === "git" && args[0] === "status") return { status: 0, stdout: dirty };
    if (command === "node" && args[0].endsWith("check-agent-evals.mjs")) {
      return { status: 0, stdout: "definitions ok\n" };
    }
    throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
  };
}

test("agent eval preflight: verifies tools, clean baseline and task definitions", () => {
  const result = collectAgentEvalPreflight({
    cwd: repoRoot,
    runner: fakeRunner(),
    commands: { node: "node", npm: "npm", git: "git", codex: "codex" },
  });
  assert.equal(result.baselineCommit, "a".repeat(40));
  assert.equal(result.tools.npm, "10.9.2");
  assert.match(result.tools.codex, /codex-cli/);
});

test("agent eval preflight: rejects dirty worktrees and a missing npm command", () => {
  assert.throws(
    () => collectAgentEvalPreflight({
      cwd: repoRoot,
      runner: fakeRunner({ dirty: " M AGENTS.md\n" }),
      commands: { node: "node", npm: "npm", git: "git", codex: "codex" },
    }),
    /干净 worktree/
  );
  assert.throws(
    () => collectAgentEvalPreflight({
      cwd: repoRoot,
      runner: fakeRunner({ npmMissing: true }),
      commands: { node: "node", npm: "npm", git: "git", codex: "codex" },
    }),
    /npm 不可执行/
  );
});

function validResult() {
  const tasks = manifest.tasks.map((task) => ({
    id: task.id,
    summary: "代理遵守仓库边界并给出了经过验证的脱敏结论。",
    scores: {
      repositoryDiscovery: 2,
      behaviorCorrectness: 2,
      securityPrivacy: 2,
      validationQuality: 2,
      contributionCompleteness: 2,
    },
    totalScore: 10,
    checks: task.requiredChecks.map((command) => ({ command, status: "passed", runBy: "agent" })),
    reviewIssues: [],
  }));
  return {
    schemaVersion: 1,
    evaluatedAt: "2026-07-18T00:00:00.000Z",
    baselineCommit: "b".repeat(40),
    model: "example-model",
    status: "pass",
    averageScore: 10,
    tasks,
  };
}

test("agent eval result: accepts only complete redacted scoring evidence", () => {
  const result = validateAgentEvalResult(validResult(), manifest);
  assert.deepEqual(result, { averageScore: 10, status: "pass", blockingIssueCount: 0 });
});

test("agent eval result: caps validation scores without agent checks and rejects local paths", () => {
  const missingCheck = validResult();
  missingCheck.tasks[0].checks[0] = {
    command: missingCheck.tasks[0].checks[0].command,
    status: "passed",
    runBy: "evaluator",
  };
  assert.throws(
    () => validateAgentEvalResult(missingCheck, manifest),
    /验证质量不得记 2 分/
  );

  const localPath = validResult();
  localPath.tasks[0].summary = "结果保存在 /Users/example/private/eval.log，其他行为正确。";
  assert.throws(
    () => validateAgentEvalResult(localPath, manifest),
    (error) => {
      assert.match(error.message, /本机路径或疑似凭证/);
      assert.doesNotMatch(error.message, /\/Users\/example/);
      return true;
    }
  );
});
