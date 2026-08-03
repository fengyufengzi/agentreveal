import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPostureReport,
} from "../dist/core/posture/report.js";
import { formatPosture } from "../dist/core/report/posture-format.js";
import { renderHtmlReport } from "../dist/core/report/html-report.js";

function state(overrides = {}) {
  return {
    agentId: "claude-code",
    displayName: "Claude Code",
    confidence: "inferred",
    configSources: [
      {
        kind: "project-local",
        scope: "project",
        status: "active",
        path: "/Users/example/project/.claude/settings.local.json",
        fields: ["env.ANTHROPIC_BASE_URL", "permissions.defaultMode"],
      },
    ],
    route: {
      providerClass: "relay_or_proxy",
      model: "example-model",
      proxyKind: "custom",
      effectiveEndpoint: "https://relay.example.com/v1",
    },
    auth: {
      method: "environment",
      sourceKind: "environment",
      status: "conflicting",
      conflicts: [
        {
          code: "AUTH_API_KEY_OVERRIDDEN",
          sourceKinds: ["user", "environment"],
        },
      ],
    },
    permissions: [
      {
        capability: "command-execute",
        decision: "ask",
        scope: "project",
        sourceKind: "project-local",
      },
    ],
    integrations: [
      {
        kind: "mcp",
        identity: "example-mcp",
        enabled: true,
      },
    ],
    findingIds: [],
    taskIds: [],
    ...overrides,
  };
}

function emptyScanReport() {
  return {
    results: [],
    allFindings: [],
    correlations: [],
  };
}

test("posture report: 区分 confirmed/inferred/incomplete 并解释缺失证据", () => {
  const report = buildPostureReport(
    [
      state(),
      state({
        agentId: "codex",
        displayName: "Codex",
        confidence: "incomplete",
        configSources: [
          {
            kind: "user",
            scope: "user",
            status: "unreadable",
            fields: ["config"],
          },
        ],
        route: { proxyKind: "unknown" },
        auth: { method: "unknown", status: "unknown", conflicts: [] },
      }),
      state({
        agentId: "cc-switch",
        displayName: "CC Switch",
        confidence: "confirmed",
        auth: { method: "config-file", status: "active", conflicts: [] },
      }),
    ],
    new Date("2026-07-23T10:00:00.000Z")
  );

  assert.deepEqual(report.summary, {
    agentCount: 3,
    confirmedCount: 1,
    inferredCount: 1,
    incompleteCount: 1,
    authConflictCount: 1,
  });
  const codex = report.agents.find((entry) => entry.state.agentId === "codex");
  assert.ok(
    codex.uncertainty.some(
      (entry) => entry.code === "UNREADABLE_CONFIG_SOURCE"
    )
  );
  assert.ok(
    codex.uncertainty.some(
      (entry) => entry.code === "AUTH_SOURCE_UNCONFIRMED"
    )
  );
  assert.equal(
    report.agents.find((entry) => entry.state.agentId === "cc-switch")
      .uncertainty.length,
    0
  );
});

test("posture terminal: 展示来源、路由、认证和不确定性", () => {
  const output = formatPosture(buildPostureReport([state()]));
  assert.match(output, /当前真正生效/);
  assert.match(output, /Claude Code  \[推断\]/);
  assert.match(output, /relay\.example\.com/);
  assert.match(output, /认证：环境变量 · 状态：conflicting/);
  assert.match(output, /配置来源/);
  assert.match(output, /未确认：当前扫描没有附着/);
});

test("posture HTML: 动态路径、端点和不确定说明全部转义", () => {
  const payload = `</dd><script>globalThis.pwned=true</script>`;
  const report = buildPostureReport([
    state({
      route: {
        providerClass: "relay_or_proxy",
        proxyKind: "custom",
        effectiveEndpoint: payload,
      },
      configSources: [
        {
          kind: "user",
          scope: "user",
          status: "active",
          path: payload,
          fields: ["model"],
        },
      ],
    }),
  ]);
  const html = renderHtmlReport(emptyScanReport(), { posture: report });
  assert.match(html, /当前真正生效/);
  assert.match(html, /仍缺少的证据/);
  assert.doesNotMatch(html, /<script>globalThis\.pwned/);
  assert.match(html, /&lt;script&gt;globalThis\.pwned/);
});
