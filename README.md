# AgentGuard

> **Security Configuration Center for AI Coding Agents**
> 面向多 Agent、多模型、多 Provider 的 AI Coding Agent 安全配置中心

**让 AI Coding Agent 好用，也可控。**
**See, configure, and govern your AI coding agents safely.**

---

## ⚡ 30 秒看懂 AgentGuard

AgentGuard 是一个**本地运行、默认不修改 Agent 配置**的命令行工具，帮你看清并治理机器上多个
AI Coding Agent 的安全配置。它扫描 **Claude Code / OpenCode / Codex / CC Switch / Gemini CLI / OpenClaw**
的配置文件，识别未知中转 API、明文密钥、危险权限、可疑 MCP、以及被隐藏的代理链路，
并把风险汇成中文报告——**证据全程脱敏，绝不打印完整密钥**。

- 🔍 **看清** — `doctor` 发现 Agent 和配置路径，`scan/map` 展开模型、Provider 与代理链路
- ⚠️ **识险** — 深度解析每个 Agent 的 Provider / MCP / 密钥 / 权限风险（`scan`）
- 🗺️ **画图** — 生成多 Agent 配置地图，展开 Agent → 本地代理 → 真实上游两跳链路（`map`）
- 🔗 **关联** — 跨 Agent 集中点分析：多个 Agent 汇聚同一代理 / 未知端点即单点失陷面
- 📊 **行动报告** — 按“立即处理 / 需要确认 / 建议清理 / 配置观察”给出下一步和验证方法（`report`）

---

## 🚀 快速开始

> 当前为 **Pilot 预发布版本（`0.0.5-pilot.1`）**，**暂不发布到 npm registry**。团队内部通过
> 私有 GitHub Pre-release 的标准 npm tarball 安装；详见下方「🔒 安装方式」。

> `0.0.5-pilot.1` 新增跨平台修复引导和 `risk accept/list/revoke/verify`。项目作用域、聚合任务完整条件、
> 单任务验证、tarball 打包和 Release 资产回装均已完成，可用于受邀的 5–10 人私有 Pilot。

**环境要求**：Node.js ≥ 22（`scan`/`map` 读取 CC Switch 的 SQLite 配置依赖
`node:sqlite`；开发环境使用 Node 24+）。

### 🔒 安装方式（GitHub Pre-release）

```bash
# 需要 GitHub CLI 已登录，并具备私有仓库访问权限
gh release download v0.0.5-pilot.1 \
  --repo fengyufengzi/AgentGuard \
  --pattern 'agentguard-0.0.5-pilot.1.tgz'

npm install -g ./agentguard-0.0.5-pilot.1.tgz
agentguard --version
```

也可以从私有仓库的 Releases 页面下载 `.tgz`，再执行：

```bash
npm install -g ~/Downloads/agentguard-0.0.5-pilot.1.tgz
```

不再推荐 `npm install -g git+https://...`：npm 11 的全局 Git 依赖安装可能保留指向临时 clone
的失效链接。Release tarball 已包含预编译 `dist/`，安装时不需要 TypeScript。

如需从源码复现已发布的 `0.0.5-pilot.1`：

```bash
git clone --branch v0.0.5-pilot.1 --depth 1 https://github.com/fengyufengzi/AgentGuard.git
cd AgentGuard
npm install
npm run build
npm link

agentguard --version
```

> **为何暂不 `npm publish`？** 详见
> [`docs/release-0.0.5-pilot.1.md`](docs/release-0.0.5-pilot.1.md)。简言之：API 仍在演进，
> 团队内 GitHub Pre-release 分发已足够；等形态稳定再考虑公开发布。
> **提示**：`agentguard` 这个 npm 包名目前仍可被占用——若团队后续决定发布，
> 在首次 `npm publish` 之前请先确认这个名字未被他人抢注。

### Pilot 试用

当前阶段优先验证现有能力，不继续扩 Agent 或建设 Dashboard：

