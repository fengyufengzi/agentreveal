# AgentGuard 开源发布安全检查清单

> 状态：Active
>
> 更新日期：2026-07-15
>
> 目标：在仓库公开或发布 npm 包前，验证当前文件、可达 Git 历史、发布资产和社区入口均不暴露敏感信息。

## 1. 当前结论

| 检查项 | 状态 | 说明 |
|---|---|---|
| 当前受 Git 跟踪文件扫描 | 已通过 | `npm run sanitize`；已接入 CI |
| 暂存文件扫描 | 可用 | 提交前运行 `npm run sanitize:staged` |
| 全部可达 Git 历史扫描 | 未通过 | `npm run sanitize:history` 仍能发现已删除的组织、邮箱和本机路径信息 |
| GitHub Issue / Security 链接 | 已修正 | 已替换模板中的占位仓库地址 |
| 独立第三方 secret scanner | 待执行 | 内置脚本不能替代成熟的历史密钥扫描工具 |
| npm 发布文件清单与内容扫描 | 已通过 | `npm run sanitize:package`；覆盖 `dist/` 和 source map |
| 最终 tarball 重下载验证 | 待执行 | 仍需从最终 Release 资产重新下载、解包和安装 |

在“全部可达 Git 历史扫描”归零前，不得把现有仓库直接切换为 Public。

## 2. 自动检查命令

```bash
# CI 使用：扫描当前所有受 Git 跟踪的文本文件
npm run sanitize

# 本地提交前：只扫描暂存区新增或修改的文件
npm run sanitize:staged

# 按 npm pack 实际清单构建并扫描 README、bin、dist、source map 和 package.json
npm run sanitize:package

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
- 常见凭证字段中的疑似真实值。

`package-lock.json` 当前不进入内置文本扫描，也不进入 npm 发布包，应由第三方 secret scanner 补充覆盖。

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

- [ ] `npm pack --dry-run` 只包含预期文件；
- [ ] 解包 `.tgz` 后再次检查敏感信息和 source map；
- [ ] README、截图、GIF、HTML 报告和 Release Notes 均使用脱敏样本；
- [ ] GitHub 仓库描述、主页、Discussions、Issue 模板和 Security Advisory 链接正确；
- [ ] 作者姓名、公开邮箱和 GitHub noreply 邮箱经过本人确认；
- [ ] 不包含公司域名、内部 IP、客户名称、工号、会议链接或内部截图；
- [ ] `.env`、证书、私钥、调试日志、备份和本机报告未被 Git 跟踪；
- [ ] 使用独立 secret scanner 检查当前树和全部历史；
- [ ] 从最终 Release 资产重新下载并完成干净安装验证。

## 5. CI 边界

CI 每次执行 `npm run sanitize`，用于阻止新的当前树泄漏。历史扫描暂不放入每次 CI，因为现有历史尚未清理，
且它扫描所有可达 refs、成本更高。历史归零后，应在公开发布工作流或定期安全任务中增加该门禁。
