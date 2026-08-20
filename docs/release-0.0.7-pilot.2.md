# 0.0.7-pilot.2（2026-08-20）— DeepSeek Harness 只读分发

> 状态：Published Public Preview
> 冻结日期：2026-08-19
> 发布日期：2026-08-20

`0.0.7-pilot.2` 是 CLI、macOS Desktop 与 DeepSeek Harness（DSH）插件的联合 Public Preview。本文件记录
公开能力、最终资产和已完成的发布验证。

## 候选内容

- 新增 `agentreveal integration scan --format model-json` 独立 allowlist 契约；
- 同一 `agentreveal` npm 包包含 `dsh.bundle` 和 DSH Web 原生 `/agentreveal`；
- 固定兼容 `@deepseek-ai/dsh@0.1.0-rc.7`、`pnpm@11.7.0` 与 Node
  `^22.19.0 || >=24.0.0`；
- `/agentreveal` 只响应用户显式触发，不注册模型工具或 MCP，不执行配置写入；
- Adapter 使用固定 Node/CLI/argv、无 shell、60 秒超时、256 KiB 输出上限，并对模型安全 JSON 做 exact-key
  allowlist 复验；
- 高价值规则场景扩展、同根因任务去重和 CLI/JSON/HTML/Desktop Top 3 一致性随同进入候选。

## 已完成验证

- 隔离 HOME/DSH_HOME/PATH 的旧版安装、当前版升级、原生命令、Web HTTP 启动、卸载和无状态残留；
- 缺少 CLI、版本不一致、退出码异常、超时、取消、输出过大、非法 JSON、额外字段和动态文案安全失败；
- 最终 npm tarball 的内置 sanitizer、独立 Gitleaks、SHA-256 和同包版本检查；
- 暂存快照导出的单提交公开候选历史通过 sanitizer 与独立 Gitleaks；私有仓库旧历史不得进入公开仓库；
- 39 秒全合成 DSH 安装、显式扫描、Top 3 和隐私边界演示。

## 发布资产

- npm：`agentreveal@0.0.7-pilot.2`；
- Git tag：`v0.0.7-pilot.2`；
- npm tarball：`agentreveal-0.0.7-pilot.2.tgz`，SHA-256
  `64e03f26ebed21996b371b4fd8c9f364ebf5220262b6fec34a16bbb21ed8dbe2`；
- macOS Apple Silicon DMG：`AgentReveal-0.0.7-pilot.2-arm64.dmg`，SHA-256
  `57673365d703f7dc1e94c6b1f3369db9cc7b07825fe7aa2a12c5460853777f58`；
- 公证 Submission ID：`f3c2af79-7e51-4403-9615-30f601c50aa1`，状态 `Accepted`；
- 最终 tarball、DMG 内 `app.asar` 已通过 Gitleaks 8.30.1，DMG 已通过签名、Gatekeeper、staple 和只读挂载验证。

公开仓库只接收从冻结工作树导出的审查提交，不包含私有仓库 Git 历史。
