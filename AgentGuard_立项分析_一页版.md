# AgentGuard 立项分析（一页版）

> 历史一页版：MVP 范围和“不做事项”已随试点演进，当前功能与边界请以
> [`docs/product-capabilities.md`](docs/product-capabilities.md) 为准。

> 文档来源：基于 `AgentGuard_安全配置中心_立项分析文档_v0.2.docx` 精简
> 用途：对外介绍、内部对齐、GitHub README 草稿
> 日期：2026-07-09

---

## 一句话定位

**AgentGuard**：面向多 Agent、多模型、多 Provider 的 AI Coding Agent 安全配置中心。

**口号**：让 AI Coding Agent 好用，也可控。

---

## 我们不做什么

- 不做 AI Agent 漏洞扫描器（AgentShield 已覆盖）
- 不做单 Agent 深度 hooks 检测
- 不做运行时拦截 / 企业控制台 / 桌面 App
- 不和 AgentShield 比规则数量

---

## 我们做什么

**核心定位**：站在 CC Switch、各类 Agent 之上，提供统一的安全配置治理入口。

| 维度 | AgentShield | **AgentGuard** |
|---|---|---|
| 定位 | AI Agent 安全扫描器 | 多 Agent 安全配置中心 |
| 核心动作 | scan / detect / fix | discover / compare / configure / migrate / baseline / rollback |
| 主生态 | 偏 Claude Code | Claude Code / OpenCode / Codex / OpenClaw / CC Switch |
| 多 Provider | 非核心 | 核心 |
| 国内场景 | 非重点 | 重点支持 |
| CC Switch 联动 | 不突出 | 重点支持 |
| 配置迁移 | 不突出 | 重点能力 |
| 中文体验 | 非重点 | 重点支持 |

---

## MVP 范围（4 周）

**产品形态**：CLI 工具 + HTML 报告（离线可打开）

**P0 支持对象**：
- OpenCode（深度适配）
- CC Switch（深度适配）
- Claude Code（基础识别）
- Codex（基础识别）

**核心能力**：
1. 多 Agent 发现与配置地图
2. 多 Provider 风险识别（中转 API、国内大模型）
3. CC Switch 配置安全检查
4. OpenCode 深度解析（MCP、auto mode、permissions）
5. 敏感文件扫描
6. MCP 基础风险识别
7. 中文 HTML 报告
8. dry-run / diff / backup / restore（信任机制）

**MVP 不做**：运行时拦截、企业控制台、VS Code 插件、GitHub App、完整漏洞库。

---

## 目标用户

1. **个人开发者**：同时使用多个 Agent，想知道当前环境是否安全
2. **重度用户**：频繁切模型，关心切换后安全边界
3. **小团队 / 创业团队**：需要统一安全基线
4. **企业二开团队**：基于 OpenCode / Codex 自建平台
5. **安全评估人员**：需要快速输出 AI Agent 安全评估报告

---

## 90 天路线图

| 阶段 | 时间 | 目标 |
|---|---|---|
| 第 1 阶段 | Day 1-14 | 立项文档 + 技术 Spike（5 天） + Go/No-Go 决策 |
| 第 2 阶段 | Day 15-45 | MVP Demo：doctor / map / scan / report |
| 第 3 阶段 | Day 46-75 | 规则强化 + 国内 Provider 库 + OpenClaw 支持 |
| 第 4 阶段 | Day 76-90 | 开源发布 + 冷启动推广 + 团队试点 |

---

## 三大核心风险

| 风险 | 应对 |
|---|---|
| **CC Switch 是单点故障**：核心差异点取决于 CC Switch 配置可解析 | Spike 第 3 天优先验证；不通过则 Pivot 到 OpenCode 深度治理 |
| **信任机制被低估**：backup/restore/diff 跨格式复杂度高 | MVP 只覆盖 OpenCode，证明模式后再扩展 |
| **Provider 风险误判**：未知 endpoint 标红会被开发者弃用 | 默认 `unknown`，让用户主动标记，形成本地信任库 |

---

## 成功指标（开源发布后）

| 指标 | 目标 |
|---|---|
| GitHub Stars | 100+ |
| 真实试用用户 | 20+ |
| 用户反馈"配置地图有价值" | 5+ |
| 团队试点意向 | 1+ |
| Provider 规则社区贡献 | 1+ |

---

## 第一阶段最该做的事

> **跑通一件事**：`agentguard doctor` 10 秒内回答
> "我的 AI Coding Agent 到底连了哪些模型、哪些是危险的。"

其它能力都是这件事成立之后的扩展。
