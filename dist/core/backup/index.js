/**
 * 配置备份与恢复。
 *
 * 备份存放在当前项目 .agentguard/backups/<id>/ 下，manifest 记录原始路径。
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { atomicWriteFile } from "../fs-safety.js";
const BACKUP_MANIFEST_VERSION = 1;
function backupRoot(cwd) {
    return join(cwd, ".agentguard", "backups");
}
function hashFile(path) {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function assertSafeId(id) {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
        throw new Error("无效的备份 ID。");
    }
}
function isWithin(parent, child) {
    const rel = relative(resolve(parent), resolve(child));
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
function validateManifest(cwd, expectedId, raw) {
    assertSafeId(expectedId);
    const dir = join(backupRoot(cwd), expectedId);
    if (raw?.schemaVersion !== BACKUP_MANIFEST_VERSION ||
        raw.id !== expectedId ||
        !Array.isArray(raw.files)) {
        throw new Error(`备份 manifest 无效：${expectedId}`);
    }
    for (const file of raw.files) {
        if (!file ||
            !isAbsolute(file.originalPath) ||
            !isWithin(dir, file.backupPath) ||
            !existsSync(file.backupPath) ||
            !Number.isInteger(file.mode) ||
            file.mode < 0 ||
            file.mode > 0o777 ||
            !/^[a-f0-9]{64}$/.test(file.sha256) ||
            hashFile(file.backupPath) !== file.sha256) {
            throw new Error(`备份文件完整性校验失败：${expectedId}`);
        }
    }
    return raw;
}
function backupId() {
    return `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
}
function manifestPath(cwd, id) {
    return join(backupRoot(cwd), id, "manifest.json");
}
export function createBackup(cwd, targets, label = "manual") {
    const id = backupId();
    const dir = join(backupRoot(cwd), id);
    const filesDir = join(dir, "files");
    mkdirSync(filesDir, { recursive: true });
    chmodSync(backupRoot(cwd), 0o700);
    chmodSync(dir, 0o700);
    chmodSync(filesDir, 0o700);
    const files = targets.map((target, index) => {
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
    const manifest = {
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
export function latestBackup(cwd) {
    const root = backupRoot(cwd);
    if (!existsSync(root))
        return undefined;
    const manifests = readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => join(root, d.name, "manifest.json"))
        .filter((p) => existsSync(p))
        .map((p) => {
        const raw = JSON.parse(readFileSync(p, "utf8"));
        return validateManifest(cwd, basename(dirname(p)), raw);
    })
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return manifests.at(-1);
}
export function readBackup(cwd, id) {
    assertSafeId(id);
    const raw = JSON.parse(readFileSync(manifestPath(cwd, id), "utf8"));
    return validateManifest(cwd, id, raw);
}
export function restoreBackup(manifest) {
    for (const file of manifest.files) {
        if (hashFile(file.backupPath) !== file.sha256) {
            throw new Error(`备份文件完整性校验失败：${file.backupPath}`);
        }
        atomicWriteFile(file.originalPath, readFileSync(file.backupPath), file.mode);
    }
}
//# sourceMappingURL=index.js.map