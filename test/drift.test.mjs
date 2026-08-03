import assert from "node:assert/strict";
import test from "node:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  PostureSnapshotStore,
  buildDriftSnapshot,
  compareDriftSnapshots,
  loadDriftPolicyStates,
} from "../dist/core/posture/index.js";
import { AcceptanceStore } from "../dist/core/acceptance/index.js";
import { addRuleIgnore } from "../dist/core/config/rule-ignore.js";

function effectiveState(overrides = {}) {
  return {
    agentId: "claude-code",
    displayName: "Claude Code",
    confidence: "confirmed",
    configSources: [
      {
        kind: "user",
        scope: "user",
        status: "active",
        path: "/Users/example/project/settings.json",
        fields: ["model"],
      },
    ],
    route: {
      providerClass: "official",
      model: "example-model",
      proxyKind: "none",
      effectiveEndpoint: "https://api.anthropic.com",
    },
    auth: {
      method: "oauth",
      sourceKind: "user",
      status: "active",
      conflicts: [],
    },
    permissions: [
      {
        capability: "command-execute",
        decision: "ask",
        scope: "project",
        sourceKind: "user",
      },
    ],
    integrations: [],
    findingIds: [],
    taskIds: [],
    ...overrides,
  };
}

function acceptanceTask() {
  const action = {
    disposition: "fix",
    priority: "P0",
    confidence: "high",
    fixMode: "guided",
    rationale: "合成测试",
    nextSteps: ["合成测试"],
    verification: ["合成测试"],
    acceptWhen: "仅合成测试条件。",
    group: { family: "secret.plaintext", evidenceKeys: [] },
  };
  const item = {
    source: "agent",
    agent: "claude-code",
    displayName: "Claude Code",
    action,
    finding: {
      id: "CLAUDE_PLAINTEXT_TOKEN",
      category: "secret",
      severity: "critical",
      title: "合成风险",
      evidence: {},
      action,
    },
  };
  return {
    taskId: "task-policy-synthetic",
    source: "agent",
    agent: "claude-code",
    displayName: "Claude Code",
    family: "secret.plaintext",
    priority: "P0",
    severity: "critical",
    disposition: "fix",
    primary: item,
    items: [item],
    requirements: [{
      ruleId: "CLAUDE_PLAINTEXT_TOKEN",
      priority: "P0",
      severity: "critical",
      disposition: "fix",
      confidence: "high",
      fixMode: "guided",
      rationale: "合成测试",
      nextSteps: ["合成测试"],
      verification: ["合成测试"],
      acceptWhen: "仅合成测试条件。",
    }],
  };
}

test("drift compare: 稳定识别路由、认证、权限扩大、集成和风险变化", () => {
  const key = Buffer.alloc(32, 21);
  const baseline = buildDriftSnapshot(
    [effectiveState()],
    key,
    new Date("2026-07-23T00:00:00.000Z")
  );
  const changed = buildDriftSnapshot(
    [
      effectiveState({
        route: {
          providerClass: "relay_or_proxy",
          model: "other-model",
          proxyKind: "custom",
          effectiveEndpoint: "https://relay.example.com/v1",
        },
        auth: {
          method: "api-key",
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
            decision: "allow",
            scope: "project",
            sourceKind: "project-local",
          },
        ],
        integrations: [
          { kind: "mcp", identity: "private-mcp", enabled: true },
        ],
        findingIds: ["CLAUDE_PLAINTEXT_TOKEN"],
      }),
    ],
    key,
    new Date("2026-07-23T01:00:00.000Z")
  );
  const first = compareDriftSnapshots(baseline, changed);
  const second = compareDriftSnapshots(baseline, changed);
  assert.deepEqual(first, second);
  assert.equal(first.comparison.status, "changed");
  assert.ok(
    first.comparison.events.some(
      (entry) =>
        entry.kind === "permission-changed" &&
        entry.priority === "P0" &&
        entry.severity === "high"
    )
  );
  assert.ok(
    first.comparison.events.some(
      (entry) => entry.kind === "provider-route-changed"
    )
  );
  assert.ok(
    first.comparison.events.some(
      (entry) => entry.kind === "auth-source-changed"
    )
  );
  assert.ok(
    first.comparison.events.some(
      (entry) => entry.kind === "integration-added"
    )
  );
  assert.ok(
    first.comparison.events.some((entry) => entry.kind === "risk-added")
  );
  assert.doesNotMatch(
    JSON.stringify(first),
    /relay\.example\.com|private-mcp|\/Users\/example/
  );
});

