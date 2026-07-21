/**
 * 安全基线 dry-run。
 *
 * MVP 阶段只对 OpenCode 的有限高风险配置生成内存计划和 diff，不写文件。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentId, DiscoveryContext } from "../../adapters/types.js";
import { opencodeAdapter } from "../../adapters/opencode/index.js";
import { claudeCodeAdapter } from "../../adapters/claude-code/index.js";
import { geminiAdapter } from "../../adapters/gemini/index.js";
import { openclawAdapter } from "../../adapters/openclaw/index.js";
import { isDangerousAllow } from "../../adapters/claude-code/risk.js";
import { isLoopbackBind } from "../../adapters/openclaw/risk.js";
import { fileExists } from "../discovery/fs-utils.js";
import { buildContext } from "../discovery/index.js";

export type BaselineProfile = "safe" | "balanced";

export interface BaselineChange {
  agent: AgentId;
  configPath: string;
  path: string;
  from: unknown;
  to: unknown;
  reason: string;
}

export interface BaselineFilePlan {
  agent: AgentId;
  configPath: string;
  changes: BaselineChange[];
  diff: string;
}

export interface BaselineFileEdit extends BaselineFilePlan {
  nextConfig: Record<string, unknown>;
  /** 生成计划时源文件的哈希；apply 前用于检测并发修改。 */
  sourceHash: string;
}

type BaselineFileEditDraft = Omit<BaselineFileEdit, "sourceHash">;

export interface BaselinePlan {
  profile: BaselineProfile;
  dryRun: true;
  files: BaselineFilePlan[];
  warnings: string[];
}

/**
 * 对用户实际看到的 profile + 文件变更计算稳定指纹。
 * apply 可据此拒绝与已确认预览不一致的计划；指纹不暴露配置内容。
 */
