/**
 * AgentGuard 机器可读输出契约。
 *
 * v1 保持各命令现有顶层字段不变，只增加 schemaVersion / command，便于试点期间
 * 识别输出来源并在未来演进时做兼容判断。
 */
export const OUTPUT_SCHEMA_VERSION = 1;
export function withOutputContract(command, payload) {
    return {
        ...payload,
        schemaVersion: OUTPUT_SCHEMA_VERSION,
        command,
    };
}
//# sourceMappingURL=output-contract.js.map