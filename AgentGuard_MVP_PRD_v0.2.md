**AgentGuard MVP PRD v0.2**

> 历史基线文档：记录项目立项时的 MVP 假设，部分命令、范围和产品形态已过时。
> 当前实际能力以 [`docs/product-capabilities.md`](docs/product-capabilities.md) 为准。

**多 Agent 安全配置中心**

产品需求文档 \| CLI 工具 + HTML 报告 \| v0.2

目标周期：2-4 周完成可演示 Demo

首批重点对象：OpenCode、CC Switch、Claude Code、Codex

# **文档信息**

| **字段**     | **内容**                                         |
|--------------|--------------------------------------------------|
| 文档名称     | AgentGuard MVP PRD v0.2                          |
| 阶段         | MVP 产品需求文档                                 |
| 产品定位     | 面向多 Agent、多模型、多 Provider 的安全配置中心 |
| 产品形态     | CLI 工具 + HTML 报告                             |
| 目标周期     | 2-4 周完成可演示 Demo                            |
| 首批重点对象 | OpenCode、CC Switch、Claude Code、Codex          |

# **目录**

1\. MVP 目标

2\. MVP 不做什么

3\. 目标用户

4\. 第一版支持范围

5\. 核心用户流程

6\. 功能需求

7\. CLI 命令设计

8\. 风险等级设计

9\. 安全基线设计

10\. 数据结构设计

11\. MVP 验收标准

12\. 开发排期

13\. MVP 成功指标

14\. 主要风险和应对

15\. 技术合伙人需要确认的问题

16\. 当前结论

# **1. MVP 目标**

## **1.1 产品目标**

AgentGuard MVP 的目标是帮助开发者和小团队快速看清本机 AI Coding Agent 的安全配置状态。

> **用户不知道自己电脑上有哪些 AI Coding Agent，分别连了哪些模型和 Provider，是否使用了未知中转 API，是否开启了高风险 auto mode，是否接入了 MCP Server，是否存在敏感文件暴露和危险配置风险。**

MVP 不追求做完整安全平台，而是做一个轻量、可信、可演示的本地工具。

- 看清楚：发现本机 Agent、Provider、MCP、auto mode 和配置状态。

- 查风险：识别未知 Provider、敏感文件、危险权限、MCP 风险。

- 出报告：生成开发者、安全人员、技术管理者都能看懂的 HTML 报告。

- 可恢复：所有配置修改必须支持 dry-run、diff、backup、restore。

- 差异化：区别于 AgentShield，不做单一 Claude Code 扫描器，而是做多 Agent、多模型、多 Provider 的安全配置中心。

# **2. MVP 不做什么**

第一版必须克制，明确不做以下内容。

| **不做事项**             | **原因**                       |
|--------------------------|--------------------------------|
| 不做运行时拦截           | 技术复杂度高，容易拖慢 MVP     |
| 不做企业控制台           | 第一版先验证个人和小团队需求   |
| 不做桌面 App             | 先用 CLI 和 HTML 报告验证价值  |
| 不做 VS Code 插件        | 不是第一阶段核心入口           |
| 不做完整 GitHub Action   | 可作为 v0.2 或 v0.3            |
| 不做 SIEM、DLP、IAM 集成 | 属于企业版能力                 |
| 不做完整漏洞扫描器       | 避免和 AgentShield 正面重叠    |
| 不做大规模规则库         | 第一版重点是配置地图和核心风险 |
| 不做多租户和权限管理     | 不是 MVP 阶段目标              |
| 不做自动阻断             | 第一版以发现、建议、报告为主   |

> **第一版原则：默认只读，不主动修改。所有修改必须先 dry-run，可查看 diff，可备份，可回滚。**

# **3. 目标用户**

## **3.1 个人开发者**

- 同时使用 Claude Code、Codex、OpenCode、OpenClaw、Cursor 等工具。

- 使用 CC Switch 或类似工具切换模型。

- 不一定懂安全配置。

- 关心效率，也担心 Agent 误操作。

> **核心诉求：我想知道当前这样使用 AI Coding Agent 是否安全。**

## **3.2 AI Coding Agent 重度用户**

- 经常切换模型和 Provider。

- 使用 auto mode。

- 接入 MCP Server。

- 可能同时维护多个 Agent 配置。

> **核心诉求：我希望像管理模型一样管理 Agent 的安全配置。**

