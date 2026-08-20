/**
 * 按操作系统生成安全、可复制的整改命令。
 *
 * 安全边界：
 * - 绝不把 finding evidence、标题或凭证值拼进命令。
 * - 只有现有 baseline 能力可标为 baseline；其它情况均为 guided/none。
 * - 凭证迁移命令只为明确支持的配置生成窄范围修改；其它 Agent 仍只提供安全存储或当前会话注入。
 */
import type { FindingAction, RiskFinding } from "../../adapters/types.js";
import { RULE_IDS } from "../../rules/ids.js";
import { enrichFinding, type ActionItem, type ActionTask } from "../action/index.js";

export type RemediationPlatform = "darwin" | "linux" | "win32";
export type ResolvedPlatform = RemediationPlatform | "unsupported";
export type RemediationMode = "baseline" | "guided" | "none";

export interface RemediationCommand {
  id: string;
  label: string;
  command: string;
  shell: "sh" | "powershell";
  kind: "preview" | "apply" | "backup" | "store" | "configure" | "inject" | "inspect" | "verify";
  /** false 表示命令只辅助人工处置，不能声称已自动修复 finding。 */
  completesRemediation: boolean;
}

export interface RemediationGuide {
  platform: ResolvedPlatform;
  mode: RemediationMode;
  ruleIds: string[];
  commands: RemediationCommand[];
  notes: string[];
}

export interface RemediationOptions {
  /** 缺省读取 process.platform；测试和跨平台报告可显式指定。 */
  platform?: NodeJS.Platform;
  /** baseline 命令使用的 profile；缺省 balanced。 */
  profile?: "safe" | "balanced";
}

interface TargetContext {
  items: Array<{ finding: RiskFinding; action?: FindingAction }>;
  primary: { finding: RiskFinding; action?: FindingAction };
}

function isActionTask(target: RiskFinding | ActionTask): target is ActionTask {
  return "items" in target && "primary" in target;
}

function contextOf(target: RiskFinding | ActionTask): TargetContext {
  if (!isActionTask(target)) {
    const finding = target.action ? target : enrichFinding(target);
    return {
      items: [{ finding, action: finding.action }],
      primary: { finding, action: finding.action },
    };
  }
  return {
    items: target.items.map((item: ActionItem) => ({
      finding: item.finding,
      action: item.action,
    })),
    primary: {
      finding: target.primary.finding,
      action: target.primary.action,
    },
  };
}

function resolvePlatform(platform: NodeJS.Platform): ResolvedPlatform {
  return platform === "darwin" || platform === "linux" || platform === "win32"
    ? platform
    : "unsupported";
}

/** 只允许规则 ID 进入环境变量、服务名和文件名；任何其它字符都被丢弃。 */
function safeRuleToken(ruleIds: string[]): string {
  const known = new Set<string>(RULE_IDS);
  const seed = ruleIds.find((id) => known.has(id)) ?? "FINDING";
  const token = seed.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 48);
  return token || "FINDING";
}

function storageToken(
  target: RiskFinding | ActionTask,
  ruleIds: string[]
): string {
  const rule = ruleIds.includes("CLAUDE_PLAINTEXT_TOKEN")
    ? "CLAUDE_PLAINTEXT_TOKEN"
    : safeRuleToken(ruleIds);
  if (!isActionTask(target)) return rule;
  const task = target.taskId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return task ? `${rule}_${task}` : rule;
}

/** Claude 凭证迁移使用的稳定 Keychain service；只由已校验 taskId 派生。 */
export function claudeCredentialKeychainService(taskId: string): string {
  if (!/^task-[A-Za-z0-9_-]{6,128}$/.test(taskId)) {
    throw new Error("无效的任务 ID。");
  }
  return `AgentReveal/CLAUDE_PLAINTEXT_TOKEN_${taskId}`;
}

/** 写入 Claude 设置的固定 helper，不包含凭证、路径或 renderer 输入。 */
export function claudeCredentialApiKeyHelper(taskId: string): string {
  return `security find-generic-password -a "$USER" -s "${claudeCredentialKeychainService(taskId)}" -w`;
}

/** 仅映射目标工具确实读取的标准变量；未知 Provider/渠道绝不虚构变量名。 */
function realEnvironmentName(ruleIds: string[]): string | undefined {
  const names = new Set<string>();
  for (const id of ruleIds) {
    if (id === "CLAUDE_PLAINTEXT_TOKEN") names.add("ANTHROPIC_AUTH_TOKEN");
    if (id === "CODEX_PLAINTEXT_API_KEY") names.add("OPENAI_API_KEY");
    if (id === "GEMINI_PLAINTEXT_ENV_KEY") names.add("GEMINI_API_KEY");
  }
  return names.size === 1 ? [...names][0] : undefined;
}

