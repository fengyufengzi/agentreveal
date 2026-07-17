import type { AgentDiscovery, DiscoveryContext } from "../../adapters/types.js";
/** 从当前进程构建 discovery 上下文。 */
export declare function buildContext(): DiscoveryContext;
/**
 * 运行全部 adapter 的 discovery。
 * 单个 adapter 抛错不影响其他（对应 Spike 模块 B：缺失/异常不报错）。
 */
export declare function discoverAll(ctx?: DiscoveryContext): Promise<AgentDiscovery[]>;
