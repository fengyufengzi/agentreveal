#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { extractAll } = require("@electron/asar");

function usage() {
  console.log(
    "Usage: node scripts/scan-release-assets.mjs "
      + "[--tarball path/to/package.tgz] [--dmg path/to/AgentReveal.dmg]"
  );
}

export function parseReleaseAssetArgs(argv) {
  const assets = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true, assets: [] };
    if (arg !== "--tarball" && arg !== "--dmg") {
      throw new Error(`未知参数：${arg}`);
    }
    const path = argv[index + 1];
    if (!path || path.startsWith("--")) {
      throw new Error(`${arg} 需要一个明确的文件路径。`);
    }
    assets.push({ kind: arg === "--tarball" ? "tarball" : "dmg", path });
    index += 1;
  }
  if (assets.length === 0) throw new Error("至少提供一个最终 tarball 或 DMG。");
  if (new Set(assets.map((asset) => asset.kind)).size !== assets.length) {
    throw new Error("每种发布资产一次只能扫描一个文件。");
  }
  return { help: false, assets };
}

export function validateTarEntries(entries) {
  for (const entry of entries) {
    const normalized = entry.replaceAll("\\", "/");
    const segments = normalized.split("/").filter(Boolean);
    if (
      !normalized
      || normalized.includes("\0")
      || normalized.startsWith("/")
      || /^[A-Za-z]:\//u.test(normalized)
      || segments.includes("..")
    ) {
      throw new Error("tarball 包含越界或不可识别路径，已拒绝解包。");
    }
  }
}

export function findAppBundles(root) {
  const apps = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (!entry.isDirectory()) continue;
      if (entry.name.endsWith(".app")) {
        apps.push(path);
      } else {
        walk(path);
      }
    }
  }
  walk(root);
  return apps;
}

export function assertNoSymbolicLinks(root) {
  function walk(path) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new Error("发布资产包含符号链接，已拒绝扫描以避免越界读取。");
    }
    if (!stat.isDirectory()) return;
    for (const entry of readdirSync(path)) walk(join(path, entry));
  }
  walk(root);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
}

