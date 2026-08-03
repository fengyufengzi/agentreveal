import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWriteFile } from "../dist/core/fs-safety.js";
import {
  createClaudeCredentialBackup,
  deleteClaudeCredentialBackup,
} from "../dist/core/credential-backup/index.js";
import {
  applyClaudeCredentialMigration,
  claudePostMigrationVerification,
  previewClaudeCredentialMigration,
  verifyClaudeCredentialMigrationState,
} from "../dist/core/credential-migration/index.js";

const taskId = "task-credential-migration-example";

function claudeTask() {
  return {
    taskId,
    requirements: [{ ruleId: "CLAUDE_PLAINTEXT_TOKEN" }],
  };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "agentguard-migration-"));
  const cwd = join(root, "project");
  const configDir = join(root, ".claude");
  mkdirSync(cwd);
  mkdirSync(configDir);
  const settings = join(configDir, "settings.json");
  const local = join(configDir, "settings.local.json");
  writeFileSync(
    settings,
    JSON.stringify({
      env: {
        ANTHROPIC_AUTH_TOKEN: "synthetic-secret-value",
        SAFE_FLAG: "1",
      },
      theme: "dark",
    })
  );
  writeFileSync(
    local,
    JSON.stringify({
      env: {
        ANTHROPIC_API_KEY: "another-synthetic-secret",
        PROXY_TOKEN: "PROXY_MANAGED",
      },
      permissions: { defaultMode: "default" },
    })
  );
  chmodSync(settings, 0o644);
  chmodSync(local, 0o640);
  return { root, cwd, configDir, settings, local };
}