function uniqueRuleIds(ctx: TargetContext): string[] {
  return [...new Set(ctx.items.map(({ finding }) => finding.id))];
}

function actionableActions(ctx: TargetContext): FindingAction[] {
  return ctx.items
    .map(({ action }) => action)
    .filter(
      (action): action is FindingAction =>
        action !== undefined && action.disposition !== "observe"
    );
}

function remediationMode(ctx: TargetContext): RemediationMode {
  const actions = actionableActions(ctx);
  if (actions.length === 0 && ctx.primary.action?.disposition === "observe") {
    return "none";
  }
  if (actions.length > 0 && actions.every((action) => action.fixMode === "baseline")) {
    return "baseline";
  }
  return "guided";
}

function shellFor(platform: ResolvedPlatform): "sh" | "powershell" {
  return platform === "win32" ? "powershell" : "sh";
}

function verifyCommand(platform: ResolvedPlatform): RemediationCommand {
  return {
    id: "verify-scan",
    label: "重新扫描验证",
    command: "agentreveal scan",
    shell: shellFor(platform),
    kind: "verify",
    completesRemediation: false,
  };
}

function claudeCredentialBackupCommand(
  target: RiskFinding | ActionTask,
  platform: ResolvedPlatform,
  ruleIds: string[]
): RemediationCommand | undefined {
  if (
    platform !== "darwin" ||
    !isActionTask(target) ||
    !ruleIds.includes("CLAUDE_PLAINTEXT_TOKEN") ||
    !/^task-[A-Za-z0-9_-]{6,128}$/.test(target.taskId)
  ) {
    return undefined;
  }
  return {
    id: "claude-credential-backup",
    label: "先备份 Claude Code 迁移涉及的设置文件",
    command: `agentreveal credential backup ${target.taskId}`,
    shell: "sh",
    kind: "backup",
    completesRemediation: false,
  };
}

function baselineCommands(
  platform: ResolvedPlatform,
  profile: "safe" | "balanced"
): RemediationCommand[] {
  const shell = shellFor(platform);
  return [
    {
      id: "baseline-preview",
      label: "预览全部 baseline 变更",
      command: `agentreveal baseline --profile ${profile} --dry-run`,
      shell,
      kind: "preview",
      completesRemediation: false,
    },
    {
      id: "baseline-apply",
      label: "确认预览后，带备份应用",
      command: `agentreveal apply --profile ${profile} --backup`,
      shell,
      kind: "apply",
      completesRemediation: true,
    },
    verifyCommand(platform),
  ];
}

function macSecretCommands(
  token: string,
  envName: string | undefined,
  ruleIds: string[]
): RemediationCommand[] {
  const service = `AgentReveal/${token}`;
  const commands: RemediationCommand[] = [
    {
      id: "macos-keychain",
      label: "将新凭证写入 macOS Keychain（命令会安全提示输入）",
      command: `security add-generic-password -U -a "$USER" -s '${service}' -w`,
      shell: "sh",
      kind: "store",
      completesRemediation: false,
    },
  ];
  if (ruleIds.includes("CLAUDE_PLAINTEXT_TOKEN")) {
    commands.push({
      id: "macos-claude-keychain-helper",
      label: "删除 Claude Code 配置中的明文，并改用 Keychain helper",
      command: `AGENTREVEAL_CLAUDE_DIR="\${CLAUDE_CONFIG_DIR:-$HOME/.claude}"; AGENTREVEAL_HELPER='security find-generic-password -a "$USER" -s "${service}" -w'; for AGENTREVEAL_FILE in "$AGENTREVEAL_CLAUDE_DIR/settings.json" "$AGENTREVEAL_CLAUDE_DIR/settings.local.json"; do [ -f "$AGENTREVEAL_FILE" ] || continue; if /usr/bin/plutil -extract env.ANTHROPIC_AUTH_TOKEN raw -o - "$AGENTREVEAL_FILE" >/dev/null 2>&1 || /usr/bin/plutil -extract env.ANTHROPIC_API_KEY raw -o - "$AGENTREVEAL_FILE" >/dev/null 2>&1; then /usr/bin/plutil -replace apiKeyHelper -string "$AGENTREVEAL_HELPER" "$AGENTREVEAL_FILE" && { /usr/bin/plutil -remove env.ANTHROPIC_AUTH_TOKEN "$AGENTREVEAL_FILE" 2>/dev/null || true; } && { /usr/bin/plutil -remove env.ANTHROPIC_API_KEY "$AGENTREVEAL_FILE" 2>/dev/null || true; } && chmod 600 "$AGENTREVEAL_FILE" && /usr/bin/plutil -lint "$AGENTREVEAL_FILE"; fi; done; unset AGENTREVEAL_CLAUDE_DIR AGENTREVEAL_HELPER AGENTREVEAL_FILE`,
      shell: "sh",
      kind: "configure",
      completesRemediation: false,
    });
  } else if (envName) {
    commands.push({
      id: "macos-session-inject",
      label: `从 Keychain 仅向当前终端会话注入 ${envName}`,
      command: `export ${envName}="$(security find-generic-password -a "$USER" -s '${service}' -w)"`,
      shell: "sh",
      kind: "inject",
      completesRemediation: false,
    });
  }
  commands.push({
    id: "macos-keychain-check",
    label: "确认 Keychain 项可读取，但不打印凭证",
    command: `security find-generic-password -a "$USER" -s '${service}' -w >/dev/null && printf 'Keychain item is readable\\n'`,
    shell: "sh",
    kind: "inspect",
    completesRemediation: false,
  });
  return commands;
}

