import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  AcceptanceStore,
  defaultAcceptancePath,
  projectScopeId,
} from "../dist/core/acceptance/index.js";

function action(disposition = "review", priority = "P1") {
  return {
    disposition,
    priority,
    confidence: "high",
    fixMode: "manual",
    rationale: "test",
    nextSteps: ["test"],
    verification: ["test"],
    group: { family: "provider.endpoint", evidenceKeys: ["baseUrl"] },
  };
}

function task(taskId = "task-aaaaaaaaaaaa") {
  const firstAction = {
    ...action("review", "P1"),
    acceptWhen: "内部 HTTPS 端点已批准。",
  };
  const first = {
    source: "agent",
    agent: "codex",
    displayName: "Codex",
    action: firstAction,
    finding: {
      id: "CODEX_CUSTOM_PROVIDER",
      category: "provider",
      severity: "high",
      title: "未知 Provider",
      evidence: {
        baseUrl: "https://relay.example/v1",
        secretForTest: "must-not-be-persisted",
      },
      action: firstAction,
    },
  };
  const secondAction = {
    ...action("fix", "P1"),
    acceptWhen: "隔离网络中的限时例外。",
  };
  const second = {
    source: "agent",
    agent: "codex",
    displayName: "Codex",
    action: secondAction,
    finding: {
      id: "CODEX_INSECURE_HTTP",
      category: "provider",
      severity: "medium",
      title: "明文 HTTP",
      evidence: { baseUrl: "http://relay.example/v1" },
      action: secondAction,
    },
  };
  const items = [first, second];
  return {
    taskId,
    source: "agent",
    agent: "codex",
    displayName: "Codex",
    family: "provider.endpoint",
    priority: "P1",
    severity: "high",
    disposition: "fix",
    primary: second,
    items,
    requirements: items.map((item) => ({
      ruleId: item.finding.id,
      priority: item.action.priority,
      severity: item.finding.severity,
      disposition: item.action.disposition,
      confidence: item.action.confidence,
      fixMode: item.action.fixMode,
      rationale: item.action.rationale,
      nextSteps: item.action.nextSteps,
      verification: item.action.verification,
      acceptWhen: item.action.acceptWhen,
    })),
  };
}

