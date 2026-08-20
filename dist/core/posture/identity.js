import { createHmac, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { atomicCreateFile } from "../fs-safety.js";
const KEY_PREFIX = "agentreveal-state-key-v1:";
const KEY_BYTES = 32;
export function defaultPostureIdentityKeyPath(home = homedir()) {
    return join(home, ".agentreveal", "state-key");
}
function parseKey(text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith(KEY_PREFIX)) {
        throw new Error("有效配置身份密钥格式无效。");
    }
    const encoded = trimmed.slice(KEY_PREFIX.length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        throw new Error("有效配置身份密钥格式无效。");
    }
    const key = Buffer.from(encoded, "base64");
    if (key.length !== KEY_BYTES || key.toString("base64") !== encoded) {
        throw new Error("有效配置身份密钥长度或编码无效。");
    }
    return key;
}
function readKey(path) {
    try {
        const directoryStatus = statSync(dirname(path));
        if (!directoryStatus.isDirectory()) {
            throw new Error("密钥目录无效。");
        }
        if ((directoryStatus.mode & 0o077) !== 0) {
            throw new Error("密钥目录权限过宽，必须为 0700。");
        }
        const status = statSync(path);
        if (!status.isFile()) {
            throw new Error("密钥路径不是普通文件。");
        }
        if ((status.mode & 0o077) !== 0) {
            throw new Error("密钥权限过宽，必须为 0600。");
        }
        return parseKey(readFileSync(path, "utf8"));
    }
    catch (error) {
        throw new Error(`无法读取有效配置身份密钥 ${path}：${error instanceof Error ? error.message : String(error)}`);
    }
}
export function loadOrCreatePostureIdentityKey(options = {}) {
    const path = options.path ?? defaultPostureIdentityKeyPath();
    if (existsSync(path))
        return readKey(path);
    if (options.allowCreate === false) {
        throw new Error(`有效配置身份密钥缺失：${path}。为避免旧快照身份失真，已拒绝静默重建。`);
    }
    const directory = dirname(path);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    const random = options.random ?? randomBytes;
    const key = random(KEY_BYTES);
    if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
        throw new Error("生成的有效配置身份密钥无效。");
    }
    const content = `${KEY_PREFIX}${key.toString("base64")}\n`;
    try {
        atomicCreateFile(path, content, 0o600);
        return key;
    }
    catch (error) {
        if (error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "EEXIST") {
            return readKey(path);
        }
        throw error;
    }
}
export function postureHmacIdentity(key, context, value) {
    if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
        throw new Error("有效配置身份密钥必须为 32 字节。");
    }
    const normalizedContext = context.trim().normalize("NFC");
    const normalizedValue = value.trim().normalize("NFC");
    if (!normalizedContext ||
        !normalizedValue ||
        normalizedContext.includes("\0") ||
        normalizedValue.includes("\0")) {
        throw new Error("有效配置身份上下文和值不能为空或包含 NUL。");
    }
    const digest = createHmac("sha256", key)
        .update(`agentreveal-posture-v1\0${normalizedContext}\0${normalizedValue}`, "utf8")
        .digest("hex");
    return `hmac-sha256:${digest}`;
}
//# sourceMappingURL=identity.js.map