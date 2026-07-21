#!/usr/bin/env node

import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stagingDir = mkdtempSync(join(tmpdir(), 'agentguard-macos-release-'));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.platform !== 'darwin') {
  throw new Error('macOS 正式构建只能在 macOS 执行。');
}

console.log(`macOS 签名暂存目录：${stagingDir}`);

let completed = false;
try {
  run(join(repoRoot, 'node_modules', '.bin', 'electron-builder'), [
    '--mac',
    'dmg',
    '--arm64',
    '--config',
    'electron-builder.release.yml',
    `--config.directories.output=${stagingDir}`,
    '--publish',
    'never',
  ]);

  run(process.execPath, [
    join(repoRoot, 'scripts', 'verify-desktop-bundle.mjs'),
    join(stagingDir, 'mac-arm64', 'AgentGuard.app'),
  ]);
  run(process.execPath, [join(repoRoot, 'scripts', 'verify-macos-release.mjs'), stagingDir]);

  const dmgs = readdirSync(stagingDir).filter((name) => name.endsWith('.dmg'));
  if (dmgs.length !== 1) {
    throw new Error(`签名暂存目录必须且只能包含一个 DMG，当前找到 ${dmgs.length} 个。`);
  }

  const releaseDir = join(repoRoot, 'release');
  const destination = join(releaseDir, basename(dmgs[0]));
  mkdirSync(releaseDir, { recursive: true });
  copyFileSync(join(stagingDir, dmgs[0]), destination);
  run(process.execPath, [join(repoRoot, 'scripts', 'verify-macos-release.mjs'), destination]);

  completed = true;
  console.log(`✓ 已生成并复核正式 macOS 候选：${destination}`);
} finally {
  if (completed) {
    rmSync(stagingDir, { recursive: true, force: true });
  } else {
    console.error(`构建未完成，诊断产物保留在：${stagingDir}`);
  }
}
