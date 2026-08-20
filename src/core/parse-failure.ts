/**
 * 配置解析失败的统一安全输出。
 *
 * 原始异常只用于内存内分类，绝不进入 finding、报告、诊断或任务身份。
 */
import type { RiskFinding } from "../adapters/types.js";

export type ConfigFormat = "JSON" | "TOML" | "SQLite" | "配置";

export class ConfigParseError extends Error {
  readonly configPath: string;
  readonly format: ConfigFormat;

  constructor(configPath: string, format: ConfigFormat, cause: unknown) {
    super(`Failed to parse ${format} configuration`, { cause });
    this.name = "ConfigParseError";
    this.configPath = configPath;
    this.format = format;
  }
}

export interface SafeParseFailure {
  path: string;
  reason: string;
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code.toUpperCase() : undefined;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`.toLowerCase();
  return String(error).toLowerCase();
}

/** 将底层异常归一化为固定、可理解且不含原始异常文本的原因。 */
export function describeParseFailure(
  error: unknown,
  fallbackPath: string,
  fallbackFormat: ConfigFormat = "配置"
): SafeParseFailure {
  const wrapped = error instanceof ConfigParseError ? error : undefined;
  const cause = wrapped?.cause ?? error;
  const path = wrapped?.configPath ?? fallbackPath;
  const format = wrapped?.format ?? fallbackFormat;
  const code = errorCode(cause);
  const text = errorText(cause);

  if (code === "EACCES" || code === "EPERM" || /permission denied/.test(text)) {
    return { path, reason: "当前用户没有读取权限" };
  }
  if (code === "ENOENT") {
    return { path, reason: "扫描期间配置文件已不存在" };
  }
  if (
    code === "EBUSY" ||
    code === "EAGAIN" ||
    /database is locked|resource busy|temporarily unavailable/.test(text)
  ) {
    return { path, reason: "配置文件正被占用，暂时无法读取" };
  }
  if (format === "SQLite") {
    return { path, reason: "SQLite 数据库无法读取，可能已损坏或版本不兼容" };
  }
  if (
    cause instanceof SyntaxError ||
    /parse|syntax|unexpected|invalid|toml|json/.test(text)
  ) {
    return { path, reason: `${format} 格式无效` };
  }
  const label = format === "配置" ? "配置文件" : `${format} 配置文件`;
  return { path, reason: `${label}无法读取或当前版本暂不兼容` };
}

export interface ParseFailureFindingOptions {
  id: string;
  displayName: string;
  configPath?: string;
  error?: unknown;
  format?: ConfigFormat;
  category?: string;
  title?: string;
  reason?: string;
  recommendation?: string;
}

/** 构造不会泄漏原始异常、堆栈或配置内容的扫描盲区 finding。 */
export function buildParseFailureFinding(
  options: ParseFailureFindingOptions
): RiskFinding {
  const fallbackPath = options.configPath ?? "配置路径不可用";
  const failure = options.reason
    ? { path: fallbackPath, reason: options.reason }
    : describeParseFailure(options.error, fallbackPath, options.format);

  return {
    id: options.id,
    category: options.category ?? "compat",
    severity: "info",
    title: options.title ?? `${options.displayName} 配置解析失败，已安全跳过`,
    description:
      `无法安全完成 ${options.displayName} 的配置检查；原因：${failure.reason}。` +
      "该 Agent 的深度检查已跳过，其他扫描不受影响。",
    evidence: {
      path: failure.path,
      reason: failure.reason,
      status: "已安全跳过",
    },
    recommendation:
      options.recommendation ?? "修复配置格式或读取权限后重新运行 agentreveal scan。",
    fixable: false,
  };
}
