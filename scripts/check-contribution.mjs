#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function captures(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "README.md",
  "README.en.md",
  "REVIEW.md",
  ".github/CODEOWNERS",
  ".github/pull_request_template.md",
  "docs/adr/README.md",
  "docs/README.md",
  "docs/README.en.md",
  "evals/README.md",
  "evals/tasks.json",
  "scripts/agent-eval-preflight.mjs",
  "scripts/after-pack.cjs",
  "scripts/check-agent-eval-result.mjs",
  "scripts/verify-desktop-bundle.mjs",
  "test/desktop-ipc-boundary.test.mjs",
  "test/helpers/desktop-main-harness.mjs",
];
for (const path of requiredFiles) {
  assert.equal(existsSync(join(repoRoot, path)), true, `缺少贡献基础设施：${path}`);
}

const repositoryInstructions = read("AGENTS.md");
const chineseReadme = read("README.md");
const englishReadme = read("README.en.md");
const chineseDocsIndex = read("docs/README.md");
const englishDocsIndex = read("docs/README.en.md");
assert.match(repositoryInstructions, /^## 9\. 文档语言与命名$/m);
assert.match(repositoryInstructions, /仓库文档默认使用简体中文/);
assert.match(chineseReadme, /\[English\]\(README\.en\.md\)/);
assert.match(englishReadme, /\[简体中文（默认）\]\(README\.md\)/);
assert.match(chineseDocsIndex, /\[English\]\(README\.en\.md\)/);
assert.match(englishDocsIndex, /\[简体中文（默认）\]\(README\.md\)/);

const codeowners = read(".github/CODEOWNERS");
for (const criticalPath of [
  "/src/rules/",
  "/src/core/apply/",
  "/desktop/main.cjs",
  "/.github/workflows/",
  "/docs/adr/",
]) {
  assert.match(codeowners, new RegExp(`^${criticalPath.replaceAll("/", "\\/")}`, "m"));
}

const adrFiles = [
  "0001-local-first-privacy-boundary.md",
  "0002-action-semantics-and-stable-tasks.md",
  "0003-transactional-configuration-writes.md",
  "0004-desktop-privilege-boundary.md",
  "0005-effective-configuration-and-private-drift-snapshots.md",
];
const adrIndex = read("docs/adr/README.md");
for (const file of adrFiles) {
  const adr = read(`docs/adr/${file}`);
  assert.match(adr, /- Status: Accepted/);
  assert.match(adr, /^## 背景$/m);
  assert.match(adr, /^## 决策$/m);
  assert.match(adr, /^## 不可破坏约束$/m);
  assert.match(adr, /^## 影响$/m);
  assert.match(adr, /^## 未采用方案$/m);
  assert.match(adrIndex, new RegExp(`\\(${file.replace(".", "\\.")}\\)`));
}

const skillNames = [
  "add-agent-adapter",
  "add-security-rule",
  "change-desktop-ipc",
  "review-macos-ui",
];
for (const name of skillNames) {
  const path = `.agents/skills/${name}/SKILL.md`;
  const metadataPath = `.agents/skills/${name}/agents/openai.yaml`;
  const skill = read(path);
  const metadata = read(metadataPath);
  assert.match(skill, new RegExp(`^---\\nname: ${name}\\n`, "m"), `${path} name`);
  assert.match(skill, /^description: .{40,}$/m, `${path} description`);
  assert.doesNotMatch(skill, /\bTODO\b|\[TODO/i, `${path} 仍含模板占位符`);
  assert.match(metadata, new RegExp(`\\$${name}\\b`), `${metadataPath} default prompt`);
}

const main = read("desktop/main.cjs");
const electronBuilder = read("electron-builder.yml");
const preload = read("desktop/preload.cjs");
const renderer = read("desktop/renderer.js");
const diagnostics = read("desktop/diagnostics.cjs");

const mainChannels = sortedUnique(
  captures(main, /ipcMain\.handle\(\s*["'](agentguard:[^"']+)["']/g)
);
const preloadChannels = sortedUnique(
  captures(preload, /ipcRenderer\.invoke\(\s*["'](agentguard:[^"']+)["']/g)
);
assert.deepEqual(
  preloadChannels,
  mainChannels,
  "main IPC 与 preload 白名单必须一一对应"
);

const mainEventChannels = sortedUnique([
  ...captures(main, /ipcMain\.on\(\s*["'](agentguard:[^"']+)["']/g),
  ...captures(main, /webContents\.send\(\s*["'](agentguard:[^"']+)["']/g),
]);
const preloadEventChannels = sortedUnique([
  ...captures(preload, /ipcRenderer\.send\(\s*["'](agentguard:[^"']+)["']/g),
  ...captures(preload, /ipcRenderer\.on\(\s*["'](agentguard:[^"']+)["']/g),
]);
assert.deepEqual(
  preloadEventChannels,
  mainEventChannels,
  "main 与 preload 的单向事件白名单必须一一对应"
);

const preloadMethods = new Set(
  captures(preload, /^\s{2}([A-Za-z][A-Za-z0-9]*):\s/gm)
);
const rendererMethods = sortedUnique(
  captures(renderer, /window\.agentguard\.([A-Za-z][A-Za-z0-9]*)/g)
);
for (const method of rendererMethods) {
  assert.equal(preloadMethods.has(method), true, `renderer 使用了未暴露的 preload 方法：${method}`);
}

const operationsBlock = diagnostics.match(
  /const OPERATIONS = new Set\(\[([\s\S]*?)\]\);/
)?.[1];
assert.ok(operationsBlock, "无法读取桌面诊断操作白名单");
const allowedOperations = new Set(captures(operationsBlock, /["']([^"']+)["']/g));
const usedOperations = sortedUnique([
  ...captures(main, /tracked\(\s*["']([^"']+)["']/g),
  ...captures(main, /diagnostics\(\)\.record\(\s*["']([^"']+)["']/g),
]);
for (const operation of usedOperations) {
  assert.equal(
    allowedOperations.has(operation),
    true,
    `桌面操作未加入脱敏诊断白名单：${operation}`
  );
}

const pkg = JSON.parse(read("package.json"));
assert.equal(
  pkg.scripts["evals:preflight"],
  "node scripts/agent-eval-preflight.mjs",
  "缺少 AI 评测运行环境预检命令"
);
assert.equal(
  pkg.scripts["evals:result:check"],
  "node scripts/check-agent-eval-result.mjs",
  "缺少 AI 评测脱敏结果校验命令"
);

assert.doesNotMatch(main, /node:child_process|require\(["']child_process["']\)|\bspawn\(/);
assert.doesNotMatch(main, /shell\s*:\s*true/);
assert.match(main, /sandbox:\s*true/);
assert.match(main, /contextIsolation:\s*true/);
assert.match(main, /nodeIntegration:\s*false/);
assert.match(electronBuilder, /^afterPack: scripts\/after-pack\.cjs$/m);

console.log(
  `✓ 贡献一致性检查通过（${skillNames.length} 个技能，${adrFiles.length} 个 ADR，${mainChannels.length} 个桌面 IPC，${usedOperations.length} 个诊断操作）`
);
