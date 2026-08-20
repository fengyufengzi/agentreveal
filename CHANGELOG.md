# Changelog

All notable changes to AgentReveal (formerly AgentGuard) are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

当前没有尚未发布的已提交能力。

## [0.0.7-pilot.2] - 2026-08-20

> CLI、macOS Desktop 与 DeepSeek Harness 只读插件以同一版本联合公开；最终 npm tarball、签名公证 DMG、
> `app.asar` 和干净公开历史均通过发布门禁。

### Changed

- 新增高价值规则质量门禁：17 个合成正负场景运行真实 parser、detector 与 core 聚合，分别统计漏报、意外
  告警、重复任务和隐私失败；不再用跨场景出现频率把稀有高影响规则列为删除候选。
- OpenCode 的 Bash 无限制与整体权限放行保留两条技术 finding 和完整验证条件，但聚合为一个新的执行权限
  行动任务；旧单规则 taskId 的接受记录安全失效，避免未经确认隐藏合并后的要求。
- 高价值规则质量基线扩展到 40 个正负场景和 43 条 ruleId，覆盖 MCP、Gemini shell、OpenClaw 暴露、
  parse/schema/truncation 扫描盲区及跨 Agent 共享代理/端点。
- 同一个 MCP server 的多条技术 finding 聚合为一个任务，同时保留不同 server 与 Claude global/project
  作用域隔离；同一个 OpenClaw gateway 的 bind 与 Funnel 暴露也聚合为一个新身份任务。
- CLI 与 Desktop 的 JSON 报告共用统一 builder，在保持原扫描字段兼容的同时新增行动 `summary`、完整
  `tasks` 和 `topTasks`，并与终端首次入口、HTML、Desktop 概览保持 taskId/requirements 一致。
- 新增 `agentreveal feedback` 最小规则反馈：只输出产品版本、ruleId、枚举判断与处置结果，严格拒绝路径、
  端点、taskId、报告、配置、凭证和自由文本等额外字段，不写文件且不自动上传。
- 新增 `agentreveal integration scan --format model-json`：复用真实 scan、行动聚合与 triage，但通过独立
  allowlist 只输出模型安全 Top 3；排除路径、端点、evidence、taskId、动态文本、指纹和整改命令，且不创建
  任务快照。
- 同一 npm 包新增固定 `@deepseek-ai/dsh@0.1.0-rc.7` 的 `dsh.bundle` 与 DSH Web 原生 `/agentreveal` 命令；
  Adapter 使用固定 Node/CLI/argv、无 shell、输出上限和 exact-key allowlist 复验，只展示固定枚举、计数、
  规则 ID 与 Top 3。隔离 HOME/DSH_HOME 生命周期已覆盖旧版安装、当前版升级、Web 启动、原生命令和卸载无
  残留。该能力已随 `0.0.7-pilot.2` 联合公开。

## [0.0.7-pilot.1] - 2026-08-05

### Changed

- 产品从 `AgentGuard` 改名为 `AgentReveal`。
  - npm 包从 `@wangmarsen/agentguard` 切到顶层包 `agentreveal`；CLI 二进制从 `agentguard` 改为 `agentreveal`。
  - GitHub 仓库从 `fengyufengzi/AgentGuard` 切到 `fengyufengzi/agentreveal`。
  - macOS Desktop `appId` 从 `com.agentguard.desktop` 切到 `app.reveal.desktop`；DMG 名同步为 `AgentReveal-0.0.7-arm64.dmg`。
  - 本地状态根从 `~/.agentguard/` 切到 `~/.agentreveal/`；项目配置 `.agentguard.json` → `.agentreveal.json`；
    备份目录、HMAC 域串、环境变量 `AGENTGUARD_*` → `AGENTREVEAL_*` 同步切换。
  - Electron IPC channel 命名空间从 `agentguard:<op>` 切到 `agentreveal:<op>`（26 个 channel + `window.agentguard` → `window.agentreveal`）。
- 历史 `CHANGELOG.md` 段（`0.0.6-pilot.4` 及更早版本）按"不静默改写历史结论"原则保留原 AgentGuard 名称。

### Migration

- 老用户：升级前手动卸载老应用，避免 macOS Gatekeeper 覆盖冲突（`sudo rm -rf "/Applications/AgentGuard.app"`）。
- 老 npm 包：`@wangmarsen/agentguard@0.0.6` 已 deprecate；按 npm 72 小时窗口执行 unpublish。
- ADR：`docs/adr/0001`、`0004`、`0005` 已标 Superseded；新约束见 `docs/adr/0006-product-rename-to-agentreveal.md` 与 `docs/adr/0007-desktop-bundle-identity.md`。

