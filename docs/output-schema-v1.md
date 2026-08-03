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
| `agentguard --json` | `first-run` |
| `doctor --json` | `doctor` |
| `scan --json` | `scan` |
| `posture --json` | `posture` |
| `drift --json` | `drift` |
| `drift baseline ... --json` | `drift.baseline` |
| `provider scan --json` | `provider.scan` |
| `map --json` | `map` |
| `report --format json` | `report.json` |
| `baseline --dry-run --json` | `baseline` |
| `backup --json` | `backup` |
| `credential backup <task-id> --json` | `credential.backup` |
| `credential restore <backup-id> --json` | `credential.restore` |
| `apply --backup --json` | `apply` |
| `restore --json` | `restore` |
| `trust add ... --json` | `trust.add` |
| `trust list --json` | `trust.list` |
| `trust remove ... --json` | `trust.remove` |
| `ignore add ... --json` | `ignore.add` |
| `ignore list --json` | `ignore.list` |
| `ignore remove ... --json` | `ignore.remove` |

## 兼容约定

- `schemaVersion` 发生不兼容变化时才递增。
- v1 内允许增加可选字段；消费者应忽略未知字段。
- 已有顶层业务字段保持原位置，不额外包入 `data`，以兼容早期脚本。
- 规则 ID 是自动化判断的稳定标识；不要依赖中文标题做匹配。
- `first-run` 是 CLI 与 Desktop 共用的首次运行摘要，包含 `summary`、`map`、统一 `tasks`、前三个
  `topTasks`、三类 `buckets`、当前平台 `remediationGuides` 和可复制的 `nextCommands`。Desktop 在
  `overview.firstRun` 原样返回该契约，同时保留现有顶层兼容字段。
- `first-run`、`scan` 和 `report.json` 可以增加可选 `posture` 与 `drift`。`posture.agents[]` 包含运行时
  有效状态、不确定证据和确定性认证/路由处置计划；该运行时输出可以为本机用户展示规范化路径与端点，
  但不得直接作为可信快照持久化。
- `drift.status` 固定为 `no-baseline | unchanged | changed | unavailable`；`events[]` 使用稳定 `eventId`、
  Agent、变化类型、priority/severity、非敏感摘要、行动和验证。`activeEventCount` 不包含已恢复事件。
  已接受任务或项目规则忽略从有效变为到期时，分别产生 `acceptance-expired` / `ignore-expired`，
  且不会把接受原因、忽略原因或 taskId 放入事件。
- `first-run.topDriftEvents` 与 `topTasks` 共用最多三项容量；已恢复事件不会进入 Top 3 当前行动。
- `drift baseline` 未确认时返回 `applied: false` 与预览指纹/存储版本；创建、替换、删除确认后返回
  `applied: true` 和 mutation 结果。替换必须显式 `--replace --confirm`，删除必须显式
  `--remove --confirm`。
- `buckets.mustHandle` 是 P0/P1 的非观察任务，`shouldReview` 是其它非观察任务，`informational` 是
  `observe`；bucket 只保存稳定 taskId 和计数，具体语义从 `tasks` 读取。
- `remediationGuides` 中的命令是本机展示用安全模板，不代表已经执行或完成整改；renderer 和 HTML
  不得直接执行这些字符串。完成处置后仍需运行对应的 `risk verify`。
- `credential.restore` 在没有 `--confirm` 时返回 `restored: false`、文件计数、变化计数与当前状态预览指纹，
  退出码为 `1` 且不写配置；确认恢复返回 `restored: true`。输出不包含凭证值或配置路径。
- 严重度值固定为 `critical | high | medium | low | info`。
- 完整扫描结果中的 finding 可以增加可选 `action` 字段。`severity` 表示潜在影响，
  `action.priority` 表示行动顺序，两者不可互相替代。
- `action.disposition` 固定为 `fix | review | cleanup | observe`；`observe` 是环境观察，不应默认计入待修复数量。
- `action.fixMode` 固定为 `baseline | guided | manual | none`。`baselineProfiles` 会进一步标明
  `safe` / `balanced` 是完整解决（`resolve`）还是风险缓解（`mitigate`）。
- `0.0.5` 候选的 `first-run.summary`、`scan --json` 和 `report --format json` 增加
  `ignoredFindingCount`；scan/report 还包含 `acceptedTaskCount`。`allFindings` / `correlations` 只返回应用
  当前项目规则忽略和本机 acceptance 后的活动结果。完整审计分别使用 `ignore list --all` 和
  `risk list --all` 查看。
- `provider scan` 和 `map` 同样会受本机 acceptance 影响，但当前不返回 `acceptedTaskCount`；`risk` 命令
  暂无 JSON 输出。持久化 CI runner 上的本机 acceptance 会改变结果和退出码，它不是仓库或团队共享策略。
- acceptance schema v2 按规范化 cwd 的不可逆 `scopeId` 隔离当前项目；旧 v1 无作用域记录仅作为
  legacy 历史返回且不再影响结果。它仍是本机状态，不是仓库或团队共享策略。
- `risk accept` 必须显式 `--confirm` 才写入；新审计摘要包含全部规则级处置元数据，但不保存 finding
  evidence、动态标题、内部端点或项目路径。`risk verify` 当前只提供人类可读输出，没有 JSON 契约。
- `trust add/remove` 必须提供原因；`trust list --json` 返回项目配置路径、当前 endpoint/kind 列表和追加式审计。
  这是可进入版本控制的项目策略，不应在原因中填写凭证。端点信任只覆盖未知/中转分类。
- `ignore add` 必须从最新活动任务选择 core 判定可忽略的 ruleId；`ignore list --json` 返回项目配置路径、
  当前 Agent/ruleId 策略和追加式审计。策略不保存 evidence、路径、端点或 taskId，并按
  “当前项目 + Agent + ruleId”跨任务身份变化生效；P0/P1、fix 和高风险家族不能加入。
- 未被有效接受的结果中有 `critical` 或 `high` 时，裸 `agentguard`、`scan`、`provider scan` 和
  `report` 的退出码为 `2`。
- 参数或运行错误使用退出码 `1`；无高危风险使用退出码 `0`。

## 隐私约定

机器输出不得包含完整 API Key、Token 或私钥。密钥关联只使用不可逆指纹前缀；MCP 环境变量只输出键名。
处置矩阵中的行动和验证说明也不得回显原始敏感值。若发现泄漏，应立即停止试点并按安全缺陷处理。
可信快照是独立的持久化 schema：只保存 allowlist 枚举、字段名、稳定代码、规则 ID、策略状态与 keyed HMAC 身份，
不得保存 JSON/HTML `posture` 中的原始路径、端点、模型或集成身份。机器输出中的确定性处置计划不得包含
凭证值、任意 shell 命令或自动轮换承诺。策略快照只用本机 HMAC 区分接受/忽略记录，不保存原因、taskId、
项目路径或原始策略身份。
