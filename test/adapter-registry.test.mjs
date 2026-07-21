import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { adapters } from "../dist/adapters/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

test("adapter registry: runtime adapters and AgentId remain synchronized", () => {
  const types = readFileSync(join(repoRoot, "src", "adapters", "types.ts"), "utf8");
  const union = types.match(/export type AgentId\s*=([\s\S]*?);/)?.[1];
  assert.ok(union, "无法读取 AgentId union");
  const declared = [...union.matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1]);
  const registered = adapters.map((adapter) => adapter.agent);

  assert.equal(new Set(declared).size, declared.length, "AgentId 含重复项");
  assert.equal(new Set(registered).size, registered.length, "Adapter 注册表含重复项");
  assert.deepEqual(
    [...declared].sort(),
    [...registered, "workspace"].sort(),
    "新增或删除 Agent 时必须同步 AgentId、Adapter 注册表和 workspace 特例"
  );
});
