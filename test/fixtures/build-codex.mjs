/**
 * 构建临时 Codex 配置夹具（config.toml + 可选 auth.json）。
 * 仅供测试：写入临时目录，用完删除。
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * @param {object} opts
 * @param {string} opts.toml  config.toml 文本内容
 * @param {object} [opts.auth] auth.json 对象（省略则不写该文件）
 * @returns {{ configPath: string, baseDir: string, cleanup: () => void }}
 */
export function buildCodexDir(opts) {
  const dir = mkdtempSync(join(tmpdir(), "ag-codex-"));
  const configPath = join(dir, "config.toml");
  writeFileSync(configPath, opts.toml ?? "");
  if (opts.auth) {
    writeFileSync(join(dir, "auth.json"), JSON.stringify(opts.auth));
  }
  return {
    configPath,
    baseDir: dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
