import type { ActionTask } from "../action/index.js";
export type ProviderTrustKind = "trusted" | "internal";
export interface ProviderTrustEntry {
    endpoint: string;
    kind: ProviderTrustKind;
}
export interface ProviderTrustEvent extends ProviderTrustEntry {
    action: "add" | "remove";
    reason: string;
    at: string;
}
export interface ProviderTrustState {
    configPath: string;
    entries: ProviderTrustEntry[];
    audit: ProviderTrustEvent[];
}
/** URL、host、host:port 最终都保存为 host；通配符只允许最左侧 `*.`。 */
export declare function normalizeProviderEndpoint(input: string): string;
/** 只允许未知/疑似中转规则提供信任入口；HTTP、密钥和权限规则永远不提供。 */
export declare function providerTrustCandidateForTask(task: ActionTask): {
    endpoint: string;
} | undefined;
export declare function listProviderTrust(cwd: string): ProviderTrustState;
export declare function addProviderTrust(input: {
    cwd: string;
    endpoint: string;
    kind: ProviderTrustKind;
    reason: string;
    now?: Date;
}): ProviderTrustState;
export declare function removeProviderTrust(input: {
    cwd: string;
    endpoint: string;
    kind: ProviderTrustKind;
    reason: string;
    now?: Date;
}): ProviderTrustState;
