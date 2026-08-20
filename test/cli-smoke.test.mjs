/**
 * CLI smoke tests：直接运行 bin/agentreveal，验证端到端命令路径。
 * 从 dist/ 启动。运行前需 npm run build。
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const binPath = join(repoRoot, "bin", "agentreveal");
const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

function withCliProject(config, fn) {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-cli-"));
  try {
    const home = join(root, "home");
    const cwd = join(root, "project");
    const xdg = join(root, "xdg");
    const ocDir = join(xdg, "opencode");
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    mkdirSync(ocDir, { recursive: true });
    const configPath = join(ocDir, "opencode.json");
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

    const env = {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: xdg,
      AGENTREVEAL_TEST_ROOT: root,
      AGENTREVEAL_ACCEPTANCE_PATH: join(root, "acceptances.json"),
      AGENTREVEAL_TASK_SNAPSHOT_PATH: join(root, "task-snapshots.json"),
      AGENTREVEAL_POSTURE_SNAPSHOT_PATH: join(root, "posture-snapshots.json"),
      AGENTREVEAL_POSTURE_KEY_PATH: join(root, "posture-state-key"),
    };

    return fn({
      home,
      cwd,
      configPath,
      acceptancePath: env.AGENTREVEAL_ACCEPTANCE_PATH,
      taskSnapshotPath: env.AGENTREVEAL_TASK_SNAPSHOT_PATH,
      posturePath: env.AGENTREVEAL_POSTURE_SNAPSHOT_PATH,
      runAt: (runCwd, args) =>
        spawnSync(process.execPath, [binPath, ...args], {
          cwd: runCwd,
          env,
          encoding: "utf8",
        }),
      run: (args) =>
        spawnSync(process.execPath, [binPath, ...args], {
          cwd,
          env,
          encoding: "utf8",
        }),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("cli: version matches package.json", () => {
  const res = spawnSync(process.execPath, [binPath, "--version"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout.trim(), packageJson.version);
});

test("cli: 裸执行进入统一首次入口，JSON 与终端共享 Top 3 行动摘要", () => {
  withCliProject(
    {
      permission: { bash: "allow", edit: "allow" },
      provider: {
        relay: {
          options: { baseURL: "https://relay.cli-first-run-example.net/v1" },
        },
      },
    },
    ({ run }) => {
      const terminal = run([]);
      assert.equal(terminal.status, 2, terminal.stderr);
      assert.ok(terminal.stdout.indexOf("实际连接链路") < terminal.stdout.indexOf("行动摘要"));
      assert.match(terminal.stdout, /建议先完成（最多 3 项）/);
      assert.match(terminal.stdout, /task-[a-f0-9]{12}/);
      assert.match(terminal.stdout, /agentreveal report --format html/);

      const machine = run(["--json"]);
      assert.equal(machine.status, 2, machine.stderr);
      const parsed = JSON.parse(machine.stdout);
      assert.equal(parsed.schemaVersion, 1);
      assert.equal(parsed.command, "first-run");
      assert.ok(parsed.topTasks.length > 0 && parsed.topTasks.length <= 3);
      assert.deepEqual(
        parsed.topTasks.map((task) => task.taskId),
        parsed.tasks
          .filter((task) => task.disposition !== "observe")
          .slice(0, 3)
          .map((task) => task.taskId)
      );
      assert.equal(parsed.privacy.uploadsData, false);
    }
  );
});

test("cli: 未知命令不会被裸入口静默接受", () => {
  const res = spawnSync(process.execPath, [binPath, "definitely-not-a-command"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /未知命令/);
  assert.equal(res.stdout, "");
});

test("cli: integration scan 输出模型安全摘要且不创建任务快照", () => {
  withCliProject(
    {
      permission: { bash: "allow", edit: "allow" },
      provider: {
        relay: {
          options: { baseURL: "https://relay.integration-example.net/v1" },
        },
      },
    },
    ({ run, configPath, taskSnapshotPath }) => {
      const result = run(["integration", "scan", "--format", "model-json"]);
      assert.equal(result.status, 2, result.stderr);
      const parsed = JSON.parse(result.stdout);

      assert.equal(parsed.schemaVersion, 1);
      assert.equal(parsed.command, "integration.scan");
      assert.equal(parsed.privacy.readOnlyScan, true);
      assert.equal(parsed.privacy.uploadsData, false);
      assert.ok(parsed.topRisks.length > 0 && parsed.topRisks.length <= 3);
      assert.doesNotMatch(result.stdout, new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(result.stdout, /relay\.integration-example\.net|task-[a-f0-9]+/);
      assert.equal(
        Object.hasOwn(parsed.topRisks[0], "evidence"),
        false
      );
      assert.equal(existsSync(taskSnapshotPath), false);
    }
  );
});

test("cli: posture 的终端与 JSON 共用有效状态契约", () => {
  withCliProject({}, ({ home, run }) => {
    const claudeDir = join(home, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, "settings.json"),
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: "https://relay.posture-example.net/v1",
          ANTHROPIC_API_KEY: "SECRET_PLACEHOLDER",
        },
        permissions: { defaultMode: "plan" },
      })
    );

    const terminal = run(["posture"]);
    assert.equal(terminal.status, 0, terminal.stderr);
    assert.match(terminal.stdout, /当前真正生效/);
    assert.match(terminal.stdout, /relay\.posture-example\.net/);
    assert.match(terminal.stdout, /证据不完整|推断/);

    const machine = run(["posture", "--json"]);
    assert.equal(machine.status, 0, machine.stderr);
    const parsed = JSON.parse(machine.stdout);
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.command, "posture");
    assert.equal(parsed.agents[0].state.agentId, "claude-code");
    assert.ok(parsed.agents[0].uncertainty.length > 0);
    assert.doesNotMatch(machine.stdout, /SECRET_PLACEHOLDER/);
  });
});

test("cli: drift baseline 显式确认、比较、恢复、重新出现和删除闭环", () => {
  withCliProject({}, ({ home, posturePath, run }) => {
    const claudeDir = join(home, ".claude");
    const settingsPath = join(claudeDir, "settings.json");
    mkdirSync(claudeDir, { recursive: true });
    const writeSettings = (defaultMode) =>
      writeFileSync(
        settingsPath,
        JSON.stringify({
          env: { ANTHROPIC_BASE_URL: "https://api.anthropic.com" },
          permissions: { defaultMode },
        })
      );
    writeSettings("plan");

    const preview = run(["drift", "baseline", "--json"]);
    assert.equal(preview.status, 1, preview.stderr);
    const previewJson = JSON.parse(preview.stdout);
    assert.equal(previewJson.command, "drift.baseline");
    assert.equal(previewJson.applied, false);
    assert.equal(previewJson.preview.mutation, "create");
    assert.equal(existsSync(posturePath), false);

    const created = run(["drift", "baseline", "--confirm", "--json"]);
    assert.equal(created.status, 0, created.stderr);
    assert.equal(JSON.parse(created.stdout).result.mutation, "create");
    assert.equal(statSync(posturePath).mode & 0o777, 0o600);
    assert.doesNotMatch(
      readFileSync(posturePath, "utf8"),
      /api\.anthropic\.com|settings\.json/
    );

    const unchanged = run(["drift", "--json"]);
    assert.equal(unchanged.status, 0, unchanged.stderr);
    assert.equal(JSON.parse(unchanged.stdout).drift.status, "unchanged");

    writeSettings("bypassPermissions");
    const changed = run(["drift", "--json"]);
    assert.equal(changed.status, 2, changed.stderr);
    const changedJson = JSON.parse(changed.stdout);
    assert.equal(changedJson.drift.status, "changed");
    assert.ok(
      changedJson.drift.events.some(
        (entry) =>
          entry.kind === "permission-changed" && entry.priority === "P0"
      )
    );

    writeSettings("plan");
    const restored = run(["drift", "--json"]);
    assert.equal(restored.status, 0, restored.stderr);
    assert.ok(JSON.parse(restored.stdout).drift.resolvedEventCount > 0);

    writeSettings("bypassPermissions");
    const reappeared = run(["drift", "--json"]);
    assert.equal(reappeared.status, 2, reappeared.stderr);
    assert.ok(
      JSON.parse(reappeared.stdout).drift.events.some(
        (entry) => entry.change === "reappeared"
      )
    );

    const refusedReplace = run(["drift", "baseline", "--confirm"]);
    assert.equal(refusedReplace.status, 1);
    assert.match(refusedReplace.stderr, /--replace --confirm/);

    const replaced = run([
      "drift",
      "baseline",
      "--replace",
      "--confirm",
      "--json",
    ]);
    assert.equal(replaced.status, 0, replaced.stderr);
    assert.equal(JSON.parse(replaced.stdout).result.mutation, "replace");

    const removePreview = run(["drift", "baseline", "--remove", "--json"]);
    assert.equal(removePreview.status, 1, removePreview.stderr);
    assert.equal(JSON.parse(removePreview.stdout).applied, false);
    const removed = run([
      "drift",
      "baseline",
      "--remove",
      "--confirm",
      "--json",
    ]);
    assert.equal(removed.status, 0, removed.stderr);
    assert.equal(JSON.parse(removed.stdout).result.mutation, "remove");
    assert.equal(JSON.parse(removed.stdout).result.changed, true);
  });
});

test("package: Release tarball 使用预编译 dist，不依赖安装期构建", () => {
  assert.equal(packageJson.scripts.prepare, undefined);
  assert.ok(packageJson.files.includes("dist"));
  assert.ok(readFileSync(join(repoRoot, "dist", "cli.js"), "utf8").length > 0);
});

test("docs: README 脱敏 CLI 示例存在且保留首次行动结构", () => {
  const samplePath = join(repoRoot, "examples", "scan-output.txt");
  assert.equal(existsSync(samplePath), true);
  const sample = readFileSync(samplePath, "utf8");
  assert.match(sample, /本机运行 · 默认只读 · 不自动上传/);
  assert.match(sample, /实际连接链路/);
  assert.match(sample, /建议先完成（最多 3 项）/);
  assert.match(sample, /relay\.demo-example\.net/);
  assert.doesNotMatch(sample, /\/Users\/(?!example)|[A-Za-z]:\\Users\\/);
});

test("cli: baseline 必须显式 --dry-run", () => {
  withCliProject({ permission: { bash: "allow" } }, ({ run }) => {
    const res = run(["baseline", "--profile", "balanced"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /--dry-run/);
  });
});

test("cli: trust add/list/remove 只消除未知端点并保留审计", () => {
  withCliProject(
    {
      provider: {
        relay: { options: { baseURL: "https://relay.private-example.net/v1" } },
      },
    },
    ({ cwd, run }) => {
      const added = run([
        "trust",
        "add",
        "https://relay.private-example.net/v1",
        "--reason",
        "个人维护的隔离中转站",
        "--json",
      ]);
      assert.equal(added.status, 0, added.stderr);
      assert.equal(JSON.parse(added.stdout).command, "trust.add");

      const state = JSON.parse(run(["trust", "list", "--json"]).stdout);
      assert.deepEqual(state.entries, [
        { endpoint: "relay.private-example.net", kind: "trusted" },
      ]);
      assert.equal(state.audit.length, 1);

      const trustedScan = run(["scan", "--json"]);
      const trustedReport = JSON.parse(trustedScan.stdout);
      assert.equal(
        trustedReport.allFindings.some((finding) => finding.id === "OPENCODE_CUSTOM_PROVIDER"),
        false
      );

      const removed = run([
        "trust",
        "remove",
        "relay.private-example.net",
        "--reason",
        "中转站已停止使用",
        "--json",
      ]);
      assert.equal(removed.status, 0, removed.stderr);
      const raw = JSON.parse(readFileSync(join(cwd, ".agentreveal.json"), "utf8"));
      assert.equal(raw.providerTrustAudit.length, 2);

      const untrustedScan = JSON.parse(run(["scan", "--json"]).stdout);
      assert.equal(
        untrustedScan.allFindings.some((finding) => finding.id === "OPENCODE_CUSTOM_PROVIDER"),
        true
      );
    }
  );
});

test("cli: ignore 只能从当前任务添加，并可审计、隐藏和撤销低优先级规则", () => {
  withCliProject(
    {
      mcp: {
        docs: { type: "local", command: ["node", "server.js"] },
      },
    },
    ({ cwd, run }) => {
      const firstRun = JSON.parse(run(["--json"]).stdout);
      const task = firstRun.tasks.find((entry) =>
        entry.requirements.some((requirement) => requirement.ruleId === "OPENCODE_MCP_LOCAL")
      );
      assert.ok(task);

      const added = run([
        "ignore",
        "add",
        task.taskId,
        "--rule",
        "OPENCODE_MCP_LOCAL",
        "--reason",
        "已审核固定版本的项目内文档 MCP",
        "--json",
      ]);
      assert.equal(added.status, 0, added.stderr);
      assert.equal(JSON.parse(added.stdout).command, "ignore.add");

      const scan = JSON.parse(run(["scan", "--json"]).stdout);
      assert.equal(scan.ignoredFindingCount, 1);
      assert.equal(scan.allFindings.some((finding) => finding.id === "OPENCODE_MCP_LOCAL"), false);

      const listed = JSON.parse(run(["ignore", "list", "--json"]).stdout);
      assert.equal(listed.command, "ignore.list");
      assert.equal(listed.entries[0].reason, "已审核固定版本的项目内文档 MCP");
      const raw = readFileSync(join(cwd, ".agentreveal.json"), "utf8");
      assert.equal(raw.includes("server.js"), false);
      assert.equal(raw.includes("evidence"), false);

      const removed = run([
        "ignore",
        "remove",
        "OPENCODE_MCP_LOCAL",
        "--agent",
        "opencode",
        "--reason",
        "项目已移除该 MCP",
        "--json",
      ]);
      assert.equal(removed.status, 0, removed.stderr);
      assert.equal(JSON.parse(removed.stdout).command, "ignore.remove");
      const restored = JSON.parse(run(["scan", "--json"]).stdout);
      assert.equal(restored.ignoredFindingCount, 0);
      assert.equal(restored.allFindings.some((finding) => finding.id === "OPENCODE_MCP_LOCAL"), true);
    }
  );
});

test("cli: baseline dry-run 不泄露未变更密钥且不写文件", () => {
  withCliProject(
    {
      provider: {
        relay: { options: { apiKey: "sk-CLI-SECRET-SHOULD-NOT-LEAK" } },
      },
      permission: { bash: "allow" },
    },
    ({ configPath, run }) => {
      const original = readFileSync(configPath, "utf8");
      const res = run(["baseline", "--profile", "balanced", "--dry-run", "--json"]);
      assert.equal(res.status, 0);
      assert.ok(!res.stdout.includes("sk-CLI-SECRET-SHOULD-NOT-LEAK"));
      const plan = JSON.parse(res.stdout);
      assert.equal(plan.schemaVersion, 1);
      assert.equal(plan.command, "baseline");
      assert.equal(plan.files.length, 1);
      assert.equal(readFileSync(configPath, "utf8"), original);
    }
  );
});

test("cli: apply --backup 后 restore 可恢复 OpenCode 配置", () => {
  withCliProject(
    {
      permission: { bash: "allow", edit: "allow" },
      share: "auto",
    },
    ({ configPath, run }) => {
      const original = readFileSync(configPath, "utf8");
      const apply = run(["apply", "--profile", "balanced", "--backup", "--json"]);
      assert.equal(apply.status, 0, apply.stderr);
      const appliedResult = JSON.parse(apply.stdout);
      assert.equal(appliedResult.schemaVersion, 1);
      assert.equal(appliedResult.command, "apply");
      assert.ok(appliedResult.backupId);

      const appliedConfig = JSON.parse(readFileSync(configPath, "utf8"));
      assert.equal(appliedConfig.permission.bash, "ask");
      assert.equal(appliedConfig.share, "manual");

      const restore = run(["restore", "--json"]);
      assert.equal(restore.status, 0, restore.stderr);
      const restored = JSON.parse(restore.stdout);
      assert.equal(restored.schemaVersion, 1);
      assert.equal(restored.command, "restore");
      assert.equal(restored.restored, true);
      assert.equal(restored.backupId, appliedResult.backupId);
      assert.equal(readFileSync(configPath, "utf8"), original);
    }
  );
});

test("cli: restore 拒绝非法备份 ID，并输出可读错误", () => {
  withCliProject({}, ({ run }) => {
    const res = run(["restore", "--id", "../../outside", "--json"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /无效的备份 ID/);
    assert.doesNotMatch(res.stderr, /at restoreBaselineBackup/);
  });
});

test("cli: Claude 凭证迁移可先备份，并通过指纹确认安全恢复", () => {
  withCliProject({}, ({ home, cwd, run }) => {
    const configDir = join(home, ".claude");
    const settingsPath = join(configDir, "settings.json");
    mkdirSync(configDir, { recursive: true });
    const original = {
      env: {
        ANTHROPIC_AUTH_TOKEN: "sk-ant-example-cli-backup-placeholder",
        SAFE_FLAG: "1",
      },
      theme: "dark",
    };
    writeFileSync(settingsPath, JSON.stringify(original, null, 2) + "\n");
    chmodSync(settingsPath, 0o640);

    const firstRun = JSON.parse(run(["--json"]).stdout);
    const task = firstRun.tasks.find((candidate) =>
      candidate.requirements.some(
        (requirement) => requirement.ruleId === "CLAUDE_PLAINTEXT_TOKEN"
      )
    );
    assert.ok(task);
    const hasMacBackupGuide = firstRun.remediationGuides[
      task.taskId
    ].commands.some(
      (command) =>
        command.command === `agentreveal credential backup ${task.taskId}`
    );
    assert.equal(hasMacBackupGuide, process.platform === "darwin");

    const backupRun = run([
      "credential",
      "backup",
      task.taskId,
      "--json",
    ]);
    assert.equal(backupRun.status, 0, backupRun.stderr);
    assert.doesNotMatch(backupRun.stdout, /sk-ant-example-cli/);
    const backup = JSON.parse(backupRun.stdout);
    assert.equal(backup.command, "credential.backup");
    assert.equal(backup.taskId, task.taskId);
    assert.equal(backup.files, 1);

    const backupRoot = join(cwd, ".agentreveal", "backups", backup.backupId);
    const manifest = JSON.parse(
      readFileSync(join(backupRoot, "manifest.json"), "utf8")
    );
    assert.equal(statSync(backupRoot).mode & 0o777, 0o700);
    assert.equal(statSync(manifest.files[0].backupPath).mode & 0o777, 0o600);

    const migrated = {
      env: { SAFE_FLAG: "1" },
      theme: "dark",
      apiKeyHelper: "security find-generic-password -s AgentReveal/example -w",
    };
    writeFileSync(settingsPath, JSON.stringify(migrated, null, 2) + "\n");

    const previewRun = run([
      "credential",
      "restore",
      backup.backupId,
      "--json",
    ]);
    assert.equal(previewRun.status, 1, previewRun.stderr);
    const preview = JSON.parse(previewRun.stdout);
    assert.equal(preview.command, "credential.restore");
    assert.equal(preview.restored, false);
    assert.equal(preview.changedFiles, 1);
    assert.match(preview.fingerprint, /^[a-f0-9]{64}$/);
    assert.deepEqual(JSON.parse(readFileSync(settingsPath, "utf8")), migrated);

    const changedAfterPreview = { ...migrated, userChangedAfterPreview: true };
    writeFileSync(
      settingsPath,
      JSON.stringify(changedAfterPreview, null, 2) + "\n"
    );
    const staleConfirm = run([
      "credential",
      "restore",
      backup.backupId,
      "--confirm",
      preview.fingerprint,
      "--json",
    ]);
    assert.equal(staleConfirm.status, 1);
    assert.match(staleConfirm.stderr, /发生变化/);
    assert.deepEqual(
      JSON.parse(readFileSync(settingsPath, "utf8")),
      changedAfterPreview
    );

    const refreshed = JSON.parse(
      run(["credential", "restore", backup.backupId, "--json"]).stdout
    );
    const restoredRun = run([
      "credential",
      "restore",
      backup.backupId,
      "--confirm",
      refreshed.fingerprint,
      "--json",
    ]);
    assert.equal(restoredRun.status, 0, restoredRun.stderr);
    assert.doesNotMatch(restoredRun.stdout, /sk-ant-example-cli/);
    const restored = JSON.parse(restoredRun.stdout);
    assert.equal(restored.command, "credential.restore");
    assert.equal(restored.restored, true);
    assert.deepEqual(JSON.parse(readFileSync(settingsPath, "utf8")), original);
    assert.equal(statSync(settingsPath).mode & 0o777, 0o640);
  });
});

test("cli: risk accept 隐藏任务并影响退出码，revoke 后恢复", () => {
  withCliProject(
    {
      provider: {
        official: {
          options: {
            baseURL: "https://api.openai.com/v1",
            apiKey: "sk-CLI-ACCEPTANCE-SECRET",
          },
        },
      },
    },
    ({ cwd, acceptancePath, run, runAt }) => {
      const reportPath = join(cwd, "before.html");
      const before = run(["report", "--format", "html", "--output", reportPath]);
      assert.equal(before.status, 2, before.stderr);
      const initialHtml = readFileSync(reportPath, "utf8");
      const taskId = initialHtml.match(/id="(task-[a-f0-9]{12})"/)?.[1];
      assert.ok(taskId, "报告应提供稳定 task ID");

      const stillPresent = run(["risk", "verify", taskId]);
      assert.equal(stillPresent.status, 2, stillPresent.stderr);
      assert.match(stillPresent.stdout, /仍存在/);

      const permanent = run([
        "risk",
        "accept",
        taskId,
        "--reason",
        "不应永久接受 P0",
      ]);
      assert.equal(permanent.status, 1);
      assert.match(permanent.stderr, /P0 任务只能限时接受/);

      const preflightOnly = run([
        "risk",
        "accept",
        taskId,
        "--reason",
        "准备接受但尚未确认",
        "--expires",
        "2099-12-31",
      ]);
      assert.equal(preflightOnly.status, 1);
      assert.match(preflightOnly.stdout, /接受前确认/);
      assert.match(preflightOnly.stdout, /OPENCODE_PLAINTEXT_KEY/);
      assert.match(preflightOnly.stderr, /增加 --confirm/);
      assert.equal(existsSync(acceptancePath), false);

      const placeholder = run([
        "risk",
        "accept",
        taskId,
        "--reason",
        "填写真实接受原因",
        "--expires",
        "2099-12-31",
        "--confirm",
      ]);
      assert.equal(placeholder.status, 1);
      assert.match(placeholder.stderr, /占位文本/);
      assert.equal(existsSync(acceptancePath), false);

      const accepted = run([
        "risk",
        "accept",
        taskId,
        "--reason",
        "个人测试凭证，限时保留",
        "--expires",
        "2099-12-31",
        "--confirm",
      ]);
      assert.equal(accepted.status, 0, accepted.stderr);
      assert.match(accepted.stdout, /已接受/);
      assert.match(accepted.stdout, /接受前确认/);
      assert.match(accepted.stdout, /OPENCODE_PLAINTEXT_KEY/);
      assert.match(accepted.stdout, /作用域：当前项目/);
      assert.equal(existsSync(acceptancePath), true);
      assert.doesNotMatch(
        readFileSync(acceptancePath, "utf8"),
        /sk-CLI-ACCEPTANCE-SECRET/
      );
      const savedAcceptance = readFileSync(acceptancePath, "utf8");
      assert.match(savedAcceptance, /"schemaVersion": 2/);
      assert.equal(savedAcceptance.includes(cwd), false);

      const otherProject = join(dirname(cwd), "project-b");
      mkdirSync(otherProject);
      const otherScan = runAt(otherProject, ["scan"]);
      assert.equal(otherScan.status, 2, otherScan.stderr);
      assert.doesNotMatch(otherScan.stdout, /已隐藏 1 个已接受风险任务/);

      const scan = run(["scan"]);
      assert.equal(scan.status, 0, scan.stderr);
      assert.match(scan.stdout, /已隐藏 1 个已接受风险任务/);
      assert.doesNotMatch(scan.stdout, /明文存有/);

      const acceptedVerify = run(["risk", "verify", taskId]);
      assert.equal(acceptedVerify.status, 0, acceptedVerify.stderr);
      assert.match(acceptedVerify.stdout, /已接受/);
      assert.match(acceptedVerify.stdout, /作用域：当前项目/);

      const scanJson = run(["scan", "--json"]);
      assert.equal(scanJson.status, 0, scanJson.stderr);
      const parsedScan = JSON.parse(scanJson.stdout);
      assert.equal(parsedScan.acceptedTaskCount, 1);
      assert.equal(parsedScan.allFindings.length, 0);

      const afterPath = join(cwd, "after.html");
      const after = run(["report", "--format", "html", "--output", afterPath]);
      assert.equal(after.status, 0, after.stderr);
      const acceptedHtml = readFileSync(afterPath, "utf8");
      assert.match(acceptedHtml, /1 个已接受/);
      assert.match(acceptedHtml, /个人测试凭证，限时保留/);

      const listed = run(["risk", "list"]);
      assert.equal(listed.status, 0, listed.stderr);
      assert.match(listed.stdout, new RegExp(taskId));
      assert.match(listed.stdout, /作用域：当前项目/);

      const revoked = run(["risk", "revoke", taskId]);
      assert.equal(revoked.status, 0, revoked.stderr);
      const revokedVerify = run(["risk", "verify", taskId]);
      assert.equal(revokedVerify.status, 2, revokedVerify.stderr);
      assert.match(revokedVerify.stdout, /接受已撤销/);
      const rescanned = run(["scan"]);
      assert.equal(rescanned.status, 2, rescanned.stderr);
    }
  );
});

test("cli: risk verify 区分聚合任务的缓解与最终解决", () => {
  const relayUrl = "http://relay.example/v1";
  withCliProject(
    {
      provider: {
        relay: { options: { baseURL: relayUrl } },
      },
    },
    ({ cwd, configPath, run }) => {
      const noBaseline = run(["risk", "verify", "task-unknown1"]);
      assert.equal(noBaseline.status, 1);
      assert.match(noBaseline.stderr, /无法确认/);

      const reportPath = join(cwd, "aggregate.html");
      const report = run(["report", "--format", "html", "--output", reportPath]);
      assert.equal(report.status, 0, report.stderr);
      const html = readFileSync(reportPath, "utf8");
      const endpointCard = html.match(
        /<article class="action-card[^>]*" id="(task-[a-f0-9]{12})">[\s\S]*?2 项关联/
      );
      assert.ok(endpointCard, "应生成未知端点 + HTTP 的聚合任务");
      const taskId = endpointCard[1];

      writeFileSync(
        join(cwd, ".agentreveal.json"),
        JSON.stringify({ providers: { trusted: [relayUrl] } })
      );
      const mitigated = run(["risk", "verify", taskId]);
      assert.equal(mitigated.status, 2, mitigated.stderr);
      assert.match(mitigated.stdout, /已缓解但未解决/);
      assert.match(mitigated.stdout, /OPENCODE_CUSTOM_PROVIDER/);
      assert.match(mitigated.stdout, /OPENCODE_INSECURE_HTTP/);

      writeFileSync(
        configPath,
        JSON.stringify({
          provider: {
            official: { options: { baseURL: "https://api.openai.com/v1" } },
          },
        })
      );
      const resolved = run(["risk", "verify", taskId]);
      assert.equal(resolved.status, 0, resolved.stderr);
      assert.match(resolved.stdout, /已解决/);
    }
  );
});
