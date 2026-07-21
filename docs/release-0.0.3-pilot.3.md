# AgentGuard 0.0.3-pilot.3 · Pilot Ready 预发布说明

> 日期：2026-07-14
>
> 渠道：私有 Git 仓库固定标签
>
> 目标：验证现有产品价值，不扩展新 Agent、Dashboard 或 Runtime 能力

## 本次发布定位

`0.0.3-pilot.3` 是首个通过标准 npm tarball 分发的 Pilot 候选。仓库提交经过 CI 校验的预编译 `dist/`，GitHub Pre-release 提供可直接安装的 `.tgz`，安装时不调用 `tsc`。

本轮只验证：

- 用户能否在 10 分钟内完成发现、扫描和报告。
- 多 Agent 配置地图、关联风险和整改建议是否产生实际行动。
- 用户是否愿意重复运行或接入 CI。

完整试用流程和出口标准见 [pilot-readiness.md](pilot-readiness.md)。

## 安装

```bash
gh release download v0.0.3-pilot.3 \
  --repo fengyufengzi/AgentGuard \
  --pattern 'agentguard-0.0.3-pilot.3.tgz'
npm install -g ./agentguard-0.0.3-pilot.3.tgz
agentguard --version
```

版本输出必须为：

```text
0.0.3-pilot.3
```

不要使用持续变化的 `main` 进行试点；所有参与者应使用同一固定标签。

## 建议验证流程

```bash
agentguard doctor
agentguard scan
agentguard map
agentguard report --format html
agentguard baseline --profile balanced --dry-run
```

仅当用户确认 dry-run 变更后，再执行：

```bash
agentguard apply --profile balanced --backup
agentguard restore
```

## 相比 0.0.2 的重点变化

- Gemini CLI deepScan 和 OpenClaw 定向深扫/有限收敛能力进入实际支持矩阵。
- Codex、CC Switch 不可自动修改的高危项提供分步人工整改。
- HTML 报告增加 Agent × 严重度总览和交互过滤，提供 CI 门禁示例。
- 所有机器输出增加 `schemaVersion: 1` 和 `command`，契约见 [output-schema-v1.md](output-schema-v1.md)。
- apply 使用原子写入和源文件哈希检测；写入失败自动回滚。
- 备份记录原权限和 SHA-256，使用私有目录权限；restore 拒绝非法 ID、越界路径和被篡改内容。
- 增加 Pilot 试用手册和 GitHub 结构化反馈模板。
- 提交预编译 `dist/` 并发布标准 npm tarball，不依赖 TypeScript 或 npm 的全局 Git 依赖实现。

## 已知边界

- Codex TOML 和 CC Switch SQLite 坚持只读，不做自动改写。
- 自动收敛只覆盖 README 明确列出的有限配置，不等价于通用 Policy Engine。
- 尚无持久化 Workspace Inventory、漂移历史、Dashboard、组织策略分发或 Runtime Enforcement。
- Mac 桌面版仍是未签名开发者预览，不作为本轮主要入口。
- Provider 信任策略和风险规则仍可能出现误报，反馈时请提交规则 ID，不要提交完整配置或凭证。

## 发布前检查

- [x] `npm test`
- [x] 预编译 `dist/` 与源码一致
- [x] 本地 tarball 全新安装验证
- [x] 发布包包含 Pilot 手册、输出契约和 CI 示例
- [x] JSON 输出契约回归
- [x] apply/restore 权限、完整性和非法路径回归
- [x] 固定提交已推送到私有远端
- [x] `v0.0.3-pilot.3` 标签与 GitHub Pre-release 已推送
- [x] 使用 Homebrew Node 26 / npm 11 从 Release tarball 完成全局安装验证

全部发布检查已完成，可以向试用者分发安装命令。
