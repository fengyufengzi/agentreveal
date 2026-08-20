import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { atomicCreateFile } from "../dist/core/fs-safety.js";
import {
  PostureSnapshotStore,
  buildDriftSnapshot,
  loadOrCreatePostureIdentityKey,
  postureHmacIdentity,
} from "../dist/core/posture/index.js";

function effectiveState(overrides = {}) {
  return {
    agentId: "claude-code",
    displayName: "Claude Code",
    detectedVersion: "2.1.0",
    confidence: "confirmed",
    configSources: [
      {
        kind: "user",
        scope: "user",
        status: "active",
        path: "/Users/example/project/settings.json",
        fields: ["model", "ANTHROPIC_API_KEY", "model"],
      },
    ],
    route: {
      providerClass: "relay_or_proxy",
      model: "private-model-name",
      proxyKind: "cc-switch",
      effectiveEndpoint: "https://relay.example.com/v1",
      realUpstream: "https://upstream.example.com/v1",
    },
    auth: {
      method: "environment",
      sourceKind: "environment",
      status: "conflicting",
      conflicts: [
        {
          code: "AUTH_ENV_OVERRIDES_OAUTH",
          sourceKinds: ["environment", "user"],
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
        identity: "private-database",
        enabled: true,
        version: "1.0.0-private",
        sourcePath: "/Users/example/project/mcp.json",
      },
    ],
    findingIds: ["CLAUDE_PLAINTEXT_TOKEN", "CLAUDE_PLAINTEXT_TOKEN"],
    taskIds: ["task-private-identity"],
    ...overrides,
  };
}

test("posture identity: HMAC 稳定、按上下文隔离且不同本机密钥不可关联", () => {
  const keyA = Buffer.alloc(32, 1);
  const keyB = Buffer.alloc(32, 2);
  const first = postureHmacIdentity(keyA, "endpoint", "https://relay.example.com");

  assert.equal(
    first,
    postureHmacIdentity(keyA, "endpoint", "https://relay.example.com")
  );
  assert.notEqual(
    first,
    postureHmacIdentity(keyA, "path", "https://relay.example.com")
  );
  assert.notEqual(
    first,
    postureHmacIdentity(keyB, "endpoint", "https://relay.example.com")
  );
  assert.match(first, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.throws(
    () => postureHmacIdentity(Buffer.alloc(31), "endpoint", "value"),
    /32 字节/
  );
});

test("posture identity: 密钥以 0600 创建、并发赢家复用且缺失时可拒绝重建", () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-posture-key-"));
  try {
    const path = join(root, "state", "state-key");
    const key = loadOrCreatePostureIdentityKey({
      path,
      random: () => Buffer.alloc(32, 3),
    });
    const reused = loadOrCreatePostureIdentityKey({
      path,
      random: () => Buffer.alloc(32, 4),
    });

    assert.deepEqual(key, Buffer.alloc(32, 3));
    assert.deepEqual(reused, key);
    assert.equal(statSync(dirname(path)).mode & 0o777, 0o700);
    assert.equal(statSync(path).mode & 0o777, 0o600);

    unlinkSync(path);
    assert.throws(
      () => loadOrCreatePostureIdentityKey({ path, allowCreate: false }),
      /拒绝静默重建/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("posture identity: 损坏或权限过宽的现有密钥被拒绝", () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-posture-bad-key-"));
  try {
    const path = join(root, "state-key");
    writeFileSync(path, "not-a-key\n", { mode: 0o600 });
    assert.throws(() => loadOrCreatePostureIdentityKey({ path }), /格式无效/);

    writeFileSync(
      path,
      `agentreveal-state-key-v1:${Buffer.alloc(32, 5).toString("base64")}\n`
    );
    chmodSync(path, 0o644);
    assert.throws(() => loadOrCreatePostureIdentityKey({ path }), /权限过宽/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("atomicCreateFile: 目标已存在时不覆盖且不遗留临时文件", () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-atomic-create-"));
  try {
    const path = join(root, "state-key");
    writeFileSync(path, "winner", { mode: 0o600 });
    assert.throws(
      () => atomicCreateFile(path, "loser", 0o600),
      (error) => error?.code === "EEXIST"
    );
    assert.equal(readFileSync(path, "utf8"), "winner");
    assert.deepEqual(readdirSync(root), ["state-key"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("drift snapshot: 仅保存 allowlist 摘要和 keyed HMAC 身份", () => {
  const state = effectiveState();
  const snapshot = buildDriftSnapshot(
    [state],
    Buffer.alloc(32, 6),
    new Date("2026-07-23T00:00:00.000Z")
  );
  const text = JSON.stringify(snapshot);

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.capturedAt, "2026-07-23T00:00:00.000Z");
  assert.deepEqual(snapshot.agents[0].configSources[0].fieldNames, [
    "ANTHROPIC_API_KEY",
    "model",
  ]);
  assert.deepEqual(snapshot.agents[0].ruleIds, ["CLAUDE_PLAINTEXT_TOKEN"]);
  assert.match(
    snapshot.agents[0].route.effectiveEndpointIdentity,
    /^hmac-sha256:[a-f0-9]{64}$/
  );
  for (const raw of [
    state.displayName,
    state.configSources[0].path,
    state.route.model,
    state.route.effectiveEndpoint,
    state.route.realUpstream,
    state.integrations[0].identity,
    state.integrations[0].version,
    state.integrations[0].sourcePath,
    state.taskIds[0],
  ]) {
    assert.doesNotMatch(text, new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(text, /taskIds|displayName|evidence/);

  const differentMachine = buildDriftSnapshot(
    [state],
    Buffer.alloc(32, 7),
    new Date("2026-07-23T00:00:00.000Z")
  );
  assert.notEqual(
    snapshot.agents[0].route.effectiveEndpointIdentity,
    differentMachine.agents[0].route.effectiveEndpointIdentity
  );
});

test("drift snapshot: 非法字段、重复 Agent 和无效时间被拒绝", () => {
  assert.throws(
    () =>
      buildDriftSnapshot(
        [{ ...effectiveState(), apiKey: "SECRET_PLACEHOLDER" }],
        Buffer.alloc(32, 8)
      ),
    /未知字段/
  );
  assert.throws(
    () =>
      buildDriftSnapshot(
        [
          effectiveState({
            configSources: [
              {
                kind: "user",
                scope: "user",
                status: "active",
                fields: ["https://secret.example.com/value"],
              },
            ],
          }),
        ],
        Buffer.alloc(32, 8)
      ),
    /只包含配置字段名/
  );
  assert.throws(
    () =>
      buildDriftSnapshot(
        [effectiveState({ findingIds: ["UNREGISTERED_DYNAMIC_RULE"] })],
        Buffer.alloc(32, 8)
      ),
    /规则 ID/
  );
  assert.throws(
    () =>
      buildDriftSnapshot(
        [effectiveState(), effectiveState()],
        Buffer.alloc(32, 8)
      ),
    /重复 Agent/
  );
  assert.throws(
    () =>
      buildDriftSnapshot(
        [effectiveState()],
        Buffer.alloc(32, 8),
        new Date("invalid")
      ),
    /时间无效/
  );
});

test("posture store: 按项目隔离、0700/0600 落盘且不持久化敏感身份", () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-posture-store-"));
  try {
    const projectA = join(root, "project-a");
    const projectB = join(root, "project-b");
    const path = join(root, "state", "posture-snapshots.json");
    const keyPath = join(root, "state", "state-key");
    mkdirSync(projectA);
    mkdirSync(projectB);

    const storeA = new PostureSnapshotStore({
      path,
      keyPath,
      cwd: projectA,
      now: () => new Date("2026-07-23T01:00:00.000Z"),
      random: () => Buffer.alloc(32, 9),
    });
    const storeB = new PostureSnapshotStore({
      path,
      keyPath,
      cwd: projectB,
      now: () => new Date("2026-07-23T02:00:00.000Z"),
    });
    storeA.saveBaseline([effectiveState()]);

    assert.ok(storeA.getBaseline());
    assert.equal(storeB.getBaseline(), undefined);
    storeB.saveBaseline([
      effectiveState({ agentId: "codex", displayName: "Codex" }),
    ]);
    assert.equal(storeA.getBaseline().agents[0].agentId, "claude-code");
    assert.equal(storeB.getBaseline().agents[0].agentId, "codex");
    assert.equal(statSync(dirname(path)).mode & 0o777, 0o700);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(statSync(keyPath).mode & 0o777, 0o600);

    const text = readFileSync(path, "utf8");
    for (const forbidden of [
      "/Users/example",
      "relay.example.com",
      "upstream.example.com",
      "private-model-name",
      "private-database",
      "task-private-identity",
      "evidence",
    ]) {
      assert.doesNotMatch(text, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("posture store: 损坏、未知字段、权限过宽或密钥丢失都不覆盖旧快照", () => {
  const scenarios = [
    {
      name: "损坏 JSON",
      prepare: ({ path }) => writeFileSync(path, "{broken", { mode: 0o600 }),
      expected: /无法读取可信快照/,
    },
    {
      name: "未知隐私字段",
      prepare: ({ path }) => {
        const document = JSON.parse(readFileSync(path, "utf8"));
        const snapshot = Object.values(document.scopes)[0];
        snapshot.agents[0].evidence = { endpoint: "https://private.example.com" };
        writeFileSync(path, JSON.stringify(document), { mode: 0o600 });
      },
      expected: /未知字段/,
    },
    {
      name: "未知 schema 版本",
      prepare: ({ path }) => {
        const document = JSON.parse(readFileSync(path, "utf8"));
        document.schemaVersion = 2;
        writeFileSync(path, JSON.stringify(document), { mode: 0o600 });
      },
      expected: /版本无效/,
    },
    {
      name: "快照权限过宽",
      prepare: ({ path }) => chmodSync(path, 0o644),
      expected: /权限过宽/,
    },
    {
      name: "状态目录权限过宽",
      prepare: ({ path }) => chmodSync(dirname(path), 0o755),
      expected: /目录权限过宽/,
    },
    {
      name: "身份密钥丢失",
      prepare: ({ keyPath }) => unlinkSync(keyPath),
      expected: /拒绝静默重建/,
    },
    {
      name: "身份密钥权限过宽",
      prepare: ({ keyPath }) => chmodSync(keyPath, 0o644),
      expected: /权限过宽/,
    },
  ];

  for (const scenario of scenarios) {
    const root = mkdtempSync(join(tmpdir(), "agentreveal-posture-failure-"));
    try {
      const path = join(root, "state", "posture-snapshots.json");
      const keyPath = join(root, "state", "state-key");
      const project = join(root, "project");
      mkdirSync(project);
      const store = new PostureSnapshotStore({
        path,
        keyPath,
        cwd: project,
        random: () => Buffer.alloc(32, 10),
      });
      store.saveBaseline([effectiveState()]);
      scenario.prepare({ path, keyPath });
      const before = readFileSync(path);

      assert.throws(
        () => store.saveBaseline([effectiveState({ displayName: "Changed" })]),
        scenario.expected,
        scenario.name
      );
      assert.deepEqual(readFileSync(path), before, scenario.name);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("posture store: 删除仅影响当前项目作用域", () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-posture-remove-"));
  try {
    const path = join(root, "state", "posture-snapshots.json");
    const keyPath = join(root, "state", "state-key");
    const storeA = new PostureSnapshotStore({
      path,
      keyPath,
      scopeId: `scope-${"a".repeat(64)}`,
      random: () => Buffer.alloc(32, 11),
    });
    const storeB = new PostureSnapshotStore({
      path,
      keyPath,
      scopeId: `scope-${"b".repeat(64)}`,
    });
    storeA.saveBaseline([effectiveState()]);
    storeB.saveBaseline([
      effectiveState({ agentId: "codex", displayName: "Codex" }),
    ]);

    assert.equal(storeA.removeBaseline(), true);
    assert.equal(storeA.removeBaseline(), false);
    assert.ok(storeB.getBaseline());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
