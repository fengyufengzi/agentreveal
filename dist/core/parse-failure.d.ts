/**
 * 配置解析失败的统一安全输出。
 *
 * 原始异常只用于内存内分类，绝不进入 finding、报告、诊断或任务身份。
 */
import type { RiskFinding } from "../adapters/types.js";
export type ConfigFormat = "JSON" | "TOML" | "SQLite" | "配置";
export declare class ConfigParseError extends Error {
    readonly configPath: string;
    readonly format: ConfigFormat;
    constructor(configPath: string, format: ConfigFormat, cause: unknown);
}
export interface SafeParseFailure {
    path: string;
    reason: string;
}
/** 将底层异常归一化为固定、可理解且不含原始异常文本的原因。 */
export declare function describeParseFailure(error: unknown, fallbackPath: string, fallbackFormat?: ConfigFormat): SafeParseFailure;
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
export declare function buildParseFailureFinding(options: ParseFailureFindingOptions): RiskFinding;
