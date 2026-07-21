/**
 * OpenClaw 配置解析（discovery → deepScan 之间的归一化层）。
 *
 * 约定：
 * - 只读 openclaw.json，不读 service-env 任何凭据内容。
 * - 不读取 plugin 源码或 skill 源码；只检查配置字段名。
 * - 解析失败不抛错，返回 { ok:false, reason } 让 risk.ts 决定如何降级。
 */
import { readFileSync } from "node:fs";
import type { RiskFinding } from "../types.js";
import { describeParseFailure } from "../../core/parse-failure.js";

export interface OcGateway {
  port?: number;
  mode?: string;
  bind?: string;
  /** 鉴权配置（明文 token 在这里，evidence 不返回原值）。 */
  auth?: {
    token?: string;
    password?: string;
  };
  /** Tailscale/funnel 等暴露方式。 */
  tailscale?: { mode?: string; hostname?: string } | boolean;
}

export interface OcChannelSecret {
  channel: string;
  /** 是否检测到明文 secret（不返回值）。 */
  hasAppSecret: boolean;
  /** 是否检测到明文 token / verification token。 */
  hasToken: boolean;
  /** 渠道名（feishu/telegram/discord 等）。 */
}

export interface OcPlugin {
  name: string;
  source?: string;
  enabled?: boolean;
}

export interface OcAgentEntry {
  id: string;
  name?: string;
  workspace?: string;
  agentDir?: string;
}

export interface OcData {
  configFound: boolean;
  configPath?: string;

  meta?: { lastTouchedVersion?: string; lastTouchedAt?: string };

  gateway?: OcGateway;

  /** 渠道清单及其 secret 存在性（不返回 secret 内容）。 */
  channels: OcChannelSecret[];

  /** 插件清单（只读 name/source/enabled）。 */
  plugins: OcPlugin[];

  /** Agent 列表（id/name/workspace 路径）。 */
  agents: OcAgentEntry[];

  /** 是否配置了 service-env（gateway env 文件存在）。 */
  serviceEnvPresent: boolean;
}

const SERVICE_ENV_GLOB_HINT = "service-env";
// 直接列举常见的 env 文件名以避免 glob 库依赖。
const KNOWN_SERVICE_ENV_FILES = [
  "ai.openclaw.gateway.env",
  "openclaw.gateway.env",
  "gateway.env",
];

/** 只判断值是否为外部环境变量引用，不返回或记录 secret 本身。 */
function isLiteralSecret(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  return !/^\$(?:\{[A-Z_][A-Z0-9_]*\}|[A-Z_][A-Z0-9_]*)$/i.test(value.trim());
}

/**
 * 安全探测 OpenClaw 配置：捕获所有解析错误并降级。
 * evidence 仅含结构信息（字段名/路径/计数），绝不含 secret 值。
 */
export function parseOpenClaw(
  configPath: string | undefined,
  homeDir: string,
  serviceEnvDir?: string
): { ok: true; data: OcData } | { ok: false; reason: string } {
  if (!configPath) return { ok: false, reason: "配置文件不存在" };

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (e) {
    return { ok: false, reason: describeParseFailure(e, configPath, "JSON").reason };
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, reason: describeParseFailure(e, configPath, "JSON").reason };
  }

  // —— gateway ——
  const gwRaw = (json.gateway ?? {}) as Record<string, unknown>;
  const gw: OcGateway = {};
  if (typeof gwRaw.port === "number") gw.port = gwRaw.port;
  if (typeof gwRaw.mode === "string") gw.mode = gwRaw.mode;
  if (typeof gwRaw.bind === "string") gw.bind = gwRaw.bind;
  const authRaw = (gwRaw.auth ?? {}) as Record<string, unknown>;
  if (isLiteralSecret(authRaw.token)) {
    gw.auth = { token: "***" };
  }
  if (isLiteralSecret(authRaw.password)) {
    gw.auth = { ...(gw.auth ?? {}), password: "***" };
  }
  if (gwRaw.tailscale && typeof gwRaw.tailscale === "object") {
    const ts = gwRaw.tailscale as Record<string, unknown>;
    gw.tailscale = {
      mode: typeof ts.mode === "string" ? ts.mode : undefined,
      hostname: typeof ts.hostname === "string" ? ts.hostname : undefined,
    };
  } else if (gwRaw.tailscale === true) {
    gw.tailscale = true;
  }

  // —— channels: secret 存在性探测 ——
  const channels: OcChannelSecret[] = [];
  const channelsTop = (json.channels ?? {}) as Record<string, unknown>;
  for (const [name, value] of Object.entries(channelsTop)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const hasAppSecret = isLiteralSecret(v.appSecret);
    const hasToken = isLiteralSecret(v.token);
    if (hasAppSecret || hasToken) {
      channels.push({ channel: name, hasAppSecret, hasToken });
    }
  }

  // —— plugins ——
  const plugins: OcPlugin[] = [];
  const pluginsTop = (json.plugins ?? {}) as Record<string, unknown>;
  for (const [name, value] of Object.entries(pluginsTop)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    plugins.push({
      name,
      source: typeof v.source === "string" ? v.source : undefined,
      enabled: typeof v.enabled === "boolean" ? v.enabled : undefined,
    });
  }

  // —— agents ——
  const agents: OcAgentEntry[] = [];
  const agentsRoot = (json.agents ?? {}) as Record<string, unknown>;
  if (Array.isArray(agentsRoot.list)) {
    for (const a of agentsRoot.list) {
      if (!a || typeof a !== "object") continue;
      const v = a as Record<string, unknown>;
      if (typeof v.id !== "string") continue;
      agents.push({
        id: v.id,
        name: typeof v.name === "string" ? v.name : undefined,
        workspace: typeof v.workspace === "string" ? v.workspace : undefined,
        agentDir: typeof v.agentDir === "string" ? v.agentDir : undefined,
      });
    }
  }

  // —— meta ——
  const metaRaw = (json.meta ?? {}) as Record<string, unknown>;
  const meta: OcData["meta"] = {
    lastTouchedVersion:
      typeof metaRaw.lastTouchedVersion === "string"
        ? metaRaw.lastTouchedVersion
        : undefined,
    lastTouchedAt:
      typeof metaRaw.lastTouchedAt === "string" ? metaRaw.lastTouchedAt : undefined,
  };

  // —— service-env 探测（不读文件内容） ——
  let serviceEnvPresent = false;
  if (serviceEnvDir) {
    for (const f of KNOWN_SERVICE_ENV_FILES) {
      try {
        const { statSync } = require("node:fs") as typeof import("node:fs");
        statSync(`${serviceEnvDir}/${f}`);
        serviceEnvPresent = true;
        break;
      } catch {
        // ignore
      }
    }
  }

  return {
    ok: true,
    data: {
      configFound: true,
      configPath,
      meta,
      gateway: Object.keys(gw).length > 0 ? gw : undefined,
      channels,
      plugins,
      agents,
      serviceEnvPresent,
    },
  };
}
