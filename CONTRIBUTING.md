# Contributing to AgentGuard

感谢参与 AgentGuard。它会读取本地 AI Agent 配置，因此隐私、写入安全和可解释处置优先于功能数量。

仓库文档默认使用简体中文。面向用户的重要文档应保留中英文版本：中文是默认入口和内容源，英文文件使用
`.en.md` 后缀，并与中文页面互相链接。新增普通文档优先使用中文文件名；约定入口名、ADR 编号、工具路径和
已有稳定链接可继续使用英文文件名。修改双语文档时必须同步命令、版本、能力边界和安全承诺。

## 开始之前

1. 阅读 `AGENTS.md`、`REVIEW.md` 和 `docs/DOCUMENT_STATUS.md`。
2. 从与任务最接近的现有实现和测试开始，不依据历史 PRD 猜测当前行为。
3. 涉及隐私、规则语义、配置写入或 Desktop 权限边界时，阅读 `docs/adr/` 中对应 Accepted 决策。
4. Issue、PR、fixture 和截图中不要包含真实密钥、内部端点、用户名、配置内容或本机路径。
5. 安全漏洞和疑似敏感信息泄漏请按 `SECURITY.md` 私下报告。

需要 Node.js 22 或 24：

```bash
npm ci
npm run check
```

## 贡献类型与文件清单

### 新增或扩展 Agent Adapter

- 阅读 `.agents/skills/add-agent-adapter/SKILL.md`。
- 在 `src/adapters/<agent>/` 分离 `parse.ts`、`risk.ts` 和 adapter 入口。
- 在 `src/adapters/types.ts` 增加 AgentId，并在 `src/adapters/index.ts` 注册。
- 增加合成 fixture、发现/解析/规则测试和完整 findings 泄漏回归。
- 更新 README 支持矩阵、`docs/product-capabilities.md` 和必要的配置路径研究证据。

### 新增或修改安全规则

- 阅读 `.agents/skills/add-security-rule/SKILL.md`。
- 同步 finding 逻辑、`src/rules/ids.ts`、`src/rules/action-matrix.ts`、remediation 和测试。
- 更新 `docs/rule-disposition-matrix.md`；不要通过修改硬编码数量绕过完整性测试。
- 说明为什么它需要独立用户行动，以及如何验证、何时可以接受。

### 修改 baseline、apply 或 restore

- 先证明目标格式能够安全写回；保留不相关字段和文件权限。
- 增加 dry-run、无变化、并发修改、备份完整性、部分失败回滚和恢复测试。
- 不要自动修改 CC Switch SQLite 或无法可靠保留注释/格式的配置。

### 修改 CLI、报告或 schema

- 保持 JSON 顶层契约；破坏性变化必须升级 schemaVersion。
- 同时检查 CLI 文案、退出码、HTML、XSS 转义、Desktop 和 `docs/output-schema-v1.md`。
- 报告仍是静态快照，不能暗示已经自动完成用户未确认的操作。

### 修改 macOS Desktop

- 阅读 `.agents/skills/change-desktop-ipc/SKILL.md`。
- 业务逻辑进入 `src/desktop/service.ts`；Electron 主进程负责授权、原生确认和系统对话框。
- 同步 main、preload、renderer、诊断白名单、service test 和 desktop smoke test。
- 运行 `npm run desktop:pack`，确认没有默认 Electron 图标或立即启动崩溃。

### 修改长期架构边界

- 先阅读 `docs/adr/README.md` 和相关 Accepted ADR。
- 若决策仍有效，代码和测试必须遵守；若确实需要改变，创建编号递增的新 ADR 并标记替代关系。
- 不要通过改写旧 ADR 隐藏历史决策，也不要用 ADR 记录普通实现细节。

### 运行 AI 冷启动评测

- 先运行 `npm run evals:preflight`，再按 `evals/README.md` 在临时 worktree 和全新会话运行。
- 只向代理发送任务的 `prompt`，不得泄露评分标准、目标文件或技能名。
- challenge 任务没有改代码也必须执行 `requiredChecks`；缺少代理执行证据时验证质量不得记满分。
- 用 `npm run evals:result:check -- /path/to/result.json` 校验脱敏评分摘要，不提交完整对话、命令输出、
  模型隐藏推理或评测生成代码。

## 测试约定

- 使用 `node:test` 和 `node:assert/strict`，从 `dist/` 导入编译产物。
- fixture 在临时目录创建并清理；不要读取开发者真实 home 配置。
- 凭证测试必须使用明显占位内容，并断言完整输出不包含该值。
- 修复 bug 时先增加能复现问题的测试，再验证修复后的边界。

## 提交前检查

```bash
npm run check
npm run sanitize:staged
npm run evals:check
npm run evals:preflight
git diff --check
git status --short
```

`npm run check` 会执行敏感信息检查、完整测试、仓库贡献一致性检查、`dist` 同步检查和 npm 发布内容检查。
CLI 发布候选还应执行 `npm run package:verify-install`，用实际 tarball 验证文件清单、临时 prefix 安装和
本地 npx 入口；它不会发布到 registry。
macOS 正式签名、公证和发布资产验证只由具备凭据的维护者执行。最终 tarball 和 DMG 还必须运行
`npm run release:scan-assets -- --tarball <path> --dmg <path>`，独立扫描解包后的发布内容与 `app.asar`。

## Pull Request

- 一个 PR 聚焦一个可独立审查的问题。
- `CODEOWNERS` 标记的关键安全路径需要维护者审查；公开仓库还需启用相应 branch protection 才能强制执行。
- 填写 PR 模板中的影响面和安全检查，不适用项需说明原因。
- 若改变用户行为或当前能力，同一 PR 更新权威文档。
- 不要为了通过测试删除隐私断言、降低错误处理或扩大风险接受范围。
