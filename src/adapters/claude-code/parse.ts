/**
 * Claude Code 配置解析（D1 §1）。
 *
 * 隐私红线：
 * - 只读文件。绝不返回/记录任何 token / api_key 明文。
 * - settings.json env 中的密钥仅判断"是否存在"，不读取值。
 * - MCP env 仅暴露键名（用于识别是否内嵌密钥），绝不暴露键值。
 * - base_url（ANTHROPIC_BASE_URL）属 endpoint 标识，可返回用于风险判定与展示。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** 一个 MCP Server（全局或项目级）。 */
export interface ClaudeMcpServer {
  name: string;
  scope: "global" | "project";
  type?: string;
  command?: string;
  url?: string;
  /** env 键名（不含值）。 */
  envKeys: string[];
}

export interface ClaudeData {
  /** settings.json 是否成功解析。 */
  settingsFound: boolean;
  /** ANTHROPIC_BASE_URL（若配置）。 */
  baseUrl?: string;
  /** env 中是否存在明文 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY。 */
  authTokenPresent: boolean;
  /** 是否配置了 apiKeyHelper（外部命令产出密钥）。 */
  apiKeyHelperPresent: boolean;
  /** permissions.allow 规则。 */
  permissionAllowRules: string[];
  /** permissions.defaultMode。 */
  defaultMode?: string;
  /** defaultMode === "bypassPermissions"。 */
  bypassPermissions: boolean;
  /** 是否配置了 hooks（执行任意 shell 命令）。 */
  hooksPresent: boolean;
  /** enableAllProjectMcpServers。 */
  enableAllProjectMcp: boolean;
  mcpServers: ClaudeMcpServer[];
}

const SECRET_ENV_RE = /(api[_-]?key|auth[_-]?token|access[_-]?token|secret|token|password)/i;
const TOKEN_ENV_RE = /^(ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY)$/i;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return undefined;
  }
}

/** 从一个 mcpServers 映射解析 server 列表。 */
function parseMcp(
  map: Record<string, unknown>,
  scope: "global" | "project"
): ClaudeMcpServer[] {
  const out: ClaudeMcpServer[] = [];
  for (const [name, raw] of Object.entries(map)) {
    const s = asRecord(raw);
    out.push({
      name,
      scope,
      type: str(s.type),
      command: str(s.command),
      url: str(s.url),
      envKeys: Object.keys(asRecord(s.env)),
    });
  }
  return out;
}

export function looksLikeSecretEnv(key: string): boolean {
  return SECRET_ENV_RE.test(key);
}

/**
 * 读取并归一化 Claude Code 配置。
 * @param configDir 主配置目录（~/.claude 或 CLAUDE_CONFIG_DIR）。
 * @param home 用户主目录（用于定位 ~/.claude.json 全局状态）。
 */
export function parseClaudeCode(configDir: string, home: string): ClaudeData {
  const base = readJson(join(configDir, "settings.json"));
  const local = readJson(join(configDir, "settings.local.json"));
  const settingsFound = base !== undefined || local !== undefined;

  // 合并：env 浅合并（local 覆盖）、permissions.allow 取并集、标量 local 优先。
  const env = { ...asRecord(base?.env), ...asRecord(local?.env) };
  const perm = { ...asRecord(base?.permissions), ...asRecord(local?.permissions) };
  const allowOf = (cfg?: Record<string, unknown>): unknown[] => {
    const a = asRecord(cfg?.permissions).allow;
    return Array.isArray(a) ? a : [];
  };
  const permissionAllowRules = [...allowOf(base), ...allowOf(local)].filter(
    (x): x is string => typeof x === "string"
  );

  const defaultMode = str(perm.defaultMode);
  const apiKeyHelper = str(local?.apiKeyHelper) ?? str(base?.apiKeyHelper);
  const hooks =
    Object.keys(asRecord(local?.hooks)).length > 0 ||
    Object.keys(asRecord(base?.hooks)).length > 0;
  const enableAllProjectMcp =
    local?.enableAllProjectMcpServers === true ||
    base?.enableAllProjectMcpServers === true;

  const authTokenPresent = Object.entries(env).some(
    ([k, v]) => TOKEN_ENV_RE.test(k) && typeof v === "string" && v.trim().length > 0
  );

  // 全局状态 ~/.claude.json：mcpServers（全局）+ projects[*].mcpServers（项目级）。
  const globalState = readJson(join(home, ".claude.json")) ?? {};
  const mcpServers: ClaudeMcpServer[] = [
    ...parseMcp(asRecord(globalState.mcpServers), "global"),
  ];
  for (const proj of Object.values(asRecord(globalState.projects))) {
    const pm = asRecord(asRecord(proj).mcpServers);
    if (Object.keys(pm).length) mcpServers.push(...parseMcp(pm, "project"));
  }

  return {
    settingsFound,
    baseUrl: str(env.ANTHROPIC_BASE_URL),
    authTokenPresent,
    apiKeyHelperPresent: apiKeyHelper !== undefined,
    permissionAllowRules,
    defaultMode,
    bypassPermissions: defaultMode === "bypassPermissions",
    hooksPresent: hooks,
    enableAllProjectMcp,
    mcpServers,
  };
}
