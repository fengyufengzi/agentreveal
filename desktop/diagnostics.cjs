/**
 * Desktop 本地诊断日志。
 *
 * 只记录固定操作名、结果和错误分类；不接收或持久化路径、端点、taskId、配置内容与原始错误文本。
 */
const {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { randomUUID } = require("node:crypto");
const { dirname, extname, isAbsolute, join, resolve } = require("node:path");

const DIAGNOSTIC_SCHEMA_VERSION = 1;
const DEFAULT_MAX_BYTES = 512 * 1024;
const MAX_EXPORTED_EVENTS = 200;

const OPERATIONS = new Set([
  "app.ready",
  "window.state",
  "machine.scan",
  "project.select",
  "project.scan",
  "posture.preview",
  "posture.save",
  "posture.remove",
  "posture.verify",
  "baseline.preview",
  "baseline.apply",
  "baseline.restore",
  "credential.backup",
  "credential.migration",
  "credential.restore",
  "credential.backup-cleanup",
  "risk.accept",
  "risk.verify",
  "risk.revoke",
  "provider.trust",
  "provider.untrust",
  "rule.ignore",
  "rule.unignore",
  "report.export",
  "report.open",
  "diagnostics.export",
]);
const OUTCOMES = new Set(["started", "success", "failure", "canceled"]);
const ERROR_CODES = new Set([
  "backup_integrity",
  "config_changed",
  "invalid_input",
  "not_found",
  "permission_denied",
  "preview_changed",
  "storage_full",
  "unknown",
]);

function classifyDiagnosticError(error) {
  const code = error && typeof error === "object" ? error.code : undefined;
  if (code === "EACCES" || code === "EPERM") return "permission_denied";
  if (code === "ENOSPC") return "storage_full";
  if (code === "ENOENT") return "not_found";
  const message = error instanceof Error ? error.message : "";
  if (/预览|fingerprint|指纹/i.test(message)) return "preview_changed";
  if (/完整性|integrity/i.test(message)) return "backup_integrity";
  if (/又发生了变化|发生变化|并发修改/i.test(message)) return "config_changed";
  if (/无效|仅支持|请选择|不能为空|超过/.test(message)) return "invalid_input";
  return "unknown";
}

function safeVersion(value, fallback = "unknown") {
  return typeof value === "string" && /^[A-Za-z0-9._+-]{1,64}$/.test(value)
    ? value
    : fallback;
}

function sanitizeEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  if (
    typeof value.at !== "string" ||
    !Number.isFinite(new Date(value.at).getTime()) ||
    !OPERATIONS.has(value.operation) ||
    !OUTCOMES.has(value.outcome)
  ) {
    return undefined;
  }
  const event = {
    at: new Date(value.at).toISOString(),
    operation: value.operation,
    outcome: value.outcome,
  };
  if (value.outcome === "failure" && ERROR_CODES.has(value.code)) {
    event.code = value.code;
  }
  return event;
}

function createDiagnostics(options) {
  if (!options || typeof options.userDataPath !== "string" || !isAbsolute(options.userDataPath)) {
    throw new Error("诊断目录必须是绝对路径。");
  }
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const maxBytes = Number.isInteger(options.maxBytes) && options.maxBytes >= 256
    ? options.maxBytes
    : DEFAULT_MAX_BYTES;
  const logDir = join(resolve(options.userDataPath), "logs");
  const logPath = join(logDir, "agentguard-events.jsonl");
  const rotatedPath = join(logDir, "agentguard-events.1.jsonl");

  function ensureLogDir() {
    mkdirSync(logDir, { recursive: true });
    chmodSync(logDir, 0o700);
  }

  function rotateIfNeeded(incomingBytes) {
    if (!existsSync(logPath)) return;
    if (statSync(logPath).size + incomingBytes <= maxBytes) return;
    rmSync(rotatedPath, { force: true });
    renameSync(logPath, rotatedPath);
    chmodSync(rotatedPath, 0o600);
  }

  function record(operation, outcome, code) {
    if (!OPERATIONS.has(operation) || !OUTCOMES.has(outcome)) return false;
    try {
      const event = sanitizeEvent({
        at: now().toISOString(),
        operation,
        outcome,
        ...(outcome === "failure" && ERROR_CODES.has(code) ? { code } : {}),
      });
      if (!event) return false;
      const line = `${JSON.stringify(event)}\n`;
      ensureLogDir();
      rotateIfNeeded(Buffer.byteLength(line));
      const fd = openSync(logPath, "a", 0o600);
      try {
        writeFileSync(fd, line);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      chmodSync(logPath, 0o600);
      return true;
    } catch {
      // 诊断日志不得让扫描或整改操作失败。
      return false;
    }
  }

  async function track(operation, task) {
    record(operation, "started");
    try {
      const result = await task();
      if (result?.canceled === true) {
        record(operation, "canceled");
      } else if (result?.ok === false) {
        record(operation, "failure", "unknown");
      } else {
        record(operation, "success");
      }
      return result;
    } catch (error) {
      record(operation, "failure", classifyDiagnosticError(error));
      throw error;
    }
  }

  function readEvents() {
    const events = [];
    for (const path of [rotatedPath, logPath]) {
      if (!existsSync(path)) continue;
      let content;
      try {
        content = readFileSync(path, "utf8");
      } catch {
        continue;
      }
      for (const line of content.split("\n")) {
        if (!line) continue;
        try {
          const event = sanitizeEvent(JSON.parse(line));
          if (event) events.push(event);
        } catch {
          // 损坏或被篡改的日志行不会进入导出文件。
        }
      }
    }
    return events.slice(-MAX_EXPORTED_EVENTS);
  }

  function exportTo(outputPath, metadata) {
    if (
      typeof outputPath !== "string" ||
      !isAbsolute(outputPath) ||
      extname(outputPath).toLowerCase() !== ".json"
    ) {
      throw new Error("诊断文件必须是绝对 JSON 路径。");
    }
    const normalized = resolve(outputPath);
    if (!statSync(dirname(normalized)).isDirectory()) {
      throw new Error("诊断文件输出目录不存在。");
    }
    const events = readEvents();
    const payload = {
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      generatedAt: now().toISOString(),
      privacy: {
        localOnly: true,
        uploadedAutomatically: false,
        excludes: ["project paths", "endpoints", "task IDs", "config contents", "error messages"],
      },
      app: {
        version: safeVersion(metadata?.appVersion),
      },
      runtime: {
        platform: safeVersion(metadata?.platform),
        arch: safeVersion(metadata?.arch),
        electron: safeVersion(metadata?.electronVersion),
        node: safeVersion(metadata?.nodeVersion),
      },
      events,
    };
    const tempPath = join(
      dirname(normalized),
      `.agentguard-diagnostics-${process.pid}-${randomUUID()}.tmp`
    );
    let fd;
    try {
      fd = openSync(tempPath, "wx", 0o600);
      writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`);
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      chmodSync(tempPath, 0o600);
      renameSync(tempPath, normalized);
    } catch (error) {
      if (fd !== undefined) closeSync(fd);
      rmSync(tempPath, { force: true });
      throw error;
    }
    return { path: normalized, eventCount: events.length };
  }

  return { exportTo, readEvents, record, track };
}

module.exports = {
  DIAGNOSTIC_SCHEMA_VERSION,
  classifyDiagnosticError,
  createDiagnostics,
};
