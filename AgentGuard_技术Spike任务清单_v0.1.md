**AgentGuard 技术 Spike 任务清单 v0.1**

面向多 Agent、多模型、多 Provider 的安全配置中心

用于 5 天技术可行性验证和 Go / No-Go 开工决策

| **文档版本**     | v0.1                                         |
|:-----------------|:---------------------------------------------|
| **适用阶段**     | 技术 Spike / MVP 开发前验证                  |
| **建议周期**     | 5 个工作日                                   |
| **产品形态**     | CLI 工具 + HTML 报告                         |
| **重点验证对象** | OpenCode、CC Switch、Claude Code、Codex      |
| **核心判断**     | 能否在 4 周内做出 AgentGuard MVP 可演示 Demo |

本文档基于 AgentGuard v0.2 立项方向和 MVP PRD v0.2 编写。Spike 的目标不是完成完整产品，而是用最小工程投入验证关键技术链路是否可行。

# 目录

- 1\. Spike 目标与边界

- 2\. 5 天任务总览

- 3\. 模块任务拆解

- 4\. 输入输出样例

- 5\. 验收标准

- 6\. Go / No-Go 判断标准

- 7\. 负责人分工建议

- 8\. 风险与决策点

- 9\. 交付物清单

- 10\. 开工评审会议程

- 附录 A. GitHub Issue 初始清单

- 附录 B. 推荐目录结构

# 1. Spike 目标与边界

## 1.1 Spike 目标

本次技术 Spike 要验证 AgentGuard MVP 的最小闭环是否可行。重点不是功能完整，而是打通从配置发现、配置解析、风险识别到 HTML 报告输出的关键路径。

- 验证能否发现本机 AI Coding Agent 配置，包括 OpenCode、CC Switch、Claude Code、Codex。

- 验证能否解析 OpenCode 配置，包括 Provider、base_url、MCP、auto mode 和基础权限信息。

- 验证能否解析 CC Switch 配置，包括 Provider 列表、base_url、Agent 与 Provider 绑定关系、可能的 API Key 风险。

- 验证能否识别未知 Provider、中转 API、企业内部 Provider 和国内官方 Provider。

- 验证能否生成一份可离线打开的 HTML 配置地图报告。

- 验证 dry-run、diff、backup、restore 的工程实现是否存在明显障碍。

## 1.2 Spike 不做事项

- 不做运行时拦截。

- 不做企业控制台。

- 不做桌面 App。

- 不做 VS Code 插件。

- 不做完整 GitHub Action。

- 不做大规模漏洞规则库。

- 不做完整 AgentShield 式 Claude Code 深度扫描。

- 不做自动阻断或默认自动修改配置。

## 1.3 Spike 成功定义

5 天结束时，只要能够演示 agentguard doctor、agentguard map、agentguard provider scan 和 agentguard report --format html 的基础能力，就可以进入 Go / No-Go 评审。

# 2. 5 天任务总览

| **时间** | **主题** | **主要交付** | **验收点** |
|:---|:---|:---|:---|
| 第 1 天 | 项目框架和配置路径调研 | CLI 框架、adapter 骨架、配置路径清单 | 能运行 agentguard --help |
| 第 2 天 | Agent Discovery 与 OpenCode 解析 | agentguard doctor 初版、OpenCode adapter 初版 | 能发现 OpenCode 并输出 JSON |
| 第 3 天 | CC Switch 解析与 Provider 风险识别 | ccswitch adapter 初版、provider risk engine 初版 | 能识别未知 base_url |
| 第 4 天 | MCP、敏感文件和 HTML 报告 | 基础 MCP 风险、敏感文件扫描、HTML 报告初版 | 能生成配置地图报告 |
| 第 5 天 | 差异验证、备份回滚 Spike、Go / No-Go 准备 | AgentShield 对比、备份回滚原型、评审材料 | 能做一次完整 Demo |

# 3. 模块任务拆解

## 3.1 模块 A：项目框架与 CLI 骨架

**任务：**

- 初始化 TypeScript + Node.js CLI 项目。

- 设计命令结构：doctor、map、scan、provider scan、ccswitch scan、report。

- 建立 core、adapters、rules、reports、profiles 目录。

- 实现统一 JSON 输出格式。

