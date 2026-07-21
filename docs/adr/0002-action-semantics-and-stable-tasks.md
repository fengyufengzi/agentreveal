# ADR-0002：统一规则处置语义与稳定任务身份

- Status: Accepted
- Date: 2026-07-17

## 背景

原始 finding 只能说明检测到了什么，不能直接回答用户先做什么、如何验证、是否可以接受。多个规则还可能
来自同一根因；如果按 finding 展示，会形成重复待办。如果只保留主 finding，又会丢失关联规则的验证和
接受条件。

## 决策

1. 所有具体 RuleId 必须在统一 `ACTION_MATRIX` 中定义 disposition、priority、confidence、fixMode、
   rationale、nextSteps、verification、grouping 和可选 acceptWhen。
2. `severity` 只表示潜在影响，`priority` 只表示行动顺序，二者独立决定。
3. finding 按 Agent、规则家族和最小规范化 evidence 身份聚合为稳定 taskId；输入顺序、URL 尾斜杠和无意义
   大小写差异不得改变身份。
4. 不同端点、MCP、路径或 Agent 不得因同属一个规则家族而错误合并。
5. 聚合任务可以选择 primary finding 用于标题，但必须保留全部 requirements 的行动、验证和接受条件。
6. 风险接受作用于当前项目的稳定任务身份，保留原因、到期、撤销和全部规则摘要；它不是删除 finding。
7. Provider trust 是独立的项目端点分类策略，只能消除未知来源提示，不能隐藏 HTTP、凭证或权限风险。
8. 项目规则忽略是第三种独立语义：只允许处置矩阵确认的 P2/P3 非 fix、非高风险家族规则，按当前项目 +
   Agent + ruleId 持续生效。它不依赖 evidence/taskId，必须保留原因、到期、撤销审计和完整技术证据。

## 不可破坏约束

- 新增 finding ID 必须同步 RuleId 列表、机器矩阵、可读矩阵和完整性测试。
- 没有明确定义安全接受条件的规则不能提供长期隐藏入口。
- P0/P1、fix、明文凭证、执行权限、扫描完整性和 Provider 端点分类不得提供项目规则忽略入口；候选必须
  由 core 从最新活动任务推导，不能信任 CLI 参数或 renderer 自报的 Agent/ruleId 组合。
- baseline 的 resolve/mitigate 必须描述真实写入效果，不能根据产品意图推断。
- CLI、JSON、HTML 和 Desktop 必须从同一行动任务模型派生。

## 影响

- 新规则成本高于单纯增加一个 detector，但用户得到稳定、可验证的行动单位。
- taskId 的规范化算法和 grouping evidenceKeys 属于兼容性表面，修改时必须增加身份迁移或变化测试。
- “有效发现数量”和“需要行动任务数量”是不同指标，界面和退出码必须明确区分。

## 未采用方案

- 直接按 severity 排序 findings：高影响不一定是当前最先能采取行动的项目。
- 接受后删除证据：无法审计，也会让静态报告错误暗示风险不存在。
