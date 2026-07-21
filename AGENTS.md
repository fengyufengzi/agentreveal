# AgentGuard repository instructions

本文件是仓库内人类贡献者和 AI coding agent 的统一工作入口。工具专属说明只能引用本文件，不得复制出
另一套安全规则。开始修改前，先阅读本文件和与任务匹配的仓库技能。

## 1. 项目目标与当前边界

AgentGuard 是本地运行的 AI Coding Agent 安全配置中心，当前主线是 CLI 与 macOS Desktop 联合
Public Preview。优先提升安装成功率、首次价值、风险准确性、解释性、可恢复整改和真实用户验证。

当前不主动扩大到运行时 Prompt 拦截、企业 Dashboard、团队策略分发、后台常驻监控或更多 Agent/规则
数量。产品边界以 `docs/PRODUCT_DIRECTION.md` 为准，已实现事实以代码、测试和
`docs/product-capabilities.md` 为准。

## 2. 开始工作的顺序

1. 运行 `git status --short`，保留并避开用户已有修改。
2. 阅读 `docs/DOCUMENT_STATUS.md`，确认当前有效文档。
3. 阅读与任务直接相关的代码、测试和 `docs/adr/` 中的 Accepted 决策，不从历史规划推断当前行为。
4. 根据任务读取对应技能：
   - 新增或扩展 Agent：`.agents/skills/add-agent-adapter/SKILL.md`
   - 新增或修改规则：`.agents/skills/add-security-rule/SKILL.md`
   - 修改桌面 IPC：`.agents/skills/change-desktop-ipc/SKILL.md`
5. 在修改前明确影响面：core schema、CLI、JSON、HTML、Desktop、文档和发布产物。

## 3. 架构地图

- `src/adapters/`：Agent 发现、配置解析和风险 finding。
- `src/rules/`：RuleId、Provider 分类与统一处置矩阵。
- `src/core/`：扫描、聚合、修复指引、接受、baseline、备份恢复、报告和文件安全。
- `src/desktop/service.ts`：CLI core 到桌面 typed schema 的唯一业务桥接层。
- `desktop/`：Electron 主进程、preload、无权限 renderer、诊断和应用资产。
- `test/`：从已提交的 `dist/` 导入编译产物；fixture 必须使用合成内容。
- `scripts/`：敏感信息、贡献一致性、macOS 发布预检和发布验证。
- `docs/`：产品方向、当前能力、发布门禁和历史决策。
- `docs/adr/`：跨模块长期架构决策及其不可破坏约束。
- `evals/`：只给自然语言任务的 AI 贡献冷启动评测定义；不得直接把评测产物合并。

`dist/` 有意提交到 Git，源码变更后必须运行 build 并提交对应编译产物。

## 4. 不可破坏的安全不变量

### 隐私

- 不得把完整 API Key、Token、私钥、真实内部端点、本机用户名或非示例绝对路径提交到代码、fixture
  或文档。运行时 finding/报告可以向本机用户展示完成处置所必需的规范化端点和配置路径，但不得自动上传，
  也不得把它们写入诊断、任务快照或风险接受审计。
- parser 可以在内存中识别凭证，但返回值和 evidence 只能包含存在性、键名、计数或不可逆指纹。
- 错误分类可以读取原始错误做内存判断，但本地诊断不得持久化原始错误文本或上下文参数。
- 示例统一使用 `example.com`、`/Users/example/project` 和明显占位凭证。

### 写入和恢复

- `doctor`、`scan`、`map`、`report` 和所有 discovery/deepScan 默认只读。
- 自动整改必须先展示计划，重新校验计划身份，要求显式确认，强制备份，原子写入，复扫并支持恢复。
- 写入必须复用 `src/core/fs-safety.ts` 及现有 apply/backup 边界，不得直接增加随意 `writeFile`。
- 恢复必须验证备份完整性、路径边界和应用后的并发修改，不得覆盖未知新内容。

### 风险语义

- `severity` 表示潜在影响，`priority` 表示行动顺序，两者不得混用。
- 风险接受不是删除证据；必须保留项目作用域、原因、到期、撤销和静态规则摘要。
- Provider 信任只改变未知端点分类，不得隐藏 HTTP、明文凭证或危险权限等独立风险。
- 项目规则忽略只允许矩阵确认的 P2/P3 非 fix 规则，按当前项目 + Agent + ruleId 生效；不得隐藏 P0/P1、
  凭证、执行权限、扫描盲区或 Provider 端点分类，且必须保留原因、到期、撤销审计和技术证据。
