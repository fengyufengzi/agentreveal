# AgentGuard 当前产品能力

> 本文是“AgentGuard 现在实际能做什么”的规范化摘要；代码和测试是最终事实依据。
>
> 当前源码与最新私有 Pre-release：`0.0.5-pilot.1`。
>
> 更新日期：2026-07-15。

## 1. 产品定位

AgentGuard 是面向开发型 AI Agent 的本地安全检测与配置治理工具。

它不替代 Claude Code、Codex、OpenCode 等 Agent Runtime，也不做 EDR、MDM 或通用终端防护。当前核心
价值是回答四个问题：

1. 本机配置了哪些 Coding Agent，它们连接了哪些 Provider、代理和 MCP？
2. 哪些配置是真正需要行动的风险，哪些只是需要确认或观察？
3. 用户在当前操作系统上应该执行什么命令，如何验证整改结果？
4. 哪些预期风险已经接受，为什么接受，何时到期，如何撤销？

产品主流程：

```text
发现 → 归因聚合 → 行动排序 → 本机处置 → 复扫验证
                       ↘ 接受/到期/撤销 → 审计保留
```

## 2. 当前产品形态

| 形态 | 状态 | 说明 |
|---|---|---|
| CLI | 主入口 | 完整覆盖扫描、报告、baseline、备份恢复和风险接受 |
| 自包含 HTML | 主报告 | 离线打开；显示行动任务、本机命令、接受状态和完整脱敏证据 |
| JSON | 自动化接口 | `schemaVersion: 1`；用于 CI 和其它工具消费 |
| Electron 桌面壳 | 开发者预览 | 只开放 doctor/scan/map/provider/baseline dry-run/report，不是签名发布的正式桌面产品 |
| GitHub Actions 示例 | 可用 | 下载固定 Pre-release 包，执行扫描并存档报告 |

## 3. 已实现功能

### 3.1 环境发现与风险扫描

- 发现 Claude Code、Codex、CC Switch、OpenCode、Gemini CLI 和 OpenClaw 配置。
- 检查 Provider/base URL、代理真实上游、MCP、权限、hooks、明文凭证、共享密钥和 Workspace 敏感文件名。
- 跨 Agent 识别共享代理和共享未知端点。
- Provider 支持官方、国内官方、本地/内网、公网 IP、未知中转和用户信任策略分类。
- 扫描和报告不输出完整 API Key、Token 或私钥；密钥复用只使用不可逆指纹。

### 3.2 配置地图

- 按 Agent 汇总端点、MCP、凭证、敏感文件和权限发现。
- 展开“Agent → 本地代理/CC Switch → 真实 Provider”两跳链路。
- 区分未配置、无风险和不同严重度状态。

### 3.3 下一步行动报告

- 63 条具体规则全部映射到统一处置矩阵。
- 将潜在影响 `severity` 与行动顺序 `priority` 分开。
- 将 finding 聚合为稳定 `taskId`，避免同一根因重复要求用户处理。
- 报告按“立即处理 / 需要确认 / 建议清理 / 配置观察”组织。
- 每个任务按规则 ID 逐条包含原因、下一步、验证方式、接受条件和关联技术证据，不再由 `primary` 文案覆盖其它规则。
- 修复命令明确标记为“完整解决 / 风险缓解 / 辅助步骤”；混合任务必须完成全部规则条件。
- 配置观察不进入默认待处理数量。

### 3.4 跨平台修复引导

- 根据生成报告的操作系统输出 macOS、Linux 或 Windows PowerShell 命令。
- baseline 项生成 dry-run、带备份 apply 和复扫命令。
- macOS 明文凭证引导使用 Keychain；Linux 使用 Secret Service；Windows 使用用户 DPAPI 凭证文件。
- 仅为工具真实支持的变量生成当前进程/会话注入，不写 shell profile、普通 `.env` 或 Windows 用户环境。
- HTML 提供“复制命令”按钮，但静态报告不会直接执行本地操作。
- CC Switch SQLite 保持只读，只引导用户在原应用中修改和轮换凭证。
- Linux/Windows 已覆盖 remediation 模板测试；Agent 配置路径和真实环境验证目前仍以 macOS 为主，
  不等于六类 Agent 已完成三平台端到端验证。

### 3.5 有限自动整改与恢复

- `baseline --dry-run` 预览 OpenCode、Claude Code、Gemini CLI 和 OpenClaw 的有限安全基线变更。
- `apply --backup` 强制先备份，检测并发修改，使用原子写入，失败时自动恢复。
- `restore` 恢复最近或指定备份，并验证备份完整性与路径边界。
- 自动整改只覆盖已经具备安全写入和回滚保障的配置，不以扩大写入范围追求自动化率。

### 3.6 风险接受与审计

- `risk accept <task-id> --reason ... [--expires ...] [--confirm]` 接受当前任务；没有 `--confirm` 时只展示全部规则、
  严重度和接受条件，不写入记录。
