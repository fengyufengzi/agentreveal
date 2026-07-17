import { classifyBaseUrl } from "../../rules/provider.js";
import { looksLikeSecretEnv } from "./parse.js";
export function buildOpenCodeFindings(data, providerPolicy = {}) {
    const findings = [];
    // —— 自定义 provider 的 baseURL 风险 ——
    for (const p of data.providers) {
        if (p.baseUrl) {
            const cls = classifyBaseUrl(p.baseUrl, providerPolicy);
            if (cls.type === "openai_compatible_unknown" ||
                cls.type === "unknown" ||
                cls.type === "relay_or_proxy") {
                findings.push({
                    id: "OPENCODE_CUSTOM_PROVIDER",
                    category: "provider",
                    severity: "medium",
                    title: `自定义模型端点：${p.name}`,
                    description: cls.reason,
                    evidence: { provider: p.name, baseUrl: p.baseUrl },
                    recommendation: "确认该端点可信；避免把源码上下文发往不可信中转。",
                    fixable: false,
                });
            }
            if (cls.type !== "local" && cls.flags.includes("使用非 TLS 明文 http")) {
                findings.push({
                    id: "OPENCODE_INSECURE_HTTP",
                    category: "provider",
                    severity: "medium",
                    title: `明文 http 端点：${p.name}`,
                    description: "provider 的 baseURL 使用非 TLS 的 http，凭证与代码可能被中间人窃取。",
                    evidence: { provider: p.name, baseUrl: p.baseUrl },
                    recommendation: "改用 https。",
                    fixable: false,
                });
            }
        }
        if (p.plaintextKey) {
            findings.push({
                id: "OPENCODE_PLAINTEXT_KEY",
                category: "secret",
                severity: "high",
                title: `provider "${p.name}" 的 apiKey 为明文字面量`,
                description: "apiKey 直接写在 opencode.json（非 {env:...} 引用），配置泄露即密钥泄露。",
                evidence: { provider: p.name },
                recommendation: "改用 {env:VAR} 引用系统环境变量。",
                fixable: false,
            });
        }
    }
    // —— 权限：Bash 无限制 ——
    if (data.permissionBash === "allow") {
        findings.push({
            id: "OPENCODE_BASH_UNRESTRICTED",
            category: "permission",
            severity: "high",
            title: "permission.bash = allow",
            description: "Bash 工具无需确认即可执行任意命令。",
            evidence: { bash: data.permissionBash },
            recommendation: "改为 ask，或用模式白名单限制可执行命令。",
            fixable: false,
        });
    }
    // —— 权限：整体放行（通配）——
    if (data.permissionWildcard) {
        findings.push({
            id: "OPENCODE_PERMISSION_WILDCARD",
            category: "permission",
            severity: "medium",
            title: "permission 全部设为 allow",
            description: "所有工具（含编辑/网络）均免确认执行，权限面过大。",
            evidence: { bash: data.permissionBash, edit: data.permissionEdit },
            recommendation: "对高危工具（bash/edit）改用 ask。",
            fixable: false,
        });
    }
    // —— 会话自动分享 ——
    if (data.share === "auto") {
        findings.push({
            id: "OPENCODE_SHARE_AUTO",
            category: "privacy",
            severity: "medium",
            title: "share = auto",
            description: "会话（含代码与上下文）自动上传分享，可能外泄敏感内容。",
            evidence: { share: data.share },
            recommendation: "改为 manual 或 disabled。",
            fixable: false,
        });
    }
    // —— 自动更新 ——
    if (data.autoupdate === true) {
        findings.push({
            id: "OPENCODE_AUTOUPDATE_ON",
            category: "supply-chain",
            severity: "info",
            title: "autoupdate = true",
            description: "自动更新会拉取并运行新版本，构成供应链信任面。",
            recommendation: "在受管环境可关闭自动更新，改为审阅后升级。",
            fixable: false,
        });
    }
    // —— MCP Server ——
    for (const s of data.mcpServers) {
        if (!s.enabled)
            continue;
        if (s.url) {
            const cls = classifyBaseUrl(s.url, providerPolicy);
            const risky = cls.type !== "official" &&
                cls.type !== "domestic_official" &&
                cls.type !== "local";
            findings.push({
                id: "OPENCODE_MCP_REMOTE",
                category: "mcp",
                severity: risky ? "medium" : "info",
                title: `远程 MCP Server：${s.name}`,
                description: `MCP "${s.name}" 通过远程 URL 提供工具，可读取上下文并影响 Agent 行为。`,
                evidence: { server: s.name, url: s.url },
                recommendation: "确认该 MCP 端点归属可信。",
                fixable: false,
            });
        }
        else if (s.command) {
            findings.push({
                id: "OPENCODE_MCP_LOCAL",
                category: "mcp",
                severity: "info",
                title: `本地 MCP Server：${s.name}`,
                description: `MCP "${s.name}" 通过本地命令 ${s.command} 启动，具备任意本地执行能力。`,
                evidence: { server: s.name, command: s.command },
                recommendation: "确认该命令来源可信。",
                fixable: false,
            });
        }
        const secretKeys = s.envKeys.filter(looksLikeSecretEnv);
        if (secretKeys.length > 0) {
            findings.push({
                id: "OPENCODE_MCP_SECRET_ENV",
                category: "secret",
                severity: "medium",
                title: `MCP "${s.name}" 的 env/headers 中包含疑似密钥字段`,
                description: "当前仅根据字段名识别，需确认其值是明文字面量还是安全引用。",
                evidence: { server: s.name, keys: secretKeys },
                recommendation: "若值为明文，请改用 {env:VAR} 引用；若已是引用，可作为预期配置。",
                fixable: false,
            });
        }
    }
    return findings;
}
//# sourceMappingURL=risk.js.map