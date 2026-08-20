import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  loadWindowState,
  resolveWindowBounds,
  sanitizeWindowState,
  saveWindowState,
} = require("../desktop/window-state.cjs");

function withDirectory(fn) {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-window-state-"));
  return Promise.resolve(fn(root)).finally(() => rmSync(root, { recursive: true, force: true }));
}

test("desktop window state: 仅以 0600 原子保存窗口几何信息", async () => {
  await withDirectory((root) => {
    assert.equal(saveWindowState(root, {
      width: 1280,
      height: 840,
      x: 120,
      y: 80,
      maximized: false,
      projectPath: "/Users/example/project",
    }), true);
    const path = join(root, "window-state.json");
    assert.equal(statSync(path).mode & 0o777, 0o600);
    const raw = readFileSync(path, "utf8");
    assert.equal(raw.includes("projectPath"), false);
    assert.equal(raw.includes("/Users/example"), false);
    assert.deepEqual(loadWindowState(root), {
      schemaVersion: 1,
      width: 1280,
      height: 840,
      x: 120,
      y: 80,
      maximized: false,
    });
  });
});

test("desktop window state: 损坏、越界和未知版本安全回退", async () => {
  await withDirectory((root) => {
    assert.equal(sanitizeWindowState({ schemaVersion: 1, width: 800, height: 600, maximized: false }), undefined);
    assert.equal(sanitizeWindowState({ schemaVersion: 2, width: 1180, height: 800, maximized: false }), undefined);
    writeFileSync(join(root, "window-state.json"), "{broken");
    assert.equal(loadWindowState(root), undefined);
  });
});

test("desktop window state: 离屏位置被丢弃但保留安全尺寸", () => {
  const state = { schemaVersion: 1, width: 1180, height: 800, x: 5000, y: 5000, maximized: true };
  assert.deepEqual(resolveWindowBounds(state, [{ x: 0, y: 0, width: 1512, height: 982 }]), {
    width: 1180,
    height: 800,
    maximized: true,
  });
  assert.deepEqual(resolveWindowBounds(
    { ...state, x: 100, y: 80 },
    [{ x: 0, y: 0, width: 1512, height: 982 }]
  ), {
    width: 1180,
    height: 800,
    x: 100,
    y: 80,
    maximized: true,
  });
  assert.deepEqual(resolveWindowBounds(
    { ...state, width: 5000, height: 4000, x: 100, y: 80 },
    [{ x: 0, y: 0, width: 1512, height: 982 }]
  ), {
    width: 1512,
    height: 982,
    x: 0,
    y: 0,
    maximized: true,
  });
});
