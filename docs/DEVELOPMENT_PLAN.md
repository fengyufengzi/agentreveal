# AgentGuard 开发计划

> 状态：Active
> 生效日期：2026-07-16
> 当前阶段：`0.0.5` 发布加固 + 首次入口/风险处置 + CLI/macOS Desktop 联合发布准备

## 1. 阶段目标

未来 6 至 8 周的目标不是继续堆功能，而是证明：

- 用户愿意安装；
- 用户第一次运行就能发现真实价值；
- 用户愿意保留并再次使用；
- 桌面版能显著降低使用门槛；
- 第一次公开发布同时提供 CLI 和 macOS Desktop，并且两个入口给出一致结论。

## 2. 当前版本基线

仓库当前已具备：

- CLI 核心命令：doctor、scan、provider scan、map、report、baseline、backup、apply、restore、risk；
- 6 类 Agent 的发现或深度解析；
- Provider / 代理链路 / 密钥 / 权限 / MCP / 敏感文件 / 跨 Agent 风险；
- HTML / JSON 报告；
- 63 条规则行动矩阵、根因任务聚合、跨平台修复指引和本机风险接受审计；
- 部分 Agent 的可逆整改闭环；
- CI 门禁示例；
- Electron 桌面预览壳；
- macOS 未签名打包能力。

后续任务不得再把这些能力作为“从零开始的 MVP 功能”重复规划。

## 3. P0-A：0.0.5 发布加固与小范围 Pilot

在 Public Preview 前必须先完成：

- [x] acceptance 按 `taskId + project scopeId` 生效，旧无作用域记录作为 legacy 保留且不再生效；
- [x] 聚合任务展示全部子规则的下一步、验证方式和接受条件；
- [x] `risk accept` 写入前展示全部关联规则和接受条件，并要求显式 `--confirm`；
- [x] 提供 `agentguard risk verify task-...` 单任务验证闭环；
- [x] 当前树、暂存区、npm 发布内容敏感信息检查可执行并已接入 CI；
- [ ] 全部可达 Git 历史清理后通过 `npm run sanitize:history`；
- [ ] 完成 5 至 10 人、7 至 14 天 Pilot，达到修复/接受/复扫指标且无错误隐藏或凭证泄漏。

详细验收见
[`development-plan-0.0.5-hardening-and-pilot.md`](development-plan-0.0.5-hardening-and-pilot.md)。

## 4. P0-B：联合首发前的产品闭环（先完成）

本阶段先于桌面功能开发完成。桌面版不得在首次入口和风险处置语义尚未稳定时复制临时交互。

### 4.1 产品体验

- [x] 裸执行 `agentguard` 即进入统一首次入口，`agentguard scan` 保持兼容；
- [x] 首次运行自动完成 Agent 发现、扫描、配置地图摘要和下一步建议；
- [x] 将“实际上游链路”放在结果首屏；
- [x] 终端只优先展示最重要的 3 至 5 条风险；
- [x] 其他风险进入详细分组或报告；
- [x] 将风险分成“必须处理 / 建议确认 / 信息提示”；
- [x] 首屏行动使用稳定 taskId，并直接给出 report、accept/trust 和 verify 的下一条命令；
- [x] 为 CLI 和桌面定义同一个 first-run/action-summary JSON 契约；
- [x] 配置解析错误不得直接暴露堆栈，应输出文件、原因和安全跳过说明；
- [x] 提供清晰的卸载说明。

### 4.2 风险质量

- [ ] 核对最重要规则的真实命中率；
- [ ] 去除重复告警和低价值告警；
- [x] 未知 Provider 支持通过 CLI 确认 trusted / internal / untrusted（撤销信任），不要求普通用户手写配置文件；
- [x] 明确区分接受当前任务、信任端点与项目级规则忽略，三者不会吞掉 HTTP、密钥和权限风险；
- [x] 支持可信端点的 add/list/remove，并在报告中保留来源与审计状态；
- [x] 支持当前项目 + Agent + ruleId 的低优先级规则忽略、到期与撤销，并在 CLI、HTML、Desktop 保留审计痕迹和技术证据；
- [x] 信任端点不得掩盖 HTTP、明文密钥、危险权限等独立风险；
- [x] 明文密钥、共享密钥、代理链路、危险权限和公网暴露均有明确整改与复扫步骤，并由首发高影响家族测试锁定；
- [x] 对同一根因产生的多条 finding 做聚合，并保留所有子规则处置语义。

