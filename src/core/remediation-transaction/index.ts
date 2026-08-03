/** Core/Desktop 共用的受保护整改事务状态，不包含路径、端点或配置内容。 */
export type RemediationTransactionOperation =
  | "baseline"
  | "claude-credential";

export type RemediationTransactionPhase =
  | "previewed"
  | "backed-up"
  | "awaiting-external-verification"
  | "applying"
  | "verified"
  | "rolled-back"
  | "restored"
  | "backup-cleaned"
  | "failed";

export interface RemediationTransactionSummary {
  operation: RemediationTransactionOperation;
  phase: RemediationTransactionPhase;
  files: number;
  backupId?: string;
  restoreAvailable: boolean;
  message: string;
}
