/**
 * Desktop MVP smoke test：不启动 GUI，只验证桌面入口资产存在且脚本可被解析。
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

test("desktop: Electron MVP assets exist", () => {
  for (const file of [
    "main.cjs",
    "preload.cjs",
    "diagnostics.cjs",
    "index.html",
    "renderer.js",
    "styles.css",
    "application-menu.cjs",
    "window-state.cjs",
    "icon.svg",
    "icon.png",
    "icon.icns",
  ]) {
    assert.equal(existsSync(join(repoRoot, "desktop", file)), true, file);
  }
});

test("desktop: packaging keeps Electron entry out of npm package metadata", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const config = readFileSync(join(repoRoot, "electron-builder.yml"), "utf8");
  assert.equal(pkg.main, undefined);
  assert.match(config, /extraMetadata:/);
  assert.match(config, /main: desktop\/main\.cjs/);
  assert.match(pkg.scripts["desktop:pack"], /build-local-macos-app\.mjs/);
  const localBuild = readFileSync(
    join(repoRoot, "scripts", "build-local-macos-app.mjs"),
    "utf8"
  );
  assert.match(localBuild, /agentguard-local-preview/);
  assert.match(localBuild, /osacompile/);
  assert.match(localBuild, /Electron\.app/);
});

test("desktop: main process only exposes approved typed operations", () => {
  const main = readFileSync(join(repoRoot, "desktop", "main.cjs"), "utf8");
  assert.match(main, /agentguard:scanMachine/);
  assert.match(main, /agentguard:selectProject/);
  assert.match(main, /agentguard:scanProject/);
  assert.match(main, /agentguard:previewBaseline/);
  assert.match(main, /agentguard:applyBaseline/);
  assert.match(main, /agentguard:restoreBaseline/);
  assert.match(main, /agentguard:backupClaudeRemediation/);
  assert.match(main, /agentguard:restoreClaudeRemediation/);
  assert.match(main, /agentguard:acceptRisk/);
  assert.match(main, /agentguard:verifyRisk/);
  assert.match(main, /agentguard:revokeRisk/);
  assert.match(main, /agentguard:trustProvider/);
  assert.match(main, /agentguard:removeProviderTrust/);
  assert.match(main, /agentguard:ignoreRule/);
  assert.match(main, /agentguard:removeRuleIgnore/);
  assert.match(main, /agentguard:exportDiagnostics/);
  assert.match(main, /createDiagnostics/);
  assert.match(main, /tracked/);
  assert.match(main, /approvedProjects/);
  assert.match(main, /issuedBaselineBackups/);
  assert.match(main, /issuedCredentialBackups/);
  assert.match(main, /showMessageBox/);
  assert.doesNotMatch(main, /child_process|\bspawn\(/);
  assert.doesNotMatch(main, /shell: true/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /createApplicationMenuTemplate/);
  assert.match(main, /agentguard:menuState/);
  assert.match(
    main,
    /path\.resolve\(__dirname, "\.\.", "dist", "desktop", "service\.js"\)/
  );
  assert.doesNotMatch(
    main,
    /path\.join\(app\.getAppPath\(\), "dist", "desktop", "service\.js"\)/
  );
  assert.match(main, /loadWindowState/);
  assert.match(main, /saveWindowState/);
});

test("desktop: renderer uses preload bridge", () => {
  const renderer = readFileSync(join(repoRoot, "desktop", "renderer.js"), "utf8");
  const preload = readFileSync(join(repoRoot, "desktop", "preload.cjs"), "utf8");
  assert.doesNotMatch(preload, /require\(["']\.\//);
  assert.match(renderer, /window\.agentguard\.scanMachine/);
  assert.match(renderer, /window\.agentguard\.selectProject/);
  assert.match(renderer, /window\.agentguard\.scanProject/);
  assert.match(renderer, /window\.agentguard\.exportReport/);
  assert.match(renderer, /window\.agentguard\.acceptRisk/);
  assert.match(renderer, /window\.agentguard\.verifyRisk/);
  assert.match(renderer, /window\.agentguard\.revokeRisk/);
  assert.match(renderer, /window\.agentguard\.trustProvider/);
  assert.match(renderer, /firstRun\?\.remediationGuides/);
  assert.match(renderer, /复制到 Terminal 依次执行/);
  assert.match(renderer, /window\.agentguard\.removeProviderTrust/);
  assert.match(renderer, /window\.agentguard\.ignoreRule/);
  assert.match(renderer, /window\.agentguard\.removeRuleIgnore/);
  assert.match(renderer, /window\.agentguard\.applyBaseline/);
  assert.match(renderer, /window\.agentguard\.restoreBaseline/);
  assert.match(renderer, /window\.agentguard\.backupClaudeRemediation/);
  assert.match(renderer, /window\.agentguard\.restoreClaudeRemediation/);
  assert.match(preload, /agentguard:backupClaudeRemediation/);
  assert.match(preload, /agentguard:restoreClaudeRemediation/);
  assert.match(renderer, /window\.agentguard\.exportDiagnostics/);
  assert.match(renderer, /window\.agentguard\.onMenuCommand/);
  assert.match(renderer, /window\.agentguard\.updateMenuState/);
  assert.match(renderer, /handleNativeMenuCommand/);
  assert.match(renderer, /topTaskNavigation/);
  assert.match(renderer, /prioritizedTaskList/);
  assert.match(renderer, /content\.toggleAttribute\("inert", working\)/);
  assert.doesNotMatch(renderer, /JSON\.parse\(result\.stdout/);
  assert.match(renderer, /data-welcome-action/);
  assert.match(renderer, /task-detail/);
  assert.match(renderer, /复扫验证/);
  assert.match(renderer, /item\.kind !== "verify"/);
  assert.match(renderer, /item\.id !== "claude-credential-backup"/);
  assert.match(renderer, /不需要执行 CLI 扫描命令/);
  assert.match(renderer, /复制到 Terminal 依次执行/);
  assert.match(renderer, /一键备份/);
  assert.match(renderer, /迁移异常时恢复/);
  assert.match(renderer, /模型 \/ Provider \/ 鉴权/);
  assert.match(renderer, /chain\.agentLabel \|\| chain\.via/);
  assert.match(renderer, /经 \$\{chain\.owner\}/);
  assert.match(renderer, /chain\.authMode/);
});

test("desktop: first-run recommends a clearly explained project scope and keeps the core workflow on one page", () => {
  const html = readFileSync(join(repoRoot, "desktop", "index.html"), "utf8");
  const css = readFileSync(join(repoRoot, "desktop", "styles.css"), "utf8");
  const main = readFileSync(join(repoRoot, "desktop", "main.cjs"), "utf8");
  const renderer = readFileSync(join(repoRoot, "desktop", "renderer.js"), "utf8");
  assert.match(html, /icon\.png/);
  assert.match(html, /本地运行 · 零上传/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /id="assertiveStatus"/);
  assert.match(html, /role="progressbar"/);
  assert.match(renderer, /选择项目并开始扫描/);
  assert.match(renderer, /包含 <code>\.git<\/code>/);
  assert.match(renderer, /普通源代码只检查文件名，不读取内容/);
  assert.match(renderer, /macOS 可能请求“桌面”“文稿”“下载”等文件夹权限/);
  assert.match(renderer, /requestMachineScan/);
  assert.match(renderer, /if \(command === "scan-machine"\) requestMachineScan\(\)/);
  assert.match(renderer, /if \(!state\.overview\) chooseProject\(\)/);
  assert.match(html, /等待选择项目/);
  assert.match(main, /选择代码项目的根目录/);
  assert.match(main, /buttonLabel: "选择并扫描"/);
  assert.doesNotMatch(main, /properties: \["openDirectory", "createDirectory"\]/);
  assert.match(renderer, /预览并一键整改/);
  assert.match(renderer, /开始安全迁移/);
  assert.match(renderer, /选择一个 Agent/);
  assert.match(renderer, /data-agent-view/);
  assert.match(renderer, /role="tablist"/);
  assert.match(renderer, /aria-selected/);
  assert.match(renderer, /ArrowRight/);
  assert.match(renderer, /focusResultsHeading/);
  assert.match(renderer, /data-agent-overview/);
  assert.match(renderer, /selectedAgent/);
  assert.match(renderer, /跨 Agent 与当前项目/);
  assert.match(renderer, /安全修改与恢复（高级）/);
  assert.match(renderer, /data-copy-command/);
  assert.match(renderer, /async function copyCommand/);
  assert.match(renderer, /只有迁移后启动或鉴权异常时才恢复/);
  assert.match(renderer, /不处理明文凭证/);
  assert.match(renderer, /模型 \/ Provider/);
  assert.match(renderer, /安全相关权限/);
  assert.match(renderer, /问题与修复建议/);
  assert.match(html, /class="app-header"/);
  assert.match(html, /class="scan-context-row"/);
  assert.match(html, /id="machineScopeBtn"/);
  assert.match(html, /class="report-menu"/);
  assert.doesNotMatch(html, /class="sidebar"/);
  assert.doesNotMatch(renderer, /agent-scan-context/);
  assert.doesNotMatch(html, /data-view=/);
  assert.match(css, /color-scheme: light dark/);
  assert.match(css, /--bg: #f3f5f4/);
  assert.match(css, /--panel: #ffffff/);
  assert.match(css, /--brand: #ffb02e/);
  assert.match(css, /--accent: #0a6fd3/);
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(css, /prefers-contrast: more/);
  assert.match(css, /prefers-reduced-transparency: reduce/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /focus-visible/);
  assert.match(css, /agent-card-affordance/);
  assert.match(css, /agent-workspace-body/);
  assert.match(css, /task-policy-menu/);
  assert.match(renderer, /technical-identity/);
  assert.match(renderer, /更多策略/);
  assert.match(css, /more-tasks\[open\]/);
});

test("desktop: local launcher uses trusted Electron and release build requires notarization", () => {
  const config = readFileSync(join(repoRoot, "electron-builder.yml"), "utf8");
  const releaseConfig = readFileSync(
    join(repoRoot, "electron-builder.release.yml"),
    "utf8"
  );
  const afterPack = readFileSync(join(repoRoot, "scripts", "after-pack.cjs"), "utf8");
  const releaseBuild = readFileSync(
    join(repoRoot, "scripts", "build-macos-release.mjs"),
    "utf8"
  );
  const bundleVerify = readFileSync(
    join(repoRoot, "scripts", "verify-desktop-bundle.mjs"),
    "utf8"
  );
  const localBuild = readFileSync(
    join(repoRoot, "scripts", "build-local-macos-app.mjs"),
    "utf8"
  );
  assert.match(config, /sign: false/);
  assert.match(config, /arm64/);
  assert.match(config, /output: release/);
  assert.match(config, /icon: desktop\/icon\.icns/);
  assert.match(config, /hardenedRuntime: false/);
  assert.match(config, /notarize: false/);
  assert.match(localBuild, /osacompile/);
  assert.match(localBuild, /Notary Ticket Missing|公证 ticket/);
  assert.match(bundleVerify, /child\.signalCode/);
  assert.match(bundleVerify, /codesign.*--verify/s);
  assert.match(releaseConfig, /forceCodeSigning: true/);
  assert.match(releaseConfig, /hardenedRuntime: true/);
  assert.match(releaseConfig, /notarize: true/);
  assert.match(releaseConfig, /entitlements\.mac\.plist/);
  assert.match(afterPack, /spawnSync\('xattr', \['-cr', appPath\]/);
  assert.match(releaseBuild, /mkdtempSync\(join\(tmpdir\(\), 'agentguard-macos-release-'/);
  assert.match(releaseBuild, /verify-macos-release\.mjs/);
  assert.match(bundleVerify, /const exitPromise/);
  assert.match(bundleVerify, /await exitPromise/);
  assert.match(releaseBuild, /copyFileSync/);
  const preflight = readFileSync(
    join(repoRoot, "scripts", "macos-release-preflight.mjs"),
    "utf8"
  );
  assert.match(preflight, /desktop\/icon\.icns/);
});

test("desktop: release workflow builds matching CLI and signed DMG candidates without publishing", () => {
  const workflow = readFileSync(
    join(repoRoot, ".github", "workflows", "macos-release.yml"),
    "utf8"
  );
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /release:verify-version/);
  assert.match(workflow, /npm pack --pack-destination release-candidate/);
  assert.match(workflow, /--tarball release-candidate/);
  assert.match(workflow, /--dmg release\/AgentGuard/);
  assert.match(workflow, /SHA256SUMS/);
  assert.doesNotMatch(workflow, /npm publish|gh release create/);
});

test("desktop: application icon uses the approved flat brand palette", () => {
  const svg = readFileSync(join(repoRoot, "desktop", "icon.svg"), "utf8");
  assert.match(svg, /#103D31/);
  assert.match(svg, /#F3F0E6/);
  assert.match(svg, /#FFB02E/);
  assert.doesNotMatch(svg, /gradient|filter|shadow/i);
});

test("desktop: synthetic demo is reproducible and contains no live capture path", () => {
  const builder = readFileSync(
    join(repoRoot, "scripts", "build-desktop-demo.mjs"),
    "utf8"
  );
  const capture = readFileSync(
    join(repoRoot, "scripts", "capture-desktop-preview.cjs"),
    "utf8"
  );
  assert.match(builder, /capture-desktop-preview\.cjs/);
  assert.match(builder, /agentguard-desktop-demo\.mp4/);
  assert.match(builder, /-map_metadata/);
  assert.match(capture, /\/Users\/example\/Project/);
  assert.match(capture, /workspace-report-menu/);
  assert.doesNotMatch(capture, /scanMachine|scanProject|selectProject/);
});

test("desktop: CSP and context isolation keep renderer unprivileged", () => {
  const html = readFileSync(join(repoRoot, "desktop", "index.html"), "utf8");
  const main = readFileSync(join(repoRoot, "desktop", "main.cjs"), "utf8");
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'none'/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /nodeIntegration: false/);
});
