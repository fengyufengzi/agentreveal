import type { DiscoveryContext } from "../../adapters/types.js";
import { PostureSnapshotStore } from "./snapshot.js";
import type { DriftComparison, EffectiveAgentState } from "./types.js";
import { type PostureRemediationPlan } from "./remediation.js";
export interface PostureUncertainty {
    code: "SESSION_CLI_UNOBSERVED" | "UNREADABLE_CONFIG_SOURCE" | "AUTH_SOURCE_UNCONFIRMED" | "ROUTE_SOURCE_UNCONFIRMED";
    message: string;
}
export interface PostureAgentReport {
    state: EffectiveAgentState;
    uncertainty: PostureUncertainty[];
    remediationPlans: PostureRemediationPlan[];
}
export interface PostureReport {
    generatedAt: string;
    summary: {
        agentCount: number;
        confirmedCount: number;
        inferredCount: number;
        incompleteCount: number;
        authConflictCount: number;
    };
    agents: PostureAgentReport[];
}
export declare function buildPostureReport(states: readonly EffectiveAgentState[], generatedAt?: Date): PostureReport;
export declare function inspectPosture(ctx?: DiscoveryContext): Promise<PostureReport>;
export interface PostureWithDrift {
    posture: PostureReport;
    drift: DriftComparison;
}
export declare function inspectPostureWithDrift(ctx: DiscoveryContext, store: PostureSnapshotStore, options?: {
    recordObservation?: boolean;
    tolerateStoreErrors?: boolean;
}): Promise<PostureWithDrift>;