**验收：**

- agentguard --help 可正常输出。

- 至少支持 agentguard doctor 和 agentguard map 两个命令入口。

- 代码结构能够支持后续 adapter 扩展。

## 3.2 模块 B：Agent Discovery

**任务：**

- 扫描常见配置路径。

- 识别 OpenCode、CC Switch、Claude Code、Codex 是否存在。

- 缺失配置时不报错，而是输出 not found。

- 输出 agent_name、config_found、config_path、risk_level 等字段。

**验收：**

- 能在 Mac 环境下发现至少两个 Agent 配置。

- 能输出结构化 JSON。

- 对未安装工具有清晰提示。

## 3.3 模块 C：OpenCode Adapter

> **D1 实测修订（2026-07-09，v1.17.16 实测）**：OpenCode 无单一 auto mode 开关；配置路径为全局 `~/.config/opencode/opencode.json` + 项目 `opencode.json` 合并，密钥独立在 `~/.local/share/opencode/auth.json`（config 内多为 `{env:}` 引用）。详见 `docs/research/D1-配置路径调研.md` §5。

**任务：**

- 定位并合并 OpenCode 配置（全局 `~/.config/opencode/opencode.json` + 项目 `opencode.json`；优先 `XDG_CONFIG_HOME`）。

- 解析 Provider、model、base_url、MCP、**permission（edit/bash/webfetch = allow/ask/deny）、tools、snapshot、autoupdate**。

- 识别未知 Provider、**permission 全放行/bash 无限制**、MCP remote、filesystem home 等风险。

- 输出 OpenCode 风险列表。

**验收：**

- 能解析 OpenCode 配置（全局 + 项目合并）。

- 能识别 Provider 和 base_url。

- 能识别 MCP 数量和基础风险。

- 能识别 permission 风险（取代原"识别 auto mode"）。

- 能在报告中展示 OpenCode 风险。

## 3.4 模块 D：CC Switch Adapter

> **D1 实测修订（2026-07-09）**：CC Switch 当前用 **SQLite `~/.cc-switch/cc-switch.db`（user_version=10）** 存配置，不是 JSON 文件（旧版 `config.json` 需兼容）；且内置本地反向代理（`proxy_config`，默认 `127.0.0.1:15721`）。技术依赖：Node 侧 SQLite（`better-sqlite3` 或 `node:sqlite`）。详见 `docs/research/D1-配置路径调研.md` §3。

**任务：**

- 打开 `~/.cc-switch/cc-switch.db`(SQLite)，兼容旧版 `config.json`；读 `PRAGMA user_version` 做版本兼容。

- 解析 `providers`（按 `app_type` 取 `settings_config`）、`provider_endpoints`、`mcp_servers`、`proxy_config`；`app_type` 动态枚举不硬编码。

- 识别未知 base_url、中转 API、明文 key、同一 key 复用、**代理开启并还原真实上游**等风险。

- 输出 CC Switch 风险报告。

**验收：**

- 能打开 SQLite 并解析 Provider 列表（兼容旧版 config.json）。

- 能识别至少一种未知 Provider 风险。

- 能识别代理开启并还原"Agent → 代理 → 真实 Provider"链路。

- 能展示 Agent 与 Provider 的映射关系。

## 3.5 模块 E：Provider Risk Engine

**任务：**

- 建立 Provider 分类：official、domestic_official、enterprise_internal、openai_compatible_unknown、relay_or_proxy、local、unknown。

- 内置 OpenAI、Anthropic、Gemini、DeepSeek、MiniMax、Kimi、GLM、通义、火山、百度千帆、腾讯混元、Ollama 等基础规则。

- 支持用户白名单配置雏形。

**验收：**

- 能区分官方 endpoint 和未知 endpoint。

- 能将企业内部 endpoint 标记为 internal。

- 风险解释不武断，能说明判断依据。

## 3.6 模块 F：MCP 与敏感文件基础风险

**任务：**

- 解析 OpenCode 和 Claude Code 中的 MCP 基础配置。

- 识别 filesystem、shell、database、browser、remote MCP 等风险类型。

- 扫描当前项目目录中的 .env、私钥、云凭证、kubeconfig 等敏感文件名。

- 敏感内容必须脱敏或不读取。

