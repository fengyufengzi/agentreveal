/**
 * AgentGuard 项目配置读取。
 *
 * 当前只支持 Provider trust policy，配置文件为当前工作目录下：
 * - .agentguard.json
 * - agentguard.config.json
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describeParseFailure } from "../parse-failure.js";
function stringList(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((v) => typeof v === "string");
}
function readPolicy(raw) {
    if (!raw || typeof raw !== "object")
        return {};
    const obj = raw;
    const providers = obj.providers && typeof obj.providers === "object"
        ? obj.providers
        : {};
    return {
        trustedEndpoints: [
            ...stringList(providers.trusted),
            ...stringList(providers.trustedEndpoints),
        ],
        internalEndpoints: [
            ...stringList(providers.internal),
            ...stringList(providers.internalEndpoints),
        ],
    };
}
export function loadAgentGuardConfig(cwd) {
    const candidates = [
        join(cwd, ".agentguard.json"),
        join(cwd, "agentguard.config.json"),
    ];
    const configPath = candidates.find((p) => existsSync(p));
    if (!configPath) {
        return { providerPolicy: {}, warnings: [] };
    }
    try {
        const parsed = JSON.parse(readFileSync(configPath, "utf8"));
        return {
            configPath,
            providerPolicy: readPolicy(parsed),
            warnings: [],
        };
    }
    catch (err) {
        const failure = describeParseFailure(err, configPath, "JSON");
        return {
            configPath,
            providerPolicy: {},
            warnings: [`${failure.reason}，已安全忽略此项目策略文件`],
        };
    }
}
//# sourceMappingURL=index.js.map