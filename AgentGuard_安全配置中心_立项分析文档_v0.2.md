**AgentGuard**

> 历史立项文档：用于保留早期定位与决策背景，不代表当前功能承诺。
> 当前实际能力以 [`docs/product-capabilities.md`](docs/product-capabilities.md) 为准。

**面向多 Agent、多模型、多 Provider 的安全配置中心**

项目立项分析文档 v0.2

内部讨论稿 \| 2026-07-08

**核心定位**

AgentGuard 不是又一个 AI Agent 漏洞扫描器，而是面向多 Agent、多模型、多 Provider 混用场景的安全配置治理入口。

它帮助个人开发者、小团队和企业二开团队统一看清、配置、迁移、对齐、备份、回滚和治理 AI Coding Agent 的安全状态。

| **关键结论** | **说明** |
|----|----|
| 项目定位 | 从“配置风险扫描器”升级为“安全配置中心”，重点做配置治理、迁移、对齐、备份和回滚。 |
| 首批对象 | OpenCode、CC Switch、Claude Code、Codex。OpenCode 和 CC Switch 做深度适配，Claude Code 和 Codex 先做基础识别。 |
| 核心差异 | 避开 AgentShield 强项，不硬拼单 Agent 扫描规则数量，转向多 Agent、多 Provider、国内中转 API 和配置迁移。 |
| MVP 形态 | CLI + HTML 报告。第一版不做桌面端、不做运行时网关、不做企业控制台。 |
| 信任机制 | 默认只读扫描；所有修改必须支持 dry-run、diff、backup、restore。 |

# 目录

1\. 项目背景

2\. 项目定位

3\. 为什么要调整方向

4\. 与 AgentShield 的差异化

5\. 目标用户

6\. 用户调研信号

7\. 核心问题定义

8\. 产品核心能力

9\. 第一版 MVP

10\. 技术架构建议

11\. 开源策略

12\. 商业化路径

13\. 90 天路线图

14\. 当前风险

15\. 下一步行动

16\. 当前结论

# 1. 项目背景

AI Coding Agent 正在快速进入开发者日常工作流。用户不再只使用一个工具，也不再只绑定一个模型。真实情况是，很多开发者和小团队会同时使用 Claude Code、OpenAI Codex、OpenCode、OpenClaw、Cursor、Gemini CLI、Cline、Roo Code、Continue、国内大厂 AI 编程工具，以及各种基于 OpenAI Compatible API 的国内模型或中转服务。

与此同时，模型供应商也在快速变化。海外模型、国内模型、中转 API、企业内部模型服务会同时出现在同一台开发机器、同一个团队，甚至同一个项目里。

- 海外模型与官方服务：OpenAI、Anthropic、Google Gemini 等。

- 国内模型与平台：DeepSeek、MiniMax、Kimi、GLM、通义千问、火山方舟、百度千帆、腾讯混元等。

- 接入方式：官方 API、OpenAI Compatible endpoint、中转 API、企业内部模型服务、本地代理。

这带来一个新的问题：开发者和团队面对的不再是单一 Agent 的安全问题，而是多 Agent、多模型、多 Provider、多配置文件、多 MCP、多密钥、多权限策略同时存在的复杂环境。

在这种环境里，用户真正痛苦的不只是“某个配置是否有漏洞”，而是：

- 我现在机器上到底装了哪些 Agent？

- 每个 Agent 使用的是哪个模型和 Provider？

- 哪些 Agent 开启了 auto mode？

- 哪些工具拥有文件读写、命令执行、MCP、网络访问能力？

- 哪些 API Key 散落在配置文件、环境变量或项目目录里？

- 我从 Claude Code 切到 OpenCode 后，安全策略是否还一致？

- 我通过 CC Switch 切模型后，安全边界是否发生变化？

- 公司内部要统一使用 OpenCode 或 Codex，如何制定安全基线？

- 如果工具自动修改配置，如何确保能看懂、能回滚、不会影响正常使用？