**验收：**

- 能列出 MCP 数量和风险类型。

- 能发现当前目录中的敏感文件。

- 报告中不泄露完整密钥。

## 3.7 模块 G：HTML 配置地图报告

**任务：**

- 生成本地 HTML 文件。

- 展示 Agent 配置地图、Provider 风险、CC Switch 风险、OpenCode 风险、MCP 风险、敏感文件风险。

- 报告需中文优先，可离线打开。

**验收：**

- 能生成 agentguard-report.html。

- 报告包含配置地图表格。

- 非技术管理者也能看懂主要风险。

## 3.8 模块 H：dry-run、diff、backup、restore Spike

**任务：**

- 验证配置修改前备份机制。

- 验证 diff 展示方案。

- 验证 restore 最近一次备份。

- 第一版只需支持 OpenCode 的有限配置变更。

**验收：**

- 不允许无备份修改配置。

- 能回滚最近一次修改。

- dry-run 阶段不写文件。

## 3.9 模块 I：AgentShield 差异验证

**任务：**

- 实际运行 AgentShield。

- 记录其 Claude Code、OpenCode、Codex、MCP、HTML、auto-fix 支持情况。

- 明确 AgentGuard 差异边界。

**验收：**

- 输出一页差异分析表。

- 确认 AgentGuard 不与 AgentShield 正面比规则数量。

# 4. 输入输出样例

## 4.1 agentguard doctor 输出样例

AgentGuard Doctor\
\
Detected agents:\
\[OK\] OpenCode found risk: high\
\[OK\] Claude Code found risk: medium\
\[OK\] Codex found risk: low\
\[OK\] CC Switch found risk: high\
\[--\] OpenClaw not found\
\
Key findings:\
\[HIGH\] Unknown provider endpoint detected in CC Switch\
\[MED \] OpenCode auto mode enabled\
\[MED \] 3 MCP servers configured\
\[HIGH\] Sensitive files found in current project\
\[LOW \] Codex sandbox appears enabled\
\
Next:\
Run "agentguard report --format html" to generate a full report.

## 4.2 agentguard map 输出样例

AI Coding Agent Configuration Map\
\
Agent Provider Base URL Type Auto Mode MCP Risk\
OpenCode MiniMax official enabled 3 high\
Claude Code Anthropic official disabled 2 medium\
Codex OpenAI official partial 0 low\
CC Switch Mixed includes unknown - - high

## 4.3 Provider 风险输出样例

Provider Risk Report\
\
\[HIGH\] unknown-openai-compatible\
Agent: OpenCode\
Base URL: https://api.xxx-example.com/v1\
Reason: Unknown OpenAI-compatible endpoint may receive source code and context.\
Recommendation: Mark this provider as trusted only if it is your internal endpoint.\
\
\[MEDIUM\] shared-api-key\
Agents: Claude Code, OpenCode\
Reason: Same API key appears to be reused across multiple agents.\
Recommendation: Use separate API keys for different agents.

## 4.4 JSON 输出样例

{\
"agents": \[\
{\
"agent": "opencode",\
"installed": true,\
"config_found": true,\
"config_path": "/path/to/opencode/config",\
"provider": "minimax",\
"base_url": "https://api.minimaxi.com",\
"auto_mode": true,\
"mcp_count": 3,\
"risk_level": "high"\
}\
\],\
"findings": \[\
{\
"id": "CCSWITCH_UNKNOWN_PROVIDER",\
"severity": "high",\
"category": "provider",\
"title": "Unknown provider endpoint detected"\
}\
\]\
}

# 5. 验收标准

## 5.1 功能验收

1.  能安装并运行 CLI。

2.  能执行 agentguard doctor。

3.  能发现 OpenCode、CC Switch、Claude Code、Codex 中至少两个。

4.  能解析 OpenCode 配置。

5.  能解析 CC Switch Provider 配置。

6.  能识别未知 Provider 或未知 base_url。

7.  能扫描当前项目敏感文件。

8.  能识别 MCP 基础风险。

9.  能生成 HTML 配置地图报告。

10. 能输出 JSON。

11. 默认不主动修改配置。

## 5.2 用户体验验收

- 用户能在 10 分钟内完成安装、doctor、report 三个动作。

