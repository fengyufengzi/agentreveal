# AgentGuard 当前产品能力

> 本文是“AgentGuard 现在实际能做什么”的规范化摘要；代码和测试是最终事实依据。
>
> 当前源码：`0.0.5-pilot.2` 候选；最新私有 Pre-release：`0.0.5-pilot.1`。
>
> 更新日期：2026-07-18。

## 1. 产品定位

AgentGuard 是面向开发型 AI Agent 的本地安全检测与配置治理工具。

它不替代 Claude Code、Codex、OpenCode 等 Agent Runtime，也不做 EDR、MDM 或通用终端防护。当前核心
价值是回答四个问题：

1. 本机配置了哪些 Coding Agent，它们连接了哪些 Provider、代理和 MCP？
2. 哪些配置是真正需要行动的风险，哪些只是需要确认或观察？
3. 用户在当前操作系统上应该执行什么命令，如何验证整改结果？
4. 哪些预期风险应接受当前任务、信任端点或按项目忽略规则，为什么，何时到期，如何撤销？

产品主流程：

```text
发现 → 归因聚合 → 行动排序 → 本机处置 → 复扫验证
                       ↘ 接受任务 / 信任端点 / 忽略低优先级规则 → 审计保留
```

## 2. 当前产品形态

| 形态 | 状态 | 说明 |
|---|---|---|
| CLI | 主入口 | 裸执行一次完成发现、实际链路、三类任务、Top 3 与下一条命令；保留完整 scan、报告、baseline、备份恢复、风险接受、端点信任和项目规则忽略子命令 |
| 自包含 HTML | 主报告 | 离线打开；显示行动任务、本机命令、接受/忽略状态和完整脱敏证据 |
| JSON | 自动化接口 | `schemaVersion: 1`；用于 CI 和其它工具消费 |
| Electron macOS 桌面端 | 开发者预览 | 单一首次 CTA、扫描结论、前三行动、按需展开的 macOS 指引、实际链路、风险接受、Provider 信任/撤销、项目规则忽略/撤销、验证、baseline 预览/备份应用/复扫/安全恢复、Claude 凭证迁移前备份/会话级恢复、HTML/JSON 与脱敏诊断导出；签名发布仍待 Apple 凭据实测 |
| GitHub Actions 示例 | 可用 | 下载固定 Pre-release 包，执行扫描并存档报告 |

首发平台口径：CLI 的 macOS 路径与真实环境验证最完整；Linux / Windows 为 Beta，已有命令模板测试但尚未
完成六类 Agent 三平台端到端验证。macOS Desktop 配置目标为 macOS 12+、Apple Silicon；Intel 尚未验证。

## 3. 已实现功能

### 3.1 环境发现与风险扫描

- 裸执行 `agentguard` 进入统一首次入口；`agentguard --json` 返回 CLI/Desktop 共用的 `first-run` v1
  契约，`agentguard scan` 的既有终端、JSON 和退出码保持兼容。
- 首屏先展示实际 Provider/代理/上游，再按“必须处理 / 建议确认 / 信息提示”汇总任务，只展开前三项。
- 每个首屏任务使用稳定 taskId，并给出当前系统整改模板以及 report、accept/trust/ignore、verify 后续命令。
- 发现 Claude Code、Codex、CC Switch、OpenCode、Gemini CLI 和 OpenClaw 配置。
- 检查 Provider/base URL、代理真实上游、MCP、权限、hooks、明文凭证、共享密钥和 Workspace 敏感文件名。
- 跨 Agent 识别共享代理和共享未知端点。
- Provider 支持官方、国内官方、本地/内网、公网 IP、未知中转和用户信任策略分类。
- 扫描和报告不输出完整 API Key、Token 或私钥；密钥复用只使用不可逆指纹。
- 六类 Agent 与框架兜底的配置解析失败统一显示具体文件、固定安全原因和“已安全跳过”；原始异常、
  堆栈和配置片段不进入 finding、终端、HTML 或稳定任务身份。
- 损坏的项目级 AgentGuard 端点信任或规则忽略策略会被安全忽略，并使用固定警告说明，不回显 JSON
  解析器原文；CLI 与 Desktop 只读扫描都不会因此覆盖损坏文件。
