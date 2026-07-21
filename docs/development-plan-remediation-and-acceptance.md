# AgentGuard 修复助手与风险接受开发计划

> 状态：第一阶段、接受作用域、聚合语义和单任务验证已完成；进入发布验证
>
> 目标版本：`0.0.5-pilot.1`
>
> 核心目标：把“知道下一步做什么”继续升级为“能安全执行，并能记录为什么不做”。

> 后续实施以 [`development-plan-0.0.5-hardening-and-pilot.md`](development-plan-0.0.5-hardening-and-pilot.md)
> 为准。acceptance 项目作用域、聚合任务完整接受语义和单任务验证均已完成；
> 仍需通过发布包、干净安装与 Release 资产回装验证后才能发给 Pilot 用户。

## 1. 用户问题

行动报告已经能区分立即处理、需要确认、建议清理和配置观察，但试用反馈暴露出两个新的阻塞点：

1. 用户知道需要把明文密钥迁出配置，却不知道自己在 macOS、Linux 或 Windows 上应该执行什么命令。
2. 自建中转、内部 MCP 或预期权限经过确认后仍会反复出现，用户无法记录“为什么接受”并从默认待办移除。

因此下一阶段增加两条闭环：

```text
发现 → 本机修复指引 → 预览/执行 → 复扫验证
发现 → 人工确认 → 接受/到期/撤销 → 审计保留
```

## 2. 产品原则

### 2.1 环境变量是传递通道，不等于安全存储

不得把密钥写入 `.zshrc`、`.bashrc`、`.profile`、普通 `.env`、launchd plist、systemd
`EnvironmentFile` 或 Windows 用户环境变量后宣称已安全修复。这些位置仍可能明文落盘，并被备份、同步、
子进程、调试器或恶意工具读取。

报告优先提供：

- macOS Keychain。
- Linux Secret Service、企业 Vault 或受控的进程级注入。
- Windows DPAPI/Credential Store 或受控的当前进程注入。
- 目标架构优先接入 Agent 原生 credential helper/keyring，例如 Claude `apiKeyHelper`、Codex keyring；
  第一阶段尚未自动完成这类配置迁移。

### 2.2 一键修复必须具备安全事务边界

只有已有 dry-run、原子写入、备份、并发修改检测和回滚的 baseline 项可以直接自动应用。凭证迁移必须独立
于普通 baseline：

```text
secret plan
→ 检测系统安全存储
→ 用户安全录入或轮换新凭证
→ 验证目标凭证可用（不输出值）
→ 把配置改为引用/helper
→ 验证真实认证
→ 用户确认清理旧明文
→ 重新扫描
```

第一阶段只生成不含密钥的系统命令和引导，不读取扫描结果中的原始 secret，也不静默删除旧值。

### 2.3 接受风险不是删除证据

风险接受记录以稳定 `taskId` 为主键，必须包含原因和创建时间，可选到期时间。接受后：

- 不进入默认行动队列。
- 不再参与默认 scan/report 的高危退出码判断；到期或撤销后重新参与。
- HTML 仍在“已接受风险”和技术证据区保留。
- 本地审计历史不因过期或撤销而删除。
- 可随时撤销；到期后自动重新进入待办。

## 3. 能力边界

| 场景 | 第一阶段能力 | 自动化边界 |
|---|---|---|
| baseline 权限/暴露面规则 | 生成 dry-run、apply、scan 命令 | 可带备份自动应用 |
| Claude 明文 token | Keychain/Secret Service/DPAPI 引导，真实环境变量仅当前进程注入 | 后续独立实现 `apiKeyHelper` 迁移 |
| Codex 明文 API Key | 提供 OAuth、通用安全存储和当前进程注入建议 | 尚未实现 keyring 自动迁移，不读取并代搬旧 key |
| OpenCode/Gemini/OpenClaw 明文凭证 | 生成通用安全存储模板 | 具体 helper/launcher/reference 仍需人工配置 |
| CC Switch 明文/复用密钥 | 定位原应用、轮换、权限与复扫步骤 | SQLite 始终只读，不执行 SQL 写入 |
| MCP 疑似 secret env | 人工确认值类型 | 仅凭键名不能自动迁移 |
| 自建/内部中转 | `trust add/list/remove` 管理项目级端点；`risk accept` 只用于接受当前任务 | HTTP/TLS、secret 和权限等独立风险不被信任声明吞掉 |

