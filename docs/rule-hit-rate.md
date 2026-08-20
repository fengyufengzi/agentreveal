# AgentReveal 高价值规则质量基线

> 状态：Active · 生成日期：2026-08-17 · 数据源：40 个合成场景

> 本报告只使用合成配置，并运行真实 parser、detector 与行动任务聚合。低频不代表低价值；本报告不根据出现频率建议删除规则。

## 1. 质量门禁

- 结果：✓ 通过
- 场景：40/40 通过
- 当前批次覆盖：43 条高价值 ruleId
- finding：预期 48，实际 48
- 行动任务：预期 37，实际 37
- 漏报：0；意外告警：0；重复任务：0；错误合并：0
- 隐私失败：0

## 2. 场景结果

| 场景 | Agent | 预期 ruleId | 实际 ruleId | 任务 | 结果 |
|---|---|---|---|---:|---|
| `claude-official-clean`<br>Claude Code 官方 HTTPS 端点，无风险 | Claude Code | — | — | 0/0 | ✓ |
| `claude-unknown-https`<br>Claude Code 使用未知 HTTPS Provider | Claude Code | `CLAUDE_UNKNOWN_BASE_URL` | `CLAUDE_UNKNOWN_BASE_URL` | 1/1 | ✓ |
| `claude-unknown-http`<br>Claude Code 的同一未知端点同时使用明文 HTTP | Claude Code | `CLAUDE_INSECURE_HTTP`<br>`CLAUDE_UNKNOWN_BASE_URL` | `CLAUDE_INSECURE_HTTP`<br>`CLAUDE_UNKNOWN_BASE_URL` | 1/1 | ✓ |
| `claude-plaintext-token`<br>Claude Code settings 中存在明文凭证 | Claude Code | `CLAUDE_PLAINTEXT_TOKEN` | `CLAUDE_PLAINTEXT_TOKEN` | 1/1 | ✓ |
| `claude-bypass-permissions`<br>Claude Code 跳过全部工具审批 | Claude Code | `CLAUDE_BYPASS_PERMISSIONS` | `CLAUDE_BYPASS_PERMISSIONS` | 1/1 | ✓ |
| `claude-proxy-placeholder`<br>CC Switch 占位符不误报为明文凭证 | Claude Code | `CLAUDE_LOCAL_BASE_URL` | `CLAUDE_LOCAL_BASE_URL` | 1/1 | ✓ |
| `codex-official-clean`<br>Codex 官方 HTTPS 端点，无风险 | Codex | — | — | 0/0 | ✓ |
| `codex-custom-https`<br>Codex 使用未知 HTTPS Provider | Codex | `CODEX_CUSTOM_PROVIDER` | `CODEX_CUSTOM_PROVIDER` | 1/1 | ✓ |
| `codex-custom-http`<br>Codex 的同一自定义 Provider 同时使用明文 HTTP | Codex | `CODEX_CUSTOM_PROVIDER`<br>`CODEX_INSECURE_HTTP` | `CODEX_CUSTOM_PROVIDER`<br>`CODEX_INSECURE_HTTP` | 1/1 | ✓ |
| `codex-plaintext-api-key`<br>Codex auth.json 中存在明文 API Key | Codex | `CODEX_PLAINTEXT_API_KEY` | `CODEX_PLAINTEXT_API_KEY` | 1/1 | ✓ |
| `opencode-reference-clean`<br>OpenCode 使用环境变量引用，不误报明文凭证 | OpenCode | — | — | 0/0 | ✓ |
| `opencode-custom-http`<br>OpenCode 的同一自定义 Provider 同时使用明文 HTTP | OpenCode | `OPENCODE_CUSTOM_PROVIDER`<br>`OPENCODE_INSECURE_HTTP` | `OPENCODE_CUSTOM_PROVIDER`<br>`OPENCODE_INSECURE_HTTP` | 1/1 | ✓ |
| `opencode-plaintext-key`<br>OpenCode 配置中存在明文 API Key | OpenCode | `OPENCODE_PLAINTEXT_KEY` | `OPENCODE_PLAINTEXT_KEY` | 1/1 | ✓ |
| `opencode-broad-permissions`<br>OpenCode Bash 与整体放行属于同一执行权限根因 | OpenCode | `OPENCODE_BASH_UNRESTRICTED`<br>`OPENCODE_PERMISSION_WILDCARD` | `OPENCODE_BASH_UNRESTRICTED`<br>`OPENCODE_PERMISSION_WILDCARD` | 1/1 | ✓ |
| `ccswitch-official-clean`<br>CC Switch 当前 Provider 为官方 HTTPS 端点 | CC Switch | — | — | 0/0 | ✓ |
| `ccswitch-relay-http`<br>CC Switch 的同一中转端点同时使用明文 HTTP | CC Switch | `CCSWITCH_INSECURE_HTTP`<br>`CCSWITCH_RELAY_ENDPOINT` | `CCSWITCH_INSECURE_HTTP`<br>`CCSWITCH_RELAY_ENDPOINT` | 1/1 | ✓ |
| `ccswitch-plaintext-shared-key`<br>CC Switch 同时存在明文凭证与跨用途复用 | CC Switch | `CCSWITCH_PLAINTEXT_KEY`<br>`CCSWITCH_SHARED_KEY` | `CCSWITCH_PLAINTEXT_KEY`<br>`CCSWITCH_SHARED_KEY` | 2/2 | ✓ |
| `claude-mcp-server`<br>Claude Code 同一全局 MCP 的执行方式与凭证字段合并为一个任务 | Claude Code | `CLAUDE_MCP_SECRET_ENV`<br>`CLAUDE_MCP_STDIO` | `CLAUDE_MCP_SECRET_ENV`<br>`CLAUDE_MCP_STDIO` | 1/1 | ✓ |
| `claude-mcp-scope-distinct`<br>Claude Code 同名 MCP 的全局与项目作用域保持两个任务 | Claude Code | `CLAUDE_MCP_REMOTE`<br>`CLAUDE_MCP_STDIO` | `CLAUDE_MCP_REMOTE`<br>`CLAUDE_MCP_STDIO` | 2/2 | ✓ |
| `codex-mcp-server`<br>Codex 同一 MCP 的本地执行与凭证字段合并为一个任务 | Codex | `CODEX_MCP_SECRET_ENV`<br>`CODEX_MCP_STDIO` | `CODEX_MCP_SECRET_ENV`<br>`CODEX_MCP_STDIO` | 1/1 | ✓ |
| `codex-mcp-disabled`<br>Codex 显式停用的 MCP 不产生行动任务 | Codex | — | — | 0/0 | ✓ |
| `opencode-mcp-server`<br>OpenCode 同一远程 MCP 的端点与凭证字段合并为一个任务 | OpenCode | `OPENCODE_MCP_REMOTE`<br>`OPENCODE_MCP_SECRET_ENV` | `OPENCODE_MCP_REMOTE`<br>`OPENCODE_MCP_SECRET_ENV` | 1/1 | ✓ |
| `opencode-mcp-distinct`<br>OpenCode 两个不同 MCP server 不会被错误合并 | OpenCode | `OPENCODE_MCP_REMOTE`<br>`OPENCODE_MCP_REMOTE` | `OPENCODE_MCP_REMOTE`<br>`OPENCODE_MCP_REMOTE` | 2/2 | ✓ |
| `gemini-mcp-server`<br>Gemini 同一 MCP 的 trust、执行与凭证字段合并为一个任务 | Gemini CLI | `GEMINI_MCP_SECRET_ENV`<br>`GEMINI_MCP_STDIO`<br>`GEMINI_MCP_TRUST_BYPASS` | `GEMINI_MCP_SECRET_ENV`<br>`GEMINI_MCP_STDIO`<br>`GEMINI_MCP_TRUST_BYPASS` | 1/1 | ✓ |
| `gemini-shell-no-sandbox`<br>Gemini 显式启用 shell 且没有 sandbox | Gemini CLI | `GEMINI_SHELL_NO_SANDBOX` | `GEMINI_SHELL_NO_SANDBOX` | 1/1 | ✓ |
| `gemini-shell-sandboxed`<br>Gemini shell 已启用 sandbox 时不产生告警 | Gemini CLI | — | — | 0/0 | ✓ |
| `gemini-env-reference`<br>Gemini .env 使用环境变量引用时不误报明文凭证 | Gemini CLI | — | — | 0/0 | ✓ |
| `gemini-env-plaintext`<br>Gemini .env 明文凭证只报告键名 | Gemini CLI | `GEMINI_PLAINTEXT_ENV_KEY` | `GEMINI_PLAINTEXT_ENV_KEY` | 1/1 | ✓ |
| `openclaw-safe-references`<br>OpenClaw 环境变量引用、loopback、Tailnet 与 npm 插件不误报 | OpenClaw | — | — | 0/0 | ✓ |
| `openclaw-gateway-exposure`<br>OpenClaw 非 loopback 与公开 Funnel 合并为一个网关暴露任务 | OpenClaw | `OPENCLAW_GATEWAY_EXPOSED_BIND`<br>`OPENCLAW_TAILSCALE_EXPOSURE` | `OPENCLAW_GATEWAY_EXPOSED_BIND`<br>`OPENCLAW_TAILSCALE_EXPOSURE` | 1/1 | ✓ |
| `openclaw-channel-credentials`<br>OpenClaw 渠道 secret 与 token 是两个独立凭证任务 | OpenClaw | `OPENCLAW_CHANNEL_PLAINTEXT_SECRET`<br>`OPENCLAW_CHANNEL_PLAINTEXT_TOKEN` | `OPENCLAW_CHANNEL_PLAINTEXT_SECRET`<br>`OPENCLAW_CHANNEL_PLAINTEXT_TOKEN` | 2/2 | ✓ |
| `openclaw-review-inventory`<br>OpenClaw workspace、插件来源与 service-env 保持三个不同任务 | OpenClaw | `OPENCLAW_AGENT_WORKSPACE_OVERLAP`<br>`OPENCLAW_SERVICE_ENV_PRESENT`<br>`OPENCLAW_UNKNOWN_PLUGIN_SOURCE` | `OPENCLAW_AGENT_WORKSPACE_OVERLAP`<br>`OPENCLAW_SERVICE_ENV_PRESENT`<br>`OPENCLAW_UNKNOWN_PLUGIN_SOURCE` | 3/3 | ✓ |
| `gemini-parse-failure`<br>Gemini 损坏 JSON 明确形成扫描盲区任务 | Gemini CLI | `GEMINI_PARSE_FAILED` | `GEMINI_PARSE_FAILED` | 1/1 | ✓ |
| `openclaw-parse-failure`<br>OpenClaw 损坏 JSON 明确形成扫描盲区任务 | OpenClaw | `OPENCLAW_PARSE_FAIL` | `OPENCLAW_PARSE_FAIL` | 1/1 | ✓ |
| `ccswitch-schema-unknown`<br>CC Switch 未验证 schema 明确形成覆盖审查任务 | CC Switch | `CCSWITCH_SCHEMA_UNKNOWN` | `CCSWITCH_SCHEMA_UNKNOWN` | 1/1 | ✓ |
| `workspace-scan-truncated`<br>项目敏感文件达到上限时同时保留已发现路径与截断盲区 | 当前项目 | `PROJECT_SENSITIVE_FILE`<br>`PROJECT_SENSITIVE_SCAN_TRUNCATED` | `PROJECT_SENSITIVE_FILE`<br>`PROJECT_SENSITIVE_SCAN_TRUNCATED` | 2/2 | ✓ |
| `cross-agent-shared-proxy`<br>两个 Agent 共用本地代理时产生一个集中风险任务 | 跨 Agent | `XAGENT_SHARED_PROXY` | `XAGENT_SHARED_PROXY` | 1/1 | ✓ |
| `cross-agent-single-proxy`<br>只有一个 Agent 使用本地代理时不产生集中风险 | 跨 Agent | — | — | 0/0 | ✓ |
| `cross-agent-shared-endpoint`<br>两个 Agent 共用非官方端点时产生一个集中风险任务 | 跨 Agent | `XAGENT_SHARED_ENDPOINT` | `XAGENT_SHARED_ENDPOINT` | 1/1 | ✓ |
| `cross-agent-official-endpoint`<br>两个 Agent 共用官方端点时不产生集中风险 | 跨 Agent | — | — | 0/0 | ✓ |

