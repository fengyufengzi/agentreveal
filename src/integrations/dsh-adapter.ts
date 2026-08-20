/** DeepSeek Harness 只读命令 Adapter。 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateModelSafeScan,
  type ModelSafeRiskCategory,
  type ModelSafeScanV1,
} from "../core/integration/model-safe-scan.js";
import { PRODUCT_VERSION } from "../version.js";

export const DSH_COMPATIBILITY = Object.freeze({
  packageName: "@deepseek-ai/dsh",
  version: "0.1.0-rc.7",
  node: "^22.19.0 || >=24.0.0",
  profile: "web",
});

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 256 * 1024;

export interface DshProcessRequest {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs: number;
  maxOutputBytes: number;
}

export type DshProcessResult =
  | { kind: "completed"; exitCode: number; stdout: string }
  | { kind: "missing" | "timeout" | "aborted" | "output-limit" | "failed" };

export type DshProcessRunner = (
  request: DshProcessRequest
) => Promise<DshProcessResult>;

/** 使用固定 executable/argv 启动同包 CLI；从不经过 shell，也不保留 stderr。 */
export const runDshProcess: DshProcessRunner = (request) =>
  new Promise((resolveResult) => {
    if (request.signal?.aborted) {
      resolveResult({ kind: "aborted" });
      return;
    }
    let settled = false;
    let forced: Exclude<DshProcessResult["kind"], "completed"> | undefined;
    let stdout = "";
    let stdoutBytes = 0;
    const child = spawn(request.executable, request.args, {
      cwd: request.cwd,
      env: request.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });

    const finish = (result: DshProcessResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", onAbort);
      resolveResult(result);
    };
    const stop = (
      kind: Exclude<DshProcessResult["kind"], "completed">
    ): void => {
      if (forced !== undefined) return;
      forced = kind;
      child.kill("SIGKILL");
    };
    const onAbort = (): void => stop("aborted");
    request.signal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => stop("timeout"), request.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > request.maxOutputBytes) {
        stop("output-limit");
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      finish({ kind: error.code === "ENOENT" ? "missing" : "failed" });
    });
    child.once("close", (code) => {
      if (forced !== undefined) {
        finish({ kind: forced });
        return;
      }
      if (code === null) {
        finish({ kind: "failed" });
        return;
      }
      finish({ kind: "completed", exitCode: code, stdout });
    });
  });

export type DshAdapterFailure =
  | "cli-missing"
  | "version-mismatch"
  | "scan-failed"
  | "invalid-output"
  | "timeout"
  | "aborted";

export type DshAdapterScanResult =
  | {
      ok: true;
      status: "clear" | "needs-attention";
      report: ModelSafeScanV1;
    }
  | { ok: false; reason: DshAdapterFailure };

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

function bundledCliPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../bin/agentreveal");
}

function mapProcessFailure(result: DshProcessResult): DshAdapterFailure {
  if (result.kind === "missing") return "cli-missing";
  if (result.kind === "timeout") return "timeout";
  if (result.kind === "aborted") return "aborted";
  return "scan-failed";
}

/** 运行同包 integration CLI，并把 0/2 之外的状态全部安全归类。 */
export async function inspectForDsh(
  options: DshAdapterScanOptions = {}
): Promise<DshAdapterScanResult> {
  const cliPath = options.cliPath ?? bundledCliPath();
  const cliExists = options.cliExists ?? existsSync;
  if (!cliExists(cliPath)) return { ok: false, reason: "cli-missing" };

  const processRunner = options.processRunner ?? runDshProcess;
  const request = (args: string[]): DshProcessRequest => ({
    executable: options.nodePath ?? process.execPath,
    args: [cliPath, ...args],
    cwd: options.cwd ?? process.cwd(),
    env: { ...(options.env ?? process.env) },
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxOutputBytes: MAX_OUTPUT_BYTES,
  });

  const version = await processRunner(request(["--version"]));
  if (version.kind !== "completed") {
    return { ok: false, reason: mapProcessFailure(version) };
  }
  if (version.exitCode !== 0 || version.stdout.trim() !== PRODUCT_VERSION) {
    return { ok: false, reason: "version-mismatch" };
  }

  const scan = await processRunner(
    request(["integration", "scan", "--format", "model-json"])
  );
  if (scan.kind !== "completed") {
    return { ok: false, reason: mapProcessFailure(scan) };
  }
  if (scan.exitCode !== 0 && scan.exitCode !== 2) {
    return { ok: false, reason: "scan-failed" };
  }
  try {
    const report = validateModelSafeScan(JSON.parse(scan.stdout));
    return {
      ok: true,
      status: scan.exitCode === 2 ? "needs-attention" : "clear",
      report,
    };
  } catch {
    return { ok: false, reason: "invalid-output" };
  }
}

