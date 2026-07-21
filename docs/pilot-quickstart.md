# AgentGuard CLI Pilot 试用说明

> 预计用时：15–20 分钟。请在你日常使用 AI Coding Agent 的项目目录中执行。

> 本文件对应私有 GitHub Pre-release `0.0.5-pilot.1`，只发给受邀 Pilot 用户，不发布到 npm registry。

本说明用于 CLI cohort。完全不使用终端的 macOS Desktop 试用者应改用
[`desktop-pilot-quickstart.md`](desktop-pilot-quickstart.md)，且必须等待签名、公证的固定 DMG 候选。

## 1. 安装

环境要求：macOS、Node.js 22 或更高版本，并已获得 AgentGuard 私有仓库访问权限。

先确认本机版本：

```bash
node --version
gh auth status
```

下载并安装当前试用版：

```bash
mkdir -p /tmp/agentguard-pilot

gh release download v0.0.5-pilot.1 \
  --repo fengyufengzi/AgentGuard \
  --pattern 'agentguard-0.0.5-pilot.1.tgz' \
  --dir /tmp/agentguard-pilot \
  --clobber

npm install -g /tmp/agentguard-pilot/agentguard-0.0.5-pilot.1.tgz
agentguard --version
```

最后一条命令应输出：

```text
0.0.5-pilot.1
```

如果没有安装 GitHub CLI，也可以在私有仓库的 Releases 页面下载
`agentguard-0.0.5-pilot.1.tgz`，然后执行：

```bash
npm install -g ~/Downloads/agentguard-0.0.5-pilot.1.tgz
agentguard --version
```

请不要使用 `npm install -g git+https://...`。部分 npm 11 环境会产生失效链接；本次试用统一使用
Release 中的 `.tgz` 文件。

## 2. 必跑命令

先进入一个你日常使用 Claude Code、Codex、OpenCode、Gemini CLI 等工具的项目目录：

```bash
cd /你的项目目录
```

然后依次执行：

```bash
agentguard doctor
agentguard scan
agentguard map
agentguard report --format html
```

| 命令 | 作用 | 是否修改配置 |
|---|---|---|
| `agentguard doctor` | 找出本机已配置的 Agent 和配置路径 | 否 |
| `agentguard scan` | 扫描 Provider、代理、MCP、明文密钥和危险权限等风险 | 否 |
| `agentguard map` | 展示多个 Agent、代理和真实上游之间的关系 | 否 |
| `agentguard report --format html` | 在当前目录生成便于本地查看的 `agentguard-report.html` | 否 |

注意：`scan` 发现高危风险时可能以退出码 `2` 结束。这表示“发现了风险”，不代表程序崩溃。

桌面版首次打开时请选择一个你日常使用 AI Coding Agent 的代码项目根目录，通常是包含 `.git`、
`package.json` 或 `pyproject.toml` 的文件夹。项目扫描会解析项目内的 Agent 配置；普通源代码只检查
文件名，不读取内容。整机扫描会检查用户主目录并可能触发 macOS 对“桌面”“文稿”“下载”等文件夹的
权限请求，只在本轮确实需要跨项目排查时使用。

## 3. 可选命令

只想预览安全基线建议时执行：

```bash
agentguard baseline --profile balanced --dry-run
```

该命令只显示建议和差异，不修改文件。

如果你明确理解差异并愿意测试自动整改，可再执行：

```bash
agentguard apply --profile balanced --backup
```

该命令会先备份，再修改工具明确支持的配置。如需恢复，请在同一个项目目录执行：

```bash
agentguard restore
```

自动整改不是本轮试用的必做项。不确定时，只执行 `--dry-run`。

桌面版可在“安全修改与恢复（高级）”区域完成同一流程：生成预览、查看逐文件 diff、点击“备份并应用”、在 macOS
原生确认框中确认，然后查看复扫结果。应用后可点击“恢复应用前配置”；如果文件又被其它工具修改，
AgentGuard 会拒绝恢复，避免覆盖新内容。备份包含完整原配置，请勿复制或上传备份目录。

### 确认某项风险暂时不处理

> 以下命令属于 `0.0.5-pilot.1`。风险接受只影响当前项目和本机，不会自动同步到团队成员。

如果报告中的 MCP、权限或其它配置已经由你确认暂时不处理，可以复制报告卡片里的 `task-...`，记录接受原因：

```bash
agentguard risk accept task-xxxxxxxxxxxx --reason "个人自建服务，已核对 TLS、访问控制和数据范围"
```

上面的命令只显示整组任务的全部规则、严重度和接受条件，不会写入。确认这些条件全部成立后执行：

```bash
agentguard risk accept task-xxxxxxxxxxxx --reason "个人自建服务，已核对 TLS、访问控制和数据范围" --confirm
agentguard report --format html
```

可选增加到期时间：

```bash
agentguard risk accept task-xxxxxxxxxxxx --reason "限时测试" --expires 2026-12-31 --confirm
```

