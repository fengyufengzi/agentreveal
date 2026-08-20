#!/usr/bin/env node
/**
 * AgentGuard → AgentReveal 全量改名脚本（v2，稳健版）。
 *
 * 仅 2026-08-05 改名前后运行一次。
 * 改名完成后 RULES 已被所有受改文件吸收到代码／文档／配置；
 * 若再次执行会产生反替换或自循环（JULES 同名场景），且永不再需要。
 * 保留本文件的目的是为协同者审计改名范围；脚本本身不应再被 npm scripts 引用。
 *
 * 用法：
 *   node scripts/rename-to-agentreveal.mjs            # dry-run
 *   node scripts/rename-to-agentreveal.mjs --apply    # 落盘（仅 2026-08-05 跑过一次）
 *
 * 不改：
 *   - node_modules / .git / dist / release / .rename-tmp
 *   - CHANGELOG.md 历史条目（在 Commit 5 单独追加 0.0.7 段）
 *   - docs/release-0.0.*-pilot.*.md（含历史 SHA / DMG 名）
 *   - archive/ 全部
 *   - docs/adr/0001 / 0004 / 0005 原文（脚本不动；Commit 4 在顶部加 Superseded 行）
 *   - 5 个 AgentReveal_*.md 历史 PRD 文件名（按 DOCUMENT_STATUS §6 保留）
 *   - .gitignore / package-lock.json / LICENSE（命中 0，不需改）
 *   - dist/*（编译产物；Commit 6 由 npm run build 重新生成）
 */

import { readFileSync, writeFileSync, statSync, readdirSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const ROOT = process.cwd();
const APPLY = process.argv.includes("--apply");

// 仅扫这些扩展
const TEXT_EXTS = new Set([
  ".ts", ".tsx", ".mjs", ".cjs", ".js", ".json", ".json5",
  ".md", ".mdx", ".yml", ".yaml",
  ".html", ".htm", ".css", ".svg", ".txt", ".plist", ".sh",
]);

// 不递归的目录（含二进制/构建产物/外部依赖）
const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "release", ".rename-tmp",
  ".husky", ".next", ".turbo", ".cache",
]);

// 白名单：完全不动（包括 dotfile 目录）
const WHITELIST_REL = new Set([
  ".gitignore",
  "LICENSE",
  "package-lock.json",
  ".DS_Store",
  // 历史 release 笔记
  "docs/release-0.0.2.md",
  "docs/release-0.0.3-pilot.1.md",
  "docs/release-0.0.3-pilot.2.md",
  "docs/release-0.0.3-pilot.3.md",
  "docs/release-0.0.4-pilot.1.md",
  "docs/release-0.0.5-pilot.1.md",
  "docs/release-0.0.5-pilot.2.md",
  "docs/release-0.0.5-pilot.3.md",
  "docs/release-0.0.6-pilot.3.md",
  "docs/release-0.0.6-pilot.4.md",
  // 历史 PRD 文件名（保留作为历史证据）
  "AgentReveal_MVP_PRD_v0.2.md",
  "AgentReveal_Product_Positioning_Proposal_v1.0.md",
  "AgentReveal_安全配置中心_立项分析文档_v0.2.md",
  "AgentReveal_技术Spike任务清单_v0.1.md",
  "AgentReveal_立项分析_一页版.md",
  // CHANGELOG 历史段（Commit 5 在顶部 append 0.0.7 段，不动主体）
  "CHANGELOG.md",
  // Superseded ADR：原文不动；Commit 4 在顶部 append 一行
  "docs/adr/0001-local-first-privacy-boundary.md",
  "docs/adr/0004-desktop-privilege-boundary.md",
  "docs/adr/0005-effective-configuration-and-private-drift-snapshots.md",
]);

// -------------------------------------------------------------------------
// 替换规则
// -------------------------------------------------------------------------

