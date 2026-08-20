# ADR-0007：桌面 bundle identity 与 appId 切换

- Status: Accepted
- Date: 2026-08-05
- Supersedes: ADR-0004（在桌面 bundle / IPC channel / preload 暴露名部分）

## 背景

产品从 AgentGuard 改名为 AgentReveal。Electron Desktop 在 macOS 上的 bundle identity
（`CFBundleIdentifier`，即 `appId`）从 `com.agentguard.desktop` 切到 `app.reveal.desktop`。

macOS Gatekeeper 不允许"同名同 vendor"覆盖升级；当 `CFBundleIdentifier` 变化时必须先卸载
老版本才能安装新版本。当前 Pilot 用户极少，这是执行老用户手动迁移的合适窗口。

## 决策

1. **appId**：`app.reveal.desktop`（npm 顶层名 `agentreveal` 与之呼应）。
2. **productName**（`Info.plist` `CFBundleName` 与 DMG 内 `.app` 文件夹名）：`AgentReveal`。
3. **dmg artifactName**：`AgentReveal-${version}-${arch}.${ext}`（例：`AgentReveal-0.0.7-arm64.dmg`）。
4. **preload contextBridge 暴露名**：`agentreveal`（renderer 中访问 `window.agentreveal.*`）。
5. **IPC channel 命名空间**：`agentreveal:<operation>`（26 个原 `agentguard:` channel
   全部迁移；channel 列表见 ADR-0006 与 `desktop/main.cjs`）。
6. **诊断事件文件名**：`agentreveal-events.jsonl`。
7. **开发者升级路径**：CHANGELOG 与 `docs/install-upgrade-uninstall.md` 必须显式提示
   老用户在 0.0.7 安装前先：
   ```bash
   sudo rm -rf "/Applications/AgentGuard.app"
   ```
8. **Gatekeeper 与公证**：保持 DRY_RUN 与正式发布一致；`scripts/macos-release-preflight.mjs`
   不依赖 appId 名（已确认无产品名字面量），不影响签名与公证凭据校验。

## 与 ADR-0004 的关系

ADR-0004 中"每个函数对应一个白名单 `agentguard:<operation>` IPC" 与
"`AgentGuard 生成或用户明确选择的路径`"两条已被本 ADR 通过 IPC 命名空间切换 + 路径迁移覆盖；
旧 ADR 顶标 Superseded by ADR-0007。

## 不可破坏约束

- `appId` (`CFBundleIdentifier`) 与 `productName` (`CFBundleName`) 一并视作 bundle identity，
  改任一项都需要新建后续 ADR 取代本 ADR；不允许"只改 display name"而保留旧 appId。
- preload `exposeInMainWorld("agentreveal")` 与 IPC channel `agentreveal:<operation>`
  命名空间被 main + renderer + 测试三方共用；修改需同步三处。

## 影响

- 第一次 0.0.7 公开发布时，0.0.6-pilot.4 用户需手动卸载老 app；
  `docs/install-upgrade-uninstall.md` 与 `CHANGELOG` 已显式说明此步骤。
- `scripts/verify-desktop-bundle.mjs` 与 `scripts/build-local-macos-app.mjs` 中所有
  `com.agentguard.desktop` / `AgentGuard.app` 字面量同步切到 `app.reveal.desktop` /
  `AgentReveal.app`（已由 `scripts/rename-to-agentreveal.mjs` 处理）。

## 未采用方案

- 复用旧 appId `com.agentguard.desktop` 但改 display name：被放弃，因为这会让 macOS Gatekeeper
  在自动化升级路径下出现"双 App 共存"和"覆盖升级失败"两种不可预测行为。
- 使用第三方 macOS 桥接（如 rcm 等）保留 App identity：被放弃，因为额外维护成本与产品方向
  "本地只读治理入口" 不契合。
