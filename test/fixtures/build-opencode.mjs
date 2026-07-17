/** 构建临时 OpenCode opencode.json 夹具。 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * @param {object} config  opencode.json 对象
 * @returns {{ configPath: string, cleanup: () => void }}
 */
export function buildOpenCodeConfig(config) {
  const dir = mkdtempSync(join(tmpdir(), "ag-opencode-"));
  const configPath = join(dir, "opencode.json");
  writeFileSync(configPath, JSON.stringify(config));
  return {
    configPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