## **3.3 小团队和企业二开团队**

- 团队内部开始推广 AI Coding Agent。

- 可能基于 OpenCode、Codex、OpenClaw 做二次开发。

- 需要统一安全基线。

- 不想一开始上复杂企业安全平台。

> **核心诉求：我们需要一个轻量工具，帮助团队看清和统一 AI Coding Agent 安全配置。**

## **3.4 安全团队和 AI 安全评估人员**

- 需要评估 AI Coding Agent 能否在组织内部使用。

- 需要报告和证据。

- 关心 Provider、MCP、敏感文件、auto mode 和权限风险。

> **核心诉求：我需要一个能快速输出安全评估报告的工具。**

# **4. 第一版支持范围**

## **4.1 P0 支持对象**

| **对象** | **支持深度** | **MVP 要求** |
|----|----|----|
| OpenCode | 深度支持 | 解析配置、Provider、MCP、auto mode、基础权限 |
| CC Switch | 深度支持 | 解析 Provider、base_url、模型切换配置、未知中转风险 |
| Claude Code | 基础支持 | 识别配置路径、Provider、MCP、基础安全状态 |
| Codex | 基础支持 | 识别配置路径、sandbox、approval、network 基础状态 |

## **4.2 P1 支持对象**

| **对象**   | **支持内容**                     |
|------------|----------------------------------|
| OpenClaw   | 配置路径发现和基础 Provider 识别 |
| Gemini CLI | 基础配置识别                     |
| Cline      | 基础配置识别                     |
| Roo Code   | 基础配置识别                     |

## **4.3 P2 支持对象**

| **对象**             | **支持内容**     |
|----------------------|------------------|
| Cursor               | 后续研究         |
| Continue             | 后续研究         |
| 国内大厂 AI 编程工具 | 后续研究         |
| 企业内部 Agent 平台  | 企业定制阶段支持 |

# **5. 核心用户流程**

## **5.1 首次使用流程**

用户执行：

> agentguard doctor

系统完成：

> 1\. 扫描本机常见 Agent 配置路径。
>
> 2\. 识别 OpenCode、Claude Code、Codex、OpenClaw、CC Switch。
>
> 3\. 识别各 Agent 当前 Provider。
>
> 4\. 识别是否存在未知 base_url。
>
> 5\. 识别是否存在 MCP。
>
> 6\. 识别是否开启 auto mode。
>
> 7\. 输出总体风险摘要。
>
> AgentGuard Doctor\
> \
> Detected agents:\
> ✅ OpenCode found risk: high\
> ✅ Claude Code found risk: medium\
> ✅ Codex found risk: low\
> ✅ CC Switch found risk: high\
> ❌ OpenClaw not found\
> \
> Key findings:\
> ❌ Unknown provider endpoint detected in CC Switch\
> ⚠️ OpenCode auto mode enabled\
> ⚠️ 3 MCP servers configured\
> ❌ Sensitive files found in current project\
> ✅ Codex sandbox appears enabled\
> \
> Next:\
> Run "agentguard report --format html" to generate a full report.

## **5.2 查看配置地图流程**

> agentguard map
>
> AI Coding Agent Configuration Map\
> \
> Agent Provider Base URL Type Auto Mode MCP Risk\
> OpenCode MiniMax official enabled 3 high\
> Claude Code Anthropic official disabled 2 medium\
> Codex OpenAI official partial 0 low\
> CC Switch Mixed includes unknown - - high
>
> **核心价值：用户一眼看清楚每个 Agent 连接了谁、风险在哪里。**

## **5.3 扫描 Provider 风险流程**

> agentguard provider scan

- Provider 名称、base_url、是否官方地址、是否未知中转、是否内网地址。

- 是否 OpenAI Compatible、API Key 存储位置、是否多个 Agent 复用同一个 Key。

- 是否在项目目录中发现 key、是否命中用户自定义白名单或黑名单。

> Provider Risk Report\
> \
> ❌ unknown-openai-compatible\
> Agent: OpenCode\
> Base URL: https://api.xxx-example.com/v1\
> Risk: high\
> Reason: Unknown OpenAI-compatible endpoint may receive source code and context.\
> \
> ⚠️ shared-api-key\
> Agents: Claude Code, OpenCode\
> Risk: medium\
> Reason: Same API key appears to be reused across multiple agents.\
> \
> ✅ openai\
> Agent: Codex\
> Risk: low\
> Reason: Official endpoint detected.

