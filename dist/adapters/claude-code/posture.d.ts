import type { DiscoveryContext, RiskFinding } from "../types.js";
import type { EffectiveAgentState } from "../../core/posture/types.js";
type JsonObject = Record<string, unknown>;
export interface ClaudePostureInput {
    configDir: string;
    home: string;
    cwd: string;
    env: Record<string, string | undefined>;
    findings: readonly RiskFinding[];
    providerPolicy?: DiscoveryContext["providerPolicy"];
    managedSettingsPaths?: string[];
    cliSettings?: JsonObject;
}
export declare function buildClaudeEffectiveState(input: ClaudePostureInput): EffectiveAgentState;
export {};
