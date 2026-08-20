# 0.0.7-pilot.1 (2026-08-05) — Rename to AgentReveal

## 概览

把产品从 `AgentGuard` 改名为 `AgentReveal`，同一 pilot 系列的延续版本。
本版本不引入新能力，专注于改名与对外契约清理，方便 Pilot 用户在新版本下重新生成可信快照。

## 变更

### CLI / npm

- 包名：从 scope `@wangmarsen/agentguard` 切到顶层包 `agentreveal`。
- 二进制：从 `agentguard` 改为 `agentreveal`；`bin/agentreveal` 是新的入口。
- 默认报告文件名：从 `agentguard-report.{json,html}` 改为 `agentreveal-report.{json,html}`。

### 本地状态与配置

- `~/.agentguard/` → `~/.agentreveal/`（路径即改名，不写迁移脚本 — 与 ADR-0001 "不长期收集外泄数据"立场一致）。
- `.agentguard.json` / `agentguard.config.json` → `.agentreveal.json` / `agentreveal.config.json`。
- HMAC 域串与 hash 域串：`agentguard-*` → `agentreveal-*`。
- 环境变量前缀：`AGENTGUARD_*` → `AGENTREVEAL_*`。

### 桌面（macOS Public Preview）

- `appId` 从 `com.agentguard.desktop` 切到 `app.reveal.desktop`；
  DMG 命名 `AgentReveal-0.0.7-pilot.1-arm64.dmg`。
- IPC channel 命名空间：`agentguard:<op>` → `agentreveal:<op>`（26 个通道）。
- preload `exposeInMainWorld("agentreveal")` 替换旧 `agentguard`。

### 文档 / ADR

- 新建 ADR-0006（产品改名与私有状态契约）与 ADR-0007（桌面 bundle identity 切换）。
- ADR-0001 / ADR-0004 / ADR-0005 顶标 Superseded by ADR-0006 / ADR-0007（按"不静默改写历史结论"原则）。
- 历史 release notes（含 SHA 与 DMG 名）保持原状。

## 迁移指引

1. **卸载旧桌面应用**（macOS 不允许同名同 vendor 覆盖升级）：
   ```bash
   sudo rm -rf "/Applications/AgentGuard.app"
   ```
2. **老 npm 包**：0.0.6 之后将 deprecate 并按 npm 72 小时窗口尝试 `unpublish`；
   新安装请用 `npm install -g agentreveal@pilot`。
3. **本地状态**：首次运行 `agentreveal doctor` 会按 onboarding 重建 `~/.agentreveal/`；
   老 `~/.agentguard/` 目录可手动删除。
4. **项目基线**：进入项目目录重跑 `agentreveal scan --accept-current` 即可生成新格式 `.agentreveal.json` 基线。

## 不在本版本内

- 不修复任何 0.0.6-pilot.4 已知的隐私 / 写入 / 风险语义问题；这些由 0.0.7-pilot.2+ 增量修复。
- 不展开新的 Agent 支持；当前覆盖范围与 0.0.6-pilot.4 一致。
- 不扩大产品边界（仍按 PRODUCT_DIRECTION.md 公开边界）。

## 发布资产

- npm tarball: `agentreveal-0.0.7-pilot.1.tgz`
- macOS DMG: `AgentReveal-0.0.7-pilot.1-arm64.dmg`（带签名 + 公证 + staple）
