/** 路径是否存在（文件或目录皆可）。异常一律按不存在处理。 */
export declare function pathExists(p: string): boolean;
/** 是否为存在的目录。 */
export declare function dirExists(p: string): boolean;
/** 是否为存在的普通文件。 */
export declare function fileExists(p: string): boolean;
/**
 * 解析一个可能以 ~ 开头或为相对路径的路径为绝对路径。
 */
export declare function resolveHome(p: string, home: string): string;
/**
 * 按优先级返回第一个存在的路径。
 * 用于"覆盖变量优先于默认路径"的探测（如 CLAUDE_CONFIG_DIR > ~/.claude）。
 * 返回命中的路径与它在候选列表中的索引（供 source 说明）。
 */
export declare function firstExisting(candidates: string[]): {
    path: string;
    index: number;
} | undefined;