- 新增具体 finding ID 时，必须同步 `RULE_IDS`、`ACTION_MATRIX`、可读规则矩阵和测试。
- 聚合任务必须保留每条关联规则的验证与接受条件，不能只显示 primary finding 的语义。

### CLI、Desktop 与 Electron

- CLI、JSON、HTML 和 Desktop 必须复用同一 core、taskId、处置和验证状态。
- renderer 只能通过 `contextBridge` 调用白名单 IPC；保持 sandbox、contextIsolation 和禁用 nodeIntegration。
- 主进程必须验证主 frame、参数、项目授权和文件路径；不得向 renderer 暴露任意命令、shell 或文件读取。
- 新桌面操作必须加入最小化诊断白名单，但诊断事件不得携带路径、端点、taskId 或配置内容。

## 5. 修改配方

- 新增 Adapter：遵循 `discover → parse/normalize → findings → register → fixtures → privacy regression`。
- 新增规则：遵循 `finding → RuleId → action matrix → remediation → tests → readable matrix`。
- 修改 schema：保持现有顶层字段兼容；需要破坏性变化时先升级 schemaVersion 和契约文档。
- 修改 Desktop：业务逻辑先进入 `src/desktop/service.ts`，主进程只做验证、确认和系统能力调用。
- 修改报告：同时验证终端、HTML、JSON 和 XSS/隐私回归，不只检查视觉结果。
- 修改写入：必须增加成功、失败回滚、并发修改、权限保持和备份篡改测试。

详细文件清单见 `CONTRIBUTING.md`，审查标准见 `REVIEW.md`。

## 6. 验证命令

```bash
npm run build
npm test
npm run sanitize
npm run sanitize:staged
npm run sanitize:package
npm run check:repo
npm run evals:check
npm run evals:preflight
npm run check
```

macOS 桌面变更还应运行 `npm run desktop:pack`。正式发布验证只在具备 Developer ID 和公证凭据时运行。

## 7. 完成定义

只有满足以下条件才能报告完成：

- 行为由测试覆盖，隐私或写入相关改动包含失败路径测试。
- `npm run check` 通过，`git diff --check` 无格式错误。
- 即使最终质疑或拒绝任务且没有修改文件，也要执行任务要求的非破坏性验证命令；无法执行时必须明确说明，
  不得声称验证通过。
- `dist/` 与 TypeScript 源码同步。
- 当前能力、限制或用户步骤发生变化时，同一提交更新权威文档。
- 改变 Accepted ADR 的长期边界时，新建替代 ADR，不静默改写历史结论。
- 没有把生成报告、备份、诊断、签名凭据或本机路径加入 Git。
- 对外能力描述不领先于代码与测试。

## 8. 文档冲突

代码和测试决定“实际发生什么”；`docs/PRODUCT_DIRECTION.md` 决定“现在应该做什么”；
`docs/DOCUMENT_STATUS.md` 决定“哪份文档有效”。遇到冲突时不要猜测，先按该优先级核实并在同一变更中
修正文档。

## 9. 文档语言与命名

- 仓库文档默认使用简体中文撰写，中文版本是默认入口和内容源；不要先写英文再把中文当作附属翻译。
- 面向用户的重要文档应同时保留中文和英文。中文默认页使用约定入口名（例如 `README.md`），英文版使用
  `.en.md` 后缀（例如 `README.en.md`），并在页面顶部互相链接。
- 新增普通文档时优先使用清晰的中文文件名；`README.md`、`CONTRIBUTING.md`、`SECURITY.md`、
  `CHANGELOG.md`、ADR 编号、工具约定路径和已有稳定链接可以保留英文文件名。
- 修改双语文档时必须同步语义、命令、版本、能力边界和安全承诺；若英文版尚未同步，必须明确标记，不能让
  过期译文看起来仍然有效。
- 文档导航以中文标题优先展示。当前入口见 `docs/README.md`，英文读者入口见 `docs/README.en.md`。
