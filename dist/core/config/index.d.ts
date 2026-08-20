import type { ProviderTrustPolicy } from "../../rules/provider.js";
export interface AgentRevealConfig {
    configPath?: string;
    providerPolicy: ProviderTrustPolicy;
    warnings: string[];
}
export declare function loadAgentRevealConfig(cwd: string): AgentRevealConfig;
