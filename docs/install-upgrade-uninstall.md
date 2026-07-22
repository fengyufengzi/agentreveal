# AgentGuard 安装、升级与卸载

> 状态：Public Preview。CLI 通过 npm `next` 分发，macOS Desktop 通过同版本 GitHub Pre-release 的
> 签名、公证 DMG 分发。

## 1. 先选择你的安装方式

| 使用场景 | 当前是否可用 | 安装方式 |
|---|---:|---|
| 固定版本 CLI Pilot | 是 | 从 GitHub Pre-release 下载 `.tgz` 后全局安装 |
| 贡献代码或本机开发 | 是 | 源码安装，执行 `npm ci`、测试和 `npm link` |
| 公开 npm CLI | 是，Public Preview | `npm install -g @wangmarsen/agentguard@next` |
| macOS 桌面应用 | 是，Apple Silicon | 从签名、公证的 DMG 拖入 Applications |

CLI 需要 Node.js 22 或更高版本。正式 macOS 桌面应用会包含运行时，不要求用户另装 Node.js 或全局 CLI。

## 2. CLI：固定版本 Release tarball

先确认 Node.js 与 GitHub CLI 可用，并已登录有仓库权限的 GitHub 账号：

```bash
node --version
gh auth status
```

下载并安装当前 `0.0.5-pilot.3`：

```bash
mkdir -p /tmp/agentguard-pilot
gh release download v0.0.5-pilot.3 \
  --repo fengyufengzi/AgentGuard \
  --pattern 'wangmarsen-agentguard-0.0.5-pilot.3.tgz' \
  --dir /tmp/agentguard-pilot \
  --clobber
npm install -g /tmp/agentguard-pilot/wangmarsen-agentguard-0.0.5-pilot.3.tgz
agentguard --version
agentguard
```

- `gh release download`：下载已经包含预编译 `dist/` 的发布包。
- `npm install -g`：把 `agentguard` 命令安装到当前 Node.js 的全局命令目录。
- `agentguard --version`：确认实际运行的版本。
- `agentguard`：运行统一首次入口，完成发现、扫描、链路和前三项行动摘要。

没有 GitHub CLI 时，可以从仓库 Releases 页面下载 `.tgz`，再执行：

```bash
npm install -g ~/Downloads/wangmarsen-agentguard-0.0.5-pilot.3.tgz
agentguard --version
```

不要使用 `npm install -g git+https://...`。Pilot 统一通过 Release `.tgz` 安装，避免 npm 在 Git 依赖准备阶段
重新构建或生成失效命令链接。

### 升级 Pilot CLI

下载新的 Release `.tgz`，再用同一条 `npm install -g` 命令安装新文件即可覆盖旧版。升级不会主动删除
`~/.agentguard` 中的风险接受记录和任务快照，也不会删除项目内的备份、端点信任或规则忽略策略。安装后务必执行：

```bash
agentguard --version
agentguard
```

## 3. CLI：源码开发

```bash
git clone https://github.com/fengyufengzi/AgentGuard.git
cd AgentGuard
npm ci
npm test
npm link
agentguard --version
```

- `npm ci`：严格按 lockfile 安装开发依赖。
- `npm test`：构建并执行完整测试，确认当前源码可用。
- `npm link`：创建指向当前源码仓库的全局 `agentguard` 命令，适合开发；它不是发行安装方式。

更新源码开发安装：

```bash
git pull --ff-only
npm ci
npm test
npm link
agentguard --version
```

## 4. CLI：公开 npm 包

Public Preview 使用 `next` dist-tag，安装和手动升级命令为：

```bash
npm install -g @wangmarsen/agentguard@next
npm update -g @wangmarsen/agentguard@next
agentguard --version
```

第一版不提供复杂自动更新；CLI 与桌面应用都由用户主动安装新版本。

## 5. macOS 桌面应用

### 当前开发预览

```bash
npm ci
npm run desktop
```

`npm run desktop` 构建 core 并启动 Electron 开发应用。开发者还可以执行 `npm run desktop:pack`，在系统
临时目录生成可双击的本地预览启动器；它依赖当前源码目录与 `node_modules` 中受信任的 Electron 运行时，
不是独立安装包。macOS 26 会终止缺少公证 ticket 的独立 Electron App，因此最终安装包必须走正式签名和公证。

### 正式 DMG

1. 从同一版本的 GitHub Release 下载 Apple Silicon DMG，并核对 Release 中的 SHA-256；
2. 打开 DMG，把 AgentGuard 拖到 Applications；
3. 从 Applications 启动应用，首次选择一个代码项目根目录；通常是包含 `.git`、`package.json` 或
   `pyproject.toml` 的文件夹；
4. 不应要求使用“仍要打开”或移除 quarantine 等方式绕过 Gatekeeper。

手动升级时，先退出 AgentGuard，再打开新版 DMG，把新版应用拖到 Applications 并确认替换。用户选择的
报告、`~/.agentguard` 审计状态和项目备份不会因替换应用而自动删除。

## 6. 卸载

### 卸载 CLI

Pilot tarball、公开 npm 包和 `npm link` 都可以先执行：

```bash
npm uninstall -g agentguard
command -v agentguard
```

第二条命令没有输出且返回非零状态，表示当前 shell 已找不到 AgentGuard。若仍显示路径，先确认是否同时用
多个 Node.js 管理器安装过，再对对应 Node.js 环境重复卸载。

### 卸载 macOS 桌面应用

1. 完全退出 AgentGuard；
2. 在 Finder 的 Applications 中把 `AgentGuard.app` 移到废纸篓；
3. 弹出仍挂载的 AgentGuard DMG。

### 是否删除本地数据

默认卸载只删除程序，不删除审计记录、备份或用户导出的报告，避免失去恢复和审计依据：

| 位置 | 内容 | 建议 |
|---|---|---|
| `~/.agentguard/` | 风险接受历史、任务快照 | 需要保留审计时不要删除 |
| `项目/.agentguard/` | 自动整改前的完整配置备份 | 确认不再需要 restore 后再删除；不要上传 |
| `项目/.agentguard.json` 或 `agentguard.config.json` | Provider 信任、低优先级规则忽略与追加式审计 | 可能受版本控制，应按项目决定是否保留；原因不得包含秘密 |
| `~/Library/Application Support/AgentGuard/` | 桌面偏好和脱敏诊断日志 | 仅在确认不再需要诊断后删除 |
| 用户选择的 HTML/JSON 路径 | 导出的静态报告 | 卸载不会处理，按普通文件自行管理 |

如果确实要清理，请先查看目标目录，确认没有需要恢复或留档的数据，再删除准确路径：

```bash
ls -la "$HOME/.agentguard"
ls -la "$HOME/Library/Application Support/AgentGuard"
```

不要把项目备份、完整配置、HTML/JSON 报告或诊断文件直接发到公开 Issue；反馈前先按试用说明脱敏。

## 7. 安装或升级后最小验证

```bash
agentguard --version
cd /你的项目目录
agentguard
agentguard report --format html
```

`agentguard` 发现高危风险时可能以退出码 `2` 结束；这表示发现了风险，不代表安装失败。配置无法解析时，
输出只会显示对应文件、安全原因和“已安全跳过”，不会显示解析器堆栈或原始配置内容。