## **5.4 扫描 CC Switch 配置流程**

> agentguard ccswitch scan

- CC Switch 是否安装或存在配置。

- 当前管理了哪些 Agent，各 Agent 当前绑定 Provider。

- 是否存在未知 Provider、多个中转 API、明文 API Key、同一 Key 多处复用。

- 是否存在过期 Provider，切换模型后是否绕过安全基线。

> CC Switch Security Check\
> \
> Detected providers:\
> - OpenAI official\
> - MiniMax official\
> - DeepSeek official\
> - Unknown OpenAI-compatible endpoint\
> \
> Risks:\
> ❌ Unknown provider used by OpenCode\
> ⚠️ Same API key reused by two agents\
> ⚠️ Provider config contains plaintext key\
> \
> Recommendations:\
> - Mark unknown endpoint as untrusted\
> - Use separate API keys for different agents\
> - Move sensitive keys to environment variables or secure storage

## **5.5 生成 HTML 报告流程**

> agentguard report --format html

系统生成：

> ./agentguard-report.html

报告内容包括：

> 1\. 总体风险评分。
>
> 2\. 本机 Agent 配置地图。
>
> 3\. Provider 风险。
>
> 4\. CC Switch 风险。
>
> 5\. OpenCode 风险。
>
> 6\. Claude Code 基础风险。
>
> 7\. Codex 基础风险。
>
> 8\. MCP 风险。
>
> 9\. auto mode 风险。
>
> 10\. 敏感文件风险。
>
> 11\. 建议的安全基线。
>
> 12\. 可执行的修复建议。
>
> 13\. 备份和回滚说明。
>
> **报告目标：既能给开发者自己看，也能发给团队、安全人员或技术负责人。**

## **5.6 安全基线 dry-run 流程**

> agentguard baseline --profile balanced --dry-run
>
> Baseline dry-run: balanced\
> \
> Planned changes:\
> 1. OpenCode auto mode: enabled -\> ask\
> 2. Unknown provider: mark as untrusted\
> 3. Filesystem MCP: restrict to current workspace\
> 4. Sensitive file access: deny .env and private keys\
> \
> No files were modified.\
> \
> Run "agentguard apply --backup" to apply these changes.

## **5.7 diff 和回滚流程**

> agentguard diff\
> agentguard apply --backup\
> agentguard restore

系统展示配置变更差异；应用修改前自动备份；回滚时恢复到最近一次备份。

# **6. 功能需求**

## **6.1 Agent 发现模块**

发现本机已安装或已配置过的 AI Coding Agent。

- P0 支持：OpenCode、Claude Code、Codex、CC Switch。

| **字段**     | **说明**         |
|--------------|------------------|
| agent_name   | Agent 名称       |
| installed    | 是否安装         |
| config_found | 是否发现配置     |
| config_path  | 配置文件路径     |
| version      | 版本，可选       |
| provider     | 当前 Provider    |
| mcp_count    | MCP 数量         |
| auto_mode    | 是否开启自动执行 |
| risk_level   | 风险等级         |

验收标准：能在 Mac 环境下发现 P0 对象；没有安装时不能报错；配置不存在时输出明确提示；发现结果可以输出 JSON。

## **6.2 OpenCode Adapter**

深度解析 OpenCode 配置。

- 配置文件路径、Provider、model、base_url、API Key 存储方式、auto mode、MCP Server、permissions、外部目录访问、shell 或命令相关配置、是否存在高风险配置。

| **规则 ID**                  | **风险**                      | **等级** |
|------------------------------|-------------------------------|----------|
| OPENCODE_PROVIDER_UNKNOWN    | 使用未知 Provider             | high     |
| OPENCODE_PERMISSION_WILDCARD | `"*":"allow"` 或 `bash."*":"allow"`（全放行） | high |
| OPENCODE_BASH_UNRESTRICTED   | bash 无 deny 且默认 allow     | high     |
| OPENCODE_SNAPSHOT_DISABLED   | `snapshot:false`（关闭回滚能力） | medium |
| OPENCODE_AUTOUPDATE_ON       | `autoupdate:true`（参考项）   | low      |
| OPENCODE_MCP_REMOTE_UNKNOWN  | 使用未知 remote MCP           | high     |
| OPENCODE_MCP_FILESYSTEM_HOME | 文件系统 MCP 可访问 home 目录 | critical |
| OPENCODE_SECRET_IN_CONFIG    | 配置中疑似包含密钥            | high     |

