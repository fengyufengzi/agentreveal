import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPostureRemediationPlans,
} from "../dist/core/posture/remediation.js";
import { buildPostureReport } from "../dist/core/posture/report.js";

function state(overrides = {}) {
  return {
    agentId: "claude-code",
    displayName: "Claude Code",
    confidence: "inferred",
    configSources: [],
    route: {
      providerClass: "official",
      proxyKind: "none",
      effectiveEndpoint: "https://api.example.com",
    },
    auth: {
      method: "api-key",
      sourceKind: "environment",
      status: "active",
      conflicts: [],
    },
    permissions: [],
    integrations: [],
    findingIds: [],
    taskIds: [],
    ...overrides,
  };
}

test("E5 Claude: 冲突计划固定说明当前来源、被覆盖来源、备份与复扫", () => {
  const effective = state({
    auth: {
      method: "api-key",
      sourceKind: "environment",
      status: "conflicting",
      conflicts: [
        {
          code: "AUTH_API_KEY_HELPER_OVERRIDDEN",
          sourceKinds: ["user", "environment"],
        },
        {
          code: "AUTH_SUBSCRIPTION_OAUTH_OVERRIDDEN",
          sourceKinds: ["user", "environment"],
        },
      ],
    },
    findingIds: ["CLAUDE_PLAINTEXT_TOKEN"],
  });
  const first = buildPostureRemediationPlans(effective);
  const second = buildPostureRemediationPlans(effective);
  assert.deepEqual(first, second);
  assert.equal(first.length, 1);
  assert.equal(first[0].planId, "claude-auth-conflict");
  assert.equal(first[0].status, "action-required");
  assert.equal(first[0].automation.available, false);
  assert.equal(first[0].automation.mode, "guided-with-existing-backup");
  assert.ok(first[0].steps.some((step) => step.kind === "backup"));
  assert.ok(first[0].steps.some((step) => step.kind === "verify"));
  assert.match(first[0].currentExplanation, /apiKeyHelper \/ Keychain/);
  assert.match(first[0].currentExplanation, /订阅 OAuth/);
});

test("E5 Codex: 自定义 Provider 与多认证来源得到同一确定性处置顺序", () => {
  const effective = state({
    agentId: "codex",
    displayName: "Codex",
    route: {
      providerClass: "relay_or_proxy",
      proxyKind: "custom",
      effectiveEndpoint: "https://gateway.example.com/v1",
    },
    auth: {
      method: "environment",
      sourceKind: "environment",
      status: "conflicting",
      conflicts: [
        {
          code: "AUTH_FILE_API_KEY_OVERRIDDEN",
          sourceKinds: ["user", "environment"],
        },
        {
          code: "AUTH_CHATGPT_OAUTH_OVERRIDDEN",
          sourceKinds: ["user", "environment"],
        },
      ],
    },
  });
  const [plan] = buildPostureRemediationPlans(effective);
  assert.equal(plan.planId, "codex-auth-route-conflict");
  assert.equal(plan.status, "action-required");
  assert.deepEqual(
    plan.steps.map((step) => step.id),
    [
      "verify-active-provider",
      "check-codex-login-status",
      "choose-codex-auth-source",
      "remove-overridden-codex-auth",
      "verify-codex-route",
    ]
  );
  assert.match(plan.automation.reason, /不直接改写或删除认证文件/);
  assert.ok(plan.constraints.some((entry) => entry.includes("auth.json")));
  const statusStep = plan.steps.find(
    (step) => step.id === "check-codex-login-status"
  );
  assert.deepEqual(statusStep.terminalCommand, {
    command: "codex login status",
    label: "在新 Terminal 检查 Codex 登录状态",
    successEvidence:
      "命令退出码为 0，显示的认证方式与当前 active Provider 的预期一致；不要据此把 ChatGPT OAuth 误当作自定义 Provider API Key。",
    readOnly: true,
  });
});

