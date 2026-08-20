# ADR-0006：产品改名 agentguard → agentreveal，重写产品私有状态契约

- Status: Accepted
- Date: 2026-08-05
- Supersedes: ADR-0001 / ADR-0005（仅在被影响的产品私有契约部分）

## 背景

产品从 AgentGuard 改名为 AgentReveal；npm 包从 `@wangmarsen/agentguard` 切到顶层包 `agentreveal`；
GitHub 仓库从 `fengyufengzi/AgentGuard` 切到 `fengyufengzi/agentreveal`。这是当前公共 Preview 阶段
的窗口期，外部用户极少、改名窗口最低。

本次改名的同时，必须把 ADR-0001 与 ADR-0005 中涉及产品私有标识的"不可破坏约束"显式搬到新名字上；
绝不静默改写历史 ADR 的措辞，仅在本 ADR 顶部声明"Supersedes"关系。

## 决策

产品私有状态契约统一改为以 `agentreveal` 为根：

1. **CLI 二进制名**：可执行文件 `agentreveal`，对应 `package.json` bin 入口 `bin/agentreveal`。
2. **本地状态根目录**：`~/.agentreveal/`（与原 `~/.agentguard/` 同级生命周期，权限 0700/0600）。
3. **项目级配置**：`<project>/.agentreveal.json` 或 `<project>/agentreveal.config.json`
   （原 `.agentguard.json` / `agentguard.config.json`）。
4. **备份目录**：`<project>/.agentreveal/backups/`，保留旧的命名风格（带前导 `.` 表示隐藏目录）。
5. **HMAC / hash 域串** 全部以 `agentreveal-` 为前缀：
   - `agentreveal-posture-lock-v1`
   - `agentreveal-state-key-v1`
   - `agentreveal-posture-v1`
   - `agentreveal-drift-v1`
   - `agentreveal-project-scope`
6. **环境变量前缀**：`AGENTREVEAL_*`（原 `AGENTGUARD_*`），
   包含 `AGENTREVEAL_ACCEPTANCE_PATH`、`AGENTREVEAL_TASK_SNAPSHOT_PATH`、
   `AGENTREVEAL_POSTURE_{SNAPSHOT,KEY}_PATH`、`AGENTREVEAL_CLAUDE_{DIR,HELPER,INPUT}`、
   `AGENTREVEAL_TEST_ROOT`、`AGENTREVEAL_EVAL_CODEX_PATH`。
7. **诊断事件文件名**：`agentreveal-events.jsonl` / `agentreveal-events.<n>.jsonl`。
8. **sanitize 历史指纹前缀**：`AGENTREVEAL_COMMIT:`（原 `AGENTGUARD_COMMIT:`）。
9. **本地诊断事件白名单 `OPERATIONS`（不含产品名）**：保持不变
   （`app.ready`、`window.state`、`machine.scan`、`project.*`、`posture.*`、`baseline.*`、
   `credential.*`、`risk.*`、`provider.*`、`rule.*`、`report.*`、`diagnostics.export`）。

## 旧包与旧路径迁移

- 老 npm 包 `@wangmarsen/agentguard@0.0.6` 在 `0.0.7` 发布后用 `npm deprecate` 通知迁移，
  并按用户决定尝试 `npm unpublish 0.0.6`（不可逆动作，需 72 小时内执行；过期只能 deprecate）。
- 本地状态从 `~/.agentguard` 切到 `~/.agentreveal`：不写迁移脚本（与 ADR-0001
  "不在长期保存路径中收集外泄数据"立场一致）；用户在 0.0.7 首次运行时按 onboarding 重新生成。
- 项目级 `.agentguard.json` / `agentguard.config.json` 不自动迁移；老项目重跑一次
  `agentreveal scan --accept-current` 完成新格式基线。

## 不可破坏约束

- CLI 入口文件名 `bin/agentreveal`、npm 包名 `agentreveal` 与本节所有 `agentreveal-*`
  前缀一同视为强约束；改名再次发生时必须新建 ADR-0008，并显式声明映射关系。
- 本地状态根 `~/.agentreveal/`、项目配置 `.agentreveal.json` / `agentreveal.config.json`
  的文件路径、权限模式与旧版路径相同。
- HMAC 域串不可换前缀含义；任一域串被改时必须同步 v2 版本号并在 ADR 中保留兼容期说明。

## 影响

- ADR-0001 的隐私边界面与 ADR-0005 的 HMAC 域串条款全部迁移；旧 ADR 仅通过 Superseded
  标注保持历史可读。
- ADR-0003 事务写入与 ADR-0002 任务语义不依赖产品名，不需改动。

## 未采用方案

- 完整 hot-fix 改名（保留旧包 `@wangmarsen/agentguard` 并行发布）：被放弃，因为当前 Pilot
  用户极少、scope `@wangmarsen` 仍属个人，且 0.0.7 一次性发布更符合产品方向"先在私有仓库持续打磨"。
- 在公开仓库命名空间下重新发布 `@agentreveal/cli` 等新 scope：被放弃，因为 npm 顶层包已具备
  唯一可记忆性，无须额外 scope 隔离。