> **D1 实测修订（2026-07-09）**：OpenCode **无单一 auto mode 开关**，原 `OPENCODE_AUTO_ENABLED` 作废，风险改由 `permission` 段判定（`edit`/`bash`/`webfetch` 取 `allow|ask|deny`，`bash` 可按命令模式覆盖）。Provider 判定增强：`provider.<name>.npm="@ai-sdk/openai-compatible"` + `options.baseURL` 未知域名 = OpenAI 兼容未知中转强信号。配置路径：全局 `~/.config/opencode/opencode.json` + 项目 `opencode.json` 合并；密钥独立在 `~/.local/share/opencode/auth.json`，config 内多为 `{env:}` 引用。详见 `docs/research/D1-配置路径调研.md` §5。

验收标准：能读取 OpenCode 配置；能识别 Provider 和 base_url；能识别 MCP；能识别 permission（edit/bash/webfetch）风险；能生成风险列表；能输出 HTML 报告片段。

## **6.3 CC Switch Adapter**

解析 CC Switch 配置，识别模型和 Provider 切换带来的安全风险。

> **D1 实测修订（2026-07-09）—— 配置载体变了**：当前版本用 **SQLite `~/.cc-switch/cc-switch.db`（`user_version=10`）** 存配置，**不是 JSON 文件**（旧版才是 `config.json`，需向后兼容）。解析路径：读 `providers` 表 → 按 `app_type` 从 `settings_config`(JSON blob) 取 base_url/apiKey，`is_current` 为当前激活；`provider_endpoints` 为候选 endpoint；`mcp_servers` 为 CC Switch 统一分发的 MCP。`app_type` **不可硬编码**（本机实测为 claude/codex/gemini/openclaw，随版本/用户变），须动态枚举；读 `PRAGMA user_version` 做版本兼容，未知版本降级为"仅提示不深解析"。技术依赖：Node 侧 SQLite（`better-sqlite3` 或 `node:sqlite`）。详见 `docs/research/D1-配置路径调研.md` §3。
>
> **另发现内置反向代理**：`proxy_config` 表（`app_type IN claude/codex/gemini`，默认 `127.0.0.1:15721`，带 auto_failover）。代理开启时 Agent 的 base_url 指向本地端口，**真实上游藏在 DB**——配置地图须展开"Agent → CC Switch 代理 → 真实 Provider"两跳，勿把 `127.0.0.1` 误判为本地安全地址。

- CC Switch 配置路径、管理了哪些 Agent、配置了哪些 Provider、当前激活 Provider、base_url、API Key 存储方式、是否存在未知 Provider、是否存在同一 Key 多 Agent 复用、是否存在中转 API、是否存在国内 Provider、是否支持企业白名单匹配。

| **规则 ID**               | **风险**                         | **等级** |
|---------------------------|----------------------------------|----------|
| CCSWITCH_UNKNOWN_PROVIDER | 未知 Provider                    | high     |
| CCSWITCH_UNKNOWN_BASE_URL | 未知 base_url                    | high     |
| CCSWITCH_PLAINTEXT_KEY    | 明文 API Key                     | high     |
| CCSWITCH_SHARED_KEY       | 多 Agent 复用同一 Key            | medium   |
| CCSWITCH_PROVIDER_DRIFT   | 切换后 Provider 与安全基线不一致 | medium   |
| CCSWITCH_UNUSED_PROVIDER  | 存在未使用 Provider              | low      |
| CCSWITCH_PROXY_ENABLED    | base_url 指向 CC Switch 内置代理，真实上游被隐藏 | info / medium |
| CCSWITCH_PROXY_FAILOVER_UNKNOWN | 代理 auto_failover 队列含未知 Provider | high |

> **CCSWITCH_SHARED_KEY 密钥处理例外**：复用检测必须读到 key 才能比对，与"默认不读内容"存在张力。约定：**仅在内存对 key 做哈希（如 SHA-256 前若干位）比对，绝不落盘、绝不进报告**，报告只呈现"N 个 Agent 复用同一密钥"。

验收标准：能打开 SQLite 并解析 Provider 列表（兼容旧版 config.json）；能识别未知 base_url；能识别明文 key 风险；能识别代理开启并还原真实上游；能生成 CC Switch 风险报告。

