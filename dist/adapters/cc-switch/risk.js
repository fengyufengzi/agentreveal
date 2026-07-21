import { classifyBaseUrl } from "../../rules/provider.js";
import { ccSwitchAppLabel, PROXY_MANAGED_AUTH_LABEL, } from "../../core/proxy-managed.js";
/** 仅取激活 + 在故障转移队列中的 Provider（这些才是"实际会被用到"的）。 */
function activeProviders(data) {
    return data.providers.filter((p) => p.isCurrent || p.inFailoverQueue);
}
export function buildCcSwitchFindings(data, providerPolicy = {}) {
    const findings = [];
    // schema 版本兼容提示
    if (!data.schemaKnown) {
        findings.push({
            id: "CCSWITCH_SCHEMA_UNKNOWN",
            category: "compat",
            severity: "info",
            title: `CC Switch schema 版本 ${data.schemaVersion} 未验证`,
            description: "该版本尚未经 adapter 验证，解析结果可能不完整。",
            recommendation: "升级 AgentGuard 或核对 CC Switch 版本。",
        });
    }
    // —— base_url 风险：未知 / 裸 IP / 非 TLS ——
    for (const p of data.providers) {
        if (!p.baseUrl)
            continue;
        const cls = classifyBaseUrl(p.baseUrl, providerPolicy);
        const httpFlag = cls.flags.includes("使用非 TLS 明文 http");
        if (cls.type === "openai_compatible_unknown" || cls.type === "unknown") {
            findings.push({
                id: "CCSWITCH_UNKNOWN_BASE_URL",
                category: "provider",
                severity: p.isCurrent ? "high" : "medium",
                title: `未知 base_url：${p.name}${p.isCurrent ? "（当前激活）" : ""}`,
                description: cls.reason,
                evidence: { appType: p.appType, provider: p.name, baseUrl: p.baseUrl, isCurrent: p.isCurrent },
                recommendation: "确认该 endpoint 是否可信；如为自建/内部服务请标记为可信。",
                remediation: [
                    "打开 CC Switch 应用，在该 Provider 配置里核对 base_url。",
                    "若不可信：改回官方端点或删除该 Provider（CC Switch 配置存于只读 SQLite，AgentGuard 坚持不写库，请在应用内改）。",
                    "若为自建/内部端点：在项目根目录 .agentguard.json 的 providers.trusted 中加入该端点以消除误报。",
                ],
                fixable: false,
            });
        }
        else if (cls.type === "relay_or_proxy") {
            findings.push({
                id: "CCSWITCH_RELAY_ENDPOINT",
                category: "provider",
                severity: p.isCurrent ? "high" : "medium",
                title: `疑似中转/自建端点：${p.name}`,
                description: cls.reason,
                evidence: { appType: p.appType, provider: p.name, baseUrl: p.baseUrl, isCurrent: p.isCurrent },
                recommendation: "核实该端点归属；避免把源码上下文发往不可信中转。",
                remediation: [
                    "打开 CC Switch 应用，在该 Provider 配置里核对 base_url 的真实归属。",
                    "若为不可信中转：切换回官方端点或删除该 Provider（AgentGuard 坚持只读 SQLite，请在应用内改）。",
                    "若为自建/内部端点：在项目根目录 .agentguard.json 的 providers.trusted 中标记为可信。",
                ],
                fixable: false,
            });
        }
        if (httpFlag) {
            findings.push({
                id: "CCSWITCH_INSECURE_HTTP",
                category: "provider",
                severity: "medium",
                title: `明文 http endpoint：${p.name}`,
                description: "base_url 使用非 TLS 的 http，凭证与代码可能被中间人窃取。",
                evidence: { appType: p.appType, provider: p.name, baseUrl: p.baseUrl },
                recommendation: "改用 https。",
                fixable: false,
            });
        }
    }
    // —— 明文密钥 ——
    const withKey = data.providers.filter((p) => p.keyPresent);
    if (withKey.length > 0) {
        findings.push({
            id: "CCSWITCH_PLAINTEXT_KEY",
            category: "secret",
            severity: "high",
            title: `${withKey.length} 个 Provider 配置中存有明文密钥`,
            description: "CC Switch 在 providers.settings_config 中以明文保存 API Key / Token。",
            evidence: {
                count: withKey.length,
                providers: withKey.map((p) => `${p.appType}/${p.name}`),
            },
            recommendation: "当前普通 Provider 不支持在 Token 字段引用环境变量；请轮换为独立最小权限 Token，并限制数据库及备份权限。",
            remediation: [
                "先在 Provider 控制台创建独立、最小权限的新 Token，再打开 CC Switch，在相关 Provider 配置中替换并测试，最后撤销旧 Token。",
                "不要在 API Key / Token 输入框填写环境变量名、${VAR} 或 {env:VAR}；当前普通 Provider 会把它们当作 Token 字面量。",
                "复制并执行下方 Terminal 命令，收紧 ~/.cc-switch、cc-switch.db 和数据库备份权限。",
                "若 Provider 支持官方账号/OAuth，优先改用无需在 CC Switch 数据库保存 Token 的登录方式。",
                "配置存于只读 SQLite，AgentGuard 坚持不写库，请务必在 CC Switch 应用内修改。",
            ],
            fixable: false,
        });
    }
    // —— 同一密钥多处复用（按指纹关联，绝不含明文）——
    const byFp = new Map();
    for (const p of data.providers) {
        if (!p.keyFingerprint)
            continue;
        const arr = byFp.get(p.keyFingerprint) ?? [];
        arr.push(p);
        byFp.set(p.keyFingerprint, arr);
    }
    for (const [fp, list] of byFp) {
        if (list.length < 2)
            continue;
        const agents = new Set(list.map((p) => p.appType));
        // 仅当跨越 >1 个 provider 条目时才提示；跨 Agent 复用风险更高
        findings.push({
            id: "CCSWITCH_SHARED_KEY",
            category: "secret",
            severity: agents.size > 1 ? "high" : "medium",
            title: `同一密钥被 ${list.length} 处复用${agents.size > 1 ? `（跨 ${agents.size} 类 Agent）` : ""}`,
            description: "多个 Provider 条目使用了相同的密钥，一处泄露即全部受影响。",
            evidence: {
                fingerprint: fp, // 不可逆指纹，非密钥本身
                entries: list.map((p) => `${p.appType}/${p.name}`),
            },
            recommendation: "为不同 Agent / 用途使用独立密钥。",
            remediation: [
                "打开 CC Switch 应用，为每个复用了同一密钥的 Provider / Agent 分别配置独立密钥。",
                "在各上游服务商处轮换这批被复用的旧密钥，使泄露副本立即失效。",
            ],
            fixable: false,
        });
    }
    // —— 内置代理链路 ——
    for (const proxy of data.proxies) {
        if (!proxy.enabled)
            continue;
        const appLabel = ccSwitchAppLabel(proxy.appType);
        // 该 app 当前激活的真实上游
        const upstream = data.providers.find((p) => p.appType === proxy.appType && p.isCurrent);
        findings.push({
            id: "CCSWITCH_PROXY_ENABLED",
            category: "provider",
            severity: "info",
            title: `${appLabel} 已由 CC Switch 接管`,
            description: `${appLabel} 的请求先经 CC Switch 本地代理 ${proxy.listenAddress}:${proxy.listenPort}，真实上游为 ${upstream?.baseUrl ?? upstream?.name ?? "未知"}；live 配置中的 ${PROXY_MANAGED_AUTH_LABEL} 不是真实 Provider Key。`,
            evidence: {
                appType: proxy.appType,
                appLabel,
                proxy: `${proxy.listenAddress}:${proxy.listenPort}`,
                realUpstream: upstream?.baseUrl ?? upstream?.name,
                proxyOwner: "CC Switch",
                authMode: PROXY_MANAGED_AUTH_LABEL,
                autoFailover: proxy.autoFailover,
            },
            recommendation: "确认真实上游可信；关注 failover 队列中的 Provider。",
            fixable: false,
        });
        // 故障转移队列含未知上游
        if (proxy.autoFailover) {
            const unknowns = data.providers.filter((p) => p.appType === proxy.appType &&
                p.inFailoverQueue &&
                p.baseUrl &&
                ["openai_compatible_unknown", "unknown", "relay_or_proxy"].includes(classifyBaseUrl(p.baseUrl, providerPolicy).type));
            if (unknowns.length > 0) {
                findings.push({
                    id: "CCSWITCH_PROXY_FAILOVER_UNKNOWN",
                    category: "provider",
                    severity: "high",
                    title: `${proxy.appType} 故障转移队列含 ${unknowns.length} 个未知上游`,
                    description: "代理自动故障转移时可能把请求切到未知/中转端点。",
                    evidence: {
                        appType: proxy.appType,
                        providers: unknowns.map((p) => p.name),
                    },
                    recommendation: "从故障转移队列移除不可信 Provider。",
                    remediation: [
                        "打开 CC Switch 应用，进入该 Agent 的代理 / 故障转移设置。",
                        "从故障转移队列中移除未知 / 中转端点，仅保留可信上游。",
                        "若某端点为自建/内部服务且确需保留：在 .agentguard.json 的 providers.trusted 中标记为可信。",
                    ],
                    fixable: false,
                });
            }
        }
    }
    return findings;
}
//# sourceMappingURL=risk.js.map