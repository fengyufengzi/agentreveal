#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PILOT_VERSION = /^\d+\.\d+\.\d+-pilot\.\d+$/u;
const NPM_PACKAGE_NAME = "@wangmarsen/agentguard";

export function verifyReleaseVersion(version, root = resolve(import.meta.dirname, "..")) {
  if (!PILOT_VERSION.test(version ?? "")) {
    throw new Error("发布版本必须使用 x.y.z-pilot.N 格式。");
  }
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  if (pkg.name !== NPM_PACKAGE_NAME) {
    throw new Error(`npm 包名必须为 ${NPM_PACKAGE_NAME}，当前为 ${pkg.name ?? "未配置"}。`);
  }
  if (pkg.version !== version) {
    throw new Error(`发布输入 ${version} 与 package.json ${pkg.version} 不一致。`);
  }
  const notes = resolve(root, "docs", `release-${version}.md`);
  if (!existsSync(notes)) {
    throw new Error(`缺少版本化 Release Notes：docs/release-${version}.md`);
  }
  return { version, notes };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const result = verifyReleaseVersion(argv[0]);
    console.log(`✓ 发布版本与 Release Notes 一致：${result.version}`);
    return 0;
  } catch (error) {
    console.error(`发布版本检查失败：${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) process.exitCode = main();