因此，AgentGuard 的新定位不再是“又一个 AI Agent 配置扫描器”，而是 AI Coding Agent 时代的安全配置中心。

# 2. 项目定位

| **项目** | **内容** |
|----|----|
| 中文定位 | AgentGuard：面向多 Agent、多模型、多 Provider 的安全配置中心。 |
| 英文定位 | AgentGuard: Security Configuration Center for AI Coding Agents. |
| 一句话说明 | 帮助开发者、小团队和企业二开团队统一管理 AI Coding Agent 的安全配置、模型 Provider、MCP、敏感文件、auto mode、权限策略、备份回滚和安全基线。 |
| 中文口号 | 让 AI Coding Agent 好用，也可控。 |
| 英文口号 | See, configure, and govern your AI coding agents safely. |

AgentGuard 的重点不是替代具体 Agent 工具，也不是替代模型切换工具，而是站在这些工具之上，提供一个统一的安全配置视图和治理入口。

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr>
<th><p>CC Switch 解决：这个 Agent 用哪个模型？</p>
<p>AgentShield 解决：这个 Agent 配置里有没有明显风险？</p>
<p>AgentGuard 解决：多 Agent、多模型、多 Provider 混用时，安全配置是否可见、可控、可迁移、可回滚、可治理？</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 3. 为什么要调整方向

## 3.1 原方向的问题

原来的方向是“AgentGuard：AI Coding Agent 配置风险扫描器”。这个方向本身成立，但容易和现有项目正面重合。尤其是 AgentShield 这类项目已经在做 AI Agent 配置安全审计，覆盖 Claude Code 配置、secrets、permissions、hooks、MCP、HTML 报告、GitHub Action、auto-fix 等能力。

如果 AgentGuard 继续只做配置扫描、secrets 检测、MCP 风险检测、权限风险检测、HTML 报告和 auto-fix，就会变成 AgentShield 的相似项目，差异化不够强。

## 3.2 新方向的核心变化

AgentGuard 不应该只回答“你的 Agent 配置有没有风险”，而应该回答“你的多 Agent、多模型、多 Provider 环境现在处于什么安全状态，如何安全配置、迁移、对齐、备份、回滚和治理”。

| **原方向**        | **新方向**                           |
|-------------------|--------------------------------------|
| 发现风险          | 管理安全配置状态                     |
| Scanner           | Security Configuration Center        |
| 单 Agent 配置审计 | 多 Agent、多 Provider 配置治理       |
| 扫描报告          | 配置地图、基线、迁移、diff、回滚     |
| 偏安全专家        | 同时面向开发者、小团队、企业二开团队 |

# 4. 与 AgentShield 的差异化

## 4.1 AgentShield 的优势

AgentShield 已经具备较完整的安全扫描器能力，尤其偏 Claude Code 生态，覆盖 Claude Code 配置扫描、secrets 检测、permission 风险、hook 注入风险、MCP Server 风险、agent prompt injection 风险、HTML 报告、JSON 输出、GitHub Action、auto-fix、安全基线初始化等。

这说明“AI Agent 配置安全审计”方向已经被验证，但也意味着 AgentGuard 不能做一个低配版 AgentShield。

## 4.2 AgentGuard 不主打什么

- 不主打更大的规则数量。

- 不主打更深的 Claude Code hook 检测。

- 不主打更复杂的 vulnerability scanner。

- 不主打更全面的 GitHub App。

- 不主打更强的单 Agent 安全审计。

## 4.3 差异化对比

| **维度** | **AgentShield** | **AgentGuard** |
|----|----|----|
| 核心定位 | AI Agent 安全扫描器 | 多 Agent 安全配置中心 |
| 主生态 | 偏 Claude Code | Claude Code、OpenCode、Codex、OpenClaw、CC Switch |
| 核心动作 | scan，detect，fix | discover，compare，configure，migrate，baseline，rollback |
| 用户心智 | 发现漏洞 | 看清配置状态并安全治理 |
| 国内场景 | 不是重点 | 重点支持 |
| 多 Provider | 非核心叙事 | 核心叙事 |
| 中转 API 风险 | 非核心 | 重点支持 |
| CC Switch 联动 | 不突出 | 重点支持 |
| OpenCode 二开 | 非主线 | 主线之一 |
| 配置迁移 | 不突出 | 重点能力 |
| 中文体验 | 非重点 | 重点支持 |

