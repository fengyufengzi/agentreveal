/** Claude Code 明文凭证迁移前的窄范围备份与事务恢复。 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { claudePlaintextSettingsFiles } from "../../adapters/claude-code/parse.js";
import type { ActionTask } from "../action/index.js";
import {
  backupRestoreFileState,
  createBackup,
  deleteBackup,
  readBackup,
  restoreBackupTransaction,
  type BackupManifest,
  type BackupRestoreFileState,
} from "../backup/index.js";

const CLAUDE_CREDENTIAL_LABEL_PREFIX = "claude-credential-";
const CLAUDE_SETTINGS_NAMES = new Set([
  "settings.json",
  "settings.local.json",
]);

export interface ClaudeCredentialBackupResult {
  backupId: string;
  taskId: string;
  files: number;
  createdAt: string;
}

export interface ClaudeCredentialRestorePreview {
  backupId: string;
  taskId: string;
  files: number;
  changedFiles: number;
  fingerprint: string;
}

export interface ClaudeCredentialRestoreResult {
  backupId: string;
  taskId: string;
  files: number;
}

export interface ClaudeCredentialMigrationBackup {
  taskId: string;
  files: Array<{
    originalPath: string;
    sha256: string;
    mode: number;
  }>;
}

export interface ClaudeCredentialBackupCleanupResult {
  backupId: string;
  taskId: string;
  files: number;
}

function assertTaskId(taskId: string): void {
  if (!/^task-[A-Za-z0-9_-]{6,128}$/.test(taskId)) {
    throw new Error("无效的任务 ID。");
  }
}

export function assertClaudePlaintextTask(
  task: ActionTask | undefined,
  taskId: string
): asserts task is ActionTask {
  assertTaskId(taskId);
  if (
    !task ||
    task.taskId !== taskId ||
    !task.requirements.some(
      (requirement) => requirement.ruleId === "CLAUDE_PLAINTEXT_TOKEN"
    )
  ) {
    throw new Error(
      "当前扫描中已找不到可备份的 Claude 明文凭证任务，请先重新扫描。"
    );
  }
}

function credentialTaskId(manifest: BackupManifest): string {
  if (!manifest.label.startsWith(CLAUDE_CREDENTIAL_LABEL_PREFIX)) {
    throw new Error("该备份不是 Claude 凭证迁移备份。");
  }
  const taskId = manifest.label.slice(CLAUDE_CREDENTIAL_LABEL_PREFIX.length);
  assertTaskId(taskId);
  return taskId;
}

function validatedCredentialBackup(
  cwd: string,
  backupId: string,
  configDir: string
): { manifest: BackupManifest; taskId: string } {
  const manifest = readBackup(cwd, backupId);
  const taskId = credentialTaskId(manifest);
  const expectedPaths = new Set(
    [...CLAUDE_SETTINGS_NAMES].map((name) => resolve(configDir, name))
  );
  const actualPaths = manifest.files.map((file) => resolve(file.originalPath));
  if (
    manifest.files.length < 1 ||
    manifest.files.length > CLAUDE_SETTINGS_NAMES.size ||
    new Set(actualPaths).size !== actualPaths.length ||
    manifest.files.some(
      (file, index) =>
        file.agent !== "claude-code" ||
        !CLAUDE_SETTINGS_NAMES.has(basename(file.originalPath)) ||
        !expectedPaths.has(actualPaths[index])
    )
  ) {
    throw new Error("Claude 凭证备份的目标路径或 Agent 边界无效。");
  }
  return { manifest, taskId };
}

/** 仅供受控迁移事务核对备份目标与原始摘要，不返回备份内容。 */
export function readClaudeCredentialBackupForMigration(input: {
  cwd: string;
  backupId: string;
  configDir: string;
}): ClaudeCredentialMigrationBackup {
  const { manifest, taskId } = validatedCredentialBackup(
    input.cwd,
    input.backupId,
    input.configDir
  );
  return {
    taskId,
    files: manifest.files.map((file) => ({
      originalPath: file.originalPath,
      sha256: file.sha256,
      mode: file.mode,
    })),
  };
}

/** 删除已完成迁移的 Claude 备份；调用方负责先验证当前迁移状态和用户确认。 */
export function deleteClaudeCredentialBackup(input: {
  cwd: string;
  backupId: string;
  configDir: string;
}): ClaudeCredentialBackupCleanupResult {
  const { manifest, taskId } = validatedCredentialBackup(
    input.cwd,
    input.backupId,
    input.configDir
  );
  const removed = deleteBackup(input.cwd, manifest.id);
  return {
    backupId: removed.backupId,
    taskId,
    files: removed.files,
  };
}

function restoreFingerprint(
  backupId: string,
  taskId: string,
  state: BackupRestoreFileState[]
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        backupId,
        taskId,
        files: state.map((file) => file.sha256),
      })
    )
    .digest("hex");
}

export function createClaudeCredentialBackup(input: {
  cwd: string;
  task: ActionTask | undefined;
  taskId: string;
  configDir: string;
}): ClaudeCredentialBackupResult {
  assertClaudePlaintextTask(input.task, input.taskId);
  const configPaths = claudePlaintextSettingsFiles(input.configDir);
  if (configPaths.length === 0) {
    throw new Error(
      "Claude Code 配置已不再包含待迁移的明文字段，请重新扫描。"
    );
  }
  const backup = createBackup(
    input.cwd,
    configPaths.map((path) => ({ agent: "claude-code", path })),
    `${CLAUDE_CREDENTIAL_LABEL_PREFIX}${input.taskId}`
  );
  return {
    backupId: backup.id,
    taskId: input.taskId,
    files: backup.files.length,
    createdAt: backup.createdAt,
  };
}

export function previewClaudeCredentialRestore(input: {
  cwd: string;
  backupId: string;
  configDir: string;
}): ClaudeCredentialRestorePreview {
  const { manifest, taskId } = validatedCredentialBackup(
    input.cwd,
    input.backupId,
    input.configDir
  );
  const state = backupRestoreFileState(manifest);
  return {
    backupId: input.backupId,
    taskId,
    files: manifest.files.length,
    changedFiles: state.filter(
      (file, index) => file.sha256 !== manifest.files[index]?.sha256
    ).length,
    fingerprint: restoreFingerprint(input.backupId, taskId, state),
  };
}

export function restoreClaudeCredentialBackup(input: {
  cwd: string;
  backupId: string;
  configDir: string;
  expectedFingerprint: string;
}): ClaudeCredentialRestoreResult {
  if (!/^[a-f0-9]{64}$/.test(input.expectedFingerprint)) {
    throw new Error("Claude 配置恢复预览指纹无效，请重新预览。");
  }
  const { manifest, taskId } = validatedCredentialBackup(
    input.cwd,
    input.backupId,
    input.configDir
  );
  const state = backupRestoreFileState(manifest);
  if (
    restoreFingerprint(input.backupId, taskId, state) !==
    input.expectedFingerprint
  ) {
    throw new Error("Claude 配置在恢复确认后发生变化，已安全停止恢复。");
  }
  for (const file of manifest.files) {
    JSON.parse(readFileSync(file.backupPath, "utf8"));
  }
  restoreBackupTransaction(manifest, state);
  for (const file of manifest.files) {
    JSON.parse(readFileSync(file.originalPath, "utf8"));
  }
  return {
    backupId: input.backupId,
    taskId,
    files: manifest.files.length,
  };
}
