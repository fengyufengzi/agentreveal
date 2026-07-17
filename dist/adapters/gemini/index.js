/**
 * Gemini CLI adapter — discovery + deepScan（D1 §4）。
 * discovery 只探测存在性；deepScan 解析 settings.json（MCP / 权限 / sandbox）
 * 与 .env（仅判存在），产出脱敏风险。
 */
import { dirname, join } from "node:path";
import { dirExists, fileExists } from "../../core/discovery/fs-utils.js";
import { parseGemini } from "./parse.js";
import { buildGeminiFindings } from "./risk.js";
export const geminiAdapter = {
    agent: "gemini",
    displayName: "Gemini CLI",
    async discover(ctx) {
        const notes = [];
        const xdg = ctx.env.XDG_CONFIG_HOME;
        const configDir = xdg
            ? join(xdg, "gemini")
            : join(ctx.home, ".gemini");
        const settingsPath = join(configDir, "settings.json");
        const envPath = join(configDir, ".env");
        const hasDir = dirExists(configDir);
        const hasSettings = fileExists(settingsPath);
        const credentialFilePresent = fileExists(envPath);
        if (credentialFilePresent) {
            notes.push("检测到 .env（凭证文件存在，未读取内容）");
        }
        if (hasDir && !hasSettings) {
            notes.push("检测到 Gemini 目录，但未发现 settings.json");
        }
        return {
            agent: this.agent,
            displayName: this.displayName,
            configFound: hasSettings,
            configPath: hasSettings ? settingsPath : undefined,
            credentialFilePresent,
            source: hasSettings ? (xdg ? "XDG_CONFIG_HOME" : "默认 ~/.gemini") : undefined,
            notes: notes.length ? notes : undefined,
        };
    },
    async deepScan(ctx, found) {
        if (!found.configFound || !found.configPath)
            return [];
        try {
            const data = parseGemini(found.configPath, dirname(found.configPath));
            return buildGeminiFindings(data, ctx.providerPolicy);
        }
        catch (err) {
            return [
                {
                    id: "GEMINI_PARSE_FAILED",
                    category: "compat",
                    severity: "info",
                    title: "Gemini CLI 配置解析失败",
                    description: "无法读取或解析 settings.json。",
                    evidence: { error: err instanceof Error ? err.message : String(err) },
                    recommendation: "确认配置文件为合法 JSON。",
                    fixable: false,
                },
            ];
        }
    },
};
//# sourceMappingURL=index.js.map