### 4.3 P0-B 完成标准

- 新用户只运行一个入口即可看到 3 至 5 个稳定行动任务；
- 用户不编辑 JSON 也能登记、查看和撤销自建/内部端点信任；
- 用户能区分具体任务接受、Provider 端点信任和跨 taskId 的项目规则忽略，并可查看或撤销每种状态；
- 同一个任务可以修复、接受或验证，三种状态不会互相混淆；
- CLI 输出契约可直接供桌面版消费，不依赖解析终端文本。

## 5. P0-C：macOS Desktop Public Preview

现有 Electron 壳作为工程起点，不重新选型或重写 core。第一版优先支持 Apple Silicon；Intel 支持是否
进入首发由打包与真实设备验证结果决定，并在支持矩阵中明确说明。

### 5.1 第一版页面与流程

- [x] 首次启动说明本地运行、默认只读、不上传以及会读取哪些配置；
- [x] 首次主行动通过原生目录选择器确认一个代码项目，并解释项目根目录的选择标准；整机扫描作为次级入口，
  使用主进程固定授权的用户主目录，执行前提示可能出现的 macOS 受保护文件夹权限请求；
- [x] 首页一次完成 Agent 发现、扫描、实际 Provider/代理/上游摘要；
- [x] 首屏只展示最重要的 3 个行动任务，并可进入完整列表；
- [x] 展示风险详情、整改步骤和适配当前 macOS 的命令；
- [x] 提供“接受当前风险”和“信任此端点”两个不同操作，并要求确认原因；
- [x] 对符合矩阵边界的 P2/P3 规则提供项目级忽略、到期、审计与撤销，不允许 renderer 自造规则；
- [x] 风险接受、撤销后可以重新验证并刷新任务状态；端点信任完成后复用同一刷新流程；
- [x] 导出并打开 HTML / JSON 报告，输出到用户可写目录；
- [x] baseline dry-run 作为高级入口；
- [x] 自动修复作为二级入口，先展示逐文件 diff，原生确认后强制 backup，应用后复扫并支持安全 restore。
- [x] 完成 Desktop 首次体验与视觉层级重构：首次仅一个主 CTA，结果先结论后任务，技术步骤按需展开，
  接受/信任/忽略保持次级策略操作；提供合成数据离屏截图用于欢迎页和工作台关键滚动位置的视觉回归。
- [x] 根据首轮真实使用反馈把五页导航收敛为单页安全工作台：已配置 Agent、现状、重点问题、连接链路、
  系统专属修复步骤和可逆 baseline 整改在同一条滚动路径完成。
- [x] 单页结果按 Agent 重组：每个 Agent 先展示配置、连接、显式模型/Provider、安全相关权限与 MCP 摘要，
  再紧邻展示该 Agent 的问题和修复建议；跨 Agent 与项目任务保留独立分组。
- [x] 移除不再承载导航价值的左侧菜单，将报告与支持收进顶部应用栏；首屏使用可定位的 Agent 状态卡作为
  页面导航，取消独立全局统计区，把主要空间持续留给每个 Agent 的档案、风险和修复闭环。
- [x] 参考真实多 Provider 工具的对象切换模式，把 Agent 状态卡升级为固定的单选工作区：默认打开最高优先级
  Agent，正文一次只渲染一个 Agent，并把跨 Agent 链路与项目决策收进独立入口。
- [x] 根据第二轮本机体验压缩结果首屏：范围与扫描状态合并一行，删除重复统计和结论条，修正窗口滚动容器，
  保证 Agent 切换器持续可见，并在档案内提供明确的返回入口。
