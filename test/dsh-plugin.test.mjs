import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { apply, inject, name } from "../dsh/plugin.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const manifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

test("dsh plugin: package 声明同包 bundle 与稳定子路径", () => {
  assert.deepEqual(manifest.exports, {
    "./dsh": "./dsh/plugin.js",
    "./package.json": "./package.json",
  });
  assert.deepEqual(manifest.dsh, {
    bundle: { patch: "./dsh/cordis.patch.yml" },
  });
  assert.ok(manifest.files.includes("dsh"));
  assert.equal(name, "agentreveal-command");
  assert.deepEqual(inject, ["commands"]);
});

test("dsh plugin: Cordis patch 只挂载固定 server-side 子路径", () => {
  const patch = readFileSync(join(repoRoot, "dsh", "cordis.patch.yml"), "utf8");
  const activePatch = patch
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  assert.match(patch, /id: agentreveal-command/);
  assert.match(patch, /name: agentreveal\/dsh/);
  assert.doesNotMatch(activePatch, /!!js|shell|mcp|client\s*:/i);
});

test("dsh plugin: 注册原生 /agentreveal 且不记录命令输入", async () => {
  let definition;
  apply({
    commands: {
      register(value) {
        definition = value;
      },
    },
  });
  assert.deepEqual(
    {
      name: definition.name,
      description: definition.description,
      recordInput: definition.recordInput,
    },
    {
      name: "agentreveal",
      description: "run a local read-only AgentReveal security check",
      recordInput: false,
    }
  );
  assert.deepEqual(
    await definition.handler({
      rawInput: " --unexpected",
      signal: new AbortController().signal,
    }),
    {
      kind: "error",
      text: "用法：/agentreveal（当前只支持无参数的本地只读检查）。",
    }
  );
});

test("dsh plugin: 不兼容的 host API 在启动阶段明确失败", () => {
  assert.throws(
    () => apply({}),
    /requires @deepseek-ai\/dsh 0\.1\.0-rc\.7 command registry/
  );
  assert.throws(
    () => apply({ commands: { register: true } }),
    /requires @deepseek-ai\/dsh 0\.1\.0-rc\.7 command registry/
  );
});
