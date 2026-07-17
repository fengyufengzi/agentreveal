/**
 * 构建临时 Claude Code 配置夹具。
 * configDir 内写 settings.json / settings.local.json；home 内写 .claude.json。
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * @param {object} opts
 * @param {object} [opts.settings] settings.json 对象
 * @param {object} [opts.settingsLocal] settings.local.json 对象
 * @param {object} [opts.globalState] ~/.claude.json 对象
 * @returns {{ configDir: string, home: string, cleanup: () => void }}
 */
export function buildClaudeDir(opts = {}) {
  const home = mkdtempSync(join(tmpdir(), "ag-claude-home-"));
  const configDir = join(home, ".claude");
  mkdirSync(configDir, { recursive: true });

  if (opts.settings)
    writeFileSync(join(configDir, "settings.json"), JSON.stringify(opts.settings));
  if (opts.settingsLocal)
    writeFileSync(join(configDir, "settings.local.json"), JSON.stringify(opts.settingsLocal));
  if (opts.globalState)
    writeFileSync(join(home, ".claude.json"), JSON.stringify(opts.globalState));

  return {
    configDir,
    home,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}