## [0.0.6-pilot.4] - 2026-08-04


### Added

- `0.0.6-pilot.4` 联合公开：Claude Code、Codex 与 CC Switch 的有效配置说明、私密可信快照、稳定漂移事件、
  Desktop 可信状态管理和确定性认证冲突处置计划；CLI 与 macOS Desktop 使用同一 core、schema 和版本。
- macOS 正式构建使用独立公证 hook，以非 S3 加速模式提交、等待 Accepted，并在生成 DMG 前完成 staple 验证，
  降低大体积 Electron App 的 multipart upload 超时风险。
- `agentguard posture`、`agentguard drift` 与显式 `drift baseline` 管理：可信快照只保存结构、分类、规则 ID
  和本机 keyed HMAC 身份，支持项目隔离、并发校验、接受/忽略到期、恢复/重新出现识别及最小化审计。
- CLI、JSON、HTML 与 Desktop 展示 Provider/真实上游、认证来源、权限、集成、不确定证据与配置漂移；
  高优先级变化和风险任务共用 Top 3 行动容量。
- Claude/Codex 认证冲突按当前生效来源和被覆盖来源生成固定处置顺序；CC Switch 区分官方直连、代理接管和
  真实上游异常。身份选择保持人工确认，不自动轮换凭证，不改写 Codex auth.json 或 CC Switch SQLite。
- CLI 增加 Claude Code 凭证迁移专用 `credential backup <task-id>` 与两阶段 `credential restore`：备份要求
  最新扫描任务，恢复默认只读预览，并以指纹确认、路径边界、完整性和并发修改校验保护事务写入；Desktop
  改为复用同一 core，同时保留当前会话授权、原生确认和自动复扫。
- macOS Desktop 为 Claude Code 明文凭证迁移增加“一键备份 / 一键恢复”：只备份实际目标设置文件，使用
  受保护且 Git 忽略的本地目录；恢复校验会话授权、manifest、内容摘要和当前配置指纹，要求原生确认，
  多文件失败自动回滚并复扫。即使原任务已消失，全局整改区仍保留当前会话恢复入口。
- macOS Claude Code 明文凭证引导增加完整 Keychain `apiKeyHelper` 迁移命令：只处理实际含明文的设置文件，
  删除 `ANTHROPIC_AUTH_TOKEN/API_KEY`、收紧权限且不打印凭证；Desktop 验证统一使用“复扫验证”按钮。
- `0.0.5-pilot.3` 联合 Public Preview：同版本 scoped npm CLI 与签名、公证 Apple Silicon DMG 已进入
  GitHub Pre-release；最终 tarball、DMG 和 `app.asar` 通过 Gitleaks、SHA-256 与公开位置回装验证。
- npm 发布名改为 `@wangmarsen/agentguard`，保留 `agentguard` 可执行命令；避免与现有 `agent-guard` 包触发
  registry 相似名称保护，并同步 scoped tarball 文件名、安装说明和联合发布工作流。
- `npm run release:scan-assets`：安全解包最终 npm tarball、只读挂载 DMG 并解包 `app.asar`，使用 100%
  脱敏的独立 Gitleaks 复核真实发布内容；macOS RC 在上传 DMG 前强制执行。
- 非 CLI macOS Desktop Pilot cohort、独立 quickstart 和反馈指标，覆盖 Gatekeeper、项目选择、无关文件夹
  权限、首次任务理解、复扫、报告导出和卸载。
- 约 40 秒的 macOS Desktop 合成 Demo 视频、封面和可复现生成脚本；不读取真实 Agent 配置或本机结果。
- macOS Desktop 首次主行动改为选择单个代码项目并解释项目根目录、实际读取范围与普通源代码边界；整机扫描
  降为带 macOS 受保护文件夹权限提示的次级入口。五页导航收敛为单页安全工作台，并区分可事务执行的
  baseline 一键整改与明文凭证的系统专属安全迁移引导。
- macOS Desktop 首次项目选择后增加持续可见的扫描中与可恢复失败状态：保留所选范围、只读/不上云说明，
  不伪造确定百分比，并提供原范围重试、更换项目和脱敏诊断入口。