新的差异化一句话：AgentShield 更像是“AI Agent 安全扫描器”，AgentGuard 要做“AI Coding Agent 的安全配置治理中心”。

# 5. 目标用户

## 5.1 个人开发者

这类用户可能同时使用多个 Agent 工具。他们不想成为 Agent 安全专家，但希望知道现在这样用是否安全。

- 哪个 Agent 当前最安全？

- auto mode 能不能开？

- API Key 是否散落在多个配置文件里？

- 哪些工具会读写本地文件？

- 哪些工具会调用命令？

- 切换模型后是否仍然安全？

## 5.2 AI Coding Agent 重度用户

他们通常使用 Claude Code、Codex、OpenCode、OpenClaw、CC Switch 等工具，希望像管理模型一样管理 Agent 安全配置。

- 多个 Agent 的配置如何统一管理。

- 不同工具的安全能力如何比较。

- 如何从 Claude Code 迁移到 OpenCode 或 Codex。

- 如何把一套安全策略映射到不同 Agent。

## 5.3 小团队和创业团队

这类用户可能没有专职安全团队，但已经开始在团队内部使用 AI Coding Agent。

- 团队成员配置不一致。

- 有人开了高风险 auto mode。

- 有人使用不可信 Provider 或中转 API。

- 有人把密钥写进 Agent 配置。

- 不知道如何制定统一安全基线。

## 5.4 企业内部二开团队

这类用户可能基于 OpenCode、Codex、OpenClaw、Claude Code 做内部改造，需要一个安全配置治理组件。

- 统一 Agent 安全基线。

- 控制内部模型和外部 Provider。

- 识别不可信中转 API。

- 管理 MCP Server 风险。

- 向安全部门提交评估报告。

## 5.5 安全团队和 AI 安全评估人员

他们需要一个能看清 AI Coding Agent 使用风险的轻量工具，而不是一上来就部署企业级平台。

# 6. 用户调研信号

基于前期问卷调研，当前信号可以概括为以下几点。

| **调研信号** | **对产品方向的影响** |
|----|----|
| 用户并非只使用单一 Agent | 支持从单工具扫描器升级为多 Agent 安全配置中心。 |
| CC Switch 使用基础明显 | 说明配置切换和统一入口是真实需求，可以借鉴 CC Switch 的产品路径。 |
| 用户担心的不只是漏洞 | 误删文件、执行危险命令、读取密钥、安装恶意依赖、外发代码等都是配置和使用方式问题。 |
| 用户最在意信任机制 | dry-run、diff、backup、restore、可读解释必须成为核心能力。 |
| 商业化信号偏团队和企业 | 开源版做个人冷启动，团队版和企业版做基线、私有化、策略中心、审计报告。 |

这些信号说明，AgentGuard 的机会不在于只做一个更大的扫描器，而在于成为多 Agent、多模型、多 Provider 混用环境下的安全配置治理入口。

# 7. 核心问题定义

AgentGuard 要解决的问题不是“某个 Agent 配置里有没有安全漏洞”，而是在多 Agent、多模型、多 Provider 同时存在的环境里，如何让用户看清、配置、对齐、迁移和治理 AI Coding Agent 的安全状态。

| **问题** | **说明** |
|----|----|
| 看不清 | 用户不知道当前机器上到底有哪些 Agent、模型、Provider、MCP、权限和密钥配置。 |
| 配不准 | 每个 Agent 配置格式不同，权限模型不同，auto mode、安全策略、MCP 配置方式不同。 |
| 切换混乱 | 通过 CC Switch 或手工切换模型后，Provider、base_url、API key 和安全边界可能发生变化。 |
| 迁移困难 | 从 Claude Code 切换到 OpenCode 或 Codex 时，原来的安全策略无法自动映射。 |
| 团队不一致 | 小团队和企业二开团队缺少统一安全基线，不同成员配置差异很大。 |
| 不敢修复 | 用户担心安全工具改坏配置，所以即使发现问题，也不敢一键修复。 |

