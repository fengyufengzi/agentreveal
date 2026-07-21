import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

test("contribution infrastructure: repository contracts remain internally consistent", () => {
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, "scripts", "check-contribution.mjs")],
    { cwd: repoRoot, encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /贡献一致性检查通过/);
});

test("contribution infrastructure: package exposes one complete local gate", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  assert.equal(pkg.scripts["evals:check"], "node scripts/check-agent-evals.mjs");
  assert.equal(pkg.scripts["evals:preflight"], "node scripts/agent-eval-preflight.mjs");
  assert.equal(pkg.scripts["evals:result:check"], "node scripts/check-agent-eval-result.mjs");
  assert.match(pkg.scripts["check:repo"], /check-contribution/);
  assert.match(pkg.scripts["check:repo"], /evals:check/);
  assert.match(pkg.scripts.check, /sanitize/);
  assert.match(pkg.scripts.check, /sanitize:staged/);
  assert.match(pkg.scripts.check, /test/);
  assert.match(pkg.scripts.check, /check:repo/);
  assert.match(pkg.scripts.check, /git diff --exit-code -- dist/);
  assert.match(pkg.scripts.check, /sanitize:package/);
  assert.match(pkg.scripts["desktop:pack"], /build-local-macos-app/);
  assert.equal(pkg.scripts["desktop:bundle:verify"], "node scripts/verify-desktop-bundle.mjs");
});