- 用户能看懂当前有哪些 Agent、每个 Agent 用哪个 Provider、哪些 Provider 风险高。

- HTML 报告可以直接发给技术合伙人、安全人员或管理者。

- 工具输出不能泄露完整 API Key、Token、SSH 私钥等敏感内容。

## 5.3 差异化验收

| **验收项**                     | **是否必须** | **说明**                  |
|:-------------------------------|:-------------|:--------------------------|
| 多 Agent 配置地图              | 必须         | 区别于单 Agent 扫描器     |
| CC Switch 安全检查             | 必须         | 核心差异点                |
| Provider 风险识别              | 必须         | 覆盖多模型和中转 API 场景 |
| OpenCode 深度适配              | 必须         | 面向二开和开源生态        |
| 中文 HTML 报告                 | 必须         | 适配国内传播和团队沟通    |
| dry-run、diff、backup、restore | 必须         | 建立用户信任              |
| Claude Code hooks 深度检测     | 不必须       | 避免与 AgentShield 重合   |
| 大规模漏洞规则库               | 不必须       | 不是 Spike 阶段重点       |

# 6. Go / No-Go 判断标准

5 天 Spike 结束后，满足以下 6 条技术可行性判据中的 4 条，建议 Go，进入 4 周 MVP 开发。

12. 能发现至少 2 个 Agent 配置。

13. 能解析 OpenCode 配置。

14. 能解析 CC Switch 配置。

15. 能识别未知 Provider 或中转 API。

16. 能生成基础 HTML 配置地图。

17. 技术合伙人确认 4 周内能做出 MVP Demo。

> **D1 修订（2026-07-09）**：原第 18 条「至少 3 个真实用户愿意试用 Demo」时机不当——Spike 末尾尚无可发布 Demo，无法招募试用。已移至 **MVP 第 4 周出口**评估；Spike 出口仅保留以上 6 条技术可行性判据。

## 6.1 No-Go 条件

- CC Switch 配置完全无法解析，且无法找到替代差异化入口。

- OpenCode 配置结构无法稳定读取。

- HTML 配置地图没有明显展示价值。

- 技术合伙人判断 4 周内无法完成 MVP Demo。

- 试用用户反馈配置地图和 Provider 风险识别没有价值。

## 6.2 Pivot 条件

- 如果 CC Switch 不可解析，则把差异化转向 OpenCode 深度治理和国内 Provider 风险。

- 如果 OpenCode 不适合深度适配，则转向多 Agent 配置地图和 Provider 风险识别。

- 如果用户更关注报告而不是配置修复，则推迟 apply、restore，仅保留 scan 和 report。

# 7. 负责人分工建议

| **角色** | **职责** | **建议负责人** |
|:---|:---|:---|
| 产品负责人 | 定义范围、验收标准、报告样例、用户反馈 | 你 |
| 技术负责人 | 技术架构、adapter 设计、代码评审、Go / No-Go 判断 | 技术合伙人 A |
| CLI 开发 | 命令行框架、JSON 输出、错误处理 | 开发同学 |
| Adapter 开发 | OpenCode、CC Switch、Claude Code、Codex 配置解析 | 开发同学 |
| 规则与安全 | Provider 风险、MCP 风险、敏感文件规则 | 安全背景同学 |
| 报告与前端 | HTML 报告模板、配置地图展示、可视化样式 | 前端同学 |
| 开源运营 | README、Demo、Issue、用户试用招募 | 你或运营同学 |

# 8. 风险与决策点

| **风险** | **影响** | **应对** |
|:---|:---|:---|
| CC Switch 配置结构复杂或变化快 | 核心差异点受影响 | 先支持配置文件读取和 Provider 识别，不追求全量行为解析 |
| OpenCode 配置路径和格式不稳定 | 深度适配受影响 | 优先适配当前稳定版本，保留 adapter 抽象 |
| Provider 风险判断不准确 | 容易误伤企业内部服务 | 使用 trust_level，不武断阻断，支持白名单 |
| 用户担心工具读取敏感文件 | 信任受影响 | 默认不读取内容，只识别路径；密钥展示必须脱敏 |
| 与 AgentShield 定位混淆 | 传播和差异化受影响 | 强调配置地图、CC Switch、Provider、迁移和治理 |
| 第一版范围过大 | 延期风险 | 严格执行 P0 范围，P1 和 P2 不进入 Spike |