# 8. 产品核心能力

## 8.1 多 Agent 发现

AgentGuard 首先要能发现本机安装或配置过哪些 Agent，例如 Claude Code、OpenCode、Codex、OpenClaw、Gemini CLI、Cline、Roo Code、Continue、CC Switch 等。输出不是简单列表，而是配置地图。

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr>
<th><p>本机发现的 AI Coding Agent：</p>
<p>Claude Code</p>
<p>配置状态：已发现</p>
<p>Provider：Anthropic</p>
<p>权限风险：中</p>
<p>MCP：2 个</p>
<p>Auto Mode：未开启</p>
<p>OpenCode</p>
<p>配置状态：已发现</p>
<p>Provider：MiniMax</p>
<p>权限风险：高</p>
<p>MCP：3 个</p>
<p>Auto Mode：开启</p>
<p>Codex</p>
<p>配置状态：已发现</p>
<p>Provider：OpenAI</p>
<p>Sandbox：开启</p>
<p>网络访问：关闭</p>
<p>权限风险：低</p>
<p>CC Switch</p>
<p>配置状态：已发现</p>
<p>Provider 数量：5</p>
<p>未知 Provider：1</p>
<p>明文 Key 风险：2</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 8.2 多 Provider 安全检查

多 Provider 安全检查是新方向的核心能力之一。它关注模型连接和中转链路，而不只是 Agent 本身。

- Provider 名称和 base_url。

- 是否官方地址、企业内网地址、未知中转 API 或 OpenAI Compatible endpoint。

- API Key 存放位置，是否被多个 Agent 复用。

- 是否把 key 写入项目目录。

- 是否允许代码或上下文发送到外部。

国内重点支持 OpenAI、Anthropic、Gemini、DeepSeek、MiniMax、Kimi、GLM、通义、火山方舟、百度千帆、腾讯混元、企业内部模型、自定义 OpenAI Compatible endpoint。

## 8.3 CC Switch 配置安全检查

这是 AgentGuard 的重要差异点。CC Switch 解决模型和 Agent 配置切换问题，AgentGuard 则检查切换之后安全边界是否仍然可控。

- CC Switch 管理了哪些 Agent。

- 每个 Agent 当前绑定哪个 Provider。

- 是否存在未知 Provider 或高风险 base_url。

- 是否配置了多个中转 API。

- API Key 是否集中或分散。

- 切换模型后是否绕过原 Agent 的安全策略。

- 是否存在过期或未使用 Provider。

- 是否存在同一密钥跨多个 Agent 使用。

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr>
<th><p>CC Switch 配置风险：</p>
<p>高风险：OpenCode 当前使用 unknown-provider.example.com</p>
<p>风险原因：未知中转 API，可能导致代码和上下文外发</p>
<p>中风险：Claude Code 和 OpenCode 复用同一个 API Key</p>
<p>风险原因：密钥泄露影响范围扩大</p>
<p>建议：</p>
<p>将 unknown provider 标记为 untrusted</p>
<p>为不同 Agent 使用独立 API Key</p>
<p>为企业项目启用 approved provider whitelist</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 8.4 Agent 安全配置对比

AgentGuard 应该能比较不同 Agent 的安全状态，让用户判断哪个 Agent 当前更适合在这个项目里使用。

| **Agent** | **Provider** | **Auto Mode** | **MCP** | **文件权限** | **命令权限** | **整体风险** |
|----|----|----|----|----|----|----|
| Claude Code | Anthropic | 关闭 | 2 | 中 | 中 | 中 |
| OpenCode | MiniMax | 开启 | 3 | 高 | 高 | 高 |
| Codex | OpenAI | 部分开启 | 0 | 低 | 中 | 低 |
| OpenClaw | DeepSeek | 开启 | 1 | 中 | 高 | 中高 |

