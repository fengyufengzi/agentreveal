# AgentGuard 0.0.5-pilot.1 · 修复、接受与验证闭环

> 发布日期：2026-07-16。私有 GitHub Pre-release，仅面向受邀 Pilot 用户，不发布到 npm registry。

GitHub Pre-release：[v0.0.5-pilot.1](https://github.com/fengyufengzi/AgentGuard/releases/tag/v0.0.5-pilot.1)

发布资产 SHA-256：

```text
030739bed11bb59ba59f9ed6a169d251c5bc5d0c4c56368367150405b7f30722  agentguard-0.0.5-pilot.1.tgz
```

## 安装

```bash
gh release download v0.0.5-pilot.1 \
  --repo fengyufengzi/AgentGuard \
  --pattern 'agentguard-0.0.5-pilot.1.tgz'

npm install -g ./agentguard-0.0.5-pilot.1.tgz
agentguard --version
```

预期版本：`0.0.5-pilot.1`。不要使用 `npm install -g git+https://...`；Release tarball 已包含预编译 `dist/`。

## 本版目标

把 `0.0.4` 的“下一步行动报告”继续推进到：

```text
看到行动 → 获得本机命令 → 修复或接受 → 重新扫描 → 保留审计
```

## 本版功能

- 根据 macOS、Linux 和 Windows PowerShell 生成安全修复命令模板。
- baseline 任务继续生成 dry-run、带备份 apply 和复扫命令。
- macOS Keychain、Linux Secret Service、Windows 用户 DPAPI 的安全存储引导。
- HTML 命令复制按钮。
- `agentguard risk accept/list/revoke`，支持原因、到期、撤销和完整历史。
- acceptance schema v2 按当前项目 `scopeId` 隔离；旧 v1 记录仅保留为不生效的 legacy 审计。
- P0 任务强制设置到期时间。
- 有效接受任务不进入默认行动结果，也不参与默认高危退出码；HTML 仍保留接受记录和技术证据。
- JSON 扫描和报告增加 `acceptedTaskCount`。
- 聚合任务逐条展示全部规则的下一步、验证和接受条件，并标记命令是完整解决、风险缓解还是辅助步骤。
- `risk accept` 增加只读 preflight 与显式 `--confirm`，拒绝报告占位原因；审计规则摘要不保存动态标题或端点。
- `risk verify <task-id>` 区分已解决、仍存在、部分缓解、接受、过期/撤销和身份变化。

## 安全边界

- 跨平台命令只是引导，不是 `secret migrate`。
- 不自动修改 Agent 的凭证引用，不验证真实认证，不轮换或撤销旧密钥。
- 不把密钥写入 shell profile、普通 `.env` 或 Windows 用户环境。
- Codex TOML 和 CC Switch SQLite 继续只读。
- Linux Secret Service 依赖 `secret-tool`、桌面会话和已解锁密钥环，当前不会自动探测这些依赖。
- Windows DPAPI `Export-Clixml` 绑定当前 Windows 用户，不是团队共享凭证方案。
- acceptance 是本机状态，不是仓库或团队共享策略。
- 静态 HTML 始终只读，不具备本地执行桥接。

## 发布 blocker

- [x] acceptance 按 `taskId + project scopeId` 生效，两个项目的同类任务不会互相隐藏。
- [x] 旧无作用域 acceptance 作为 legacy 保留，不会静默作为全局记录继续生效。
- [x] 聚合任务展示全部子规则的下一步、验证和接受条件。
- [x] `risk accept` 写入前列出全部关联规则和接受条件，并要求显式确认。
- [x] 新增单任务 `risk verify`，覆盖缓解、解决、接受生命周期和身份变化。
- [x] README、quickstart、feedback、能力文档和安装版本统一。
- [x] 完整自动化测试、跨项目 acceptance、聚合 verify 和隐私回归通过。
- [x] `npm pack`、SHA-256、干净前缀安装、版本和真实报告验证通过。
- [x] GitHub Pre-release 创建并从 Release 资产重新下载安装验证。

回装结果：SHA-256 校验通过；全新 prefix 安装后 `agentguard --version` 输出 `0.0.5-pilot.1`；
隔离 HOME 中 `doctor` 正常显示 0/6 Agent，HTML 报告成功生成且为 0 项当前风险。

完整实施计划见
[`development-plan-0.0.5-hardening-and-pilot.md`](development-plan-0.0.5-hardening-and-pilot.md)。