- 同一合成项目的 CLI 与 Desktop 会执行真实扫描并比较 taskId、规则要求和项目忽略结果，防止两个入口
  在 core 之外产生语义分叉。

### 3.2 配置地图

- 按 Agent 汇总端点、MCP、凭证、敏感文件和权限发现。
- 展开“Agent → 本地代理/CC Switch → 真实 Provider”两跳链路。
- 区分未配置、无风险和不同严重度状态。

### 3.3 下一步行动报告

- 63 条具体规则全部映射到统一处置矩阵。
- 将潜在影响 `severity` 与行动顺序 `priority` 分开。
- 将 finding 聚合为稳定 `taskId`，避免同一根因重复要求用户处理。
- 报告按“立即处理 / 需要确认 / 建议清理 / 配置观察”组织。
- 每个任务按规则 ID 逐条包含原因、下一步、验证方式、接受条件和关联技术证据，不再由 `primary` 文案覆盖其它规则。
- 修复命令明确标记为“完整解决 / 风险缓解 / 辅助步骤”；混合任务必须完成全部规则条件。
- 配置观察不进入默认待处理数量。

### 3.4 跨平台修复引导

- 根据生成报告的操作系统输出 macOS、Linux 或 Windows PowerShell 命令。
- baseline 项生成 dry-run、带备份 apply 和复扫命令。
- macOS 明文凭证引导使用 Keychain；Claude Code 额外提供可复制命令，只修改实际含明文的
  `settings.json/settings.local.json`，删除 `ANTHROPIC_AUTH_TOKEN/API_KEY` 并设置官方支持的 `apiKeyHelper`；
  CLI 报告会在迁移命令前给出任务专属 `credential backup` 命令，Desktop 则使用一键备份；
  Linux 使用 Secret Service，Windows 使用用户 DPAPI 凭证文件。
- 仅为工具真实支持的变量生成当前进程/会话注入，不写 shell profile、普通 `.env` 或 Windows 用户环境。
- HTML 提供“复制命令”按钮，但静态报告不会直接执行本地操作。
- CC Switch SQLite 保持只读；AgentGuard 会明确普通 Provider 的 Token 输入框不解析环境变量名，避免用户把
  `${VAR}` / `{env:VAR}` 当作 Token 填入，并提供可复制的数据库与备份权限加固命令。凭证仍需在原应用中
  以独立、最小权限的新 Token 替换和轮换；只要数据库继续保存真实 Token，复扫不会把该规则误判为已解决。
- Linux/Windows 已覆盖 remediation 模板测试；Agent 配置路径和真实环境验证目前仍以 macOS 为主，
  不等于六类 Agent 已完成三平台端到端验证。

### 3.5 有限自动整改与恢复

- `baseline --dry-run` 预览 OpenCode、Claude Code、Gemini CLI 和 OpenClaw 的有限安全基线变更。
- `apply --backup` 强制先备份，检测并发修改，使用原子写入，失败时自动恢复。
- `restore` 恢复最近或指定备份，并验证备份完整性与路径边界。
- 桌面端只允许应用与已确认预览指纹一致的计划，并在主进程显示原生确认框；renderer 不能绕过确认直接写入。
- 桌面恢复仅开放给当前会话创建的备份；如果应用后配置又被修改，会拒绝覆盖。
- Claude Code 明文凭证引导可在执行 Terminal 命令前一键备份实际含明文字段的设置文件；恢复前校验
  manifest、备份摘要和当前配置指纹，要求原生确认，多文件失败时回滚已恢复文件并立即复扫。备份与恢复
  不会代替 Keychain 存储、配置迁移或旧凭证轮换。
- CLI 提供同一 core 的 `credential backup <task-id>` 与 `credential restore <backup-id>`；恢复默认只读预览，
  只有带回预览指纹的 `--confirm` 才写入，并拒绝预览后的并发修改。Desktop 在相同事务边界外继续增加
  当前会话备份授权、原生确认和自动复扫。
