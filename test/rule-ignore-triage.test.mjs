import assert from "node:assert/strict";
import test from "node:test";

import { buildActionPlan, buildActionTasks } from "../dist/core/action/index.js";
import { applyAcceptances } from "../dist/core/triage/index.js";

function finding(id, evidence = {}) {
  return { id, category: "mcp", severity: "info", title: id, evidence };
}

function reportFor(findings) {
  const result = {
    agent: "claude-code",
    displayName: "Claude Code",
    discovery: { agent: "claude-code", displayName: "Claude Code", configFound: true },
    findings,
  };
  return { results: [result], allFindings: findings, correlations: [] };
}

const activeIgnore = {
  ruleId: "CLAUDE_MCP_STDIO",
  agent: "claude-code",
  reason: "已审核的项目内 MCP",
  createdAt: "2026-07-18T00:00:00.000Z",
  status: "active",
};

test("triage: 项目规则忽略仅匹配指定 Agent 和 ruleId，并保留审计发现", () => {
  const report = reportFor([
    finding("CLAUDE_MCP_STDIO", { server: "docs", command: "safe-mcp" }),
    finding("CLAUDE_MCP_REMOTE", { server: "remote", url: "https://mcp.example.com" }),
  ]);
  const triaged = applyAcceptances(report, [], [activeIgnore]);
  assert.deepEqual(triaged.activeReport.results[0].findings.map((entry) => entry.id), [
    "CLAUDE_MCP_REMOTE",
  ]);
  assert.equal(triaged.ignoredFindings.length, 1);
  assert.equal(triaged.ignoredFindings[0].finding.id, "CLAUDE_MCP_STDIO");
  assert.equal(triaged.ignoredFindings[0].finding.evidence.command, "safe-mcp");
  assert.equal(triaged.activeRuleIgnores.length, 1);

  const otherAgent = applyAcceptances(report, [], [
    { ...activeIgnore, agent: "codex" },
  ]);
  assert.equal(otherAgent.activeReport.allFindings.length, 2);
  assert.equal(otherAgent.ignoredFindings.length, 0);
});

test("triage: 过期策略不生效，任务接受在忽略后应用", () => {
  const report = reportFor([
    finding("CLAUDE_MCP_STDIO", { server: "docs", command: "safe-mcp" }),
    finding("CLAUDE_MCP_REMOTE", { server: "remote", url: "https://mcp.example.com" }),
  ]);
  const expired = applyAcceptances(report, [], [{ ...activeIgnore, status: "expired" }]);
  assert.equal(expired.activeReport.allFindings.length, 2);

  const afterIgnore = applyAcceptances(report, [], [activeIgnore]);
  const task = buildActionTasks(buildActionPlan(afterIgnore.activeReport))[0];
  const accepted = applyAcceptances(
    report,
    [{
      scopeId: "scope",
      taskId: task.taskId,
      reason: "已确认剩余远程服务",
      createdAt: "2026-07-18T00:00:00.000Z",
      status: "active",
    }],
    [activeIgnore]
  );
  assert.equal(accepted.activeReport.allFindings.length, 0);
  assert.equal(accepted.acceptedTasks.length, 1);
  assert.equal(accepted.ignoredFindings.length, 1);
});