const RULES = [
  // ── 顶层包与 GitHub ──────────────────────────────────────────
  ["agentreveal", "agentreveal"],
  ["fengyufengzi/agentreveal", "fengyufengzi/agentreveal"],
  ["github.com/fengyufengzi/agentreveal", "github.com/fengyufengzi/agentreveal"],
  // ── CLI 命令行 + 帮助文案 ──────────────────────────────────
  ["agentreveal <cmd>", "agentreveal <cmd>"],
  ["agentreveal --help", "agentreveal --help"],
  ["agentreveal --json", "agentreveal --json"],
  ["agentreveal --version", "agentreveal --version"],
  ["agentreveal scan", "agentreveal scan"],
  ["agentreveal doctor", "agentreveal doctor"],
  ["agentreveal posture", "agentreveal posture"],
  ["agentreveal baseline", "agentreveal baseline"],
  ["agentreveal trust", "agentreveal trust"],
  ["agentreveal ignore", "agentreveal ignore"],
  ["agentreveal risk", "agentreveal risk"],
  ["agentreveal credential", "agentreveal credential"],
  ["agentreveal backup", "agentreveal backup"],
  ["agentreveal apply", "agentreveal apply"],
  ["agentreveal restore", "agentreveal restore"],
  ["agentreveal report", "agentreveal report"],
  ["agentreveal cleanup", "agentreveal cleanup"],
  ["agentreveal map", "agentreveal map"],
  // ── IPC channel 前缀（26 个）────────────────────────────────
  ["agentreveal:scanMachine", "agentreveal:scanMachine"],
  ["agentreveal:selectProject", "agentreveal:selectProject"],
  ["agentreveal:scanProject", "agentreveal:scanProject"],
  ["agentreveal:previewPostureBaseline", "agentreveal:previewPostureBaseline"],
  ["agentreveal:savePostureBaseline", "agentreveal:savePostureBaseline"],
  ["agentreveal:removePostureBaseline", "agentreveal:removePostureBaseline"],
  ["agentreveal:verifyPosture", "agentreveal:verifyPosture"],
  ["agentreveal:previewBaseline", "agentreveal:previewBaseline"],
  ["agentreveal:applyBaseline", "agentreveal:applyBaseline"],
  ["agentreveal:restoreBaseline", "agentreveal:restoreBaseline"],
  ["agentreveal:backupClaudeRemediation", "agentreveal:backupClaudeRemediation"],
  ["agentreveal:applyClaudeMigration", "agentreveal:applyClaudeMigration"],
  ["agentreveal:restoreClaudeRemediation", "agentreveal:restoreClaudeRemediation"],
  ["agentreveal:cleanupClaudeCredentialBackup", "agentreveal:cleanupClaudeCredentialBackup"],
  ["agentreveal:acceptRisk", "agentreveal:acceptRisk"],
  ["agentreveal:verifyRisk", "agentreveal:verifyRisk"],
  ["agentreveal:revokeRisk", "agentreveal:revokeRisk"],
  ["agentreveal:trustProvider", "agentreveal:trustProvider"],
  ["agentreveal:removeProviderTrust", "agentreveal:removeProviderTrust"],
  ["agentreveal:ignoreRule", "agentreveal:ignoreRule"],
  ["agentreveal:removeRuleIgnore", "agentreveal:removeRuleIgnore"],
  ["agentreveal:exportReport", "agentreveal:exportReport"],
  ["agentreveal:openReport", "agentreveal:openReport"],
  ["agentreveal:exportDiagnostics", "agentreveal:exportDiagnostics"],
  // ── preload contextBridge / window.agentreveal ──────────────
  ['exposeInMainWorld("agentreveal")', 'exposeInMainWorld("agentreveal")'],
  ["exposeInMainWorld('agentreveal')", "exposeInMainWorld('agentreveal')"],
  ["window.agentreveal.", "window.agentreveal."],
  ["window['agentreveal']", "window['agentreveal']"],
  ['window["agentreveal"]', 'window["agentreveal"]'],
  // ── 本地状态、配置、Keychain 路径 ───────────────────────────
  [".agentreveal.json", ".agentreveal.json"],
  ["agentreveal.config.json", "agentreveal.config.json"],
  ["~/.agentreveal/~/.agentreveal/", "~/.agentreveal/"],   // 占位，避免循环 — 反向
  // 上面那条是错的；删掉。改为下面的真实规则：
];
// 移除反向规则
RULES.splice(RULES.length - 1, 1);

