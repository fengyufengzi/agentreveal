#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(tmpdir(), "agentreveal-local-preview");
const launcherPath = join(outputRoot, "AgentReveal Preview.app");
const electronApp = join(repoRoot, "node_modules", "electron", "dist", "Electron.app");
const mainEntry = join(repoRoot, "desktop", "main.cjs");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} 执行失败：${(result.stderr || result.stdout || "未知错误").trim()}`
    );
  }
}

async function verifyLauncher() {
  const executable = join(electronApp, "Contents", "MacOS", "Electron");
  const child = spawn(executable, [mainEntry], {
    cwd: repoRoot,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const exitPromise = new Promise((resolveExit) => child.once("exit", resolveExit));
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 2500));
  assert.equal(
    child.exitCode,
    null,
    `受信任的 Electron 开发运行时提前退出：${stderr.trim() || "无错误输出"}`
  );
  assert.equal(
    child.signalCode,
    null,
    `受信任的 Electron 开发运行时被 ${child.signalCode} 终止：${stderr.trim() || "无错误输出"}`
  );
  child.kill("SIGTERM");
  await exitPromise;
}

if (process.platform !== "darwin") {
  throw new Error("macOS 本地预览 App 只能在 macOS 构建。");
}
if (process.argv.includes("--dmg")) {
  throw new Error(
    "macOS 26 会拒绝缺少公证 ticket 的独立 DMG。请在最终候选确定后运行 npm run desktop:release。"
  );
}
for (const path of [electronApp, mainEntry]) {
  if (!existsSync(path)) throw new Error(`缺少本地预览依赖：${path}`);
}

if (outputRoot === resolve(tmpdir()) || dirname(outputRoot) !== resolve(tmpdir())) {
  throw new Error("本地预览暂存目录越界，已拒绝清理。");
}
rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const appleScript = [
  "do shell script ",
  JSON.stringify(
    `/usr/bin/open -n ${JSON.stringify(electronApp)} --args ${JSON.stringify(mainEntry)}`
  ),
].join("");
run("osacompile", ["-o", launcherPath, "-e", appleScript]);
await verifyLauncher();

console.log(`✓ 可双击的本地开发预览 App：${launcherPath}`);
console.log("  该 App 依赖当前源码目录和 node_modules，不是可分发的独立发布包。");