function requireSuccessful(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label}失败；为避免泄漏，外部工具原始输出未显示。`);
  }
  return result;
}

function resolveAsset(asset) {
  const expectedExtension = asset.kind === "tarball" ? ".tgz" : ".dmg";
  if (extname(asset.path).toLowerCase() !== expectedExtension) {
    throw new Error(`${asset.kind} 必须使用 ${expectedExtension} 扩展名。`);
  }
  const absolute = resolve(asset.path);
  if (!existsSync(absolute) || !lstatSync(absolute).isFile()) {
    throw new Error(`${asset.kind} 文件不存在或不是普通文件。`);
  }
  return { ...asset, path: realpathSync.native(absolute) };
}

function extractTarball(tarball, target) {
  const listed = requireSuccessful(
    run("tar", ["-tzf", tarball]),
    "读取 tarball 清单"
  );
  const entries = listed.stdout.split("\n").filter(Boolean);
  validateTarEntries(entries);
  mkdirSync(target, { recursive: true });
  requireSuccessful(
    run("tar", ["-xzf", tarball, "-C", target, "--no-same-owner"]),
    "解包 tarball"
  );
  assertNoSymbolicLinks(target);
}

function attachDmg(dmg, mountPoint) {
  mkdirSync(mountPoint, { recursive: true });
  requireSuccessful(
    run("hdiutil", [
      "attach",
      "-nobrowse",
      "-readonly",
      "-mountpoint",
      mountPoint,
      dmg,
    ]),
    "只读挂载 DMG"
  );
}

function detachDmg(mountPoint) {
  run("hdiutil", ["detach", mountPoint, "-force"]);
}

function prepareDmgScanRoot(dmg, workRoot) {
  if (process.platform !== "darwin") {
    throw new Error("DMG 独立扫描只能在 macOS 执行。");
  }
  const mountPoint = join(workRoot, "dmg-mount");
  attachDmg(dmg, mountPoint);
  try {
    const apps = findAppBundles(mountPoint);
    if (apps.length !== 1) {
      throw new Error(`DMG 必须且只能包含一个 .app，当前找到 ${apps.length} 个。`);
    }
    const app = apps[0];
    const asarPath = join(app, "Contents", "Resources", "app.asar");
    if (!existsSync(asarPath)) throw new Error("DMG 中的应用缺少 app.asar。");
    const target = join(workRoot, "dmg-app-asar");
    mkdirSync(target, { recursive: true });
    extractAll(asarPath, target);
    assertNoSymbolicLinks(target);

    const infoPlist = join(app, "Contents", "Info.plist");
    if (existsSync(infoPlist)) copyFileSync(infoPlist, join(target, "Info.plist"));

    const unpacked = join(app, "Contents", "Resources", "app.asar.unpacked");
    if (!existsSync(unpacked)) return { target };
    assertNoSymbolicLinks(unpacked);
    const unpackedTarget = join(workRoot, "dmg-app-unpacked");
    cpSync(unpacked, unpackedTarget, { recursive: true, dereference: false });
    return { target, unpacked: unpackedTarget };
  } finally {
    detachDmg(mountPoint);
  }
}

function gitleaksFindingCount(reportPath) {
  if (!existsSync(reportPath)) return 0;
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    return Array.isArray(report) ? report.length : 0;
  } catch {
    return 0;
  }
}

function scanWithGitleaks(label, target, reportRoot) {
  const reportPath = join(reportRoot, `${label.replaceAll(/[^A-Za-z0-9_-]/gu, "-")}.json`);
  const result = run("gitleaks", [
    "dir",
    target,
    "--no-banner",
    "--no-color",
    "--redact=100",
    "--report-format=json",
    `--report-path=${reportPath}`,
    "--max-archive-depth=2",
    "--timeout=180",
  ]);
  if (result.error?.code === "ENOENT") {
    throw new Error("未找到 gitleaks；请先安装受信任版本的独立扫描器。");
  }
  if (result.status === 1) {
    const count = gitleaksFindingCount(reportPath);
    throw new Error(`${label} 发现 ${count || "至少 1"} 项潜在秘密；匹配内容已隐藏。`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} 的 Gitleaks 扫描执行失败；原始输出未显示。`);
  }
  console.log(`✓ ${label} 独立 Gitleaks 扫描通过`);
}

export function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseReleaseAssetArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    usage();
    return 2;
  }
  if (parsed.help) {
    usage();
    return 0;
  }

  const assets = parsed.assets.map(resolveAsset);
  const workRoot = mkdtempSync(join(tmpdir(), "agentreveal-release-scan-"));
  try {
    const version = run("gitleaks", ["version"]);
    if (version.error?.code === "ENOENT" || version.status !== 0) {
      throw new Error("未找到可用的 gitleaks 独立扫描器。");
    }
    console.log(`使用 Gitleaks ${version.stdout.trim()} 扫描最终发布资产`);

    for (const asset of assets) {
      if (asset.kind === "tarball") {
        const target = join(workRoot, "npm-tarball");
        extractTarball(asset.path, target);
        scanWithGitleaks("npm-tarball", target, workRoot);
      } else {
        const prepared = prepareDmgScanRoot(asset.path, workRoot);
        scanWithGitleaks("macos-app-asar", prepared.target, workRoot);
        if (prepared.unpacked) {
          scanWithGitleaks("macos-app-unpacked", prepared.unpacked, workRoot);
        }
      }
    }
    console.log(
      `✓ 最终发布资产独立扫描通过（${assets.map((asset) => basename(asset.path)).join("、")}）`
    );
    return 0;
  } catch (error) {
    console.error(`最终发布资产扫描失败：${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) process.exitCode = main();
