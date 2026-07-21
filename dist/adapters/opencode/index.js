/**
 * OpenCode adapter — discovery（D1 §5，v1.17.16 实测）。
 * 全局配置：XDG_CONFIG_HOME/opencode/opencode.json > ~/.config/opencode/opencode.json
 *          （默认不自动生成，用户建了才有）
 * 项目配置：<cwd>/opencode.json（与全局合并）
 * 密钥独立在 ~/.local/share/opencode/auth.json，config 内多为 {env:} 引用。
 */
import { join } from "node:path";
import { fileExists } from "../../core/discovery/fs-utils.js";
import { parseOpenCode } from "./parse.js";
import { buildOpenCodeFindings } from "./risk.js";
import { buildParseFailureFinding } from "../../core/parse-failure.js";
export const opencodeAdapter = {
    agent: "opencode",
    displayName: "OpenCode",
    async discover(ctx) {
        const notes = [];
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
        let configPath;
        let source;
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
    async deepScan(_ctx, found) {
        if (!found.configFound || !found.configPath)
            return [];
        try {
            const data = parseOpenCode(found.configPath);
            const findings = buildOpenCodeFindings(data, _ctx.providerPolicy);
            if (!data.configParsed) {
                findings.unshift(buildParseFailureFinding({
                    id: "OPENCODE_PARSE_FAILED",
                    displayName: this.displayName,
                    configPath: found.configPath,
                    format: "JSON",
                    reason: data.parseFailureReason ?? "JSON 文件无法读取或当前版本暂不兼容",
                }));
            }
            return findings;
        }
        catch (err) {
            return [buildParseFailureFinding({
                    id: "OPENCODE_PARSE_FAILED",
                    displayName: this.displayName,
                    configPath: found.configPath,
                    error: err,
                    format: "JSON",
                })];
        }
    },
};
//# sourceMappingURL=index.js.map