#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const npmCli = process.env.npm_execpath;
const manifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

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
    throw new Error(`${options.label ?? args[0] ?? executable} 失败；外部工具原始输出已隐藏。`);
  }
  return result;
}

function runNpm(args, options = {}) {
  return npmCli
    ? run(process.execPath, [npmCli, ...args], options)
    : run("npm", args, options);
}

const root = mkdtempSync(join(tmpdir(), "agentreveal-dsh-candidate-"));
try {
  runNpm(["run", "build"], { label: "构建" });
  runNpm(["run", "release:verify-version", "--", manifest.version], {
    label: "联合版本检查",
  });
  runNpm(["run", "sanitize:package"], { label: "npm 包内置敏感信息检查" });
  const packed = runNpm(["pack", "--json", "--ignore-scripts", "--pack-destination", root], {
    label: "构建最终 npm tarball",
  });
  const records = JSON.parse(packed.stdout);
  if (!Array.isArray(records) || records.length !== 1) throw new Error("npm pack 未返回唯一资产。");
  const tarball = join(root, records[0].filename);
  run(
    process.execPath,
    [join(repoRoot, "scripts", "scan-release-assets.mjs"), "--tarball", tarball],
    { label: "最终 tarball 独立 Gitleaks 扫描" }
  );
  const digest = createHash("sha256").update(readFileSync(tarball)).digest("hex");
  process.stdout.write(
    `${JSON.stringify({
      schemaVersion: 1,
      version: manifest.version,
      package: manifest.name,
      dshBundle: manifest.dsh?.bundle?.patch === "./dsh/cordis.patch.yml",
      tarballScanned: true,
      sha256: digest,
      readyForJointCandidate: true,
      published: false,
    })}\n`
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
