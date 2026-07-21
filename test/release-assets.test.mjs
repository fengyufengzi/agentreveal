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

test("release assets: 参数必须显式区分最终 tarball 与 DMG", () => {
  assert.deepEqual(parseReleaseAssetArgs([
    "--tarball",
    "/tmp/agentguard.tgz",
    "--dmg",
    "/tmp/AgentGuard.dmg",
  ]), {
    help: false,
    assets: [
      { kind: "tarball", path: "/tmp/agentguard.tgz" },
      { kind: "dmg", path: "/tmp/AgentGuard.dmg" },
    ],
  });
  assert.throws(() => parseReleaseAssetArgs([]), /至少提供/);
  assert.throws(
    () => parseReleaseAssetArgs(["--dmg", "/tmp/a.dmg", "--dmg", "/tmp/b.dmg"]),
    /一次只能扫描一个/
  );
});

test("release candidate: 版本必须与 package.json 和版本化说明一致", () => {
  assert.deepEqual(verifyReleaseVersion("0.0.5-pilot.2"), {
    version: "0.0.5-pilot.2",
    notes: join(process.cwd(), "docs", "release-0.0.5-pilot.2.md"),
  });
  assert.throws(() => verifyReleaseVersion("0.0.5"), /pilot/);
  assert.throws(() => verifyReleaseVersion("0.0.5-pilot.1"), /不一致/);
});

test("release assets: 解包后的资产拒绝符号链接", () => {
  const root = mkdtempSync(join(tmpdir(), "agentguard-release-assets-links-"));
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
  const root = mkdtempSync(join(tmpdir(), "agentguard-release-assets-test-"));
  try {
    mkdirSync(join(root, "AgentGuard.app", "Contents"), { recursive: true });
    mkdirSync(join(root, "nested"), { recursive: true });
    assert.deepEqual(findAppBundles(root), [join(root, "AgentGuard.app")]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
