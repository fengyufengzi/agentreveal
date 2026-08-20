/** 按操作系统生成整改命令的安全性与能力边界测试。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enrichFinding } from "../dist/core/action/index.js";
import { buildRemediationGuide } from "../dist/core/remediation/index.js";

function finding(id, category = "permission", severity = "high", extra = {}) {
  return { id, category, severity, title: id, ...extra };
}

function commands(guide) {
  return guide.commands.map((item) => item.command).join("\n");
}

test("baseline finding 生成 dry-run、带备份 apply 和复扫命令", () => {
  const guide = buildRemediationGuide(
    finding("OPENCODE_BASH_UNRESTRICTED"),
    { platform: "darwin", profile: "safe" }
  );

  assert.equal(guide.mode, "baseline");
  assert.deepEqual(
    guide.commands.map((item) => item.id),
    ["baseline-preview", "baseline-apply", "verify-scan"]
  );
  assert.ok(commands(guide).includes("agentreveal baseline --profile safe --dry-run"));
  assert.ok(commands(guide).includes("agentreveal apply --profile safe --backup"));
  assert.equal(
    guide.commands.find((item) => item.id === "baseline-apply").completesRemediation,
    true
  );
  assert.equal(
    guide.commands.find((item) => item.id === "baseline-preview").completesRemediation,
    false
  );
});

test("无法安全自动化的普通 finding 标为 guided，不生成伪 apply", () => {
  const guide = buildRemediationGuide(
    finding("CODEX_INSECURE_HTTP", "provider", "medium"),
    { platform: "linux" }
  );

  assert.equal(guide.mode, "guided");
  assert.deepEqual(guide.commands.map((item) => item.id), ["verify-scan"]);
  assert.ok(guide.notes.some((note) => note.includes("不能单独证明")));
});

test("macOS Claude 明文凭证引导写入 Keychain、删除配置明文并设置 apiKeyHelper", () => {
  const secret = "sk-real-MUST-NOT-LEAK";
  const guide = buildRemediationGuide(
    finding("CLAUDE_PLAINTEXT_TOKEN", "secret", "high", {
      title: secret,
      description: secret,
      evidence: { token: secret },
    }),
    { platform: "darwin" }
  );
  const output = commands(guide);

  assert.equal(guide.platform, "darwin");
  assert.equal(guide.mode, "guided");
  assert.ok(output.includes("security add-generic-password"));
  assert.ok(output.includes("security find-generic-password"));
  assert.ok(output.includes("plutil -replace apiKeyHelper"));
  assert.ok(output.includes("plutil -remove env.ANTHROPIC_AUTH_TOKEN"));
  assert.ok(output.includes("plutil -remove env.ANTHROPIC_API_KEY"));
  assert.ok(output.includes("settings.local.json"));
  assert.ok(output.includes("chmod 600"));
  assert.ok(!output.includes("export ANTHROPIC_AUTH_TOKEN"));
  assert.deepEqual(guide.commands.map((item) => item.id), [
    "macos-keychain",
    "macos-claude-keychain-helper",
    "macos-keychain-check",
    "verify-scan",
  ]);
  assert.ok(guide.notes.some((note) => note.includes("Keychain")));
  assert.ok(!JSON.stringify(guide).includes(secret));
  assert.ok(guide.commands.every((item) => item.completesRemediation === false));
});

test(
  "macOS Claude 配置命令只删除两个明文字段，保留其它配置且不输出凭证",
  { skip: process.platform !== "darwin" },
  () => {
    const configDir = mkdtempSync(join(tmpdir(), "agentreveal-claude-remediation-"));
    const settings = join(configDir, "settings.json");
    const localSettings = join(configDir, "settings.local.json");
    const authToken = "sk-ant-example-plaintext-placeholder";
    const apiKey = "sk-ant-api-example-placeholder";
    try {
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        settings,
        JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: authToken, SAFE_FLAG: "1" }, theme: "dark" })
      );
      writeFileSync(
        localSettings,
        JSON.stringify({ env: { ANTHROPIC_API_KEY: apiKey }, permissions: { defaultMode: "default" } })
      );
      chmodSync(settings, 0o644);
      chmodSync(localSettings, 0o644);

      const guide = buildRemediationGuide(
        finding("CLAUDE_PLAINTEXT_TOKEN", "secret", "high"),
        { platform: "darwin" }
      );
      const configure = guide.commands.find(
        (item) => item.id === "macos-claude-keychain-helper"
      );
      assert.ok(configure);

      const result = spawnSync("/bin/sh", ["-c", configure.command], {
        encoding: "utf8",
        env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(`${authToken}|${apiKey}`));

      const updated = JSON.parse(readFileSync(settings, "utf8"));
      const updatedLocal = JSON.parse(readFileSync(localSettings, "utf8"));
      assert.deepEqual(updated.env, { SAFE_FLAG: "1" });
      assert.equal(updated.theme, "dark");
      assert.deepEqual(updatedLocal.env, {});
      assert.deepEqual(updatedLocal.permissions, { defaultMode: "default" });
      assert.match(updated.apiKeyHelper, /security find-generic-password/);
      assert.match(updatedLocal.apiKeyHelper, /AgentReveal\/CLAUDE_PLAINTEXT_TOKEN/);
      assert.equal(statSync(settings).mode & 0o777, 0o600);
      assert.equal(statSync(localSettings).mode & 0o777, 0o600);
      assert.doesNotMatch(readFileSync(settings, "utf8"), new RegExp(authToken));
      assert.doesNotMatch(readFileSync(localSettings, "utf8"), new RegExp(apiKey));
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  }
);

test("Linux 明文凭证引导使用 Secret Service 或进程级安全注入", () => {
  const guide = buildRemediationGuide(
    finding("GEMINI_PLAINTEXT_ENV_KEY", "secret"),
    { platform: "linux" }
  );
  const output = commands(guide);

  assert.equal(guide.platform, "linux");
  assert.equal(guide.mode, "guided");
  assert.ok(output.includes("secret-tool store"));
  assert.ok(output.includes("secret-tool lookup"));
  assert.ok(output.includes('printf \'%s\' "$AGENTREVEAL_INPUT"'));
  assert.ok(output.includes("unset AGENTREVEAL_INPUT"));
  assert.ok(output.includes("export GEMINI_API_KEY"));
  assert.ok(guide.notes.some((note) => note.includes("Secret Service")));
  assert.ok(!output.includes("echo sk-"));
});

test("未知规则 ID 即使含敏感片段也不会进入生成命令", () => {
  const secret = "sk-real-MUST-NOT-ENTER-COMMAND";
  const guide = buildRemediationGuide(
    finding(`FUTURE_${secret}`, "secret", "high"),
    { platform: "linux" }
  );
  assert.ok(!commands(guide).includes(secret));
  assert.ok(commands(guide).includes("AgentReveal FINDING"));
});

test("Windows 提供用户 DPAPI 凭证方案，不持久化用户环境变量", () => {
  const secret = "token-real-MUST-NOT-LEAK";
  const guide = buildRemediationGuide(
    finding("OPENCLAW_GATEWAY_PLAINTEXT_TOKEN", "secret", "high", {
      evidence: { value: secret },
    }),
    { platform: "win32" }
  );
  const output = commands(guide);

  assert.equal(guide.platform, "win32");
  assert.ok(output.includes("Get-Credential"));
  assert.ok(output.includes("Export-Clixml"));
  assert.ok(!output.includes("SetEnvironmentVariable"));
  assert.ok(!output.includes("[Environment]"));
  assert.ok(guide.commands.every((item) => item.shell === "powershell"));
  assert.ok(guide.notes.some((note) => note.includes("DPAPI")));
  assert.ok(!JSON.stringify(guide).includes(secret));
});

test("Windows 仅为已知真实变量生成当前 PowerShell 进程注入", () => {
  const guide = buildRemediationGuide(
    finding("CODEX_PLAINTEXT_API_KEY", "secret", "high"),
    { platform: "win32" }
  );
  const output = commands(guide);
  assert.ok(output.includes("$env:OPENAI_API_KEY"));
  assert.ok(output.includes("Import-Clixml"));
  assert.ok(output.includes("GetNetworkCredential().Password"));
  assert.ok(!output.includes("SetEnvironmentVariable"));
  assert.ok(!output.includes("'User'"));
});

test("CC Switch 凭证提供权限加固命令，并明确不支持环境变量名替代 Token", () => {
  const guide = buildRemediationGuide(
    finding("CCSWITCH_PLAINTEXT_KEY", "secret", "high"),
    { platform: "darwin" }
  );
  assert.equal(guide.mode, "guided");
  assert.deepEqual(guide.commands.map((item) => item.id), [
    "cc-switch-protect-storage",
    "verify-scan",
  ]);
  assert.ok(commands(guide).includes('chmod 700 "$HOME/.cc-switch"'));
  assert.ok(commands(guide).includes('chmod 600 "$HOME/.cc-switch/cc-switch.db"'));
  assert.ok(commands(guide).includes("db_backup_*.db"));
  assert.ok(!commands(guide).includes("security add-generic-password"));
  assert.ok(guide.notes.some((note) => note.includes("CC Switch 原应用")));
  assert.ok(guide.notes.some((note) => note.includes("不解析环境变量名")));
  assert.ok(guide.notes.some((note) => note.includes("不要把变量名当作 Token")));
});

test(
  "CC Switch 权限命令只收紧目标目录、数据库和备份，不改文件内容",
  { skip: process.platform === "win32" },
  () => {
    const home = mkdtempSync(join(tmpdir(), "agentreveal-cc-switch-remediation-"));
    const configDir = join(home, ".cc-switch");
    const backupDir = join(configDir, "backups");
    const database = join(configDir, "cc-switch.db");
    const backup = join(backupDir, "db_backup_example.db");
    try {
      mkdirSync(backupDir, { recursive: true });
      writeFileSync(database, "database-placeholder");
      writeFileSync(backup, "backup-placeholder");
      chmodSync(configDir, 0o755);
      chmodSync(backupDir, 0o755);
      chmodSync(database, 0o644);
      chmodSync(backup, 0o644);

      const guide = buildRemediationGuide(
        finding("CCSWITCH_PLAINTEXT_KEY", "secret", "high"),
        { platform: process.platform }
      );
      const protect = guide.commands.find(
        (item) => item.id === "cc-switch-protect-storage"
      );
      const result = spawnSync("sh", ["-c", protect.command], {
        encoding: "utf8",
        env: { ...process.env, HOME: home },
      });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(statSync(configDir).mode & 0o777, 0o700);
      assert.equal(statSync(backupDir).mode & 0o777, 0o700);
      assert.equal(statSync(database).mode & 0o777, 0o600);
      assert.equal(statSync(backup).mode & 0o777, 0o600);
      assert.equal(readFileSync(database, "utf8"), "database-placeholder");
      assert.equal(readFileSync(backup, "utf8"), "backup-placeholder");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }
);

test("observe finding 不生成修复命令", () => {
  const guide = buildRemediationGuide(
    finding("GEMINI_AUTH_MODE", "provider", "info"),
    { platform: "linux" }
  );
  assert.equal(guide.mode, "none");
  assert.deepEqual(guide.commands, []);
  assert.ok(guide.notes[0].includes("配置观察项"));
});

test("混合 baseline/manual 的 ActionTask 降级为 guided", () => {
  const baselineFinding = enrichFinding(
    finding("OPENCODE_BASH_UNRESTRICTED", "permission", "high")
  );
  const manualFinding = enrichFinding(
    finding("CODEX_INSECURE_HTTP", "provider", "medium")
  );
  const makeItem = (enriched, agent, displayName) => ({
    source: "agent",
    agent,
    displayName,
    finding: enriched,
    action: enriched.action,
  });
  const baselineItem = makeItem(baselineFinding, "opencode", "OpenCode");
  const manualItem = makeItem(manualFinding, "codex", "Codex");
  const task = {
    taskId: "task-mixed",
    source: "agent",
    agent: "opencode",
    displayName: "OpenCode",
    family: "test.mixed",
    priority: "P1",
    severity: "high",
    disposition: "fix",
    primary: baselineItem,
    items: [baselineItem, manualItem],
  };

  const guide = buildRemediationGuide(task, { platform: "darwin" });
  assert.equal(guide.mode, "guided");
  assert.ok(!commands(guide).includes("agentreveal apply"));
  assert.deepEqual(guide.ruleIds.sort(), [
    "CODEX_INSECURE_HTTP",
    "OPENCODE_BASH_UNRESTRICTED",
  ]);
});

test("ActionTask 的安全存储名称包含稳定 taskId，避免同规则多实例互相覆盖", () => {
  const enriched = enrichFinding(
    finding("CLAUDE_PLAINTEXT_TOKEN", "secret", "high")
  );
  const item = {
    source: "agent",
    agent: "claude-code",
    displayName: "Claude Code",
    finding: enriched,
    action: enriched.action,
  };
  const task = {
    taskId: "task-123456789abc",
    source: "agent",
    agent: "claude-code",
    displayName: "Claude Code",
    family: "secret.plaintext",
    priority: "P0",
    severity: "high",
    disposition: "fix",
    primary: item,
    items: [item],
  };
  const guide = buildRemediationGuide(task, { platform: "darwin" });
  assert.ok(
    commands(guide).includes(
      "agentreveal credential backup task-123456789abc"
    )
  );
  assert.ok(commands(guide).includes("CLAUDE_PLAINTEXT_TOKEN_task-123456789abc"));
});

test("OpenClaw service-env 是观察项，不生成跨平台权限修改命令", () => {
  const findingInput = finding(
    "OPENCLAW_SERVICE_ENV_PRESENT",
    "secret",
    "info"
  );
  const mac = buildRemediationGuide(findingInput, { platform: "darwin" });
  const windows = buildRemediationGuide(findingInput, { platform: "win32" });

  assert.equal(mac.mode, "none");
  assert.equal(windows.mode, "none");
  assert.deepEqual(mac.commands, []);
  assert.deepEqual(windows.commands, []);
});

test("不支持的平台不猜测命令模板，只返回 guided 验证和说明", () => {
  const guide = buildRemediationGuide(
    finding("CLAUDE_PLAINTEXT_TOKEN", "secret"),
    { platform: "aix" }
  );
  assert.equal(guide.platform, "unsupported");
  assert.equal(guide.mode, "guided");
  assert.deepEqual(guide.commands.map((item) => item.id), ["verify-scan"]);
  assert.ok(guide.notes.some((note) => note.includes("没有受支持")));
});

test("缺省平台使用 process.platform", () => {
  const guide = buildRemediationGuide(
    finding("CODEX_INSECURE_HTTP", "provider", "medium")
  );
  const expected = ["darwin", "linux", "win32"].includes(process.platform)
    ? process.platform
    : "unsupported";
  assert.equal(guide.platform, expected);
});