## 8.5 安全基线生成

| **Profile** | **适用对象** | **核心策略** |
|----|----|----|
| Safe | 小白、高敏感项目、企业代码仓库 | 禁止未知 Provider；禁止未知中转 API；禁止读取敏感文件；shell 默认 ask；高危命令 deny；MCP 默认 ask；auto mode 默认关闭；所有修改先备份。 |
| Balanced | 日常开发 | 当前项目内读写允许；中高危命令 ask；敏感文件 deny；MCP 高风险工具 ask；已知 Provider 允许；未知 Provider 警告；auto mode 通过安全检查后开启。 |
| Power User | 高级用户 | 保留更多自由度；输出风险提示；保留备份和回滚；高危操作强提醒；支持自定义规则。 |
| Enterprise | 团队和企业二开 | Provider 白名单；MCP Server 白名单；Agent 权限模板；禁止敏感文件访问；禁止未知中转 API；统一报告格式；支持团队基线导出。 |

## 8.6 安全配置迁移

安全配置迁移是 AgentGuard 的重要差异能力。用户从一个 Agent 切换到另一个 Agent 时，AgentGuard 帮助迁移安全策略。

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr>
<th><p>agentguard migrate --from claude-code --to opencode --profile balanced</p>
<p>安全策略迁移建议：</p>
<p>Claude Code permission 规则已映射为 OpenCode permission 建议</p>
<p>MCP remote server 规则已映射为 ask</p>
<p>危险 bash 命令已映射为 deny</p>
<p>敏感文件访问规则已映射为 deny</p>
<p>auto mode 建议保持关闭，直到完成项目风险扫描</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

支持迁移方向包括 Claude Code 到 OpenCode、OpenCode 到 Codex、Codex 到 OpenCode、OpenCode 到 OpenClaw、CC Switch Provider 配置到 AgentGuard 安全策略。

## 8.7 配置备份、diff、dry-run 和回滚

这是用户信任的核心。任何配置变更都必须支持预演、差异展示、自动备份和回滚。

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr>
<th><p>agentguard fix --dry-run</p>
<p>agentguard diff</p>
<p>agentguard apply --backup</p>
<p>agentguard restore</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

原则：默认只读扫描，默认不自动修改。所有修改必须可预演、可解释、可备份、可回滚。

## 8.8 中文 HTML 报告

AgentGuard 要输出适合国内用户和团队沟通的报告。报告既要让开发者看懂，也要让安全人员和技术管理者能快速判断风险。

- 本机 Agent 配置地图。

- 多 Provider 风险。

- CC Switch 配置风险。

- 各 Agent 安全评分。

- Auto Mode 风险。

- MCP 风险。

- 敏感文件风险。

- 危险命令风险。

- 安全基线建议。

- 配置修改建议。

- 可回滚备份记录。

# 9. 第一版 MVP

## 9.1 MVP 名称与目标

MVP 名称：AgentGuard MVP：多 Agent 安全配置中心 v0.1。

MVP 目标是在 2 到 4 周内做出一个可演示、可试用、可传播的 CLI 工具，完成多 Agent 发现、多 Provider 配置识别、CC Switch 配置检查、OpenCode 深度适配、Claude Code 和 Codex 基础识别、敏感文件扫描、auto mode 风险判断、MCP 基础风险检查、HTML 报告，以及 backup、diff、dry-run、restore。

## 9.2 MVP 支持范围

| **优先级** | **支持对象**                                              |
|------------|-----------------------------------------------------------|
| 第一优先级 | OpenCode、CC Switch、Claude Code 基础扫描、Codex 基础扫描 |
| 第二优先级 | OpenClaw、Gemini CLI、Cline、Roo Code                     |
| 第三优先级 | Cursor、Continue、国内大厂 AI 编程工具                    |

