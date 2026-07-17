/**
 * Provider 分类规则库（PRD §6.6）。
 * 输入一个 base_url，判定其信任类型与风险等级，并给出可解释的原因。
 * 设计：不武断阻断，未知只提示；企业内网可后续由用户白名单标记为 internal。
 * 复用：CC Switch / OpenCode / Claude Code 等 adapter 共用。
 */
import type { RiskLevel } from "../adapters/types.js";

export type ProviderType =
  | "official"
  | "domestic_official"
  | "local"
  | "enterprise_internal"
  | "relay_or_proxy"
  | "openai_compatible_unknown"
  | "unknown";

export interface ProviderClass {
  type: ProviderType;
  level: RiskLevel;
  reason: string;
  /** 附加提示，如使用了非 TLS 的 http。 */
  flags: string[];
}

export interface ProviderTrustPolicy {
  /** 用户显式标记可信的端点/域名。支持完整 URL、host、*.example.com。 */
  trustedEndpoints?: string[];
  /** 企业/内网自建端点。支持完整 URL、host、*.example.com。 */
  internalEndpoints?: string[];
}

/** 官方 Provider 域名后缀。 */
const OFFICIAL = ["anthropic.com", "openai.com", "googleapis.com", "azure.com"];

/** 国内官方大模型服务域名后缀 → 展示名。 */
const DOMESTIC: Record<string, string> = {
  "minimaxi.com": "MiniMax",
  "deepseek.com": "DeepSeek",
  "moonshot.cn": "Kimi",
  "bigmodel.cn": "GLM/智谱",
  "dashscope.aliyuncs.com": "通义千问",
  "volces.com": "火山方舟",
  "baidubce.com": "百度千帆",
  "tencentcloudapi.com": "腾讯混元",
};

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/** 判断主机名是否为 IP 字面量（IPv4）。 */
function isIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/** 判断是否为私有/回环地址。 */
function isPrivateIp(host: string): boolean {
  if (host === "localhost") return true;
  if (!isIpv4(host)) return false;
  const [a, b] = host.split(".").map(Number);
  if (a === 127 || a === 0) return true; // 回环 / 本地
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function endsWithDomain(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith("." + suffix);
}

function normalizePattern(pattern: string): string | undefined {
  const p = pattern.trim();
  if (!p) return undefined;
  try {
    return new URL(p).hostname.toLowerCase();
  } catch {
    return p.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  }
}

function matchesPolicy(host: string, patterns: string[] | undefined): boolean {
  if (!patterns?.length) return false;
  const h = host.toLowerCase();
  return patterns.some((raw) => {
    const p = normalizePattern(raw);
    if (!p) return false;
    if (p.startsWith("*.")) return endsWithDomain(h, p.slice(2));
    return h === p;
  });
}

/**
 * 对 base_url 做分类判定。
 */
export function classifyBaseUrl(
  url: string,
  policy: ProviderTrustPolicy = {}
): ProviderClass {
  const flags: string[] = [];
  const host = hostnameOf(url);
  if (!host) {
    return { type: "unknown", level: "high", reason: "无法解析的 base_url", flags };
  }
  if (url.startsWith("http://")) flags.push("使用非 TLS 明文 http");

  // 本地 / 内网
  if (isPrivateIp(host)) {
    return {
      type: "local",
      level: "low",
      reason: `本地或内网地址（${host}）`,
      flags,
    };
  }

  // 用户显式信任/企业内部端点：只覆盖未知/中转归类，不吞掉 http flag。
  if (
    matchesPolicy(host, policy.internalEndpoints) ||
    matchesPolicy(host, policy.trustedEndpoints)
  ) {
    return {
      type: "enterprise_internal",
      level: "low",
      reason: `用户已标记为可信/内部 endpoint（${host}）`,
      flags,
    };
  }

  // 公网裸 IP：无域名、常见于自建中转，风险偏高
  if (isIpv4(host)) {
    return {
      type: "relay_or_proxy",
      level: "high",
      reason: `公网裸 IP 端点（${host}），常见于自建中转，可能接收源码与上下文`,
      flags,
    };
  }

  // 官方
  if (OFFICIAL.some((d) => endsWithDomain(host, d))) {
    return { type: "official", level: "low", reason: `官方 endpoint（${host}）`, flags };
  }

  // 国内官方
  for (const [domain, name] of Object.entries(DOMESTIC)) {
    if (endsWithDomain(host, domain)) {
      return {
        type: "domestic_official",
        level: "low",
        reason: `国内官方模型服务：${name}（${host}）`,
        flags,
      };
    }
  }

  // 未知域名 → OpenAI 兼容未知中转
  return {
    type: "openai_compatible_unknown",
    level: "high",
    reason: `未知 endpoint（${host}），可能接收源码与上下文；如为自建请标记为可信/内部`,
    flags,
  };
}
