import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_SAFE_TOP_RISK_LIMIT,
  buildModelSafeScan,
  validateModelSafeScan,
} from "../dist/core/integration/model-safe-scan.js";

function finding(id, category, severity, title, evidence) {
  return {
    id,
    category,
    severity,
    title,
    description: `用户动态说明：${title}`,
    recommendation: "运行不应进入模型上下文的整改命令",
    remediation: ["agentreveal scan"],
    ...(evidence ? { evidence } : {}),
  };
}

function reportFixture() {
  const findings = [
    finding("CLAUDE_PLAINTEXT_TOKEN", "secret", "high", "动态凭据标题", {
      configPath: "/Users/example/project/.claude/settings.json",
      tokenFingerprint: "private-fingerprint-placeholder",
    }),
    finding("CLAUDE_UNKNOWN_BASE_URL", "provider", "high", "动态端点标题", {
      baseUrl: "https://private-relay.example.com/v1",
    }),
    finding("CLAUDE_HOOKS_PRESENT", "permission", "medium", "动态 Hook 标题", {
      command: "private-hook-command --flag",
    }),
    finding("CLAUDE_API_KEY_HELPER", "secret", "medium", "动态 helper 标题", {
      helper: "/Users/example/bin/private-helper",
    }),
    finding("CLAUDE_MCP_STDIO", "mcp", "info", "动态 MCP 标题", {
      server: "private-server-name",
    }),
  ];
  return {
    results: [
      {
        agent: "claude-code",
        displayName: "用户自定义 Agent 名称",
        discovery: {
          agent: "claude-code",
          displayName: "用户自定义 Agent 名称",
          configFound: true,
          configPath: "/Users/example/project/.claude",
          notes: ["用户自由文本"],
        },
        findings,
      },
    ],
    allFindings: findings,
    correlations: [],
  };
}

test("model-safe integration: 只输出严格 allowlist 与固定 Top 3", () => {
  const result = buildModelSafeScan(reportFixture(), {
    acceptedTaskCount: 2,
    ignoredFindingCount: 1,
  });

  assert.deepEqual(Object.keys(result).sort(), [
    "command",
    "privacy",
    "schemaVersion",
    "summary",
    "topRisks",
  ]);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.command, "integration.scan");
  assert.equal(result.topRisks.length, MODEL_SAFE_TOP_RISK_LIMIT);
  assert.deepEqual(result.summary, {
    configuredAgents: 1,
    findingCount: 5,
    actionableTaskCount: 4,
    immediateTaskCount: 2,
    informationalTaskCount: 1,
    acceptedTaskCount: 2,
    ignoredFindingCount: 1,
    omittedActionableTaskCount: 1,
  });
  assert.deepEqual(Object.keys(result.topRisks[0]).sort(), [
    "agent",
    "category",
    "disposition",
    "message",
    "priority",
    "requiresHumanAction",
    "ruleIds",
    "severity",
    "source",
    "verificationRequired",
  ]);
  assert.equal(result.topRisks[0].agent, "claude-code");
  assert.equal(result.topRisks[0].category, "secret");
  assert.deepEqual(result.topRisks[0].ruleIds, ["CLAUDE_PLAINTEXT_TOKEN"]);
});

test("model-safe integration: 序列化结果不包含敏感运行时字段或动态文本", () => {
  const serialized = JSON.stringify(buildModelSafeScan(reportFixture()));

  for (const forbidden of [
    "/Users/example",
    "private-relay.example.com",
    "private-fingerprint-placeholder",
    "private-hook-command",
    "private-helper",
    "private-server-name",
    "用户自定义 Agent 名称",
    "动态凭据标题",
    "用户自由文本",
    "agentreveal scan",
    "task-",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `意外输出：${forbidden}`);
  }

  for (const forbiddenKey of [
    "configPath",
    "endpoint",
    "evidence",
    "taskId",
    "title",
    "description",
    "recommendation",
    "remediation",
    "nextSteps",
    "verification",
  ]) {
    assert.equal(
      serialized.includes(`\"${forbiddenKey}\"`),
      false,
      `意外字段：${forbiddenKey}`
    );
  }
});

test("model-safe integration: 未知类别回退为固定 other 文案", () => {
  const unknown = finding("UNKNOWN_RULE_FOR_TEST", "custom-dynamic", "medium", "动态标题", {
    arbitrary: "private-value",
  });
  const report = {
    results: [
      {
        agent: "codex",
        displayName: "Codex",
        discovery: { agent: "codex", displayName: "Codex", configFound: true },
        findings: [unknown],
      },
    ],
    allFindings: [unknown],
    correlations: [],
  };

  const result = buildModelSafeScan(report);
  assert.equal(result.topRisks[0].category, "other");
  assert.deepEqual(result.topRisks[0].ruleIds, ["UNMAPPED_RULE"]);
  assert.equal(result.topRisks[0].message, "检测到需要人工复核的 Agent 配置风险。");
  assert.doesNotMatch(
    JSON.stringify(result),
    /UNKNOWN_RULE_FOR_TEST|custom-dynamic|private-value|动态标题/
  );
});

test("model-safe integration: Harness 边界拒绝 additive 字段与动态文案", () => {
  const baseline = buildModelSafeScan(reportFixture());
  assert.equal(validateModelSafeScan(baseline), baseline);

  for (const mutate of [
    (value) => {
      value.debug = "/Users/example/project";
    },
    (value) => {
      value.privacy.endpoint = "https://private.example.net";
    },
    (value) => {
      value.topRisks[0].evidence = { path: "/Users/example/project" };
    },
    (value) => {
      value.topRisks[0].message = "用户控制的动态说明";
    },
  ]) {
    const candidate = structuredClone(baseline);
    mutate(candidate);
    assert.throws(() => validateModelSafeScan(candidate), /模型安全扫描输出无效/);
  }
});

test("model-safe integration: Harness 边界拒绝未知枚举、规则和计数矛盾", () => {
  const baseline = buildModelSafeScan(reportFixture());
  for (const mutate of [
    (value) => {
      value.topRisks[0].agent = "user-defined-agent";
    },
    (value) => {
      value.topRisks[0].ruleIds = ["USER_DEFINED_RULE"];
    },
    (value) => {
      value.topRisks[0].priority = "P-1";
    },
    (value) => {
      value.summary.omittedActionableTaskCount = 99;
    },
    (value) => {
      value.topRisks.pop();
    },
  ]) {
    const candidate = structuredClone(baseline);
    mutate(candidate);
    assert.throws(() => validateModelSafeScan(candidate), /模型安全扫描输出无效/);
  }
});
