/**
 * AgentGuard 机器可读输出契约。
 *
 * v1 保持各命令现有顶层字段不变，只增加 schemaVersion / command，便于试点期间
 * 识别输出来源并在未来演进时做兼容判断。
 */
export const OUTPUT_SCHEMA_VERSION = 1 as const;

export type OutputCommand =
  | "first-run"
  | "doctor"
  | "scan"
  | "provider.scan"
  | "posture"
  | "drift"
  | "drift.baseline"
  | "map"
  | "report.json"
  | "baseline"
  | "backup"
  | "credential.backup"
  | "credential.restore"
  | "apply"
  | "restore"
  | "trust.add"
  | "trust.list"
  | "trust.remove"
  | "ignore.add"
  | "ignore.list"
  | "ignore.remove";

export function withOutputContract<T extends object, C extends OutputCommand>(
  command: C,
  payload: T
): T & { schemaVersion: typeof OUTPUT_SCHEMA_VERSION; command: C } {
  return {
    ...payload,
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    command,
  };
}