## **6.4 Claude Code 基础 Adapter**

第一版只做基础识别，不做深度 AgentShield 式扫描。

- 是否存在 Claude Code 配置、Provider 是否为 Anthropic 或代理、是否配置 MCP、是否存在权限配置、是否存在 hooks、是否存在明显高风险项、是否建议使用 AgentShield 做深度扫描。

验收标准：能识别 Claude Code 配置路径；能识别 MCP 数量；能输出基础风险；不追求 hooks 深度检测。

## **6.5 Codex 基础 Adapter**

识别 Codex 配置和基础安全状态。

- Codex 配置路径、Provider、sandbox 状态、approval policy、network access、workspace 写权限、MCP 配置（如果存在）、高风险配置。

验收标准：能识别 Codex 配置；能识别 sandbox 和网络配置；能给出基础风险建议。

## **6.6 Provider 风险识别模块**

统一识别模型 Provider 和 base_url 风险。

| **类型**                  | **说明**                    | **默认风险**  |
|---------------------------|-----------------------------|---------------|
| official                  | 官方地址                    | low           |
| domestic_official         | 国内官方模型服务            | low 或 medium |
| enterprise_internal       | 企业内部服务                | 用户自定义    |
| openai_compatible_unknown | 未知 OpenAI Compatible 地址 | high          |
| relay_or_proxy            | 中转 API                    | high          |
| local                     | 本地模型                    | low           |
| unknown                   | 未知                        | high          |

首批内置 Provider：OpenAI、Anthropic、Gemini、DeepSeek、MiniMax、Kimi、GLM、通义千问、火山方舟、百度千帆、腾讯混元、Ollama、LocalAI、自定义 OpenAI Compatible endpoint。

| **等级**  | **含义**           |
|-----------|--------------------|
| trusted   | 已知官方或用户信任 |
| internal  | 企业内部           |
| unknown   | 未知，需要确认     |
| untrusted | 用户标记不可信     |
| risky     | 明显高风险配置     |

验收标准：能识别官方和未知 endpoint；能支持用户自定义白名单；能在报告中解释风险原因；不误伤企业内部自建 Provider。

## **6.7 敏感文件扫描模块**

扫描当前项目目录中是否存在可能被 Agent 读取或发送的敏感文件。

默认扫描对象：.env、.env.local、.npmrc、.pypirc、id_rsa、id_ed25519、\*.pem、\*.key、kubeconfig、AWS credentials、GCP credentials、Azure credentials、database config、token、secret、private key。

输出内容：文件路径、风险等级、是否在当前 Agent 可访问范围内、建议动作。

验收标准：能扫描当前目录；默认不读取敏感文件内容，只识别文件名和路径；对疑似密钥内容扫描必须做脱敏显示；报告中不得输出完整密钥。

## **6.8 MCP 风险模块**

识别 MCP Server 的基础风险。

- MCP Server 名称、本地 MCP 或 remote MCP、启动命令、是否注入环境变量、是否访问文件系统、是否执行命令、是否访问数据库、是否访问浏览器、是否访问内部系统接口、是否使用未知 remote URL、tool description 是否存在高风险关键词。

| **规则 ID**                | **风险**                      | **等级** |
|----------------------------|-------------------------------|----------|
| MCP_REMOTE_UNKNOWN         | 未知 remote MCP               | high     |
| MCP_FILESYSTEM_HOME        | 可访问 home 目录              | critical |
| MCP_SHELL_EXEC             | 暴露命令执行能力              | high     |
| MCP_DATABASE_ACCESS        | 暴露数据库访问                | high     |
| MCP_BROWSER_ACCESS         | 暴露浏览器访问                | medium   |
| MCP_ENV_SECRET             | MCP 配置中注入密钥            | high     |
| MCP_TOOL_INJECTION_PATTERN | 工具描述疑似 Prompt Injection | medium   |

验收标准：能识别 OpenCode 中 MCP 配置；能识别 Claude Code 中 MCP 基础配置；能识别高风险 MCP 类型；不要求第一版做完整 tool poisoning 分析。

## **6.9 报告模块**

生成 HTML 报告和 JSON 输出。