- [x] 统一 Desktop 可点击控件的视觉语言：Agent 卡明确区分“查看”和“当前”，系统蓝色不再与红橙绿风险状态色
  混用；任务详情、更多列表和报告菜单采用一致的展开提示，并补齐 Agent 键盘切换语义。
- [x] 完成第一轮 macOS 专业化视觉收敛：欢迎页移除重复标题和预扫描状态，结果档案采用问题主区与只读
  Inspector，项目策略收进次级菜单，并补齐系统深色、高对比度、减少透明度和窄窗口视觉回归。
- [x] 完成第二轮 macOS 原生交互：增加固定白名单应用菜单与 `⌘R`、`⇧⌘R`、`⌘O`、`⇧⌘E` 快捷键；
  窗口几何状态以 0600 权限原子保存且不包含项目或扫描数据，损坏和离屏状态安全回退。
- [x] 完成第三轮可用性与无障碍收敛：全局 Top 3 直接定位 Agent/任务，Agent 内只默认展示前三项；补齐首次结果
  焦点、任务朗读语义、异步 `inert/aria-busy`、对话框防重复提交、错误即时播报和减少动态效果支持。

### 5.2 工程与安全要求

- [x] 桌面版直接复用同一个 core 和 typed schema，不通过解析终端文案构建 UI；
- [x] CLI 和桌面输出使用同一任务 ID、处置、信任与验证状态；
- [x] 主进程只暴露白名单 typed IPC，渲染进程不得执行任意命令或读取任意文件；
- [x] 评估并启用 Electron renderer sandbox，保持 contextIsolation 和禁用 nodeIntegration；
- [x] 报告和任务状态写入用户选择目录或 `~/.agentguard`，诊断日志写入 Electron userData，不写入 app bundle / asar；
- [ ] 完成 macOS Developer ID 签名、hardened runtime、notarization 和 staple；
- [x] 完成正式应用图标及可维护 SVG/PNG 源文件并写入构建配置，禁止使用 Electron 默认图标发布；
- [x] 提供仅含固定事件字段的本地脱敏诊断导出，默认不自动上传；
- [x] 第一公开版不做复杂自动更新，README 明确手动升级方式。

### 5.3 第一版不做

- 账号登录；
- 云同步；
- 团队工作区；
- 后台常驻监控；
- 实时阻断；
- 企业控制台；
- 多租户；
- SIEM / DLP / IAM 集成。

## 6. P0-D：CLI + Desktop 联合发布

### 6.1 CLI 安装与发布

- [ ] 检查并锁定 npm 包名；2026-07-18 registry 查询 `agentguard` 返回 404，当前可用但尚未通过发布占名；
- [ ] 完成全新 macOS Apple Silicon 环境安装测试；
- [x] 验证 Node.js 22 和 24；
- [x] Windows / Linux CLI 在首发标为 Beta，macOS 为主要端到端验证平台，并写入 README；
- [x] 完成 `npm pack` 文件清单与干净 prefix 安装测试，并固化为 `npm run package:verify-install`；
- [x] 使用当前本地 tarball 完成 `npx agentguard --version` 等价验证；正式 registry 名称仍待发布时验证；
- [x] 仓库公开前完成当前树、CI 与干净候选仓库历史检查；私有开发历史不进入公开仓库；
- [x] 提供当前树、暂存区、npm 发布内容和 Git 历史四种检查模式，且不回显命中内容；
- [x] 当前树扫描覆盖 `package-lock.json`，并持续拒绝误跟踪 `.env`、证书、私钥、日志、备份、本机报告和构建资产；
- [x] 使用 Gitleaks v8.30.1 独立复核当前树和全部历史，均为 0 个密钥命中；
- [ ] 使用独立 secret scanner 复核最终发布 tarball 和 DMG；
- [ ] 准备同一版本号的 npm 包、CLI 安装文档和卸载文档；
- [x] 增加安装失败、误报、Agent 适配和隐私问题 Issue 模板。
- [x] 提供 `AGENTS.md`、`CONTRIBUTING.md`、`REVIEW.md`、PR 模板和仓库贡献技能；
- [x] 提供统一 `npm run check` 与贡献契约门禁，自动检查 Desktop IPC、诊断白名单和技能占位符；
- [x] 提供关键路径 CODEOWNERS、Accepted ADR 和无额外提示的 AI 贡献冷启动评测定义；
- [x] 完成首轮 AI 冷启动评测，并增加工具链预检、requiredChecks 证据和脱敏摘要门禁；