## 9.3 MVP 命令设计

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr>
<th><p>agentguard doctor</p>
<p>agentguard map</p>
<p>agentguard scan</p>
<p>agentguard scan --target opencode</p>
<p>agentguard provider scan</p>
<p>agentguard ccswitch scan</p>
<p>agentguard baseline --profile balanced --dry-run</p>
<p>agentguard apply --backup</p>
<p>agentguard diff</p>
<p>agentguard restore</p>
<p>agentguard report --format html</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 9.4 MVP 不做事项

- 运行时拦截。

- 完整企业控制台。

- SIEM、DLP、IAM 集成。

- GitHub App。

- 完整 GitHub Action。

- 桌面 App。

- VS Code 插件。

- 全量漏洞扫描器。

- 大规模规则库。

- 企业多租户。

- 实时 Agent 行为监控。

# 10. 技术架构建议

## 10.1 架构原则

AgentGuard 必须采用 adapter 架构，避免被某一个 Agent 工具绑定。

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr>
<th><p>agentguard</p>
<p>core</p>
<p>discovery</p>
<p>config-parser</p>
<p>provider-analyzer</p>
<p>risk-engine</p>
<p>baseline-engine</p>
<p>diff-engine</p>
<p>backup-manager</p>
<p>report-generator</p>
<p>adapters</p>
<p>claude-code</p>
<p>opencode</p>
<p>codex</p>
<p>openclaw</p>
<p>cc-switch</p>
<p>gemini-cli</p>
<p>cline</p>
<p>roo-code</p>
<p>rules</p>
<p>provider</p>
<p>secret</p>
<p>mcp</p>
<p>permission</p>
<p>command</p>
<p>auto-mode</p>
<p>config-drift</p>
<p>profiles</p>
<p>safe</p>
<p>balanced</p>
<p>power-user</p>
<p>enterprise</p>
<p>reports</p>
<p>html</p>
<p>markdown</p>
<p>json</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 10.2 核心数据模型

第一版至少需要三个核心对象：Agent 配置对象、Provider 风险对象、配置变更对象。

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr>
<th><p>Agent 配置对象：</p>
<p>{</p>
<p>"agent": "opencode",</p>
<p>"config_path": "/path/to/config",</p>
<p>"provider": "minimax",</p>
<p>"base_url": "https://api.example.com",</p>
<p>"model": "MiniMax-M2",</p>
<p>"auto_mode": true,</p>
<p>"mcp_servers": [],</p>
<p>"permissions": [],</p>
<p>"risk_score": 78</p>
<p>}</p>
<p>Provider 风险对象：</p>
<p>{</p>
<p>"provider": "custom-openai-compatible",</p>
<p>"base_url": "https://unknown.example.com",</p>
<p>"trust_level": "unknown",</p>
<p>"risk": "high",</p>
<p>"reason": "Unknown endpoint may receive source code and context."</p>
<p>}</p>
<p>配置变更对象：</p>
<p>{</p>
<p>"file": "/path/to/config",</p>
<p>"change_type": "modify",</p>
<p>"old_value": "auto_mode: true",</p>
<p>"new_value": "auto_mode: false",</p>
<p>"reason": "Auto mode is risky when sensitive files exist in the project.",</p>
<p>"rollback_id": "backup-2026-xx-xx"</p>
<p>}</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 10.3 技术栈建议

第一版建议使用 TypeScript 加 Node.js。原因是它适合 CLI、JSON/YAML/TOML 配置解析、跨平台、与 Agent 生态结合，并方便未来做本地 Web UI。备选方案是 Go，优势是单文件分发体验更好，但早期开发和生态适配可能不如 TypeScript 快。

# 11. 开源策略

## 11.1 README 第一屏