- 项目备份目录为 0700、文件为 0600，并自带 Git 忽略保护，避免完整原配置被普通 `git add .` 带入提交。
- 自动整改只覆盖已经具备安全写入和回滚保障的配置，不以扩大写入范围追求自动化率。
- 明文/共享密钥、代理链路、危险执行权限和公网暴露的首发规则清单由测试锁定，每条必须同时提供明确
  下一步和复扫/确认方式；baseline 规则还必须声明 safe/balanced 的真实效果。

### 3.6 风险接受与审计

- `risk accept <task-id> --reason ... [--expires ...] [--confirm]` 接受当前任务；没有 `--confirm` 时只展示全部规则、
  严重度和接受条件，不写入记录。
- 有效接受的任务不进入默认行动结果，也不再参与 `scan/report` 高危退出码判断；到期或撤销后重新参与。
- P0 任务必须设置到期时间，不能永久隐藏。
- `risk list [--all]` 查看有效记录或完整历史；`risk revoke` 撤销。
- 审计文件默认位于 `~/.agentguard/acceptances.json`，目录 0700、文件 0600、原子写入。
- 过期和撤销记录不会删除；HTML 仍保留已接受任务和完整技术证据。
- acceptance schema v2 按规范化 cwd 的 SHA-256 `scopeId` 隔离当前项目，不保存项目路径。
- 旧 v1 无作用域记录只作为 legacy 审计保留，不再影响任何项目；用户需在当前项目重新确认。
- 新接受记录保存全部规则的静态摘要，但不保存 evidence、动态标题、内部端点或项目路径；报告占位原因会被拒绝。

### 3.7 项目级 Provider 信任

- `trust add/list/remove` 管理当前项目的 `trusted` / `internal` Provider 端点，无需手写配置。
- URL、host、host:port 会规范化为 hostname；支持最左侧 `*.example.com` 通配域名。
- 每次新增和撤销都要求原因，并在项目配置保留追加式时间审计；原因可能进入版本控制，不应包含秘密。
- 信任只改变未知/中转端点分类，不会隐藏 HTTP、明文密钥、危险权限等独立风险。
- 桌面端的新增入口只接收 taskId，端点由 core 从当前未知 Provider 任务证据推导；renderer 不能新增任意域名。
- 桌面配置地图可以查看和撤销已有端点，操作后立即复扫并刷新行动任务。

### 3.8 项目级规则忽略

- `ignore add <task-id> --rule <rule-id> --reason ... [--expires ...]` 只能从最新活动任务选择 core 判定可忽略的规则。
- 资格限于 P2/P3、非 `fix`、非高风险家族；P0/P1、明文凭证、共享密钥、执行权限、解析/扫描盲区和
  Provider 端点分类一律不提供入口。
- 策略按当前项目 + Agent + ruleId 生效，即使 evidence 或稳定 taskId 变化也继续隐藏同规则发现；到期后
  自动恢复，`ignore remove` 可主动撤销。
- `.agentguard.json` / `agentguard.config.json` 只保存 Agent、ruleId、原因和时间审计，不保存 evidence、
  taskId、路径或端点；原因可能进入版本控制，不能包含秘密。
- CLI、HTML 和 Desktop 共用同一 triage；默认行动数和退出码排除已忽略发现，但 HTML 保留项目策略、
  撤销命令和完整技术证据。
- Desktop renderer 只能回传 service 提供的 taskId/ruleId 候选，主进程和 service 会再次校验项目授权、
  Agent、规则和最新任务，不能添加任意规则。

### 3.9 单任务验证

- `risk verify <task-id>` 重新扫描并区分已解决、仍存在、部分缓解、已接受、接受已过期/撤销和身份变化；
  缺少可比较基线时返回“无法确认”，不会误判为已解决。
- HTML 明确说明它是静态快照，处置后必须 verify 并重新生成报告。
- 生成报告时只保存项目作用域内的任务规则摘要，用于比较规则消失或任务身份变化；快照默认位于
  `~/.agentguard/task-snapshots.json`，使用 0600 权限且不保存 evidence、路径、动态标题或端点。

### 3.10 桌面本地诊断