- Desktop 扫描结果改为按 Agent 连续分组：先展示配置位置、连接/上游、显式模型或 Provider、安全相关权限、
  MCP 与凭证状态，再展示该 Agent 的问题和修复建议；跨 Agent 与项目任务保持独立分组。
- Desktop 移除左侧步骤菜单，报告与支持迁移到顶部应用栏；首屏改为 Agent 状态导航卡，取消独立全局统计区，
  点击 Agent 可直接进入其档案、风险与修复区域。
- Agent 导航进一步收敛为固定单选工作区：默认打开最高优先级 Agent，切换时正文只渲染当前 Agent；跨 Agent
  链路和项目决策拥有独立入口，不再依赖遍历长页面。
- Desktop 结果首屏删除重复统计与二次结论条，将范围和扫描状态合并成一行；修正窗口滚动容器，使 Agent
  切换器持续可见，并在每个档案加入返回列表操作和顶部“仅看本机”范围切换。
- Desktop Agent 卡增加“查看 / 当前”提示、琥珀色悬停与焦点反馈，以及左右方向键和 Home/End 切换；
  报告菜单、更多任务和任务详情统一使用可旋转箭头表达展开状态。
- 项目级低优先级规则忽略：CLI、HTML 和 Desktop 共用当前项目 + Agent + ruleId 语义，支持到期、撤销、
  追加式审计和跨 evidence/taskId 变化持续生效。
- 规则忽略只接受最新扫描任务中由 core 推导的 P2/P3 非强制修复候选；P0/P1、明文密钥、执行权限、
  扫描盲区和 Provider 端点分类保持不可忽略。
- `scan/report/first-run` 增加 additive `ignoredFindingCount`，HTML 与 Desktop 在隐藏默认任务的同时保留
  项目策略、撤销入口和完整脱敏技术证据。
- 首发高影响风险家族整改覆盖门禁，以及同项目 CLI/Desktop taskId、规则集合和项目忽略一致性集成测试。
- `npm run package:verify-install`：构建真实 tarball、校验文件清单、临时 prefix 安装并使用本地 tarball
  验证 npx 入口，不触发 registry 发布。
- README 第一屏明确连接、读取和执行边界，加入真实 CLI 扫描合成配置的脱敏示例；CLI 的 Linux/Windows
  标为 Beta，Desktop 明确 macOS 12+ Apple Silicon 首发边界，自动整改移入 Advanced。
- 仓库脱敏门禁纳入 `package-lock.json`，并按路径阻断误跟踪的 `.env`、密钥/证书、日志、配置备份、
  本机报告、DMG 和 tarball。
- Gitleaks v8.30.1 对当前树与全部可达历史的独立密钥扫描记录；最终 npm tarball 与 DMG 仍保留发布前闸门。
- macOS bundle 自动验证 arm64、最低系统版本、asar 入口、无外部 Node 依赖和隔离启动；移除 Electron 默认带入的
  宽泛网络例外及相机、麦克风、音频和蓝牙权限说明。
- Public Preview P0 外部接力顺序，明确发布身份、干净历史、Apple 发布链、全新设备、真实 Pilot 与联合发布闸门。
- macOS Desktop 体验与视觉系统重构：首次仅一个主 CTA，结果先结论后行动，任务技术细节按需展开，
  风险策略操作降为次级；品牌配色、键盘焦点、动态状态和 reduced-motion 支持统一覆盖五个核心页面。
- macOS Desktop 改为清爽的浅色开发工具视觉：白色工作画布、浅灰绿导航、细边框与低饱和风险状态，
  深绿图标和琥珀色只作为品牌与行动点缀；窗口加载底色同步为浅色，避免启动时闪黑。
- macOS 正式构建在签名前清理 app bundle 的 Finder/File Provider 扩展属性，避免 Developer ID
  `codesign` 因 resource fork 或 FinderInfo 拒绝候选产物；签名、公证和首次验证改在系统临时目录完成，
  最终 DMG 复制回仓库后会重新挂载并复核实际分发的 app。
- `npm run desktop:preview:capture` 使用合成数据离屏生成欢迎、总览、任务、链路和高级整改截图，不读取真实配置。
- 裸执行 `agentguard` 的统一首次入口：先展示实际 Provider/代理/上游，再按“必须处理 / 建议确认 /
  信息提示”汇总并展开前三个稳定行动任务和后续命令。