### 6.2 macOS 安装与发布

- [ ] 在全新 Apple Silicon macOS 用户环境验证 DMG 安装、首次启动、扫描、报告和卸载；
- [ ] 验证 Gatekeeper、签名、公证和 staple 结果；
- [x] Desktop app bundle 不依赖用户预装 Node.js 或全局 CLI，并在隔离 HOME/PATH 下自动验证启动；
- [x] 明确 macOS Desktop 最低版本 12、首发 Apple Silicon 和 Intel 尚未验证等已知限制；
- [ ] GitHub Release 同时附带 macOS DMG、校验值和 CLI 安装入口。

### 6.3 README 与演示

- [x] README 第一屏回答“连接谁、读取什么、执行什么”；
- [x] 放置由真实 CLI 扫描合成配置生成的脱敏输出示例；
- [x] 增加约 40 秒 macOS Desktop 合成 Demo 视频、封面与可复现生成脚本；
- [x] 明确本地运行、默认只读、不上传、脱敏输出；
- [x] 明确支持矩阵和已知限制；
- [x] 自动修复能力放在 Advanced 部分，不作为首次卖点。

### 6.4 联合发布闸门

- [ ] 5 至 10 人 Pilot 同时覆盖 CLI 用户和非 CLI 桌面用户；
- [x] 同一台机器、同一项目下 CLI 与桌面版的 taskId、规则集合和项目忽略结果一致，并有真实扫描集成测试；
- [x] 建立独立干净候选仓库并使内置历史扫描归零；第三方密钥历史复核已通过，最终资产仍待复核；
- [ ] 同一 Public Preview tag 和 GitHub Release 同时发布 npm CLI 与 macOS DMG；
- [ ] 两个入口任一未通过安装、安全或结果一致性验证，则不拆分提前公开另一个入口。

### 6.5 当前外部接力顺序

截至 2026-07-18，所有无需外部凭据、真实设备、公开发布或产品确认的 P0 已在本机闭环。剩余事项按以下
顺序接力，前一项未通过时不进入联合公开发布：

1. **确认发布身份与展示**：Demo 视频、封面、生成脚本、`0.0.5-pilot.3` 版本和个人 Gmail 作者邮箱
   已确认；npm 首次发布使用账户 scope 下的 `@wangmarsen/agentguard`，避免与现有 `agent-guard` 包触发
   registry 相似名称保护。
2. **建立干净公开历史（已完成）**：已把审核后的当前树同步到独立候选仓库，候选 `main` 的内置
   `sanitize:history` 已归零且未带入私有分支、tag 或开发提交；私有开发仓库的 23 项历史元数据不进入公开面。
3. **完成 Apple 发布链**：Developer ID Application、hardened runtime、notarization、staple；不得在文档、
   日志或仓库中记录凭据值。
4. **全新设备验收**：在未安装 Node.js/全局 CLI 的 Apple Silicon macOS 上，从 DMG 完成安装、首次扫描、
   报告、卸载和 Gatekeeper 验证；本机 bundle 隔离启动已通过，但不能替代此项。
5. **运行真实 Pilot**：5 至 10 人、7 至 14 天，同时覆盖 CLI 与非 CLI Desktop 用户，用真实反馈核对命中率、
   重复/低价值告警、修复/接受/复扫闭环和隐私问题。
