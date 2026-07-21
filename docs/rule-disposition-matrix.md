# AgentGuard 规则处置矩阵

> 本文是当前源码行动报告的规则索引。完整的行动理由、下一步、验证方法、接受条件和
> baseline 效果以 [`src/rules/action-matrix.ts`](../src/rules/action-matrix.ts) 为唯一真源。

## 口径

- 具体规则：63 条。
- 运行时系统事件：`DEEPSCAN_FAILED`，单独按扫描完整性问题处理，不计入 63 条规则。
- `severity` 继续表示潜在影响；本表的 `priority` 表示用户行动顺序。
- `observe` 是配置观察，不进入默认待修复数量。
- `baseline` 表示 AgentGuard 已有带 dry-run、备份与回滚的整改能力，不等于所有 profile 都能完整解决。
- 项目规则忽略不是普通 acceptance：只有 P2/P3、非 `fix` 且不属于凭证、执行权限、扫描盲区或
  Provider 端点分类等高风险家族的规则可用；策略按当前项目 + Agent + ruleId 跨 taskId 变化生效。
- `CLAUDE_PLAINTEXT_TOKEN` 的 macOS guided 路径会先要求备份：Desktop 使用“一键备份”，CLI 使用
  `agentguard credential backup <task-id>`；随后给出 Keychain 与 Claude Code `apiKeyHelper` 命令，先存储
  新凭证，再删除 `settings.json` / `settings.local.json` 中两个已知明文字段。CLI 恢复先只输出预览指纹，
  需使用 `agentguard credential restore <backup-id> --confirm <fingerprint>` 二次确认；Desktop 验证统一使用
  任务卡片的“复扫验证”。CC Switch 代理接管写入 Claude Code、Codex 或 Gemini CLI
  live 配置的 `PROXY_MANAGED` 是非秘密鉴权占位符，不触发对应明文凭证 P0；`CCSWITCH_PROXY_ENABLED`
  仅在全局代理服务与该 Agent 路由接管同时开启时生成，并展示 CC Switch、本地端口和真实上游。CC Switch
  普通 Provider 的 Token 字段当前不解析环境变量名；`CCSWITCH_PLAINTEXT_KEY` 因此只提供轮换、原应用替换和
  数据库/备份权限加固，不把变量名伪装成可用 Token，也不把权限缓解声明为彻底解决。

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

所有 `coverage.parse` 任务都以配置文件 `path` 作为稳定实例身份。finding 只保留文件路径、固定安全原因和
“已安全跳过”状态；底层解析器异常、堆栈和配置片段不得进入 evidence、终端、HTML 或任务 ID。

## 项目级规则忽略矩阵

当前允许项目级忽略的 18 条规则如下；其余规则一律不提供入口：

`CLAUDE_LOCAL_BASE_URL`、`CLAUDE_API_KEY_HELPER`、`CLAUDE_HOOKS_PRESENT`、
`CLAUDE_MCP_REMOTE`、`CLAUDE_MCP_STDIO`、`CODEX_MCP_REMOTE`、`CODEX_MCP_STDIO`、
`CODEX_TRUSTED_PROJECTS`、`CODEX_LOCAL_PROXY`、`CCSWITCH_PROXY_ENABLED`、
`OPENCODE_AUTOUPDATE_ON`、`OPENCODE_MCP_REMOTE`、`OPENCODE_MCP_LOCAL`、
`GEMINI_MCP_REMOTE`、`GEMINI_MCP_STDIO`、`GEMINI_AUTH_MODE`、
`OPENCLAW_AGENT_WORKSPACE_OVERLAP`、`OPENCLAW_SERVICE_ENV_PRESENT`。

该列表由 `ruleIgnoreEligibility()` 基于机器矩阵推导并由测试锁定；规则 priority、disposition 或 family
变化时必须重新审查资格。忽略记录不删除 finding，HTML 的技术证据区仍展示生成时的完整脱敏发现。

## Baseline 映射

当前 10 条规则由 baseline 支持。除 `OPENCODE_PERMISSION_WILDCARD` 外，`safe` 与 `balanced` 都按
完整解决处理。`OPENCODE_PERMISSION_WILDCARD` 在 `safe` 下完整解决，在 `balanced` 下仅收紧 Bash，
属于风险缓解。报告必须先提示执行 dry-run，并说明 apply 会应用计划中的全部 baseline 变更，而不是只
修复当前卡片。

矩阵完整性由测试保证：源码新增、删除或改名规则后，如果没有同步更新 `RULE_IDS` 与处置矩阵，测试会失败。
