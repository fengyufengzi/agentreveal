# AgentGuard 文档状态表

> 状态：Active
> 生效日期：2026-07-16

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

历史 PRD 和研究文档只能用于理解背景，不能直接作为当前开发或发布依据。若能力文档与代码冲突，先以
代码和测试为准，并在同一变更中修正文档；若开发任务与产品方向冲突，任务不得直接进入开发。

## 2. 当前有效文档

| 文档 | 状态 | 用途 |
|---|---|---|
| `docs/PRODUCT_DIRECTION.md` | Active | 当前产品定位、用户价值、CLI 和桌面版边界 |
| `docs/DEVELOPMENT_PLAN.md` | Active | 首次入口、风险处置、CLI/macOS Desktop 联合 Public Preview 和用户验证计划 |
| `docs/product-capabilities.md` | Active | 当前已实现能力、支持矩阵和明确限制 |
| `docs/development-plan-0.0.5-hardening-and-pilot.md` | Active | 0.0.5 发布前功能安全闸门与 Pilot 指标 |
| `docs/DOCUMENT_STATUS.md` | Active | 文档优先级和失效规则 |
| `docs/OPEN_SOURCE_RELEASE_CHECKLIST.md` | Active | 仓库公开前的当前树、Git 历史和发布资产安全闸门 |
| `SECURITY.md` | Active | 漏洞与敏感信息的私下报告方式 |
| `README.md` | Active | 对外产品入口、安装、命令、隐私承诺 |
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

1. `README.md`；
2. `docs/PRODUCT_DIRECTION.md`；
3. `docs/product-capabilities.md`；
4. `docs/DEVELOPMENT_PLAN.md`；
5. `docs/development-plan-0.0.5-hardening-and-pilot.md`；
6. `docs/OPEN_SOURCE_RELEASE_CHECKLIST.md`；
7. `docs/DOCUMENT_STATUS.md`；
8. `CHANGELOG.md`；
9. 与自己任务相关的代码、测试和 research 文档。

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
