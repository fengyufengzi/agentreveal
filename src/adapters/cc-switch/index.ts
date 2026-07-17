/**
 * CC Switch adapter — discovery（D1 §3）。
 * 关键：当前版本用 SQLite ~/.cc-switch/cc-switch.db（user_version=10），
 *       旧版为 ~/.cc-switch/config.json。两者都要认，并标注格式。
 * 内置反向代理（proxy_config）在 deepScan 阶段处理，此处仅发现。
 */
import { join } from "node:path";
import type {
  Adapter,
  AgentDiscovery,
  DiscoveryContext,
  RiskFinding,
} from "../types.js";
import { dirExists, fileExists } from "../../core/discovery/fs-utils.js";
import { parseCcSwitchDb } from "./parse.js";
import { buildCcSwitchFindings } from "./risk.js";

export const ccSwitchAdapter: Adapter = {
  agent: "cc-switch",
  displayName: "CC Switch",

  async discover(ctx: DiscoveryContext): Promise<AgentDiscovery> {
    const notes: string[] = [];
    const baseDir = join(ctx.home, ".cc-switch");

    if (!dirExists(baseDir)) {
      return {
        agent: this.agent,
        displayName: this.displayName,
        configFound: false,
      };
    }

    const dbPath = join(baseDir, "cc-switch.db");
    const legacyJson = join(baseDir, "config.json");

    let configPath: string | undefined;
    let source: string | undefined;

    if (fileExists(dbPath)) {
      configPath = dbPath;
      source = "SQLite（新版）";
      notes.push("配置存于 SQLite，需 SQLite 读取 + 版本兼容（见 D1 §3）");
    } else if (fileExists(legacyJson)) {
      configPath = legacyJson;
      source = "config.json（旧版）";
      notes.push("检测到旧版 JSON 配置");
    }

    // 密钥内嵌在 providers.settings_config，此处不读取。
    return {
      agent: this.agent,
      displayName: this.displayName,
      configFound: configPath !== undefined,
      configPath,
      source,
      notes: notes.length ? notes : undefined,
    };
  },

  async deepScan(
    _ctx: DiscoveryContext,
    found: AgentDiscovery
  ): Promise<RiskFinding[]> {
    // 仅深解析新版 SQLite；旧版 JSON 暂不在本次范围。
    if (!found.configFound || !found.configPath?.endsWith(".db")) {
      return [];
    }
    try {
      const data = parseCcSwitchDb(found.configPath);
      return buildCcSwitchFindings(data, _ctx.providerPolicy);
    } catch (err) {
      // 解析失败降级为一条 info，不阻断整体扫描。
      return [
        {
          id: "CCSWITCH_PARSE_FAILED",
          category: "compat",
          severity: "info",
          title: "CC Switch 配置解析失败",
          description:
            "无法读取或解析 cc-switch.db，可能因 schema 变化或文件被占用。",
          evidence: { error: err instanceof Error ? err.message : String(err) },
          recommendation: "确认 CC Switch 未损坏；如持续失败请反馈 schema 版本。",
          fixable: false,
        },
      ];
    }
  },
};