README 必须让用户 30 秒看懂。

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr>
<th><p>AgentGuard is a security configuration center for AI coding agents.</p>
<p>It discovers Claude Code, OpenCode, Codex, OpenClaw and CC Switch configurations,</p>
<p>maps which models and providers they use, detects risky permissions, unknown API endpoints,</p>
<p>unsafe MCP servers, exposed secrets, dangerous auto mode settings,</p>
<p>and helps you apply safe baselines with dry-run, diff, backup and rollback.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr>
<th><p>AgentGuard 是面向 AI Coding Agent 的安全配置中心。</p>
<p>它可以发现 Claude Code、OpenCode、Codex、OpenClaw 和 CC Switch 配置，</p>
<p>看清每个 Agent 使用的模型和 Provider，识别高风险权限、未知中转 API、不安全 MCP、敏感文件暴露和危险 auto mode，</p>
<p>并通过 dry-run、diff、备份和回滚，帮助你安全应用配置基线。</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 11.2 开源冷启动场景

1\. 你电脑上的 AI Coding Agent 到底连接了哪些模型？

2\. 用 CC Switch 切模型后，你的 Agent 安全配置还有效吗？

3\. Claude Code、OpenCode、Codex 安全配置差异对比。

4\. OpenCode 接国内模型时需要注意哪些安全风险？

5\. AI Coding Agent 的 auto mode 什么时候可以开？

6\. 如何给团队制定 AI Coding Agent 安全基线？

7\. 如何识别不可信 OpenAI Compatible 中转 API？

## 11.3 和 AgentShield 的关系

不建议一开始正面对抗 AgentShield。可以学习它的规则和产品形态，但不复制定位；必要时兼容或调用 AgentShield 的扫描结果；重点做 AgentShield 没有强覆盖的国内 Provider、CC Switch、安全迁移、配置地图和安全配置治理能力。

# 12. 商业化路径

| **版本** | **目标用户** | **核心能力** |
|----|----|----|
| 开源版 | 个人开发者 | 多 Agent 发现、Provider 风险识别、CC Switch 配置检查、基础扫描、敏感文件扫描、MCP 基础风险检查、安全基线建议、dry-run、diff、backup、restore、HTML 报告。 |
| Team 版 | 小团队 | 团队安全基线、多项目扫描、配置漂移检测、统一 Provider 白名单、团队 HTML 报告、GitHub Action、规则库同步、团队风险趋势。 |
| Enterprise 版 | 企业二开和安全团队 | 私有化部署、企业 Provider 白名单、内部模型服务识别、MCP Registry 风险管理、Agent 权限策略中心、内部 OpenCode 和 OpenClaw 二开适配、审计报告、合规报表、企业研发平台集成。 |

## 12.1 潜在客户

- AI Coding Agent 重度使用团队。

- 企业研发效能团队。

- 安全部门。

- AI 平台团队。

- 内部 Agent 二开团队。

- 中小企业技术团队。

- 国内模型接入平台。

- 企业私有化 Agent 平台厂商。

# 13. 90 天路线图

| **阶段** | **时间** | **目标** | **关键输出** |
|----|----|----|----|
| 第 1 阶段 | 第 1 到 14 天 | 完成新方向 PRD 和技术可行性验证。 | v0.2 立项文档；与 AgentShield 差异化分析；OpenCode、Codex、Claude Code、CC Switch 配置调研；MVP PRD；CLI 输出样例；HTML 报告样例；技术架构草图。 |
| 第 2 阶段 | 第 15 到 45 天 | 做出 AgentGuard MVP。 | doctor、map、scan、provider scan、ccswitch scan、baseline dry-run、diff、backup、restore、report html；重点支持 OpenCode、CC Switch、Claude Code 基础识别、Codex 基础识别。 |
| 第 3 阶段 | 第 46 到 75 天 | 强化规则和团队场景。 | 国内 Provider 规则库；OpenAI Compatible endpoint 风险规则；OpenClaw 支持；MCP 风险增强；团队安全基线；GitHub Action 初版；中英文 README；demo 视频。 |
| 第 4 阶段 | 第 76 到 90 天 | 开源发布和试点。 | 发布 v0.1；在 GitHub、知乎、掘金、V2EX、X、Reddit 推广；联系 CC Switch、OpenCode、OpenClaw 用户；找小团队和企业二开团队试用；收集 issue；规划 v0.2。 |

