import type { DiscoveryContext, RiskFinding } from "../types.js";
import type { EffectiveAgentState } from "../../core/posture/types.js";
type TomlObject = Record<string, unknown>;
export interface CodexPostureInput {
    baseDir: string;
    configPath: string;
    cwd: string;
    env: Record<string, string | undefined>;
    findings: readonly RiskFinding[];
    providerPolicy?: DiscoveryContext["providerPolicy"];
    systemConfigPath?: string;
    profile?: string;
    cliOverrides?: TomlObject;
    projectTrusted?: boolean;
}
export declare function buildCodexEffectiveState(input: CodexPostureInput): EffectiveAgentState;
export {};