const AGENT_LABELS: Record<ModelSafeScanV1["topRisks"][number]["agent"], string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "cc-switch": "CC Switch",
  opencode: "OpenCode",
  gemini: "Gemini CLI",
  openclaw: "OpenClaw",
  workspace: "项目工作区",
  "cross-agent": "跨 Agent",
};

const CATEGORY_LABELS: Record<ModelSafeRiskCategory, string> = {
  authentication: "认证来源",
  configuration: "配置完整性",
  correlation: "集中或复用",
  mcp: "MCP",
  permission: "权限",
  privacy: "隐私",
  provider: "Provider 路由",
  secret: "凭据",
  "supply-chain": "供应链",
  workspace: "敏感文件",
  other: "配置复核",
};

const FAILURE_TEXT: Record<DshAdapterFailure, string> = {
  "cli-missing": "AgentReveal 安装不完整，请重新安装插件后再试。",
  "version-mismatch": "AgentReveal 插件与本机 CLI 版本不一致，请重新安装或升级插件。",
  "scan-failed": "AgentReveal 本地只读检查未完成，请在 AgentReveal 中查看诊断。",
  "invalid-output": "AgentReveal 返回了不受支持的安全摘要，请升级后重试。",
  timeout: "AgentReveal 本地只读检查超时，请缩小项目范围后重试。",
  aborted: "AgentReveal 本地只读检查已取消。",
};

export interface DshCommandResult {
  kind: "success" | "error";
  text: string;
}

/** 只渲染校验后的枚举与计数；忽略 integration JSON 中的任何动态展示文本。 */
export function renderDshResult(result: DshAdapterScanResult): DshCommandResult {
  if (!result.ok) return { kind: "error", text: FAILURE_TEXT[result.reason] };
  const { report } = result;
  const headline =
    result.status === "needs-attention"
      ? `发现 ${report.summary.actionableTaskCount} 个需要处理或确认的本地安全任务。`
      : "本次本地只读检查未发现高风险任务。";
  const risks = report.topRisks.map(
    (risk, index) =>
      `${index + 1}. [${risk.priority}/${risk.severity}] ${AGENT_LABELS[risk.agent]} · ` +
      `${CATEGORY_LABELS[risk.category]} · ${risk.ruleIds.join(", ")}`
  );
  const omitted =
    report.summary.omittedActionableTaskCount > 0
      ? [`另有 ${report.summary.omittedActionableTaskCount} 个任务未在 Top 3 展开。`]
      : [];
  return {
    kind: "success",
    text: [
      "AgentReveal 本地只读检查",
      headline,
      `已配置 Agent：${report.summary.configuredAgents}`,
      ...risks,
      ...omitted,
      "请在 AgentReveal CLI 或 macOS Desktop 中查看技术证据并完成处置。",
      "本次命令不上传配置、路径、端点或凭据。",
    ].join("\n"),
  };
}

/** DSH `/agentreveal` handler；不接受参数，也不把命令交给模型。 */
export async function runDshAgentRevealCommand(input: {
  rawInput: string;
  signal?: AbortSignal;
  cwd?: string;
}): Promise<DshCommandResult> {
  if (input.rawInput.trim().length > 0) {
    return { kind: "error", text: "用法：/agentreveal（当前只支持无参数的本地只读检查）。" };
  }
  return renderDshResult(
    await inspectForDsh({ cwd: input.cwd, signal: input.signal })
  );
}
