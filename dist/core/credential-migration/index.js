/**
 * Claude Code 明文凭证迁移事务。
 *
 * Keychain 的凭证输入与可读性检查由用户在 Terminal 中完成；本模块永远不读取凭证，
 * 只在已备份、指纹仍匹配时删除两个已知明文字段并写入固定 apiKeyHelper。
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { assertClaudePlaintextTask, readClaudeCredentialBackupForMigration, } from "../credential-backup/index.js";
import { atomicWriteFile } from "../fs-safety.js";
import { claudeCredentialApiKeyHelper, claudeCredentialKeychainService, } from "../remediation/index.js";
import { isProxyManagedPlaceholder } from "../proxy-managed.js";
const TOKEN_KEYS = new Set([
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_API_KEY",
]);
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
function hash(content) {
    return createHash("sha256").update(content).digest("hex");
}
function readMigrationFiles(configDir) {
    const allowed = new Set(["settings.json", "settings.local.json"]);
    return [...allowed]
        .map((name) => resolve(configDir, name))
        .flatMap((path) => {
        let content;
        try {
            content = readFileSync(path);
        }
        catch (error) {
            const candidate = error;
            if (candidate.code === "ENOENT")
                return [];
            throw error;
        }
        const parsed = asRecord(JSON.parse(content.toString("utf8")));
        const env = asRecord(parsed.env);
        const plaintextFields = Object.entries(env).filter(([key, value]) => TOKEN_KEYS.has(key.toUpperCase()) &&
            typeof value === "string" &&
            value.trim().length > 0 &&
            !isProxyManagedPlaceholder(value)).length;
        if (plaintextFields === 0)
            return [];
        if (!allowed.has(basename(path))) {
            throw new Error("Claude 凭证迁移目标超出允许的设置文件。");
        }
        return [{
                path,
                name: basename(path),
                hash: hash(content),
                mode: statSync(path).mode & 0o777,
                content,
                parsed,
                plaintextFields,
            }];
    });
}
function migrationFingerprint(taskId, files) {
    return createHash("sha256")
        .update(JSON.stringify({
        taskId,
        files: files.map((file) => ({
            path: file.path,
            sha256: file.hash,
        })),
    }))
        .digest("hex");
}
function assertFingerprint(value) {
    if (!/^[a-f0-9]{64}$/.test(value)) {
        throw new Error("Claude 凭证迁移预览指纹无效，请重新预览。");
    }
}
export function previewClaudeCredentialMigration(input) {
    assertClaudePlaintextTask(input.task, input.taskId);
    const files = readMigrationFiles(input.configDir);
    if (files.length === 0) {
        throw new Error("Claude Code 配置已不再包含待迁移的明文字段，请重新扫描。");
    }
    return {
        taskId: input.taskId,
        phase: "previewed",
        keychainService: claudeCredentialKeychainService(input.taskId),
        files: files.length,
        plaintextFields: files.reduce((total, file) => total + file.plaintextFields, 0),
        fingerprint: migrationFingerprint(input.taskId, files),
    };
}
/** 上游 Claude Code 提供的只读认证状态检查；不代替一次真实最小请求。 */
export function claudePostMigrationVerification() {
    return {
        command: "claude auth status --text",
        label: "在新 Terminal 检查 Claude Code 当前认证状态",
        successEvidence: [
            "命令成功并显示预期认证状态；如果没有明确列出 helper 来源，仍以真实请求为准。",
            "完全退出并重新启动 Claude Code，完成一次最小请求。",
            "确认实际请求成功且 Provider / base URL 与 AgentReveal 当前有效状态一致。",
        ],
    };
}
/** 删除迁移备份前重新确认设置仍保持固定 helper 且没有真实明文凭证。 */
export function verifyClaudeCredentialMigrationState(input) {
    const expectedHelper = claudeCredentialApiKeyHelper(input.taskId);
    if (input.configPaths.length < 1 ||
        input.configPaths.length > 2 ||
        new Set(input.configPaths.map((path) => resolve(path))).size !==
            input.configPaths.length) {
        throw new Error("Claude 凭证迁移验证目标无效。");
    }
    for (const path of input.configPaths) {
        if (!["settings.json", "settings.local.json"].includes(basename(path))) {
            throw new Error("Claude 凭证迁移验证目标超出允许的设置文件。");
        }
        const parsed = asRecord(JSON.parse(readFileSync(path, "utf8")));
        const env = asRecord(parsed.env);
        if (Object.entries(env).some(([key, value]) => TOKEN_KEYS.has(key.toUpperCase()) &&
            typeof value === "string" &&
            value.trim().length > 0 &&
            !isProxyManagedPlaceholder(value)) ||
            parsed.apiKeyHelper !== expectedHelper) {
            throw new Error("Claude 配置已不再符合迁移完成状态，请先复扫或恢复，暂不删除备份。");
        }
    }
    return {
        files: input.configPaths.length,
        apiKeyHelperConfigured: true,
    };
}
function transformedContent(file, taskId) {
    const parsed = structuredClone(file.parsed);
    const env = asRecord(parsed.env);
    let removed = 0;
    for (const key of Object.keys(env)) {
        const value = env[key];
        if (!TOKEN_KEYS.has(key.toUpperCase()) ||
            typeof value !== "string" ||
            value.trim().length === 0 ||
            isProxyManagedPlaceholder(value)) {
            continue;
        }
        delete env[key];
        removed += 1;
    }
    if ("env" in parsed)
        parsed.env = env;
    parsed.apiKeyHelper = claudeCredentialApiKeyHelper(taskId);
    return {
        content: `${JSON.stringify(parsed, null, 2)}\n`,
        removed,
    };
}
/**
 * 重新校验 task、计划指纹和备份原始摘要后执行原子多文件修改。
 * 任一写入或校验失败都会恢复事务开始前的内容与权限。
 */
