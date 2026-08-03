/**
 * Codex adapter — discovery（D1 §2）。
 * 路径优先级：CODEX_HOME > ~/.codex；主配置 config.toml（TOML）。
 * 密钥独立在 ~/.codex/auth.json —— 只探测存在性，判断"是否已配置"无需读值。
 */
import { dirname, join } from "node:path";
import type {
  Adapter,
  AgentDiscovery,
  DiscoveryContext,
  RiskFinding,
} from "../types.js";
import { dirExists, fileExists } from "../../core/discovery/fs-utils.js";
import { parseCodex } from "./parse.js";
import { buildCodexFindings } from "./risk.js";
import { buildParseFailureFinding } from "../../core/parse-failure.js";
import { buildCodexEffectiveState } from "./posture.js";

export const codexAdapter: Adapter = {
  agent: "codex",
  displayName: "Codex",

  async discover(ctx: DiscoveryContext): Promise<AgentDiscovery> {
    const notes: string[] = [];
    const overrideDir = ctx.env.CODEX_HOME;
    const defaultDir = join(ctx.home, ".codex");

    let baseDir: string | undefined;
    let source: string | undefined;

    if (overrideDir && dirExists(overrideDir)) {
      baseDir = overrideDir;
      source = "CODEX_HOME";
    } else if (dirExists(defaultDir)) {
      baseDir = defaultDir;
      source = "默认 ~/.codex";
    }

    let configPath: string | undefined;
    let credentialFilePresent = false;
    if (baseDir) {
      const toml = join(baseDir, "config.toml");
      if (fileExists(toml)) configPath = toml;
      credentialFilePresent = fileExists(join(baseDir, "auth.json"));
      if (credentialFilePresent) {
        notes.push("检测到 auth.json（密钥独立存放，未读取内容）");
      }
    }

    return {
      agent: this.agent,
      displayName: this.displayName,
      // 目录在但缺 config.toml 时，仍视为"发现痕迹"，但 configFound 以主配置为准。
      configFound: configPath !== undefined,
      configPath,
      credentialFilePresent,
      source,
      notes: notes.length ? notes : undefined,
    };
  },

  async deepScan(
    _ctx: DiscoveryContext,
    found: AgentDiscovery
  ): Promise<RiskFinding[]> {
    if (!found.configFound || !found.configPath) return [];
    try {
      const data = parseCodex(found.configPath, dirname(found.configPath));
      const findings = buildCodexFindings(data, _ctx.providerPolicy);
      if (!data.configParsed) {
        findings.unshift(buildParseFailureFinding({
          id: "CODEX_PARSE_FAILED",
          displayName: this.displayName,
          configPath: found.configPath,
          format: "TOML",
          reason: data.parseFailureReason ?? "TOML 文件无法读取或当前版本暂不兼容",
        }));
      }
      return findings;
    } catch (err) {
      return [buildParseFailureFinding({
        id: "CODEX_PARSE_FAILED",
        displayName: this.displayName,
        configPath: found.configPath,
        error: err,
        format: "TOML",
      })];
    }
  },

  async inspectPosture(ctx, found) {
    const findings = await this.deepScan!(ctx, found);
    return {
      state: buildCodexEffectiveState({
        baseDir: dirname(found.configPath!),
        configPath: found.configPath!,
        cwd: ctx.cwd,
        env: ctx.env,
        findings,
        providerPolicy: ctx.providerPolicy,
        ...(process.platform === "win32"
          ? {}
          : { systemConfigPath: "/etc/codex/config.toml" }),
      }),
    };
  },
};
