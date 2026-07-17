/**
 * CLI smoke tests：直接运行 bin/agentguard，验证端到端命令路径。
 * 从 dist/ 启动。运行前需 npm run build。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const binPath = join(repoRoot, "bin", "agentguard");
const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

function withCliProject(config, fn) {
  const root = mkdtempSync(join(tmpdir(), "agentguard-cli-"));
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
      AGENTGUARD_TEST_ROOT: root,
      AGENTGUARD_ACCEPTANCE_PATH: join(root, "acceptances.json"),
      AGENTGUARD_TASK_SNAPSHOT_PATH: join(root, "task-snapshots.json"),
    };

    return fn({
      cwd,
      configPath,
      acceptancePath: env.AGENTGUARD_ACCEPTANCE_PATH,
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

test("package: Release tarball 使用预编译 dist，不依赖安装期构建", () => {
  assert.equal(packageJson.scripts.prepare, undefined);
  assert.ok(packageJson.files.includes("dist"));
  assert.ok(readFileSync(join(repoRoot, "dist", "cli.js"), "utf8").length > 0);
});

test("cli: baseline 必须显式 --dry-run", () => {
  withCliProject({ permission: { bash: "allow" } }, ({ run }) => {
    const res = run(["baseline", "--profile", "balanced"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /--dry-run/);
  });
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
        join(cwd, ".agentguard.json"),
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
