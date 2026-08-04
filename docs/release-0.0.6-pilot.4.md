# AgentGuard 0.0.6-pilot.4 · 有效配置与漂移 Public Preview

> 状态：Published。2026-08-04 已完成 npm CLI 与 GitHub Pre-release 联合公开。

## 发布位置与证据

- npm：`@wangmarsen/agentguard@0.0.6-pilot.4`，dist-tag 为 `next`；
- GitHub Pre-release：<https://github.com/fengyufengzi/AgentGuard/releases/tag/v0.0.6-pilot.4>；
- 公开源码提交：`db8acfdea38eb6edbf1347600fe1de7585eb4019`；
- Apple 公证 Submission ID：`4bfb054b-ae30-455e-9ffe-001ce2e01705`，状态 `Accepted`；
- DMG SHA-256：`0fb594f35d51b8d7002d85d246bb8ac76df07870e6ebe5a2c68bd482dcf4b30b`；
- npm tarball SHA-256：`96a3fb23be02cc8e877748d5e87b1da96d09caa033b6bc0b894fcb6aa70714f9`。

## 本版目标

AgentGuard 从一次性配置扫描器推进为本地配置诊断器与手动变更守卫：

```text
发现配置来源 → 解释真正生效 → 显式保存可信状态 → 手动复扫比较
→ 定位新增、变化、恢复或重新出现 → 安全处理或保持现状
```

## 主要更新

- 深度解释 Claude Code、Codex 和 CC Switch 的配置优先级、有效 Provider、代理与真实上游、认证来源、
  权限、MCP、Skill、Hook 和不确定证据；
- 新增 `agentguard posture`、`agentguard drift` 与显式 `drift baseline` 管理；
- 本机可信快照按项目隔离，使用 0700/0600 权限、原子写入、并发校验和 keyed HMAC 身份；
- CLI、JSON、HTML 和 macOS Desktop 共用有效状态、漂移、Top 3 行动和认证冲突计划；
- Desktop 支持原生确认的可信状态创建、替换、删除与复扫；
- Claude Code 明文凭证迁移支持强制备份、计划指纹、原子写入、失败回滚、复扫与安全恢复；
- Codex `auth.json` 与 CC Switch SQLite 保持只读，AgentGuard 不自动轮换或打印凭证。

## 安装

CLI（Node.js 22+）：

```bash
npm install -g @wangmarsen/agentguard@next
agentguard --version
agentguard
```

macOS Desktop：从同版本 GitHub Pre-release 下载 `AgentGuard-0.0.6-pilot.4-arm64.dmg`，拖入
Applications 后打开。当前验证范围为 macOS 12+、Apple Silicon；Intel 尚未验证。

## 安全与产品边界

- 默认扫描、有效配置计算和报告保持本地只读，不自动上传；
- 首次扫描不会自动信任当前状态，可信快照必须由用户显式确认；
- 快照不保存 Token、原始端点、原始路径、模型名、配置值、evidence 或 taskId；
- 自动整改仅覆盖已有安全写入边界，继续要求预览、确认、备份、原子写入、复扫和恢复；
- 不包含后台常驻监控、运行时拦截、云上传、通用 Secret Vault、团队 Dashboard 或策略分发。

## 联合发布门禁

- [x] 冻结提交通过 `npm run check`、`npm run package:verify-install` 和 `npm run evals:preflight`；
- [x] CLI tarball 与 DMG 使用同一版本和冻结源码；
- [x] DMG 内唯一真实 `AgentGuard.app`、`app.asar` 与 arm64/minimum macOS 验证；
- [x] Developer ID Application 签名与 hardened runtime 验证；
- [x] Apple notarization 状态 Accepted；
- [x] staple、`stapler validate` 与 Gatekeeper `spctl` 验收；
- [x] 最终 tarball、DMG 和解包后的 `app.asar` 通过独立 Gitleaks 扫描；
- [x] SHA-256 清单与隔离安装、首次启动、项目扫描、报告和卸载验证；
- [x] 公开候选当前树与全部可达历史通过内置扫描和 Gitleaks；
- [x] npm、Git tag、GitHub Pre-release、CLI 和 DMG 使用同一版本并完成公开位置回装。

以上门禁均已完成；未来版本必须重新执行，不得沿用本次结果。
