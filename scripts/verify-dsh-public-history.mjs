#!/usr/bin/env node
/** Verify the staged release snapshot as a clean one-commit public history. */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd ?? repoRoot,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${options.label ?? args[0] ?? executable} 失败；扫描器原始输出已隐藏。`);
  }
  return result;
}

const root = mkdtempSync(join(tmpdir(), "agentreveal-public-history-"));
const candidate = join(root, "candidate");
try {
  mkdirSync(candidate, { recursive: true });
  run("git", ["checkout-index", "--all", `--prefix=${candidate}/`], {
    label: "导出暂存候选",
  });
  run("git", ["init", "--quiet"], { cwd: candidate, label: "初始化候选历史" });
  run("git", ["add", "--all"], { cwd: candidate, label: "暂存候选历史" });
  run(
    "git",
    [
      "-c",
      "user.name=AgentReveal Release",
      "-c",
      "user.email=noreply@users.noreply.github.com",
      "commit",
      "--quiet",
      "-m",
      "AgentReveal staged public candidate",
    ],
    { cwd: candidate, label: "创建单提交候选历史" }
  );
  run(process.execPath, [join(candidate, "scripts", "sanitize.mjs"), "--history"], {
    cwd: candidate,
    label: "候选历史内置 sanitizer",
  });
  run(
    "gitleaks",
    ["git", candidate, "--no-banner", "--no-color", "--redact=100", "--timeout=180"],
    { label: "候选历史独立 Gitleaks" }
  );
  process.stdout.write(
    `${JSON.stringify({
      schemaVersion: 1,
      source: "staged-snapshot",
      commitCount: 1,
      sanitizer: true,
      gitleaks: true,
      includesPrivateHistory: false,
      published: false,
    })}\n`
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
