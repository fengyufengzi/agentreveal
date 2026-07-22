# AgentGuard 0.0.5-pilot.3 · CLI 与 macOS Desktop Public Preview

> 状态：Draft。只有 scoped npm CLI、Developer ID 签名、公证 DMG、最终资产扫描和公开位置回装验证全部
> 通过后，才能发布 GitHub Pre-release。

## 本版目标

第一次使用不再从整机权限请求开始，而是让普通用户选择一个明确的代码项目，在同一工作台完成：

```text
选择项目 → 本地扫描 → 找到最优先任务 → 查看或执行安全整改 → 复扫 → 导出报告
```

## 相比 0.0.5-pilot.2

- npm 包改为 `@wangmarsen/agentguard`，避免与现有 `agent-guard` 包触发 npm 相似名称保护；
- 安装后的可执行命令保持 `agentguard`，CLI 行为和 Desktop 产品名称不变；
- 版本升为 `0.0.5-pilot.3`，重新生成、签名、公证和扫描全部最终资产，不移动旧候选 tag；
- macOS Desktop 与 CLI 继续复用同一 core、taskId、处置和复扫验证语义。

## 安装

CLI（Node.js 22+）：

```bash
npm install -g @wangmarsen/agentguard@next
agentguard --version
agentguard
```

macOS Desktop：从同版本 GitHub Pre-release 下载 `AgentGuard-0.0.5-pilot.3-arm64.dmg`，拖入
Applications 后打开。当前验证范围为 macOS 12+、Apple Silicon；Intel 尚未验证。

## 发布资产

正式发布时必须同时提供且版本一致：

- `wangmarsen-agentguard-0.0.5-pilot.3.tgz`；
- `AgentGuard-0.0.5-pilot.3-arm64.dmg`；
- `SHA256SUMS`；
- Desktop Demo 视频或链接。

SHA-256、Git tag、npm dist-tag 和 GitHub Release URL 只能在最终资产通过验收后填写。

## 支持边界

- Desktop：macOS 12+、Apple Silicon；Intel 尚未验证；
- CLI：Node.js 22+；macOS 为主要端到端验证平台，Linux 和 Windows 为 Beta；
- 默认扫描只读、本地运行、不自动上传；
- 自动整改只覆盖受支持配置，并强制预览、确认、备份、原子写入和复扫；
- Codex 和 CC Switch 的凭证或配置迁移继续提供分步人工引导，不做自动改写。

## 发布阻断项

- [ ] `@wangmarsen/agentguard@0.0.5-pilot.3` 以 `next` dist-tag 发布并完成 registry 回装；
- [ ] Developer ID Application 真实签名；
- [ ] Apple notarization 状态为 Accepted，并检查公证日志；
- [ ] `codesign`、Gatekeeper、staple 和 DMG 完整性全部通过；
- [ ] 最终 npm tarball、DMG 和 `app.asar` 独立敏感信息扫描通过；
- [ ] npm 包、Git tag、GitHub Release 和 DMG 使用同一版本；
- [ ] 从最终公开位置重新下载并完成 checksum、安装和版本回装验证。
