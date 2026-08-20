/**
 * AgentReveal 项目配置读取。
 *
 * 当前只支持 Provider trust policy，配置文件为当前工作目录下：
 * - .agentreveal.json
 * - agentreveal.config.json
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ProviderTrustPolicy } from "../../rules/provider.js";
import { describeParseFailure } from "../parse-failure.js";

export interface AgentRevealConfig {
  configPath?: string;
  providerPolicy: ProviderTrustPolicy;
  warnings: string[];
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function readPolicy(raw: unknown): ProviderTrustPolicy {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const providers =
    obj.providers && typeof obj.providers === "object"
      ? (obj.providers as Record<string, unknown>)
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

export function loadAgentRevealConfig(cwd: string): AgentRevealConfig {
  const candidates = [
    join(cwd, ".agentreveal.json"),
    join(cwd, "agentreveal.config.json"),
  ];
  const configPath = candidates.find((p) => existsSync(p));
  if (!configPath) {
    return { providerPolicy: {}, warnings: [] };
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    return {
      configPath,
      providerPolicy: readPolicy(parsed),
      warnings: [],
    };
  } catch (err) {
    const failure = describeParseFailure(err, configPath, "JSON");
    return {
      configPath,
      providerPolicy: {},
      warnings: [`${failure.reason}，已安全忽略此项目策略文件`],
    };
  }
}
