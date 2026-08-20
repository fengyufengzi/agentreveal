import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildRuleFeedback,
  validateRuleFeedback,
} from "../dist/core/feedback/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binPath = join(repoRoot, "bin", "agentreveal");

test("最小规则反馈只包含版本、ruleId、判断和处置结果", () => {
  const feedback = buildRuleFeedback({
    productVersion: "0.0.7-pilot.1",
    ruleId: "GEMINI_MCP_TRUST_BYPASS",
    judgment: "expected",
    actionOutcome: "resolved",
  });

  assert.deepEqual(feedback, {
    schemaVersion: 1,
    command: "feedback",
    productVersion: "0.0.7-pilot.1",
    ruleId: "GEMINI_MCP_TRUST_BYPASS",
    judgment: "expected",
    actionOutcome: "resolved",
  });
});

test("反馈验证拒绝未知规则、非法枚举和任何额外隐私字段", () => {
  const base = {
    schemaVersion: 1,
    command: "feedback",
    productVersion: "0.0.7-pilot.1",
    ruleId: "CODEX_CUSTOM_PROVIDER",
    judgment: "unclear",
    actionOutcome: "not-attempted",
  };

  assert.throws(
    () => validateRuleFeedback({ ...base, ruleId: "UNKNOWN_RULE" }),
    /ruleId/
  );
  assert.throws(
    () => validateRuleFeedback({ ...base, judgment: "maybe" }),
    /judgment/
  );
  assert.throws(
    () => validateRuleFeedback({ ...base, actionOutcome: "fixed-ish" }),
    /actionOutcome/
  );
  for (const forbidden of ["taskId", "path", "endpoint", "comment", "report"]) {
    assert.throws(
      () => validateRuleFeedback({ ...base, [forbidden]: "synthetic" }),
      new RegExp(forbidden)
    );
  }
});

test("CLI feedback 输出可直接校验且不读取 HOME、不自动上传", () => {
  const result = spawnSync(
    process.execPath,
    [
      binPath,
      "feedback",
      "--rule",
      "OPENCLAW_GATEWAY_EXPOSED_BIND",
      "--judgment",
      "false-positive",
      "--outcome",
      "still-present",
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, HOME: "/Users/example/missing" },
      encoding: "utf8",
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const feedback = validateRuleFeedback(JSON.parse(result.stdout));
  assert.equal(feedback.ruleId, "OPENCLAW_GATEWAY_EXPOSED_BIND");
  assert.equal(feedback.judgment, "false-positive");
  assert.equal(feedback.actionOutcome, "still-present");
  assert.equal(result.stderr, "");
});

test("CLI feedback 对非法输入失败且不回显本机上下文", () => {
  const result = spawnSync(
    process.execPath,
    [
      binPath,
      "feedback",
      "--rule",
      "NOT_A_RULE",
      "--judgment",
      "expected",
      "--outcome",
      "resolved",
    ],
    { cwd: repoRoot, encoding: "utf8" }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ruleId 不在当前规则矩阵/);
  assert.doesNotMatch(result.stderr, /Users\//);
});