- 桌面端为启动、扫描、整改、风险接受、端点信任、规则忽略、报告和窗口状态保存记录最小化本地事件。
- 每条事件只包含时间、固定操作名、成功/失败/取消状态；失败只保存固定错误分类。
- 不记录项目路径、Provider 端点、task ID、配置内容或原始错误文本。
- 日志位于 Electron userData 下的 `logs` 目录，目录权限 0700、文件权限 0600，超过 512 KiB 时保留一份轮换日志。
- 用户可在未选择项目时主动导出最近最多 200 条事件和应用/运行时版本；文件保存位置由用户选择。
- 诊断不会自动上传，也不提供后台网络发送能力；发送前用户仍应自行查看 JSON 内容。

### 3.11 桌面首次体验与视觉回归

- 首次打开以“选择项目并开始扫描”为唯一主行动，并解释应选择包含 `.git`、`package.json`、
  `pyproject.toml` 等标识的单个代码项目根目录。项目路径只能来自原生目录选择器；项目扫描把 workspace
  遍历限制在该目录，普通源代码只检查文件名、不读取内容，同时继续读取常见 Agent 的本机配置。
- 整机扫描保留为次级入口，主进程固定使用用户主目录作为 scope，renderer 不能提交任意路径；执行前明确
  提示 macOS 可能请求桌面、文稿、下载等受保护文件夹权限，避免用户在不理解范围时触发多次授权请求。
- 扫描后在一个安全工作台中依次展示结论，并按 Agent 分组展示配置位置、当前安全证据可识别的连接/上游、
  显式模型或 Provider、安全相关权限、MCP、凭证状态，以及该 Agent 自己的问题与修复建议；跨 Agent 与项目
  问题单独归组，最后进入统一安全整改。不再要求用户理解五个功能菜单。
- 结果页不再保留左侧步骤菜单；品牌、隐私承诺和报告入口统一进入顶部应用栏，全局统计不再单独占据首屏。正文首屏
  提供全部已配置 Agent 的固定状态切换器，默认选择当前最高优先级 Agent，正文一次只展示一个 Agent 的档案、
  风险与修复区域；跨 Agent 链路和项目决策使用独立入口，避免所有 Agent 在长页面中重复铺开。
- 扫描完成后隐藏重复的四项统计与二次结论条，将检查范围和扫描状态合并为一行，并压缩标题与 Agent 说明；
  Agent 切换器在独立滚动区内保持可见，每个档案也提供“返回 Agent 列表”，顶部可更换项目或主动进入整机扫描。
- 当前 profile 只复用已经脱敏的扫描证据；“未识别到显式模型/Provider”不等于没有配置。完整模型 inventory
  需要未来扩展各 Adapter 的只读 typed 契约，Desktop 不会为补齐展示而自行重复解析配置。
- 纯 baseline 任务显示“预览并一键整改”，仍强制执行计划指纹、原生确认、备份、原子应用、复扫和恢复；
  Claude 明文凭证显示“开始安全迁移”，展开当前 macOS Keychain 引导并提供迁移前备份和会话级恢复，
  但不会误称为已经自动删除或轮换凭证。
- Desktop 的“安全修改与恢复（高级）”区域明确区分手动凭证迁移与自动配置收敛：Terminal 命令可一键复制，
  迁移备份仅在启动或鉴权异常时回退；自动整改仍先预览逐文件差异，且不自动改写明文凭证。
- Claude Code、Codex 和 Gemini CLI live 配置中的 CC Switch `PROXY_MANAGED` 接管占位符不会被误判为
  真实明文凭证；Claude 因此也不会生成 Keychain 迁移任务。只有 CC Switch 全局代理服务与对应 Agent
  路由接管都开启时，AgentGuard 才把该 Agent 标为“经 CC Switch”，并展示本地端口、真实上游和鉴权占位符；
  CC Switch 数据库中的真实 Provider 凭证仍单独报告。
- Desktop 不再展示 `agentguard scan` 验证命令，而是明确引导点击任务卡片的“复扫验证”；接受任务、信任端点
  和忽略规则使用次级视觉层级，但语义、确认和审计
  边界没有改变。
- 单页工作台跟随 macOS 浅色或深色外观：内容画布保持清晰层级，顶部应用栏使用克制的半透明效果，风险状态采用
  低饱和底色；系统蓝色只表示交互和当前选择，红、橙、绿分别保留给紧急、审阅与验证状态。安全整改持续明确
  “默认不写入”。