报告结构：报告标题、扫描时间、总体风险评分、Agent 配置地图、Provider 风险列表、CC Switch 风险、OpenCode 风险、Claude Code 基础风险、Codex 基础风险、MCP 风险、敏感文件风险、安全基线建议、修复建议、dry-run 变更预览、backup 和 restore 说明。

报告要求：中文优先；关键风险要有解释；不暴露完整密钥；支持导出 HTML；支持 JSON 供后续自动化使用。

验收标准：能生成 HTML 文件；HTML 可离线打开；报告中有清晰风险等级；报告中有配置地图表格；报告中有下一步建议。

## **6.10 备份和回滚模块**

任何配置修改前都必须备份。

> agentguard backup\
> agentguard diff\
> agentguard apply --backup\
> agentguard restore

备份内容：原始配置文件、备份时间、修改原因、修改前后 diff、rollback id。

验收标准：修改前自动生成备份；支持查看备份列表；支持恢复最近一次备份；恢复失败要提示原因；不允许无备份直接修改配置。

# **7. CLI 命令设计**

### **7.x \`agentguard doctor\`**

> agentguard doctor

快速体检本机 AI Coding Agent 环境。输出已发现 Agent、Provider、MCP 数量、风险摘要和下一步建议。

### **7.x \`agentguard map\`**

> agentguard map

生成多 Agent 配置地图。输出 Agent、Provider、base_url 类型、auto mode、MCP、风险等级。

### **7.x \`agentguard scan\`**

> agentguard scan

扫描全部已发现 Agent。也支持 --target opencode、--target claude-code、--target codex。

### **7.x \`agentguard provider scan\`**

> agentguard provider scan

扫描 Provider 和中转 API 风险。

### **7.x \`agentguard ccswitch scan\`**

> agentguard ccswitch scan

扫描 CC Switch 配置风险。

### **7.x \`agentguard baseline --profile safe --dry-run\`**

> agentguard baseline --profile safe --dry-run

生成安全基线建议。第一版默认只 dry-run，不直接修改。

### **7.x \`agentguard diff\`**

> agentguard diff

展示即将修改的配置差异。

### **7.x \`agentguard apply --backup\`**

> agentguard apply --backup

应用修改，并自动备份。第一版可以只支持 OpenCode 的有限修改。

### **7.x \`agentguard restore\`**

> agentguard restore

回滚配置。

### **7.x \`agentguard report --format html\`**

> agentguard report --format html

生成 HTML 报告。也支持 --format json。

# **8. 风险等级设计**

| **等级** | **说明**                                       |
|----------|------------------------------------------------|
| critical | 可能导致密钥泄露、任意命令执行、大范围文件访问 |
| high     | 明显高风险配置，需要优先处理                   |
| medium   | 存在安全隐患，需要确认                         |
| low      | 风险较低，建议优化                             |
| info     | 信息提示                                       |

| **分数** | **等级** |
|----------|----------|
| 0-20     | 低风险   |
| 21-50    | 中风险   |
| 51-80    | 高风险   |
| 81-100   | 严重风险 |

第一版也可以使用 A 到 F，但建议先用风险分数，便于解释。

# **9. 安全基线设计**

## **9.1 Safe Profile**

适用场景：小白用户、高敏感项目、企业代码、不熟悉 Agent 权限的用户。

- 禁止未知 Provider。

- 禁止未知中转 API。

- auto mode 默认关闭。

- shell 默认 ask。

- 高危命令 deny。

- 敏感文件 deny。

- MCP remote ask。

- 文件系统 MCP 限制在当前项目。

- 所有修改前强制备份。

## **9.2 Balanced Profile**

适用场景：日常开发、有一定经验的用户、小团队。

- 官方 Provider 允许。

- 未知 Provider 警告。

- auto mode 需要通过安全检查。

- 当前项目内读写允许。

- 高危命令 ask 或 deny。

- 敏感文件 deny。

- MCP 高风险工具 ask。

- 修改前备份。

## **9.3 Power User Profile**

适用场景：高级用户、安全意识较强、追求效率。

- 允许更多自动化。

- 保留高危提醒。

- 保留备份和回滚。

- 对未知 Provider 提示但不强阻断。

- 支持用户自定义规则。

## **9.4 Enterprise Profile**

MVP 只设计，不完整实现。

- Provider 白名单。

- MCP 白名单。

- 禁止未知中转。

- 团队统一配置模板。

- 审计报告。

- 私有化扩展接口。

# **10. 数据结构设计**

## **10.1 AgentConfig**

