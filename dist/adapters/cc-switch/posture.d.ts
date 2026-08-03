import type { RiskFinding } from "../types.js";
import { type ProviderTrustPolicy } from "../../rules/provider.js";
import type { EffectivePostureInspection } from "../../core/posture/types.js";
import type { CcSwitchData } from "./parse.js";
export declare function buildCcSwitchPosture(data: CcSwitchData, dbPath: string, findings: readonly RiskFinding[], providerPolicy?: ProviderTrustPolicy): EffectivePostureInspection;
