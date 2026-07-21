# AgentGuard 开源发布安全检查清单

> 状态：Active
>
> 更新日期：2026-07-21
>
> 目标：在仓库公开或发布 npm 包前，验证当前文件、可达 Git 历史、发布资产和社区入口均不暴露敏感信息。

## 1. 当前结论

| 检查项 | 状态 | 说明 |
|---|---|---|
| 当前受 Git 跟踪文件扫描 | 已通过 | `npm run sanitize`；包含危险产物路径并已接入 CI |
| 暂存文件扫描 | 可用 | 提交前运行 `npm run sanitize:staged` |
| 公开候选全部可达 Git 历史隐私扫描 | 已通过 | 独立候选仓库只包含审核后的快照历史；`npm run sanitize:history` 已归零 |
| GitHub Issue / Security 链接 | 已修正 | 已替换模板中的占位仓库地址 |
| 独立第三方 secret scanner | 工具就绪，最终候选待扫 | Gitleaks v8.30.1 已复核当前树、历史、本地 tarball 和开发 DMG；`release:scan-assets` 会解包 tarball 与 DMG/app.asar，最终签名候选仍须重跑 |
| npm 发布文件清单与内容扫描 | 已通过 | `npm run sanitize:package`；覆盖 `dist/` 和 source map |
| tarball 干净安装与本地 npx | 已通过 | `npm run package:verify-install`；校验清单、干净 prefix、版本和本地 tarball npx |
| CODEOWNERS 与贡献门禁 | 已就绪 | 已标记关键安全路径；公开仓库仍需启用 required review / branch protection |
| 最终 tarball 重下载验证 | 待执行 | 仍需从最终 Release 资产重新下载、解包和安装 |

私有开发仓库仍有 23 项历史元数据命中，不得直接切换为 Public；正式公开面只使用已经归零的独立候选仓库。

## 2. 自动检查命令

```bash
# CI 使用：扫描当前所有受 Git 跟踪的文本文件
npm run sanitize

# 本地提交前：只扫描暂存区新增或修改的文件
npm run sanitize:staged

# 按 npm pack 实际清单构建并扫描 README、bin、dist、source map 和 package.json
npm run sanitize:package

# 构建真实 tarball，在临时 HOME/prefix 安装，并用本地 tarball 执行 npx 版本验证
npm run package:verify-install

# 最终资产独立复核：先安全解包 tarball，再只读挂载 DMG 并解包 app.asar
npm run release:scan-assets -- --tarball /path/to/package.tgz --dmg /path/to/AgentGuard.dmg

# 开源前强制执行：扫描所有本地分支和 tag 可达的历史补丁
npm run sanitize:history
```

检查结果只输出规则、文件/提交、位置和匹配长度，不回显命中的邮箱、路径或凭证内容。

内置规则覆盖：

- 不应公开的组织名称、个人域名和本机 profile 标识；
- 未批准邮箱；
- macOS、Linux 和 Windows 用户主目录绝对路径；
- 私钥 PEM 头；
- GitHub、AWS、主流 AI Provider 和 Slack 的常见令牌形态；
- 常见凭证字段中的疑似真实值；
- 被误跟踪的 `.env`、密钥/证书、日志、配置备份、本机报告和 DMG/tarball；
- `package-lock.json`，避免锁文件成为当前树扫描盲区。

内置检查用于减少发布前遗漏，但不能替代第三方 secret scanner 对当前树、完整历史和最终资产的独立复核。

### 2.1 第三方扫描记录

2026-07-18 从 [Gitleaks 官方 Release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1) 临时下载
`gitleaks_8.30.1_darwin_arm64.tar.gz`，校验官方 SHA-256
`b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5` 后运行，未全局安装或写入仓库：

- 对 `git archive HEAD` 生成的当前树快照执行 `gitleaks dir`：0 个命中；
- 对当前仓库全部可达历史执行 `gitleaks git`：0 个命中；
- 两次扫描均使用 `--redact=100`，临时报告保存在系统临时目录，不纳入 Git；
- 最终 npm tarball 和 DMG 产生后仍须重新扫描，当前结果不能替代最终资产验证。

Gitleaks 的 0 命中只表示其密钥规则未发现问题。私有开发仓库的内置 `sanitize:history` 仍有 23 项组织、
邮箱、本机路径或个人项目标识命中，因此该历史不得直接公开；独立候选仓库仅导入审核后的当前树，当前
全部可达历史已通过内置扫描。

## 3. Git 历史处理

从当前文件删除敏感文本，不会从 Git 历史中删除它。公开前需要在以下两种方案中明确选择一种：

1. 新建干净的公开仓库，只导入审核后的当前树和必要发布标签；
2. 备份私有仓库后使用历史重写工具清理所有分支和 tag，再协调所有协作者重新 clone。

历史重写会改变 commit SHA，并通常需要 force-push。执行前必须：

- 冻结合并和推送；
- 创建不可公开的完整备份；
- 列出需要保留或删除的分支与 tag；
- 确认公开作者邮箱白名单；
- 通知所有协作者旧 clone 不得继续推送；
- 重写后重新运行 `npm run sanitize:history` 和第三方 secret scanner。

即使历史被清理，只要真实凭证曾进入 Git，也必须在上游服务中撤销或轮换；删除提交不能替代轮换。

## 4. 发布资产与仓库元数据

- [x] `npm pack` 清单只包含预期文件；`package:verify-install` 明确拒绝 `src/` / `test/`；
- [x] 实际 `.tgz` 发布内容与 source map 通过 `sanitize:package` 检查；
- [x] README、Desktop Demo 封面/视频和 CLI 输出示例均使用合成或脱敏样本；最终 Release Notes 仍待发布版本确认；
- [x] GitHub 仓库描述、主页、Discussions、Issue 模板和 Security Advisory 链接正确；
- [ ] CODEOWNERS 维护者账号有效，main 启用 required review、required checks 和禁止直接推送；
- [x] 作者姓名、GitHub 账号和个人 Gmail 作者邮箱经过本人确认；npm 包保留该个人邮箱；
- [x] 当前树不包含公司域名、内部 IP、客户名称、工号、会议链接或内部截图；跟踪的图标与 Desktop Demo 均使用合成资产；
- [x] `.env`、证书、私钥、调试日志、备份和本机报告未被 Git 跟踪，并由 `sanitize` 持续阻断；
- [x] 使用独立 secret scanner 检查当前树和全部历史；
- [ ] 使用独立 secret scanner 检查最终 npm tarball 和 DMG；
- [ ] 从最终 Release 资产重新下载并完成干净安装验证。

## 5. CI 边界

CI 每次执行 `npm run sanitize`，用于阻止新的当前树泄漏。候选历史已经归零；历史扫描因需要遍历所有可达
refs、成本更高，公开前应加入发布工作流或定期安全任务，而不必在每个普通 PR 重复执行。
