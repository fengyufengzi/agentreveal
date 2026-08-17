# 最小规则反馈

[English](rule-feedback.en.md)

这份反馈只用于复核一条已经命中的规则是否符合用户预期，不替代完整 Pilot 体验反馈，也不用于提交应用故障、
功能建议或安全漏洞。公开 Pilot 当前通过 GitHub 专用 Issue 表单收集这些最小字段，不要求上传扫描报告。

## 提交方式

1. 在 CLI、HTML 报告或 macOS Desktop 的技术详情中找到稳定的规则 ID；不要使用 `task-...` 任务 ID。
2. 打开仓库的 **New issue → 规则质量反馈**。
3. 每个 Issue 只提交一条规则，并保持标题前缀不变。
4. 选择判断和处置结果，确认隐私声明后提交。

表单只需要四项用户输入：

- 产品版本：运行当前产品的 `--version` 获得；
- `ruleId`：扫描结果中的稳定规则 ID；
- `judgment`：`expected`、`false-positive` 或 `unclear`；
- `actionOutcome`：`not-attempted`、`resolved`、`mitigated`、`still-present`、`accepted`、`ignored`
  或 `abandoned`。

`expected` 表示规则准确描述当前配置；`false-positive` 表示规则命中但技术判断不成立；`unclear` 表示证据或
解释不足。只有复扫确认规则消失时才选择 `resolved`；仍有部分条件存在时选择 `mitigated` 或
`still-present`。

## 隐私边界

不要在标题、字段、评论或附件中提交：

- 完整配置、JSON/HTML 报告、诊断或截图；
- 本机路径、用户名、内部端点、模型名或 task ID；
- API Key、Token、私钥或环境变量值；
- 接受/忽略原因、环境描述或其它自由文本。

若产品输出了本不应出现的敏感信息，请不要创建公开 Issue，应通过仓库 Security Advisory 私下报告。

## 维护者使用规则

- 单条反馈只作为方向信号，不直接改变或删除规则；
- 调整 detector、severity、priority 或 grouping 前，必须先建立可复现的合成正例与负例；
- 只有合成证据和多条相互独立的最小真实反馈支持同一结论时，才进入规则变更审查；
- 没有反馈或出现频率低，不能作为删除规则的依据。
