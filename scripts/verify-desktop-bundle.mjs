#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} 执行失败：${(result.stderr || result.stdout || '未知错误').trim()}`);
  }
  return result.stdout.trim();
}

function plistValue(infoPath, key) {
  const result = spawnSync('plutil', ['-extract', key, 'raw', '-o', '-', infoPath], {
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

async function verifyLaunchWithoutNode(executable) {
  const home = mkdtempSync(join(tmpdir(), 'agentreveal-desktop-smoke-'));
  const child = spawn(executable, [], {
    cwd: home,
    env: {
      HOME: home,
      PATH: '/usr/bin:/bin',
      TMPDIR: tmpdir(),
      XDG_CONFIG_HOME: join(home, '.config'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  const exitPromise = new Promise((resolveExit) => {
    if (child.exitCode !== null) resolveExit();
    else child.once('exit', resolveExit);
  });

  try {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2500));
    assert.equal(
      child.exitCode,
      null,
      `应用在无 Node/全局 CLI 的隔离环境中提前退出：${stderr.trim() || '无错误输出'}`,
    );
    assert.equal(
      child.signalCode,
      null,
      `应用在无 Node/全局 CLI 的隔离环境中被 ${child.signalCode} 终止：${stderr.trim() || '无错误输出'}`,
    );
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM');
    await exitPromise;
    rmSync(home, { recursive: true, force: true });
  }
}

if (process.platform !== 'darwin') {
  throw new Error('macOS Desktop bundle 验证只能在 macOS 执行。');
}

const appPath = resolve(process.argv[2] ?? 'release/mac-arm64/AgentReveal.app');
const contents = join(appPath, 'Contents');
const executable = join(contents, 'MacOS', 'AgentReveal');
const infoPath = join(contents, 'Info.plist');
const asarPath = join(contents, 'Resources', 'app.asar');

for (const path of [appPath, executable, infoPath, asarPath]) {
  assert.equal(existsSync(path), true, `Desktop bundle 缺少：${path}`);
}

const binaryType = run('file', [executable]);
assert.match(binaryType, /Mach-O 64-bit executable arm64/u, 'Desktop 首发包必须是 Apple Silicon arm64');

const dependencies = run('otool', ['-L', executable]);
assert.match(dependencies, /Electron Framework\.framework\/Electron Framework/u);
assert.doesNotMatch(dependencies, /(?:^|\/)node(?:\.|\/|$)|libnode/imu, 'Desktop 不得依赖外部 Node.js');

run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);

assert.equal(plistValue(infoPath, 'CFBundleIdentifier'), 'app.reveal.desktop');
assert.equal(plistValue(infoPath, 'LSMinimumSystemVersion'), '12.0');
for (const key of [
  'NSAppTransportSecurity',
  'NSAudioCaptureUsageDescription',
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
]) {
  assert.equal(plistValue(infoPath, key), undefined, `Desktop 不应声明无关权限或宽泛网络例外：${key}`);
}

const asarCli = resolve('node_modules/@electron/asar/bin/asar.js');
assert.equal(existsSync(asarCli), true, '缺少本地 @electron/asar，无法验证打包内容');
const asarList = run(process.execPath, [asarCli, 'list', asarPath]);
for (const entry of ['/bin/agentreveal', '/desktop/main.cjs', '/dist/cli.js', '/package.json']) {
  assert.equal(asarList.split('\n').includes(entry), true, `app.asar 缺少运行入口：${entry}`);
}

await verifyLaunchWithoutNode(executable);

console.log('✓ Desktop bundle 验证通过（arm64、macOS 12+、无外部 Node、无无关隐私权限、隔离启动成功）');
