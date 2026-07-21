# AgentGuard 0.0.4-pilot.1 · 下一步行动报告预发布说明

> 日期：2026-07-15
>
> 渠道：私有 GitHub Pre-release 标准 npm tarball
>
> 目标：验证用户能否从扫描结果直接完成判断、整改和复测

## 本次发布定位

`0.0.4-pilot.1` 不扩展 Agent 数量，而是解决 Pilot 中最明确的产品问题：用户看到风险列表后，不知道
应该先处理什么、如何处理，以及哪些项目只是预期配置。

产品主流程从：

```text
扫描 → 风险列表
```

升级为：

```text
扫描 → 判断 → 行动 → 验证
```

## 安装

```bash
mkdir -p /tmp/agentguard-pilot

gh release download v0.0.4-pilot.1 \
  --repo fengyufengzi/AgentGuard \
  --pattern 'agentguard-0.0.4-pilot.1.tgz' \
  --dir /tmp/agentguard-pilot \
  --clobber

npm install -g /tmp/agentguard-pilot/agentguard-0.0.4-pilot.1.tgz
agentguard --version
```

预期输出：

```text
0.0.4-pilot.1
```

不要使用 `npm install -g git+https://...`；本轮继续统一使用 Release 中包含预编译 `dist/` 的 `.tgz`。

## 建议验证流程

```bash
cd /你的日常项目目录
agentguard doctor
agentguard scan
agentguard map
agentguard report --format html
```

打开 `agentguard-report.html` 后，先检查首页的“建议先完成的 3 项”，再依次查看：

1. 立即处理。
2. 需要确认。
3. 建议清理。
4. 配置观察。

如果报告显示 baseline 支持，必须先执行 dry-run：

```bash
agentguard baseline --profile balanced --dry-run
```

确认全部变更后才执行：

```bash
agentguard apply --profile balanced --backup
agentguard scan
```

## 相比 0.0.3-pilot.3 的重点变化

- 完成 63 条具体规则的机器可读处置矩阵。
- 将潜在影响 `severity` 与行动顺序 `priority` 分离。
- 每条 finding 增加处置类型、可信度、修复方式、下一步、验证方法与接受条件。
- HTML 首页新增“立即处理 / 需要确认 / 建议清理 / 配置观察”。
- 默认给出最优先的三项行动，不再要求用户从完整风险列表自行排序。
- 10 条 baseline 规则与实际整改能力对齐，并区分完整解决与风险缓解。
- `observe` 项不进入默认待处理数量，但仍保留在技术证据区。
- MCP 疑似密钥规则改为低置信确认项，不再仅凭字段名断言已明文落盘。
- OpenClaw 的 `${ENV_VAR}` / `$ENV_VAR` 引用不再误报为明文凭证。
- JSON v1 保持原有顶层结构，只为 finding 增加可选 `action` 字段。

完整开发计划见 [development-plan-actionable-report.md](development-plan-actionable-report.md)，规则索引见
[rule-disposition-matrix.md](rule-disposition-matrix.md)。

## 已知边界

- 本轮没有持久化“已接受风险 / 误报 / 到期时间”；同一预期配置在后续扫描中仍会显示为观察项。
- baseline apply 会应用 dry-run 中的全部计划变更，不是只处理当前报告卡片。
- Codex TOML 和 CC Switch SQLite 继续坚持只读，相关整改需要在原应用或配置文件中完成。
- 未知 Provider 和远程 MCP 的可信性仍需要用户结合所有者、TLS 和数据处理政策判断。
- Dashboard、跨机器 Inventory、Drift Tracking、组织策略和 Runtime Enforcement 不在本轮范围。

## 发布前检查

- [x] 63 条源码规则、规则 ID、机器矩阵和可读文档一一对应
- [x] 10 条 baseline 能力映射测试
- [x] HTML 行动排序、四类计数、XSS 和兼容回归
- [x] OpenClaw 环境变量引用误报回归
- [x] 真实环境报告生成并完成行动分类检查
- [x] `npm test`
- [x] 预编译 `dist/` 与源码一致
- [x] `npm pack --dry-run`
- [x] 根因任务聚合回归
- [x] 本地候选 tarball 隔离前缀全新安装与真实报告验证
- [x] GitHub Pre-release 与 SHA-256 资产发布

GitHub Pre-release：[v0.0.4-pilot.1](https://github.com/fengyufengzi/AgentGuard/releases/tag/v0.0.4-pilot.1)。
发布资产已从 GitHub 重新下载，完成 SHA-256 校验、隔离前缀全新安装、版本检查和真实报告生成，
现在可以向试用者分发本版本。
