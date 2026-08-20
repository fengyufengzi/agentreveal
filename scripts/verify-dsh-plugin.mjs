#!/usr/bin/env node
/**
 * Networked DSH lifecycle verification. Everything is installed below one
 * disposable HOME/DSH_HOME; the user's profiles and AgentReveal state are never read.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DSH_VERSION = "0.1.0-rc.7";
const PNPM_VERSION = "11.7.0";
const OLD_TEST_VERSION = "0.0.7-pilot.0-dsh-test";
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const packageManifest = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8")
);
const npmCli = process.env.npm_execpath;

function fail(message) {
  throw new Error(`DSH 插件验证失败：${message}`);
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    stdio: options.stdio ?? "pipe",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.trim();
    fail(`${executable} ${args[0] ?? ""} 退出码 ${result.status}${detail ? `：${detail}` : ""}`);
  }
  return result;
}

function runNpm(args, options = {}) {
  return npmCli
    ? run(process.execPath, [npmCli, ...args], options)
    : run("npm", args, options);
}

function packCurrent(packDir) {
  const result = runNpm(["pack", "--json", "--pack-destination", packDir], {
    cwd: repoRoot,
  });
  const records = JSON.parse(result.stdout);
  if (!Array.isArray(records) || records.length !== 1) fail("npm pack 未返回唯一资产");
  return join(packDir, records[0].filename);
}

function buildOlderTarball(currentTarball, root, packDir) {
  const extractRoot = join(root, "old-package");
  mkdirSync(extractRoot, { recursive: true });
  run("tar", ["-xzf", currentTarball, "-C", extractRoot]);
  const packageRoot = join(extractRoot, "package");
  const manifestPath = join(packageRoot, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.version = OLD_TEST_VERSION;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const versionPath = join(packageRoot, "dist", "version.js");
  const versionSource = readFileSync(versionPath, "utf8");
  if (!versionSource.includes(packageManifest.version)) {
    fail("无法为升级测试定位旧版 PRODUCT_VERSION");
  }
  writeFileSync(
    versionPath,
    versionSource.replaceAll(packageManifest.version, OLD_TEST_VERSION)
  );
  const result = runNpm(
    ["pack", "--ignore-scripts", "--json", "--pack-destination", packDir],
    { cwd: packageRoot }
  );
  const records = JSON.parse(result.stdout);
  if (!Array.isArray(records) || records.length !== 1) fail("旧版测试包构建失败");
  return join(packDir, records[0].filename);
}

function readProfile(profileDir) {
  return JSON.parse(readFileSync(join(profileDir, "package.json"), "utf8"));
}

function assertInstalled(profileDir, expectedVersion) {
  const profile = readProfile(profileDir);
  const bundles = profile.dsh?.profile?.bundles ?? [];
  if (!Object.hasOwn(profile.dependencies ?? {}, "agentreveal")) {
    fail("profile 依赖中缺少 agentreveal");
  }
  if (bundles.filter((entry) => entry === "agentreveal").length !== 1) {
    fail("agentreveal bundle 未唯一加入 profile");
  }
  const installedRoot = realpathSync(join(profileDir, "node_modules", "agentreveal"));
  const installed = JSON.parse(
    readFileSync(join(installedRoot, "package.json"), "utf8")
  );
  if (installed.version !== expectedVersion) {
    fail(`安装版本不一致：期望 ${expectedVersion}，实际 ${installed.version}`);
  }
  for (const relative of [
    "dsh/plugin.js",
    "dsh/cordis.patch.yml",
    "dist/integrations/dsh-adapter.js",
    "bin/agentreveal",
  ]) {
    if (!existsSync(join(installedRoot, relative))) fail(`安装包缺少 ${relative}`);
  }
  return installedRoot;
}

async function freePort() {
  const server = createServer();
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string") fail("无法分配本地 smoke 端口");
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return address.port;
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolvePromise) => child.once("close", resolvePromise)),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function bootWeb(dshBin, env, cwd) {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [dshBin, "web", "--host", "127.0.0.1", "--port", String(port)],
    { cwd, env, shell: false, stdio: ["ignore", "pipe", "pipe"] }
  );
  let output = "";
  const collect = (chunk) => {
    if (output.length < 512 * 1024) output += chunk.toString("utf8");
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  try {
    await new Promise((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(
        () => rejectPromise(new Error(`DSH Web 启动超时：${output}`)),
        30_000
      );
      const poll = setInterval(() => {
        if (output.includes(`http://127.0.0.1:${port}`)) {
          clearInterval(poll);
          clearTimeout(timeout);
          resolvePromise();
        }
      }, 50);
      child.once("close", (code) => {
        clearInterval(poll);
        clearTimeout(timeout);
        rejectPromise(new Error(`DSH Web 提前退出 (${code})：${output}`));
      });
    });
    const response = await fetch(`http://127.0.0.1:${port}/`);
    if (!response.ok) fail(`DSH Web HTTP smoke 返回 ${response.status}`);
  } finally {
    await stopChild(child);
  }
}

function invokeInstalledCommand(installedRoot, env, project) {
  const pluginUrl = pathToFileURL(join(installedRoot, "dsh", "plugin.js")).href;
  const code = `
    const plugin = await import(${JSON.stringify(pluginUrl)});
    let definition;
    plugin.apply({ commands: { register(value) { definition = value; } } });
    const result = await definition.handler({
      rawInput: '',
      signal: new AbortController().signal,
    });
    process.stdout.write(JSON.stringify({ definition: {
      name: definition.name,
      recordInput: definition.recordInput,
    }, result }));
  `;
  const result = run(process.execPath, ["--input-type=module", "-e", code], {
    cwd: project,
    env,
  });
  const payload = JSON.parse(result.stdout);
  if (payload.definition?.name !== "agentreveal") fail("slash command 未注册");
  if (payload.definition?.recordInput !== false) fail("slash command 会记录输入");
  if (payload.result?.kind !== "success") fail("slash command 未成功完成只读检查");
  const serialized = JSON.stringify(payload);
  if (serialized.includes(env.HOME) || serialized.includes(env.XDG_CONFIG_HOME)) {
    fail("slash command 输出包含隔离环境路径");
  }
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-dsh-lifecycle-"));
  try {
    const home = join(root, "home");
    const dshHome = join(root, "dsh-home");
    const runtime = join(root, "runtime");
    const packDir = join(root, "packs");
    const project = join(root, "project");
    const xdgConfig = join(root, "xdg-config");
    const runtimeBin = join(runtime, "node_modules", ".bin");
    for (const dir of [home, dshHome, runtime, packDir, project, xdgConfig]) {
      mkdirSync(dir, { recursive: true });
    }
    const env = {
      ...process.env,
      HOME: home,
      DSH_HOME: dshHome,
      XDG_CONFIG_HOME: xdgConfig,
      XDG_DATA_HOME: join(root, "xdg-data"),
      XDG_CACHE_HOME: join(root, "xdg-cache"),
      npm_config_cache: join(root, "npm-cache"),
      PNPM_HOME: runtimeBin,
      PATH: `${runtimeBin}:${dirname(process.execPath)}:/usr/bin:/bin`,
      NO_COLOR: "1",
    };
    mkdirSync(join(xdgConfig, "opencode"), { recursive: true });
    writeFileSync(
      join(xdgConfig, "opencode", "opencode.json"),
      `${JSON.stringify({ permission: { bash: "ask", edit: "ask" } }, null, 2)}\n`
    );

    process.stdout.write("[1/6] 构建 AgentReveal 当前包与旧版升级夹具\n");
    const currentTarball = packCurrent(packDir);
    const oldTarball = buildOlderTarball(currentTarball, root, packDir);

    process.stdout.write("[2/6] 安装固定 DSH 与 pnpm 到隔离 runtime\n");
    runNpm(
      [
        "install",
        "--prefix",
        runtime,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        `@deepseek-ai/dsh@${DSH_VERSION}`,
        `pnpm@${PNPM_VERSION}`,
      ],
      { env }
    );
    const dshBin = join(runtimeBin, "dsh");
    run(process.execPath, [dshBin, "--version"], { env, cwd: project });

    process.stdout.write("[3/6] 安装旧版插件并验证 profile 激活\n");
    run(
      process.execPath,
      [dshBin, "plugin", "--profile", "web", "add", oldTarball],
      { env, cwd: project }
    );
    const profileDir = join(dshHome, "profiles", "web");
    assertInstalled(profileDir, OLD_TEST_VERSION);

    process.stdout.write("[4/6] 升级到当前包并验证配置与原生命令\n");
    run(
      process.execPath,
      [dshBin, "plugin", "--profile", "web", "add", currentTarball],
      { env, cwd: project }
    );
    const installedRoot = assertInstalled(profileDir, packageManifest.version);
    const dump = run(process.execPath, [dshBin, "web", "--dump-config"], {
      env,
      cwd: project,
    }).stdout;
    if (!dump.includes("agentreveal-command") || !dump.includes("agentreveal/dsh")) {
      fail("组合后的 web profile 缺少 AgentReveal row");
    }
    invokeInstalledCommand(installedRoot, env, project);

    process.stdout.write("[5/6] 启动 DSH Web 并完成本地 HTTP smoke\n");
    await bootWeb(dshBin, env, project);

    process.stdout.write("[6/6] 卸载并检查 bundle、依赖与本地状态残留\n");
    run(
      process.execPath,
      [dshBin, "plugin", "--profile", "web", "remove", "agentreveal"],
      { env, cwd: project }
    );
    const finalProfile = readProfile(profileDir);
    if (Object.hasOwn(finalProfile.dependencies ?? {}, "agentreveal")) {
      fail("卸载后 profile 仍含 agentreveal 依赖");
    }
    if ((finalProfile.dsh?.profile?.bundles ?? []).includes("agentreveal")) {
      fail("卸载后 profile 仍含 agentreveal bundle");
    }
    if (existsSync(join(profileDir, "node_modules", "agentreveal"))) {
      fail("卸载后 node_modules 仍含 agentreveal");
    }
    if (existsSync(join(home, ".agentreveal"))) {
      fail("只读 slash command 意外创建 AgentReveal 状态目录");
    }

    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: 1,
        dshVersion: DSH_VERSION,
        pnpmVersion: PNPM_VERSION,
        pluginVersion: packageManifest.version,
        install: true,
        upgrade: true,
        command: true,
        webBoot: true,
        uninstall: true,
        uploadsScanData: false,
      })}\n`
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

await main();
