import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  applyDesktopClaudeMigration,
  applyDesktopBaseline,
  backupDesktopClaudeRemediation,
  buildDesktopOverview,
  cleanupDesktopClaudeCredentialBackup,
  ignoreDesktopRule,
  previewDesktopBaseline,
  previewDesktopClaudeRestore,
  previewDesktopPostureBaseline,
  removeDesktopPostureBaseline,
  removeDesktopProviderTrust,
  removeDesktopRuleIgnore,
  resolveDesktopProjectPath,
  restoreDesktopBaseline,
  restoreDesktopClaudeBackup,
  scanDesktopMachine,
  scanDesktopProject,
  saveDesktopPostureBaseline,
  trustDesktopProvider,
  triageDesktopFixture,
  verifyDesktopPosture,
} from "../dist/desktop/service.js";
import { buildFirstRunSummary } from "../dist/core/first-run/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const binPath = join(repoRoot, "bin", "agentguard");

test("desktop service: 项目目录必须存在且会解析为真实绝对路径", () => {
  const directory = mkdtempSync(join(tmpdir(), "agentguard-desktop-"));
  try {
    assert.equal(resolveDesktopProjectPath(directory), realpathSync.native(directory));
    assert.throws(() => resolveDesktopProjectPath(""), /请选择/);
    assert.throws(
      () => resolveDesktopProjectPath(join(directory, "missing")),
      /ENOENT/
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("desktop service: 本机扫描使用固定 home scope 且不启用项目级策略", async () => {
  const home = mkdtempSync(join(tmpdir(), "agentguard-desktop-machine-"));
  try {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), "{}\n");
    writeFileSync(join(home, ".agentguard.json"), "{ broken project policy");

    const overview = await scanDesktopMachine(home);
    assert.equal(overview.scope.kind, "machine");
    assert.equal(overview.scope.path, realpathSync.native(home));
    assert.equal(overview.scope.projectPoliciesAvailable, false);
    assert.equal(overview.providerTrust.entries.length, 0);
    assert.equal(overview.ruleIgnores.entries.length, 0);
    assert.ok(
      overview.report.results.some(
        (result) => result.agent === "claude-code" && result.discovery.configFound
      )
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("desktop service E4: 有效配置、可信状态与漂移通过同一 typed service 闭环", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentguard-desktop-posture-"));
  const previous = {
    HOME: process.env.HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    AGENTGUARD_POSTURE_SNAPSHOT_PATH:
      process.env.AGENTGUARD_POSTURE_SNAPSHOT_PATH,
    AGENTGUARD_POSTURE_KEY_PATH: process.env.AGENTGUARD_POSTURE_KEY_PATH,
  };
  try {
    const home = join(root, "home");
    const cwd = join(root, "project");
    const configDir = join(home, ".claude");
    const configPath = join(configDir, "settings.json");
    const snapshotPath = join(root, "state", "posture.json");
    const keyPath = join(root, "state", "posture-key");
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        env: { ANTHROPIC_BASE_URL: "https://relay-a.example.com/v1" },
      })
    );
    process.env.HOME = home;
    delete process.env.XDG_CONFIG_HOME;
    process.env.AGENTGUARD_POSTURE_SNAPSHOT_PATH = snapshotPath;
    process.env.AGENTGUARD_POSTURE_KEY_PATH = keyPath;

    const initial = await scanDesktopProject(cwd);
    assert.ok(initial.posture?.agents.some(
      (entry) => entry.state.agentId === "claude-code"
    ));
    assert.equal(initial.drift?.status, "no-baseline");

    const preview = await previewDesktopPostureBaseline({
      projectPath: cwd,
    });
    assert.equal(preview.hasBaseline, false);
    assert.equal(preview.mutation, "create");
    assert.equal(preview.excludesSensitiveContent, true);
    assert.equal(existsSync(snapshotPath), false);
    assert.equal(statSync(keyPath).mode & 0o777, 0o600);

    const created = await saveDesktopPostureBaseline({
      projectPath: cwd,
      expectedCurrentFingerprint: preview.currentFingerprint,
      expectedStorageRevision: preview.storageRevision,
      replace: false,
    });
    assert.equal(created.mutation.mutation, "create");
    assert.equal(created.overview.drift?.status, "unchanged");
    const stored = readFileSync(snapshotPath, "utf8");
    assert.doesNotMatch(stored, /relay-a\.example\.com/u);
    assert.equal(stored.includes(cwd), false);

    writeFileSync(
      configPath,
      JSON.stringify({
        env: { ANTHROPIC_BASE_URL: "https://relay-b.example.com/v1" },
      })
    );
    const changed = await verifyDesktopPosture({ projectPath: cwd });
    assert.equal(changed.drift?.status, "changed");
    assert.ok(changed.drift?.events.some(
      (event) =>
        event.agentId === "claude-code" &&
        event.kind === "provider-route-changed"
    ));

    const removePreview = await previewDesktopPostureBaseline({
      projectPath: cwd,
    });
    assert.equal(removePreview.hasBaseline, true);
    const removed = await removeDesktopPostureBaseline({
      projectPath: cwd,
      expectedStorageRevision: removePreview.storageRevision,
    });
    assert.equal(removed.mutation.mutation, "remove");
    assert.equal(removed.overview.drift?.status, "no-baseline");
    await assert.rejects(
      saveDesktopPostureBaseline({
        projectPath: cwd,
        expectedCurrentFingerprint: removePreview.currentFingerprint,
        expectedStorageRevision: removePreview.storageRevision,
        replace: true,
      }),
      /发生变化|没有可替换/
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("desktop service: 项目规则忽略候选来自 core，隐藏后可审计并撤销", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentguard-desktop-ignore-"));
  const previousHome = process.env.HOME;
  const previousXdg = process.env.XDG_CONFIG_HOME;
  try {
    const home = join(root, "home");
    const cwd = join(root, "project");
    const xdg = join(root, "xdg");
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    mkdirSync(join(xdg, "opencode"), { recursive: true });
    writeFileSync(
      join(xdg, "opencode", "opencode.json"),
      JSON.stringify({
        mcp: { docs: { type: "local", command: ["node", "server.js"] } },
      })
    );
    process.env.HOME = home;
    process.env.XDG_CONFIG_HOME = xdg;

    const initial = await scanDesktopProject(cwd);
    const task = initial.tasks.find((candidate) =>
      candidate.requirements.some((requirement) => requirement.ruleId === "OPENCODE_MCP_LOCAL")
    );
    assert.ok(task);
    assert.deepEqual(initial.ignoreCandidates[task.taskId], [
      { ruleId: "OPENCODE_MCP_LOCAL", agent: "opencode" },
    ]);

    const ignored = await ignoreDesktopRule({
      projectPath: cwd,
      taskId: task.taskId,
      ruleId: "OPENCODE_MCP_LOCAL",
      reason: "已审核固定版本的项目内文档 MCP",
    });
    assert.deepEqual(ignored.entry, { ruleId: "OPENCODE_MCP_LOCAL", agent: "opencode" });
    assert.equal(ignored.overview.summary.ignoredFindingCount, 1);
    assert.equal(
      ignored.overview.report.allFindings.some((finding) => finding.id === "OPENCODE_MCP_LOCAL"),
      false
    );
    assert.equal(ignored.overview.ruleIgnores.auditEventCount, 1);
    const raw = readFileSync(join(cwd, ".agentguard.json"), "utf8");
    assert.equal(raw.includes("server.js"), false);
    assert.equal(raw.includes("evidence"), false);

    const restored = await removeDesktopRuleIgnore({
      projectPath: cwd,
      ruleId: "OPENCODE_MCP_LOCAL",
      agent: "opencode",
      reason: "项目已移除该 MCP",
    });
    assert.equal(restored.overview.summary.ignoredFindingCount, 0);
    assert.equal(
      restored.overview.report.allFindings.some((finding) => finding.id === "OPENCODE_MCP_LOCAL"),
      true
    );
    assert.equal(restored.overview.ruleIgnores.auditEventCount, 2);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;
    rmSync(root, { recursive: true, force: true });
  }
});

test("desktop service: 损坏的项目策略不会让只读扫描失败或泄露原文", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentguard-desktop-broken-policy-"));
  const previousHome = process.env.HOME;
  try {
    const home = join(root, "home");
    const cwd = join(root, "project");
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, ".agentguard.json"), "{ broken SECRET_PLACEHOLDER");
    process.env.HOME = home;

    const overview = await scanDesktopProject(cwd);
    assert.deepEqual(overview.providerTrust.entries, []);
    assert.deepEqual(overview.ruleIgnores.entries, []);
    assert.equal(JSON.stringify(overview).includes("SECRET_PLACEHOLDER"), false);
    const workspace = overview.report.results.find((result) => result.agent === "workspace");
    assert.ok(workspace.discovery.notes.some((note) => note.includes("已安全忽略")));
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    rmSync(root, { recursive: true, force: true });
  }
});

test("desktop service: 同一项目的 CLI 与 Desktop 任务及项目忽略结果一致", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentguard-desktop-parity-"));
  const previous = {
    HOME: process.env.HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    AGENTGUARD_ACCEPTANCE_PATH: process.env.AGENTGUARD_ACCEPTANCE_PATH,
    AGENTGUARD_TASK_SNAPSHOT_PATH: process.env.AGENTGUARD_TASK_SNAPSHOT_PATH,
  };
  try {
    const home = join(root, "home");
    const cwd = join(root, "project");
    const xdg = join(root, "xdg");
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    mkdirSync(join(xdg, "opencode"), { recursive: true });
    writeFileSync(
      join(xdg, "opencode", "opencode.json"),
      JSON.stringify({
        provider: { relay: { options: { baseURL: "https://relay.parity-example.net/v1" } } },
        mcp: { docs: { type: "local", command: ["node", "server.js"] } },
      })
    );
    process.env.HOME = home;
    process.env.XDG_CONFIG_HOME = xdg;
    process.env.AGENTGUARD_ACCEPTANCE_PATH = join(root, "acceptances.json");
    process.env.AGENTGUARD_TASK_SNAPSHOT_PATH = join(root, "task-snapshots.json");

    const cliSummary = () => {
      const result = spawnSync(process.execPath, [binPath, "--json"], {
        cwd,
        env: process.env,
        encoding: "utf8",
      });
      assert.ok(result.status === 0 || result.status === 2, result.stderr);
      return JSON.parse(result.stdout);
    };
    const taskShape = (tasks) =>
      tasks.map((task) => ({
        taskId: task.taskId,
        ruleIds: task.requirements.map((requirement) => requirement.ruleId),
      }));

    const desktop = await scanDesktopProject(cwd);
    const cli = cliSummary();
    assert.deepEqual(taskShape(desktop.tasks), taskShape(cli.tasks));
    assert.equal(desktop.summary.ignoredFindingCount, cli.summary.ignoredFindingCount);

    writeFileSync(
      join(cwd, ".agentguard.json"),
      JSON.stringify({
        ruleIgnores: [{
          ruleId: "OPENCODE_MCP_LOCAL",
          agent: "opencode",
          reason: "已审核固定版本的项目内文档 MCP",
          createdAt: "2026-07-18T00:00:00.000Z",
        }],
      })
    );
    const ignoredDesktop = await scanDesktopProject(cwd);
    const ignoredCli = cliSummary();
    assert.deepEqual(taskShape(ignoredDesktop.tasks), taskShape(ignoredCli.tasks));
    assert.equal(ignoredDesktop.summary.ignoredFindingCount, 1);
    assert.equal(ignoredCli.summary.ignoredFindingCount, 1);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("desktop service: 直接复用 core 的 taskId、处置与配置地图", () => {
  const finding = {
    id: "CLAUDE_PLAINTEXT_TOKEN",
    category: "secret",
    severity: "high",
    title: "settings 中存在明文 token",
    evidence: { keys: ["ANTHROPIC_AUTH_TOKEN"] },
  };
  const report = {
    results: [
      {
        agent: "claude-code",
        displayName: "Claude Code",
        discovery: {
          agent: "claude-code",
          displayName: "Claude Code",
          configFound: true,
          configPath: "/Users/example/.claude/settings.json",
        },
        findings: [finding],
      },
      {
        agent: "workspace",
        displayName: "当前项目",
        discovery: {
          agent: "workspace",
          displayName: "当前项目",
          configFound: true,
          configPath: "/Users/example/project",
        },
        findings: [],
      },
    ],
    allFindings: [finding],
    correlations: [],
  };

  const overview = buildDesktopOverview(
    "/Users/example/project",
    triageDesktopFixture(report),
    "2026-07-17T00:00:00.000Z"
  );
  assert.equal(overview.schemaVersion, 1);
  assert.equal(overview.firstRun.command, "first-run");
  assert.equal(overview.summary.configuredAgents, 1);
  assert.equal(overview.summary.taskCount, 1);
  assert.equal(overview.topTasks[0].taskId, overview.tasks[0].taskId);
  assert.equal(overview.topTasks[0].primary.finding.id, "CLAUDE_PLAINTEXT_TOKEN");
  assert.equal(overview.map.rows.length, 2);
  assert.deepEqual(overview.privacy, {
    localOnly: true,
    uploadsData: false,
    readOnlyScan: true,
  });
  assert.deepEqual(overview.providerTrust.entries, []);
  assert.deepEqual(overview.trustCandidates, {});
  const shared = buildFirstRunSummary(report, { platform: "darwin" });
  assert.deepEqual(overview.firstRun.tasks, shared.tasks);
  assert.deepEqual(overview.firstRun.topTasks, shared.topTasks);
  assert.deepEqual(overview.firstRun.buckets, shared.buckets);
  assert.deepEqual(overview.firstRun.remediationGuides, shared.remediationGuides);

  const accepted = buildDesktopOverview(
    "/Users/example/project",
    triageDesktopFixture(report, [
      {
        taskId: overview.tasks[0].taskId,
        scopeId: `scope-${"a".repeat(64)}`,
        reason: "已确认这是隔离的本地测试配置",
        createdAt: "2026-07-17T00:00:00.000Z",
        status: "active",
        task: {},
      },
    ]),
    "2026-07-17T00:00:00.000Z"
  );
  assert.equal(accepted.summary.taskCount, 0);
  assert.equal(accepted.summary.acceptedTaskCount, 1);
  assert.equal(accepted.acceptedTasks[0].task.taskId, overview.tasks[0].taskId);
  assert.equal(
    accepted.acceptedTasks[0].reason,
    "已确认这是隔离的本地测试配置"
  );
});

test("desktop service: 信任候选由任务证据推导，且不会掩盖 HTTP 风险", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentguard-desktop-trust-"));
  const previousHome = process.env.HOME;
  const previousXdg = process.env.XDG_CONFIG_HOME;
  try {
    const home = join(root, "home");
    const cwd = join(root, "project");
    const xdg = join(root, "xdg");
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    mkdirSync(join(xdg, "opencode"), { recursive: true });
    writeFileSync(
      join(xdg, "opencode", "opencode.json"),
      JSON.stringify({
        provider: {
          relay: { options: { baseURL: "http://relay.desktop-example.net/v1" } },
        },
      })
    );
    process.env.HOME = home;
    process.env.XDG_CONFIG_HOME = xdg;

    const initial = await scanDesktopProject(cwd);
    const task = initial.tasks.find((candidate) =>
      candidate.items.some((item) => item.finding.id === "OPENCODE_CUSTOM_PROVIDER")
    );
    assert.ok(task);
    assert.deepEqual(initial.trustCandidates[task.taskId], {
      endpoint: "relay.desktop-example.net",
    });

    const trusted = await trustDesktopProvider({
      projectPath: cwd,
      taskId: task.taskId,
      kind: "trusted",
      reason: "已核实为项目维护者控制的隔离中转站",
    });
    assert.deepEqual(trusted.entry, {
      endpoint: "relay.desktop-example.net",
      kind: "trusted",
    });
    const trustedIds = trusted.overview.report.allFindings.map((finding) => finding.id);
    assert.equal(trustedIds.includes("OPENCODE_CUSTOM_PROVIDER"), false);
    assert.equal(trustedIds.includes("OPENCODE_INSECURE_HTTP"), true);
    assert.equal(trusted.overview.providerTrust.auditEventCount, 1);

    const removed = await removeDesktopProviderTrust({
      projectPath: cwd,
      endpoint: "relay.desktop-example.net",
      kind: "trusted",
      reason: "服务归属发生变化，需要重新审核",
    });
    assert.equal(
      removed.overview.report.allFindings.some(
        (finding) => finding.id === "OPENCODE_CUSTOM_PROVIDER"
      ),
      true
    );
    const config = JSON.parse(readFileSync(join(cwd, ".agentguard.json"), "utf8"));
    assert.equal(config.providerTrustAudit.length, 2);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;
    rmSync(root, { recursive: true, force: true });
  }
});

test("desktop service: baseline 必须匹配预览、强制备份、复扫且安全恢复", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentguard-desktop-baseline-"));
  const previousHome = process.env.HOME;
  const previousXdg = process.env.XDG_CONFIG_HOME;
  try {
    const home = join(root, "home");
    const cwd = join(root, "project");
    const xdg = join(root, "xdg");
    const opencodeDir = join(xdg, "opencode");
    const configPath = join(opencodeDir, "opencode.json");
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    mkdirSync(opencodeDir, { recursive: true });
    const original = { permission: { bash: "allow", edit: "allow" }, share: "auto" };
    writeFileSync(configPath, JSON.stringify(original, null, 2) + "\n");
    process.env.HOME = home;
    process.env.XDG_CONFIG_HOME = xdg;

    const preview = await previewDesktopBaseline(cwd, "balanced");
    assert.match(preview.fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(preview.files.length, 1);

    const applied = await applyDesktopBaseline({
      projectPath: cwd,
      profile: "balanced",
      expectedPlanFingerprint: preview.fingerprint,
    });
    assert.equal(applied.restoreAvailable, true);
    assert.deepEqual(
      {
        operation: applied.transaction.operation,
        phase: applied.transaction.phase,
        restoreAvailable: applied.transaction.restoreAvailable,
      },
      { operation: "baseline", phase: "verified", restoreAvailable: true }
    );
    assert.ok(applied.apply.backupId);
    assert.equal(JSON.parse(readFileSync(configPath, "utf8")).permission.bash, "ask");
    assert.equal(
      applied.overview.report.allFindings.some(
        (finding) => finding.id === "OPENCODE_BASH_UNRESTRICTED"
      ),
      false
    );
    assert.match(
      readFileSync(join(cwd, ".agentguard", "backups", ".gitignore"), "utf8"),
      /AgentGuard backup safety/
    );

    const restored = await restoreDesktopBaseline({
      projectPath: cwd,
      backupId: applied.apply.backupId,
    });
    assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), original);
    assert.equal(restored.transaction.phase, "restored");
    assert.equal(restored.transaction.restoreAvailable, false);
    assert.equal(
      restored.overview.report.allFindings.some(
        (finding) => finding.id === "OPENCODE_BASH_UNRESTRICTED"
      ),
      true
    );

    const secondPreview = await previewDesktopBaseline(cwd, "balanced");
    const secondApply = await applyDesktopBaseline({
      projectPath: cwd,
      profile: "balanced",
      expectedPlanFingerprint: secondPreview.fingerprint,
    });
    const changedAfterApply = {
      ...JSON.parse(readFileSync(configPath, "utf8")),
      userChangedAfterApply: true,
    };
    writeFileSync(configPath, JSON.stringify(changedAfterApply, null, 2) + "\n");
    await assert.rejects(
      restoreDesktopBaseline({
        projectPath: cwd,
        backupId: secondApply.apply.backupId,
      }),
      /又发生了变化/
    );
    assert.equal(
      JSON.parse(readFileSync(configPath, "utf8")).userChangedAfterApply,
      true
    );
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;
    rmSync(root, { recursive: true, force: true });
  }
});

test("desktop service: Claude 迁移备份只覆盖明文设置，恢复校验并发修改与备份完整性", async () => {
  const home = mkdtempSync(join(tmpdir(), "agentguard-desktop-claude-backup-"));
  try {
    const configDir = join(home, ".claude");
    const settingsPath = join(configDir, "settings.json");
    const localPath = join(configDir, "settings.local.json");
    mkdirSync(configDir, { recursive: true });
    const originalSettings = {
      env: {
        ANTHROPIC_AUTH_TOKEN: "sk-ant-example-backup-placeholder",
        SAFE_FLAG: "1",
      },
      theme: "dark",
    };
    const originalLocal = {
      env: { ANTHROPIC_API_KEY: "sk-ant-api-example-backup-placeholder" },
      permissions: { defaultMode: "default" },
    };
    writeFileSync(settingsPath, JSON.stringify(originalSettings, null, 2) + "\n");
    writeFileSync(localPath, JSON.stringify(originalLocal, null, 2) + "\n");
    chmodSync(settingsPath, 0o644);
    chmodSync(localPath, 0o640);

    const overview = await scanDesktopMachine(home);
    const task = overview.tasks.find((candidate) =>
      candidate.requirements.some(
        (requirement) => requirement.ruleId === "CLAUDE_PLAINTEXT_TOKEN"
      )
    );
    assert.ok(task);
    const backup = await backupDesktopClaudeRemediation({
      projectPath: home,
      taskId: task.taskId,
      scopeKind: "machine",
    });
    assert.equal(backup.backup.files, 2);
    assert.equal(JSON.stringify(backup).includes("sk-ant-"), false);
    const backupRoot = join(
      home,
      ".agentguard",
      "backups",
      backup.backup.backupId
    );
    const manifest = JSON.parse(
      readFileSync(join(backupRoot, "manifest.json"), "utf8")
    );
    assert.equal(manifest.files.length, 2);
    assert.ok(
      manifest.files.every((file) => (statSync(file.backupPath).mode & 0o777) === 0o600)
    );

    writeFileSync(
      settingsPath,
      JSON.stringify({
        env: { SAFE_FLAG: "1" },
        theme: "dark",
        apiKeyHelper: "security find-generic-password -s AgentGuard/example -w",
      }, null, 2) + "\n"
    );
    writeFileSync(
      localPath,
      JSON.stringify({
        env: {},
        permissions: { defaultMode: "default" },
        apiKeyHelper: "security find-generic-password -s AgentGuard/example -w",
      }, null, 2) + "\n"
    );
    const preview = previewDesktopClaudeRestore({
      projectPath: home,
      backupId: backup.backup.backupId,
    });
    assert.equal(preview.changedFiles, 2);
    assert.match(preview.fingerprint, /^[a-f0-9]{64}$/);

    writeFileSync(
      settingsPath,
      JSON.stringify({
        ...JSON.parse(readFileSync(settingsPath, "utf8")),
        userChangedAfterPreview: true,
      }, null, 2) + "\n"
    );
    await assert.rejects(
      restoreDesktopClaudeBackup({
        projectPath: home,
        backupId: backup.backup.backupId,
        expectedFingerprint: preview.fingerprint,
        scopeKind: "machine",
      }),
      /发生变化/
    );
    assert.equal(
      JSON.parse(readFileSync(settingsPath, "utf8")).userChangedAfterPreview,
      true
    );

    const refreshed = previewDesktopClaudeRestore({
      projectPath: home,
      backupId: backup.backup.backupId,
    });
    const restored = await restoreDesktopClaudeBackup({
      projectPath: home,
      backupId: backup.backup.backupId,
      expectedFingerprint: refreshed.fingerprint,
      scopeKind: "machine",
    });
    assert.deepEqual(JSON.parse(readFileSync(settingsPath, "utf8")), originalSettings);
    assert.deepEqual(JSON.parse(readFileSync(localPath, "utf8")), originalLocal);
    assert.equal(statSync(settingsPath).mode & 0o777, 0o644);
    assert.equal(statSync(localPath).mode & 0o777, 0o640);
    assert.ok(
      restored.overview.tasks.some((candidate) => candidate.taskId === task.taskId)
    );

    const tampered = await backupDesktopClaudeRemediation({
      projectPath: home,
      taskId: task.taskId,
      scopeKind: "machine",
    });
    const tamperedManifest = JSON.parse(
      readFileSync(
        join(
          home,
          ".agentguard",
          "backups",
          tampered.backup.backupId,
          "manifest.json"
        ),
        "utf8"
      )
    );
    writeFileSync(tamperedManifest.files[0].backupPath, "tampered\n");
    assert.throws(
      () =>
        previewDesktopClaudeRestore({
          projectPath: home,
          backupId: tampered.backup.backupId,
        }),
      /完整性/
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("desktop service: Claude 迁移绑定任务、备份和指纹，应用后自动复扫并保留恢复入口", async () => {
  const home = mkdtempSync(join(tmpdir(), "agentguard-desktop-claude-migrate-"));
  try {
    const configDir = join(home, ".claude");
    const settingsPath = join(configDir, "settings.json");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_AUTH_TOKEN: "sk-ant-example-migration-placeholder",
          SAFE_FLAG: "1",
        },
      }, null, 2) + "\n"
    );
    const overview = await scanDesktopMachine(home);
    const task = overview.tasks.find((candidate) =>
      candidate.requirements.some(
        (requirement) => requirement.ruleId === "CLAUDE_PLAINTEXT_TOKEN"
      )
    );
    assert.ok(task);
    const backup = await backupDesktopClaudeRemediation({
      projectPath: home,
      taskId: task.taskId,
      scopeKind: "machine",
    });
    assert.match(backup.migration.fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(backup.migration.plaintextFields, 1);
    assert.equal(JSON.stringify(backup.migration).includes("sk-ant-"), false);
    assert.deepEqual(backup.retention, {
      policy: "until-user-confirmed-cleanup",
      autoDelete: false,
      secureErase: false,
    });

    const migrated = await applyDesktopClaudeMigration({
      projectPath: home,
      taskId: task.taskId,
      backupId: backup.backup.backupId,
      expectedFingerprint: backup.migration.fingerprint,
      scopeKind: "machine",
    });
    assert.equal(migrated.transaction.phase, "verified");
    assert.equal(migrated.transaction.operation, "claude-credential");
    assert.equal(migrated.transaction.restoreAvailable, true);
    assert.equal(migrated.verification.command, "claude auth status --text");
    assert.equal(
      migrated.overview.tasks.some((candidate) =>
        candidate.requirements.some(
          (requirement) => requirement.ruleId === "CLAUDE_PLAINTEXT_TOKEN"
        )
      ),
      false
    );
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.deepEqual(settings.env, { SAFE_FLAG: "1" });
    assert.match(settings.apiKeyHelper, /security find-generic-password/);

    const restorePreview = previewDesktopClaudeRestore({
      projectPath: home,
      backupId: backup.backup.backupId,
    });
    const restored = await restoreDesktopClaudeBackup({
      projectPath: home,
      backupId: backup.backup.backupId,
      expectedFingerprint: restorePreview.fingerprint,
      scopeKind: "machine",
    });
    assert.ok(restored.overview.tasks.some((candidate) =>
      candidate.requirements.some(
        (requirement) => requirement.ruleId === "CLAUDE_PLAINTEXT_TOKEN"
      )
    ));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("desktop service H4: 真实鉴权确认前保留备份，配置漂移时拒绝清理，稳定后只删精确备份", async () => {
  const home = mkdtempSync(join(tmpdir(), "agentguard-desktop-claude-cleanup-"));
  try {
    const configDir = join(home, ".claude");
    const settingsPath = join(configDir, "settings.json");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_AUTH_TOKEN: "sk-ant-example-cleanup-placeholder",
          SAFE_FLAG: "1",
        },
      }, null, 2) + "\n"
    );
    const overview = await scanDesktopMachine(home);
    const task = overview.tasks.find((candidate) =>
      candidate.requirements.some(
        (requirement) => requirement.ruleId === "CLAUDE_PLAINTEXT_TOKEN"
      )
    );
    assert.ok(task);
    const backup = await backupDesktopClaudeRemediation({
      projectPath: home,
      taskId: task.taskId,
      scopeKind: "machine",
    });
    const backupPath = join(
      home,
      ".agentguard",
      "backups",
      backup.backup.backupId
    );
    await assert.rejects(
      cleanupDesktopClaudeCredentialBackup({
        projectPath: home,
        taskId: task.taskId,
        backupId: backup.backup.backupId,
        scopeKind: "machine",
      }),
      /已完成迁移和复扫验证/
    );
    assert.equal(existsSync(backupPath), true);

    const migrated = await applyDesktopClaudeMigration({
      projectPath: home,
      taskId: task.taskId,
      backupId: backup.backup.backupId,
      expectedFingerprint: backup.migration.fingerprint,
      scopeKind: "machine",
    });
    assert.equal(migrated.transaction.phase, "verified");
    const stable = readFileSync(settingsPath, "utf8");
    const changed = JSON.parse(stable);
    changed.apiKeyHelper = "security find-generic-password -s AgentGuard/other -w";
    writeFileSync(settingsPath, JSON.stringify(changed, null, 2) + "\n");
    await assert.rejects(
      cleanupDesktopClaudeCredentialBackup({
        projectPath: home,
        taskId: task.taskId,
        backupId: backup.backup.backupId,
        scopeKind: "machine",
      }),
      /暂不删除备份/
    );
    assert.equal(existsSync(backupPath), true);

    writeFileSync(settingsPath, stable);
    const cleaned = await cleanupDesktopClaudeCredentialBackup({
      projectPath: home,
      taskId: task.taskId,
      backupId: backup.backup.backupId,
      scopeKind: "machine",
    });
    assert.equal(cleaned.transaction.phase, "backup-cleaned");
    assert.equal(cleaned.transaction.restoreAvailable, false);
    assert.equal(existsSync(backupPath), false);
    await assert.rejects(
      cleanupDesktopClaudeCredentialBackup({
        projectPath: home,
        taskId: task.taskId,
        backupId: backup.backup.backupId,
        scopeKind: "machine",
      }),
      /本次应用会话/
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