## 3. 当前重复告警结论

- 同一 Provider 的“未知/中转端点”与“明文 HTTP”保留两条技术 finding，但聚合为一个行动任务；用户只处理一次，同时保留两个验证条件。
- OpenCode 的 `OPENCODE_BASH_UNRESTRICTED` 与 `OPENCODE_PERMISSION_WILDCARD` 来自同一份宽泛权限配置，保留两条规则要求，但聚合为一个执行权限任务。
- 同一个 MCP server 的端点/启动方式、trust 和疑似凭证字段按 Agent 与 server 聚合；Claude Code 额外保留 global/project 作用域，两个不同 server 或作用域不会误合并。
- OpenClaw 同一网关的非 loopback bind 与 Funnel/public 暴露聚合为一个网关暴露任务，并保留两个独立验证条件。
- 明文凭证与密钥复用属于不同根因，继续显示为两个任务，不为追求更少数量而错误合并。

## 4. 失败明细

> 当前批次无漏报、意外告警、重复任务或凭证明文泄漏。

## 5. 边界与下一批

当前批次覆盖 Claude Code、Codex、CC Switch、OpenCode、Gemini CLI、OpenClaw、当前项目与跨 Agent 关联中的 43 条高价值 ruleId。尚未进入场景的规则继续按 Q2/Q3 计划补齐；未覆盖不等于低价值或删除候选。

## 6. 复现命令

```bash
npm run build
node scripts/rule-hit-rate.mjs
```
