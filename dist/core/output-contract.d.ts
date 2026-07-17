/**
 * AgentGuard 机器可读输出契约。
 *
 * v1 保持各命令现有顶层字段不变，只增加 schemaVersion / command，便于试点期间
 * 识别输出来源并在未来演进时做兼容判断。
 */
export declare const OUTPUT_SCHEMA_VERSION: 1;
export type OutputCommand = "doctor" | "scan" | "provider.scan" | "map" | "report.json" | "baseline" | "backup" | "apply" | "restore";
export declare function withOutputContract<T extends object>(command: OutputCommand, payload: T): T & {
    schemaVersion: typeof OUTPUT_SCHEMA_VERSION;
    command: OutputCommand;
};
