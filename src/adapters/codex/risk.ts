/**
 * Codex 风险规则。
 * 输入归一化数据，产出 RiskFinding[]。
 * evidence 均脱敏：只含 base_url / 命令 / 路径 / env 键名 / 计数，绝不含 token 值。
 */
import type { RiskFinding } from "../types.js";
import { classifyBaseUrl, type ProviderTrustPolicy } from "../../rules/provider.js";
import { looksLikeSecretEnv, type CodexData } from "./parse.js";

export function buildCodexFindings(
  data: CodexData,
  providerPolicy: ProviderTrustPolicy = {}
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  // —— 自定义 model_providers 的 base_url 风险 ——
  for (const p of data.providers) {
    if (!p.baseUrl) continue;
    const active = data.activeProvider === p.name;
    const cls = classifyBaseUrl(p.baseUrl, providerPolicy);

    if (
      cls.type === "openai_compatible_unknown" ||
      cls.type === "unknown" ||
      cls.type === "relay_or_proxy"
    ) {
      findings.push({
        id: "CODEX_CUSTOM_PROVIDER",
        category: "provider",
        severity: active ? "high" : "medium",
        title: `自定义模型端点：${p.name}${active ? "（当前激活）" : ""}`,
        description: cls.reason,
        evidence: { provider: p.name, baseUrl: p.baseUrl, wireApi: p.wireApi, active },
        recommendation: "确认该端点可信；避免把源码上下文发往不可信中转。",
        remediation: [
          `打开 ~/.codex/config.toml，定位 [model_providers.${p.name}] 段的 base_url。`,
          "若该端点不可信：把 base_url 改回官方端点，或删除整个 [model_providers.<name>] 段并切换回官方 Provider。",
          "若为自建/企业内部端点：在项目根目录 .agentguard.json 的 providers.trusted 中加入该端点以消除误报。",
          "config.toml 为 TOML 且可能含注释，AgentGuard 不自动改写以免破坏格式，请手动编辑。",
        ],
        fixable: false,
      });
    }

    if (cls.flags.includes("使用非 TLS 明文 http")) {
      findings.push({
        id: "CODEX_INSECURE_HTTP",
        category: "provider",
        severity: "medium",
        title: `明文 http 端点：${p.name}`,
        description: "model_provider 的 base_url 使用非 TLS 的 http，凭证与代码可能被中间人窃取。",
        evidence: { provider: p.name, baseUrl: p.baseUrl },
        recommendation: "改用 https。",
        fixable: false,
      });
    }
  }

  // —— auth.json 中的原始 API Key 落盘 ——
  if (data.apiKeyPresent) {
    findings.push({
      id: "CODEX_PLAINTEXT_API_KEY",
      category: "secret",
      severity: "high",
      title: "auth.json 中存有原始 OPENAI_API_KEY",
      description: "Codex 以明文在 auth.json 保存原始 API Key，文件泄露即密钥泄露。",
      evidence: { authMode: data.authMode ?? "unknown" },
      recommendation: "尽量改用 ChatGPT 登录（OAuth）；限制 auth.json 权限为 600。",
      remediation: [
        "删除 ~/.codex/auth.json 中的 OPENAI_API_KEY 字段（AgentGuard 只读不改，需手动删除）。",
        "改用 `codex login` 走 ChatGPT OAuth 登录，或通过系统环境变量 OPENAI_API_KEY 注入密钥。",
        "运行 chmod 600 ~/.codex/auth.json 收紧文件权限。",
        "轮换此前已落盘的旧密钥，避免泄露副本仍然有效。",
      ],
      fixable: false,
    });
  }

  // —— MCP Server 风险 ——
  for (const s of data.mcpServers) {
    if (!s.enabled) continue;

    // 远程 MCP：URL 型端点走 provider 分类
    if (s.url) {
      const cls = classifyBaseUrl(s.url, providerPolicy);
      const risky =
        cls.type === "openai_compatible_unknown" ||
        cls.type === "unknown" ||
        cls.type === "relay_or_proxy" ||
        cls.flags.includes("使用非 TLS 明文 http");
      findings.push({
        id: "CODEX_MCP_REMOTE",
        category: "mcp",
        severity: risky ? "medium" : "info",
        title: `远程 MCP Server：${s.name}`,
        description: `MCP "${s.name}" 通过远程 URL 提供工具，可读取上下文并影响 Agent 行为。`,
        evidence: { server: s.name, url: s.url, type: s.type },
        recommendation: "确认该 MCP 端点归属可信；远程 MCP 可注入指令或外泄上下文。",
        fixable: false,
      });
    } else if (s.command) {
      // 本地 stdio MCP：执行任意本地命令
      findings.push({
        id: "CODEX_MCP_STDIO",
        category: "mcp",
        severity: "info",
        title: `本地 MCP Server：${s.name}`,
        description: `MCP "${s.name}" 通过本地命令 ${s.command} 启动，具备任意本地执行能力。`,
        evidence: { server: s.name, command: s.command },
        recommendation: "确认该命令来源可信；勿运行来路不明的 MCP。",
        fixable: false,
      });
    }

    // MCP env 内嵌疑似密钥（仅报键名，不含值）
    const secretKeys = s.envKeys.filter(looksLikeSecretEnv);
    if (secretKeys.length > 0) {
      findings.push({
        id: "CODEX_MCP_SECRET_ENV",
        category: "secret",
        severity: "medium",
        title: `MCP "${s.name}" 的 env 中包含疑似密钥字段`,
        description: "当前仅根据字段名识别，需确认其值是明文字面量还是安全引用。",
        evidence: { server: s.name, envKeys: secretKeys },
        recommendation: "若值为明文，请改用系统环境变量注入；若已是引用，可作为预期配置。",
        fixable: false,
      });
    }
  }

  // —— 受信任项目（自动放行审批的范围）——
  if (data.trustedProjects.length > 0) {
    findings.push({
      id: "CODEX_TRUSTED_PROJECTS",
      category: "permission",
      severity: data.trustedProjects.length >= 5 ? "medium" : "info",
      title: `${data.trustedProjects.length} 个项目被标记为 trusted`,
      description:
        "trusted 项目内 Codex 可能免审批执行命令，受信范围越大自动执行面越广。",
      evidence: { count: data.trustedProjects.length, projects: data.trustedProjects },
      recommendation: "定期清理不再使用的 trusted 项目，缩小免审批范围。",
      fixable: false,
    });
  }

  // —— 本地代理链路 ——
  if (data.proxyUrl) {
    findings.push({
      id: "CODEX_LOCAL_PROXY",
      category: "provider",
      severity: "info",
      title: `Codex 流量经本地代理转发`,
      description: `请求先经 ${data.proxyUrl}，真实上游取决于该代理的规则，勿误判为安全本地服务。`,
      evidence: { proxyUrl: data.proxyUrl },
      recommendation: "确认代理规则与真实上游可信。",
      fixable: false,
    });
  }

  return findings;
}