6. **联合发布**：使用 `release:scan-assets` 对最终 npm tarball 与 DMG/app.asar 再做独立 secret scan，并完成
   重下载和干净安装，以同一 tag/Release 同时公开；
   任一入口未通过就整体延后。

## 7. P1：公开后的 20 人用户验证

首批目标用户：20 人。

建议构成：

- 5 位 Claude Code 重度用户；
- 5 位 CC Switch 用户；
- 5 位 OpenCode / Codex 混用用户；
- 5 位安全或研发负责人。

每位用户记录：

- 安装是否成功；
- 首次扫描是否完成；
- 是否发现此前不知道的问题；
- 哪一条 finding 促使其采取行动；
- 是否生成或分享报告；
- 一周后是否再次运行；
- 最希望支持的下一项能力。

发布后优先级排序：

1. 安装失败；
2. 配置解析崩溃；
3. 隐私或脱敏问题；
4. 高价值规则漏报；
5. 高影响误报；
6. 输出和解释体验；
7. 新 Agent 支持。

## 8. 暂停项

以下任务保留已有代码或示例，但当前不继续扩张：

- Team 管理后台；
- 企业私有化平台；
- 大规模 CI 产品化；
- GitHub App；
- 运行时拦截；
- 大规模规则数量竞赛；
- 支持低使用量边缘 Agent；
- 商业版定价与账户系统。

## 9. 里程碑

### Milestone A：0.0.5 Pilot Ready

完成标准：

- acceptance 项目作用域和聚合任务语义正确；
- 单任务可以验证已解决、仍存在、已接受或已过期；
- 5 至 10 人完成真实修复或接受闭环；
- 当前树和 npm 发布内容无敏感信息，Git 历史清理方案已执行并归零。

### Milestone B：Core UX Ready

完成标准：

- 默认入口一次完成发现、扫描和行动摘要；
- 首屏只展示 3 至 5 个稳定任务；
- trusted/internal/untrusted 可以通过 CLI 管理；
- 接受任务、信任端点和项目忽略语义相互独立；
- first-run/action-summary schema 可供桌面消费。

### Milestone C：Desktop Preview Ready

完成标准：

- 非 CLI 用户能理解应选择哪个代码项目、项目扫描会读取什么；需要跨项目排查时也能在了解 macOS 权限影响后
  主动选择整机扫描；
- 能看清 Agent 地图、真实上游和重点风险；
- 能接受任务、信任端点、重新验证并导出报告；
- 与 CLI 核心结果一致；
- 签名、公证的 macOS DMG 可在干净环境安装。

### Milestone D：Joint Public Preview Ready

完成标准：

- 干净环境可安装；
- 默认入口可完成首次扫描；
- README、隐私说明和支持矩阵完整；
- 高价值风险输出清晰；
- 无已知密钥泄漏；
- npm 包与签名、公证的 macOS DMG 使用同一版本进入 GitHub Release；
- CLI 与桌面任一未通过联合闸门时都不单独公开。

### Milestone E：20 User Validation

完成标准：

- 至少 20 位真实用户尝试安装；
- 有可量化的安装和扫描成功率；
- 至少 5 人发现此前不知道的真实问题；
- 至少 3 人一周内再次使用；
- 至少 2 人分享报告或要求团队能力。

## 10. 成功指标

产品指标优先级：

1. 安装完成率；
2. 首次扫描成功率；
3. 有效风险命中率；
4. 二次使用率；
5. 主动反馈率；
6. 报告分享率；
7. GitHub Star 和下载量。

## 11. 计划维护规则

- 每周更新一次完成状态；
- 新需求必须标记 P0 / P1 / P2 / Paused；
- 与 `docs/PRODUCT_DIRECTION.md` 冲突的任务不得直接进入开发；
- 新 Agent 适配前，必须说明它对下载、首次价值或强需求验证的贡献；
- 产品方向变化必须同步更新本计划和文档状态表。

开源发布的逐项安全闸门见
[`OPEN_SOURCE_RELEASE_CHECKLIST.md`](OPEN_SOURCE_RELEASE_CHECKLIST.md)。