## 4. 多人并行开发拆分

| 工作流 | 交付物 | 边界 |
|---|---|---|
| 修复指令 | 跨平台 remediation guide 与安全测试 | 不写 CLI/HTML |
| 风险接受 | 0600 原子持久化、到期、撤销与历史 | 不写 CLI/HTML |
| 安全审查 | 六类 Agent 凭证迁移能力分级 | 只读，不修改代码 |
| 主线集成 | CLI、默认过滤、HTML、复制命令、文档和端到端测试 | 统一用户行为 |

## 5. 实施里程碑

### M1：跨平台修复指令

- [x] 识别 macOS、Linux、Windows PowerShell。
- [x] baseline 生成预览、应用和复扫命令。
- [x] 明文凭证命令不包含 evidence、标题或原始 secret。
- [x] 禁止持久化到 shell profile/用户环境变量。
- [x] CC Switch 只生成原应用引导。
- [ ] 为 Claude/Codex/OpenCode/Gemini/OpenClaw 增加更细粒度 helper/launcher 模板。

### M2：风险接受

- [x] `~/.agentguard/acceptances.json`，目录 0700、文件 0600、原子写入。
- [x] 接受原因、创建时间、可选到期时间、撤销时间和脱敏任务摘要。
- [x] `agentguard risk accept/list/revoke`。
- [x] P0 任务强制限时接受，不允许永久隐藏。
- [x] 默认 scan/report/退出码排除有效接受记录。
- [x] HTML 展示已接受风险和撤销命令，技术证据继续保留。
- [ ] 增加按规则、端点域名和 Agent 范围的批量策略。
- [x] 接受记录按项目 `scopeId` 隔离，旧无作用域记录保留为 legacy 且不再生效。
- [x] 聚合任务接受前展示全部关联规则和接受条件，并要求显式 `--confirm`。

### M3：真正的凭证迁移事务

- [ ] `agentguard secret plan`：只读能力探测和迁移计划。
- [ ] `agentguard secret migrate <task-id>`：显式交互，使用 secure prompt。
- [ ] 目标安全存储非空验证，但不输出值、长度或 hash。
- [ ] 新认证真实连通验证成功后，才允许用户确认清理旧值。
- [ ] 独立的非秘密事务日志；不得备份或复制旧明文 secret。

### M4：桌面端一键操作

- [x] 报告卡片与桌面端任务 ID 对齐。
- [x] “预览修复”“执行并备份”按钮，计划指纹不一致时拒绝写入。
- [x] “接受风险”“撤销接受”“信任端点”“撤销信任”按钮，并在操作后复扫。
- [x] baseline 写操作显示逐文件 diff、备份/恢复方式和复扫结果；其它策略写操作刷新任务状态。
- [ ] 静态 HTML 保持只读，只负责复制命令，不能直接调用本地执行能力。

## 6. 验收标准

- 操作系统命令模板不包含任何 finding 原始 evidence 中的 secret。
- 不生成把密钥写入 shell profile、普通 `.env` 或 Windows 用户环境的伪安全方案。
- baseline 自动应用继续强制预览、备份与复扫。
- 接受风险必须有原因；过期后自动重新出现；撤销和过期记录均保留审计历史。
- 接受的高危任务不再导致默认 CLI 退出码为 2，撤销后恢复。
- HTML 可复制本机命令，并能清楚区分“可自动应用”和“安全引导”。
- CC Switch SQLite、Codex TOML 等现有只读边界不被突破。
- 完整测试通过，报告与审计文件不泄露明文凭证。
