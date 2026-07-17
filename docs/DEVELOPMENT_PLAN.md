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

- [ ] 裸执行 `agentguard` 即进入统一首次入口，`agentguard scan` 保持兼容；
- [ ] 首次运行自动完成 Agent 发现、扫描、配置地图摘要和下一步建议；
- [ ] 将“实际上游链路”放在结果首屏；
- [ ] 终端只优先展示最重要的 3 至 5 条风险；
- [ ] 其他风险进入详细分组或报告；
- [ ] 将风险分成“必须处理 / 建议确认 / 信息提示”；
- [ ] 首屏行动使用稳定 taskId，并直接给出 report、accept/trust 和 verify 的下一条命令；
- [ ] 为 CLI 和桌面定义同一个 first-run/action-summary JSON 契约；
- [ ] 配置解析错误不得直接暴露堆栈，应输出文件、原因和安全跳过说明；
- [ ] 提供清晰的卸载说明。

### 4.2 风险质量

- [ ] 核对最重要规则的真实命中率；
- [ ] 去除重复告警和低价值告警；
- [ ] 未知 Provider 支持通过 CLI 确认 trusted / internal / untrusted，不要求普通用户手写配置文件；
- [ ] 明确区分接受当前任务、信任端点和项目级忽略，避免一种操作吞掉其他独立风险；
- [ ] 支持可信端点的 add/list/remove，并在报告中保留来源与审计状态；
- [ ] 支持项目级规则忽略或白名单，并在报告中保留审计痕迹；
- [ ] 信任端点不得掩盖 HTTP、明文密钥、危险权限等独立风险；
- [ ] 明文密钥、共享密钥、代理链路、危险权限和公网暴露必须有明确整改步骤；
- [x] 对同一根因产生的多条 finding 做聚合，并保留所有子规则处置语义。

### 4.3 P0-B 完成标准

- 新用户只运行一个入口即可看到 3 至 5 个稳定行动任务；
- 用户不编辑 JSON 也能登记、查看和撤销自建/内部端点信任；
- 同一个任务可以修复、接受或验证，三种状态不会互相混淆；
- CLI 输出契约可直接供桌面版消费，不依赖解析终端文本。

## 5. P0-C：macOS Desktop Public Preview

现有 Electron 壳作为工程起点，不重新选型或重写 core。第一版优先支持 Apple Silicon；Intel 支持是否
进入首发由打包与真实设备验证结果决定，并在支持矩阵中明确说明。

### 5.1 第一版页面与流程

- [ ] 首次启动说明本地运行、默认只读、不上传以及会读取哪些配置；
- [ ] 选择或确认要扫描的项目目录，不以应用安装目录作为扫描 cwd；
- [ ] 首页一次完成 Agent 发现、扫描、实际 Provider/代理/上游摘要；
- [ ] 首屏只展示最重要的 3 个行动任务，并可进入完整列表；
- [ ] 展示风险详情、整改步骤和适配当前 macOS 的命令；
- [ ] 提供“接受当前风险”和“信任此端点”两个不同操作，并要求确认原因；
- [ ] 处置后可以重新验证并刷新任务状态；
- [ ] 导出并打开 HTML / JSON 报告，输出到用户可写目录；
- [ ] baseline dry-run 作为高级入口；
- [ ] 自动修复作为二级入口，必须先展示 diff、backup 和 restore 信息。

### 5.2 工程与安全要求

- [ ] 桌面版直接复用同一个 core 和 typed schema，不通过解析终端文案构建 UI；
- [ ] CLI 和桌面输出使用同一任务 ID、处置、信任与验证状态；
- [ ] 主进程只暴露白名单 typed IPC，渲染进程不得执行任意命令或读取任意文件；
- [ ] 评估并启用 Electron renderer sandbox，保持 contextIsolation 和禁用 nodeIntegration；
- [ ] 报告、日志和本地状态写入明确的用户数据目录，不写入 app bundle / asar；
- [ ] 完成 macOS Developer ID 签名、hardened runtime、notarization 和 staple；
- [ ] 提供本地错误日志导出，默认不自动上传；
- [ ] 第一公开版不做复杂自动更新，README 明确手动升级方式。

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

- [ ] 检查并锁定 npm 包名；
- [ ] 完成全新 macOS Apple Silicon 环境安装测试；
- [ ] 验证 Node.js 22 和 24；
- [ ] 决定 Windows / Linux 是正式支持还是 Beta，并写入 README；
- [ ] 完成 `npm pack --dry-run` 与干净目录安装测试；
- [ ] 完成 `npx agentguard` 验证；
- [ ] 仓库公开前完成隐私和敏感信息检查；当前树与 CI 门禁已完成，Git 历史仍需清理并归零；
- [x] 提供当前树、暂存区、npm 发布内容和 Git 历史四种检查模式，且不回显命中内容；
- [ ] 使用独立 secret scanner 复核当前树、全部历史和最终发布 tarball；
- [ ] 准备同一版本号的 npm 包、CLI 安装文档和卸载文档；
- [ ] 增加安装失败、误报、Agent 适配和隐私问题 Issue 模板。

### 6.2 macOS 安装与发布

- [ ] 在全新 Apple Silicon macOS 用户环境验证 DMG 安装、首次启动、扫描、报告和卸载；
- [ ] 验证 Gatekeeper、签名、公证和 staple 结果；
- [ ] DMG 不依赖用户预装 Node.js 或全局 CLI；
- [ ] 明确 macOS 最低版本、芯片支持和已知限制；
- [ ] GitHub Release 同时附带 macOS DMG、校验值和 CLI 安装入口。

### 6.3 README 与演示

- [ ] README 第一屏回答“连接谁、读取什么、执行什么”；
- [ ] 放置脱敏的真实扫描示例；
- [ ] 增加 30 至 60 秒 Demo GIF 或短视频；
- [ ] 明确本地运行、默认只读、不上传、脱敏输出；
- [ ] 明确支持矩阵和已知限制；
- [ ] 自动修复能力放在 Advanced 部分，不作为首次卖点。

### 6.4 联合发布闸门

- [ ] 5 至 10 人 Pilot 同时覆盖 CLI 用户和非 CLI 桌面用户；
- [ ] 同一台机器、同一项目下 CLI 与桌面版的核心任务集合一致；
- [ ] 完成公开仓库历史清理与独立 secret scanner 复核；
- [ ] 同一 Public Preview tag 和 GitHub Release 同时发布 npm CLI 与 macOS DMG；
- [ ] 两个入口任一未通过安装、安全或结果一致性验证，则不拆分提前公开另一个入口。

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

- 非 CLI 用户可独立选择项目并完成扫描；
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