export function baselinePlanFingerprint(
  plan: Pick<BaselinePlan, "profile" | "files">
): string {
  const payload = {
    profile: plan.profile,
    files: plan.files.map((file) => ({
      agent: file.agent,
      configPath: file.configPath,
      changes: file.changes.map((change) => ({
        path: change.path,
        from: change.from,
        to: change.to,
        reason: change.reason,
      })),
    })),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function renderValue(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  return JSON.stringify(v);
}

function renderChangeDiff(path: string, changes: BaselineChange[]): string {
  return [
    `--- ${path}`,
    `+++ ${path} (dry-run)`,
    "@@ AgentGuard baseline changes",
    ...changes.flatMap((c) => [
      `- ${c.path}: ${renderValue(c.from)}`,
      `+ ${c.path}: ${renderValue(c.to)}`,
    ]),
    "",
  ].join("\n");
}

function setValue(
  changes: BaselineChange[],
  agent: AgentId,
  configPath: string,
  path: string,
  from: unknown,
  to: unknown,
  reason: string
): void {
  if (from === to) return;
  changes.push({
    agent,
    configPath,
    path,
    from,
    to,
    reason,
  });
}

function hardenPermission(
  profile: BaselineProfile,
  cfg: Record<string, unknown>,
  next: Record<string, unknown>,
  configPath: string,
  changes: BaselineChange[]
): void {
  const perm = cfg.permission;
  const nextPerm = asRecord(next.permission);

  if (perm === "allow") {
    next.permission =
      profile === "safe"
        ? { bash: "ask", edit: "ask", webfetch: "ask" }
        : { bash: "ask", edit: "allow", webfetch: "allow" };
    setValue(
      changes,
      "opencode",
      configPath,
      "permission",
      "allow",
      next.permission,
      "顶层 permission=allow 会放大所有工具权限，dry-run 建议改为显式分项配置。"
    );
    return;
  }

  if (nextPerm.bash === "allow") {
    nextPerm.bash = "ask";
    setValue(
      changes,
      "opencode",
      configPath,
      "permission.bash",
      "allow",
      "ask",
      "Bash 无确认执行风险高，建议至少改为 ask。"
    );
  }

  if (profile === "safe") {
    for (const key of ["edit", "webfetch"]) {
      if (nextPerm[key] === "allow") {
        nextPerm[key] = "ask";
        setValue(
          changes,
          "opencode",
          configPath,
          `permission.${key}`,
          "allow",
          "ask",
          "safe 基线要求高影响工具默认询问。"
        );
      }
    }
  }

  if (Object.keys(nextPerm).length > 0) next.permission = nextPerm;
}

function hardenOpenCodeConfig(
  profile: BaselineProfile,
  configPath: string,
  cfg: Record<string, unknown>
): BaselineFileEditDraft | undefined {
  const next = cloneJson(cfg);
  const changes: BaselineChange[] = [];

  hardenPermission(profile, cfg, next, configPath, changes);

  if (cfg.share === "auto") {
    const target = profile === "safe" ? "disabled" : "manual";
    next.share = target;
    setValue(
      changes,
      "opencode",
      configPath,
      "share",
      "auto",
      target,
      "share=auto 会自动上传会话上下文，建议改为手动或关闭。"
    );
  }

  if (cfg.autoupdate === true) {
    next.autoupdate = false;
    setValue(
      changes,
      "opencode",
      configPath,
      "autoupdate",
      true,
      false,
      "受管环境建议关闭自动更新，改为审阅后升级。"
    );
  }

  if (changes.length === 0) return undefined;
  return {
    agent: "opencode",
    configPath,
    changes,
    diff: renderChangeDiff(configPath, changes),
    nextConfig: next,
  };
}

/** 收敛 Claude Code 单个 settings 文件（settings.json 或 settings.local.json）。 */
function hardenClaudeConfig(
  _profile: BaselineProfile,
  configPath: string,
  cfg: Record<string, unknown>
): BaselineFileEditDraft | undefined {
  const next = cloneJson(cfg);
  const changes: BaselineChange[] = [];
  const perm = asRecord(next.permissions);

  // —— bypassPermissions → default ——
  if (perm.defaultMode === "bypassPermissions") {
    perm.defaultMode = "default";
    next.permissions = perm;
    setValue(
      changes,
      "claude-code",
      configPath,
      "permissions.defaultMode",
      "bypassPermissions",
      "default",
      "bypassPermissions 会无条件跳过所有工具确认，建议改回 default。"
    );
  }

  // —— permissions.allow 中的无约束 Bash / 通配规则 → 移除 ——
  const allow = Array.isArray(perm.allow)
    ? perm.allow.filter((x): x is string => typeof x === "string")
    : undefined;
  if (allow) {
    const dangerous = allow.filter(isDangerousAllow);
    if (dangerous.length > 0) {
      const kept = allow.filter((r) => !isDangerousAllow(r));
      perm.allow = kept;
      next.permissions = perm;
      setValue(
        changes,
        "claude-code",
        configPath,
        "permissions.allow",
        allow,
        kept,
        `移除 ${dangerous.length} 条无约束 Bash / 通配 allow 规则（等价放行任意命令）。`
      );
    }
  }

  // —— enableAllProjectMcpServers → false ——
  if (next.enableAllProjectMcpServers === true) {
    next.enableAllProjectMcpServers = false;
    setValue(
      changes,
      "claude-code",
      configPath,
      "enableAllProjectMcpServers",
      true,
      false,
      "自动启用项目内全部 MCP 可能加载不可信工具，建议改为按需批准。"
    );
  }

  if (changes.length === 0) return undefined;
  return {
    agent: "claude-code",
    configPath,
    changes,
    diff: renderChangeDiff(configPath, changes),
    nextConfig: next,
  };
}

/** 收敛 Gemini CLI settings.json：关闭 MCP per-server trust。 */
function hardenGeminiConfig(
  _profile: BaselineProfile,
  configPath: string,
  cfg: Record<string, unknown>
): BaselineFileEditDraft | undefined {
  const next = cloneJson(cfg);
  const changes: BaselineChange[] = [];
  const servers = asRecord(next.mcpServers);

  for (const [name, raw] of Object.entries(servers)) {
    const s = asRecord(raw);
    if (s.trust === true) {
      s.trust = false;
      servers[name] = s;
      setValue(
        changes,
        "gemini",
        configPath,
        `mcpServers.${name}.trust`,
        true,
        false,
        `MCP "${name}" 的 trust=true 会绕过该 server 全部工具确认（等价 per-server YOLO）。`
      );
    }
  }
  if (changes.length > 0) next.mcpServers = servers;

  if (changes.length === 0) return undefined;
  return {
    agent: "gemini",
    configPath,
    changes,
    diff: renderChangeDiff(configPath, changes),
    nextConfig: next,
  };
}

/**
 * 收敛 OpenClaw openclaw.json 的网络暴露面：
 * - gateway.bind 非 loopback → 127.0.0.1
 * - gateway.tailscale.mode funnel/public/expose → off
 * 明文 secret 不动（继续只报告）。
 */
function hardenOpenClawConfig(
  _profile: BaselineProfile,
  configPath: string,
  cfg: Record<string, unknown>
): BaselineFileEditDraft | undefined {
  const next = cloneJson(cfg);
  const changes: BaselineChange[] = [];
  const gw = asRecord(next.gateway);

  // —— gateway.bind 非 loopback → 127.0.0.1 ——
  if (typeof gw.bind === "string" && !isLoopbackBind(gw.bind)) {
    const from = gw.bind;
    gw.bind = "127.0.0.1";
    next.gateway = gw;
    setValue(
      changes,
      "openclaw",
      configPath,
      "gateway.bind",
      from,
      "127.0.0.1",
      "网关绑定非 loopback 地址会把 HTTP API 暴露到同网段/公网，收敛回 127.0.0.1。"
    );
  }

  // —— gateway.tailscale.mode funnel/public/expose → off ——
  const ts = gw.tailscale;
  if (ts && typeof ts === "object" && !Array.isArray(ts)) {
    const tsr = ts as Record<string, unknown>;
    const mode = typeof tsr.mode === "string" ? tsr.mode.toLowerCase() : "";
    if (mode === "funnel" || mode === "public" || mode === "expose") {
      const from = tsr.mode;
      tsr.mode = "off";
      gw.tailscale = tsr;
      next.gateway = gw;
      setValue(
        changes,
        "openclaw",
        configPath,
        "gateway.tailscale.mode",
        from,
        "off",
        "Tailscale Funnel/public 会把网关发布到公网，收敛为 off 仅保留 Tailnet 内访问。"
      );
    }
  }

  if (changes.length === 0) return undefined;
  return {
    agent: "openclaw",
    configPath,
    changes,
    diff: renderChangeDiff(configPath, changes),
    nextConfig: next,
  };
}

function publicPlan(edit: BaselineFileEdit): BaselineFilePlan {
  return {
    agent: edit.agent,
    configPath: edit.configPath,
    changes: edit.changes,
    diff: edit.diff,
  };
}

/** 读取一个 JSON 配置文件并用给定 harden 函数产出 edit；解析失败进 warnings。 */
function hardenFile(
  label: string,
  configPath: string,
  harden: (cfg: Record<string, unknown>) => BaselineFileEditDraft | undefined,
  edits: BaselineFileEdit[],
  warnings: string[]
): void {
  try {
    const source = readFileSync(configPath, "utf8");
    const cfg = asRecord(JSON.parse(source));
    const edit = harden(cfg);
    if (edit) edits.push({ ...edit, sourceHash: contentHash(source) });
  } catch (err) {
    warnings.push(
      `${label} 配置无法解析，已跳过：${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

export async function buildBaselineEdits(
  profile: BaselineProfile,
  ctx: DiscoveryContext = buildContext()
): Promise<{ edits: BaselineFileEdit[]; warnings: string[] }> {
  const warnings: string[] = [];
  const edits: BaselineFileEdit[] = [];

  // —— OpenCode ——
  const oc = await opencodeAdapter.discover(ctx);
  if (oc.configFound && oc.configPath) {
    hardenFile(
      "OpenCode",
      oc.configPath,
      (cfg) => hardenOpenCodeConfig(profile, oc.configPath!, cfg),
      edits,
      warnings
    );
  } else {
    warnings.push("未发现 OpenCode 配置，当前 baseline 无可处理文件。");
  }

  // —— Claude Code（configPath 为目录，含 settings.json + settings.local.json）——
  const claude = await claudeCodeAdapter.discover(ctx);
  if (claude.configFound && claude.configPath) {
    for (const file of ["settings.json", "settings.local.json"]) {
      const p = join(claude.configPath, file);
      if (!fileExists(p)) continue;
      hardenFile(
        "Claude Code",
        p,
        (cfg) => hardenClaudeConfig(profile, p, cfg),
        edits,
        warnings
      );
    }
  }

  // —— Gemini CLI（configPath 直接是 settings.json）——
  const gemini = await geminiAdapter.discover(ctx);
  if (gemini.configFound && gemini.configPath) {
    hardenFile(
      "Gemini CLI",
      gemini.configPath,
      (cfg) => hardenGeminiConfig(profile, gemini.configPath!, cfg),
      edits,
      warnings
    );
  }

  // —— OpenClaw（configPath 直接是 openclaw.json）——
  const openclaw = await openclawAdapter.discover(ctx);
  if (openclaw.configFound && openclaw.configPath) {
    hardenFile(
      "OpenClaw",
      openclaw.configPath,
      (cfg) => hardenOpenClawConfig(profile, openclaw.configPath!, cfg),
      edits,
      warnings
    );
  }

  return { edits, warnings };
}

export async function buildBaselinePlan(
  profile: BaselineProfile,
  ctx: DiscoveryContext = buildContext()
): Promise<BaselinePlan> {
  const { edits, warnings } = await buildBaselineEdits(profile, ctx);
  return {
    profile,
    dryRun: true,
    files: edits.map(publicPlan),
    warnings: warnings.map((w) =>
      w === "未发现 OpenCode 配置，当前 baseline 无可处理文件。"
        ? "未发现 OpenCode 配置，当前 baseline dry-run 无可处理文件。"
        : w
    ),
  };
}