# 9. 交付物清单

| **编号** | **交付物**              | **格式**         | **负责人** | **截止时间** |
|:---------|:------------------------|:-----------------|:-----------|:-------------|
| D1       | 配置路径调研表          | Markdown / 表格  | 技术负责人 | 第 1 天      |
| D2       | CLI 框架原型            | 代码             | 开发同学   | 第 1 天      |
| D3       | Agent Discovery 原型    | 代码 + JSON 输出 | 开发同学   | 第 2 天      |
| D4       | OpenCode Adapter Spike  | 代码 + 风险样例  | 开发同学   | 第 2 天      |
| D5       | CC Switch Adapter Spike | 代码 + 风险样例  | 开发同学   | 第 3 天      |
| D6       | Provider 风险识别原型   | 代码 + 规则表    | 安全同学   | 第 3 天      |
| D7       | HTML 配置地图报告       | HTML             | 前端同学   | 第 4 天      |
| D8       | AgentShield 差异分析    | 1 页文档         | 你         | 第 5 天      |
| D9       | Go / No-Go 评审材料     | PPT 或文档       | 你         | 第 5 天      |

# 10. 开工评审会议程

建议在 Spike 前开一次 45 分钟评审会，会议只解决是否进入技术验证和如何分工，不再讨论大方向。

19. 确认 AgentGuard v0.2 方向是否进入技术 Spike。

20. 确认 MVP 是否只做 CLI + HTML 报告。

21. 确认第一版是否锁定 OpenCode + CC Switch 深度适配。

22. 确认 Claude Code 和 Codex 是否只做基础识别。

23. 确认是否采用 TypeScript + Node.js。

24. 确认 5 天 Spike 的负责人和交付物。

25. 确认 Go / No-Go 判断标准。

会议结论必须落成三选一：Go、No-Go、Pivot。

# 附录 A. GitHub Issue 初始清单

| **Issue** | **任务**                        | **优先级** | **目标时间** |
|:----------|:--------------------------------|:-----------|:-------------|
| AG-001    | 初始化 CLI 项目                 | P0         | 第 1 天      |
| AG-002    | 实现 adapter 接口定义           | P0         | 第 1 天      |
| AG-003    | 实现 agentguard doctor 原型     | P0         | 第 2 天      |
| AG-004    | 实现 OpenCode config discovery  | P0         | 第 2 天      |
| AG-005    | 实现 OpenCode provider parser   | P0         | 第 2 天      |
| AG-006    | 实现 CC Switch config discovery | P0         | 第 3 天      |
| AG-007    | 实现 CC Switch provider parser  | P0         | 第 3 天      |
| AG-008    | 实现 Provider trust level 规则  | P0         | 第 3 天      |
| AG-009    | 实现敏感文件名扫描              | P0         | 第 4 天      |
| AG-010    | 实现 MCP 基础风险识别           | P0         | 第 4 天      |
| AG-011    | 实现 HTML 报告模板              | P0         | 第 4 天      |
| AG-012    | 实现 report --format html       | P0         | 第 4 天      |
| AG-013    | 实现 backup、diff、restore 原型 | P1         | 第 5 天      |
| AG-014    | 试用 AgentShield 并写差异分析   | P0         | 第 5 天      |
| AG-015    | 整理 Go / No-Go 评审材料        | P0         | 第 5 天      |

# 附录 B. 推荐目录结构

agentguard/\
docs/\
strategy/\
prd/\
research/\
competitor/\
spike/\
packages/\
cli/\
src/\
core/\
discovery/\
risk-engine/\
provider-analyzer/\
report-generator/\
backup-manager/\
adapters/\
opencode/\
cc-switch/\
claude-code/\
codex/\
rules/\
provider/\
mcp/\
secrets/\
reports/\
templates/\
examples/\
reports/\
README.md

# 附录 C. 建议试用命令

npm install -g agentguard\
agentguard doctor\
agentguard map\
agentguard scan\
agentguard provider scan\
agentguard ccswitch scan\
agentguard report --format html\
agentguard baseline --profile balanced --dry-run\
agentguard diff\
agentguard restore