function fixture(now = "2026-07-15T00:00:00.000Z") {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-acceptance-"));
  const cwd = join(root, "project");
  mkdirSync(cwd, { recursive: true });
  const path = join(root, "nested", ".agentreveal", "acceptances.json");
  let clock = new Date(now);
  const store = new AcceptanceStore({
    path,
    cwd,
    scopeId: projectScopeId(cwd),
    now: () => new Date(clock.getTime()),
  });
  return {
    root,
    path,
    cwd,
    store,
    setNow(value) {
      clock = new Date(value);
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("accept: 原子创建 0600 文件，并只持久化 task 摘要", () => {
  const f = fixture();
  try {
    const accepted = f.store.accept(task(), "  公司批准的内部中转  ", {
      expiresAt: "2026-08-15T00:00:00Z",
    });

    assert.equal(accepted.status, "active");
    assert.equal(accepted.reason, "公司批准的内部中转");
    assert.equal(accepted.createdAt, "2026-07-15T00:00:00.000Z");
    assert.equal(accepted.expiresAt, "2026-08-15T00:00:00.000Z");
    assert.equal(existsSync(f.path), true);
    assert.equal(statSync(f.path).mode & 0o777, 0o600);
    assert.equal(statSync(dirname(f.path)).mode & 0o777, 0o700);

    const text = readFileSync(f.path, "utf8");
    assert.doesNotMatch(text, /must-not-be-persisted/);
    const saved = JSON.parse(text);
    assert.equal(saved.schemaVersion, 2);
    const key = `${f.store.scopeId}:task-aaaaaaaaaaaa`;
    assert.equal(saved.acceptances[key][0].scopeId, f.store.scopeId);
    assert.equal(text.includes(f.cwd), false, "审计文件不得保存项目路径");
    assert.deepEqual(
      saved.acceptances[key][0].task.ruleIds,
      ["CODEX_CUSTOM_PROVIDER", "CODEX_INSECURE_HTTP"]
    );
    assert.deepEqual(
      saved.acceptances[key][0].task.titles,
      []
    );
    assert.deepEqual(
      saved.acceptances[key][0].task.rules.map((rule) => rule.ruleId),
      ["CODEX_CUSTOM_PROVIDER", "CODEX_INSECURE_HTTP"]
    );
    assert.doesNotMatch(text, /relay\.example|未知 Provider|明文 HTTP/);
    assert.deepEqual(
      readdirSync(dirname(f.path)).filter((name) => name.endsWith(".tmp")),
      []
    );
  } finally {
    f.cleanup();
  }
});

test("list/isAccepted: 到期后立即失效，但文件和审计记录保持不变", () => {
  const f = fixture();
  try {
    f.store.accept(task(), "限时例外", {
      expiresAt: "2026-07-16T00:00:00Z",
    });
    const before = readFileSync(f.path, "utf8");
    assert.equal(f.store.isAccepted("task-aaaaaaaaaaaa"), true);
    assert.equal(f.store.list()[0].status, "active");

    f.setNow("2026-07-16T00:00:00.000Z");
    assert.equal(f.store.isAccepted("task-aaaaaaaaaaaa"), false);
    assert.equal(f.store.list()[0].status, "expired");
    assert.deepEqual(f.store.list({ activeOnly: true }), []);
    assert.equal(readFileSync(f.path, "utf8"), before, "查询不得删除或改写过期记录");
  } finally {
    f.cleanup();
  }
});

test("revoke: 写 revokedAt 而不删除，并允许追加新的接受历史", () => {
  const f = fixture();
  try {
    f.store.accept(task(), "第一次接受");
    f.setNow("2026-07-15T01:00:00.000Z");
    const revoked = f.store.revoke("task-aaaaaaaaaaaa");
    assert.equal(revoked.status, "revoked");
    assert.equal(revoked.revokedAt, "2026-07-15T01:00:00.000Z");
    assert.equal(f.store.isAccepted("task-aaaaaaaaaaaa"), false);

    f.setNow("2026-07-15T02:00:00.000Z");
    f.store.accept(task(), "重新审核后接受");
    assert.equal(f.store.isAccepted("task-aaaaaaaaaaaa"), true);
    assert.equal(f.store.list().length, 2);
    assert.equal(f.store.list({ activeOnly: true }).length, 1);

    const saved = JSON.parse(readFileSync(f.path, "utf8"));
    const history = saved.acceptances[`${f.store.scopeId}:task-aaaaaaaaaaaa`];
    assert.equal(history.length, 2);
    assert.equal(history[0].reason, "第一次接受");
    assert.equal(history[0].revokedAt, "2026-07-15T01:00:00.000Z");
    assert.equal(history[1].reason, "重新审核后接受");
  } finally {
    f.cleanup();
  }
});

test("accept: 拒绝重复有效记录、空原因、过去的 expiresAt 和非法 taskId", () => {
  const f = fixture();
  try {
    f.store.accept(task(), "已有接受");
    assert.throws(() => f.store.accept(task(), "重复"), /当前项目处于接受状态/);
    assert.throws(
      () => new AcceptanceStore({ path: join(f.root, "other.json") }).accept(task(), "  "),
      /原因不能为空/
    );
    assert.throws(
      () => new AcceptanceStore({ path: join(f.root, "placeholder.json"), cwd: f.cwd }).accept(task(), "说明接受原因"),
      /占位文本/
    );
    assert.throws(
      () =>
        new AcceptanceStore({
          path: join(f.root, "past.json"),
          now: () => new Date("2026-07-15T00:00:00Z"),
        }).accept(task("task-bbbbbbbbbbbb"), "过去", {
          expiresAt: "2026-07-14T00:00:00Z",
        }),
      /必须晚于当前时间/
    );
    assert.throws(
      () => f.store.isAccepted("../acceptances.json"),
      /无效的任务 ID/
    );
  } finally {
    f.cleanup();
  }
});

test("损坏或未知版本的文件会明确报错，accept 不得覆盖原始审计文件", () => {
  const f = fixture();
  try {
    mkdirSync(dirname(f.path), { recursive: true });
    writeFileSync(f.path, "{broken-json\n");
    const original = readFileSync(f.path, "utf8");
    assert.throws(() => f.store.list(), /无法读取接受记录/);
    assert.throws(() => f.store.accept(task(), "不得覆盖"), /无法读取接受记录/);
    assert.equal(readFileSync(f.path, "utf8"), original);

    writeFileSync(
      f.path,
      JSON.stringify({ schemaVersion: 99, acceptances: {} })
    );
    assert.throws(() => f.store.list(), /版本或结构无效/);
  } finally {
    f.cleanup();
  }
});

test("defaultAcceptancePath 使用用户目录下的固定审计文件", () => {
  assert.equal(
    defaultAcceptancePath("/Users/example"),
    "/Users/example/.agentreveal/acceptances.json"
  );
});

test("项目作用域: 同 taskId 在两个项目中互不隐藏", () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-acceptance-scope-"));
  try {
    const projectA = join(root, "project-a");
    const projectB = join(root, "project-b");
    const path = join(root, "acceptances.json");
    mkdirSync(projectA);
    mkdirSync(projectB);
    const storeA = new AcceptanceStore({ path, cwd: projectA });
    const storeB = new AcceptanceStore({ path, cwd: projectB });

    storeA.accept(task(), "仅项目 A 接受");
    assert.equal(storeA.isAccepted("task-aaaaaaaaaaaa"), true);
    assert.equal(storeB.isAccepted("task-aaaaaaaaaaaa"), false);
    assert.equal(storeA.list({ activeOnly: true }).length, 1);
    assert.equal(storeB.list({ activeOnly: true }).length, 0);
    assert.notEqual(storeA.scopeId, storeB.scopeId);

    storeB.accept(task(), "项目 B 独立确认");
    const document = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(Object.keys(document.acceptances).length, 2);
    assert.equal(JSON.stringify(document).includes(projectA), false);
    assert.equal(JSON.stringify(document).includes(projectB), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("项目作用域: 真实路径、相对路径、尾斜杠和符号链接归一化", () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-acceptance-path-"));
  try {
    const project = join(root, "project");
    const alias = join(root, "alias");
    mkdirSync(project);
    symlinkSync(project, alias, "dir");

    const expected = projectScopeId(project);
    assert.equal(projectScopeId(`${project}/`), expected);
    assert.equal(projectScopeId(join(project, "..", "project")), expected);
    assert.equal(projectScopeId(alias), expected);
    assert.match(expected, /^scope-[a-f0-9]{64}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("项目作用域: 大小写按当前文件系统的真实路径语义处理", () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-acceptance-case-"));
  try {
    const upper = join(root, "CaseProject");
    const lower = join(root, "caseproject");
    mkdirSync(upper);
    mkdirSync(lower, { recursive: true });
    const upperStat = statSync(upper);
    const lowerStat = statSync(lower);
    const sameRealPath = upperStat.dev === lowerStat.dev && upperStat.ino === lowerStat.ino;
    assert.equal(projectScopeId(upper) === projectScopeId(lower), sameRealPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("schema v1: 旧无作用域记录保留为 legacy 但不再生效", () => {
  const f = fixture();
  try {
    const accepted = f.store.accept(task(), "旧版记录");
    const { scopeId: _scopeId, status: _status, ...legacyRecord } = accepted;
    writeFileSync(
      f.path,
      JSON.stringify({
        schemaVersion: 1,
        acceptances: { "task-aaaaaaaaaaaa": [legacyRecord] },
      })
    );

    const migrated = new AcceptanceStore({ path: f.path, cwd: f.cwd });
    assert.equal(migrated.isAccepted("task-aaaaaaaaaaaa"), false);
    assert.deepEqual(migrated.list({ activeOnly: true }), []);
    const legacy = migrated.list({ includeLegacy: true });
    assert.equal(legacy.length, 1);
    assert.equal(legacy[0].status, "legacy");

    migrated.accept(task(), "当前项目重新确认");
    const document = JSON.parse(readFileSync(f.path, "utf8"));
    assert.equal(document.schemaVersion, 2);
    assert.equal(document.legacyAcceptances["task-aaaaaaaaaaaa"].length, 1);
    assert.equal(Object.keys(document.acceptances).length, 1);
  } finally {
    f.cleanup();
  }
});
