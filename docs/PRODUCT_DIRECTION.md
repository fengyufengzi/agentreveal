# AgentReveal 当前产品方向

> 状态：Active
> 生效日期：2026-07-16
> 最近更新：2026-08-20
> 适用范围：产品、设计、研发、测试、开源运营

## 1. 当前阶段

AgentReveal 已完成 CLI MVP 的主要闭环，不再处于“验证能否做出 MVP”的阶段。

当前已经具备：

- 多 Agent 发现与配置解析；
- Claude Code、Codex、CC Switch、OpenCode、Gemini CLI、OpenClaw 风险扫描；
- Provider、base URL、本地代理与真实上游链路识别；
- 明文密钥、危险权限、MCP、敏感文件和跨 Agent 集中风险检查；
- HTML / JSON 报告；
- 部分 Agent 的 baseline、dry-run、backup、apply、restore；
- Codex、CC Switch 等不可自动整改项的手工整改指引；
- Electron 桌面应用、可双击的本地开发启动器，以及完成 Developer ID 签名、Apple 公证与 staple 的
  Apple Silicon DMG；
- `0.0.7-pilot.2` 已把规则质量收敛、模型安全 integration 契约和 DeepSeek Harness 只读插件通过同一 GitHub Pre-release 联合公开。
  历史版本（`0.0.6-pilot.4` 及更早）按 `docs/release-0.0.*-pilot.*.md` 保留。

因此，当前阶段正式定义为：

> **`0.0.7-pilot.2` Public Preview 已联合公开；高价值规则 Q0–Q2 和 DeepSeek Harness D0–D4 已完成，当前通过不含
> 配置、路径、端点、凭证、taskId 或自由文本的最小反馈复核真实判断，同时继续在私有仓库打磨后按稳定
> 里程碑定期联合公开；DSH 写能力继续保持暂停。**

## 2. 当前开发主线

Effective Configuration、Drift 与改名迁移的首轮开发已经完成；后续私有迭代先通过可复现的正负合成场景
核对高价值规则的漏报、意外告警和重复任务，再围绕以下主线继续收敛解释性、可恢复性和真实使用体验，
不把外部用户访谈或固定人数 Pilot 作为开发前置门槛：

1. 为 Claude Code、Codex 和 CC Switch 建立统一 Effective Configuration，解释真正生效的配置来源、
   Provider、真实上游、认证方式和权限模式；
2. 明确展示用户、项目、环境变量、命令行、托管策略与代理接管之间的优先级、覆盖、冲突和不确定项；
3. 增加用户显式确认的本机可信快照，并识别 Provider、认证来源、权限、MCP、Skill、Hook 和风险状态变化；
4. 默认入口、CLI、JSON、HTML 和 macOS Desktop 共用同一 effective-state 与 drift schema；
5. 对认证和权限冲突给出确定性解释、可验证步骤和已有安全边界内的可恢复整改；
6. CLI 与 macOS Desktop 继续共用版本和 core，但先在私有仓库完成一组稳定里程碑，再定期同步到公开仓库
   并执行 npm、签名公证 DMG 和 GitHub Release 的联合发布；
7. 下载、重复使用、Issue 和团队请求改为发布后的方向信号，不阻断本阶段开发。
8. 在不复制扫描器、不开放写能力的前提下，把 DeepSeek Harness 作为受控分发入口；第一阶段只响应用户显式
   命令，调用同一 core 的模型安全只读契约，并引导用户回到 CLI/Desktop 查看证据和处置。

规则质量测量不得把“在场景集合中出现得少”直接解释为低价值或删除候选。每个场景必须声明完整预期，运行
真实 parser、detector 和 core 任务聚合，分别记录命中、漏报、意外告警、重复任务与隐私失败。公开质量
基线见 `docs/rule-hit-rate.md`，已实现边界见 `docs/product-capabilities.md`。

