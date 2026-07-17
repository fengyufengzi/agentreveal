# AgentGuard Pilot Ready 试用方案

> 状态：`v0.0.5-pilot.1` 已发布并完成资产回装验证，可开始邀请 5–10 人；
> 目标不是扩功能，而是验证“修复或接受后能否完成复扫闭环”。

固定试点基线：<https://github.com/fengyufengzi/AgentGuard/releases/tag/v0.0.5-pilot.1>

## 1. 本轮要验证什么

AgentGuard 当前需要验证五个核心假设：

1. 多 Agent 用户能否在 10 分钟内完成安装、扫描并理解主要风险。
2. 配置地图、跨 Agent 关联和整改建议中，是否至少有一项会促使用户采取行动。
3. 用户是否愿意重复运行 AgentGuard，或把它接入项目 CI。
4. 用户能否独立复制并正确执行一条与操作系统匹配的修复命令，并理解它是否完整解决风险。
5. 用户能否正确使用风险接受、到期和撤销，而不会把隐藏提示误认为已经修复。

本轮不验证 Dashboard、企业多租户、Runtime Enforcement，也不以新增 Agent 数量作为成功指标。

## 2. 建议试用对象

优先邀请 5–10 名试用者：

- 同时使用至少两个 AI Coding Agent 的重度开发者。
- 管理小团队开发规范或 AI 工具接入的技术负责人。
- 负责 AI/应用安全评估的平台或安全人员。

尽量覆盖至少 2 名个人重度用户、2 名团队负责人和 1 名安全/平台人员。

试点开始前应完成 [`0.0.5` 发布前加固](development-plan-0.0.5-hardening-and-pilot.md)，再提供一个固定
commit 或 `v0.0.5-pilot.N` 预发布标签，所有参与者使用同一构建；
不要直接以持续变化的 `main` 作为试点版本。

## 3. 30 分钟陪伴式试用流程

### A. 开始前（5 分钟）

记录以下信息，不收集密钥、Token 或完整配置内容：

- 操作系统与 Node.js 版本。
- 日常使用的 Agent 数量和名称。
- 是否使用自定义 Provider、中转 API 或 CC Switch。
- 是否使用 MCP、自动权限或团队 CI。

### B. 独立操作（10 分钟）

请试用者仅参考 README 完成：

```bash
agentguard doctor
agentguard scan
agentguard map
agentguard report --format html
```

请每名试用者至少选择一个真实任务，完成以下任一路径：

```text
执行修复指引 → risk verify → 重新生成报告 → 确认任务已解决、缓解或仍存在
确认预期配置 → risk accept preflight → --confirm → risk verify → risk revoke（演示撤销）
```

如果发现可自动收敛项，再执行：

```bash
agentguard baseline --profile balanced --dry-run
agentguard apply --profile balanced --backup
agentguard restore
```

观察并记录：安装是否受阻、哪个输出最先被理解、哪些风险无法理解、是否担心工具读取或修改配置。

### C. 结果确认（10 分钟）

逐项确认：

- 是否发现了用户此前不知道的 Agent、Provider、MCP 或代理链路。
- 风险是否真实；如不真实，记录规则 ID 和误报原因。
- 用户是否认可严重度。
- 用户是否执行或计划执行整改。
- dry-run、backup、restore 是否足以建立修改信任。
- 报告中的本机命令是否匹配操作系统和实际 Shell。
- 用户是否理解“存入安全存储”不等于目标 Agent 已完成凭证迁移。
- 接受任务时，是否理解一个聚合任务可能包含多个关联规则。
- `risk verify` 后是否能确认刚处理的任务已经解决、缓解、仍存在、身份变化或仅被接受。
- 用户最想再次使用的场景是什么。

### D. 收尾（5 分钟）

询问四个强制问题：

1. 如果下周只能保留一个能力，你会保留 `scan`、`map`、`report`、修复命令、风险接受还是 CI？
2. 什么情况下你会再次运行 AgentGuard？
3. 哪一条结果最没有价值或最像误报？
4. 你是否愿意把它推荐给另一位多 Agent 用户或在团队中试点？

## 4. 单次试用记录模板

```markdown
## Pilot-XX

- 日期：
- 用户类型：个人重度 / 团队负责人 / 安全平台
- OS / Node：
- Agent 数量：
- 自定义 Provider / CC Switch / MCP：
- 完成首次 scan 用时：
- 是否独立完成：是 / 否
- 发现的有效风险（规则 ID）：
- 误报或不认可项（规则 ID + 原因）：
- 是否采取整改：已执行 / 计划执行 / 不执行
- 最有价值能力：scan / map / report / baseline / CI
- 是否愿意重复使用：是 / 否 / 不确定
- 是否有团队试点意向：是 / 否
- 原话摘要：
- 阻塞问题：
```

记录中不要粘贴完整配置、报告原文、API Key、Token、私钥或未脱敏的内部域名。
也可以使用仓库的 [`Pilot 试用反馈`](../.github/ISSUE_TEMPLATE/pilot_feedback.md) Issue 模板提交同样的信息。

## 5. Pilot Ready 出口标准

进入 Inventory & Drift 阶段前，至少满足：

- 完成 5 次真实环境试用。
- 至少 3 名用户确认发现了真实且此前不清楚的问题。
- 至少 2 名用户实际采取了一项整改。
- 至少 3 名用户独立复制并执行一条修复命令，其中至少 2 人通过复扫确认结果。
- 至少完成 3 次 `accept → list → revoke/expiry` 真实闭环，且没有跨项目错误隐藏。
- 至少 80% 用户能在 3 分钟内指出最先处理的任务；至少 60% 能独立执行一条 remediation 命令。
- 至少 1 个团队愿意重复运行或接入 CI。
- 首次完成 `doctor → scan → map/report` 的中位时间不超过 10 分钟。
- 没有明文凭证泄漏、配置损坏或无法恢复事件。
- 没有接受记录错误吞掉其它项目、HTTP/TLS 或关联规则风险的事件。

若“有效发现”或“重复使用意愿”未达到标准，应优先调整规则、解释和核心场景，不进入 Dashboard 或 Runtime 开发。

## 6. 当前试点边界

- 本地运行，默认不上传任何数据。
- `scan --json` 等机器输出使用 `schemaVersion: 1`，契约见 [output-schema-v1.md](output-schema-v1.md)。
- 自动收敛仅覆盖 README 支持矩阵中明确列出的有限配置。
- Codex 和 CC Switch 当前只提供扫描及分步人工整改，不自动改写。
- Mac 桌面版仍是开发者预览，不作为本轮主要验证入口。
- 静态 HTML 是只读快照；执行命令后必须重新扫描并生成新报告。
- 真正凭证迁移尚未实现；Keychain/Secret Service/DPAPI 命令只是安全存储和当前进程注入引导。
