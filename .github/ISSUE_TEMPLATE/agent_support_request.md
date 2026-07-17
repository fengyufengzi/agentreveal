---
name: 🤖 新增 Agent 支持
about: 请求支持新的 AI Coding Agent 工具（如 Cursor、Gemini CLI、Continue 等）
title: "[Agent Support] "
labels: ["agent-support", "community-contribution"]
assignees: []
---

## Agent 基本信息

- **名称**: <!-- 例如：Cursor、Gemini CLI、Continue、Aider -->
- **官网 / 仓库**: <!-- https://... -->
- **所属公司 / 社区**:
- **支持的模型**:
  - [ ] OpenAI
  - [ ] Anthropic
  - [ ] Gemini
  - [ ] 国内大模型（请列出）
  - [ ] 自定义 Provider

## 用户量参考

<!-- GitHub Stars / 下载量 / 月活用户，越多优先级越高 -->

- **GitHub Stars**:
- **下载量 / 月活**:
- **目标用户群体**:

## 配置信息

### 配置文件路径

<!-- 主流操作系统下的默认配置路径 -->

- **macOS**:
- **Linux**:
- **Windows**:

### 配置文件格式

- [ ] JSON
- [ ] YAML
- [ ] TOML
- [ ] INI
- [ ] 其它: ___

### 配置文件示例（请脱敏）

```json
{
  "provider": "your-provider",
  "api_key": "sk-xxx-redacted",
  "base_url": "https://api.example.com",
  "model": "your-model",
  "auto_mode": false,
  "mcp_servers": []
}
```

## 需要覆盖的能力

<!-- 这个 Agent 需要 AgentGuard 支持哪些能力？勾选 -->

- [ ] Agent 发现（config path 扫描）
- [ ] Provider 识别
- [ ] MCP Server 解析
- [ ] auto mode 检测
- [ ] permissions / approval policy 解析
- [ ] 备份与回滚
- [ ] 其它: ___

## 优先级建议

<!-- 你认为这个 Agent 对 AgentGuard 价值有多大？ -->

- [ ] 🔴 P0 — 大量用户使用，必须支持
- [ ] 🟡 P1 — 重要用户群
- [ ] 🟢 P2 — 锦上添花
- [ ] ⚪ 仅作记录

## 是否愿意贡献

- [ ] 我愿意提 PR 实现 adapter
- [ ] 我可以提供配置文件样本（脱敏后）
- [ ] 我可以协助测试
- [ ] 仅请求支持，无暇贡献

## 参考资料

<!-- 相关 Issue、文档、其它 Agent 的 adapter 实现链接 -->
