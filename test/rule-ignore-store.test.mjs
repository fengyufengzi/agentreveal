import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  activeRuleIgnores,
  activeRuleIgnoresSafely,
  addRuleIgnore,
  listRuleIgnores,
  removeRuleIgnore,
  ruleIgnoreCandidatesForTask,
  ruleIgnoreEligibility,
} from "../dist/core/config/rule-ignore.js";
import { buildActionPlan, buildActionTasks } from "../dist/core/action/index.js";
import { RULE_IDS } from "../dist/rules/ids.js";

function withProject(fn) {
  const cwd = mkdtempSync(join(tmpdir(), "agentreveal-rule-ignore-"));
  return Promise.resolve(fn(cwd)).finally(() => {
    rmSync(cwd, { recursive: true, force: true });
  });
}

test("rule ignore: 只允许低优先级非高风险家族", () => {
  assert.equal(ruleIgnoreEligibility("CLAUDE_MCP_STDIO").allowed, true);
  assert.equal(ruleIgnoreEligibility("CLAUDE_MCP_REMOTE").allowed, true);
  assert.equal(ruleIgnoreEligibility("CLAUDE_PLAINTEXT_TOKEN").allowed, false);
  assert.equal(ruleIgnoreEligibility("CLAUDE_DANGEROUS_ALLOW").allowed, false);
  assert.equal(ruleIgnoreEligibility("OPENCODE_CUSTOM_PROVIDER").allowed, false);
  assert.equal(ruleIgnoreEligibility("FUTURE_UNKNOWN").allowed, false);
  assert.deepEqual(
    RULE_IDS.filter((ruleId) => ruleIgnoreEligibility(ruleId).allowed),
    [
      "CLAUDE_LOCAL_BASE_URL",
      "CLAUDE_API_KEY_HELPER",
      "CLAUDE_HOOKS_PRESENT",
      "CLAUDE_MCP_REMOTE",
      "CLAUDE_MCP_STDIO",
      "CODEX_MCP_REMOTE",
      "CODEX_MCP_STDIO",
      "CODEX_TRUSTED_PROJECTS",
      "CODEX_LOCAL_PROXY",
      "CCSWITCH_PROXY_ENABLED",
      "OPENCODE_AUTOUPDATE_ON",
      "OPENCODE_MCP_REMOTE",
      "OPENCODE_MCP_LOCAL",
      "GEMINI_MCP_REMOTE",
      "GEMINI_MCP_STDIO",
      "GEMINI_AUTH_MODE",
      "OPENCLAW_AGENT_WORKSPACE_OVERLAP",
      "OPENCLAW_SERVICE_ENV_PRESENT",
    ]
  );
});

test("rule ignore: add/list/remove 保留其它项目配置和追加式审计", async () => {
  await withProject((cwd) => {
    const configPath = join(cwd, ".agentreveal.json");
    writeFileSync(
      configPath,
      JSON.stringify({ providers: { trusted: ["relay.example.com"] }, custom: { keep: true } })
    );
    const now = new Date("2026-07-18T00:00:00.000Z");
    const added = addRuleIgnore({
      cwd,
      ruleId: "CLAUDE_MCP_STDIO",
      agent: "claude-code",
      reason: "项目固定使用已审核的本地 MCP",
      expiresAt: "2026-08-18",
      now,
    });
    assert.equal(added.entries.length, 1);
    assert.equal(added.entries[0].status, "active");
    assert.equal(added.audit.length, 1);
    assert.equal(activeRuleIgnores(cwd, now).length, 1);

    const raw = JSON.parse(readFileSync(configPath, "utf8"));
    assert.deepEqual(raw.providers.trusted, ["relay.example.com"]);
    assert.deepEqual(raw.custom, { keep: true });
    assert.equal(raw.ruleIgnores[0].ruleId, "CLAUDE_MCP_STDIO");
    assert.equal(JSON.stringify(raw).includes("evidence"), false);
    assert.equal(JSON.stringify(raw).includes("task-"), false);

    const removed = removeRuleIgnore({
      cwd,
      ruleId: "CLAUDE_MCP_STDIO",
      agent: "claude-code",
      reason: "MCP 已停用",
      now: new Date("2026-07-19T00:00:00.000Z"),
    });
    assert.equal(removed.entries.length, 0);
    assert.equal(removed.audit.length, 2);
    assert.equal(removed.audit[1].action, "remove");
  });
});

