/**
 * OpenCode adapter — discovery（D1 §5，v1.17.16 实测）。
 * 全局配置：XDG_CONFIG_HOME/opencode/opencode.json > ~/.config/opencode/opencode.json
 *          （默认不自动生成，用户建了才有）
 * 项目配置：<cwd>/opencode.json（与全局合并）
 * 密钥独立在 ~/.local/share/opencode/auth.json，config 内多为 {env:} 引用。
 */
import { join } from "node:path";
import type {
  Adapter,
  AgentDiscovery,
  DiscoveryContext,
  RiskFinding,
} from "../types.js";
import { fileExists } from "../../core/discovery/fs-utils.js";
import { parseOpenCode } from "./parse.js";
import { buildOpenCodeFindings } from "./risk.js";

export const opencodeAdapter: Adapter = {
  agent: "opencode",
  displayName: "OpenCode",

  async discover(ctx: DiscoveryContext): Promise<AgentDiscovery> {
    const notes: string[] = [];
    const xdg = ctx.env.XDG_CONFIG_HOME;
    const globalDir = xdg
      ? join(xdg, "opencode")
      : join(ctx.home, ".config", "opencode");
    const globalConfig = join(globalDir, "opencode.json");
    const projectConfig = join(ctx.cwd, "opencode.json");

    const hasGlobal = fileExists(globalConfig);
    const hasProject = fileExists(projectConfig);

    // 数据目录（含 auth.json / opencode.db）——凭证探测，判断"用过没"。
    const credFile = join(ctx.home, ".local", "share", "opencode", "auth.json");
    const credentialFilePresent = fileExists(credFile);

    let configPath: string | undefined;
    let source: string | undefined;
    if (hasGlobal) {
      configPath = globalConfig;
      source = xdg ? "XDG_CONFIG_HOME" : "默认 ~/.config/opencode";
    }
    if (hasProject) {
      notes.push(`项目级配置：${projectConfig}（与全局合并）`);
      if (!configPath) {
        configPath = projectConfig;
        source = "项目级 opencode.json";
      }
    }
    if (credentialFilePresent) {
      notes.push("检测到 auth.json（密钥独立存放，未读取内容）");
    }

    return {
      agent: this.agent,
      displayName: this.displayName,
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
      const data = parseOpenCode(found.configPath);
      return buildOpenCodeFindings(data, _ctx.providerPolicy);
    } catch (err) {
      return [
        {
          id: "OPENCODE_PARSE_FAILED",
          category: "compat",
          severity: "info",
          title: "OpenCode 配置解析失败",
          description: "无法读取或解析 opencode.json。",
          evidence: { error: err instanceof Error ? err.message : String(err) },
          recommendation: "确认 opencode.json 为合法 JSON。",
          fixable: false,
        },
      ];
    }
  },
};