> {\
> "agent": "opencode",\
> "installed": true,\
> "config_found": true,\
> "config_path": "/path/to/config",\
> "provider": "minimax",\
> "base_url": "https://api.minimaxi.com",\
> "model": "MiniMax-M2",\
> "auto_mode": true,\
> "mcp_servers": \[\],\
> "permissions": \[\],\
> "risk_score": 78,\
> "risk_level": "high"\
> }

## **10.2 ProviderRisk**

> {\
> "provider": "custom-openai-compatible",\
> "base_url": "https://unknown.example.com",\
> "trust_level": "unknown",\
> "risk_level": "high",\
> "reason": "Unknown OpenAI-compatible endpoint may receive source code and context.",\
> "agents": \["opencode"\]\
> }

## **10.3 RiskFinding**

> {\
> "id": "CCSWITCH_UNKNOWN_PROVIDER",\
> "category": "provider",\
> "severity": "high",\
> "title": "Unknown provider endpoint detected",\
> "description": "OpenCode is configured to use an unknown OpenAI-compatible endpoint.",\
> "evidence": {\
> "agent": "opencode",\
> "config_path": "/path/to/config",\
> "base_url": "https://unknown.example.com"\
> },\
> "recommendation": "Mark this provider as trusted only if it is your internal endpoint.",\
> "fixable": false\
> }

## **10.4 ConfigChange**

> {\
> "file": "/path/to/config",\
> "change_type": "modify",\
> "old_value": "auto_mode: true",\
> "new_value": "auto_mode: false",\
> "reason": "Auto mode is risky when sensitive files exist in the current project.",\
> "backup_id": "backup-2026-xx-xx"\
> }

# **11. MVP 验收标准**

## **11.1 功能验收**

> 1\. 能安装并运行 CLI。
>
> 2\. 能执行 agentguard doctor。
>
> 3\. 能发现 OpenCode、CC Switch、Claude Code、Codex 中至少两个。
>
> 4\. 能解析 OpenCode 配置。
>
> 5\. 能解析 CC Switch Provider 配置。
>
> 6\. 能识别未知 Provider。
>
> 7\. 能扫描当前项目敏感文件。
>
> 8\. 能识别 MCP 基础风险。
>
> 9\. 能生成 HTML 报告。
>
> 10\. 能输出 JSON。
>
> 11\. 能 dry-run 安全基线。
>
> 12\. 能展示 diff。
>
> 13\. 能 backup 和 restore。
>
> 14\. 默认不主动修改配置。

## **11.2 用户体验验收**

用户在 10 分钟内应该能完成：

> npm install -g agentguard\
> agentguard doctor\
> agentguard report --format html

并能看懂：当前有哪些 Agent、每个 Agent 用哪个 Provider、哪些 Provider 风险高、哪些配置建议修改、如何备份和回滚。

## **11.3 差异化验收**

| **验收点**                     | **是否必须** |
|--------------------------------|--------------|
| 多 Agent 配置地图              | 必须         |
| CC Switch 安全检查             | 必须         |
| Provider 风险识别              | 必须         |
| OpenCode 深度适配              | 必须         |
| 中文 HTML 报告                 | 必须         |
| dry-run、diff、backup、restore | 必须         |
| Claude Code 深度 hooks 检测    | 不必须       |
| 大规模漏洞规则库               | 不必须       |

# **12. 开发排期**

| **阶段** | **目标** | **交付** |
|----|----|----|
| 第 1 周：技术 Spike 和基础框架 | CLI 框架、adapter 架构、Agent discovery、OpenCode 配置解析、CC Switch 配置解析初版 | agentguard doctor；agentguard map；基础 JSON 输出 |
| 第 2 周：风险规则和报告 | Provider 风险规则、敏感文件扫描、MCP 基础风险、HTML 报告初版 | agentguard scan；agentguard provider scan；agentguard report --format html |
| 第 3 周：基线和可信修改流程 | safe 和 balanced profile、dry-run、diff、backup、restore | agentguard baseline --profile balanced --dry-run；agentguard diff；agentguard apply --backup；agentguard restore |
| 第 4 周：打磨和 Demo | 完善 README、示例配置、Demo 项目、演示视频、找 5 个用户试用 | AgentGuard MVP v0.1；README 中文和英文；Demo HTML 报告；试用反馈记录 |

# **13. MVP 成功指标**

