# AgentGuard Product Positioning Proposal v1.1

**Version:** v1.1
**Date:** 2026-07-15
**Status:** 已与 `0.0.5-pilot.1` 候选能力同步

> 本文描述产品定位和演进方向；当前已实现能力和明确边界以
> [`docs/product-capabilities.md`](docs/product-capabilities.md) 为准。

## 1. 背景

AgentGuard 最初定位为 Agent Security Scanner，通过静态扫描帮助开发者识别 AI Agent 配置风险。

早期设想覆盖 Prompt、MCP、Tool、Secret 和 Configuration Security。经过 MVP 实现和真实报告验证，
当前产品重心已经更明确：先解决 Coding Agent 的配置发现、Provider/MCP/权限/凭证风险，以及发现后的
整改与风险接受闭环。

当前没有实现 Prompt/Skills 内容安全和 Runtime 拦截，不能把它们作为现有功能宣传。

结论：MVP 不需要推倒重来，但产品定位应从“一次性扫描器”升级为“持续配置治理工具”。

## 2. 市场分层

### 第一层：Agent Runtime

代表：Claude Code、OpenAI Codex、Cursor、Gemini CLI、TRAE、通义灵码等。

负责 Runtime、Sandbox、Permission、Tool Calling。AgentGuard 不与其正面竞争。

### 第二层：Endpoint Security

代表：CrowdStrike、Defender、SentinelOne、Jamf。

负责终端、进程、文件、网络与 OS 安全。AgentGuard 不做 EDR、MDM 或通用终端防护。

### 第三层：Agent Configuration Security & Governance

聚焦：

- 多 Agent 配置发现与 Inventory。
- Provider、代理链路和 MCP 安全。
- 权限、hooks、workspace 与凭证配置。
- 下一步行动、可回滚整改和风险接受。
- 配置漂移和 Policy as Code。

这是 AgentGuard 的核心机会。

## 3. 产品定位

> **AgentGuard：面向开发型 AI Agent 的开源安全检测与配置治理工具。**

一句话：

> 持续检测、评估和治理 AI Agent 的配置安全，而不是替代 Agent Runtime。

当前用户价值：

> 看清当前配置 → 知道下一步做什么 → 安全执行或明确接受 → 复扫验证并保留审计。

## 4. 产品边界

### 当前要做

- Agent、Provider、代理链路、MCP 和 Workspace 配置发现。
- Secret、权限、hooks 和暴露面风险识别。
- 跨 Agent 关联和根因任务聚合。
- 跨平台修复指引、有限 baseline 整改、备份和恢复。
- 风险接受、到期、撤销和本地审计。
- 后续的配置漂移、Workspace Inventory 和 Policy。

### 当前不做

- Endpoint Security、EDR、MDM。
- 替代 Claude Code/Codex 等 Runtime。
- 通用漏洞扫描器或完整 Prompt Injection 防护。
- 自动修改 CC Switch SQLite。
- 未经验证的一键凭证搬运。
- 尚无重复使用证据的跨机器 Dashboard。
- 当前阶段的 Runtime Tool Call/MCP Gateway 拦截。

## 5. 当前已经完成

`0.0.5-pilot.1` 候选已经具备：

- 六类 Coding Agent 配置发现和定向深扫。
- 多 Provider 分类、用户信任策略和代理真实上游展开。
- 63 条规则处置矩阵与“下一步行动报告”。
- macOS/Linux/Windows 修复命令模板和复制能力。
- 四类 Agent 的有限 baseline dry-run/apply/restore。
- 以稳定 task ID 为基础的风险接受、到期、撤销和审计。
- JSON v1、CI 示例和 Electron 开发者预览。

这些能力证明 AgentGuard 已经超过“扫描后结束”的产品形态，但仍需真实用户验证能否完成整改闭环。

## 6. 产品路线

### Phase 1：Static Security（MVP 已完成）

发现 Agent、Provider、MCP、权限、凭证和 Workspace 风险，输出脱敏报告。

### Phase 2：Remediation & Triage（当前阶段）

- 行动优先级和根因任务聚合。
- 跨平台处置指引和有限自动整改。
- 风险接受、到期、撤销和复扫。
- 已完成接受项目作用域；继续修复任务级完整处置语义和单任务验证。
- 用 5–10 名用户验证实际修复率、接受率和复扫率。

### Phase 3：Configuration Governance

- Provider trust policy 管理。
- Workspace Inventory。
- 新增、已解决、重新出现和接受到期等 Drift Tracking。
- 只对新增高优先级风险进行 CI 门禁。

### Phase 4：Policy as Code

建立跨 Agent 的统一安全意图和适配模型，并支持团队策略分发与审计。

### Phase 5：Limited Runtime（长期）

在配置治理获得真实团队采用后，再研究 Tool Call、MCP Gateway、Runtime Audit 和有限策略执行。

## 7. Dashboard 的进入条件

Dashboard 用于展示 Workspace、Agent、MCP、Tool、Secret、Risk、Drift 和 Policy 合规状态，不是终端
资产管理。

它不是当前下一步。Dashboard 依赖稳定的 Workspace 身份、任务身份、漂移事件和团队重复使用需求；在
单机处置闭环尚未验证前建设 Dashboard，会放大尚未验证的数据模型。

## 8. 产品价值

AgentGuard 当前回答：

1. 当前 Agent 配置是否安全？
2. 多个 Agent、MCP、Provider 和 Tool 组合后是否存在集中风险？
3. 我下一步应该执行什么命令，如何验证？
4. 哪些风险已经确认接受，原因和复审时间是什么？

未来在 Drift 阶段还要回答：

5. 从上次扫描到现在，新增、解决或重新出现了什么？

## 9. 下一阶段重点

`0.0.5` 已完成三项处置语义加固：

1. 风险接受已增加项目作用域，避免一个项目的接受记录影响另一个项目。
2. 聚合任务已完整展示所有子规则的下一步、验证和接受条件，不再只展示 primary action。
3. 已增加单任务验证能力，让用户知道刚处理的任务是已解决、仍存在还是仅缓解。

下一步先完成发布包与 Release 资产验证，再执行 7–14 天 Pilot，回收安装成功率、行动理解率、
命令执行率、实际修复率、风险接受率和 verify/复扫率。

Pilot 通过后，推荐顺序：

```text
Endpoint Trust 管理 → Drift Tracking → 按真实阻塞决定 Secret Plan/Migrate → 桌面端操作按钮
```

若至少 40% 试用者把“不会或不敢迁移凭证”列为最大阻塞，则把只读 `secret plan` 提到 Drift 前；完整
`migrate` 仍只应先支持边界清晰的 Codex keyring 和 Claude helper。

## 10. 当前结论

AgentGuard 不应成为新的 EDR，也不应与 Agent Runtime 正面竞争。

应聚焦：

**Agent Configuration Security & Governance**

采用：

```text
Static Security
→ Remediation & Triage
→ Configuration Governance
→ Policy as Code
→ Limited Runtime
```

逐步演进，并以真实处置和重复使用数据作为每次升级的进入条件。
