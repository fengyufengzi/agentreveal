# AgentReveal 最小规则反馈

[English](rule-feedback.en.md)

这份反馈只用于复核高价值规则是否符合用户预期，不替代完整 Pilot 体验反馈。AgentReveal 不会自动上传任何
内容；命令只在当前终端生成一个最小 JSON 对象。

## 生成反馈

从扫描结果复制稳定的规则 ID，并选择判断与处置结果：

```bash
agentreveal feedback \
  --rule GEMINI_MCP_TRUST_BYPASS \
  --judgment expected \
  --outcome resolved
```

输出固定只包含以下字段：

```json
{
  "schemaVersion": 1,
  "command": "feedback",
  "productVersion": "0.0.7-pilot.2",
  "ruleId": "GEMINI_MCP_TRUST_BYPASS",
  "judgment": "expected",
  "actionOutcome": "resolved"
}
```

它不会读取 HOME、配置、报告或诊断，也不会写文件或发起网络请求。需要保存时由用户显式重定向，并在发送前
自行查看：

```bash
agentreveal feedback --rule CODEX_CUSTOM_PROVIDER --judgment unclear --outcome not-attempted \
  > agentreveal-rule-feedback.json
```

## 字段枚举

`judgment`：

- `expected`：规则准确描述了当前配置；
- `false-positive`：规则命中了，但用户确认该技术判断不成立；
- `unclear`：证据或解释不足，暂时无法判断。

`actionOutcome`：

- `not-attempted`：尚未处置；
- `resolved`：复扫确认已解决；
- `mitigated`：只完成风险缓解；
- `still-present`：处置后仍存在；
- `accepted`：已按项目接受风险；
- `ignored`：已按项目忽略符合条件的规则；
- `abandoned`：尝试后放弃。

## 禁止包含的内容

最小反馈契约会拒绝所有额外字段，尤其是：

- taskId、接受/忽略原因和时间；
- 完整配置、报告、诊断或截图；
- 本机路径、用户名、内部端点或模型名；
- API Key、Token、私钥、环境变量值；
- 任意自由文本备注。

可以通过 GitHub 的“规则质量反馈”Issue 表单逐字段提交；不要上传完整 JSON/HTML 报告或配置文件。

## 维护者如何使用

- 单条反馈只作为方向信号，不直接改变 detector、severity、priority 或 grouping；
- 调整规则前必须先有可复现的合成正/负场景，再核对最小真实反馈是否支持同一结论；
- “没有反馈”或低出现频率不能作为删除规则的依据；
- 删除、拆分、合并或改变规则行为时仍须执行仓库的 `add-security-rule` 工作流和完整兼容性审查；
- 若用户报告输出含敏感信息，应停止普通质量分析并按安全问题私下处理。
