# AgentReveal macOS 签名与公证

> 状态：发布骨架已就绪；只有 Apple Developer Program 审核通过、Developer ID 证书和公证凭据均可用后，
> 才能完成真实发布验证。任何凭据都不得提交到 Git。

## 1. 本地开发包

`desktop:pack` 只用于本机源码验证：它在系统临时目录 `agentreveal-local-preview` 生成可双击的开发启动器，
通过当前仓库中已经受系统信任的 Electron 开发运行时加载代码，不上传 Apple，也不能脱离源码目录分发：

```bash
npm run desktop:pack
```

macOS 26 会以系统策略终止缺少公证 ticket 的独立 Electron App，因此 `desktop:dist` 不再生成一个看似成功、
实际闪退的本地 DMG，而是引导等待最终候选后执行 `desktop:release`。正式 bundle 验证会检查
`codesign --verify --deep --strict`，并把主进程因信号退出也视为启动失败。

## 2. 正式发布所需凭据

直接分发使用 `Developer ID Application` 证书。electron-builder 可从当前登录钥匙串查找证书，或读取：

- `CSC_LINK`：导出的 `.p12` 路径、URL、data URL 或 base64 内容；
- `CSC_KEY_PASSWORD`：`.p12` 密码。

公证凭据三选一：

1. `APPLE_API_KEY`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`；其中 `APPLE_API_KEY` 是 `.p8` 文件路径；
2. `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`；
3. `APPLE_KEYCHAIN_PROFILE`，可选配 `APPLE_KEYCHAIN`。

正式构建通过 `scripts/notarize-macos.cjs` 调用 `notarytool`，默认关闭 S3 Transfer Acceleration，以降低
大体积 Electron App 在部分网络环境中的 multipart upload 超时；公证返回 Accepted 后才 staple 并继续生成
DMG。预检会在签名前调用 `notarytool history` 验证当前凭据和 Apple 服务连接，避免完成耗时签名后才发现
Keychain profile 已缺失。脚本不会输出凭据值。

推荐本机使用 notarytool Keychain Profile，CI 使用 GitHub Secrets。不要把凭据写入 `.env`、脚本或 YAML。

## 3. 构建与验证

```bash
npm run desktop:release
npm run desktop:release:verify
npm run release:scan-assets -- --dmg release/AgentReveal-<version>-arm64.dmg
```

第一条命令会先检查 macOS、Xcode、Developer ID 证书和完整公证凭据，然后启用 Hardened Runtime、
entitlements、强制代码签名和 notarization。第二条命令依次验证：

- `codesign --verify --deep --strict`；
- Gatekeeper `spctl --assess`；
- `xcrun stapler validate`；
- `hdiutil verify`；
- DMG SHA-256。

第三条命令使用独立 Gitleaks：只读挂载 DMG，定位唯一 `.app`，解包 `app.asar` 后扫描应用实际携带的文本；
匹配内容始终 100% 脱敏，临时挂载和解包目录无论成功失败都会清理。联合发布时还必须把最终 npm tarball
通过 `--tarball` 一并扫描，不能用源码树扫描替代最终资产扫描。

正式构建会在系统临时目录完成签名、公证与首次验证，再只把验证通过的 DMG 复制到 `release/` 并从
DMG 重新挂载复核。`afterPack` 还会在签名前清理 app bundle 的扩展属性。两层防护共同避免 Finder 或
File Provider 写入的 `FinderInfo`、resource fork 等附带信息导致 `codesign` 拒绝产物；不会修改源码或
钥匙串。构建失败时临时目录会保留并打印路径，供本机诊断。

任何一步失败都不得上传 Release。

正式图标位于 `desktop/icon.icns`，可维护源文件为 `desktop/icon.svg` 和 `desktop/icon.png`。构建配置显式
引用该图标，发布预检也会检查 ICNS 是否存在，禁止把 Electron 默认图标带入公开版本。

## 4. GitHub Actions

`.github/workflows/macos-release.yml` 仅允许从 `main` 手动触发，输入必须与 `package.json` 和版本化 Release
Notes 一致。配置以下 GitHub Actions Secrets 后才能运行：

- `MAC_CSC_LINK`；
- `MAC_CSC_KEY_PASSWORD`；
- `APPLE_ID`；
- `APPLE_APP_SPECIFIC_PASSWORD`；
- `APPLE_TEAM_ID`。

工作流会生成同版本 npm tarball 和 Apple Silicon DMG，在上传前安装独立 Gitleaks，并扫描解包后的 tarball、
应用及 `app.asar`；只上传签名、公证、Gatekeeper、staple、checksum 和独立敏感信息检查全部通过的联合候选，
保留 7 天。它不会自动发布 npm、创建 GitHub Release 或把仓库公开；这些不可逆操作必须等待干净机和 Pilot
验收完成。

## 5. 首次发布前仍需人工验证

- 在全新 Apple Silicon Mac 上从 DMG 安装到 `/Applications`；
- 首次启动没有 Gatekeeper 绕过步骤；
- 欢迎页明确解释应选择单个代码项目根目录、实际读取范围和普通源代码边界；
- 选择项目、扫描、导出 HTML/JSON、重新打开报告均成功，且项目扫描不触发无关受保护文件夹权限请求；
- 整机扫描在执行前明确提示可能请求桌面、文稿、下载等文件夹权限；
- Claude 明文凭证任务可一键备份实际目标文件；迁移后任务消失时恢复入口仍可见，备份篡改或确认后的并发
  修改会拒绝恢复，正常恢复会重新出现明文任务且不会泄漏凭证到诊断；
- 未选择项目和完成扫描后均可导出脱敏诊断；检查其中不含项目路径、端点、task ID、配置内容和原始错误文本；
- 断网运行时扫描和诊断导出可用，且没有自动上传请求；
- CLI 与桌面端针对同一项目生成相同 taskId；
- 卸载说明、最低 macOS 12、已知限制和 SHA-256 已写入 Release Notes。