test("E5 CC Switch: 区分官方直连、代理接管与真实上游异常且始终只读数据库", () => {
  const base = {
    agentId: "cc-switch",
    displayName: "CC Switch",
    confidence: "confirmed",
    configSources: [],
    auth: {
      method: "config-file",
      sourceKind: "proxy",
      status: "active",
      conflicts: [],
    },
    permissions: [],
    integrations: [],
    findingIds: [],
    taskIds: [],
  };
  const [direct] = buildPostureRemediationPlans({
    ...base,
    route: { proxyKind: "cc-switch" },
  });
  const [managed] = buildPostureRemediationPlans({
    ...base,
    route: {
      providerClass: "official",
      proxyKind: "cc-switch",
      effectiveEndpoint: "http://127.0.0.1:15721",
      realUpstream: "https://api.example.com",
    },
  });
  const [anomaly] = buildPostureRemediationPlans({
    ...base,
    confidence: "incomplete",
    route: {
      providerClass: "unknown",
      proxyKind: "cc-switch",
      effectiveEndpoint: "http://127.0.0.1:15721",
    },
  });
  assert.match(direct.title, /未接管/);
  assert.equal(managed.status, "informational");
  assert.match(managed.title, /已接管/);
  assert.equal(anomaly.status, "review");
  for (const plan of [direct, managed, anomaly]) {
    assert.equal(plan.automation.available, false);
    assert.match(plan.automation.reason, /不写 SQLite/);
    assert.ok(plan.constraints.some((entry) => entry.includes("SQLite")));
  }
});

test("H7 CC Switch: 轮换与拆分 Token 的复扫语义保持 SQLite 只读且不制造假解决", () => {
  const effective = state({
    agentId: "cc-switch",
    displayName: "CC Switch",
    confidence: "confirmed",
    route: {
      providerClass: "relay_or_proxy",
      proxyKind: "cc-switch",
      effectiveEndpoint: "http://127.0.0.1:15721",
      realUpstream: "https://gateway.example.com",
    },
    auth: {
      method: "config-file",
      sourceKind: "proxy",
      status: "active",
      conflicts: [],
    },
    findingIds: ["CCSWITCH_PLAINTEXT_KEY", "CCSWITCH_SHARED_KEY"],
  });
  const plans = buildPostureRemediationPlans(effective);
  const rotation = plans.find(
    (plan) => plan.planId === "cc-switch-token-rotation"
  );
  assert.ok(rotation);
  assert.deepEqual(
    rotation.steps.map((step) => step.id),
    [
      "inventory-cc-switch-consumers",
      "create-independent-upstream-token",
      "replace-token-in-cc-switch",
      "verify-consumer-request-before-revoke",
      "revoke-old-upstream-token",
      "rescan-cc-switch-token-status",
    ]
  );
  const rescan = rotation.steps.at(-1).detail;
  assert.match(rescan, /CCSWITCH_SHARED_KEY 应消失/);
  assert.match(rescan, /CCSWITCH_PLAINTEXT_KEY 可能仍存在/);
  assert.match(rescan, /不是复扫失败/);
  assert.equal(rotation.automation.available, false);
  assert.match(rotation.automation.reason, /数据库只读/);
  assert.doesNotMatch(JSON.stringify(rotation), /sqlite3|UPDATE |INSERT |DELETE FROM/);
});

test("E5 plans: PostureReport 共用计划且不持久化凭证或生成危险命令", () => {
  const secret = "SECRET_SHOULD_NOT_APPEAR";
  const effective = state({
    auth: {
      method: "oauth",
      sourceKind: "user",
      status: "conflicting",
      conflicts: [{
        code: "AUTH_API_KEY_OVERRIDDEN",
        sourceKinds: ["environment", "user"],
      }],
    },
  });
  const report = buildPostureReport([effective], new Date("2026-07-23T00:00:00Z"));
  assert.equal(report.agents[0].remediationPlans.length, 1);
  const dump = JSON.stringify(report);
  assert.doesNotMatch(dump, new RegExp(secret));
  assert.doesNotMatch(dump, /security add-generic-password|rm |sqlite3 /);
  assert.match(dump, /不自动轮换/);
});
