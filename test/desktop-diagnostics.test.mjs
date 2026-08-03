import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  classifyDiagnosticError,
  createDiagnostics,
} = require("../desktop/diagnostics.cjs");

function withDirectory(fn) {
  const root = mkdtempSync(join(tmpdir(), "agentguard-diagnostics-"));
  return Promise.resolve(fn(root)).finally(() => {
    rmSync(root, { recursive: true, force: true });
  });
}

test("desktop diagnostics: 只导出固定事件字段，不记录原始错误或本机上下文", async () => {
  await withDirectory(async (root) => {
    const diagnostics = createDiagnostics({
      userDataPath: root,
      now: () => new Date("2026-07-17T12:00:00.000Z"),
    });
    diagnostics.record("app.ready", "success");
    diagnostics.record("credential.backup", "success");
    diagnostics.record("credential.migration", "success");
    diagnostics.record("credential.restore", "canceled");
    diagnostics.record("credential.backup-cleanup", "success");
    await assert.rejects(
      diagnostics.track("project.scan", async () => {
        const error = new Error(
          "扫描 /Users/example/project 的 https://relay.example.invalid 失败，token=SECRET_PLACEHOLDER"
        );
        error.code = "EACCES";
        throw error;
      }),
      /relay\.example/
    );
    diagnostics.record("unapproved.operation", "success");

    const outputPath = join(root, "diagnostics.json");
    const result = diagnostics.exportTo(outputPath, {
      appVersion: "0.0.5-pilot.1",
      platform: "darwin",
      arch: "arm64",
      electronVersion: "43.1.0",
      nodeVersion: "24.0.0",
      ignoredPrivateField: "/Users/example/project",
    });
    assert.equal(result.eventCount, 7);
    assert.equal(statSync(outputPath).mode & 0o777, 0o600);
    const raw = readFileSync(outputPath, "utf8");
    assert.equal(raw.includes("/Users/example"), false);
    assert.equal(raw.includes("relay.example"), false);
    assert.equal(raw.includes("SECRET_PLACEHOLDER"), false);
    assert.equal(raw.includes("ignoredPrivateField"), false);
    const payload = JSON.parse(raw);
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.privacy.uploadedAutomatically, false);
    assert.deepEqual(payload.events.at(-1), {
      at: "2026-07-17T12:00:00.000Z",
      operation: "project.scan",
      outcome: "failure",
      code: "permission_denied",
    });
  });
});

test("desktop diagnostics: 日志 0600、目录 0700、轮换且忽略损坏行", async () => {
  await withDirectory(async (root) => {
    const diagnostics = createDiagnostics({ userDataPath: root, maxBytes: 256 });
    for (let index = 0; index < 20; index++) {
      diagnostics.record("project.scan", index % 2 ? "success" : "started");
    }
    const logDir = join(root, "logs");
    const logPath = join(logDir, "agentguard-events.jsonl");
    const rotatedPath = join(logDir, "agentguard-events.1.jsonl");
    assert.equal(statSync(logDir).mode & 0o777, 0o700);
    assert.equal(statSync(logPath).mode & 0o777, 0o600);
    assert.equal(existsSync(rotatedPath), true);
    assert.equal(statSync(rotatedPath).mode & 0o777, 0o600);
    writeFileSync(logPath, `${readFileSync(logPath, "utf8")}\n{broken\n`);
    assert.doesNotThrow(() => diagnostics.readEvents());
    assert.ok(diagnostics.readEvents().length > 0);
  });
});

test("desktop diagnostics: 错误仅映射为固定分类", () => {
  assert.equal(classifyDiagnosticError(Object.assign(new Error("x"), { code: "ENOSPC" })), "storage_full");
  assert.equal(classifyDiagnosticError(new Error("预览指纹变化")), "preview_changed");
  assert.equal(classifyDiagnosticError(new Error("备份完整性失败")), "backup_integrity");
  assert.equal(classifyDiagnosticError(new Error("unexpected")), "unknown");
});

test("desktop diagnostics: 诊断自身失败不得中断主操作", async () => {
  await withDirectory(async (root) => {
    const diagnostics = createDiagnostics({
      userDataPath: root,
      now: () => undefined,
    });
    const result = await diagnostics.track("project.scan", async () => ({ ok: true }));
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(diagnostics.readEvents(), []);
  });
});

test("desktop diagnostics: 返回 ok=false 的操作记录为固定失败分类", async () => {
  await withDirectory(async (root) => {
    const diagnostics = createDiagnostics({ userDataPath: root });
    const result = await diagnostics.track("report.open", async () => ({
      ok: false,
      error: "/Users/example/project/report.html",
    }));
    assert.equal(result.ok, false);
    const events = diagnostics.readEvents();
    assert.deepEqual(events.at(-1), {
      at: events.at(-1).at,
      operation: "report.open",
      outcome: "failure",
      code: "unknown",
    });
    assert.equal(JSON.stringify(events).includes("/Users/example"), false);
  });
});

test("desktop diagnostics: 窗口状态事件不携带尺寸、位置或项目上下文", async () => {
  await withDirectory((root) => {
    const diagnostics = createDiagnostics({ userDataPath: root });
    assert.equal(diagnostics.record("window.state", "success"), true);
    const event = diagnostics.readEvents().at(-1);
    assert.deepEqual(event, {
      at: event.at,
      operation: "window.state",
      outcome: "success",
    });
    assert.deepEqual(Object.keys(event).sort(), ["at", "operation", "outcome"]);
  });
});
