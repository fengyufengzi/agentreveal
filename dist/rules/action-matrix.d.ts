import type { FindingAction } from "../adapters/types.js";
/**
 * 每条具体规则的下一步行动。
 *
 * severity 描述潜在影响；这里的 priority 描述用户现在是否需要行动。两者故意分离。
 * `satisfies Record<RuleId, FindingAction>` 保证 RuleId 新增时必须同步补充处置定义。
 */
export declare const ACTION_MATRIX: {
    CLAUDE_LOCAL_BASE_URL: FindingAction;
    CLAUDE_UNKNOWN_BASE_URL: FindingAction;
    CLAUDE_INSECURE_HTTP: FindingAction;
    CLAUDE_PLAINTEXT_TOKEN: FindingAction;
    CLAUDE_API_KEY_HELPER: FindingAction;
    CLAUDE_BYPASS_PERMISSIONS: FindingAction;
    CLAUDE_DANGEROUS_ALLOW: FindingAction;
    CLAUDE_HOOKS_PRESENT: FindingAction;
    CLAUDE_ENABLE_ALL_PROJECT_MCP: FindingAction;
    CLAUDE_MCP_REMOTE: FindingAction;
    CLAUDE_MCP_STDIO: FindingAction;
    CLAUDE_MCP_SECRET_ENV: FindingAction;
    CLAUDE_PARSE_FAILED: FindingAction;
    CODEX_CUSTOM_PROVIDER: FindingAction;
    CODEX_INSECURE_HTTP: FindingAction;
    CODEX_PLAINTEXT_API_KEY: FindingAction;
    CODEX_MCP_REMOTE: FindingAction;
    CODEX_MCP_STDIO: FindingAction;
    CODEX_MCP_SECRET_ENV: FindingAction;
    CODEX_TRUSTED_PROJECTS: FindingAction;
    CODEX_LOCAL_PROXY: FindingAction;
    CODEX_PARSE_FAILED: FindingAction;
    CCSWITCH_SCHEMA_UNKNOWN: FindingAction;
    CCSWITCH_UNKNOWN_BASE_URL: FindingAction;
    CCSWITCH_RELAY_ENDPOINT: FindingAction;
    CCSWITCH_INSECURE_HTTP: FindingAction;
    CCSWITCH_PLAINTEXT_KEY: FindingAction;
    CCSWITCH_SHARED_KEY: FindingAction;
    CCSWITCH_PROXY_ENABLED: FindingAction;
    CCSWITCH_PROXY_FAILOVER_UNKNOWN: FindingAction;
    CCSWITCH_PARSE_FAILED: FindingAction;
    OPENCODE_CUSTOM_PROVIDER: FindingAction;
    OPENCODE_INSECURE_HTTP: FindingAction;
    OPENCODE_PLAINTEXT_KEY: FindingAction;
    OPENCODE_BASH_UNRESTRICTED: FindingAction;
    OPENCODE_PERMISSION_WILDCARD: FindingAction;
    OPENCODE_SHARE_AUTO: FindingAction;
    OPENCODE_AUTOUPDATE_ON: FindingAction;
    OPENCODE_MCP_REMOTE: FindingAction;
    OPENCODE_MCP_LOCAL: FindingAction;
    OPENCODE_MCP_SECRET_ENV: FindingAction;
    OPENCODE_PARSE_FAILED: FindingAction;
    GEMINI_PLAINTEXT_ENV_KEY: FindingAction;
    GEMINI_MCP_TRUST_BYPASS: FindingAction;
    GEMINI_MCP_REMOTE: FindingAction;
    GEMINI_MCP_STDIO: FindingAction;
    GEMINI_MCP_SECRET_ENV: FindingAction;
    GEMINI_SHELL_NO_SANDBOX: FindingAction;
    GEMINI_AUTH_MODE: FindingAction;
    GEMINI_PARSE_FAILED: FindingAction;
    OPENCLAW_CHANNEL_PLAINTEXT_SECRET: FindingAction;
    OPENCLAW_CHANNEL_PLAINTEXT_TOKEN: FindingAction;
    OPENCLAW_GATEWAY_PLAINTEXT_TOKEN: FindingAction;
    OPENCLAW_GATEWAY_EXPOSED_BIND: FindingAction;
    OPENCLAW_TAILSCALE_EXPOSURE: FindingAction;
    OPENCLAW_AGENT_WORKSPACE_OVERLAP: FindingAction;
    OPENCLAW_UNKNOWN_PLUGIN_SOURCE: FindingAction;
    OPENCLAW_SERVICE_ENV_PRESENT: FindingAction;
    OPENCLAW_PARSE_FAIL: FindingAction;
    XAGENT_SHARED_PROXY: FindingAction;
    XAGENT_SHARED_ENDPOINT: FindingAction;
    PROJECT_SENSITIVE_FILE: FindingAction;
    PROJECT_SENSITIVE_SCAN_TRUNCATED: FindingAction;
};
/** 为扫描汇总阶段提供安全的字符串规则 ID 查询。 */
export declare function getRuleAction(id: string): FindingAction | undefined;
/** 兼容 action enrichment 层使用的语义化命名。 */
export declare const getFindingAction: typeof getRuleAction;
