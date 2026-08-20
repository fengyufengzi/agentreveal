#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(import.meta.dirname, "..");
const output = resolve(
  process.argv[2] ?? join(repoRoot, "docs", "assets", "agentreveal-dsh-demo.mp4")
);
const poster = resolve(dirname(output), `${basename(output, extname(output))}-poster.png`);
const frameDir = mkdtempSync(join(tmpdir(), "agentreveal-dsh-demo-"));
const scenes = ["install", "start", "command", "scan", "result", "privacy", "details"];
const sceneSeconds = 6;
const transitionSeconds = 0.5;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    maxBuffer: 32 * 1024 * 1024,
    shell: false,
  });
  if (result.error?.code === "ENOENT") {
    throw new Error(`未找到 ${command}；请先安装生成 DSH Demo 所需工具。`);
  }
  if (result.status !== 0) throw new Error(`${command} 执行失败。`);
  return result;
}

function filterGraph() {
  const filters = scenes.map(
    (_, index) =>
      `[${index}:v]scale=1000:650:force_original_aspect_ratio=decrease,`
      + `pad=1000:650:(ow-iw)/2:(oh-ih)/2:color=0xeef3f0,`
      + `fps=24,format=yuv420p,setpts=PTS-STARTPTS[v${index}]`
  );
  let previous = "v0";
  for (let index = 1; index < scenes.length; index += 1) {
    const label = index === scenes.length - 1 ? "demo" : `x${index}`;
    filters.push(
      `[${previous}][v${index}]xfade=transition=fade:duration=${transitionSeconds}:`
      + `offset=${((sceneSeconds - transitionSeconds) * index).toFixed(1)}[${label}]`
    );
    previous = label;
  }
  return filters.join(";");
}

try {
  run(process.execPath, [
    join(repoRoot, "node_modules", "electron", "cli.js"),
    join(repoRoot, "scripts", "capture-dsh-demo.cjs"),
    frameDir,
  ]);
  for (const scene of scenes) {
    if (!existsSync(join(frameDir, `${scene}.png`))) throw new Error(`DSH Demo 场景缺失：${scene}`);
  }
  mkdirSync(dirname(output), { recursive: true });
  const args = ["-y"];
  for (const scene of scenes) {
    args.push("-loop", "1", "-t", String(sceneSeconds), "-i", join(frameDir, `${scene}.png`));
  }
  args.push(
    "-filter_complex",
    filterGraph(),
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
  run("ffmpeg", args);
  copyFileSync(join(frameDir, "install.png"), poster);
  const duration = Number(
    run(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", output],
      { capture: true }
    ).stdout.trim()
  );
  if (duration < 30 || duration > 60) throw new Error(`DSH Demo 时长不在 30–60 秒：${duration}`);
  console.log(`✓ DSH Demo 已生成：${output}（${duration.toFixed(1)} 秒）`);
  console.log(`✓ DSH Demo 封面已生成：${poster}`);
} finally {
  rmSync(frameDir, { recursive: true, force: true });
}
