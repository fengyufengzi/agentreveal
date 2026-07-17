/**
 * discovery 阶段的文件系统探测工具。
 * 关键约束：只判断路径是否存在（statSync），绝不读取文件内容。
 */
import { existsSync, statSync } from "node:fs";
import { join, isAbsolute } from "node:path";

/** 路径是否存在（文件或目录皆可）。异常一律按不存在处理。 */
export function pathExists(p: string): boolean {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

/** 是否为存在的目录。 */
export function dirExists(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** 是否为存在的普通文件。 */
export function fileExists(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * 解析一个可能以 ~ 开头或为相对路径的路径为绝对路径。
 */
export function resolveHome(p: string, home: string): string {
  if (p === "~") return home;
  if (p.startsWith("~/")) return join(home, p.slice(2));
  if (isAbsolute(p)) return p;
  return join(home, p);
}

/**
 * 按优先级返回第一个存在的路径。
 * 用于"覆盖变量优先于默认路径"的探测（如 CLAUDE_CONFIG_DIR > ~/.claude）。
 * 返回命中的路径与它在候选列表中的索引（供 source 说明）。
 */
export function firstExisting(
  candidates: string[]
): { path: string; index: number } | undefined {
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i] && pathExists(candidates[i])) {
      return { path: candidates[i], index: i };
    }
  }
  return undefined;
}
