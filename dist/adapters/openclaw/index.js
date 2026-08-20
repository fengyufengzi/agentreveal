/**
 * OpenClaw adapter — 2026-07-11 新增（P1，PRD/立项均点名 OpenClaw 支持）。
 *
 * 范围（与 Gemini adapter 一致的保守发现层 + 浅度 deepScan）：
 * - discover(): 探测 ~/.openclaw/openclaw.json 与 service-env/ 存在性
 * - deepScan(): 解析 openclaw.json，识别明文 secret / 暴露 bind / workspace 冲突 / 未知插件源
 *
 * 隐私约束：
 * - 不读取 service-env 中任何凭据内容
 * - evidence 仅含字段名、路径、计数、是否存在的布尔，绝不含 secret 值
 */
import { join } from "node:path";
import { existsSync, statSync } from "node:fs";
import { parseOpenClaw } from "./parse.js";
import { buildOpenClawFindings } from "./risk.js";
import { buildParseFailureFinding } from "../../core/parse-failure.js";
export const openclawAdapter = {
    agent: "openclaw",
    displayName: "OpenClaw",
    async discover(ctx) {
        const notes = [];
        // 配置覆盖变量优先（与 Codex/Claude 一致）。
        const override = ctx.env.OPENCLAW_HOME;
        const home = override?.trim() || join(ctx.home, ".openclaw");
        const configPath = join(home, "openclaw.json");
        const serviceEnvDir = join(home, "service-env");
        let configFound = false;
        try {
            const st = statSync(configPath);
            configFound = st.isFile();
        }
        catch {
            configFound = false;
        }
        let serviceEnvPresent = false;
        try {
            const st = statSync(serviceEnvDir);
            serviceEnvPresent = st.isDirectory();
        }
        catch {
            serviceEnvPresent = false;
        }
        // 探测 cron 目录（仅记录存在性）。
        const cronDir = join(home, "cron");
        let cronPresent = false;
        try {
            cronPresent = statSync(cronDir).isDirectory();
        }
        catch {
            cronPresent = false;
        }
        if (override) {
            notes.push(`OPENCLAW_HOME=${override} 覆盖默认路径`);
        }
        if (serviceEnvPresent)
            notes.push("检测到 service-env/ 目录（凭证文件存在，未读取内容）");
        if (cronPresent)
            notes.push("检测到 cron/ 目录");
        return {
            agent: this.agent,
            displayName: this.displayName,
            configFound,
            configPath: configFound ? configPath : undefined,
            source: configFound
                ? override
                    ? "OPENCLAW_HOME"
                    : "默认 ~/.openclaw"
                : undefined,
            notes: notes.length ? notes : undefined,
        };
    },
    async deepScan(ctx, found) {
        if (!found.configFound)
            return [];
        const override = ctx.env.OPENCLAW_HOME;
        const home = override?.trim() || join(ctx.home, ".openclaw");
        const serviceEnvDir = join(home, "service-env");
        const serviceEnvPresent = existsSync(serviceEnvDir);
        const parsed = parseOpenClaw(found.configPath, home, serviceEnvDirPresent(serviceEnvDir) ? serviceEnvDir : undefined);
        if (!parsed.ok) {
            return [buildParseFailureFinding({
                    id: "OPENCLAW_PARSE_FAIL",
                    displayName: this.displayName,
                    configPath: found.configPath,
                    format: "JSON",
                    category: "config",
                    reason: parsed.reason,
                    recommendation: "运行 `openclaw doctor` 验证配置，再重新运行 agentreveal scan。",
                })];
        }
        return buildOpenClawFindings({
            ...parsed.data,
            serviceEnvPresent,
        });
    },
};
function serviceEnvDirPresent(p) {
    try {
        return statSync(p).isDirectory();
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=index.js.map