#!/usr/bin/env node

import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function collect(root, suffix, directories = false) {
  const matches = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (directories && entry.name.endsWith(suffix)) matches.push(path);
        else walk(path);
      } else if (!directories && entry.name.endsWith(suffix)) {
        matches.push(path);
      }
    }
  }
  walk(root);
  return matches;
}

function verify(label, command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "未知错误").trim();
    throw new Error(`${label}失败：${detail}`);
  }
  console.log(`✓ ${label}`);
}

if (process.platform !== "darwin") {
  throw new Error("macOS 发布验证只能在 macOS 执行。");
}

const input = resolve(process.argv[2] ?? "release");
if (!existsSync(input)) throw new Error(`macOS 发布产物不存在：${input}`);
const dmgs = statSync(input).isDirectory()
  ? collect(input, ".dmg")
  : input.endsWith(".dmg")
    ? [input]
    : [];
if (dmgs.length !== 1) {
  throw new Error(`输入必须且只能解析到一个 .dmg，当前找到 ${dmgs.length} 个。`);
}

verify("DMG 完整性", "hdiutil", ["verify", dmgs[0]]);

const mountPoint = mkdtempSync(join(tmpdir(), "agentguard-dmg-mount-"));
try {
  verify("DMG 只读挂载", "hdiutil", [
    "attach",
    "-nobrowse",
    "-readonly",
    "-mountpoint",
    mountPoint,
    dmgs[0],
  ]);
  const apps = collect(mountPoint, ".app", true);
  if (apps.length !== 1) {
    throw new Error(`DMG 必须且只能包含一个 .app，当前找到 ${apps.length} 个。`);
  }
  verify("代码签名", "codesign", ["--verify", "--deep", "--strict", "--verbose=2", apps[0]]);
  verify("Gatekeeper 评估", "spctl", ["--assess", "--type", "exec", "--verbose=4", apps[0]]);
  verify("公证 ticket staple", "xcrun", ["stapler", "validate", apps[0]]);
} finally {
  spawnSync("hdiutil", ["detach", mountPoint, "-force"], { encoding: "utf8" });
  rmSync(mountPoint, { recursive: true, force: true });
}

const checksum = spawnSync("shasum", ["-a", "256", dmgs[0]], { encoding: "utf8" });
if (checksum.status !== 0) throw new Error("无法计算 DMG SHA-256。");
console.log(checksum.stdout.trim());
