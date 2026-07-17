# AgentGuard 试用说明

> 预计用时：15–20 分钟。请在你日常使用 AI Coding Agent 的项目目录中执行。

> 本文件对应私有 GitHub Pre-release `0.0.5-pilot.1`，只发给受邀 Pilot 用户，不发布到 npm registry。

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

### 确认某项风险暂时不处理

> 以下命令属于 `0.0.5-pilot.1`。风险接受只影响当前项目和本机，不会自动同步到团队成员。

如果报告中的端点、MCP 或其它配置已经由你确认可信，可以复制报告卡片里的 `task-...`，记录接受原因：

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

`0.0.5` 报告中的 Keychain / Secret Service / DPAPI 命令只完成安全存储或当前会话注入，不等于凭证
已经迁移。用户仍需配置目标 Agent 的 helper/引用、验证真实认证、轮换旧凭证并重新扫描。

## 4. 试用后反馈

请填写 [`pilot-feedback-form.md`](pilot-feedback-form.md)，建议文件名改为：

```text
AgentGuard_Pilot_Feedback_你的编号.md
```

安全提醒：不要在反馈中粘贴完整配置、完整 HTML/JSON 报告、API Key、Token、私钥或未脱敏的
内部域名。描述风险时优先填写规则 ID，例如 `CLAUDE_PLAINTEXT_TOKEN`。
