import assert from "node:assert/strict";
import test from "node:test";

import { buildFirstRunSummary } from "../dist/core/first-run/index.js";
import { formatFirstRun } from "../dist/core/report/first-run-format.js";

function finding(id, category, severity, title, evidence) {
  return { id, category, severity, title, ...(evidence ? { evidence } : {}) };
}

function reportFixture() {
  const findings = [
    finding(
      "CLAUDE_PLAINTEXT_TOKEN",
      "secret",
      "high",
      "settings 中存在明文 token",
      { keys: ["ANTHROPIC_AUTH_TOKEN"] }
    ),
    finding(
      "CLAUDE_UNKNOWN_BASE_URL",
      "provider",
      "high",
      "Claude 使用未知 Provider",
      { baseUrl: "https://relay.first-run-example.net/v1" }
    ),
    finding(
      "CLAUDE_API_KEY_HELPER",
      "secret",
      "medium",
      "Claude 配置了 apiKeyHelper"
    ),
    finding(
      "CLAUDE_HOOKS_PRESENT",
      "permission",
      "medium",
      "Claude 配置了 hooks"
    ),
    finding(
      "CLAUDE_MCP_STDIO",
      "mcp",
      "info",
      "Claude 配置了 stdio MCP",
      { server: "synthetic", scope: "user", command: "example-mcp" }
    ),
  ];
  return {
    results: [
      {
        agent: "claude-code",
        displayName: "Claude Code",
        discovery: {
          agent: "claude-code",
          displayName: "Claude Code",
          configFound: true,
        },
        findings,
      },
    ],
    allFindings: findings,
    correlations: [],
  };
}

test("first run: 建立共享 schema、三类任务、Top 3 与安全下一条命令", () => {
  const summary = buildFirstRunSummary(reportFixture(), {
    acceptedTaskCount: 2,
    platform: "darwin",
  });

  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.command, "first-run");
  assert.deepEqual(summary.privacy, {
    localOnly: true,
    uploadsData: false,
    readOnlyScan: true,
  });
  assert.deepEqual(summary.summary, {
    configuredAgents: 1,
    findingCount: 5,
    taskCount: 4,
    immediateTaskCount: 2,
    informationalTaskCount: 1,
    acceptedTaskCount: 2,
    ignoredFindingCount: 0,
  });
  assert.equal(summary.topTasks.length, 3);
  assert.equal(summary.buckets.mustHandle.count, 2);
  assert.equal(summary.buckets.shouldReview.count, 2);
  assert.equal(summary.buckets.informational.count, 1);
  assert.equal(summary.map.rows[0].endpoints[0], "relay.first-run-example.net/v1");

  const plaintext = summary.tasks.find((task) =>
    task.items.some((item) => item.finding.id === "CLAUDE_PLAINTEXT_TOKEN")
  );
  assert.ok(plaintext);
  assert.ok(
    summary.remediationGuides[plaintext.taskId].commands.some((item) =>
      item.command.includes("security add-generic-password")
    )
  );
  assert.ok(
    summary.nextCommands.some(
      (item) =>
        item.kind === "accept" &&
        item.taskId === plaintext.taskId &&
        item.command.includes("--expires YYYY-MM-DD")
    )
  );
  assert.ok(
    summary.nextCommands.some(
      (item) =>
        item.kind === "trust" &&
        item.command.includes('trust add "relay.first-run-example.net"')
    )
  );
  assert.ok(
    summary.nextCommands.some(
      (item) => item.kind === "verify" && item.command.includes(plaintext.taskId)
    )
  );
});

test("first run format: 链路在首屏、只展开三项并给出后续命令", () => {
  const output = formatFirstRun(
    buildFirstRunSummary(reportFixture(), { platform: "darwin" })
  );

  assert.ok(output.indexOf("实际连接链路") < output.indexOf("行动摘要"));
  assert.match(output, /必须处理 2 · 建议确认 2 · 信息提示 1/);
  assert.match(output, /建议先完成（最多 3 项）/);
  assert.match(output, /另有 1 个行动任务未在首屏展开/);
  assert.match(output, /agentguard risk verify task-[a-f0-9]{12}/);
  assert.match(output, /agentguard report --format html/);
  assert.match(output, /security add-generic-password/);
  assert.doesNotMatch(output, /raw-secret|sk-live-[A-Za-z0-9]/);
});
