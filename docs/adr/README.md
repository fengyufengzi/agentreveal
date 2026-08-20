# AgentReveal architecture decision records

ADR 记录已经接受、会约束后续实现的架构决策。它们解释“为什么必须这样做”，不替代代码、测试、
`AGENTS.md` 或当前产品计划。

## 状态

- **Proposed**：讨论中，尚不能作为实现依据。
- **Accepted**：当前有效，新实现和审查必须遵守。
- **Superseded**：由新的 ADR 替代，仅保留历史背景。
- **Rejected**：已评估但不采用。

接受后的 ADR 不应通过改写历史来改变结论。需要改变决策时，新建 ADR，写明替代关系，并把旧 ADR 标为
Superseded。实现事实仍以代码和测试为准；若两者与 Accepted ADR 冲突，应停止扩大冲突并明确修复或提出
替代 ADR。

## 当前决策

| ADR | 状态 | 决策 |
|---|---|---|
| [0001](0001-local-first-privacy-boundary.md) | Superseded by ADR-0006 | 本地优先与最小持久化隐私边界 |
| [0002](0002-action-semantics-and-stable-tasks.md) | Accepted | 统一规则处置语义与稳定任务身份 |
| [0003](0003-transactional-configuration-writes.md) | Accepted | 配置写入必须是可预览、可恢复事务 |
| [0004](0004-desktop-privilege-boundary.md) | Superseded by ADR-0007 | Electron renderer 保持无权限，业务复用 typed core |
| [0005](0005-effective-configuration-and-private-drift-snapshots.md) | Superseded by ADR-0006 | 有效配置使用统一 core 契约，漂移快照只保存 keyed HMAC 身份与最小摘要 |
| [0006](0006-product-rename-to-agentreveal.md) | Accepted | 产品改名 agentguard → agentreveal，重写产品私有状态契约 |
| [0007](0007-desktop-bundle-identity.md) | Accepted | 桌面 bundle identity 与 appId 切换到 `app.reveal.desktop` |
| [0008](0008-harness-plugin-and-model-safe-output-boundary.md) | Accepted | Harness 插件复用 core，并通过独立 allowlist 契约限制模型上下文 |

## 新建 ADR

新 ADR 至少包含：状态、日期、背景、决策、不可破坏约束、影响和替代方案。编号递增，文件名使用
`NNNN-short-title.md`。只有跨模块、长期影响安全边界或会限制后续实现选择的决策才需要 ADR；普通实现细节
留在代码、测试或 PR 中。
