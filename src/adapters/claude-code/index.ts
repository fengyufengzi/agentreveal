/**
 * Claude Code adapter — discovery（D1 §1）。
 * 路径优先级：CLAUDE_CONFIG_DIR > ~/.claude；另有全局状态 ~/.claude.json。
 * 密钥：OAuth 在 ~/.claude.json，或 settings.json env（不在此读取）。
 */
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  Adapter,
  AgentDiscovery,
  DiscoveryContext,
  RiskFinding,
} from "../types.js";
import { dirExists, fileExists } from "../../core/discovery/fs-utils.js";
import { parseClaudeCode } from "./parse.js";
import { buildClaudeCodeFindings } from "./risk.js";
import { buildParseFailureFinding } from "../../core/parse-failure.js";

export const claudeCodeAdapter: Adapter = {
  agent: "claude-code",
  displayName: "Claude Code",

  async discover(ctx: DiscoveryContext): Promise<AgentDiscovery> {
    const notes: string[] = [];
    const overrideDir = ctx.env.CLAUDE_CONFIG_DIR;
    const defaultDir = join(ctx.home, ".claude");

    let configPath: string | undefined;
    let source: string | undefined;

    if (overrideDir && dirExists(overrideDir)) {
      configPath = overrideDir;
      source = "CLAUDE_CONFIG_DIR";
      notes.push("使用 CLAUDE_CONFIG_DIR 覆盖（多环境隔离场景）");
    } else if (dirExists(defaultDir)) {
      configPath = defaultDir;
      source = "默认 ~/.claude";
    }

    // 全局状态文件（含 mcpServers / oauthAccount）——仅探测存在性。
    const globalJson = join(ctx.home, ".claude.json");
    const credentialFilePresent = fileExists(globalJson);
    if (credentialFilePresent) {
      notes.push("检测到 ~/.claude.json（含 MCP / OAuth，未读取内容）");
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
    ctx: DiscoveryContext,
    found: AgentDiscovery
  ): Promise<RiskFinding[]> {
    if (!found.configFound || !found.configPath) return [];
    try {
      const data = parseClaudeCode(found.configPath, ctx.home ?? homedir());
      return buildClaudeCodeFindings(data, ctx.providerPolicy);
    } catch (err) {
      return [buildParseFailureFinding({
        id: "CLAUDE_PARSE_FAILED",
        displayName: this.displayName,
        configPath: found.configPath,
        error: err,
        format: "JSON",
      })];
    }
  },
};
