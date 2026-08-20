/** 构建临时 OpenClaw 配置夹具（openclaw.json + 可选 service-env）。 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * @param {object} opts
 * @param {object} [opts.config] openclaw.json 对象
 * @param {string} [opts.configText] 原始 openclaw.json，用于损坏配置场景
 * @param {boolean} [opts.serviceEnv=false] 是否创建 service-env 文件
 * @returns {{ home: string, configDir: string, configPath: string, cleanup: () => void }}
 */
export function buildOpenClawDir(opts = {}) {
  const home = mkdtempSync(join(tmpdir(), "ag-openclaw-home-"));
  const configDir = join(home, ".openclaw");
  const configPath = join(configDir, "openclaw.json");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    configPath,
    opts.configText ?? JSON.stringify(opts.config ?? {})
  );
  if (opts.serviceEnv) {
    const serviceEnvDir = join(configDir, "service-env");
    mkdirSync(serviceEnvDir, { recursive: true });
    writeFileSync(join(serviceEnvDir, "openclaw.gateway.env"), "# synthetic fixture\n");
  }
  return {
    home,
    configDir,
    configPath,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}