- 状态区域区分礼貌播报、错误的即时播报和不确定进度；异步操作期间主内容使用 `inert` / `aria-busy`，
  已打开的策略对话框会禁用控件并阻止 Escape 关闭，避免重复提交。renderer 仍不获得 Node、网络或任意文件权限。
- 首次扫描完成后焦点进入结果标题；Agent 标签页、返回列表、任务详情与 Top 3 跳转都会把焦点送到新的上下文。
  键盘焦点可见，脚本滚动同样遵守 `prefers-reduced-motion`。
- Agent 切换卡使用统一的“查看 › / 当前”操作提示：系统蓝色只表示交互与当前选择，红橙绿仍只表示风险状态；
  支持左右方向键、Home/End 切换。报告菜单、任务详情与更多列表使用同一套可旋转箭头提示展开状态。
- Agent 档案在宽窗口中使用“问题主区 + 只读配置 Inspector”，窄窗口自动回落为单列；任务卡默认只保留主行动和
  复扫验证，接受、信任与忽略等项目级策略收进次级菜单，taskId 只在技术详情中展示。
- 结果首部提供全局 Top 3 行动队列，可直接定位到对应 Agent 和任务；每个 Agent 默认展示前三项行动，其余较低
  优先级任务进入可展开列表。任务卡为 VoiceOver 提供优先级、严重程度、标题和原因的关联语义。
- `npm run desktop:preview:capture` 使用完全合成的示例 Agent、端点和任务，在系统临时目录离屏生成欢迎页及
  单页工作台不同滚动位置的截图；不会读取真实 Agent 配置，也不把截图写入仓库。
- `npm run desktop:demo:build` 将这些合成场景生成约 40 秒 MP4 与封面；视频移除输入元数据，不包含真实路径、
  端点或本机扫描结果。
- `npm run desktop:pack` 在系统临时目录生成可双击的开发预览启动器，使用当前源码目录中已受系统信任的
  Electron 开发运行时，不上传 Apple、不能独立分发。macOS 26 会终止缺少公证 ticket 的独立 Electron App，
  因此 `desktop:dist` 不再生成误导性的本地 DMG；正式 bundle 验证会严格检查签名，并将主进程通过退出码或
  信号提前终止都判为失败。
- Desktop 主进程相对自身所在的 `desktop` 目录加载编译后的 typed service，使源码启动器与打包后的
  `app.asar` 使用同一解析规则；选择项目后不会因 `app.getAppPath()` 的入口语义差异而静默失去扫描服务。

### 3.12 macOS 原生菜单与窗口状态

- 原生应用菜单提供检查当前范围、只检查本机、选择项目、导出报告、查看开发者数据和导出脱敏诊断等固定动作；
  `⌘R`、`⇧⌘R`、`⌘O`、`⇧⌘E` 分别对应最常用的检查与报告流程。
- 主进程只能向 renderer 发送固定菜单命令，preload 会再次按同一白名单过滤；renderer 只能回传
  `hasOverview`、`hasReport`、`working` 三个布尔状态用于控制菜单可用性，不能提交路径、命令或任意参数。
- 窗口尺寸、位置和最大化标记以 0600 权限原子保存在 Electron userData；文件不包含项目路径、端点、taskId、
  扫描结果或配置内容。未知版本、损坏、越界或离屏状态会安全回退到默认窗口。

## 4. 支持矩阵

| 对象 | 当前支持 | 自动写入边界 |
|---|---|---|
| Claude Code | Provider、明文 token、权限模式、危险 allow、hooks、MCP | baseline 收敛权限/MCP；凭证只引导 |
| Codex | 自定义 Provider、MCP、明文 API Key、trusted projects、代理 | TOML 保持只读；提供 OAuth/安全存储建议，尚无 keyring 自动迁移 |
| CC Switch | SQLite Provider、明文/共享密钥、内置代理、failover 真实上游 | SQLite 始终只读 |
| OpenCode | Provider、明文 key、bash/通配权限、share、autoupdate、MCP | 部分 baseline 可写；凭证只引导 |
| Gemini CLI | MCP trust/remote/stdio、`.env` 凭证、shell sandbox、鉴权模式 | MCP trust baseline；凭证只引导 |
| OpenClaw | 渠道/网关凭证、bind/Tailscale 暴露、workspace、插件源 | 网络暴露面 baseline；凭证只引导 |
| 当前项目 | 敏感文件名与扫描截断提示 | 只读，不读取文件内容 |