不得同时展开通用 MCP 动态扫描器、后台常驻监控、团队管理后台、企业多租户、Secret Vault、
SIEM / DLP / IAM 集成或运行时拦截。用户显式触发的 Harness 只读插件不是运行时拦截；它不得把模型变成
整改、接受、信任、忽略或恢复操作的授权主体。

## 3. 用户购买理由

AgentReveal 首先回答四个问题：

1. **我的机器上装了哪些 AI Coding Agent？**
2. **它们当前真正使用哪套配置、账号、Provider 和真实上游？**
3. **这些 Agent 当前能够读取什么、执行什么？**
4. **与上次确认的可信状态相比，什么发生了变化？**

当前推荐的用户表达：

> **看清 AI Coding Agent 真正使用的账号、Provider、权限和工具；发生变化时及时发现并安全恢复。**

技术定位“多 Agent、多模型、多 Provider 的安全配置中心”继续保留，但不作为面向普通用户的第一句解释。

## 4. CLI 产品原则

### 4.1 首次体验

新用户不应先学习多个子命令。默认入口应逐步统一为：

```bash
agentreveal
# 或
agentreveal scan
```

一次完成环境发现、配置扫描、风险摘要、链路说明和下一步建议。

### 4.2 风险价值排序

优先强化以下高价值场景：

1. 配置来源覆盖或冲突导致实际状态与用户预期不一致；
2. OAuth、API Key、helper、环境变量和代理注入之间的认证来源变化；
3. 本地代理背后的真实外部上游以及 Provider 路由变化；
4. 明文密钥、共享密钥与密钥散落；
5. bypass / YOLO / auto mode / 危险 Bash 权限以及权限扩大；
6. MCP、Skill、Hook 的新增和文件、命令、数据库、浏览器访问范围；
7. OpenClaw 公网暴露；
8. 多 Agent 共用代理、密钥或未知上游形成的集中风险。

宁可规则少而准确，不得用大量低价值告警制造“看起来功能很多”的结果。

### 4.3 信任底线

- 默认只读；
- 本地运行；
- 不上传配置、代码和密钥；
- 输出必须脱敏；
- 自动修改必须先展示 diff；
- apply 必须备份；
- 必须可 restore；
- 未知 Provider 不武断判恶，允许用户确认 trusted / internal。

### 4.4 Harness 分发边界

- Harness Adapter 只消费 `agentreveal integration scan --format model-json`，不得读取完整 `scan --json`；
- integration 输出使用独立 allowlist，只包含计数、固定枚举、规则 ID、Top 3 和固定文案；
- 路径、端点、evidence、taskId、动态文本、凭证指纹和命令不得进入模型上下文；
- 第一阶段只支持用户显式触发的只读检查，不允许模型自主扫描或执行任何配置写入；
- DSH Adapter、bundle、隔离真实安装和 D4 资产门禁已完成，并随 `0.0.7-pilot.2` 联合公开；写能力仍保持暂停。

完整长期约束见 `docs/adr/0008-harness-plugin-and-model-safe-output-boundary.md`。

## 5. 桌面产品边界

桌面版不是另一个产品，也不重新实现扫描逻辑。桌面版必须复用 CLI / core。CLI 与桌面版是第一次
Public Preview 的两个正式入口，共用扫描结果、行动任务、可信来源、风险接受和验证语义。

Public Preview 第一阶段只提供：

- 首次入口默认要求用户通过原生目录选择器确认一个代码项目，并解释应选择包含 `.git`、`package.json`、
  `pyproject.toml` 等标识的单个项目根目录；整机扫描降为次级入口，执行前必须提示 macOS 可能请求桌面、
  文稿、下载等受保护文件夹权限；
- 不使用需要额外理解的左侧功能菜单；顶部只承载产品身份、检查范围、扫描和报告操作，正文以已配置 Agent
  的固定状态切换器作为导航，默认打开最高优先级 Agent，并且一次只展示一个 Agent 工作区；
- 结果首屏不重复展示可以从 Agent 状态卡推导的统计和结论；范围与扫描状态保持单行，进入档案后始终提供
  可见的 Agent 切换器和返回列表操作；