# 14. 当前风险

| **风险** | **说明** | **应对** |
|----|----|----|
| 与 AgentShield 定位混淆 | 用户可能认为 AgentGuard 只是另一个 AgentShield。 | 不主打漏洞扫描；主打配置地图、CC Switch、Provider 安全、配置迁移和中文国内场景。 |
| 第一版范围过大 | 多 Agent、多 Provider、多配置中心容易做大。 | 第一版只做 CLI；深度支持 OpenCode 和 CC Switch；Claude Code、Codex 先做基础扫描。 |
| 用户不敢让工具改配置 | 自动修复能力不被信任。 | 默认只读；所有修改先 dry-run；展示 diff；自动 backup；支持 restore。 |
| 国内 Provider 风险判断困难 | 很难判断一个 Provider 是否可信。 | 分 trust level；支持用户自定义白名单；对未知中转提示风险，不武断拦截。 |
| 开源传播不够性感 | 配置治理听起来不如扫描漏洞刺激。 | 用具体场景传播：Agent 正在把代码发给谁、CC Switch 切模型后安全吗、auto mode 能不能开。 |

# 15. 下一步行动

## 15.1 立即要做

1\. 试用 AgentShield，确认它的真实能力和边界。

2\. 调研 CC Switch 配置文件结构。

3\. 调研 OpenCode 配置和 Provider 配置。

4\. 调研 Codex 配置和 sandbox 设置。

5\. 调研 Claude Code 配置和权限设置。

6\. 设计 AgentGuard 配置地图输出样例。

7\. 设计 Provider 风险等级。

8\. 设计 dry-run、diff、backup、restore 流程。

9\. 写 MVP PRD v0.2。

10\. 找技术合伙人评估 4 周 MVP 可行性。

## 15.2 关键验证问题

1\. 4 周内能否做出多 Agent 配置发现？

2\. 4 周内能否完成 CC Switch 配置解析？

3\. 4 周内能否完成 OpenCode 深度适配？

4\. 国内 Provider 风险规则是否能做出差异？

5\. HTML 配置地图报告是否能成为传播亮点？

6\. 这个方向是否明显区别于 AgentShield？

## 15.3 MVP 成功标准

- GitHub 有真实 star 和 issue。

- 至少 20 个开发者试用。

- 至少 5 个用户反馈配置地图有价值。

- 至少 3 个用户愿意继续用。

- 至少 1 个团队愿意试点。

- 有用户主动提出支持更多 Agent 或 Provider。

- 有用户愿意贡献国内 Provider 规则。

# 16. 当前结论

AgentGuard 方向仍然成立，但必须从“配置扫描器”升级为“安全配置中心”。

新的核心判断是：未来开发者和团队不会只使用一个 AI Coding Agent，也不会只使用一个模型 Provider。真正的痛点会从“某个 Agent 安不安全”变成“多 Agent、多模型、多 Provider 混用时，安全配置是否可见、可控、可迁移、可回滚、可治理”。

因此，AgentGuard 的机会不在于做一个更大的扫描器，而在于成为 AI Coding Agent 时代的安全配置治理入口。

| **第一阶段最应该做的事情**     |
|--------------------------------|
| 多 Agent 配置地图              |
| CC Switch 安全检查             |
| 国内 Provider 风险识别         |
| OpenCode 深度适配              |
| dry-run、diff、backup、restore |
| 中文 HTML 报告                 |

**这条路线比直接对标 AgentShield 更稳，也更适合国内真实使用场景。**

# 附录：建议的项目一句话

对开发者：AgentGuard 帮你看清当前 AI Coding Agent 连接了哪些模型、用了哪些 Provider、开了哪些权限，以及怎么安全调整。

对团队：AgentGuard 帮团队建立统一 AI Coding Agent 安全基线，避免不同成员配置混乱。

对企业二开团队：AgentGuard 是 OpenCode、Codex、OpenClaw 等二开平台的安全配置治理组件。