function linuxSecretCommands(
  token: string,
  envName: string | undefined
): RemediationCommand[] {
  const commands: RemediationCommand[] = [
    {
      id: "linux-secret-service",
      label: "通过 Secret Service 安全存储凭证（命令随后从标准输入读取）",
      command: `trap 'stty echo' EXIT INT TERM; printf 'Credential: ' >&2; stty -echo; IFS= read -r AGENTREVEAL_INPUT; stty echo; trap - EXIT INT TERM; printf '\n' >&2; printf '%s' "$AGENTREVEAL_INPUT" | secret-tool store --label='AgentReveal ${token}' service agentreveal rule '${token}' account "$USER"; unset AGENTREVEAL_INPUT`,
      shell: "sh",
      kind: "store",
      completesRemediation: false,
    },
  ];
  if (envName) {
    commands.push({
      id: "linux-session-inject",
      label: `从 Secret Service 仅向当前 shell 会话注入 ${envName}`,
      command: `export ${envName}="$(secret-tool lookup service agentreveal rule '${token}' account "$USER")"`,
      shell: "sh",
      kind: "inject",
      completesRemediation: false,
    });
  }
  return commands;
}

function windowsSecretCommands(
  token: string,
  envName: string | undefined
): RemediationCommand[] {
  const commands: RemediationCommand[] = [
    {
      id: "windows-dpapi-credential",
      label: "通过 Windows 用户 DPAPI 保存凭证",
      command: `$dir = Join-Path $env:APPDATA 'AgentReveal'; New-Item -ItemType Directory -Force $dir | Out-Null; $path = Join-Path $dir '${token}.credential.xml'; Get-Credential -Message 'AgentReveal credential' | Export-Clixml $path`,
      shell: "powershell",
      kind: "store",
      completesRemediation: false,
    },
  ];
  if (envName) {
    commands.push({
      id: "windows-process-environment",
      label: `从 DPAPI 凭证文件仅向当前 PowerShell 进程注入 ${envName}`,
      command: `$path = Join-Path (Join-Path $env:APPDATA 'AgentReveal') '${token}.credential.xml'; $credential = Import-Clixml $path; $env:${envName} = $credential.GetNetworkCredential().Password; Remove-Variable credential`,
      shell: "powershell",
      kind: "inject",
      completesRemediation: false,
    });
  }
  return commands;
}

function isSecretFinding(ctx: TargetContext): boolean {
  return ctx.items.some(({ finding }) => finding.category === "secret");
}

function isCcSwitchSecret(ctx: TargetContext): boolean {
  return ctx.items.some(
    ({ finding }) =>
      finding.category === "secret" && finding.id.startsWith("CCSWITCH_")
  );
}

