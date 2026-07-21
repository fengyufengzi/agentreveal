/**
 * OpenCode 配置解析（D1 §5）。
 *
 * 隐私红线：
 * - 只读文件。绝不返回/记录任何 apiKey 明文。
 * - provider.apiKey 仅判断"是否为明文字面量"（区别于 {env:...} 引用），不返回值。
 * - MCP env / headers 仅暴露键名，绝不暴露键值。
 * - baseURL 属 endpoint 标识，可返回用于风险判定与展示。
 */
import { readFileSync } from "node:fs";
import { describeParseFailure } from "../../core/parse-failure.js";

/** provider.<id> 中的自定义 Provider。 */
export interface OcProvider {
  name: string;
  baseUrl?: string;
  /** apiKey 是否为明文字面量（非 {env:...} / {file:...} 引用）。 */
  plaintextKey: boolean;
}

/** mcp.<name> 中的 MCP Server。 */
export interface OcMcpServer {
  name: string;
  type?: string;
  /** local 型的启动命令（command 数组首项）。 */
  command?: string;
  /** remote 型的 URL。 */
  url?: string;
  enabled: boolean;
  /** environment / headers 的键名（不含值）。 */
  envKeys: string[];
}

export interface OcData {
  configParsed: boolean;
  /** 解析失败时的固定安全原因，不含底层异常原文。 */
  parseFailureReason?: string;
  providers: OcProvider[];
  mcpServers: OcMcpServer[];
  /** permission.bash（"allow" | "ask" | "deny" 或对象）。 */
  permissionBash?: string;
  /** permission.edit。 */
  permissionEdit?: string;
  /** permission 为顶层 "allow" 或全部子项 allow。 */
  permissionWildcard: boolean;
  /** autoupdate 的显式取值（未配置为 undefined，避免对默认值报噪）。 */
  autoupdate?: boolean;
  /** share 模式："auto" | "manual" | "disabled"。 */
  share?: string;
}

const SECRET_ENV_RE = /(api[_-]?key|auth|token|secret|password|bearer)/i;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
/** 是否为 {env:...} / {file:...} 变量引用而非明文。 */
function isReference(v: string): boolean {
  return /^\{(env|file):/i.test(v.trim());
}

export function looksLikeSecretEnv(key: string): boolean {
  return SECRET_ENV_RE.test(key);
}

function parseProviders(cfg: Record<string, unknown>): OcProvider[] {
  const out: OcProvider[] = [];
  for (const [name, raw] of Object.entries(asRecord(cfg.provider))) {
    const p = asRecord(raw);
    const opts = asRecord(p.options);
    const apiKey = opts.apiKey ?? p.apiKey;
    out.push({
      name,
      baseUrl: str(opts.baseURL) ?? str(opts.baseUrl) ?? str(p.baseURL),
      plaintextKey:
        typeof apiKey === "string" &&
        apiKey.trim().length > 0 &&
        !isReference(apiKey),
    });
  }
  return out;
}

function parseMcp(cfg: Record<string, unknown>): OcMcpServer[] {
  const out: OcMcpServer[] = [];
  for (const [name, raw] of Object.entries(asRecord(cfg.mcp))) {
    const s = asRecord(raw);
    const type = str(s.type);
    const cmd = Array.isArray(s.command) ? s.command : undefined;
    // enabled 缺省为 true，仅显式 false 关闭。
    const enabled = s.enabled !== false;
    const envKeys = [
      ...Object.keys(asRecord(s.environment)),
      ...Object.keys(asRecord(s.headers)),
    ];
    out.push({
      name,
      type,
      command: cmd ? String(cmd[0]) : undefined,
      url: str(s.url),
      enabled,
      envKeys,
    });
  }
  return out;
}

/** 归一化 permission 字段（可为字符串或对象）。 */
function parsePermission(cfg: Record<string, unknown>): {
  bash?: string;
  edit?: string;
  wildcard: boolean;
} {
  const perm = cfg.permission;
  if (typeof perm === "string") {
    return { bash: perm, edit: perm, wildcard: perm === "allow" };
  }
  const p = asRecord(perm);
  const bash = str(p.bash);
  const edit = str(p.edit);
  const vals = [bash, edit, str(p.webfetch)].filter(Boolean);
  const wildcard = vals.length > 0 && vals.every((v) => v === "allow");
  return { bash, edit, wildcard };
}

/**
 * 读取并归一化 OpenCode 配置。
 * @param configPath opencode.json 路径（discover 已判定存在）。
 */
export function parseOpenCode(configPath: string): OcData {
  let cfg: Record<string, unknown> = {};
  let configParsed = false;
  let parseFailureReason: string | undefined;
  try {
    cfg = asRecord(JSON.parse(readFileSync(configPath, "utf8")));
    configParsed = true;
  } catch (error) {
    parseFailureReason = describeParseFailure(error, configPath, "JSON").reason;
  }

  const perm = parsePermission(cfg);
  return {
    configParsed,
    parseFailureReason,
    providers: parseProviders(cfg),
    mcpServers: parseMcp(cfg),
    permissionBash: perm.bash,
    permissionEdit: perm.edit,
    permissionWildcard: perm.wildcard,
    autoupdate: typeof cfg.autoupdate === "boolean" ? cfg.autoupdate : undefined,
    share: str(cfg.share),
  };
}
