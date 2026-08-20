import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

test("dsh demo: 只使用合成场景并强制 30–60 秒与去元数据", () => {
  const capture = readFileSync(join(repoRoot, "scripts", "capture-dsh-demo.cjs"), "utf8");
  const builder = readFileSync(join(repoRoot, "scripts", "build-dsh-demo.mjs"), "utf8");
  assert.match(capture, /@deepseek-ai\/dsh@0\.1\.0-rc\.7/);
  assert.match(capture, /OPENCODE_PLAINTEXT_KEY/);
  assert.match(capture, /不上传扫描内容/);
  assert.doesNotMatch(capture, /scanMachine|scanProject|selectProject|homedir\(/);
  assert.match(builder, /agentreveal-dsh-demo\.mp4/);
  assert.match(builder, /duration < 30 \|\| duration > 60/);
  assert.match(builder, /-map_metadata/);
});

test("dsh candidate: 同包版本、package sanitizer、最终 tarball Gitleaks 与未发布状态", () => {
  const source = readFileSync(
    join(repoRoot, "scripts", "verify-dsh-release-candidate.mjs"),
    "utf8"
  );
  assert.match(source, /release:verify-version/);
  assert.match(source, /sanitize:package/);
  assert.match(source, /scan-release-assets\.mjs/);
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /published: false/);
  assert.doesNotMatch(source, /npm publish|gh release|git tag/);
});

test("dsh public history: 只扫描暂存快照的单提交候选，不携带私有历史", () => {
  const source = readFileSync(
    join(repoRoot, "scripts", "verify-dsh-public-history.mjs"),
    "utf8"
  );
  assert.match(source, /checkout-index/);
  assert.match(source, /sanitize\.mjs.*--history/s);
  assert.match(source, /"gitleaks"/);
  assert.match(source, /includesPrivateHistory: false/);
  assert.match(source, /published: false/);
  assert.doesNotMatch(source, /push|remote add|npm publish|gh release|git tag/);
});