- 在一个安全工作台中按 Agent 展示配置、连接、显式模型/Provider、安全相关权限，并把该 Agent 的风险和
  修复建议紧邻其基本信息；跨 Agent 风险和项目决策作为独立入口；
- 风险详情、当前系统整改步骤与复扫验证；
- 导出 HTML / JSON 报告；
- baseline dry-run，以及同页的预览、原生确认、备份、应用、复扫和恢复闭环。

项目扫描会把 workspace 检查限制在用户明确选择的项目，同时继续读取常见 Agent 的本机配置；普通源代码
只检查文件名，不读取内容。项目范围还启用接受任务、信任端点和低优先级规则忽略等项目级决策。整机扫描
使用用户主目录，只适合需要跨项目排查且理解系统权限提示的用户。Claude 明文凭证迁移已经具备备份、计划
指纹、窄范围应用、复扫和回滚的两阶段事务，但 Keychain 存储与可读性检查仍由用户在 Terminal 完成；
配置复扫后会引导用户运行只读认证状态检查、完全重启和最小请求，只有用户确认真实鉴权正常后才允许清理
迁移备份。AgentReveal 不代替目标工具真实鉴权，也不得伪装成完全一键修复。

第一阶段明确不做：

- 登录和账号体系；
- 云同步；
- 团队管理；
- 后台常驻监控；
- 实时阻断；
- 自动更新复杂策略；
- 企业控制台；
- 多租户。

## 6. 开发决策与发布后观察

2026-07-23 决定不再用前置访谈或指定人数 Pilot 阻断 Effective Configuration 与 Drift 开发。开发完成由
代码、测试、隐私、写入恢复和 CLI/Desktop 一致性验收。

2026-07-24 决定采用“私有仓库持续打磨、公开仓库定期发布”的节奏。单个 Milestone 的功能开发不再因 npm、
GitHub Release 或 Apple 公证尚未执行而保持未完成；准备公开版本时，才冻结同一提交并一次性完成 tarball、
Developer ID、notarization、staple、Gatekeeper、敏感信息扫描、回装和公开仓库同步。未通过完整发布门禁的
本地产物只能用于内部验证，不得上传到公开 Release 或 npm。

版本发布后继续观察以下信号，但它们只用于调整后续优先级：

- 用户是否发现实际认证来源、Provider 或权限与预期不一致；
- 用户是否完成整改、接受或恢复；
- 用户是否因为查看变化而再次运行；
- 用户是否要求支持更多 Agent、持续检测、CI 或团队基线；
- 用户是否提交 Issue、PR 或分享报告。

GitHub Star 和下载量只作为传播指标，不作为当前 Milestone 的完成条件。

## 7. 决策优先级

出现需求冲突时按以下优先级判断：

1. 是否提高首次安装和首次扫描成功率；
2. 是否准确解释真正生效的配置和来源；
3. 是否让用户发现此前不知道的配置变化或真实风险；
4. 是否降低误报并提升解释性；
5. 是否增强用户对本地、只读、脱敏和可回滚的信任；
6. 是否形成安全、明确的重复使用理由；
7. 其他团队和企业扩展能力。

## 8. 变更控制

任何与本文件相冲突的旧 PRD、路线图、发布决策和设计说明，均以本文件、当前代码、测试和
`docs/product-capabilities.md` 为准。

`0.0.5-pilot.3` 已完成首次入口和风险处置语义的首次联合公开；`0.0.6-pilot.4` 已完成 Effective
Configuration、Drift、H0–H7 安全整改事务及第二次 CLI/Desktop 联合公开。后续先在私有仓库收敛风险准确性、
解释性、可恢复性和真实使用体验，再按稳定里程碑定期同步公开。公开时仍保持两个入口共用 core、使用同一版本
并重新通过完整联合发布门禁。若要改变此边界，必须先更新本文件并记录决策原因，不能只在代码提交或聊天中
改变方向。
