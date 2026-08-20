import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertNoSymbolicLinks,
  findAppBundles,
  parseReleaseAssetArgs,
  validateTarEntries,
} from "../scripts/scan-release-assets.mjs";
import { verifyReleaseVersion } from "../scripts/verify-release-version.mjs";
import packageJson from "../package.json" with { type: "json" };

test("release candidate: scoped npm 包保持 agentreveal 可执行命令", () => {
  assert.equal(packageJson.name, "agentreveal");
  assert.equal(packageJson.version, "0.0.7-pilot.2");
  assert.equal(packageJson.bin.agentreveal, "bin/agentreveal");
});

test("release assets: 参数必须显式区分最终 tarball 与 DMG", () => {
  assert.deepEqual(parseReleaseAssetArgs([
    "--tarball",
    "/tmp/agentreveal.tgz",
    "--dmg",
    "/tmp/AgentReveal.dmg",
  ]), {
    help: false,
    assets: [
      { kind: "tarball", path: "/tmp/agentreveal.tgz" },
      { kind: "dmg", path: "/tmp/AgentReveal.dmg" },
    ],
  });
  assert.throws(() => parseReleaseAssetArgs([]), /至少提供/);
  assert.throws(
    () => parseReleaseAssetArgs(["--dmg", "/tmp/a.dmg", "--dmg", "/tmp/b.dmg"]),
    /一次只能扫描一个/
  );
});

test("release candidate: 版本必须与 package.json 和版本化说明一致", () => {
  // DSH 只读候选冻结为 0.0.7-pilot.2，CLI/Desktop/插件共用同一版本。
  assert.deepEqual(verifyReleaseVersion("0.0.7-pilot.2"), {
    version: "0.0.7-pilot.2",
    notes: join(process.cwd(), "docs", "release-0.0.7-pilot.2.md"),
  });
  assert.throws(() => verifyReleaseVersion("0.0.5"), /pilot/);
  assert.throws(() => verifyReleaseVersion("0.0.6-pilot.1"), /不一致/);
});

test("release assets: 解包后的资产拒绝符号链接", () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-release-assets-links-"));
  try {
    writeFileSync(join(root, "regular.txt"), "synthetic\n");
    assert.doesNotThrow(() => assertNoSymbolicLinks(root));
    symlinkSync("regular.txt", join(root, "linked.txt"));
    assert.throws(() => assertNoSymbolicLinks(root), /符号链接/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release assets: tarball 解包前拒绝绝对路径与路径穿越", () => {
  assert.doesNotThrow(() => validateTarEntries([
    "package/package.json",
    "package/dist/cli.js",
  ]));
  assert.throws(() => validateTarEntries(["../outside"]), /越界/);
  assert.throws(() => validateTarEntries(["/absolute/path"]), /越界/);
  assert.throws(() => validateTarEntries(["C:\\outside"]), /越界/);
});

test("release assets: DMG 只接受唯一真实 app 目录并跳过符号链接", () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-release-assets-test-"));
  try {
    mkdirSync(join(root, "AgentReveal.app", "Contents"), { recursive: true });
    mkdirSync(join(root, "nested"), { recursive: true });
    assert.deepEqual(findAppBundles(root), [join(root, "AgentReveal.app")]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
