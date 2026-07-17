/**
 * OpenClaw 风险规则。
 * 输出 RiskFinding[]，evidence 仅含字段名/路径/计数/模式，不含任何明文密钥。
 */
import type { RiskFinding } from "../types.js";
import type { OcData } from "./parse.js";
export declare function buildOpenClawFindings(data: OcData): RiskFinding[];
export declare function isLoopbackBind(bind: string): boolean;
