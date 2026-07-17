---
name: 🐛 Bug 报告
about: AgentGuard 运行出错、结果异常、命令崩溃
title: "[Bug] "
labels: ["bug", "needs-triage"]
assignees: []
---

## 问题描述

<!-- 清晰简洁地描述 Bug -->

## 复现步骤

<!-- 必填，请提供从 `agentguard` 全新安装到触发问题的完整步骤 -->

1.
2.
3.

## 实际表现

<!-- 命令输出、错误信息、截图 -->

```bash
$ agentguard doctor
... (粘贴完整输出)
```

## 预期表现

<!-- 你期望的正确行为 -->

## 环境信息

<!-- 请运行 `agentguard doctor --json` 并粘贴输出，或手动填写 -->

- **AgentGuard 版本**:
- **Node.js 版本** (`node -v`):
- **操作系统** (macOS / Linux / Windows + 版本):
- **涉及的 Agent**:
  - [ ] OpenCode
  - [ ] CC Switch
  - [ ] Claude Code
  - [ ] Codex
  - [ ] 其他: ___
- **是否使用 `--dry-run`**:
- **是否有 `--verbose` 输出**:

## 影响范围

<!-- Bug 影响哪些功能？是否影响 HTML 报告生成？ -->

- [ ] 阻塞使用（完全不能跑）
- [ ] 主要功能受影响
- [ ] 边缘场景
- [ ] 文案 / 样式问题

## 可能的根因（可选）

<!-- 如果你已有判断，欢迎填写 -->

## 附加信息

<!-- 配置文件示例（请脱敏！）、日志、相关 Issue 链接 -->

```yaml
# 示例（请删除真实 API Key）
provider:
  base_url: https://example.com
  api_key: sk-xxx-your-key-redacted
```
