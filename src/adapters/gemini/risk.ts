/**
 * Gemini CLI 风险规则。
 * 输入归一化数据，产出 RiskFinding[]。
 * evidence 均脱敏：只含 endpoint / 键名 / server 名 / authType，绝不含密钥值。
 */
import type { RiskFinding } from "../types.js";
import { classifyBaseUrl, type ProviderTrustPolicy } from "../../rules/provider.js";
import { looksLikeSecretEnv, type GeminiData } from "./parse.js";

export function buildGeminiFindings(
  data: GeminiData,
  providerPolicy: ProviderTrustPolicy = {}
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  // —— 1. .env 明文密钥 ——
  if (data.plaintextEnvKeys.length > 0) {
    findings.push({
      id: "GEMINI_PLAINTEXT_ENV_KEY",
      category: "secret",
      severity: "high",
      title: `~/.gemini/.env 中明文存有 ${data.plaintextEnvKeys.length} 个疑似密钥`,
      description: "API key 以明文写在 .env 文件中，文件泄露或误提交仓库即密钥泄露。",
      evidence: { keys: data.plaintextEnvKeys },
      recommendation: "改用系统环境变量注入，或用 ${VAR} 引用外部密钥；限制 .env 权限为 600。",
      fixable: false,
    });
  }

  // —— 2. MCP Server ——
  for (const s of data.mcpServers) {
    // trust=true：绕过全部工具调用确认
    if (s.trust) {
      findings.push({
        id: "GEMINI_MCP_TRUST_BYPASS",
        category: "permission",
        severity: "high",
        title: `MCP "${s.name}" 配置了 trust=true`,
        description:
          "该 MCP server 的所有工具调用将绕过确认（等价 per-server YOLO），恶意或被劫持的工具可无提示执行。",
        evidence: { server: s.name },
        recommendation: "移除 trust:true，改为逐次确认工具调用。",
        fixable: false,
      });
    }

    // 远程 / 本地 MCP
    if (s.url) {
      const cls = classifyBaseUrl(s.url, providerPolicy);
      const risky =
        cls.type !== "official" &&
        cls.type !== "domestic_official" &&
        cls.type !== "local";
      findings.push({
        id: "GEMINI_MCP_REMOTE",
        category: "mcp",
        severity: risky ? "medium" : "info",
        title: `远程 MCP Server：${s.name}`,
        description: `MCP "${s.name}" 通过远程 URL 提供工具，可读取上下文并影响 Agent 行为。`,
        evidence: { server: s.name, url: s.url },
        recommendation: "确认该 MCP 端点归属可信。",
        fixable: false,
      });
    } else if (s.command) {
      findings.push({
        id: "GEMINI_MCP_STDIO",
        category: "mcp",
        severity: "info",
        title: `本地 MCP Server：${s.name}`,
        description: `MCP "${s.name}" 通过本地命令 ${s.command} 启动，具备任意本地执行能力。`,
        evidence: { server: s.name, command: s.command },
        recommendation: "确认该命令来源可信。",
        fixable: false,
      });
    }

    // env / headers 内嵌密钥（仅键名）
    const secretKeys = [...s.envKeys, ...s.headerKeys].filter(looksLikeSecretEnv);
    if (secretKeys.length > 0) {
      findings.push({
        id: "GEMINI_MCP_SECRET_ENV",
        category: "secret",
        severity: "medium",
        title: `MCP "${s.name}" 的 env/headers 中包含疑似密钥字段`,
        description: "当前仅根据字段名识别，需确认其值是明文字面量还是安全引用。",
        evidence: { server: s.name, envKeys: secretKeys },
        recommendation: "若值为明文，请改用系统环境变量注入；若已是引用，可作为预期配置。",
        fixable: false,
      });
    }
  }

  // —— 3. 启用 shell 工具但无 sandbox ——
  if (data.shellToolAllowed && !data.sandbox) {
    findings.push({
      id: "GEMINI_SHELL_NO_SANDBOX",
      category: "permission",
      severity: "medium",
      title: "启用了 run_shell_command 但未开启 sandbox",
      description: "工具可执行 shell 命令且未开启 sandbox，命令直接落在宿主机，误操作或提示注入可造成实际破坏。",
      evidence: { shellToolAllowed: true, sandbox: data.sandbox ?? false },
      recommendation: "开启 tools.sandbox（docker/podman 等），或在 excludeTools 中屏蔽 run_shell_command。",
      fixable: false,
    });
  }

  // —— 4. 鉴权模式（信息项） ——
  if (data.authType) {
    findings.push({
      id: "GEMINI_AUTH_MODE",
      category: "provider",
      severity: "info",
      title: `Gemini 鉴权模式：${data.authType}`,
      description:
        data.authType === "gemini-api-key"
          ? "使用 API key 鉴权，密钥通常来自 ~/.gemini/.env 或系统环境变量，请确认其存放方式安全。"
          : "记录当前鉴权模式，便于核对与其它 Agent 的凭证来源。",
      evidence: { authType: data.authType },
      recommendation: "确认密钥来源与存放方式符合团队规范。",
      fixable: false,
    });
  }

  return findings;
}
