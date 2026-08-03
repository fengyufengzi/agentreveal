import assert from "node:assert/strict";
import test from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";

import {
  childFrameEvent,
  loadDesktopMainHarness,
  mainFrameEvent,
} from "./helpers/desktop-main-harness.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("desktop main: 开发入口与打包入口都从 main 所在根目录解析 typed service", () => {
  const { mainExports } = loadDesktopMainHarness();
  assert.equal(
    mainExports.desktopServicePath(),
    join(repoRoot, "dist", "desktop", "service.js")
  );
});

test("desktop IPC: handlers reject child frames and unapproved project paths", async () => {
  const { handlers, eventHandlers } = loadDesktopMainHarness();
  assert.equal(handlers.size, 24);
  assert.equal(eventHandlers.size, 1);
  assert.doesNotThrow(() => eventHandlers.get("agentguard:menuState")(
    childFrameEvent(),
    { hasOverview: true, hasReport: true, working: false }
  ));
  await assert.rejects(
    handlers.get("agentguard:scanMachine")(childFrameEvent()),
    /非主页面/
  );
  await assert.rejects(
    handlers.get("agentguard:selectProject")(childFrameEvent()),
    /非主页面/
  );
  await assert.rejects(
    handlers.get("agentguard:scanProject")(
      mainFrameEvent(),
      "/tmp/renderer-supplied-project"
    ),
    /目录选择器确认/
  );
  await assert.rejects(
    handlers.get("agentguard:backupClaudeRemediation")(
      childFrameEvent(),
      "/tmp/renderer-supplied-project",
      "task-abcdef123456"
    ),
    /非主页面/
  );
});

test("desktop IPC: native selection authorizes only the selected project", async () => {
  const approved = "/tmp/agentguard-approved-project";
  const { handlers } = loadDesktopMainHarness({
    openDialogResult: { canceled: false, filePaths: [approved] },
  });
  const selected = await handlers.get("agentguard:selectProject")(mainFrameEvent());
  assert.equal(selected.canceled, false);
  assert.equal(selected.projectPath, approved);
  await assert.rejects(
    handlers.get("agentguard:previewBaseline")(
      mainFrameEvent(),
      approved,
      "aggressive"
    ),
    /未知 baseline profile/
  );
  await assert.rejects(
    handlers.get("agentguard:previewBaseline")(
      mainFrameEvent(),
      "/tmp/not-approved",
      "safe"
    ),
    /目录选择器确认/
  );
});

test("desktop IPC: privileged inputs fail before service or shell access", async () => {
  const approved = "/tmp/agentguard-approved-project";
  const { handlers, shellCalls } = loadDesktopMainHarness({
    openDialogResult: { canceled: false, filePaths: [approved] },
  });
  await handlers.get("agentguard:selectProject")(mainFrameEvent());

  await assert.rejects(
    handlers.get("agentguard:applyBaseline")(
      mainFrameEvent(),
      approved,
      "safe",
      "renderer-controlled-fingerprint"
    ),
    /预览指纹无效/
  );
  await assert.rejects(
    handlers.get("agentguard:savePostureBaseline")(
      mainFrameEvent(),
      approved,
      "renderer-controlled-fingerprint",
      "missing",
      false
    ),
    /可信状态预览指纹无效/
  );
  await assert.rejects(
    handlers.get("agentguard:removePostureBaseline")(
      mainFrameEvent(),
      approved,
      "renderer-controlled-revision"
    ),
    /可信状态存储版本无效/
  );
  await assert.rejects(
    handlers.get("agentguard:verifyPosture")(
      mainFrameEvent(),
      "/tmp/not-approved"
    ),
    /目录选择器确认/
  );
  await assert.rejects(
    handlers.get("agentguard:exportReport")(
      mainFrameEvent(),
      approved,
      "pdf"
    ),
    /仅支持导出 HTML 或 JSON/
  );
  await assert.rejects(
    handlers.get("agentguard:removeProviderTrust")(
      mainFrameEvent(),
      approved,
      "a".repeat(254),
      "trusted",
      "合成测试原因"
    ),
    /可信端点格式无效/
  );
  await assert.rejects(
    handlers.get("agentguard:ignoreRule")(
      mainFrameEvent(),
      approved,
      "task-abcdef123456",
      "renderer-controlled-rule",
      "合成测试原因"
    ),
    /无效的规则 ID/
  );
  await assert.rejects(
    handlers.get("agentguard:removeRuleIgnore")(
      mainFrameEvent(),
      approved,
      "OPENCODE_MCP_LOCAL",
      "renderer-agent",
      "合成测试原因"
    ),
    /无效的 Agent ID/
  );
  await assert.rejects(
    handlers.get("agentguard:openReport")(
      mainFrameEvent(),
      "/tmp/renderer-controlled-report.html"
    ),
    /本次会话中由 AgentGuard 导出的报告/
  );
  await assert.rejects(
    handlers.get("agentguard:restoreClaudeRemediation")(
      mainFrameEvent(),
      approved,
      "renderer/controlled"
    ),
    /无效的备份 ID/
  );
  await assert.rejects(
    handlers.get("agentguard:applyClaudeMigration")(
      mainFrameEvent(),
      approved,
      "task-abcdef123456",
      "backup-example",
      "renderer-controlled-fingerprint"
    ),
    /迁移预览指纹无效/
  );
  await assert.rejects(
    handlers.get("agentguard:cleanupClaudeCredentialBackup")(
      mainFrameEvent(),
      approved,
      "task-abcdef123456",
      "renderer/controlled"
    ),
    /无效的备份 ID/
  );
  assert.deepEqual(shellCalls, []);
});

