/**
 * Gemini CLI 配置解析（settings.json + .env）。
 *
 * 隐私红线：
 * - 只读文件。绝不返回/记录任何 API key 明文。
 * - .env 中的密钥仅判断"是否存在"（value 非空且非 ${VAR} 引用），只收键名不收值。
 * - MCP env / headers 仅暴露键名（用于识别是否内嵌密钥），绝不暴露键值。
 * - MCP url / httpUrl 属 endpoint 标识，可返回用于风险判定与展示。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigParseError } from "../../core/parse-failure.js";
import { isProxyManagedPlaceholder } from "../../core/proxy-managed.js";

/** 一个 Gemini MCP Server。 */
export interface GeminiMcpServer {
  name: string;
  /** stdio 启动命令（若配置）。 */
  command?: string;
  /** 远程端点：url ?? httpUrl（若配置）。 */
  url?: string;
  /** trust === true：绕过该 server 全部工具调用确认（等价 per-server YOLO）。 */
  trust: boolean;
  /** env 键名（不含值）。 */
  envKeys: string[];
  /** headers 键名（不含值）。 */
  headerKeys: string[];
}

export interface GeminiData {
  /** settings.json 是否成功解析。 */
  settingsParsed: boolean;
  /** security.auth.selectedType，如 oauth-personal / gemini-api-key / vertex-ai。 */
  authType?: string;
  mcpServers: GeminiMcpServer[];
  /** mcp.excluded 全局排除清单（仅用于说明，不直接报风险）。 */
  mcpExcluded: string[];
  /** tools.sandbox（可为字符串镜像名或布尔）。 */
  sandbox?: string | boolean;
  /**
   * 是否显式启用 shell 工具：coreTools 显式列出 run_shell_command，
   * 且未被 excludeTools 屏蔽。
   * 注：默认（coreTools 未设）虽也放开 shell，但为避免对每个默认安装误报，
   * 此处只在用户显式 allowlist 声明时才判为 true。
   */
  shellToolAllowed: boolean;
  /** ~/.gemini/.env 中 value 非空且非 ${VAR} 引用的键名（只存键名，不存值）。 */
  plaintextEnvKeys: string[];
  /** ~/.gemini/.env 是否含 CC Switch 写入的非秘密接管占位符。 */
  proxyManagedPlaceholderPresent: boolean;
  /** GOOGLE_GEMINI_BASE_URL（若配置）。 */
  baseUrl?: string;
}

const SECRET_ENV_RE = /(api[_-]?key|auth[_-]?token|access[_-]?token|secret|token|password)/i;
const SHELL_TOOL = "run_shell_command";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    throw new ConfigParseError(path, "JSON", error);
  }
}

export function looksLikeSecretEnv(key: string): boolean {
  return SECRET_ENV_RE.test(key);
}

/** 解析 mcpServers 映射。 */
function parseMcp(map: Record<string, unknown>): GeminiMcpServer[] {
  const out: GeminiMcpServer[] = [];
  for (const [name, raw] of Object.entries(map)) {
    const s = asRecord(raw);
    out.push({
      name,
      command: str(s.command),
      url: str(s.url) ?? str(s.httpUrl),
      trust: s.trust === true,
      envKeys: Object.keys(asRecord(s.env)),
      headerKeys: Object.keys(asRecord(s.headers)),
    });
  }
  return out;
}

/**
 * 解析 ~/.gemini/.env：仅收集 value 非空且非 ${VAR} 引用的键名。
 * 读不到 / 为空则返回 []。绝不返回任何 value。
 */
function parseEnvPresence(envPath: string): {
  plaintextKeys: string[];
  proxyManagedPlaceholderPresent: boolean;
  baseUrl?: string;
} {
  let text: string;
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return { plaintextKeys: [], proxyManagedPlaceholderPresent: false };
  }
  const plaintextKeys: string[] = [];
  let proxyManagedPlaceholderPresent = false;
  let baseUrl: string | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
    let value = line.slice(eq + 1).trim();
    // 去掉包裹引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key) continue;
    if (key === "GOOGLE_GEMINI_BASE_URL" && /^https?:\/\//i.test(value)) {
      baseUrl = value;
      continue;
    }
    // 空值或纯 ${VAR} 引用视为"未内嵌明文"。
    if (value.length === 0) continue;
    if (/^\$\{[^}]+\}$/.test(value) || /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(value)) continue;
    if (!SECRET_ENV_RE.test(key)) continue;
    if (isProxyManagedPlaceholder(value)) {
      proxyManagedPlaceholderPresent = true;
      continue;
    }
    plaintextKeys.push(key);
  }
  return { plaintextKeys, proxyManagedPlaceholderPresent, baseUrl };
}

/**
 * 读取并归一化 Gemini CLI 配置。
 * @param settingsPath ~/.gemini/settings.json 路径。
 * @param configDir 配置目录（用于定位 .env）。
 */
export function parseGemini(settingsPath: string, configDir: string): GeminiData {
  const settings = readJson(settingsPath) ?? {};

  const authType = str(asRecord(asRecord(settings.security).auth).selectedType);

  const mcpServers = parseMcp(asRecord(settings.mcpServers));
  const mcpExcluded = strArray(asRecord(settings.mcp).excluded);

  const tools = asRecord(settings.tools);
  const sandboxRaw = tools.sandbox;
  const sandbox =
    typeof sandboxRaw === "string" || typeof sandboxRaw === "boolean"
      ? sandboxRaw
      : undefined;

  // 仅在 coreTools 显式列出 run_shell_command 时判为启用（避免默认安装误报），
  // 且未被 excludeTools 屏蔽。
  const coreListsShell = strArray(tools.coreTools).some(
    (t) => t === SHELL_TOOL || t.startsWith(SHELL_TOOL + "(")
  );
  const shellExcluded = strArray(tools.excludeTools).some(
    (t) => t === SHELL_TOOL || t.startsWith(SHELL_TOOL + "(")
  );
  const shellToolAllowed = coreListsShell && !shellExcluded;

  const env = parseEnvPresence(join(configDir, ".env"));

  return {
    settingsParsed: true,
    authType,
    mcpServers,
    mcpExcluded,
    sandbox,
    shellToolAllowed,
    plaintextEnvKeys: env.plaintextKeys,
    proxyManagedPlaceholderPresent: env.proxyManagedPlaceholderPresent,
    baseUrl: env.baseUrl,
  };
}