- 有效接受的任务不进入默认行动结果，也不再参与 `scan/report` 高危退出码判断；到期或撤销后重新参与。
- P0 任务必须设置到期时间，不能永久隐藏。
- `risk list [--all]` 查看有效记录或完整历史；`risk revoke` 撤销。
- 审计文件默认位于 `~/.agentguard/acceptances.json`，目录 0700、文件 0600、原子写入。
- 过期和撤销记录不会删除；HTML 仍保留已接受任务和完整技术证据。
- acceptance schema v2 按规范化 cwd 的 SHA-256 `scopeId` 隔离当前项目，不保存项目路径。
- 旧 v1 无作用域记录只作为 legacy 审计保留，不再影响任何项目；用户需在当前项目重新确认。
- 新接受记录保存全部规则的静态摘要，但不保存 evidence、动态标题、内部端点或项目路径；报告占位原因会被拒绝。

### 3.7 单任务验证

- `risk verify <task-id>` 重新扫描并区分已解决、仍存在、部分缓解、已接受、接受已过期/撤销和身份变化；
  缺少可比较基线时返回“无法确认”，不会误判为已解决。
- HTML 明确说明它是静态快照，处置后必须 verify 并重新生成报告。
- 生成报告时只保存项目作用域内的任务规则摘要，用于比较规则消失或任务身份变化；快照默认位于
  `~/.agentguard/task-snapshots.json`，使用 0600 权限且不保存 evidence、路径、动态标题或端点。

## 4. 支持矩阵

| 对象 | 当前支持 | 自动写入边界 |
|---|---|---|
| Claude Code | Provider、明文 token、权限模式、危险 allow、hooks、MCP | baseline 收敛权限/MCP；凭证只引导 |
| Codex | 自定义 Provider、MCP、明文 API Key、trusted projects、代理 | TOML 保持只读；提供 OAuth/安全存储建议，尚无 keyring 自动迁移 |
| CC Switch | SQLite Provider、明文/共享密钥、内置代理、failover 真实上游 | SQLite 始终只读 |
| OpenCode | Provider、明文 key、bash/通配权限、share、autoupdate、MCP | 部分 baseline 可写；凭证只引导 |
| Gemini CLI | MCP trust/remote/stdio、`.env` 凭证、shell sandbox、鉴权模式 | MCP trust baseline；凭证只引导 |
| OpenClaw | 渠道/网关凭证、bind/Tailscale 暴露、workspace、插件源 | 网络暴露面 baseline；凭证只引导 |
| 当前项目 | 敏感文件名与扫描截断提示 | 只读，不读取文件内容 |

## 5. 当前没有实现

以下内容不能作为现有产品能力对外承诺：

- 真正的一键凭证迁移：尚无 `secret plan/migrate` 两阶段事务。
- 自动轮换或撤销上游 API Key。
- 自动修改 CC Switch SQLite 或带注释的 Codex TOML。
- 结构化“误报”类型、按规则/域名/Agent 的批量接受，以及团队共享 acceptance policy。
- Prompt 内容安全、Skills 内容审计或运行时 Prompt Injection 拦截。
- 持久化 Workspace Inventory、配置漂移历史和跨机器 Dashboard。
- 组织策略分发、多人审批、团队身份权限和服务端审计。
- Runtime Tool Call/MCP Gateway 拦截。
- 签名、公证并面向普通用户发布的桌面应用。

## 6. 标准用户流程

```bash
agentguard doctor
agentguard scan
agentguard map
agentguard report --format html
```

报告为 baseline 和部分凭证场景给出本机命令模板，其余任务给出人工步骤。baseline 支持项先预览，再应用：

```bash
agentguard baseline --profile balanced --dry-run
agentguard apply --profile balanced --backup
agentguard scan
```

经过确认的预期配置可以在当前项目作用域接受并保留原因：

```bash
agentguard risk accept task-xxxxxxxxxxxx --reason "已核对归属、TLS 和访问控制"
agentguard risk accept task-xxxxxxxxxxxx --reason "已核对归属、TLS 和访问控制" --confirm
agentguard risk verify task-xxxxxxxxxxxx
agentguard risk list
agentguard risk revoke task-xxxxxxxxxxxx
```

## 7. 当前产品阶段与下一道门槛

当前不是继续增加规则和 Agent 数量的阶段。项目作用域、聚合任务完整语义和单任务验证已经完成；
本地发布包和干净 prefix 安装已经验证；接下来创建并回装验证 GitHub Pre-release 资产、
清理开源前 Git 历史敏感信息，再验证“发现后能否完成处置”。

进入 Inventory、Drift 或 Dashboard 前，至少需要完成一轮 `0.0.5-pilot.1` 真实试用并证明：

- 用户能独立找到并理解本机命令。
- 至少一部分用户完成真实整改并复扫消除任务。
- 用户能正确区分修复、接受和观察，不把“隐藏提示”当作修复。
- 风险接受原因和到期机制符合用户预期。
- 没有凭证泄漏、配置损坏或无法恢复事件。
- 当前树、npm 发布内容和全部公开 Git 历史均通过敏感信息检查。

若闭环验证成立，推荐先建设 Endpoint Trust 管理，再以 Drift Tracking 建立重复使用价值；只有当 Pilot
证明凭证迁移是主要阻塞时，才把只读 `secret plan` 提前。不要直接进入自动搬运凭证或 Dashboard。