## 5. 当前没有实现

以下内容不能作为现有产品能力对外承诺：

- 真正的一键凭证迁移：当前只有 Claude 引导命令的迁移前备份与恢复，尚无 `secret plan/migrate` 两阶段事务。
- 自动轮换或撤销上游 API Key。
- 自动修改 CC Switch SQLite 或带注释的 Codex TOML。
- 独立的结构化“误报”类型、批量策略管理、审批流程和团队共享 acceptance policy；当前只有单条、项目级、
  可审计的低优先级规则忽略。
- Prompt 内容安全、Skills 内容审计或运行时 Prompt Injection 拦截。
- 持久化 Workspace Inventory、配置漂移历史和跨机器 Dashboard。
- 组织策略分发、多人审批、团队身份权限和服务端审计。
- Runtime Tool Call/MCP Gateway 拦截。
- 已具备强制签名、公证、staple 验证的发布配置和手动 CI；Developer ID 凭据与真实发布产物仍待 Apple Developer Program 审核通过后验证。

## 6. 标准用户流程

```bash
agentguard doctor
agentguard scan
agentguard map
agentguard report --format html
```

报告为 baseline 和部分凭证场景给出本机命令模板，其余任务给出人工步骤。baseline 支持项先预览，再应用：

```bash
agentguard baseline --profile balanced --dry-run
agentguard apply --profile balanced --backup
agentguard scan
```

Claude Code 明文凭证迁移先按报告中的任务 ID 备份；只有迁移异常时才恢复：

```bash
agentguard credential backup task-xxxxxxxxxxxx
agentguard credential restore <backup-id>
agentguard credential restore <backup-id> --confirm <fingerprint>
```

经过确认的预期配置可以在当前项目作用域接受并保留原因：

```bash
agentguard risk accept task-xxxxxxxxxxxx --reason "已核对归属、TLS 和访问控制"
agentguard risk accept task-xxxxxxxxxxxx --reason "已核对归属、TLS 和访问控制" --confirm
agentguard risk verify task-xxxxxxxxxxxx
agentguard risk list
agentguard risk revoke task-xxxxxxxxxxxx

agentguard ignore add task-xxxxxxxxxxxx --rule OPENCODE_MCP_LOCAL --reason "已审核固定版本的项目内 MCP"
agentguard ignore list
agentguard ignore remove OPENCODE_MCP_LOCAL --agent opencode --reason "项目已移除该 MCP"
```

## 7. 当前产品阶段与下一道门槛

当前不是继续增加规则和 Agent 数量的阶段。项目作用域、聚合任务完整语义和单任务验证已经完成；
`npm run package:verify-install` 会构建真实 tarball，检查发布清单，在临时 HOME/prefix 安装并使用本地
tarball 完成 npx 版本验证。本地发布包已经验证，独立公开候选仓库的全部可达历史也已通过敏感信息检查；
接下来仍需从最终公开 Release 资产回装，并验证“发现后能否完成处置”。

进入 Inventory、Drift 或 Dashboard 前，至少需要完成一轮 `0.0.5-pilot.2` 真实试用并证明：

- 用户能独立找到并理解本机命令。
- 至少一部分用户完成真实整改并复扫消除任务。
- 用户能正确区分修复、接受和观察，不把“隐藏提示”当作修复。
- 风险接受原因和到期机制符合用户预期。
- 没有凭证泄漏、配置损坏或无法恢复事件。
- 当前树、npm 发布内容和全部公开 Git 历史均通过敏感信息检查。

Endpoint Trust 和项目规则忽略管理已经完成。下一步优先用 Pilot 验证三种处置语义是否被正确理解，并以
真实误报和复扫数据决定规则质量调整；闭环成立后再以 Drift Tracking 建立重复使用价值。只有当 Pilot
证明凭证迁移是主要阻塞时，才把只读 `secret plan` 提前。不要直接进入自动搬运凭证或 Dashboard。
