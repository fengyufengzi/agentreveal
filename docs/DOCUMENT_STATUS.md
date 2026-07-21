# AgentGuard 文档状态表

> 状态：Active
> 生效日期：2026-07-17

本文件用于防止新加入的产品、设计和开发同学继续依据过时 PRD、路线图或历史发布决策工作。

## 1. 文档职责与冲突处理

不同文档负责不同问题，不再用一份路线图同时描述战略、已实现事实和发布闸门：

1. 当前代码、测试、`package.json` 和 CHANGELOG 是“已经实现什么”的最终证据；
2. `docs/PRODUCT_DIRECTION.md` 决定产品方向、边界和阶段顺序；
3. `docs/product-capabilities.md` 是当前能力与限制的规范化摘要，必须与代码和测试同步；
4. `docs/DEVELOPMENT_PLAN.md` 管理总体优先级、里程碑和多人开发顺序；
5. `docs/development-plan-0.0.5-hardening-and-pilot.md` 与
   `docs/OPEN_SOURCE_RELEASE_CHECKLIST.md` 分别是功能安全和开源安全的强制发布闸门；
6. `README.md` 是对外产品、安装和使用说明，不应领先于已发布版本。

文档默认使用简体中文，中文版本是默认入口和内容源；面向用户的重要文档同步维护英文版。双语文件采用
`<name>.md`（中文默认）与 `<name>.en.md`（英文）的形式，并在页面顶部互相链接。约定入口名、ADR 编号、
工具路径和已有稳定链接可以继续使用英文文件名；新增普通文档优先使用清晰的中文文件名。完整约定见
`AGENTS.md`，文档导航见 `docs/README.md`。

历史 PRD 和研究文档只能用于理解背景，不能直接作为当前开发或发布依据。若能力文档与代码冲突，先以
代码和测试为准，并在同一变更中修正文档；若开发任务与产品方向冲突，任务不得直接进入开发。

## 2. 当前有效文档

| 文档 | 状态 | 用途 |
|---|---|---|
| `AGENTS.md` | Active | 人类贡献者和 AI coding agent 的统一仓库指令、安全不变量与完成定义 |
| `CLAUDE.md` | Active | Claude Code 的精简入口；只引用 `AGENTS.md`，不复制规则 |
| `CONTRIBUTING.md` | Active | 按贡献类型组织的文件、测试和提交工作流 |
| `REVIEW.md` | Active | 隐私、规则语义、写入、Desktop 和发布的阻断式审查协议 |
| `docs/adr/*` | Active | 本地隐私、任务语义、事务写入和 Desktop 权限的长期架构决策 |
| `evals/*` | Active | 无额外提示的 AI 贡献冷启动任务、运行协议和评分标准 |
| `docs/PRODUCT_DIRECTION.md` | Active | 当前产品定位、用户价值、CLI 和桌面版边界 |
| `docs/DEVELOPMENT_PLAN.md` | Active | 首次入口、风险处置、CLI/macOS Desktop 联合 Public Preview 和用户验证计划 |
| `docs/product-capabilities.md` | Active | 当前已实现能力、支持矩阵和明确限制 |
| `docs/development-plan-0.0.5-hardening-and-pilot.md` | Active | 0.0.5 发布前功能安全闸门与 Pilot 指标 |
| `docs/DOCUMENT_STATUS.md` | Active | 文档优先级和失效规则 |
| `docs/OPEN_SOURCE_RELEASE_CHECKLIST.md` | Active | 仓库公开前的当前树、Git 历史和发布资产安全闸门 |
| `SECURITY.md` | Active | 漏洞与敏感信息的私下报告方式 |
| `README.md` | Active | 对外产品入口、安装、命令、隐私承诺 |
| `README.en.md` | Active | 对外产品入口的英文版；与中文默认页同步维护 |
| `docs/README.md` | Active | 中文默认文档导航、语言约定和有效文档入口 |
| `docs/README.en.md` | Active | 英文文档导航 |
| `docs/install-upgrade-uninstall.md` | Active | CLI/Pilot/源码/macOS 的安装、手动升级、卸载与本地状态保留边界 |
| `docs/desktop-pilot-quickstart.md` | Active | 非 CLI macOS Desktop cohort 的签名 DMG 安装、项目扫描、反馈与卸载流程 |
| `docs/release-0.0.5-pilot.2.md` | Draft | 同版本 CLI/DMG 候选说明与签名、公证、Pilot、联合发布阻断项 |
| `CHANGELOG.md` | Active | 已发布或已完成能力记录 |
| `docs/research/*` | Reference | 配置路径、技术调研和适配证据；不决定产品优先级 |

