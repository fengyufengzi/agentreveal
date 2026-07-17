/** 将当前扫描、上次报告快照和接受历史合并为单任务验证结论。 */
import type { ActionTask } from "../action/index.js";
import type { ListedAcceptance } from "../acceptance/index.js";
import type { TaskSnapshot } from "./snapshot.js";
export type RiskVerificationStatus = "resolved" | "present" | "mitigated" | "accepted" | "expired" | "revoked" | "identity-changed" | "unknown";
export interface RiskVerificationResult {
    taskId: string;
    status: RiskVerificationStatus;
    remainingRuleIds: string[];
    disappearedRuleIds: string[];
    relatedTaskIds: string[];
    acceptance?: ListedAcceptance;
}
export declare function verifyRiskTask(input: {
    taskId: string;
    currentTasks: readonly ActionTask[];
    previous?: TaskSnapshot;
    acceptance?: ListedAcceptance;
}): RiskVerificationResult;