test("rule ignore: 到期后自动失效，并允许重新添加", async () => {
  await withProject((cwd) => {
    addRuleIgnore({
      cwd,
      ruleId: "GEMINI_AUTH_MODE",
      agent: "gemini",
      reason: "限时确认当前 OAuth 模式",
      expiresAt: "2026-07-19T00:00:00.000Z",
      now: new Date("2026-07-18T00:00:00.000Z"),
    });
    const expired = listRuleIgnores(cwd, new Date("2026-07-20T00:00:00.000Z"));
    assert.equal(expired.entries[0].status, "expired");
    assert.equal(activeRuleIgnores(cwd, new Date("2026-07-20T00:00:00.000Z")).length, 0);

    const readded = addRuleIgnore({
      cwd,
      ruleId: "GEMINI_AUTH_MODE",
      agent: "gemini",
      reason: "重新审核后继续使用",
      now: new Date("2026-07-20T00:00:00.000Z"),
    });
    assert.equal(readded.entries.length, 1);
    assert.equal(readded.entries[0].reason, "重新审核后继续使用");
    assert.equal(readded.audit.length, 2);
  });
});

test("rule ignore: 拒绝高优先级、重复、过去到期和损坏配置", async () => {
  await withProject((cwd) => {
    assert.throws(
      () => addRuleIgnore({ cwd, ruleId: "CLAUDE_PLAINTEXT_TOKEN", agent: "claude-code", reason: "不应允许" }),
      /P0\/P1/
    );
    assert.throws(
      () => addRuleIgnore({ cwd, ruleId: "CLAUDE_MCP_STDIO", agent: "claude-code", reason: "过期", expiresAt: "2020-01-01" }),
      /晚于当前时间/
    );
    addRuleIgnore({ cwd, ruleId: "CLAUDE_MCP_STDIO", agent: "claude-code", reason: "已审核" });
    assert.throws(
      () => addRuleIgnore({ cwd, ruleId: "CLAUDE_MCP_STDIO", agent: "claude-code", reason: "重复" }),
      /已存在有效/
    );

    writeFileSync(join(cwd, ".agentreveal.json"), "{ broken SECRET_PLACEHOLDER");
    let errorMessage = "";
    try {
      listRuleIgnores(cwd);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    assert.match(errorMessage, /JSON 格式无效/);
    assert.equal(errorMessage.includes("SECRET_PLACEHOLDER"), false);
    assert.deepEqual(activeRuleIgnoresSafely(cwd), []);
  });
});

test("rule ignore: candidate 从当前任务和矩阵推导，不接受 renderer 自造规则", () => {
  const finding = {
    id: "CLAUDE_MCP_STDIO",
    category: "mcp",
    severity: "info",
    title: "本地 MCP",
    evidence: { server: "docs", scope: "global", command: "safe-mcp" },
  };
  const result = {
    agent: "claude-code",
    displayName: "Claude Code",
    discovery: { agent: "claude-code", displayName: "Claude Code", configFound: true },
    findings: [finding],
  };
  const task = buildActionTasks(buildActionPlan({
    results: [result],
    allFindings: [finding],
    correlations: [],
  }))[0];
  assert.deepEqual(ruleIgnoreCandidatesForTask(task), [
    { ruleId: "CLAUDE_MCP_STDIO", agent: "claude-code" },
  ]);
});
