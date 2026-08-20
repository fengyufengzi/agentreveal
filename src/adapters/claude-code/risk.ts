/**
 * Claude Code 风险规则。
 * 输入归一化数据，产出 RiskFinding[]。
 * evidence 均脱敏：只含 base_url / 规则字符串 / env 键名 / 计数，绝不含 token 值。
 */
import type { RiskFinding } from "../types.js";
import { classifyBaseUrl, type ProviderTrustPolicy } from "../../rules/provider.js";
import { PROXY_MANAGED_AUTH_LABEL } from "../../core/proxy-managed.js";
import { looksLikeSecretEnv, type ClaudeData } from "./parse.js";

/** 危险的 permissions.allow 模式：无约束 Bash / 通配。 */
export function isDangerousAllow(rule: string): boolean {
  const r = rule.trim();
  // Bash 无参数约束（等价放行任意命令）或显式通配。
  return /^Bash$/i.test(r) || /^Bash\(\s*\*\s*\)$/i.test(r) || r === "*";
}

export function buildClaudeCodeFindings(
  data: ClaudeData,
  providerPolicy: ProviderTrustPolicy = {}
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  // —— base_url 风险 ——
  if (data.baseUrl) {
    const cls = classifyBaseUrl(data.baseUrl, providerPolicy);
    if (cls.type === "local") {
      // 指向本地端点：真实上游取决于该本地服务（如 CC Switch 代理）。
      const proxyManagedOnly =
        data.proxyManagedPlaceholderPresent && !data.authTokenPresent;
      findings.push({
        id: "CLAUDE_LOCAL_BASE_URL",
        category: "provider",
        severity: "info",
        title: proxyManagedOnly
          ? "Claude Code 使用本地代理接管配置"
          : "ANTHROPIC_BASE_URL 指向本地端点",
        description: proxyManagedOnly
          ? `base_url 指向本地服务（${data.baseUrl}）；配置中的鉴权值是代理接管占位符，不是真实 Provider 凭证。真实上游取决于该本地进程。`
          : `base_url 指向本地服务（${data.baseUrl}），真实上游取决于该本地进程，勿误判为安全。`,
        evidence: {
          baseUrl: data.baseUrl,
          ...(proxyManagedOnly ? { authMode: PROXY_MANAGED_AUTH_LABEL } : {}),
        },
        recommendation: "确认该本地端点（如 CC Switch 代理）的真实上游可信。",
        fixable: false,
      });
    } else if (
      cls.type === "openai_compatible_unknown" ||
      cls.type === "unknown" ||
      cls.type === "relay_or_proxy"
    ) {
      findings.push({
        id: "CLAUDE_UNKNOWN_BASE_URL",
        category: "provider",
        severity: "high",
        title: "ANTHROPIC_BASE_URL 指向未知端点",
        description: cls.reason,
        evidence: { baseUrl: data.baseUrl },
        recommendation: "确认该 endpoint 可信；避免把源码上下文发往不可信中转。",
        fixable: false,
      });
    }
    // 非本地的明文 http 才提示中间人风险（loopback 无需）。
    if (cls.type !== "local" && cls.flags.includes("使用非 TLS 明文 http")) {
      findings.push({
        id: "CLAUDE_INSECURE_HTTP",
        category: "provider",
        severity: "medium",
        title: "ANTHROPIC_BASE_URL 使用明文 http",
        description: "base_url 使用非 TLS 的 http，凭证与代码可能被中间人窃取。",
        evidence: { baseUrl: data.baseUrl },
        recommendation: "改用 https。",
        fixable: false,
      });
    }
  }

  // —— settings.json env 明文 token ——
  if (data.authTokenPresent) {
    findings.push({
      id: "CLAUDE_PLAINTEXT_TOKEN",
      category: "secret",
      severity: "high",
      title: "settings.json 中明文存有 ANTHROPIC_AUTH_TOKEN / API_KEY",
      description: "凭证以明文写在 settings.json 的 env 中，文件泄露即密钥泄露。",
      recommendation: "改用系统环境变量或 apiKeyHelper；限制 settings.json 权限。",
      fixable: false,
    });
  }

  // —— apiKeyHelper ——
  if (data.apiKeyHelperPresent) {
    findings.push({
      id: "CLAUDE_API_KEY_HELPER",
      category: "secret",
      severity: "info",
      title: "配置了 apiKeyHelper",
      description: "apiKeyHelper 会执行外部命令来产出密钥，请确认该命令来源可信。",
      recommendation: "核实 apiKeyHelper 指向的脚本未被篡改。",
      fixable: false,
    });
  }

  // —— 权限：bypass ——
  if (data.bypassPermissions) {
    findings.push({
      id: "CLAUDE_BYPASS_PERMISSIONS",
      category: "permission",
      severity: "high",
      title: "defaultMode = bypassPermissions",
      description: "默认跳过所有工具权限确认，Agent 可无提示执行任意操作。",
      evidence: { defaultMode: data.defaultMode },
      recommendation: "改用 default / acceptEdits 等需确认的模式。",
      fixable: false,
    });
  }

  // —— 权限：危险的 allow 规则 ——
  const dangerous = data.permissionAllowRules.filter(isDangerousAllow);
  if (dangerous.length > 0) {
    findings.push({
      id: "CLAUDE_DANGEROUS_ALLOW",
      category: "permission",
      severity: "medium",
      title: `permissions.allow 含 ${dangerous.length} 条无约束规则`,
      description: "无参数约束的 Bash 或通配规则等价于放行任意命令执行。",
      evidence: { rules: dangerous },
      recommendation: "为 Bash 规则加上命令前缀约束，避免通配放行。",
      fixable: false,
    });
  }

  // —— hooks ——
  if (data.hooksPresent) {
    findings.push({
      id: "CLAUDE_HOOKS_PRESENT",
      category: "permission",
      severity: "info",
      title: "配置了 hooks",
      description: "hooks 会在特定事件自动执行 shell 命令，请确认其内容可信。",
      recommendation: "审阅 hooks 命令，避免执行来路不明的脚本。",
      fixable: false,
    });
  }

  // —— 自动启用项目 MCP ——
  if (data.enableAllProjectMcp) {
    findings.push({
      id: "CLAUDE_ENABLE_ALL_PROJECT_MCP",
      category: "mcp",
      severity: "medium",
      title: "enableAllProjectMcpServers = true",
      description: "自动启用项目内所有 .mcp.json 声明的 MCP，可能加载不可信工具。",
      recommendation: "改为按需手动批准项目级 MCP。",
      fixable: false,
    });
  }

  // —— MCP Server ——
  for (const s of data.mcpServers) {
    if (s.url) {
      const cls = classifyBaseUrl(s.url, providerPolicy);
      const risky =
        cls.type !== "official" &&
        cls.type !== "domestic_official" &&
        cls.type !== "local";
      findings.push({
        id: "CLAUDE_MCP_REMOTE",
        category: "mcp",
        severity: risky ? "medium" : "info",
        title: `远程 MCP Server：${s.name}（${s.scope}）`,
        description: `MCP "${s.name}" 通过远程 URL 提供工具，可读取上下文并影响 Agent 行为。`,
        evidence: { server: s.name, scope: s.scope, url: s.url },
        recommendation: "确认该 MCP 端点归属可信。",
        fixable: false,
      });
    } else if (s.command) {
      findings.push({
        id: "CLAUDE_MCP_STDIO",
        category: "mcp",
        severity: "info",
        title: `本地 MCP Server：${s.name}（${s.scope}）`,
        description: `MCP "${s.name}" 通过本地命令 ${s.command} 启动，具备任意本地执行能力。`,
        evidence: { server: s.name, scope: s.scope, command: s.command },
        recommendation: "确认该命令来源可信。",
        fixable: false,
      });
    }

    const secretKeys = s.envKeys.filter(looksLikeSecretEnv);
    if (secretKeys.length > 0) {
      findings.push({
        id: "CLAUDE_MCP_SECRET_ENV",
        category: "secret",
        severity: "medium",
        title: `MCP "${s.name}" 的 env 中包含疑似密钥字段`,
        description: "当前仅根据字段名识别，需确认其值是明文字面量还是安全的环境变量引用。",
        evidence: { server: s.name, scope: s.scope, envKeys: secretKeys },
        recommendation: "若值为明文，请改用系统环境变量注入；若已是引用，可作为预期配置。",
        fixable: false,
      });
    }
  }

  return findings;
}