接受后不会再进入默认待办，但报告仍保留审计记录。查看或撤销：

```bash
agentguard risk list
agentguard risk verify task-xxxxxxxxxxxx
agentguard risk revoke task-xxxxxxxxxxxx
```

完成真实修复后也应运行 `risk verify`。它会说明任务已解决、仍存在、只消失了部分规则、当前已接受，
或因配置对象变化而生成了新的任务 ID。HTML 是静态快照，verify 后请重新生成报告。

不要为了消除提示而接受尚未确认归属的端点，也不要接受真实明文密钥作为长期方案。
P0 任务必须设置 `--expires`，不能永久隐藏。

### 登记自己控制的 Provider 端点

如果未知 Provider 确实是你或组织维护的 HTTPS 服务，优先使用报告卡片里的信任命令，而不是接受整组任务：

```bash
agentguard trust add "relay.example.com" --kind trusted --reason "本人维护，已核对 TLS、访问控制和数据范围"
agentguard trust list
agentguard scan
```

组织内网服务可把 `--kind` 改为 `internal`。信任只消除未知端点提示；HTTP、明文密钥和危险权限仍会
独立显示。原因会写入项目配置并可能进入版本控制，请勿填写密钥。撤销时执行：

```bash
agentguard trust remove "relay.example.com" --kind trusted --reason "服务已停用或需要重新审核"
```

### 忽略当前项目中已审核的低优先级规则

如果报告明确给出了 `agentguard ignore add ...`，且你希望同一 Agent 的该条规则在 evidence 或 task ID
变化后也不再重复提示，可以直接复制命令：

```bash
agentguard ignore add task-xxxxxxxxxxxx --rule OPENCODE_MCP_LOCAL --reason "已审核固定版本的项目内文档 MCP"
agentguard ignore list
agentguard scan
```

需要复审时可设置 `--expires 2026-12-31`。撤销时执行：

```bash
agentguard ignore remove OPENCODE_MCP_LOCAL --agent opencode --reason "项目已移除该 MCP"
```

这与 `risk accept` 不同：accept 只接受当前稳定任务；ignore 按当前项目 + Agent + ruleId 跨任务变化持续
生效。它也与 `trust add` 不同：trust 只确认 Provider 端点归属。AgentGuard 不允许项目级忽略 P0/P1、
明文密钥、危险执行权限、扫描盲区或 Provider 端点分类。忽略原因会写入项目配置并可能进入版本控制，
不要填写密钥、内部端点或其它敏感信息。

`0.0.5` 报告中的 Keychain / Secret Service / DPAPI 命令只完成安全存储或当前会话注入，不等于凭证
已经迁移。用户仍需配置目标 Agent 的 helper/引用、验证真实认证、轮换旧凭证并重新扫描。

## 4. 试用后反馈

如果桌面版遇到启动、扫描、整改或导出问题，请从顶部“报告”或系统“帮助”菜单选择“导出脱敏诊断”，把 JSON 保存到自己选择的
位置。它只包含应用/运行时版本，以及操作时间、固定操作名、结果和固定错误分类；不包含项目路径、
Provider 端点、task ID、配置内容或原始错误文本，也不会自动上传。发送前仍请打开文件快速确认内容，
然后与反馈表一并回收。CLI 问题没有此按钮，请只粘贴必要的脱敏错误摘要。

桌面版常用快捷键：`⌘R` 检查当前范围、`⇧⌘R` 只检查这台 Mac、`⌘O` 选择项目、`⇧⌘E` 导出行动报告。
应用会恢复上次窗口尺寸、位置和最大化状态，但该本机状态文件不记录当前项目、扫描结果或其它安全证据。
结果页的“建议先处理”列出全局 Top 3，可直接跳到对应 Agent；Agent 切换器支持左右方向键和 Home/End。
扫描或处置期间控件会暂时禁用，完成后状态区会明确说明成功、取消或失败，避免重复操作。

请填写 [`pilot-feedback-form.md`](pilot-feedback-form.md)，建议文件名改为：

```text
AgentGuard_Pilot_Feedback_你的编号.md
```

安全提醒：不要在反馈中粘贴完整配置、完整 HTML/JSON 报告、API Key、Token、私钥或未脱敏的
内部域名。描述风险时优先填写规则 ID，例如 `CLAUDE_PLAINTEXT_TOKEN`。

## 5. 升级与卸载

收到新版 Pilot `.tgz` 后，直接重新执行 `npm install -g 新版文件路径` 覆盖旧版，再确认：

```bash
agentguard --version
agentguard
```

卸载 CLI：

```bash
npm uninstall -g agentguard
command -v agentguard
```

默认卸载只删除命令，不删除 `~/.agentguard` 的本地审计记录、项目 `.agentguard` 的整改备份、项目 Provider
信任策略或已经导出的报告。确认不再需要恢复和审计后才能单独清理这些数据。桌面版应先退出应用，再从
Applications 移到废纸篓。完整说明见
[`install-upgrade-uninstall.md`](install-upgrade-uninstall.md)。