test("desktop IPC: Claude 备份必须原生确认，取消时不进入 service", async () => {
  const approved = "/tmp/agentguard-approved-project";
  const { handlers, diagnosticsEvents } = loadDesktopMainHarness({
    openDialogResult: { canceled: false, filePaths: [approved] },
    messageBoxResult: { response: 0 },
  });
  await handlers.get("agentguard:selectProject")(mainFrameEvent());
  const result = await handlers.get("agentguard:backupClaudeRemediation")(
    mainFrameEvent(),
    approved,
    "task-abcdef123456"
  );
  assert.equal(result.canceled, true);
  assert.deepEqual(diagnosticsEvents.slice(-2), [
    { operation: "credential.backup", outcome: "started" },
    { operation: "credential.backup", outcome: "canceled" },
  ]);
  await assert.rejects(
    handlers.get("agentguard:restoreClaudeRemediation")(
      mainFrameEvent(),
      approved,
      "backup-not-issued"
    ),
    /本次桌面会话/
  );
});

test("desktop IPC: Claude 迁移只接受本会话签发的任务、备份和指纹，并完成复扫", async () => {
  const home = mkdtempSync(join(tmpdir(), "agentguard-ipc-migration-"));
  try {
    const configDir = join(home, ".claude");
    const settingsPath = join(configDir, "settings.json");
    mkdirSync(configDir);
    writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_AUTH_TOKEN: "example-credential-placeholder",
          SAFE_FLAG: "1",
        },
      })
    );
    const { handlers, shellCalls, diagnosticsEvents } = loadDesktopMainHarness({
      appPaths: { home },
      messageBoxResult: { response: 1 },
    });
    const overview = await handlers.get("agentguard:scanMachine")(
      mainFrameEvent()
    );
    const task = overview.tasks.find((candidate) =>
      candidate.requirements.some(
        (requirement) => requirement.ruleId === "CLAUDE_PLAINTEXT_TOKEN"
      )
    );
    assert.ok(task);
    const backup = await handlers.get("agentguard:backupClaudeRemediation")(
      mainFrameEvent(),
      overview.scope.path,
      task.taskId
    );
    const migrated = await handlers.get("agentguard:applyClaudeMigration")(
      mainFrameEvent(),
      overview.scope.path,
      task.taskId,
      backup.backup.backupId,
      backup.migration.fingerprint
    );
    assert.equal(migrated.transaction.phase, "verified");
    assert.deepEqual(
      JSON.parse(readFileSync(settingsPath, "utf8")).env,
      { SAFE_FLAG: "1" }
    );
    assert.deepEqual(shellCalls, []);
    assert.deepEqual(diagnosticsEvents.slice(-2), [
      { operation: "credential.migration", outcome: "started" },
      { operation: "credential.migration", outcome: "success" },
    ]);
    const backupPath = join(
      home,
      ".agentguard",
      "backups",
      backup.backup.backupId
    );
    assert.equal(existsSync(backupPath), true);
    const cleaned = await handlers.get(
      "agentguard:cleanupClaudeCredentialBackup"
    )(
      mainFrameEvent(),
      overview.scope.path,
      task.taskId,
      backup.backup.backupId
    );
    assert.equal(cleaned.transaction.phase, "backup-cleaned");
    assert.equal(cleaned.transaction.restoreAvailable, false);
    assert.equal(existsSync(backupPath), false);
    assert.deepEqual(shellCalls, []);
    assert.deepEqual(diagnosticsEvents.slice(-2), [
      { operation: "credential.backup-cleanup", outcome: "started" },
      { operation: "credential.backup-cleanup", outcome: "success" },
    ]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("desktop IPC: canceled selection does not authorize a renderer path", async () => {
  const { handlers } = loadDesktopMainHarness({
    openDialogResult: { canceled: true, filePaths: [] },
  });
  const selected = await handlers.get("agentguard:selectProject")(mainFrameEvent());
  assert.equal(selected.canceled, true);
  await assert.rejects(
    handlers.get("agentguard:scanProject")(
      mainFrameEvent(),
      "/tmp/agentguard-approved-project"
    ),
    /目录选择器确认/
  );
});
