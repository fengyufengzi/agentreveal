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
const BACKUP_IGNORE_MARKER = "# AgentGuard backup safety";
const BACKUP_IGNORE_RULES = `${BACKUP_IGNORE_MARKER}\n*\n!.gitignore\n`;
/** 防止包含原始配置的备份被普通 `git add .` 意外纳入版本控制。 */
function protectBackupRoot(cwd) {
    const root = backupRoot(cwd);
    mkdirSync(root, { recursive: true });
    chmodSync(root, 0o700);
    const ignorePath = join(root, ".gitignore");
    const existing = existsSync(ignorePath) ? readFileSync(ignorePath, "utf8") : "";
    if (!existing.endsWith(BACKUP_IGNORE_RULES)) {
        const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
        atomicWriteFile(ignorePath, `${existing}${separator}${BACKUP_IGNORE_RULES}`, 0o600);
    }
    else {
        chmodSync(ignorePath, 0o600);
    }
    return root;
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
    const root = protectBackupRoot(cwd);
    const dir = join(root, id);
    const filesDir = join(dir, "files");
    mkdirSync(filesDir, { recursive: true });
    chmodSync(root, 0o700);
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
/** 读取恢复目标的当前摘要；只返回路径与不可逆哈希，不返回配置内容。 */
export function backupRestoreFileState(manifest) {
    return manifest.files.map((file) => {
        if (!existsSync(file.originalPath)) {
            throw new Error(`待恢复配置已不存在：${file.originalPath}`);
        }
        if (hashFile(file.backupPath) !== file.sha256) {
            throw new Error(`备份文件完整性校验失败：${manifest.id}`);
        }
        return {
            originalPath: file.originalPath,
            sha256: hashFile(file.originalPath),
        };
    });
}
/**
 * 按用户确认时的文件摘要事务恢复：恢复前拒绝并发修改，多文件失败时回滚已恢复文件。
 */
export function restoreBackupTransaction(manifest, expectedCurrentState, options = {}) {
    const currentState = backupRestoreFileState(manifest);
    if (currentState.length !== expectedCurrentState.length ||
        currentState.some((file, index) => file.originalPath !== expectedCurrentState[index]?.originalPath ||
            file.sha256 !== expectedCurrentState[index]?.sha256)) {
        throw new Error("配置在恢复确认后又发生变化，已安全停止恢复。");
    }
    const before = manifest.files.map((file) => ({
        path: file.originalPath,
        content: readFileSync(file.originalPath),
        mode: statSync(file.originalPath).mode & 0o777,
    }));
    const write = options.writeFile ?? atomicWriteFile;
    const written = [];
    try {
        for (let index = 0; index < manifest.files.length; index += 1) {
            const file = manifest.files[index];
            write(file.originalPath, readFileSync(file.backupPath), file.mode);
            written.push(before[index]);
            if (hashFile(file.originalPath) !== file.sha256) {
                throw new Error(`恢复后内容校验失败：${file.originalPath}`);
            }
        }
    }
    catch (error) {
        let rollbackError;
        for (const snapshot of [...written].reverse()) {
            try {
                atomicWriteFile(snapshot.path, snapshot.content, snapshot.mode);
            }
            catch (candidate) {
                rollbackError ??= candidate;
            }
        }
        const reason = error instanceof Error ? error.message : String(error);
        if (rollbackError) {
            const rollbackReason = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
            throw new Error(`恢复失败，自动回滚也失败；请保留备份并人工处理。恢复错误：${reason}；回滚错误：${rollbackReason}`);
        }
        throw new Error(`恢复失败，已自动回滚当前配置：${reason}`);
    }
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