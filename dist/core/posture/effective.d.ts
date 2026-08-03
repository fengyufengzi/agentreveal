import type { DiscoveryContext } from "../../adapters/types.js";
import type { EffectiveAgentState } from "./types.js";
/**
 * CLI 与 Desktop 后续共用的唯一有效状态入口。
 * E1 只提供 typed core；E2 才把结果加入用户可见输出。
 */
export declare function inspectEffectiveStates(ctx?: DiscoveryContext): Promise<EffectiveAgentState[]>;
