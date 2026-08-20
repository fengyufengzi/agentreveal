import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const source = readFileSync(
  join(repoRoot, "scripts", "verify-dsh-plugin.mjs"),
  "utf8"
);

test("dsh lifecycle: 固定官方版本并隔离 HOME/DSH_HOME", () => {
  assert.match(source, /const DSH_VERSION = "0\.1\.0-rc\.7"/);
  assert.match(source, /const PNPM_VERSION = "11\.7\.0"/);
  assert.match(source, /HOME: home/);
  assert.match(source, /DSH_HOME: dshHome/);
  assert.match(source, /XDG_CONFIG_HOME: xdgConfig/);
  assert.match(source, /dirname\(process\.execPath\)/);
  assert.doesNotMatch(source, /shell:\s*true/);
});

test("dsh lifecycle: 覆盖安装、升级、原生命令、Web 启动和卸载残留", () => {
  for (const marker of [
    "OLD_TEST_VERSION",
    '"--dump-config"',
    "invokeInstalledCommand",
    "bootWeb",
    '"remove", "agentreveal"',
    'existsSync(join(home, ".agentreveal"))',
  ]) {
    assert.ok(source.includes(marker), `缺少生命周期验证：${marker}`);
  }
});
