# AgentGuard 0.0.5-pilot.2 · macOS Desktop Public Preview 候选

> 状态：Draft。只有 Developer ID 签名、Apple 公证、staple、Gatekeeper、最终资产扫描、全新 Apple Silicon
> Mac 验收和非 CLI Pilot 全部通过后，才能把本文件改为已发布状态。

## 本版目标

第一次使用不再从整机权限请求开始，而是让普通用户选择一个明确的代码项目，在同一工作台完成：

```text
选择项目 → 本地扫描 → 找到最优先任务 → 查看或执行安全整改 → 复扫 → 导出报告
```

## 主要变化

- macOS Desktop 默认入口改为“选择项目并开始扫描”，解释项目根目录、实际读取范围和普通源代码边界；
- 整机扫描保留为带受保护文件夹权限说明的次级入口；
- 扫描结果按 Agent 组织，在固定工作区查看配置、连接、权限、MCP、凭证状态和行动任务；
- CLI、HTML 和 Desktop 共用项目级规则忽略、Provider 信任、风险接受和验证语义；
- 增加非 CLI Desktop Pilot 流程、反馈指标和约 40 秒合成 Demo；
- 同一候选流程生成 npm tarball 与 Apple Silicon DMG，并独立扫描 tarball、DMG 和 `app.asar`。

## 发布资产

正式发布时必须同时提供且版本一致：

- `agentguard-0.0.5-pilot.2.tgz`；
- `AgentGuard-0.0.5-pilot.2-arm64.dmg`；
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

- [ ] Developer ID Application 真实签名；
- [ ] Apple notarization 状态为 Accepted，并检查公证日志；
- [ ] `codesign`、Gatekeeper、staple 和 DMG 完整性全部通过；
- [ ] 最终 npm tarball、DMG 和 `app.asar` 独立敏感信息扫描通过；
- [ ] 全新 Apple Silicon Mac 从下载 DMG 完成安装、首次启动、项目扫描、报告和卸载；
- [ ] 至少 3 名非 CLI Desktop 用户完成真实 Pilot，且无无关文件夹权限请求；
- [ ] npm 包、Git tag、GitHub Release 和 DMG 使用同一版本；
- [ ] 从最终发布位置重新下载并完成 checksum、安装和版本回装验证。
