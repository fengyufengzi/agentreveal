import { RULE_IDS } from "../../rules/ids.js";
import { enrichFinding } from "../action/index.js";
function isActionTask(target) {
    return "items" in target && "primary" in target;
}
function contextOf(target) {
    if (!isActionTask(target)) {
        const finding = target.action ? target : enrichFinding(target);
        return {
            items: [{ finding, action: finding.action }],
            primary: { finding, action: finding.action },
        };
    }
    return {
        items: target.items.map((item) => ({
            finding: item.finding,
            action: item.action,
        })),
        primary: {
            finding: target.primary.finding,
            action: target.primary.action,
        },
    };
}
function resolvePlatform(platform) {
    return platform === "darwin" || platform === "linux" || platform === "win32"
        ? platform
        : "unsupported";
}
/** 只允许规则 ID 进入环境变量、服务名和文件名；任何其它字符都被丢弃。 */
function safeRuleToken(ruleIds) {
    const known = new Set(RULE_IDS);
    const seed = ruleIds.find((id) => known.has(id)) ?? "FINDING";
    const token = seed.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 48);
    return token || "FINDING";
}
function storageToken(target, ruleIds) {
    const rule = safeRuleToken(ruleIds);
    if (!isActionTask(target))
        return rule;
    const task = target.taskId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
    return task ? `${rule}_${task}` : rule;
}
/** 仅映射目标工具确实读取的标准变量；未知 Provider/渠道绝不虚构变量名。 */
function realEnvironmentName(ruleIds) {
    const names = new Set();
    for (const id of ruleIds) {
        if (id === "CLAUDE_PLAINTEXT_TOKEN")
            names.add("ANTHROPIC_AUTH_TOKEN");
        if (id === "CODEX_PLAINTEXT_API_KEY")
            names.add("OPENAI_API_KEY");
        if (id === "GEMINI_PLAINTEXT_ENV_KEY")
            names.add("GEMINI_API_KEY");
    }
    return names.size === 1 ? [...names][0] : undefined;
}
function uniqueRuleIds(ctx) {
    return [...new Set(ctx.items.map(({ finding }) => finding.id))];
}
function actionableActions(ctx) {
    return ctx.items
        .map(({ action }) => action)
        .filter((action) => action !== undefined && action.disposition !== "observe");
}
function remediationMode(ctx) {
    const actions = actionableActions(ctx);
    if (actions.length === 0 && ctx.primary.action?.disposition === "observe") {
        return "none";
    }
    if (actions.length > 0 && actions.every((action) => action.fixMode === "baseline")) {
        return "baseline";
    }
    return "guided";
}
function shellFor(platform) {
    return platform === "win32" ? "powershell" : "sh";
}
function verifyCommand(platform) {
    return {
        id: "verify-scan",
        label: "重新扫描验证",
        command: "agentguard scan",
        shell: shellFor(platform),
        kind: "verify",
        completesRemediation: false,
    };
}
function baselineCommands(platform, profile) {
    const shell = shellFor(platform);
    return [
        {
            id: "baseline-preview",
            label: "预览全部 baseline 变更",
            command: `agentguard baseline --profile ${profile} --dry-run`,
            shell,
            kind: "preview",
            completesRemediation: false,
        },
        {
            id: "baseline-apply",
            label: "确认预览后，带备份应用",
            command: `agentguard apply --profile ${profile} --backup`,
            shell,
            kind: "apply",
            completesRemediation: true,
        },
        verifyCommand(platform),
    ];
}
function macSecretCommands(token, envName) {
    const service = `AgentGuard/${token}`;
    const commands = [
        {
            id: "macos-keychain",
            label: "将新凭证写入 macOS Keychain（命令会安全提示输入）",
            command: `security add-generic-password -U -a "$USER" -s '${service}' -w`,
            shell: "sh",
            kind: "store",
            completesRemediation: false,
        },
        {
            id: "macos-keychain-check",
            label: "确认 Keychain 项可读取，但不打印凭证",
            command: `security find-generic-password -a "$USER" -s '${service}' -w >/dev/null && printf 'Keychain item is readable\\n'`,
            shell: "sh",
            kind: "inspect",
            completesRemediation: false,
        },
    ];
    if (envName) {
        commands.push({
            id: "macos-session-inject",
            label: `从 Keychain 仅向当前终端会话注入 ${envName}`,
            command: `export ${envName}="$(security find-generic-password -a "$USER" -s '${service}' -w)"`,
            shell: "sh",
            kind: "inject",
            completesRemediation: false,
        });
    }
    return commands;
}
function linuxSecretCommands(token, envName) {
    const commands = [
        {
            id: "linux-secret-service",
            label: "通过 Secret Service 安全存储凭证（命令随后从标准输入读取）",
            command: `trap 'stty echo' EXIT INT TERM; printf 'Credential: ' >&2; stty -echo; IFS= read -r AGENTGUARD_INPUT; stty echo; trap - EXIT INT TERM; printf '\n' >&2; printf '%s' "$AGENTGUARD_INPUT" | secret-tool store --label='AgentGuard ${token}' service agentguard rule '${token}' account "$USER"; unset AGENTGUARD_INPUT`,
            shell: "sh",
            kind: "store",
            completesRemediation: false,
        },
    ];
    if (envName) {
        commands.push({
            id: "linux-session-inject",
            label: `从 Secret Service 仅向当前 shell 会话注入 ${envName}`,
            command: `export ${envName}="$(secret-tool lookup service agentguard rule '${token}' account "$USER")"`,
            shell: "sh",
            kind: "inject",
            completesRemediation: false,
        });
    }
    return commands;
}
function windowsSecretCommands(token, envName) {
    const commands = [
        {
            id: "windows-dpapi-credential",
            label: "通过 Windows 用户 DPAPI 保存凭证",
            command: `$dir = Join-Path $env:APPDATA 'AgentGuard'; New-Item -ItemType Directory -Force $dir | Out-Null; $path = Join-Path $dir '${token}.credential.xml'; Get-Credential -Message 'AgentGuard credential' | Export-Clixml $path`,
            shell: "powershell",
            kind: "store",
            completesRemediation: false,
        },
    ];
    if (envName) {
        commands.push({
            id: "windows-process-environment",
            label: `从 DPAPI 凭证文件仅向当前 PowerShell 进程注入 ${envName}`,
            command: `$path = Join-Path (Join-Path $env:APPDATA 'AgentGuard') '${token}.credential.xml'; $credential = Import-Clixml $path; $env:${envName} = $credential.GetNetworkCredential().Password; Remove-Variable credential`,
            shell: "powershell",
            kind: "inject",
            completesRemediation: false,
        });
    }
    return commands;
}
function isSecretFinding(ctx) {
    return ctx.items.some(({ finding }) => finding.category === "secret");
}
function isCcSwitchSecret(ctx) {
    return ctx.items.some(({ finding }) => finding.category === "secret" && finding.id.startsWith("CCSWITCH_"));
}
function secretCommands(platform, token, envName) {
    if (platform === "darwin")
        return macSecretCommands(token, envName);
    if (platform === "linux")
        return linuxSecretCommands(token, envName);
    if (platform === "win32")
        return windowsSecretCommands(token, envName);
    return [];
}
export function buildRemediationGuide(target, options = {}) {
    const ctx = contextOf(target);
    const platform = resolvePlatform(options.platform ?? process.platform);
    const ruleIds = uniqueRuleIds(ctx);
    const mode = remediationMode(ctx);
    const notes = [];
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
                "apply 会创建备份；如结果不符合预期，可使用 agentguard restore。",
            ],
        };
    }
    const commands = [];
    if (isCcSwitchSecret(ctx)) {
        notes.push("CC Switch 凭证存于应用数据库；请只在 CC Switch 原应用中清除、替换并轮换凭证，AgentGuard 不生成数据库迁移或写入命令。");
    }
    else if (isSecretFinding(ctx)) {
        commands.push(...secretCommands(platform, storageToken(target, ruleIds), realEnvironmentName(ruleIds)));
        if (platform === "darwin") {
            notes.push("macOS 优先使用 Keychain；存储后仍需配置受控 helper/launcher 读取。当前会话环境变量不会自动持久化。更新工具配置后删除并轮换原明文凭证。");
        }
        else if (platform === "linux") {
            notes.push("Secret Service 需要 secret-tool 和已解锁的桌面密钥环；存储后仍需配置受控 helper/launcher 读取。无桌面服务时使用进程级安全注入。更新配置后轮换旧凭证。");
        }
        else if (platform === "win32") {
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
//# sourceMappingURL=index.js.map