- CLI 与 Desktop 共用 `FirstRunSummaryV1` typed schema；`agentguard --json` 和
  `DesktopOverview.firstRun` 返回同一任务、配置地图、当前平台整改模板与 nextCommands。
- 桌面行动卡展示 core 生成的当前 macOS 安全命令，但 renderer 仍只能复制文本，不能执行任意命令。
- 六类 Agent 与框架兜底统一生成不含原始异常和堆栈的解析失败结果，明确配置文件、安全原因和“已安全跳过”；
  解析失败任务身份改为按配置路径稳定生成。
- CLI Pilot、源码开发、未来 npm 与 macOS DMG 的安装、手动升级、卸载及本地状态保留说明。
- 面向人类贡献者和 AI coding agent 的统一 `AGENTS.md`、精简 `CLAUDE.md`、贡献指南、阻断式审查协议和 PR 模板。
- 新增 Agent、修改安全规则、修改 Desktop IPC 三项仓库技能，并通过结构验证和模板占位符检查。
- `npm run check` 统一提交前门禁；贡献契约检查自动核对 Desktop IPC、preload、renderer 和脱敏诊断白名单。
- 关键安全路径 CODEOWNERS，以及本地隐私、规则语义、事务写入和 Desktop 权限边界四项 Accepted ADR。
- 五个无额外提示的 AI 贡献冷启动任务及结构校验，覆盖安全实现和应拒绝的越权需求。
- AI 冷启动评测工具链/干净基线预检与脱敏结果证据校验；challenge 任务缺少代理门禁证据时不能获得满分。

### Fixed

- macOS 本地预览改为可双击的开发启动器，复用当前仓库中已受信任的 Electron 运行时；macOS 26 不再产出
  缺少公证 ticket、启动即被系统终止的独立本地包。正式 bundle 验证现在也会捕获信号型闪退。
- Desktop typed service 改为相对主进程文件解析，修复开发预览选择项目后错误查找
  `desktop/dist/desktop/service.js`、导致扫描无结果的问题；打包后的 `app.asar` 路径保持一致。
- CC Switch 明文凭证整改不再误导用户把环境变量名填入普通 Provider 的 Token 字段；当前版本会将该内容
  作为 Token 字面量。Desktop 现在提供可复制的数据库/备份权限加固命令，并明确要求先创建独立最小权限
  Token、在原应用替换并测试后再撤销旧 Token；权限缓解不会被声明为已删除明文。
- Claude Code、Codex 和 Gemini CLI 扫描会识别 CC Switch 代理接管写入的 `PROXY_MANAGED` 非秘密鉴权占位符，
  不再误报明文凭证；只有全局代理与对应 Agent 路由均开启时才标记 CC Switch 接管，并避免把 CC Switch
  基础设施重复计算为另一个 Agent。真实 Provider 凭证与两跳链路仍保留。

## [0.0.5-pilot.1] - 2026-07-16

### Added

- `0.0.5-pilot.1` 候选：根据 macOS、Linux 和 Windows 生成不包含明文凭证的修复指引；HTML 支持复制命令。
- `agentguard risk accept/list/revoke`：记录接受原因、可选到期时间和撤销历史；P0 任务强制限时接受。
- 风险接受记录使用本地 0700 目录、0600 文件和原子写入；有效接受不进入默认行动队列和高危退出码。
- acceptance schema v2 按规范化项目 `scopeId` 隔离；旧 v1 无作用域记录保留为 legacy 且不再生效。
- 聚合任务规则要求模型：HTML 逐条展示全部子规则的处置、验证和接受条件。
- `risk accept` 两阶段确认、静态规则审计摘要，以及 `risk verify` 单任务验证闭环。
- 当前产品能力规范化摘要与修复/风险接受开发计划。

### Changed

- HTML 将有效接受任务移入“已接受风险”，同时保留完整技术证据。
- HTML 标记修复命令是完整解决、风险缓解或辅助步骤，并明确报告是需要重新生成的静态快照。
- `scan --json` 与 JSON 报告增加 `acceptedTaskCount`，明确本地策略排除的任务数量。
- 源码版本进入 `0.0.5-pilot.1` 候选；该版本尚未发布 Release。

### Known limitations

- 跨平台命令是修复引导，不等同于已完成凭证迁移；尚无 `secret plan/migrate`。

## [0.0.4-pilot.1] - 2026-07-15

### Added