function ccSwitchPermissionCommands(
  platform: ResolvedPlatform
): RemediationCommand[] {
  if (platform !== "darwin" && platform !== "linux") return [];
  return [
    {
      id: "cc-switch-protect-storage",
      label: "收紧 CC Switch 数据库与备份权限",
      command: `chmod 700 "$HOME/.cc-switch" && chmod 600 "$HOME/.cc-switch/cc-switch.db" && { [ ! -d "$HOME/.cc-switch/backups" ] || { chmod 700 "$HOME/.cc-switch/backups" && find "$HOME/.cc-switch/backups" -type f -name 'db_backup_*.db' -exec chmod 600 {} +; }; }`,
      shell: "sh",
      kind: "configure",
      completesRemediation: false,
    },
  ];
}

function secretCommands(
  platform: ResolvedPlatform,
  token: string,
  envName: string | undefined,
  ruleIds: string[]
): RemediationCommand[] {
  if (platform === "darwin") return macSecretCommands(token, envName, ruleIds);
  if (platform === "linux") return linuxSecretCommands(token, envName);
  if (platform === "win32") return windowsSecretCommands(token, envName);
  return [];
}

export function buildRemediationGuide(
  target: RiskFinding | ActionTask,
  options: RemediationOptions = {}
): RemediationGuide {
  const ctx = contextOf(target);
  const platform = resolvePlatform(options.platform ?? process.platform);
  const ruleIds = uniqueRuleIds(ctx);
  const mode = remediationMode(ctx);
  const notes: string[] = [];

  if (mode === "none") {
    return {
      platform,
      mode,
      ruleIds,
      commands: [],
      notes: ["这是配置观察项；确认符合预期即可，不应伪装成待修复漏洞。"],
    };
  }

  if (mode === "baseline") {
    return {
      platform,
      mode,
      ruleIds,
      commands: baselineCommands(platform, options.profile ?? "balanced"),
      notes: [
        "先检查 dry-run；apply 会应用预览中的全部 baseline 变更，而非只修改当前 finding。",
        "apply 会创建备份；如结果不符合预期，可使用 agentreveal restore。",
      ],
    };
  }

  const commands: RemediationCommand[] = [];
  if (isCcSwitchSecret(ctx)) {
    commands.push(...ccSwitchPermissionCommands(platform));
    notes.push("CC Switch 普通 Provider 的 API Key/Token 输入框当前不解析环境变量名、${VAR} 或 {env:VAR}；不要把变量名当作 Token 填入，否则会鉴权失败。");
    notes.push("请先创建独立、最小权限的新 Token，在 CC Switch 原应用中替换并测试，再撤销旧 Token。AgentReveal 只提供本机权限加固命令，不写数据库，也不把权限加固声称为已删除明文。");
  } else if (isSecretFinding(ctx)) {
    const credentialBackup = claudeCredentialBackupCommand(
      target,
      platform,
      ruleIds
    );
    if (credentialBackup) commands.push(credentialBackup);
    commands.push(
      ...secretCommands(
        platform,
        storageToken(target, ruleIds),
        realEnvironmentName(ruleIds),
        ruleIds
      )
    );
    if (platform === "darwin") {
      if (ruleIds.includes("CLAUDE_PLAINTEXT_TOKEN")) {
        notes.push("Claude Code 官方支持 apiKeyHelper。CLI 用户应先执行任务对应的 credential backup；Desktop 用户点击一键备份。配置命令只处理实际包含明文字段的 settings.json/settings.local.json：设置 Keychain helper、删除 ANTHROPIC_AUTH_TOKEN/API_KEY，并保持文件为 0600；命令不会打印凭证。");
      } else {
        notes.push("macOS 优先使用 Keychain；存储后仍需配置受控 helper/launcher 读取。当前会话环境变量不会自动持久化。更新工具配置后删除并轮换原明文凭证。");
      }
    } else if (platform === "linux") {
      notes.push("Secret Service 需要 secret-tool 和已解锁的桌面密钥环；存储后仍需配置受控 helper/launcher 读取。无桌面服务时使用进程级安全注入。更新配置后轮换旧凭证。");
    } else if (platform === "win32") {
      notes.push("DPAPI 凭证文件绑定当前 Windows 用户；存储后仍需配置受控 helper/launcher 读取。可用时仅向当前 PowerShell 进程注入目标工具实际读取的变量，不写用户级环境或注册表。更新配置后轮换旧凭证。");
    }
  }

  if (platform === "unsupported") {
    notes.push("当前操作系统没有受支持的安全命令模板；请按 action.nextSteps 人工处置。 ");
  }
  notes.push("这些命令只辅助处置，不能单独证明风险已解决；完成配置修改或凭证轮换后必须重新扫描。");
  commands.push(verifyCommand(platform));

  return { platform, mode, ruleIds, commands, notes };
}
