/**
 * Desktop MVP smoke test：不启动 GUI，只验证桌面入口资产存在且脚本可被解析。
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

test("desktop: Electron MVP assets exist", () => {
  for (const file of ["main.cjs", "preload.cjs", "index.html", "renderer.js", "styles.css"]) {
    assert.equal(existsSync(join(repoRoot, "desktop", file)), true, file);
  }
});

test("desktop: packaging keeps Electron entry out of npm package metadata", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const config = readFileSync(join(repoRoot, "electron-builder.yml"), "utf8");
  assert.equal(pkg.main, undefined);
  assert.match(config, /extraMetadata:/);
  assert.match(config, /main: desktop\/main\.cjs/);
  assert.match(pkg.scripts["desktop:pack"], /CSC_IDENTITY_AUTO_DISCOVERY=false/);
});

test("desktop: main process exposes only whitelisted CLI commands", () => {
  const main = readFileSync(join(repoRoot, "desktop", "main.cjs"), "utf8");
  assert.match(main, /const COMMANDS =/);
  assert.match(main, /doctor/);
  assert.match(main, /baselineBalanced/);
  assert.doesNotMatch(main, /shell: true/);
});

test("desktop: renderer uses preload bridge", () => {
  const renderer = readFileSync(join(repoRoot, "desktop", "renderer.js"), "utf8");
  assert.match(renderer, /window\.agentguard\.run/);
  assert.match(renderer, /reportHtml/);
});

test("desktop: builder config is unsigned internal preview", () => {
  const config = readFileSync(join(repoRoot, "electron-builder.yml"), "utf8");
  assert.match(config, /identity: null/);
  assert.match(config, /sign: false/);
  assert.match(config, /arm64/);
  assert.match(config, /output: release/);
});
