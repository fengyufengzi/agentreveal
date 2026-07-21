#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(import.meta.dirname, "..");
const output = resolve(
  process.argv[2] ?? join(repoRoot, "docs", "assets", "agentguard-desktop-demo.mp4")
);
const poster = resolve(
  dirname(output),
  `${basename(output, extname(output))}-poster.png`
);
const frameDir = mkdtempSync(join(tmpdir(), "agentguard-desktop-demo-"));
const sceneNames = [
  "welcome",
  "workspace-top",
  "workspace-agent",
  "workspace-agent-detail",
  "workspace-agent-switch",
  "workspace-cross-agent",
  "workspace-remediation",
  "workspace-report-menu",
];
const sceneSeconds = 5.5;
const transitionSeconds = 0.6;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error?.code === "ENOENT") {
    throw new Error(`未找到 ${command}；请先安装生成 Demo 所需工具。`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} 执行失败。`);
  }
  return result;
}

function buildFilter() {
  const filters = sceneNames.map(
    (_, index) =>
      `[${index}:v]scale=1120:780:force_original_aspect_ratio=decrease,`
      + `pad=1120:780:(ow-iw)/2:(oh-ih)/2:color=0xf6f8f7,`
      + `fps=24,format=yuv420p,setpts=PTS-STARTPTS[v${index}]`
  );
  let previous = "v0";
  for (let index = 1; index < sceneNames.length; index += 1) {
    const outputLabel = index === sceneNames.length - 1 ? "demo" : `x${index}`;
    const offset = (sceneSeconds - transitionSeconds) * index;
    filters.push(
      `[${previous}][v${index}]xfade=transition=fade:duration=${transitionSeconds}:`
      + `offset=${offset.toFixed(1)}[${outputLabel}]`
    );
    previous = outputLabel;
  }
  return filters.join(";");
}

try {
  run(process.execPath, [
    join(repoRoot, "node_modules", "electron", "cli.js"),
    join(repoRoot, "scripts", "capture-desktop-preview.cjs"),
    frameDir,
  ]);

  for (const scene of sceneNames) {
    const path = join(frameDir, `${scene}.png`);
    if (!existsSync(path)) throw new Error(`Demo 场景缺失：${scene}`);
  }

  mkdirSync(dirname(output), { recursive: true });
  const ffmpegArgs = ["-y"];
  for (const scene of sceneNames) {
    ffmpegArgs.push(
      "-loop",
      "1",
      "-t",
      String(sceneSeconds),
      "-i",
      join(frameDir, `${scene}.png`)
    );
  }
  ffmpegArgs.push(
    "-filter_complex",
    buildFilter(),
    "-map",
    "[demo]",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-map_metadata",
    "-1",
    output
  );
  run("ffmpeg", ffmpegArgs);
  copyFileSync(join(frameDir, "welcome.png"), poster);

  const duration = run(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      output,
    ],
    { capture: true }
  ).stdout.trim();
  console.log(`✓ Desktop Demo 已生成：${output}（${Number(duration).toFixed(1)} 秒）`);
  console.log(`✓ Demo 封面已生成：${poster}`);
} finally {
  rmSync(frameDir, { recursive: true, force: true });
}
