import type { EffectiveAgentState } from "./types.js";
export type PosturePlanStatus = "action-required" | "review" | "informational";
export interface PosturePlanStep {
    id: string;
    title: string;
    detail: string;
    kind: "review" | "backup" | "configure" | "verify";
    terminalCommand?: {
        command: string;
        label: string;
        successEvidence: string;
        readOnly: true;
    };
}
export interface PostureRemediationPlan {
    planId: "claude-auth-conflict" | "codex-auth-route-conflict" | "cc-switch-route-status" | "cc-switch-token-rotation";
    agentId: EffectiveAgentState["agentId"];
    category: "authentication" | "provider-route";
    status: PosturePlanStatus;
    title: string;
    currentExplanation: string;
    targetState: string;
    steps: PosturePlanStep[];
    automation: {
        mode: "guided" | "guided-with-existing-backup";
        available: false;
        reason: string;
    };
    constraints: string[];
}
export declare function buildPostureRemediationPlans(state: EffectiveAgentState): PostureRemediationPlan[];