- 发给试用者：[`docs/pilot-quickstart.md`](docs/pilot-quickstart.md)
- 试用后填写并回收：[`docs/pilot-feedback-form.md`](docs/pilot-feedback-form.md)
- 试点负责人使用的完整流程和出口标准：[`docs/pilot-readiness.md`](docs/pilot-readiness.md)
- 下一步行动报告开发计划：[`docs/development-plan-actionable-report.md`](docs/development-plan-actionable-report.md)
- 修复助手与风险接受计划：[`docs/development-plan-remediation-and-acceptance.md`](docs/development-plan-remediation-and-acceptance.md)
- 当前产品方向：[`docs/PRODUCT_DIRECTION.md`](docs/PRODUCT_DIRECTION.md)
- 当前产品能力摘要：[`docs/product-capabilities.md`](docs/product-capabilities.md)
- 总体开发计划：[`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md)
- 文档状态与优先级：[`docs/DOCUMENT_STATUS.md`](docs/DOCUMENT_STATUS.md)
- `0.0.5` 发布前加固与 Pilot 计划：[`docs/development-plan-0.0.5-hardening-and-pilot.md`](docs/development-plan-0.0.5-hardening-and-pilot.md)
- 开源发布安全清单：[`docs/OPEN_SOURCE_RELEASE_CHECKLIST.md`](docs/OPEN_SOURCE_RELEASE_CHECKLIST.md)
- `0.0.5-pilot.1` 未发布草案与 blocker：[`docs/release-0.0.5-pilot.1.md`](docs/release-0.0.5-pilot.1.md)
- 63 条规则处置矩阵：[`docs/rule-disposition-matrix.md`](docs/rule-disposition-matrix.md)

试用记录不得包含完整配置、凭证或未脱敏内部信息。

### Demo 流程

```bash
agentguard doctor
agentguard scan
agentguard map
agentguard report --format html

# 先看受支持的 OpenCode / Claude Code / Gemini CLI / OpenClaw baseline 会改什么
agentguard baseline --profile balanced --dry-run

# 确认 diff 后再应用；apply 强制要求 --backup
agentguard apply --profile balanced --backup

# 如需回滚，恢复最近一次备份
agentguard restore
```

### Mac 桌面版（开发者预览）

`v0.0.2` 之后已加入一个 Electron 桌面壳 MVP，复用现有 CLI 能力，第一版只开放只读扫描、
HTML 报告生成和多 Agent baseline dry-run。桌面版当前面向内部开发/试用，不是签名后的 `.app`
安装包。

```bash
git clone https://github.com/fengyufengzi/AgentGuard.git
cd AgentGuard
npm install
npm run desktop
```

桌面版默认通过 Electron 自身的 Node 模式运行内置 CLI，不要求用户额外配置 PATH；开发调试时
也可用 `AGENTGUARD_NODE=/path/to/node npm run desktop` 强制指定外部 Node。
如果 Electron 二进制下载较慢，可临时使用
`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm run desktop`。

未签名打包：

```bash
# 生成可本地运行的 .app 目录包
npm run desktop:pack

# 生成未签名 DMG（内部验证用；首次打开可能触发 Gatekeeper 提示）
npm run desktop:dist
```

当前 `electron-builder.yml` 明确关闭签名（`identity: null` / `dmg.sign: false`）。如果要对外或
更大范围内部分发，需要再接入 Apple Developer ID 签名、notarization 公证和 staple 流程。

---

## 🧭 命令一览

下表以 `0.0.5-pilot.1` 为准。

主要扫描与变更命令支持 `--json`（`report` 用 `--format json`）；`risk` 当前输出人类可读审计信息。
机器输出带有
`schemaVersion: 1` 和 `command`，兼容约定见 [`docs/output-schema-v1.md`](docs/output-schema-v1.md)。

| 命令 | 作用 |
|---|---|
| `agentguard doctor` | 体检本机环境，列出已发现的 Agent 与配置路径（只探测存在性，不读密钥） |
| `agentguard scan` | 深度扫描全部 Agent 的风险；含**跨 Agent 关联**段；有高危及以上以退出码 `2` 退出 |
| `agentguard provider scan` | 仅输出 Provider / base_url / 代理链路相关风险 |
| `agentguard map` | 生成多 Agent 配置地图，展开代理两跳链路 |
| `agentguard report` | 扫描并生成可存档报告（`--format html\|json`，`--output <path>`，`-` 为标准输出） |
| `agentguard baseline --profile balanced --dry-run` | 生成 OpenCode / Claude Code / Gemini CLI / OpenClaw 安全基线建议和 diff，不写文件 |
| `agentguard backup` | 备份当前 OpenCode 配置到项目 `.agentguard/backups` |
| `agentguard apply --profile balanced --backup` | 应用支持范围内的多 Agent baseline 变更，应用前强制备份 |
| `agentguard restore` | 恢复最近一次备份，或用 `--id <backup-id>` 指定 |
| `agentguard risk accept <task-id> --reason <原因> [--confirm]` | 先展示整组规则条件；只有显式确认才从默认待办和高危退出码移除并保留审计 |
| `agentguard risk list [--all]` | 查看有效接受记录，或包含已过期/已撤销的完整历史 |
| `agentguard risk verify <task-id>` | 重新扫描并判断任务已解决、缓解、仍存在、接受或身份变化 |
| `agentguard risk revoke <task-id>` | 撤销风险接受，使任务重新进入默认待办 |

### `doctor` — 环境体检

```text
$ agentguard doctor

AgentGuard Doctor

Detected agents:
  [OK] Claude Code  found  ~/.claude
  [OK] Codex        found  ~/.codex/config.toml
  [OK] CC Switch    found  ~/.cc-switch/cc-switch.db
  [OK] OpenCode     found  ~/.config/opencode/opencode.json

Summary: 6/6 agents configured.
```

### `scan` — 深度风险扫描

按 Agent 分段列出风险，末尾追加**跨 Agent 关联**与 Summary。对 Codex / CC Switch 等不可自动收敛的
高危项，会在风险条目下附**分步手动整改步骤**。示例（端点已改为示意值）：

```text
$ agentguard scan

▍Claude Code  2 项
  [高危] settings.json 中明文存有 ANTHROPIC_AUTH_TOKEN / API_KEY  (CLAUDE_PLAINTEXT_TOKEN)
  [提示] ANTHROPIC_BASE_URL 指向本地端点  (CLAUDE_LOCAL_BASE_URL)
        证据: baseUrl=http://127.0.0.1:15721

▍跨 Agent 关联
  [高危] 2 个 Agent 共用同一本地代理 127.0.0.1:15721  (XAGENT_SHARED_PROXY)
        证据: proxy=127.0.0.1:15721 | agents=Claude Code, CC Switch | count=2

────────────────────────────────────────────────
Summary: 共 N 项风险  严重 0 · 高 x · 中 y · 低 0 · 提示 z  （含跨 Agent 关联 1）
```

用于 CI：

```bash
agentguard scan --json > scan.json   # 有高危及以上时退出码为 2
```

### `map` — 多 Agent 配置地图

```text
$ agentguard map

AgentGuard 配置地图

  Agent        配置  端点              MCP  密钥  敏感  权限  风险
  ───────────  ────  ────────────────  ───  ────  ────  ────  ────
  Claude Code  ✓     127.0.0.1:15721   0    1     0     0     高危
  Codex        ✓     127.0.0.1:7890    2    0     0     1     中危
  CC Switch    ✓     relay.example +4  0    2     0     0     高危
  OpenCode     ✓     —                 0    0     0     0     OK
  当前项目     ✓     —                 0    0     1     0     高危

代理链路（真实上游）：
  claude  →  本地代理 127.0.0.1:15721  →  https://relay.example
  提示：base_url 指向本地代理时，勿把 127.0.0.1 误判为安全本地服务。
```

### `report` — 可存档报告

```bash
agentguard report                        # → ./agentguard-report.html
agentguard report --format json          # → ./agentguard-report.json
agentguard report -f html -o -           # 输出到标准输出
```

HTML 为自包含单文件（内联 CSS + 内联 JS，无外部依赖，可离线打开），所有动态内容
HTML 转义。报告首页先按行动优先级展示 **立即处理 / 需要确认 / 建议清理 / 配置观察**，每项包含
下一步、验证方法和处置方式；baseline 与部分凭证场景还会按当前 macOS / Linux / Windows 生成
本机命令模板，其余任务继续提供人工步骤。聚合任务逐条展示全部关联规则的下一步、验证和接受条件，
并标明命令属于“完整解决 / 风险缓解 / 辅助步骤”。命令可以复制，但静态 HTML 不会直接执行本地操作；
修改配置后需运行卡片中的 `risk verify` 并重新生成报告。下方继续保留 **Agent × 严重度总览表**与严重度过滤。

### `risk` — 接受、查看与撤销风险

> `0.0.5-pilot.1` 已完成 acceptance 项目作用域、聚合条件、接受前确认、单任务验证和 Release 资产回装验证。
> 当前只用于受邀私有 Pilot；不要把本机 acceptance 文件当作团队共享策略。

如果某个任务是经过确认的预期配置，例如个人自建且已检查 TLS、访问控制和数据范围的示例中转，
可以从报告卡片复制稳定 `task-id` 并执行：

```bash
agentguard risk accept task-xxxxxxxxxxxx --reason "个人自建示例中转，已核对 TLS 与访问控制" --confirm
agentguard report --format html
```

接受后，该任务不会再进入默认行动队列，也不会触发 `scan/report` 的高危退出码；HTML 仍会在
“已接受风险”和技术证据区保留记录。可选 `--expires 2026-12-31` 设置到期时间，到期后任务会自动恢复：

```bash
agentguard risk list
agentguard risk list --all
agentguard risk verify task-xxxxxxxxxxxx
agentguard risk revoke task-xxxxxxxxxxxx
```

不带 `--confirm` 的 `risk accept` 只做接受前检查：列出整组任务的全部规则、严重度和接受条件，不写入记录。
`risk verify` 会重新扫描，并区分已解决、仍存在、部分缓解、已接受、接受已过期/撤销和任务身份变化；
缺少报告快照或接受历史时会明确返回“无法确认”，不会猜测为已解决。
报告生成时会在 `~/.agentguard/task-snapshots.json` 保存不含 evidence、路径、动态标题或端点的规则摘要，
用于比较处置前后的任务状态。

审计历史默认保存在 `~/.agentguard/acceptances.json`，目录权限为 `0700`、文件权限为 `0600`。
记录按规范化当前项目的不可逆 `scopeId` 隔离，不保存项目路径；旧版无作用域记录仅保留为不生效的
legacy 审计。撤销和过期只改变状态，不会删除历史。P0 任务不允许永久接受，必须显式提供 `--expires`。

### 接入 CI / 团队门禁

`scan` 在发现**高危及以上**风险时以退出码 `2` 结束，可直接当 PR 门禁：

| 退出码 | 含义 |
| --- | --- |
| `0` | 未发现高危及以上（无风险 / 仅中低危 / 仅提示） |
| `2` | 存在 `high` / `critical`（含跨 Agent 关联项） |

最小 GitHub Actions 片段：

```yaml
- run: gh release download v0.0.5-pilot.1 --repo fengyufengzi/AgentGuard --pattern 'agentguard-0.0.5-pilot.1.tgz'
  env:
    GH_TOKEN: ${{ secrets.AGENTGUARD_TOKEN }}
- run: npm install -g ./agentguard-0.0.5-pilot.1.tgz
- run: agentguard scan            # 高危 → 退出码 2 → 挡 PR
- run: agentguard report -f html -o agentguard-report.html
  if: always()                    # 存档一份脱敏报告
```

完整可复用示例见 [`examples/ci/agentguard-gate.yml`](examples/ci/agentguard-gate.yml)
（含 artifact 存档）。报告与退出流程同样脱敏，不打印明文密钥。

### `baseline` — 安全基线 dry-run

覆盖 **OpenCode / Claude Code / Gemini CLI / OpenClaw** 的有限可逆配置建议，且必须显式传入
`--dry-run`；命令只生成建议和 diff，不会写入任何配置文件。

```bash
agentguard baseline --profile balanced --dry-run
agentguard baseline --profile safe --dry-run --json
```

- **OpenCode**：`balanced` 将高风险 Bash 放行改为 `ask`、`share=auto` 改为 `manual`、关闭显式
  `autoupdate=true`；`safe` 在此基础上把显式放行的 `edit` / `webfetch` 也改为 `ask`、`share=auto`
  改为 `disabled`。
- **Claude Code**：`bypassPermissions` 收敛回 `default`、移除 `permissions.allow` 中无约束的
  Bash / 通配规则、`enableAllProjectMcpServers` 改为 `false`。
- **Gemini CLI**：MCP per-server `trust=true` 改为 `false`。
- **OpenClaw**：网关暴露面收敛 —— `gateway.bind` 非 loopback 改回 `127.0.0.1`、
  `gateway.tailscale.mode` 的 funnel / public / expose 改为 `off`。

明文密钥类风险不会进入普通 baseline 自动修改。报告只会为部分凭证场景按操作系统生成 Keychain、
Secret Service、DPAPI 或当前进程注入的引导模板，不会自动修改 Agent 凭证引用、验证真实认证、清理或
轮换旧密钥，也不会把密钥写入 shell profile、普通 `.env` 或 Windows 用户环境后伪称已完成迁移。
环境变量只是传递通道，不等于安全存储；完成安全存储、配置引用和旧凭证轮换后仍需复扫。
**Codex**（TOML，改写会丢注释/格式）与 **CC Switch**（只读 SQLite，坚持「默认只读」底线）暂**只在
scan/report 中提示，不纳入自动收敛**；但其不可自动收敛的高危项会在 `scan` 终端、HTML / JSON 报告中
附上**分步手动整改指引**（`remediation`），照着步骤即可自行修复。

### `backup` / `apply` / `restore`

`apply` 覆盖上述四个 Agent 的 baseline 变更，必须显式传入 `--backup`，执行前会把原配置复制到
当前项目 `.agentguard/backups/<backup-id>/`。备份目录仅当前用户可读，manifest 记录哈希与原文件
权限；写入使用同目录临时文件原子替换，失败时自动恢复备份。

```bash
agentguard backup
agentguard apply --profile balanced --backup
agentguard restore
agentguard restore --id <backup-id>
```

备份 manifest 记录原始路径和备份文件路径；`restore` 会把备份文件复制回原始路径。

---

## 🛡️ 隐私与安全承诺

- **扫描默认不改 Agent 配置** — `doctor/scan/map/report` 不修改 Agent 配置；`report` 只写不含 evidence、路径或端点的
  本机任务规则快照。只有显式执行 `apply/restore` 才会写入受支持配置，`risk accept/revoke` 只写本机审计状态。
- **本地运行** — 所有扫描在本机完成，不上传任何服务器。
- **脱敏输出** — 报告绝不含完整 API Key / Token / 私钥：`doctor` 仅探测密钥文件是否存在；
  密钥比对用 **SHA-256 指纹前缀**关联，MCP 环境变量只暴露**键名**；`base_url` 作为端点标识展示。
- **可解释** — 每条风险都带判断依据与建议，未知端点只提示、不武断拦截。

> 每次功能变更均跑跨 Agent 泄漏回归：从真实配置抓密钥，grep `scan --json` 输出，确保 0 命中。

---

## 🧩 已支持的 Agent

| Agent | 支持深度 | 说明 |
|---|---|---|
| CC Switch | 🟢 深度 | Provider 列表 / base_url / 明文密钥 / 共享密钥指纹 / 内置反向代理两跳链路 |
| Codex | 🟢 深度 | 自定义 Provider / MCP（remote/stdio）/ 明文密钥 / trusted 项目 / 代理 |
| Claude Code | 🟢 深度 | base_url / 明文 token / bypassPermissions / 危险 allow / hooks / MCP |
| OpenCode | 🟢 深度 | 自定义 Provider / 明文密钥 / bash 权限 / share / autoupdate / MCP |
| Gemini CLI | 🟢 定向深扫 | MCP trust / remote/stdio MCP / MCP env 密钥键 / `.env` 明文密钥 / shell 无 sandbox；凭证值不进入输出 |
| OpenClaw | 🟢 定向深扫 | `appSecret` / `auth.token` / 非 loopback `bind` / Tailscale `funnel` / workspace 冲突 / 未知插件源；支持有限网络暴露面收敛 |
| 当前项目 | 🟡 基础风险 | 只按文件名扫描 `.env`、私钥、云凭证、kubeconfig 等敏感文件 |

### Provider 分类

官方（OpenAI / Anthropic / Google / Azure）、国内官方（DeepSeek / Kimi / GLM / 通义千问 /
火山方舟 / 百度千帆 / 腾讯混元 / MiniMax）、本地 / 内网、公网裸 IP 与未知中转端点均有
独立判定与风险等级。

### Provider 白名单

项目根目录可放置 `.agentguard.json` 或 `agentguard.config.json`，把自建/企业端点标记为可信，
用于降低未知 Provider 误报。配置只影响“未知/中转端点”判定，不会隐藏明文 `http` 风险。

```json
{
  "providers": {
    "trusted": ["https://ai.example.com", "*.corp.example.com"],
    "internal": ["llm.internal.local"]
  }
}
```

`trusted` / `internal` 均支持完整 URL、host、`*.example.com` 通配域名。

---

## 🏗️ 架构

```
src/
├── cli.ts                 # CLI 入口（commander）
├── adapters/              # 每个 Agent 一个适配器：discover() + 可选 deepScan()
│   ├── claude-code/       #   parse.ts（读+归一化，不返回明文） + risk.ts（产出 findings）
│   ├── codex/
│   ├── cc-switch/
│   ├── opencode/
│   ├── gemini/
│   ├── openclaw/
│   └── index.ts           #   adapter 注册表
├── rules/
│   └── provider.ts        # classifyBaseUrl：Provider 端点分类（各 adapter 共用）
└── core/
    ├── discovery/         # Agent 发现
    ├── scan/              # 扫描编排（discover → deepScan → 汇总）
    ├── correlate/         # 跨 Agent 集中点分析
    ├── action/            # 规则处置、任务身份与根因聚合
    ├── remediation/       # macOS / Linux / Windows 修复命令模板
    ├── acceptance/        # 风险接受、到期、撤销与本地审计
    ├── triage/            # 将有效接受应用到默认结果和退出码
    ├── baseline/          # 有限安全基线计划
    ├── apply/             # 备份、原子写入、恢复和并发修改检查
    ├── map/               # 配置地图派生
    ├── report/            # doctor / scan / map 终端格式化 + HTML 报告
    ├── output-contract.ts # JSON 输出 schemaVersion / command 契约
    └── fs-safety.ts       # 原子写入与文件权限保持
```

设计原则：**adapter 架构**。新增 Agent 支持只需新增一个 adapter 并在 `adapters/index.ts`
注册，无需改动核心引擎。

---

## 🧪 开发

```bash
npm run build     # tsc → dist/
npm run dev       # tsc --watch
npm run sanitize  # 检查当前受 Git 跟踪文件中的敏感信息
npm run sanitize:staged   # 提交前只检查暂存文件
npm run sanitize:package  # 按 npm pack 实际文件清单检查发布内容
npm run sanitize:history  # 开源前检查所有可达 Git 历史
npm test          # 构建后跑 node:test 全套（test/**/*.test.mjs）
npm run clean     # 删除 dist/
```

**测试约定**：从 `dist/` 导入编译产物（与 NodeNext 的 `.js` 说明符一致），用
`node:test` / `node:assert`；夹具在临时目录构造配置文件、用后清理；每个 adapter
测试均含**隐私红线回归**（断言完整 findings 序列化中不含明文密钥）。

仓库公开前还需完成 Git 历史和发布资产检查，详见
[`docs/OPEN_SOURCE_RELEASE_CHECKLIST.md`](docs/OPEN_SOURCE_RELEASE_CHECKLIST.md)。安全问题请通过
[`SECURITY.md`](SECURITY.md) 中的私密渠道报告，不要在公开 Issue 中粘贴真实配置或凭证。

---

## 📄 License

MIT — 见 [`package.json`](./package.json)。

---

<p align="center">
  <sub>Built with ❤️ — 让 AI Coding Agent 好用，也可控。</sub>
</p>
