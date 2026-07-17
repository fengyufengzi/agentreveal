import type { ProviderTrustPolicy } from "../../rules/provider.js";
export interface AgentGuardConfig {
    configPath?: string;
    providerPolicy: ProviderTrustPolicy;
    warnings: string[];
}
export declare function loadAgentGuardConfig(cwd: string): AgentGuardConfig;
