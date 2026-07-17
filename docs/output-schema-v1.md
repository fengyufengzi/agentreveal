# AgentGuard 机器输出契约 v1

AgentGuard 的机器可读 JSON 输出从 Pilot Ready 阶段起带有两个保留字段：

```json
{
  "schemaVersion": 1,
  "command": "scan"
}
```

## 适用命令

| 命令 | `command` 值 |
|---|---|
| `doctor --json` | `doctor` |
| `scan --json` | `scan` |
| `provider scan --json` | `provider.scan` |
| `map --json` | `map` |
| `report --format json` | `report.json` |
| `baseline --dry-run --json` | `baseline` |
| `backup --json` | `backup` |
| `apply --backup --json` | `apply` |
| `restore --json` | `restore` |

## 兼容约定

- `schemaVersion` 发生不兼容变化时才递增。
- v1 内允许增加可选字段；消费者应忽略未知字段。
- 已有顶层业务字段保持原位置，不额外包入 `data`，以兼容早期脚本。
- 规则 ID 是自动化判断的稳定标识；不要依赖中文标题做匹配。
- 严重度值固定为 `critical | high | medium | low | info`。
- 完整扫描结果中的 finding 可以增加可选 `action` 字段。`severity` 表示潜在影响，
  `action.priority` 表示行动顺序，两者不可互相替代。
- `action.disposition` 固定为 `fix | review | cleanup | observe`；`observe` 是环境观察，不应默认计入待修复数量。
- `action.fixMode` 固定为 `baseline | guided | manual | none`。`baselineProfiles` 会进一步标明
  `safe` / `balanced` 是完整解决（`resolve`）还是风险缓解（`mitigate`）。
- `0.0.5` 候选的 `scan --json` 和 `report --format json` 包含 `acceptedTaskCount`，并只在 `allFindings` /
  `correlations` 中返回应用本机 acceptance 后的活动结果；完整历史使用 `agentguard risk list --all` 查看。
- `provider scan` 和 `map` 同样会受本机 acceptance 影响，但当前不返回 `acceptedTaskCount`；`risk` 命令
  暂无 JSON 输出。持久化 CI runner 上的本机 acceptance 会改变结果和退出码，它不是仓库或团队共享策略。
- acceptance schema v2 按规范化 cwd 的不可逆 `scopeId` 隔离当前项目；旧 v1 无作用域记录仅作为
  legacy 历史返回且不再影响结果。它仍是本机状态，不是仓库或团队共享策略。
- `risk accept` 必须显式 `--confirm` 才写入；新审计摘要包含全部规则级处置元数据，但不保存 finding
  evidence、动态标题、内部端点或项目路径。`risk verify` 当前只提供人类可读输出，没有 JSON 契约。
- 未被有效接受的结果中有 `critical` 或 `high` 时，`scan`、`provider scan` 和 `report` 的退出码为 `2`。
- 参数或运行错误使用退出码 `1`；无高危风险使用退出码 `0`。

## 隐私约定

机器输出不得包含完整 API Key、Token 或私钥。密钥关联只使用不可逆指纹前缀；MCP 环境变量只输出键名。
处置矩阵中的行动和验证说明也不得回显原始敏感值。若发现泄漏，应立即停止试点并按安全缺陷处理。