## 3. 已失效或被替代的方向

以下方向已经被替代：

### 3.1 “准备验证 2 至 4 周 CLI MVP”

已失效。CLI 主要闭环已经完成，当前进入开源发布和真实用户验证阶段。

### 3.2 “第一版仅重点支持 OpenCode、CC Switch、Claude Code、Codex”

已失效。当前代码已覆盖 Claude Code、Codex、CC Switch、OpenCode、Gemini CLI、OpenClaw，且部分 Agent 已具备可逆整改能力。

### 3.3 “暂不公开仓库、不发布 npm，等待 0.2.0 和 60 天内部使用”

已被 2026-07-15 的新决策替代。当前目标是完成 Public Preview 准备后开源发布，并通过真实下载和使用行为验证需求。

历史原因保留在 `docs/release-0.0.2.md`，但其中禁止公开和禁止 npm 发布的指令不再有效。

### 3.4 “优先发展 Team / Enterprise / CI 平台化”

当前暂停。已有 CI 示例继续保留，但不作为当前主线。主线是 CLI 开源和桌面易用性。

### 3.5 “继续扩大规则数量和 Agent 数量”

当前不是优先事项。优先提升安装成功率、首次价值、高价值规则准确性、解释性和二次使用率。

### 3.6 “先公开 CLI，再开发和发布桌面版”

已被 2026-07-16 的联合发布决策替代。当前顺序是先完成统一首次入口与风险处置语义，再完善 macOS
Desktop；第一次 Public Preview 同时提供 npm CLI 和签名、公证的 macOS 应用。

## 4. 新同学入场顺序

新加入成员必须按以下顺序阅读：

1. `AGENTS.md`；
2. `README.md`；
3. `CONTRIBUTING.md` 和 `REVIEW.md`；
4. `docs/PRODUCT_DIRECTION.md`；
5. `docs/product-capabilities.md`；
6. `docs/DEVELOPMENT_PLAN.md`；
7. `docs/development-plan-0.0.5-hardening-and-pilot.md`；
8. `docs/OPEN_SOURCE_RELEASE_CHECKLIST.md`；
9. `docs/DOCUMENT_STATUS.md` 和 `CHANGELOG.md`；
10. 与自己任务相关的 Accepted ADR、仓库技能、代码、测试和 research 文档。

在领取任务前，需要确认：

- 任务是否属于 P0、P1 或 P2；
- 是否与 CLI 开源或桌面版直接相关；
- 是否重复实现已经存在的能力；
- 是否会扩大当前明确暂停的范围。

## 5. PR 和设计评审要求

新的 PRD、设计稿、Issue 或 PR 描述应包含：

- 对应的当前阶段目标；
- 优先级：P0 / P1 / P2 / Paused；
- 对安装、首次扫描、有效风险命中、复用或桌面易用性的影响；
- 是否修改 core schema、CLI 输出或桌面展示；
- 与现有文档是否存在冲突。

代码 PR 还必须按 `REVIEW.md` 评估阻断问题，并填写 `.github/pull_request_template.md`。涉及新增 Agent、
安全规则或 Desktop IPC 时，必须读取 `.agents/skills/` 下对应工作流；`npm run check:repo` 会检查这些入口
以及 ADR、AI 评测、Desktop IPC/诊断白名单的一致性。

任何改变产品主线的提交，必须同时更新：

- `docs/PRODUCT_DIRECTION.md`；
- `docs/DEVELOPMENT_PLAN.md`；
- 本文档的状态说明；
- 必要时更新 README。

## 6. 历史文档处理原则

不建议直接删除历史 PRD和设计文档，因为它们仍有决策背景价值。应采用以下方式：

- 文件首部增加 `Status: Superseded`；
- 写明替代它的当前文档；
- 清除会被误认为仍有效的执行指令；
- 只保留历史背景、当时假设和已完成能力；
- 不在 README 的主要入口继续链接过时计划。
