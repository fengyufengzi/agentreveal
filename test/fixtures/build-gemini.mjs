/** 构建临时 Gemini CLI 配置夹具（settings.json + 可选 .env）。 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * @param {object} opts
 * @param {object} [opts.settings] settings.json 对象
 * @param {string} [opts.settingsText] 原始 settings.json，用于损坏配置场景
 * @param {string} [opts.envText] .env 内容
 * @returns {{ home: string, configDir: string, settingsPath: string, cleanup: () => void }}
 */
export function buildGeminiDir(opts = {}) {
  const home = mkdtempSync(join(tmpdir(), "ag-gemini-home-"));
  const configDir = join(home, ".gemini");
  const settingsPath = join(configDir, "settings.json");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    settingsPath,
    opts.settingsText ?? JSON.stringify(opts.settings ?? {})
  );
  if (opts.envText !== undefined) {
    writeFileSync(join(configDir, ".env"), opts.envText);
  }
  return {
    home,
    configDir,
    settingsPath,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}