## **13.1 内部成功标准**

> 1\. 4 周内完成可运行 Demo。
>
> 2\. 至少支持 OpenCode 和 CC Switch。
>
> 3\. 至少支持 Claude Code 或 Codex 的基础识别。
>
> 4\. 能生成可分享 HTML 报告。
>
> 5\. 至少 3 个真实用户愿意试用。
>
> 6\. 技术合伙人认可后续扩展性。

## **13.2 开源发布后成功标准**

| **指标**               | **目标** |
|------------------------|----------|
| GitHub Stars           | 100+     |
| 有效 Issue             | 5+       |
| 真实试用用户           | 20+      |
| 用户反馈配置地图有价值 | 5+       |
| 团队试点意向           | 1+       |
| Provider 规则贡献      | 1+       |

这些不是硬性成败标准，但可以判断方向是否继续加码。

# **14. 主要风险和应对**

## **风险 1：和 AgentShield 定位混淆**

- README 第一屏明确：不是 Claude Code scanner，而是多 Agent 安全配置中心。

- 主打 CC Switch、Provider、OpenCode、配置地图。

- 不和 AgentShield 比规则数量。

## **风险 2：第一版范围太大**

- 只深度做 OpenCode 和 CC Switch。

- Claude Code 和 Codex 只做基础识别。

- 不做运行时拦截。

- 不做企业控制台。

## **风险 3：用户不敢让工具修改配置**

- 默认只读。

- 修改前 dry-run。

- 展示 diff。

- 自动 backup。

- 支持 restore。

- 报告里解释每项修改。

## **风险 4：Provider 风险判断不准**

- 不武断判断。

- 使用 trust level。

- 支持用户自定义白名单。

- 未知中转只提示风险。

- 企业内部 Provider 可标记为 internal。

## **风险 5：开源传播不够有吸引力**

- 用具体场景传播：你的 Agent 正在把代码发给谁？

- 用 CC Switch 切模型后，安全配置还有效吗？

- OpenCode 接国内模型时如何避免泄密？

- auto mode 到底什么时候可以放心开？

- Claude Code、OpenCode、Codex 哪个当前更安全？

# **15. 技术合伙人需要确认的问题**

> 1\. CC Switch 配置文件能否稳定解析？ ✅ **已验证（D1）**：可解析，但为 **SQLite（schema v10）非文本文件**，需 SQLite 依赖 + 版本兼容策略，且含内置代理层。
>
> 2\. OpenCode 配置结构是否支持深度分析？ ✅ **已验证（D1，v1.17.16 实测）**：支持，`provider`/`permission`/`mcp` 均可解析；注意无单一 auto mode 开关。
>
> 3\. Claude Code 和 Codex 基础配置路径是否容易发现？ ✅ **已验证（D1）**：Claude `~/.claude/`+`~/.claude.json`（优先 `CLAUDE_CONFIG_DIR`）；Codex `~/.codex/config.toml`（密钥在 `auth.json`）。
>
> 4\. Provider 识别规则是否可以快速实现？
>
> 5\. HTML 报告是否可以 1 周内做出可用版本？
>
> 6\. backup、diff、restore 是否存在跨平台难点？
>
> 7\. TypeScript 是否适合作为第一版技术栈？
>
> 8\. 4 周内能否完成 MVP Demo？

# **16. 当前结论**

AgentGuard MVP v0.2 的核心不是做一个安全漏洞扫描器，而是做：

> **面向多 Agent、多模型、多 Provider 的安全配置中心。**

第一版最小闭环是：

> 发现本机 Agent\
> ↓\
> 识别 Provider 和中转 API\
> ↓\
> 解析 OpenCode 和 CC Switch 配置\
> ↓\
> 识别 auto mode、MCP、敏感文件和危险配置\
> ↓\
> 生成配置地图和 HTML 报告\
> ↓\
> 通过 dry-run、diff、backup、restore 建立用户信任

MVP 成功的关键不是规则数量，而是三个体验：

> 1\. 用户一眼看清楚自己当前 Agent 环境。
>
> 2\. 用户知道哪些 Provider、MCP、auto mode 和敏感文件存在风险。
>
> 3\. 用户相信这个工具不会乱改配置，因为所有修改都可预演、可解释、可备份、可回滚。
>
> **第一阶段建议正式进入技术 Spike 和 Demo 开发准备。**