test("drift compare: 恢复标记 resolved，同一变化再次出现标记 reappeared", () => {
  const key = Buffer.alloc(32, 22);
  const baseline = buildDriftSnapshot(
    [effectiveState()],
    key,
    new Date("2026-07-23T00:00:00.000Z")
  );
  const changed = buildDriftSnapshot(
    [
      effectiveState({
        permissions: [
          {
            capability: "command-execute",
            decision: "allow",
            scope: "project",
          },
        ],
      }),
    ],
    key,
    new Date("2026-07-23T01:00:00.000Z")
  );
  const initial = compareDriftSnapshots(baseline, changed);
  const restored = compareDriftSnapshots(baseline, baseline, {
    previousObservation: changed,
    seenEventIds: initial.seenEventIds,
  });
  assert.equal(restored.comparison.status, "unchanged");
  assert.equal(restored.comparison.resolvedEventCount, 1);
  assert.equal(restored.comparison.events[0].change, "removed");
  assert.match(restored.comparison.events[0].currentSummary, /已恢复到可信状态/);

  const reappeared = compareDriftSnapshots(baseline, changed, {
    previousObservation: baseline,
    seenEventIds: initial.seenEventIds,
  });
  assert.equal(reappeared.comparison.events[0].change, "reappeared");
  assert.equal(
    reappeared.comparison.events[0].eventId,
    initial.comparison.events[0].eventId
  );
});

test("drift compare: 接受到期与项目忽略到期恢复为稳定变化事件", () => {
  const key = Buffer.alloc(32, 31);
  const accepted = {
    kind: "acceptance",
    agentId: "claude-code",
    subject: "task-synthetic-acceptance",
    status: "active",
    ruleIds: ["CLAUDE_PLAINTEXT_TOKEN"],
    priority: "P0",
    severity: "critical",
  };
  const ignored = {
    kind: "ignore",
    agentId: "claude-code",
    subject: "claude-code:CLAUDE_HOOKS_PRESENT",
    status: "active",
    ruleIds: ["CLAUDE_HOOKS_PRESENT"],
    priority: "P2",
    severity: "medium",
  };
  const baseline = buildDriftSnapshot(
    [effectiveState()],
    key,
    new Date("2026-07-23T00:00:00.000Z"),
    [accepted, ignored]
  );
  const current = buildDriftSnapshot(
    [effectiveState()],
    key,
    new Date("2026-07-24T00:00:00.000Z"),
    [
      { ...accepted, status: "expired" },
      { ...ignored, status: "expired" },
    ]
  );
  const result = compareDriftSnapshots(baseline, current);
  assert.deepEqual(
    result.comparison.events.map((entry) => entry.kind).sort(),
    ["acceptance-expired", "ignore-expired"]
  );
  assert.equal(result.comparison.activeEventCount, 2);
  assert.ok(
    result.comparison.events.every((entry) => entry.change === "reappeared")
  );
  const serialized = JSON.stringify({ baseline, result });
  assert.doesNotMatch(serialized, /task-synthetic-acceptance/);
  assert.doesNotMatch(serialized, /接受原因|忽略原因/);

  const restored = compareDriftSnapshots(baseline, baseline, {
    previousObservation: current,
    seenEventIds: result.seenEventIds,
  });
  assert.equal(restored.comparison.resolvedEventCount, 2);
  assert.ok(
    restored.comparison.events.every((entry) => entry.change === "removed")
  );
});

