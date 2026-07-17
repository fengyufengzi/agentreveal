# Changelog

All notable changes to AgentGuard are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.0.5-pilot.1] - 2026-07-16

### Added

- `0.0.5-pilot.1` 候选：根据 macOS、Linux 和 Windows 生成不包含明文凭证的修复指引；HTML 支持复制命令。
- `agentguard risk accept/list/revoke`：记录接受原因、可选到期时间和撤销历史；P0 任务强制限时接受。
- 风险接受记录使用本地 0700 目录、0600 文件和原子写入；有效接受不进入默认行动队列和高危退出码。
- acceptance schema v2 按规范化项目 `scopeId` 隔离；旧 v1 无作用域记录保留为 legacy 且不再生效。
- 聚合任务规则要求模型：HTML 逐条展示全部子规则的处置、验证和接受条件。
- `risk accept` 两阶段确认、静态规则审计摘要，以及 `risk verify` 单任务验证闭环。
- 当前产品能力规范化摘要与修复/风险接受开发计划。

### Changed

- HTML 将有效接受任务移入“已接受风险”，同时保留完整技术证据。
- HTML 标记修复命令是完整解决、风险缓解或辅助步骤，并明确报告是需要重新生成的静态快照。
- `scan --json` 与 JSON 报告增加 `acceptedTaskCount`，明确本地策略排除的任务数量。
- 源码版本进入 `0.0.5-pilot.1` 候选；该版本尚未发布 Release。

### Known limitations

- 跨平台命令是修复引导，不等同于已完成凭证迁移；尚无 `secret plan/migrate`。

## [0.0.4-pilot.1] - 2026-07-15

### Added

- 63 条具体规则的机器可读处置矩阵，并与 10 条 baseline 能力建立效果映射。
- 下一步行动报告：按 `fix/review/cleanup/observe` 和 `P0–P3` 组织行动任务。
- 根因任务聚合、稳定 task ID、Top 3 行动和关联 finding 展示。
- 每个任务的行动理由、下一步、验证方法、修复方式和接受条件。

### Changed

- HTML 首页按行动任务而非原始 finding 计数，技术证据区仍保留所有发现。
- OpenClaw 环境变量引用不再误报为明文凭证；MCP 疑似密钥规则降为低置信确认项。

### Security

- 行动字段、任务明细和证据继续执行 HTML 转义与明文凭证泄漏回归。

## [0.0.3-pilot.3] - 2026-07-14

### Added

- Pilot Ready 试用方案、结构化反馈模板和阶段出口标准。
- 机器可读输出契约 v1；所有 JSON 命令输出增加 `schemaVersion` 和 `command`。
- 发布包纳入 `docs/` 和 `examples/`，确保 README 中的试用手册、输出契约和 CI 示例可用。
- 提交预编译 `dist/` 并通过 GitHub Pre-release 分发标准 npm tarball，安装不依赖 TypeScript 或 npm Git 依赖行为。

### Security

- baseline apply 改为同目录原子写入，写后验证失败会自动从备份回滚。
- apply 前校验配置源文件哈希，避免使用已过期计划覆盖并发修改。
- 备份目录/manifest/配置副本使用仅当前用户可读权限，并记录 SHA-256 完整性和原文件权限。
- restore 拒绝路径穿越备份 ID、越界备份路径和被篡改的备份内容。

## [0.0.3-pilot.2] - 2026-07-14

### Withdrawn

- 干净的全局安装环境中，npm Git 依赖准备阶段找不到 devDependency `tsc`，导致 `prepare` 失败。
- 该版本未向试用者分发，远端标签已撤回，由 `0.0.3-pilot.3` 替代。

## [0.0.3-pilot.1] - 2026-07-14

### Withdrawn

- 远端安装验证发现 Git 标签安装不会执行现有 `prepack`，安装产物缺少 `dist/cli.js`。
- 该版本未向试用者分发，远端标签已撤回，由 `0.0.3-pilot.3` 替代。

## [0.0.2] - 2026-07-11

### Added

- **OpenClaw adapter (P1)** — discover `~/.openclaw/openclaw.json` + `service-env/`;
  identify plaintext `appSecret` / `auth.token`, non-loopback `bind`, Tailscale
  `funnel` exposure, multi-agent workspace overlap, and non-npm plugin sources.
  Real-world finding on author's machine: 2 high-risk plaintext secrets.
- **Gemini CLI adapter (P1)** — discovery-only (settings.json + .env presence,
  no credential reads).
- **Provider trust policy** — `.agentguard.json` / `agentguard.config.json`
  allow marking self-hosted endpoints as `trusted` / `internal` with URL,
  host, or `*.example.com` wildcards. The HTTP flag is preserved.
- **Workspace sensitive-file scan** — filename-only detection of `.env`,
  private keys, cloud credentials, kubeconfig; included in `scan` output.
- **OpenCode security baseline** — `baseline --profile {balanced,safe} --dry-run`
  previews changes; `apply --backup` enforces backup; `restore [--id]` rolls back.
- **Cross-agent correlation** — `XAGENT_SHARED_PROXY` /
  `XAGENT_SHARED_ENDPOINT` findings when ≥2 agents share a proxy/endpoint.
- **`map` command** — multi-agent config map with proxy two-hop chain.
- **`report --format html|json`** — self-contained offline HTML (inline CSS,
  HTML-escaped) and JSON output.

### Security & Privacy

- `scan --json` output verified clean of plaintext API keys via grep test
  suite (privacy red-line regression in `provider-policy`, `sensitive`,
  `gemini`, `openclaw` tests).
- HTTP flag persists even when an endpoint is marked trusted.

### Engineering

- Adapter architecture: adding support for a new agent is a single new file +
  one line in `src/adapters/index.ts`.
- 96 unit tests pass (`node --test test/**/*.test.mjs`); Node ≥ 22 required
  (Node 24+ in development; `node:sqlite` is experimental in Node 22).
- GitHub Actions CI on Node 22 + 24.

## [0.0.1] - 2026-07-10

### Added

- Initial release. CLI scaffolding + `doctor` discovery for Claude Code,
  Codex, CC Switch, OpenCode (P0).
