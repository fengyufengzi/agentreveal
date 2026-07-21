#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

function commandOutput(runner, command, args, cwd, env) {
  const result = runner(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw new Error(`${command} 不可执行：${result.error.code || result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "未知错误").trim();
    throw new Error(`${command} ${args.join(" ")} 失败：${detail}`);
  }
  return String(result.stdout || "").trim();
}

function defaultCodexCommand(env) {
  if (env.AGENTGUARD_EVAL_CODEX_PATH) return env.AGENTGUARD_EVAL_CODEX_PATH;
  const desktopCodex = "/Applications/ChatGPT.app/Contents/Resources/codex";
  return existsSync(desktopCodex) ? desktopCodex : "codex";
}

export function collectAgentEvalPreflight({
  cwd = repoRoot,
  env = process.env,
  runner = spawnSync,
  commands = {},
} = {}) {
  const tools = {
    node: commands.node || process.execPath,
    npm: commands.npm || "npm",
    git: commands.git || "git",
    codex: commands.codex || defaultCodexCommand(env),
  };

  const nodeVersion = commandOutput(runner, tools.node, ["--version"], cwd, env);
  const nodeMajor = Number.parseInt(nodeVersion.replace(/^v/, "").split(".")[0], 10);
  assert.ok(Number.isInteger(nodeMajor) && nodeMajor >= 22, "AI 评测需要 Node.js 22 或更高版本");

  const npmVersion = commandOutput(runner, tools.npm, ["--version"], cwd, env);
  const gitVersion = commandOutput(runner, tools.git, ["--version"], cwd, env);
  const codexVersion = commandOutput(runner, tools.codex, ["--version"], cwd, env);
  assert.equal(
    commandOutput(runner, tools.git, ["rev-parse", "--is-inside-work-tree"], cwd, env),
    "true",
    "必须在 Git worktree 中运行 AI 评测"
  );
  const baselineCommit = commandOutput(runner, tools.git, ["rev-parse", "HEAD"], cwd, env);
  assert.match(baselineCommit, /^[a-f0-9]{40}$/, "无法解析干净的评测基线 commit");
  const dirty = commandOutput(
    runner,
    tools.git,
    ["status", "--porcelain=v1", "--untracked-files=all"],
    cwd,
    env
  );
  if (dirty !== "") {
    throw new Error("评测基线必须是干净 worktree；请先提交或移走本地修改");
  }
  commandOutput(
    runner,
    tools.node,
    [join(repoRoot, "scripts", "check-agent-evals.mjs")],
    cwd,
    env
  );

  return {
    baselineCommit,
    tools: { node: nodeVersion, npm: npmVersion, git: gitVersion, codex: codexVersion },
  };
}

function isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    const result = collectAgentEvalPreflight();
    console.log("✓ AI 冷启动评测预检通过");
    console.log(`  基线：${result.baselineCommit.slice(0, 12)}`);
    console.log(`  Node ${result.tools.node} · npm ${result.tools.npm}`);
    console.log(`  ${result.tools.git} · ${result.tools.codex}`);
  } catch (error) {
    console.error(`✗ AI 冷启动评测预检失败：${error.message}`);
    console.error("  修复上方问题后重试；若工具不可用，请确认新终端/Codex 已加载 ~/.zprofile。");
    process.exitCode = 1;
  }
}
