# AgentGuard review protocol

本文件定义代码审查必须主动寻找的问题。审查结论应指出具体文件和可复现影响；不要只总结改动，也不要
因为测试通过就忽略安全边界。

## 1. 严重等级

- **P0 · 阻断合并**：凭证/私有配置泄漏、任意命令执行、路径越界、无备份写入、配置损坏、恢复覆盖新内容。
- **P1 · 阻断合并**：规则被错误隐藏、接受状态跨项目生效、Provider 信任掩盖独立风险、CLI/Desktop 语义分叉、输出契约静默破坏。
- **P2 · 应在当前 PR 修复**：行动或验证信息不完整、错误分类误导、文档/矩阵/`dist` 不同步、关键失败路径无测试。
- **P3 · 可后续处理**：不影响正确性或安全性的可维护性和表达改进。

## 2. 隐私审查

- 搜索凭证从 parser 到 finding、action、CLI、JSON、HTML、Desktop 和诊断的完整数据流。
- 拒绝在 evidence 中保存完整密钥、私钥内容、请求 header、完整环境变量或无需展示的配置片段。
- 检查错误对象、异常字符串和日志是否可能包含项目路径、端点、taskId 或配置内容。
- fixture、快照和文档必须使用合成路径、示例域名和明显占位凭证。
- 新增输出字段时，要求针对完整序列化结果的泄漏回归，而不只断言单个字段。

## 3. 规则和处置语义审查

- 新 finding 是否真有独立用户行动，还是已有规则的重复表达。
- severity、priority、confidence、disposition 和 fixMode 是否各自表达正确概念。
- `group.evidenceKeys` 是否既能合并同一根因，又不会合并不同端点、MCP、路径或 Agent。
- 每条规则是否有 rationale、nextSteps、verification；可接受风险是否有具体 `acceptWhen`。
- baseline 的 `resolve` / `mitigate` 是否与真实写入效果一致。
- 风险接受、到期和撤销是否继续保留证据和审计；Provider 信任是否只影响端点分类。
- 项目规则忽略是否只来自 core 推导的 P2/P3 非 fix 候选，是否按项目 + Agent + ruleId 隔离，并在
  evidence/taskId 变化后继续可见、可撤销；任何 P0/P1、高风险家族或 renderer 自造规则都应阻断。

## 4. 文件写入和恢复审查

- 写入前是否基于用户看到的计划再次校验 fingerprint。
- 是否强制备份、验证路径边界、使用原子写入并保持原权限。
- 部分失败是否自动回滚，恢复是否验证 manifest 和内容完整性。
- 配置在 apply 后被外部修改时，restore 是否拒绝覆盖。
- 新增写入对象是否有成功、无变化、并发修改、权限、篡改和恢复测试。

## 5. CLI、契约和桌面审查

- CLI、JSON、HTML 和 Desktop 是否从同一 core 数据派生。
- schemaVersion、现有顶层字段、退出码和 taskId 是否保持兼容。
- IPC 是否只暴露单一 typed 操作，主进程是否验证 main frame、参数、项目和路径授权。
- 特权 IPC 是否有直接调用 handler 的可执行测试，覆盖非主 frame、未授权项目、非法输入和原生能力未被调用；
  不能只依赖源码正则 smoke test。
- renderer 是否仍无 Node 权限；是否引入 `child_process`、`shell: true`、任意 URL 导航或任意文件访问。
- 新 IPC 是否同步 preload、renderer、诊断白名单和 smoke/service 测试。

## 6. 发布与供应链审查

- GitHub Action 必须固定第三方 action 到完整 commit SHA。
- npm 发布内容不能依赖用户机器上的 TypeScript；提交的 `dist/` 必须是当前源码生成结果。
- macOS 正式产物必须使用项目图标、Developer ID、Hardened Runtime、公证和 staple 验证。
- 不得把报告、备份、诊断、`.p8`、`.p12`、Apple 凭据或本机产物提交到仓库。

## 7. 架构决策审查

- 检查改动是否触及 `docs/adr/` 中本地优先、任务语义、事务写入或 Desktop 权限边界。
- Accepted ADR 与实现冲突属于阻断问题；不能用普通 PR 描述静默改变长期决策。
- 新 ADR 必须记录替代方案和实际代价，不能只为已经写好的实现补一个形式化结论。
- CODEOWNERS 只能路由审查，不能替代测试、branch protection 或安全判断。

## 8. 审查完成条件

```bash
npm run check
git diff --check
```

桌面变更还需构建 `.app`；macOS 发布变更按 `docs/macos-release.md` 执行，最终 npm tarball 和 DMG
还需运行 `npm run release:scan-assets`。若无法运行某项验证，审查结论必须明确说明未验证范围。
