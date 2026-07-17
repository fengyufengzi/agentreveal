/**
 * 配置备份与恢复。
 *
 * 备份存放在当前项目 .agentguard/backups/<id>/ 下，manifest 记录原始路径。
 */
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { atomicWriteFile } from "../fs-safety.js";

const BACKUP_MANIFEST_VERSION = 1 as const;

export interface BackupFileEntry {
  agent: string;
  originalPath: string;
  backupPath: string;
  mode: number;
  sha256: string;
}

export interface BackupManifest {
  schemaVersion: typeof BACKUP_MANIFEST_VERSION;
  id: string;
  createdAt: string;
  label: string;
  files: BackupFileEntry[];
}

export interface BackupTarget {
  agent: string;
  path: string;
}

function backupRoot(cwd: string): string {
  return join(cwd, ".agentguard", "backups");
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertSafeId(id: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error("无效的备份 ID。");
  }
}

function isWithin(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function validateManifest(
  cwd: string,
  expectedId: string,
  raw: BackupManifest
): BackupManifest {
  assertSafeId(expectedId);
  const dir = join(backupRoot(cwd), expectedId);
  if (
    raw?.schemaVersion !== BACKUP_MANIFEST_VERSION ||
    raw.id !== expectedId ||
    !Array.isArray(raw.files)
  ) {
    throw new Error(`备份 manifest 无效：${expectedId}`);
  }
  for (const file of raw.files) {
    if (
      !file ||
      !isAbsolute(file.originalPath) ||
      !isWithin(dir, file.backupPath) ||
      !existsSync(file.backupPath) ||
      !Number.isInteger(file.mode) ||
      file.mode < 0 ||
      file.mode > 0o777 ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      hashFile(file.backupPath) !== file.sha256
    ) {
      throw new Error(`备份文件完整性校验失败：${expectedId}`);
    }
  }
  return raw;
}

function backupId(): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
}

function manifestPath(cwd: string, id: string): string {
  return join(backupRoot(cwd), id, "manifest.json");
}

export function createBackup(
  cwd: string,
  targets: BackupTarget[],
  label = "manual"
): BackupManifest {
  const id = backupId();
  const dir = join(backupRoot(cwd), id);
  const filesDir = join(dir, "files");
  mkdirSync(filesDir, { recursive: true });
  chmodSync(backupRoot(cwd), 0o700);
  chmodSync(dir, 0o700);
  chmodSync(filesDir, 0o700);

  const files: BackupFileEntry[] = targets.map((target, index) => {
    if (!isAbsolute(target.path) || !existsSync(target.path)) {
      throw new Error(`待备份文件不存在：${target.path}`);
    }
    const backupPath = join(filesDir, `${index}-${basename(target.path)}`);
    copyFileSync(target.path, backupPath);
    chmodSync(backupPath, 0o600);
    return {
      agent: target.agent,
      originalPath: target.path,
      backupPath,
      mode: statSync(target.path).mode & 0o777,
      sha256: hashFile(backupPath),
    };
  });

  const manifest: BackupManifest = {
    schemaVersion: BACKUP_MANIFEST_VERSION,
    id,
    createdAt: new Date().toISOString(),
    label,
    files,
  };
  writeFileSync(manifestPath(cwd, id), JSON.stringify(manifest, null, 2) + "\n");
  chmodSync(manifestPath(cwd, id), 0o600);
  return manifest;
}

export function latestBackup(cwd: string): BackupManifest | undefined {
  const root = backupRoot(cwd);
  if (!existsSync(root)) return undefined;
  const manifests = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(root, d.name, "manifest.json"))
    .filter((p) => existsSync(p))
    .map((p) => {
      const raw = JSON.parse(readFileSync(p, "utf8")) as BackupManifest;
      return validateManifest(cwd, basename(dirname(p)), raw);
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return manifests.at(-1);
}

export function readBackup(cwd: string, id: string): BackupManifest {
  assertSafeId(id);
  const raw = JSON.parse(readFileSync(manifestPath(cwd, id), "utf8")) as BackupManifest;
  return validateManifest(cwd, id, raw);
}

export function restoreBackup(manifest: BackupManifest): void {
  for (const file of manifest.files) {
    if (hashFile(file.backupPath) !== file.sha256) {
      throw new Error(`备份文件完整性校验失败：${file.backupPath}`);
    }
    atomicWriteFile(file.originalPath, readFileSync(file.backupPath), file.mode);
  }
}