test("drift policy: 从项目接受与忽略存储读取最小化策略状态", () => {
  const root = mkdtempSync(join(tmpdir(), "agentguard-drift-policy-"));
  try {
    const project = join(root, "project");
    const acceptancePath = join(root, "state", "acceptances.json");
    mkdirSync(project);
    const activeAt = new Date("2026-07-23T00:00:00.000Z");
    const acceptance = new AcceptanceStore({
      cwd: project,
      path: acceptancePath,
      now: () => activeAt,
    });
    acceptance.accept(acceptanceTask(), "不会进入漂移快照的原因", {
      expiresAt: "2026-07-24T00:00:00.000Z",
    });
    addRuleIgnore({
      cwd: project,
      ruleId: "CLAUDE_HOOKS_PRESENT",
      agent: "claude-code",
      reason: "不会进入漂移快照的忽略原因",
      expiresAt: "2026-07-24T00:00:00.000Z",
      now: activeAt,
    });

    const active = loadDriftPolicyStates(project, {
      acceptancePath,
      now: activeAt,
    });
    const expired = loadDriftPolicyStates(project, {
      acceptancePath,
      now: new Date("2026-07-25T00:00:00.000Z"),
    });
    assert.deepEqual(active.map((entry) => entry.status), ["active", "active"]);
    assert.deepEqual(expired.map((entry) => entry.status), ["expired", "expired"]);
    assert.deepEqual(
      active.map((entry) => [entry.kind, entry.agentId, entry.ruleIds]),
      [
        ["acceptance", "claude-code", ["CLAUDE_PLAINTEXT_TOKEN"]],
        ["ignore", "claude-code", ["CLAUDE_HOOKS_PRESENT"]],
      ]
    );
    assert.doesNotMatch(
      JSON.stringify(active),
      /不会进入漂移快照/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("posture store E3: 预览确认、观察记录和最小化审计不泄露身份", () => {
  const root = mkdtempSync(join(tmpdir(), "agentguard-drift-store-"));
  try {
    const path = join(root, "state", "posture-snapshots.json");
    const keyPath = join(root, "state", "state-key");
    const project = join(root, "project");
    mkdirSync(project);
    let tick = 0;
    const store = new PostureSnapshotStore({
      path,
      keyPath,
      cwd: project,
      random: () => Buffer.alloc(32, 23),
      now: () =>
        new Date(`2026-07-23T0${Math.min(tick++, 9)}:00:00.000Z`),
      policyStates: () => [{
        kind: "acceptance",
        agentId: "claude-code",
        subject: "task-private-identity",
        status: "active",
        ruleIds: ["CLAUDE_PLAINTEXT_TOKEN"],
        priority: "P0",
        severity: "critical",
      }],
    });
    const preview = store.previewBaseline([effectiveState()]);
    assert.equal(preview.mutation, "create");
    assert.equal(preview.excludesSensitiveContent, true);
    assert.equal(preview.storageRevision, "missing");
    const saved = store.saveBaselineConfirmed([effectiveState()], preview);
    assert.equal(saved.mutation, "create");
    assert.equal(saved.agentCount, 1);

    const changedState = effectiveState({
      permissions: [
        {
          capability: "command-execute",
          decision: "allow",
          scope: "project",
        },
      ],
    });
    const first = store.compare([changedState], { recordObservation: true });
    const restored = store.compare([effectiveState()], {
      recordObservation: true,
    });
    assert.equal(first.activeEventCount, 1);
    assert.equal(restored.resolvedEventCount, 1);
    assert.equal(statSync(dirname(path)).mode & 0o777, 0o700);
    assert.equal(statSync(path).mode & 0o777, 0o600);

    const documentText = readFileSync(path, "utf8");
    assert.doesNotMatch(
      documentText,
      /\/Users\/example|api\.anthropic\.com|example-model|taskIds|task-private-identity|evidence/
    );
    const document = JSON.parse(documentText);
    assert.deepEqual(
      document.audit.map((entry) => Object.keys(entry).sort()),
      [["action", "at", "scopeId"]]
    );
    assert.equal(document.audit[0].action, "create");
    assert.ok(document.observations[store.scopeId]);
    assert.ok(document.seenEventIds[store.scopeId].length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("posture store E3: 状态变化、文件并发变化和进程锁都拒绝写入", () => {
  const root = mkdtempSync(join(tmpdir(), "agentguard-drift-concurrent-"));
  try {
    const path = join(root, "state", "posture-snapshots.json");
    const keyPath = join(root, "state", "state-key");
    const store = new PostureSnapshotStore({
      path,
      keyPath,
      scopeId: `scope-${"a".repeat(64)}`,
      random: () => Buffer.alloc(32, 24),
    });
    const preview = store.previewBaseline([effectiveState()]);
    assert.throws(
      () =>
        store.saveBaselineConfirmed(
          [
            effectiveState({
              auth: {
                method: "api-key",
                sourceKind: "environment",
                status: "active",
                conflicts: [],
              },
            }),
          ],
          preview
        ),
      /有效状态在确认后发生变化/
    );
    assert.equal(statSync(keyPath).mode & 0o777, 0o600);

    store.saveBaselineConfirmed([effectiveState()], preview);
    const replacePreview = store.previewBaseline([effectiveState()]);
    const other = new PostureSnapshotStore({
      path,
      keyPath,
      scopeId: `scope-${"b".repeat(64)}`,
    });
    other.saveBaseline([
      effectiveState({ agentId: "codex", displayName: "Codex" }),
    ]);
    const before = readFileSync(path);
    assert.throws(
      () =>
        store.saveBaselineConfirmed([effectiveState()], replacePreview),
      /确认后发生变化/
    );
    assert.deepEqual(readFileSync(path), before);

    writeFileSync(`${path}.lock`, "busy\n", { mode: 0o600 });
    assert.throws(
      () => store.removeBaseline(),
      /另一个进程修改/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("posture store E3: 损坏观察字段或过宽权限不会覆盖原文件", () => {
  const root = mkdtempSync(join(tmpdir(), "agentguard-drift-invalid-"));
  try {
    const path = join(root, "state", "posture-snapshots.json");
    const keyPath = join(root, "state", "state-key");
    const store = new PostureSnapshotStore({
      path,
      keyPath,
      scopeId: `scope-${"c".repeat(64)}`,
      random: () => Buffer.alloc(32, 25),
    });
    store.saveBaseline([effectiveState()]);
    const document = JSON.parse(readFileSync(path, "utf8"));
    document.seenEventIds[store.scopeId] = ["raw-private-event"];
    writeFileSync(path, JSON.stringify(document), { mode: 0o600 });
    const before = readFileSync(path);
    assert.throws(
      () => store.compare([effectiveState()], { recordObservation: true }),
      /事件 ID 无效/
    );
    assert.deepEqual(readFileSync(path), before);

    chmodSync(path, 0o644);
    assert.throws(() => store.getBaseline(), /权限过宽/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
