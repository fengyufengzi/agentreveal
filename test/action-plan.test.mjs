/**
 * 下一步行动计划：矩阵 enrichment、系统健康回退、归属、排序与汇总。
 * 从 dist/ 导入；运行前需 npm run build。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildActionPlan,
  buildActionTasks,
  enrichFinding,
} from "../dist/core/action/index.js";
import { getFindingAction } from "../dist/rules/action-matrix.js";

function finding(id, severity = "medium") {
  return { id, category: "test", severity, title: id };
}

function result(agent, displayName, findings) {
  return {
    agent,
    displayName,
    discovery: { agent, displayName, configFound: true },
    findings,
  };
}

test("enrichFinding 附加矩阵 action，并由 fixMode 推导 fixable", () => {
  const raw = finding("OPENCODE_BASH_UNRESTRICTED", "high");
  const expected = getFindingAction(raw.id);
  assert.ok(expected, "测试规则应存在于处置矩阵");

  const enriched = enrichFinding(raw);
  assert.deepEqual(enriched.action, expected);
  assert.equal(enriched.fixable, expected.fixMode === "baseline");
  assert.equal(raw.action, undefined, "不得修改原始 finding");
  assert.equal(raw.fixable, undefined, "不得修改原始兼容字段");
});

test("DEEPSCAN_FAILED 使用保守的扫描完整性 action", () => {
  const enriched = enrichFinding({
    ...finding("DEEPSCAN_FAILED", "info"),
    evidence: { error: "boom" },
  });

  assert.equal(enriched.action.disposition, "review");
  assert.equal(enriched.action.priority, "P1");
  assert.equal(enriched.action.confidence, "high");
  assert.equal(enriched.action.fixMode, "guided");
  assert.equal(enriched.action.group.family, "scan-health");
  assert.equal(enriched.fixable, false);
  assert.ok(enriched.action.verification.some((step) => step.includes("DEEPSCAN_FAILED")));
});

test("未知规则使用 review/P2/guided 保守回退", () => {
  const enriched = enrichFinding(finding("FUTURE_RULE"));
  assert.equal(enriched.action.disposition, "review");
  assert.equal(enriched.action.priority, "P2");
  assert.equal(enriched.action.confidence, "low");
  assert.equal(enriched.action.fixMode, "guided");
  assert.equal(enriched.fixable, false);
});

test("buildActionPlan 保留 Agent 归属、包含 correlations，并稳定按优先级排序", () => {
  const a = finding("FUTURE_A", "critical");
  const failed = finding("DEEPSCAN_FAILED", "info");
  const b = finding("FUTURE_B", "high");
  const correlation = finding("FUTURE_CORRELATION", "medium");
  const agentResult = result("codex", "Codex", [a, failed, b]);
  const report = {
    results: [agentResult],
    allFindings: agentResult.findings,
    correlations: [correlation],
  };

  const plan = buildActionPlan(report);
  assert.deepEqual(
    plan.items.map((item) => item.finding.id),
    ["DEEPSCAN_FAILED", "FUTURE_A", "FUTURE_B", "FUTURE_CORRELATION"]
  );

  const agentItems = plan.items.filter((item) => item.source === "agent");
  assert.ok(agentItems.every((item) => item.agent === "codex"));
  assert.ok(agentItems.every((item) => item.displayName === "Codex"));

  const correlationItem = plan.items.at(-1);
  assert.equal(correlationItem.source, "correlation");
  assert.equal(correlationItem.agent, undefined);
  assert.equal(correlationItem.displayName, "跨 Agent 关联");

  assert.deepEqual(plan.summary, {
    total: 4,
    needsAttention: 4,
    immediate: 1,
    byDisposition: { fix: 0, review: 4, cleanup: 0, observe: 0 },
    byPriority: { P0: 0, P1: 1, P2: 3, P3: 0 },
  });

  assert.equal(a.action, undefined, "构建计划不得反向修改 ScanReport");
  assert.equal(correlation.action, undefined);
});

test("buildActionTasks 规范化大小写、空白和 URL 尾斜杠，并合并同一根因", () => {
  const unknown = {
    ...finding("CCSWITCH_UNKNOWN_BASE_URL", "high"),
    evidence: {
      appType: " Claude ",
      provider: "PersonalRelay",
      baseUrl: " HTTPS://API.EXAMPLE.COM/v1/ ",
    },
  };
  const insecure = {
    ...finding("CCSWITCH_INSECURE_HTTP", "medium"),
    evidence: {
      appType: "claude",
      provider: "PERSONALRELAY",
      baseUrl: "https://api.example.com/v1",
    },
  };
  const agentResult = result("cc-switch", "CC Switch", [unknown, insecure]);
  const plan = buildActionPlan({
    results: [agentResult],
    allFindings: agentResult.findings,
  });

  const tasks = buildActionTasks(plan);
  assert.equal(tasks.length, 1);
  const task = tasks[0];
  assert.match(task.taskId, /^task-[a-f0-9]{12}$/);
  assert.equal(task.family, "provider.endpoint");
  assert.equal(task.agent, "cc-switch");
  assert.equal(task.priority, "P1");
  assert.equal(task.severity, "high");
  assert.equal(task.disposition, "fix");
  assert.equal(task.primary.finding.id, "CCSWITCH_INSECURE_HTTP");
  assert.deepEqual(task.items, plan.items);
  assert.deepEqual(
    task.requirements.map((requirement) => requirement.ruleId),
    ["CCSWITCH_UNKNOWN_BASE_URL", "CCSWITCH_INSECURE_HTTP"]
  );
  assert.ok(task.requirements.every((requirement) => requirement.acceptWhen));

  const fromReversedItems = buildActionTasks([...plan.items].reverse());
  assert.equal(fromReversedItems[0].taskId, task.taskId);
});

test("buildActionTasks 对数组证据稳定排序，taskId 不受 finding 顺序影响", () => {
  const first = {
    ...finding("CODEX_TRUSTED_PROJECTS", "medium"),
    evidence: { projects: [" /Work/B ", "/work/a"] },
  };
  const second = {
    ...finding("CODEX_TRUSTED_PROJECTS", "info"),
    evidence: { projects: ["/WORK/A", "/work/b"] },
  };
  const agentResult = result("codex", "Codex", [first, second]);
  const plan = buildActionPlan({
    results: [agentResult],
    allFindings: agentResult.findings,
  });

  const forward = buildActionTasks(plan.items);
  const reversed = buildActionTasks([...plan.items].reverse());
  assert.equal(forward.length, 1);
  assert.equal(reversed.length, 1);
  assert.equal(forward[0].taskId, reversed[0].taskId);
  assert.equal(forward[0].items.length, 2);
  assert.equal(forward[0].severity, "medium");
});

test("buildActionTasks 不合并不同 endpoint、server 或 path", () => {
  const codex = result("codex", "Codex", [
    {
      ...finding("CODEX_CUSTOM_PROVIDER"),
      evidence: { provider: "relay", baseUrl: "https://one.example/v1" },
    },
    {
      ...finding("CODEX_CUSTOM_PROVIDER"),
      evidence: { provider: "relay", baseUrl: "https://two.example/v1" },
    },
  ]);
  const opencode = result("opencode", "OpenCode", [
    {
      ...finding("OPENCODE_MCP_LOCAL", "info"),
      evidence: { server: "alpha", command: "npx tool" },
    },
    {
      ...finding("OPENCODE_MCP_LOCAL", "info"),
      evidence: { server: "beta", command: "npx tool" },
    },
  ]);
  const workspace = result("workspace", "项目目录", [
    {
      ...finding("PROJECT_SENSITIVE_FILE", "high"),
      evidence: { path: "secrets/a.env", kind: "env" },
    },
    {
      ...finding("PROJECT_SENSITIVE_FILE", "high"),
      evidence: { path: "secrets/b.env", kind: "env" },
    },
  ]);
  const report = {
    results: [codex, opencode, workspace],
    allFindings: [...codex.findings, ...opencode.findings, ...workspace.findings],
  };

  const tasks = buildActionTasks(buildActionPlan(report));
  const countFamily = (family) => tasks.filter((task) => task.family === family).length;
  assert.equal(countFamily("provider.endpoint"), 2);
  assert.equal(countFamily("mcp.server"), 2);
  assert.equal(countFamily("project.sensitive-file"), 2);
});

test("buildActionTasks 按 source/agent 隔离，并正确选择最高等级及 primary", () => {
  const evidence = { path: "secrets/.env", kind: "env" };
  const codex = result("codex", "Codex", [
    { ...finding("PROJECT_SENSITIVE_FILE", "info"), evidence },
  ]);
  const opencode = result("opencode", "OpenCode", [
    { ...finding("PROJECT_SENSITIVE_FILE", "info"), evidence },
  ]);
  const correlation = { ...finding("PROJECT_SENSITIVE_FILE", "info"), evidence };
  const report = {
    results: [codex, opencode],
    allFindings: [...codex.findings, ...opencode.findings],
    correlations: [correlation],
  };
  const plan = buildActionPlan(report);
  assert.equal(buildActionTasks(plan).length, 3);

  const base = plan.items.find((item) => item.source === "agent");
  const makeItem = (disposition, priority, severity, title) => {
    const action = { ...base.action, disposition, priority };
    return {
      ...base,
      action,
      finding: { ...base.finding, severity, title, action },
    };
  };
  const reviewP0 = makeItem("review", "P0", "critical", "review-primary");
  const fixP2High = makeItem("fix", "P2", "high", "fix-high");
  const fixP2Critical = makeItem("fix", "P2", "critical", "fix-critical");
  const fixP1Info = makeItem("fix", "P1", "info", "fix-priority");
  const task = buildActionTasks([
    reviewP0,
    fixP2High,
    fixP2Critical,
    fixP1Info,
  ])[0];

  assert.equal(task.disposition, "fix");
  assert.equal(task.priority, "P0");
  assert.equal(task.severity, "critical");
  assert.equal(
    task.primary.finding.title,
    "fix-priority",
    "primary 先选决定 disposition 的项，再比较 priority 和 severity"
  );
  assert.equal(task.items.length, 4);
  assert.equal(task.requirements.length, 1, "相同规则的重复 finding 只保留一份处置要求");
  assert.equal(task.requirements[0].priority, "P0");
  assert.equal(task.requirements[0].severity, "critical");
});
