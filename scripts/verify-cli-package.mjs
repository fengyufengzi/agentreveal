/** 验证当前 npm tarball 可在干净 prefix 安装，并可由本地 npx 执行。 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import packageJson from "../package.json" with { type: "json" };

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("无法定位当前 npm CLI；请通过 npm run package:verify-install 执行。");

function runNpm(args, options = {}) {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`npm ${args[0]} 失败（exit ${result.status}）：${result.stderr.trim()}`);
  }
  return result;
}

function parsePackResult(stdout) {
  const start = stdout.indexOf("[");
  if (start < 0) throw new Error("npm pack 未返回 JSON 文件清单。");
  const parsed = JSON.parse(stdout.slice(start));
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0].filename) {
    throw new Error("npm pack 返回了无法识别的文件清单。");
  }
  return parsed[0];
}

const root = mkdtempSync(join(tmpdir(), "agentguard-package-verify-"));
try {
  const packDir = join(root, "pack");
  const prefix = join(root, "prefix");
  const home = join(root, "home");
  const project = join(root, "project");
  const cache = join(root, "npm-cache");
  for (const directory of [packDir, prefix, home, project, cache]) {
    mkdirSync(directory, { recursive: true });
  }

  const packed = parsePackResult(
    runNpm(["pack", "--json", "--pack-destination", packDir], {
      cwd: resolve("."),
    }).stdout
  );
  const expectedFilename = `${packageJson.name.slice(1).replace("/", "-")}-${packageJson.version}.tgz`;
  assert.equal(packed.name, packageJson.name, "tarball package name must match package.json");
  assert.equal(packed.version, packageJson.version, "tarball version must match package.json");
  assert.equal(packed.filename, expectedFilename, "scoped tarball filename must remain stable");
  const tarball = join(packDir, packed.filename);
  const paths = packed.files.map((file) => file.path);
  assert.ok(paths.includes("bin/agentguard"), "tarball must include bin/agentguard");
  assert.ok(paths.includes("README.md"), "tarball must include the default Chinese README");
  assert.ok(paths.includes("README.en.md"), "tarball must include the English README");
  assert.ok(paths.some((path) => path.startsWith("dist/")), "tarball must include dist");
  assert.equal(paths.some((path) => path.startsWith("src/")), false, "tarball excludes src");
  assert.equal(paths.some((path) => path.startsWith("test/")), false, "tarball excludes tests");

  runNpm([
    "install",
    "--global",
    "--prefix",
    prefix,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--prefer-offline",
    tarball,
  ], { cwd: project, env: { ...process.env, HOME: home, npm_config_cache: cache } });

  const installedBin = join(prefix, "bin", "agentguard");
  const installedVersion = spawnSync(installedBin, ["--version"], {
    cwd: project,
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });
  assert.equal(installedVersion.status, 0, installedVersion.stderr);
  assert.equal(installedVersion.stdout.trim(), packageJson.version);

  const npxVersion = runNpm([
    "exec",
    "--yes",
    `--package=${tarball}`,
    "--",
    "agentguard",
    "--version",
  ], { cwd: project, env: { ...process.env, HOME: home, npm_config_cache: cache } });
  assert.equal(npxVersion.stdout.trim(), packageJson.version);

  console.log(`✓ tarball 清单、干净 prefix 安装和本地 npx 验证通过（${packageJson.version}）`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
