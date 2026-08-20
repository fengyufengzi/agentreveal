import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  SCENARIOS,
  buildMarkdown,
  runScenarios,
  summarizeResults,
} from "../scripts/rule-hit-rate.mjs";

test("规则质量基线使用真实 detector，且无漏报、意外告警、重复任务或凭证泄漏", async () => {
  const results = await runScenarios();
  const summary = summarizeResults(results);

  assert.equal(summary.scenarioCount, 40);
  assert.equal(summary.passedScenarioCount, 40);
  assert.equal(summary.assessedRuleCount, 43);
  assert.equal(summary.missing.length, 0);
  assert.equal(summary.unexpected.length, 0);
  assert.equal(summary.duplicateTaskExcess, 0);
  assert.equal(summary.missingTaskCount, 0);
  assert.equal(summary.privacyFailures.length, 0);

  const broadPermissions = results.find(
    (result) => result.name === "opencode-broad-permissions"
  );
  assert.ok(broadPermissions);
  assert.equal(broadPermissions.actualTaskCount, 1);
  assert.deepEqual(broadPermissions.taskRuleIds, [[
    "OPENCODE_BASH_UNRESTRICTED",
    "OPENCODE_PERMISSION_WILDCARD",
  ]]);

  const claudeMcp = results.find((result) => result.name === "claude-mcp-server");
  assert.deepEqual(claudeMcp.taskRuleIds, [[
    "CLAUDE_MCP_SECRET_ENV",
    "CLAUDE_MCP_STDIO",
  ]]);
  assert.equal(
    results.find((result) => result.name === "claude-mcp-scope-distinct").actualTaskCount,
    2
  );

  const geminiMcp = results.find((result) => result.name === "gemini-mcp-server");
  assert.deepEqual(geminiMcp.taskRuleIds, [[
    "GEMINI_MCP_SECRET_ENV",
    "GEMINI_MCP_STDIO",
    "GEMINI_MCP_TRUST_BYPASS",
  ]]);

  const gateway = results.find(
    (result) => result.name === "openclaw-gateway-exposure"
  );
  assert.equal(gateway.actualTaskCount, 1);
  assert.deepEqual(gateway.taskRuleIds, [[
    "OPENCLAW_GATEWAY_EXPOSED_BIND",
    "OPENCLAW_TAILSCALE_EXPOSURE",
  ]]);

  const markdown = buildMarkdown(results, new Date("2026-08-12T00:00:00.000Z"));
  assert.match(markdown, /结果：✓ 通过/);
  assert.match(markdown, /漏报：0；意外告警：0；重复任务：0；错误合并：0/);
  assert.match(markdown, /MCP server/);
  assert.doesNotMatch(markdown, /fixture-credential-value|fixture-shared-credential/);
});

test("规则质量脚本拒绝 live HOME，并能生成仅含合成数据的报告", () => {
  const live = spawnSync(process.execPath, ["scripts/rule-hit-rate.mjs", "--live"], {
    encoding: "utf8",
  });
  assert.equal(live.status, 2);
  assert.match(live.stderr, /只允许读取合成 fixture/);

  const dir = mkdtempSync(join(tmpdir(), "agentreveal-rule-quality-"));
  const out = join(dir, "report.md");
  try {
    const generated = spawnSync(
      process.execPath,
      ["scripts/rule-hit-rate.mjs", "--out", out],
      { encoding: "utf8" }
    );
    assert.equal(generated.status, 0, generated.stderr);
    const markdown = readFileSync(out, "utf8");
    assert.match(markdown, new RegExp(`场景：${SCENARIOS.length}/${SCENARIOS.length} 通过`));
    assert.doesNotMatch(markdown, /fixture-credential-value|fixture-shared-credential/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