- 63 条具体规则的机器可读处置矩阵，并与 10 条 baseline 能力建立效果映射。
- 下一步行动报告：按 `fix/review/cleanup/observe` 和 `P0–P3` 组织行动任务。
- 根因任务聚合、稳定 task ID、Top 3 行动和关联 finding 展示。
- 每个任务的行动理由、下一步、验证方法、修复方式和接受条件。

### Changed

- HTML 首页按行动任务而非原始 finding 计数，技术证据区仍保留所有发现。
- OpenClaw 环境变量引用不再误报为明文凭证；MCP 疑似密钥规则降为低置信确认项。

### Security

- 行动字段、任务明细和证据继续执行 HTML 转义与明文凭证泄漏回归。

## [0.0.3-pilot.3] - 2026-07-14

### Added

- Pilot Ready 试用方案、结构化反馈模板和阶段出口标准。
- 机器可读输出契约 v1；所有 JSON 命令输出增加 `schemaVersion` 和 `command`。
- 发布包纳入 `docs/` 和 `examples/`，确保 README 中的试用手册、输出契约和 CI 示例可用。
- 提交预编译 `dist/` 并通过 GitHub Pre-release 分发标准 npm tarball，安装不依赖 TypeScript 或 npm Git 依赖行为。

### Security

- baseline apply 改为同目录原子写入，写后验证失败会自动从备份回滚。
- apply 前校验配置源文件哈希，避免使用已过期计划覆盖并发修改。
- 备份目录/manifest/配置副本使用仅当前用户可读权限，并记录 SHA-256 完整性和原文件权限。
- restore 拒绝路径穿越备份 ID、越界备份路径和被篡改的备份内容。

## [0.0.3-pilot.2] - 2026-07-14

### Withdrawn

- 干净的全局安装环境中，npm Git 依赖准备阶段找不到 devDependency `tsc`，导致 `prepare` 失败。
- 该版本未向试用者分发，远端标签已撤回，由 `0.0.3-pilot.3` 替代。

## [0.0.3-pilot.1] - 2026-07-14

### Withdrawn

- 远端安装验证发现 Git 标签安装不会执行现有 `prepack`，安装产物缺少 `dist/cli.js`。
- 该版本未向试用者分发，远端标签已撤回，由 `0.0.3-pilot.3` 替代。

## [0.0.2] - 2026-07-11

### Added

- **OpenClaw adapter (P1)** — discover `~/.openclaw/openclaw.json` + `service-env/`;
  identify plaintext `appSecret` / `auth.token`, non-loopback `bind`, Tailscale
  `funnel` exposure, multi-agent workspace overlap, and non-npm plugin sources.
  Real-world finding on author's machine: 2 high-risk plaintext secrets.
- **Gemini CLI adapter (P1)** — discovery-only (settings.json + .env presence,
  no credential reads).
- **Provider trust policy** — `.agentguard.json` / `agentguard.config.json`
  allow marking self-hosted endpoints as `trusted` / `internal` with URL,
  host, or `*.example.com` wildcards. The HTTP flag is preserved.
- **Workspace sensitive-file scan** — filename-only detection of `.env`,
  private keys, cloud credentials, kubeconfig; included in `scan` output.
- **OpenCode security baseline** — `baseline --profile {balanced,safe} --dry-run`
  previews changes; `apply --backup` enforces backup; `restore [--id]` rolls back.
- **Cross-agent correlation** — `XAGENT_SHARED_PROXY` /
  `XAGENT_SHARED_ENDPOINT` findings when ≥2 agents share a proxy/endpoint.
- **`map` command** — multi-agent config map with proxy two-hop chain.
- **`report --format html|json`** — self-contained offline HTML (inline CSS,
  HTML-escaped) and JSON output.

### Security & Privacy

- `scan --json` output verified clean of plaintext API keys via grep test
  suite (privacy red-line regression in `provider-policy`, `sensitive`,
  `gemini`, `openclaw` tests).
- HTTP flag persists even when an endpoint is marked trusted.

### Engineering

- Adapter architecture: adding support for a new agent is a single new file +
  one line in `src/adapters/index.ts`.
- 96 unit tests pass (`node --test test/**/*.test.mjs`); Node ≥ 22 required
  (Node 24+ in development; `node:sqlite` is experimental in Node 22).
- GitHub Actions CI on Node 22 + 24.

## [0.0.1] - 2026-07-10

### Added

- Initial release. CLI scaffolding + `doctor` discovery for Claude Code,
  Codex, CC Switch, OpenCode (P0).
