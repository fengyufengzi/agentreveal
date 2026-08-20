import { type ModelSafeScanV1 } from "../core/integration/model-safe-scan.js";
export declare const DSH_COMPATIBILITY: Readonly<{
    packageName: "@deepseek-ai/dsh";
    version: "0.1.0-rc.7";
    node: "^22.19.0 || >=24.0.0";
    profile: "web";
}>;
export interface DshProcessRequest {
    executable: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    signal?: AbortSignal;
    timeoutMs: number;
    maxOutputBytes: number;
}
export type DshProcessResult = {
    kind: "completed";
    exitCode: number;
    stdout: string;
} | {
    kind: "missing" | "timeout" | "aborted" | "output-limit" | "failed";
};
export type DshProcessRunner = (request: DshProcessRequest) => Promise<DshProcessResult>;
/** 使用固定 executable/argv 启动同包 CLI；从不经过 shell，也不保留 stderr。 */
export declare const runDshProcess: DshProcessRunner;
export type DshAdapterFailure = "cli-missing" | "version-mismatch" | "scan-failed" | "invalid-output" | "timeout" | "aborted";
export type DshAdapterScanResult = {
    ok: true;
    status: "clear" | "needs-attention";
    report: ModelSafeScanV1;
} | {
    ok: false;
    reason: DshAdapterFailure;
};
export interface DshAdapterScanOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
    timeoutMs?: number;
    nodePath?: string;
    cliPath?: string;
    processRunner?: DshProcessRunner;
    cliExists?: (path: string) => boolean;
}
/** 运行同包 integration CLI，并把 0/2 之外的状态全部安全归类。 */
export declare function inspectForDsh(options?: DshAdapterScanOptions): Promise<DshAdapterScanResult>;
export interface DshCommandResult {
    kind: "success" | "error";
    text: string;
}
/** 只渲染校验后的枚举与计数；忽略 integration JSON 中的任何动态展示文本。 */
export declare function renderDshResult(result: DshAdapterScanResult): DshCommandResult;
/** DSH `/agentreveal` handler；不接受参数，也不把命令交给模型。 */
export declare function runDshAgentRevealCommand(input: {
    rawInput: string;
    signal?: AbortSignal;
    cwd?: string;
}): Promise<DshCommandResult>;
