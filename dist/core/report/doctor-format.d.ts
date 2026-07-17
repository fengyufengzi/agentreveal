/** doctor 命令的终端输出格式化（纯字符串，便于测试/复用）。 */
import type { AgentDiscovery } from "../../adapters/types.js";
/** 生成完整 doctor 文本报告。 */
export declare function formatDoctor(found: AgentDiscovery[]): string;
