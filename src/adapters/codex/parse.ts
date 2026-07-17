/**
 * Codex 配置解析（D1 §2）。
 *
 * 隐私红线：
 * - 只读文件。绝不返回/记录任何 token / api_key 明文。
 * - auth.json 仅判断"是否存在原始 API Key"与 auth_mode，不读取 token 值。
 * - MCP env 仅暴露"键名"（用于识别是否内嵌密钥），绝不暴露键值。
 * - base_url 属 endpoint 标识，可返回用于风险判定与展示。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";

/** [model_providers.*] 中的一个自定义 Provider。 */
export interface CodexModelProvider {
  name: string;
  baseUrl?: string;
  wireApi?: string;
  /** 引用的环境变量名（非值）。 */
  envKey?: string;
}

/** [mcp_servers.*] 中的一个 MCP Server。 */
export interface CodexMcpServer {
  name: string;
  type?: string;
  command?: string;
  /** 远程 MCP 的 URL（若为 SSE/HTTP 型）。 */
  url?: string;
  enabled: boolean;
  /** env 的键名列表（不含值），用于识别内嵌密钥。 */
  envKeys: string[];
}

export interface CodexData {
  /** 主配置是否成功解析。 */
  configParsed: boolean;
  providers: CodexModelProvider[];
  /** 顶层 model_provider（当前激活的自定义 provider 名）。 */
  activeProvider?: string;
  mcpServers: CodexMcpServer[];
  /** trust_level = "trusted" 的项目路径。 */
  trustedProjects: string[];
  /** [network].proxy_url。 */
  proxyUrl?: string;
  /** auth.json 中是否存在非空 OPENAI_API_KEY（原始密钥落盘）。 */
  apiKeyPresent: boolean;
  /** auth.json 的 auth_mode（如 "chatgpt" / "apikey"）。 */
  authMode?: string;
}

/** 疑似密钥的环境变量名。 */
const SECRET_ENV_RE = /(api[_-]?key|auth[_-]?token|access[_-]?token|secret|token|password)/i;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** 解析 [model_providers.*]。 */
function parseProviders(cfg: Record<string, unknown>): CodexModelProvider[] {
  const out: CodexModelProvider[] = [];
  const mp = asRecord(cfg.model_providers);
  for (const [name, raw] of Object.entries(mp)) {
    const p = asRecord(raw);
    out.push({
      name,
      baseUrl: str(p.base_url),
      wireApi: str(p.wire_api),
      envKey: str(p.env_key),
    });
  }
  return out;
}

/** 解析 [mcp_servers.*]。 */
function parseMcpServers(cfg: Record<string, unknown>): CodexMcpServer[] {
  const out: CodexMcpServer[] = [];
  const ms = asRecord(cfg.mcp_servers);
  for (const [name, raw] of Object.entries(ms)) {
    const s = asRecord(raw);
    // 显式 enabled=false 才算停用，缺省视为启用。
    const enabled = s.enabled !== false;
    const envKeys = Object.keys(asRecord(s.env));
    out.push({
      name,
      type: str(s.type),
      command: str(s.command),
      url: str(s.url),
      enabled,
      envKeys,
    });
  }
  return out;
}

/** 解析 [projects.*] 中 trust_level="trusted" 的路径。 */
function parseTrustedProjects(cfg: Record<string, unknown>): string[] {
  const out: string[] = [];
  const projects = asRecord(cfg.projects);
  for (const [path, raw] of Object.entries(projects)) {
    if (asRecord(raw).trust_level === "trusted") out.push(path);
  }
  return out;
}

/** 读取 auth.json：仅提取 auth_mode 与"是否存在原始 API Key"。绝不读取 token 值。 */
function readAuth(baseDir: string): { apiKeyPresent: boolean; authMode?: string } {
  try {
    const raw = JSON.parse(readFileSync(join(baseDir, "auth.json"), "utf8"));
    const rec = asRecord(raw);
    const key = rec.OPENAI_API_KEY;
    return {
      apiKeyPresent: typeof key === "string" && key.trim().length > 0,
      authMode: str(rec.auth_mode),
    };
  } catch {
    return { apiKeyPresent: false };
  }
}

/** 判断某 env 键名是否疑似密钥。 */
export function looksLikeSecretEnv(key: string): boolean {
  return SECRET_ENV_RE.test(key);
}

/**
 * 读取并归一化 Codex 配置。
 * @param configPath config.toml 路径（discover 已判定存在）。
 * @param baseDir 配置目录（用于定位 auth.json）。
 */
export function parseCodex(configPath: string, baseDir: string): CodexData {
  const auth = readAuth(baseDir);

  let cfg: Record<string, unknown> = {};
  let configParsed = false;
  try {
    cfg = asRecord(parseToml(readFileSync(configPath, "utf8")));
    configParsed = true;
  } catch {
    /* TOML 损坏或版本不兼容 → 按空处理，仍返回 auth 信息 */
  }

  return {
    configParsed,
    providers: parseProviders(cfg),
    activeProvider: str(cfg.model_provider),
    mcpServers: parseMcpServers(cfg),
    trustedProjects: parseTrustedProjects(cfg),
    proxyUrl: str(asRecord(cfg.network).proxy_url),
    apiKeyPresent: auth.apiKeyPresent,
    authMode: auth.authMode,
  };
}
