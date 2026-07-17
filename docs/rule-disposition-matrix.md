# AgentGuard 规则处置矩阵

> 本文是当前源码行动报告的规则索引。完整的行动理由、下一步、验证方法、接受条件和
> baseline 效果以 [`src/rules/action-matrix.ts`](../src/rules/action-matrix.ts) 为唯一真源。

## 口径

- 具体规则：63 条。
- 运行时系统事件：`DEEPSCAN_FAILED`，单独按扫描完整性问题处理，不计入 63 条规则。
- `severity` 继续表示潜在影响；本表的 `priority` 表示用户行动顺序。
- `observe` 是配置观察，不进入默认待修复数量。
- `baseline` 表示 AgentGuard 已有带 dry-run、备份与回滚的整改能力，不等于所有 profile 都能完整解决。

| 规则 ID | 处置 | 优先级 | 置信度 | 修复方式 | 根因分组 |
|---|---|---|---|---|---|
| `CLAUDE_LOCAL_BASE_URL` | observe | P3 | high | none | `provider.proxy-chain` |
| `CLAUDE_UNKNOWN_BASE_URL` | review | P1 | medium | manual | `provider.endpoint` |
| `CLAUDE_INSECURE_HTTP` | fix | P1 | high | guided | `provider.endpoint` |
| `CLAUDE_PLAINTEXT_TOKEN` | fix | P0 | high | guided | `secret.plaintext` |
| `CLAUDE_API_KEY_HELPER` | review | P2 | high | manual | `secret.helper` |
| `CLAUDE_BYPASS_PERMISSIONS` | fix | P0 | high | baseline | `permission.execution` |
| `CLAUDE_DANGEROUS_ALLOW` | fix | P1 | high | baseline | `permission.execution` |
| `CLAUDE_HOOKS_PRESENT` | review | P2 | high | manual | `permission.hooks` |
| `CLAUDE_ENABLE_ALL_PROJECT_MCP` | fix | P1 | high | baseline | `mcp.auto-enable` |
| `CLAUDE_MCP_REMOTE` | review | P2 | medium | manual | `mcp.server` |
| `CLAUDE_MCP_STDIO` | observe | P3 | high | none | `mcp.server` |
| `CLAUDE_MCP_SECRET_ENV` | review | P1 | low | guided | `mcp.server` |
| `CLAUDE_PARSE_FAILED` | review | P1 | high | guided | `coverage.parse` |
| `CODEX_CUSTOM_PROVIDER` | review | P1 | medium | manual | `provider.endpoint` |
| `CODEX_INSECURE_HTTP` | fix | P1 | high | guided | `provider.endpoint` |
| `CODEX_PLAINTEXT_API_KEY` | fix | P0 | high | guided | `secret.plaintext` |
| `CODEX_MCP_REMOTE` | review | P2 | medium | manual | `mcp.server` |
| `CODEX_MCP_STDIO` | observe | P3 | high | none | `mcp.server` |
| `CODEX_MCP_SECRET_ENV` | review | P1 | low | guided | `mcp.server` |
| `CODEX_TRUSTED_PROJECTS` | cleanup | P2 | high | guided | `permission.trusted-projects` |
| `CODEX_LOCAL_PROXY` | observe | P3 | medium | none | `provider.proxy-chain` |
| `CODEX_PARSE_FAILED` | review | P1 | high | guided | `coverage.parse` |
| `CCSWITCH_SCHEMA_UNKNOWN` | review | P2 | high | manual | `coverage.schema` |
| `CCSWITCH_UNKNOWN_BASE_URL` | review | P1 | medium | manual | `provider.endpoint` |
| `CCSWITCH_RELAY_ENDPOINT` | review | P1 | medium | manual | `provider.endpoint` |
| `CCSWITCH_INSECURE_HTTP` | fix | P1 | high | manual | `provider.endpoint` |
| `CCSWITCH_PLAINTEXT_KEY` | fix | P0 | medium | manual | `secret.plaintext` |
| `CCSWITCH_SHARED_KEY` | fix | P1 | high | manual | `secret.key-reuse` |
| `CCSWITCH_PROXY_ENABLED` | observe | P3 | high | none | `provider.proxy-chain` |
| `CCSWITCH_PROXY_FAILOVER_UNKNOWN` | fix | P1 | medium | manual | `provider.failover` |
| `CCSWITCH_PARSE_FAILED` | review | P1 | high | manual | `coverage.parse` |
| `OPENCODE_CUSTOM_PROVIDER` | review | P2 | medium | manual | `provider.endpoint` |
| `OPENCODE_INSECURE_HTTP` | fix | P1 | high | guided | `provider.endpoint` |
| `OPENCODE_PLAINTEXT_KEY` | fix | P0 | high | guided | `secret.plaintext` |
| `OPENCODE_BASH_UNRESTRICTED` | fix | P0 | high | baseline | `permission.execution` |
| `OPENCODE_PERMISSION_WILDCARD` | fix | P1 | high | baseline | `permission.execution` |
| `OPENCODE_SHARE_AUTO` | fix | P1 | high | baseline | `privacy.auto-share` |
| `OPENCODE_AUTOUPDATE_ON` | cleanup | P2 | high | baseline | `supply-chain.update` |
| `OPENCODE_MCP_REMOTE` | review | P2 | medium | manual | `mcp.server` |
| `OPENCODE_MCP_LOCAL` | observe | P3 | high | none | `mcp.server` |
| `OPENCODE_MCP_SECRET_ENV` | review | P1 | low | guided | `mcp.server` |
| `OPENCODE_PARSE_FAILED` | review | P1 | high | guided | `coverage.parse` |
| `GEMINI_PLAINTEXT_ENV_KEY` | fix | P0 | high | guided | `secret.plaintext` |
| `GEMINI_MCP_TRUST_BYPASS` | fix | P0 | high | baseline | `mcp.server` |
| `GEMINI_MCP_REMOTE` | review | P2 | medium | manual | `mcp.server` |
| `GEMINI_MCP_STDIO` | observe | P3 | high | none | `mcp.server` |
| `GEMINI_MCP_SECRET_ENV` | review | P1 | low | guided | `mcp.server` |
| `GEMINI_SHELL_NO_SANDBOX` | fix | P1 | high | guided | `permission.execution` |
| `GEMINI_AUTH_MODE` | observe | P3 | high | none | `provider.auth-mode` |
| `GEMINI_PARSE_FAILED` | review | P1 | high | guided | `coverage.parse` |
| `OPENCLAW_CHANNEL_PLAINTEXT_SECRET` | fix | P0 | high | guided | `secret.plaintext` |
| `OPENCLAW_CHANNEL_PLAINTEXT_TOKEN` | fix | P0 | high | guided | `secret.plaintext` |
| `OPENCLAW_GATEWAY_PLAINTEXT_TOKEN` | fix | P0 | high | guided | `secret.plaintext` |
| `OPENCLAW_GATEWAY_EXPOSED_BIND` | fix | P0 | high | baseline | `openclaw.gateway-exposure` |
| `OPENCLAW_TAILSCALE_EXPOSURE` | fix | P0 | high | baseline | `openclaw.gateway-exposure` |
| `OPENCLAW_AGENT_WORKSPACE_OVERLAP` | review | P2 | high | manual | `workspace.overlap` |
| `OPENCLAW_UNKNOWN_PLUGIN_SOURCE` | review | P1 | medium | manual | `supply-chain.plugin` |
| `OPENCLAW_SERVICE_ENV_PRESENT` | observe | P3 | medium | none | `secret.file` |
| `OPENCLAW_PARSE_FAIL` | review | P1 | high | guided | `coverage.parse` |
| `XAGENT_SHARED_PROXY` | review | P1 | high | manual | `correlation.shared-proxy` |
| `XAGENT_SHARED_ENDPOINT` | review | P1 | medium | manual | `correlation.shared-endpoint` |
| `PROJECT_SENSITIVE_FILE` | review | P1 | medium | manual | `project.sensitive-file` |
| `PROJECT_SENSITIVE_SCAN_TRUNCATED` | review | P1 | high | none | `coverage.truncated` |

## Baseline 映射

当前 10 条规则由 baseline 支持。除 `OPENCODE_PERMISSION_WILDCARD` 外，`safe` 与 `balanced` 都按
完整解决处理。`OPENCODE_PERMISSION_WILDCARD` 在 `safe` 下完整解决，在 `balanced` 下仅收紧 Bash，
属于风险缓解。报告必须先提示执行 dry-run，并说明 apply 会应用计划中的全部 baseline 变更，而不是只
修复当前卡片。

矩阵完整性由测试保证：源码新增、删除或改名规则后，如果没有同步更新 `RULE_IDS` 与处置矩阵，测试会失败。
