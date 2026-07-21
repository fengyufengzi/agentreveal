import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

test("agent evals: cold-start tasks remain valid and do not leak repository answers", () => {
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, "scripts", "check-agent-evals.mjs")],
    { cwd: repoRoot, encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /AI 冷启动评测定义通过/);
});