test("Claude 迁移事务要求备份与预览匹配，删除明文并设置固定 helper", () => {
  const paths = fixture();
  try {
    const task = claudeTask();
    const preview = previewClaudeCredentialMigration({
      task,
      taskId,
      configDir: paths.configDir,
    });
    const backup = createClaudeCredentialBackup({
      cwd: paths.cwd,
      task,
      taskId,
      configDir: paths.configDir,
    });
    const result = applyClaudeCredentialMigration({
      cwd: paths.cwd,
      task,
      taskId,
      configDir: paths.configDir,
      backupId: backup.backupId,
      expectedFingerprint: preview.fingerprint,
    });

    assert.equal(result.phase, "applied");
    assert.equal(result.files, 2);
    assert.equal(result.plaintextFieldsRemoved, 2);
    assert.equal(result.apiKeyHelperConfigured, true);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-secret/);

    const settings = JSON.parse(readFileSync(paths.settings, "utf8"));
    const local = JSON.parse(readFileSync(paths.local, "utf8"));
    assert.deepEqual(settings.env, { SAFE_FLAG: "1" });
    assert.deepEqual(local.env, { PROXY_TOKEN: "PROXY_MANAGED" });
    assert.match(settings.apiKeyHelper, /AgentGuard\/CLAUDE_PLAINTEXT_TOKEN/);
    assert.equal(settings.apiKeyHelper, local.apiKeyHelper);
    assert.equal(statSync(paths.settings).mode & 0o777, 0o600);
    assert.equal(statSync(paths.local).mode & 0o777, 0o600);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test("Claude 迁移在预览后并发修改时拒绝写入", () => {
  const paths = fixture();
  try {
    const task = claudeTask();
    const preview = previewClaudeCredentialMigration({
      task,
      taskId,
      configDir: paths.configDir,
    });
    const backup = createClaudeCredentialBackup({
      cwd: paths.cwd,
      task,
      taskId,
      configDir: paths.configDir,
    });
    const changed = JSON.parse(readFileSync(paths.settings, "utf8"));
    changed.theme = "light";
    writeFileSync(paths.settings, JSON.stringify(changed));

    assert.throws(
      () =>
        applyClaudeCredentialMigration({
          cwd: paths.cwd,
          task,
          taskId,
          configDir: paths.configDir,
          backupId: backup.backupId,
          expectedFingerprint: preview.fingerprint,
        }),
      /预览后发生变化/
    );
    assert.equal(
      JSON.parse(readFileSync(paths.settings, "utf8")).env.ANTHROPIC_AUTH_TOKEN,
      "synthetic-secret-value"
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test("Claude 多文件迁移部分写入失败时恢复内容和权限", () => {
  const paths = fixture();
  try {
    const task = claudeTask();
    const beforeSettings = readFileSync(paths.settings);
    const beforeLocal = readFileSync(paths.local);
    const preview = previewClaudeCredentialMigration({
      task,
      taskId,
      configDir: paths.configDir,
    });
    const backup = createClaudeCredentialBackup({
      cwd: paths.cwd,
      task,
      taskId,
      configDir: paths.configDir,
    });
    let writes = 0;
    assert.throws(
      () =>
        applyClaudeCredentialMigration(
          {
            cwd: paths.cwd,
            task,
            taskId,
            configDir: paths.configDir,
            backupId: backup.backupId,
            expectedFingerprint: preview.fingerprint,
          },
          {
            writeFile(path, content, mode) {
              writes += 1;
              if (writes === 2) throw new Error("synthetic partial failure");
              atomicWriteFile(path, content, mode);
            },
          }
        ),
      /已自动回滚/
    );
    assert.deepEqual(readFileSync(paths.settings), beforeSettings);
    assert.deepEqual(readFileSync(paths.local), beforeLocal);
    assert.equal(statSync(paths.settings).mode & 0o777, 0o644);
    assert.equal(statSync(paths.local).mode & 0o777, 0o640);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test("Claude 迁移拒绝被篡改的备份", () => {
  const paths = fixture();
  try {
    const task = claudeTask();
    const preview = previewClaudeCredentialMigration({
      task,
      taskId,
      configDir: paths.configDir,
    });
    const backup = createClaudeCredentialBackup({
      cwd: paths.cwd,
      task,
      taskId,
      configDir: paths.configDir,
    });
    writeFileSync(backup.backupId
      ? join(paths.cwd, ".agentguard", "backups", backup.backupId, "files", "0-settings.json")
      : "",
    "tampered");

    assert.throws(
      () =>
        applyClaudeCredentialMigration({
          cwd: paths.cwd,
          task,
          taskId,
          configDir: paths.configDir,
          backupId: backup.backupId,
          expectedFingerprint: preview.fingerprint,
        }),
      /完整性/
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test("H4 Claude 迁移后验证只返回固定指引，并只删除完整且精确的备份", () => {
  const paths = fixture();
  try {
    const task = claudeTask();
    const preview = previewClaudeCredentialMigration({
      task,
      taskId,
      configDir: paths.configDir,
    });
    const backup = createClaudeCredentialBackup({
      cwd: paths.cwd,
      task,
      taskId,
      configDir: paths.configDir,
    });
    applyClaudeCredentialMigration({
      cwd: paths.cwd,
      task,
      taskId,
      configDir: paths.configDir,
      backupId: backup.backupId,
      expectedFingerprint: preview.fingerprint,
    });
    assert.deepEqual(claudePostMigrationVerification(), {
      command: "claude auth status --text",
      label: "在新 Terminal 检查 Claude Code 当前认证状态",
      successEvidence: [
        "命令成功并显示预期认证状态；如果没有明确列出 helper 来源，仍以真实请求为准。",
        "完全退出并重新启动 Claude Code，完成一次最小请求。",
        "确认实际请求成功且 Provider / base URL 与 AgentGuard 当前有效状态一致。",
      ],
    });
    assert.deepEqual(
      verifyClaudeCredentialMigrationState({
        taskId,
        configPaths: [paths.settings, paths.local],
      }),
      { files: 2, apiKeyHelperConfigured: true }
    );
    const backupPath = join(
      paths.cwd,
      ".agentguard",
      "backups",
      backup.backupId
    );
    const removed = deleteClaudeCredentialBackup({
      cwd: paths.cwd,
      backupId: backup.backupId,
      configDir: paths.configDir,
    });
    assert.deepEqual(removed, {
      backupId: backup.backupId,
      taskId,
      files: 2,
    });
    assert.equal(existsSync(backupPath), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test("H4 Claude 备份完整性失败时拒绝清理并保留原目录", () => {
  const paths = fixture();
  try {
    const task = claudeTask();
    const backup = createClaudeCredentialBackup({
      cwd: paths.cwd,
      task,
      taskId,
      configDir: paths.configDir,
    });
    const backupPath = join(
      paths.cwd,
      ".agentguard",
      "backups",
      backup.backupId
    );
    writeFileSync(
      join(backupPath, "files", "0-settings.json"),
      "tampered"
    );
    assert.throws(
      () =>
        deleteClaudeCredentialBackup({
          cwd: paths.cwd,
          backupId: backup.backupId,
          configDir: paths.configDir,
        }),
      /完整性/
    );
    assert.equal(existsSync(backupPath), true);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});