export function applyClaudeCredentialMigration(input, options = {}) {
    assertFingerprint(input.expectedFingerprint);
    assertClaudePlaintextTask(input.task, input.taskId);
    const files = readMigrationFiles(input.configDir);
    if (migrationFingerprint(input.taskId, files) !== input.expectedFingerprint) {
        throw new Error("Claude 配置在迁移预览后发生变化，已安全停止应用。");
    }
    const backup = readClaudeCredentialBackupForMigration({
        cwd: input.cwd,
        backupId: input.backupId,
        configDir: input.configDir,
    });
    if (backup.taskId !== input.taskId) {
        throw new Error("Claude 配置备份与当前迁移任务不匹配。");
    }
    const currentByPath = new Map(files.map((file) => [file.path, file]));
    if (backup.files.length !== files.length ||
        backup.files.some((file) => currentByPath.get(file.originalPath)?.hash !== file.sha256)) {
        throw new Error("Claude 配置与迁移前备份不匹配，已安全停止应用。");
    }
    const write = options.writeFile ?? atomicWriteFile;
    const written = [];
    let removed = 0;
    try {
        for (const file of files) {
            const transformed = transformedContent(file, input.taskId);
            write(file.path, transformed.content, 0o600);
            written.push(file);
            removed += transformed.removed;
            const verified = JSON.parse(readFileSync(file.path, "utf8"));
            const verifiedEnv = asRecord(verified.env);
            if (Object.keys(verifiedEnv).some((key) => TOKEN_KEYS.has(key.toUpperCase())) ||
                verified.apiKeyHelper !== claudeCredentialApiKeyHelper(input.taskId)) {
                throw new Error("Claude 配置写入后校验失败。");
            }
        }
    }
    catch (error) {
        let rollbackError;
        for (const file of [...written].reverse()) {
            try {
                atomicWriteFile(file.path, file.content, file.mode);
            }
            catch (candidate) {
                rollbackError ??= candidate;
            }
        }
        const reason = error instanceof Error ? error.message : String(error);
        if (rollbackError) {
            throw new Error(`迁移失败且自动回滚失败，请使用迁移备份恢复。迁移错误：${reason}`);
        }
        throw new Error(`迁移失败，已自动回滚 Claude 配置：${reason}`);
    }
    const applied = readMigrationFiles(input.configDir);
    if (applied.length !== 0) {
        throw new Error("迁移后仍检测到 Claude 明文字段，请使用迁移备份恢复。");
    }
    return {
        taskId: input.taskId,
        phase: "applied",
        files: files.length,
        plaintextFieldsRemoved: removed,
        apiKeyHelperConfigured: true,
        appliedFingerprint: createHash("sha256")
            .update(JSON.stringify(files.map((file) => ({
            path: file.path,
            sha256: hash(readFileSync(file.path)),
        }))))
            .digest("hex"),
    };
}
//# sourceMappingURL=index.js.map