// 继续 append 剩余真实规则
RULES.push(
  ["~/.agentreveal/", "~/.agentreveal/"],
  ["~/.agentreveal\"", "~/.agentreveal\""],
  ["~/.agentreveal`", "~/.agentreveal`"],
  ["~/.agentreveal\\", "~/.agentreveal\\"],
  ["/.agentreveal/", "/.agentreveal/"],
  [".agentreveal/backups", ".agentreveal/backups"],
  // 环境变量
  ["AGENTREVEAL_TEST_ROOT", "AGENTREVEAL_TEST_ROOT"],
  ["AGENTREVEAL_EVAL_CODEX_PATH", "AGENTREVEAL_EVAL_CODEX_PATH"],
  ["AGENTREVEAL_ACCEPTANCE_PATH", "AGENTREVEAL_ACCEPTANCE_PATH"],
  ["AGENTREVEAL_TASK_SNAPSHOT_PATH", "AGENTREVEAL_TASK_SNAPSHOT_PATH"],
  ["AGENTREVEAL_POSTURE_SNAPSHOT_PATH", "AGENTREVEAL_POSTURE_SNAPSHOT_PATH"],
  ["AGENTREVEAL_POSTURE_KEY_PATH", "AGENTREVEAL_POSTURE_KEY_PATH"],
  ["AGENTREVEAL_CLAUDE_DIR", "AGENTREVEAL_CLAUDE_DIR"],
  ["AGENTREVEAL_CLAUDE_HELPER", "AGENTREVEAL_CLAUDE_HELPER"],
  ["AGENTREVEAL_CLAUDE_INPUT", "AGENTREVEAL_CLAUDE_INPUT"],
  // HMAC / hash 域串
  ["agentreveal-posture-lock-v1", "agentreveal-posture-lock-v1"],
  ["agentreveal-state-key-v1", "agentreveal-state-key-v1"],
  ["agentreveal-posture-v1", "agentreveal-posture-v1"],
  ["agentreveal-drift-v1", "agentreveal-drift-v1"],
  ["agentreveal-project-scope", "agentreveal-project-scope"],
  // Keychain / sanit 历史前缀
  ["AGENTREVEAL_COMMIT:", "AGENTREVEAL_COMMIT:"],
  ['service "agentreveal"', 'service "agentreveal"'],
  ["service 'agentreveal'", "service 'agentreveal'"],
  // electron-builder / dmg / artifact
  ["app.reveal.desktop", "app.reveal.desktop"],
  ["AgentReveal-${version}", "AgentReveal-${version}"],
  ["AgentReveal-${date}", "AgentReveal-${date}"],
  ["AgentReveal Preview.app", "AgentReveal Preview.app"],
  ["AgentReveal.app", "AgentReveal.app"],
  ["AgentReveal-diagnostics", "AgentReveal-diagnostics"],
  ["AgentReveal.zip", "AgentReveal.zip"],
  ["agentreveal-local-preview", "agentreveal-local-preview"],
  ["agentreveal-macos-release-", "agentreveal-macos-release-"],
  ["agentreveal-dmg-mount-", "agentreveal-dmg-mount-"],
  ["agentreveal-events.jsonl", "agentreveal-events.jsonl"],
  ["agentreveal-events.1.jsonl", "agentreveal-events.1.jsonl"],
  ["agentreveal-events.", "agentreveal-events."],   // 兜底 sanitize.mjs 里临时前缀
  ["agentreveal-", "agentreveal-"],
  // ── 类型 / 类 / 加载函数名（驼峰）───────────────────────────
  ["AgentRevealConfig", "AgentRevealConfig"],
  ["loadAgentRevealConfig", "loadAgentRevealConfig"],
  // ── 程序名 + 产品名（最后兜底，必须最后跑）──────────────────
  ["AgentReveal", "AgentReveal"],
  ["agentreveal", "agentreveal"],
);

// -------------------------------------------------------------------------
// walker
// -------------------------------------------------------------------------

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (IGNORE_DIRS.has(entry)) continue;
      yield* walk(full);
    } else if (s.isFile()) {
      yield full;
    }
  }
}

function patch(text) {
  let out = text;
  for (const [from, to] of RULES) {
    if (!from) continue;
    out = out.split(from).join(to);
  }
  return out;
}

const relPath = (abs) => relative(ROOT, abs);

function main() {
  const plans = [];
  for (const abs of walk(ROOT)) {
    const rel = relPath(abs);
    if (WHITELIST_REL.has(rel)) continue;
    const ext = rel.includes(".") ? rel.slice(rel.lastIndexOf(".")) : "";
    if (!TEXT_EXTS.has(ext)) continue;
    let text;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const next = patch(text);
    if (next === text) continue;
    plans.push({ abs, rel, before: text, after: next });
  }

  if (!APPLY) {
    const byTop = new Map();
    for (const p of plans) {
      const segs = p.rel.split("/");
      const top = segs.length > 1 ? segs[0] : "<root>";
      byTop.set(top, (byTop.get(top) ?? 0) + 1);
    }
    console.log(`Dry-run：计划改动 ${plans.length} 个文件。`);
    for (const [k, n] of [...byTop.entries()].sort()) {
      console.log(`  ${k.padEnd(24)} ${n}`);
    }
    return;
  }

  for (const p of plans) {
    writeFileSync(p.abs, p.after, "utf8");
  }
  console.log(`Applied：改写了 ${plans.length} 个文件。`);
}

main();
