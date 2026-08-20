# ADR-0008：Harness 插件与模型安全输出边界

- Status: Accepted
- Date: 2026-08-19

## 背景

AgentReveal 希望通过 DeepSeek Harness（DSH）等 Agent Harness 的插件分发机制降低安装和发现成本。Harness
插件运行在用户已经信任的 Agent 环境中，其输出可能直接进入模型上下文；现有 `scan --json` 和
`report --format json` 是面向本机用户与自动化的完整契约，会合法包含规范化路径、端点、脱敏 evidence、
稳定 taskId 和整改命令，因此不能直接作为模型输入。

如果每个 Harness Adapter 自行重新扫描配置、复制规则或从完整 JSON 中删除黑名单字段，AgentReveal 会产生
第二套风险语义，并在新增字段时发生隐私回归。把整改、接受、信任、忽略或恢复能力直接交给模型调用，也会绕过
现有的预览、显式确认、备份、项目授权和恢复边界。

## 决策

1. AgentReveal core 继续是发现、规则、聚合、优先级和 triage 的唯一事实来源。Harness Adapter 只能调用稳定
   integration 契约并负责展示，不得复制 parser、detector、规则或任务聚合。
2. 新增 `agentreveal integration scan --format model-json`。它执行与 CLI 相同的本地只读扫描和
   acceptance / ignore triage，但使用独立 allowlist builder，不先生成完整报告再按黑名单删除字段。
3. 模型安全 v1 只允许输出 schema/command、固定隐私声明、计数、前三个活动风险的固定 Agent/类别枚举、规则
   ID、priority、severity、disposition 和仓库内固定文案。
4. 模型安全输出禁止包含绝对路径、端点、evidence、taskId、凭证指纹、配置片段、动态标题或描述、用户自由
   文本、备份身份、整改命令和任意 shell 字符串。未知类别必须回退到固定 `other` 文案，未知规则 ID 必须
   回退到固定 `UNMAPPED_RULE`，不能透传原值。
5. 第一阶段 Harness 插件只提供用户显式触发的只读检查（例如 `/agentreveal`）。模型不能自主调用扫描，也不能
   调用 apply、restore、accept、trust、ignore、baseline 或凭证迁移。
6. DSH Adapter 与 bundle 在后续里程碑实现；在兼容性测试完成前不得宣称已经可以通过 DSH 安装。计划优先在
   同一个 `agentreveal` npm 包中声明受版本约束的 `dsh.bundle`，避免发布第二套扫描实现。
7. Harness 兼容性按明确的 DSH Developer Preview 版本进行固定与测试；Host API 变化必须安全失败，不得回退
   为执行任意命令或输出完整 JSON。

## 不可破坏约束

- 完整本机 JSON 契约与模型安全契约必须保持分离；新增完整报告字段不会自动进入模型安全输出。
- Harness 适配层不得读取 Agent 配置文件、状态库或 Keychain，不得建立独立风险规则。
- 模型安全输出的字段、类别与固定文案必须由类型和完整序列化测试锁定；隐私测试必须使用含路径、端点、动态
  文案和命令的合成输入，证明它们不会进入结果。
- integration scan 不创建 task snapshot、报告、baseline、备份或其它持久化状态，不启动网络上传。
- 高风险退出码保持 CLI 现有语义；Harness 只能把它解释为需要用户查看，不能据此自动整改。
- 将来开放任何写操作前必须新建替代 ADR，并重新设计用户确认、项目授权、事务写入、备份恢复和模型权限边界。

## 影响

- DSH 等 Harness 可以消费小而稳定的风险摘要，同时不会获得本机项目身份、网络拓扑或可执行整改内容。
- Adapter 展示的信息少于完整 CLI/Desktop 报告；用户需要在本机 AgentReveal 中查看证据和执行处置，这是有意
  的权限分层，不是功能缺失。
- npm 包将增加一个面向受控集成的 CLI 契约；真正的 DSH 安装入口、Slash Command 和开发者预览兼容测试仍需
  分阶段完成。
- 新增风险类别不会自动向模型暴露；维护者必须显式决定是否映射到现有固定类别，否则显示为 `other`。

## 未采用方案

- 直接把 `scan --json` 或 HTML 报告交给模型：包含完成本机解释所需但不应进入模型上下文的数据。
- 生成完整 JSON 后递归删除敏感键：黑名单会随 schema 演进遗漏新字段，无法提供默认拒绝保证。
- 在 DSH 插件内重写扫描器：会分叉规则、task 聚合、隐私和退出码语义。
- 第一版向模型开放自动整改：无法沿用当前面向人的显式确认与恢复边界，风险高于传播收益。
- 立即创建独立 npm 插件包：增加版本漂移和安装理解成本；先验证同包 bundle 的兼容性更合适。
