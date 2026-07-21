const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  shell,
} = require("electron");
const { createDiagnostics } = require("./diagnostics.cjs");
const {
  MENU_COMMANDS,
  applyApplicationMenuState,
  createApplicationMenuTemplate,
  normalizeMenuState,
} = require("./application-menu.cjs");
const {
  loadWindowState,
  resolveWindowBounds,
  saveWindowState,
} = require("./window-state.cjs");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const approvedProjects = new Set();
const approvedMachineScopes = new Set();
const generatedReports = new Set();
const issuedBaselineBackups = new Map();
const issuedCredentialBackups = new Map();
let mainWindow;
let applicationMenu;
let servicePromise;
let diagnosticsInstance;

function desktopServicePath() {
  // __dirname is <repo>/desktop in development and <app.asar>/desktop when packaged.
  // app.getAppPath() instead resolves to the entry-file directory for `electron desktop/main.cjs`,
  // which incorrectly produced desktop/dist/desktop/service.js in the local preview launcher.
  return path.resolve(__dirname, "..", "dist", "desktop", "service.js");
}

function diagnostics() {
  if (!diagnosticsInstance) {
    diagnosticsInstance = createDiagnostics({ userDataPath: app.getPath("userData") });
  }
  return diagnosticsInstance;
}

function tracked(operation, task) {
  return diagnostics().track(operation, task);
}

function desktopService() {
  if (!servicePromise) {
    const servicePath = desktopServicePath();
    servicePromise = import(pathToFileURL(servicePath).href);
  }
  return servicePromise;
}

module.exports = { desktopServicePath };

function assertMainFrame(event) {
  if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) {
    throw new Error("已拒绝非主页面发起的桌面请求。");
  }
}

function assertApprovedProject(projectPath) {
  if (typeof projectPath !== "string" || !approvedProjects.has(projectPath)) {
    throw new Error("请先通过目录选择器确认需要扫描的项目。");
  }
}

function assertApprovedScope(scopePath) {
  if (
    typeof scopePath !== "string" ||
    (!approvedProjects.has(scopePath) && !approvedMachineScopes.has(scopePath))
  ) {
    throw new Error("请先扫描这台 Mac，或通过目录选择器确认项目。");
  }
}

function scopeKindFor(scopePath) {
  return approvedMachineScopes.has(scopePath) ? "machine" : "project";
}

function assertTaskId(taskId) {
  if (typeof taskId !== "string" || !/^task-[A-Za-z0-9_-]{6,128}$/.test(taskId)) {
    throw new Error("无效的任务 ID。");
  }
}

function assertRuleId(ruleId) {
  if (typeof ruleId !== "string" || !/^[A-Z][A-Z0-9_]{2,127}$/.test(ruleId)) {
    throw new Error("无效的规则 ID。");
  }
}

function assertAgentId(agent) {
  if (
    typeof agent !== "string" ||
    !new Set(["claude-code", "codex", "cc-switch", "opencode", "gemini", "openclaw", "workspace"]).has(agent)
  ) {
    throw new Error("无效的 Agent ID。");
  }
}

function assertPolicyReason(reason) {
  if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) {
    throw new Error("策略原因无效或超过 500 个字符。");
  }
}

function projectBackups(projectPath) {
  const existing = issuedBaselineBackups.get(projectPath) || new Set();
  issuedBaselineBackups.set(projectPath, existing);
  return existing;
}

function credentialBackups(scopePath) {
  const existing = issuedCredentialBackups.get(scopePath) || new Set();
  issuedCredentialBackups.set(scopePath, existing);
  return existing;
}

function reportDefaultPath(format) {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(app.getPath("documents"), `AgentGuard-${date}.${format}`);
}

function diagnosticsDefaultPath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(app.getPath("documents"), `AgentGuard-diagnostics-${date}.json`);
}

function sendRendererCommand(command) {
  if (!MENU_COMMANDS.has(command)) return false;
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.webContents.send("agentguard:menuCommand", command);
  return true;
}

function installApplicationMenu() {
  const template = createApplicationMenuTemplate({
    isMac: process.platform === "darwin",
    sendCommand: sendRendererCommand,
  });
  applicationMenu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(applicationMenu);
  applyApplicationMenuState(applicationMenu, {
    hasOverview: false,
    hasReport: false,
    working: false,
  });
}

function currentWindowState(win) {
  const bounds = win.getNormalBounds();
  return {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized: win.isMaximized(),
  };
}

function persistWindowState(win, recordDiagnostic = false) {
  if (!win || win.isDestroyed()) return false;
  const saved = saveWindowState(app.getPath("userData"), currentWindowState(win));
  if (recordDiagnostic) {
    diagnostics().record("window.state", saved ? "success" : "failure", saved ? undefined : "unknown");
  }
  return saved;
}

function createWindow() {
  const restored = resolveWindowBounds(
    loadWindowState(app.getPath("userData")),
    screen.getAllDisplays().map((display) => display.workArea)
  );
  const { maximized, ...windowBounds } = restored;
  const win = new BrowserWindow({
    ...windowBounds,
    minWidth: 940,
    minHeight: 660,
    title: "AgentGuard",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#181b1a" : "#f3f5f4",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const indexPath = path.join(__dirname, "index.html");
  const indexUrl = pathToFileURL(indexPath).href;
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl !== indexUrl) event.preventDefault();
  });
  let persistTimer;
  const queueWindowStatePersist = () => {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => persistWindowState(win), 400);
  };
  win.on("resize", queueWindowStatePersist);
  win.on("move", queueWindowStatePersist);
  win.on("close", () => {
    clearTimeout(persistTimer);
    persistWindowState(win, true);
  });
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = undefined;
  });
  if (maximized) win.once("ready-to-show", () => win.maximize());
  win.loadFile(indexPath);
  mainWindow = win;
}

ipcMain.on("agentguard:menuState", (event, value) => {
  try {
    assertMainFrame(event);
  } catch {
    return;
  }
  const state = normalizeMenuState(value);
  if (!state) return;
  applyApplicationMenuState(applicationMenu, state);
});

ipcMain.handle("agentguard:selectProject", async (event) => {
  assertMainFrame(event);
  return tracked("project.select", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择代码项目的根目录",
      message:
        "请选择你正在开发的单个项目，例如包含 .git、package.json 或 pyproject.toml 的文件夹。",
      buttonLabel: "选择并扫描",
      defaultPath: app.getPath("home"),
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const projectPath = result.filePaths[0];
    approvedProjects.add(projectPath);
    return { canceled: false, projectPath };
  });
});

ipcMain.handle("agentguard:scanMachine", async (event) => {
  assertMainFrame(event);
  return tracked("machine.scan", async () => {
    const service = await desktopService();
    const overview = await service.scanDesktopMachine(app.getPath("home"));
    approvedProjects.delete(overview.scope.path);
    approvedMachineScopes.add(overview.scope.path);
    return overview;
  });
});

ipcMain.handle("agentguard:scanProject", async (event, projectPath) => {
  assertMainFrame(event);
  assertApprovedProject(projectPath);
  return tracked("project.scan", async () => {
    const service = await desktopService();
    const overview = await service.scanDesktopProject(projectPath);
    approvedMachineScopes.delete(overview.project.path);
    approvedProjects.add(overview.project.path);
    return overview;
  });
});

ipcMain.handle(
  "agentguard:previewBaseline",
  async (event, projectPath, profile) => {
    assertMainFrame(event);
    assertApprovedScope(projectPath);
    if (profile !== "safe" && profile !== "balanced") {
      throw new Error("未知 baseline profile。");
    }
    return tracked("baseline.preview", async () => {
      const service = await desktopService();
      return service.previewDesktopBaseline(projectPath, profile);
    });
  }
);

ipcMain.handle(
  "agentguard:applyBaseline",
  async (event, projectPath, profile, expectedPlanFingerprint) => {
    assertMainFrame(event);
    assertApprovedScope(projectPath);
    if (profile !== "safe" && profile !== "balanced") {
      throw new Error("未知 baseline profile。");
    }
    if (
      typeof expectedPlanFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(expectedPlanFingerprint)
    ) {
      throw new Error("baseline 预览指纹无效，请重新生成预览。");
    }
    return tracked("baseline.apply", async () => {
      const service = await desktopService();
      const preview = await service.previewDesktopBaseline(projectPath, profile);
      if (preview.fingerprint !== expectedPlanFingerprint) {
        throw new Error("配置或 baseline 计划已变化，请重新生成预览后再应用。");
      }
      if (preview.files.length === 0) {
        throw new Error("当前没有可应用的 baseline 变更。");
      }
      const fileSummary = preview.files
        .map(
          (file) =>
            `${path.basename(file.configPath)}：${file.changes.length} 项变更`
        )
        .join("\n");
      const confirmation = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "确认应用安全基线",
        message: `将应用 ${profile} baseline`,
        detail:
          `${fileSummary}\n\n应用前会把完整原配置备份到项目 .agentguard/backups，` +
          "备份目录带 Git 忽略保护且仅当前用户可读。完成后会立即重新扫描。",
        buttons: ["取消", "备份并应用"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (confirmation.response !== 1) return { canceled: true };
      const result = await service.applyDesktopBaseline({
        projectPath,
        profile,
        expectedPlanFingerprint,
        scopeKind: scopeKindFor(projectPath),
      });
      projectBackups(projectPath).add(result.apply.backupId);
      return { canceled: false, ...result };
    });
  }
);

ipcMain.handle(
  "agentguard:restoreBaseline",
  async (event, projectPath, backupId) => {
    assertMainFrame(event);
    assertApprovedScope(projectPath);
    if (typeof backupId !== "string" || !/^[A-Za-z0-9_-]+$/.test(backupId)) {
      throw new Error("无效的备份 ID。");
    }
    if (!projectBackups(projectPath).has(backupId)) {
      throw new Error("只能恢复本次桌面会话中由 AgentGuard 创建的备份。");
    }
    return tracked("baseline.restore", async () => {
      const confirmation = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "确认恢复配置",
        message: "恢复应用 baseline 前的配置？",
        detail:
          `备份 ${backupId} 将覆盖 AgentGuard 应用后的配置。` +
          "如果配置在应用后又被修改，恢复会自动拒绝，避免覆盖新内容。",
        buttons: ["取消", "确认恢复"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (confirmation.response !== 1) return { canceled: true };
      const service = await desktopService();
      const result = await service.restoreDesktopBaseline({
        projectPath,
        backupId,
        scopeKind: scopeKindFor(projectPath),
      });
      projectBackups(projectPath).delete(backupId);
      return { canceled: false, ...result };
    });
  }
);

ipcMain.handle(
  "agentguard:backupClaudeRemediation",
  async (event, projectPath, taskId) => {
    assertMainFrame(event);
    assertApprovedScope(projectPath);
    assertTaskId(taskId);
    return tracked("credential.backup", async () => {
      const confirmation = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "备份 Claude Code 配置",
        message: "在执行凭证迁移前创建安全备份？",
        detail:
          "AgentGuard 只备份实际包含明文凭证字段的 Claude 设置文件。" +
          "备份保存在当前扫描范围的 .agentguard/backups，目录带 Git 忽略保护且仅当前用户可读；备份本身仍可能包含旧凭证，请在迁移完成后轮换旧凭证。",
        buttons: ["取消", "一键备份"],
        defaultId: 1,
        cancelId: 0,
        noLink: true,
      });
      if (confirmation.response !== 1) return { canceled: true };
      const service = await desktopService();
      const result = await service.backupDesktopClaudeRemediation({
        projectPath,
        taskId,
        scopeKind: scopeKindFor(projectPath),
      });
      credentialBackups(projectPath).add(result.backup.backupId);
      return { canceled: false, ...result };
    });
  }
);

ipcMain.handle(
  "agentguard:restoreClaudeRemediation",
  async (event, projectPath, backupId) => {
    assertMainFrame(event);
    assertApprovedScope(projectPath);
    if (typeof backupId !== "string" || !/^[A-Za-z0-9_-]+$/.test(backupId)) {
      throw new Error("无效的备份 ID。");
    }
    if (!credentialBackups(projectPath).has(backupId)) {
      throw new Error("只能恢复本次桌面会话中由 AgentGuard 创建的 Claude 配置备份。");
    }
    return tracked("credential.restore", async () => {
      const service = await desktopService();
      const preview = service.previewDesktopClaudeRestore({
        projectPath,
        backupId,
      });
      const confirmation = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "恢复 Claude Code 配置",
        message: "恢复到凭证迁移前的配置？",
        detail:
          `将恢复 ${preview.files} 个设置文件，其中 ${preview.changedFiles} 个自备份后发生过变化。` +
          "恢复会重新带回备份中的明文凭证字段；确认前若配置再次变化，AgentGuard 会拒绝覆盖。恢复完成后会立即复扫。",
        buttons: ["取消", "确认恢复"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (confirmation.response !== 1) return { canceled: true };
      const result = await service.restoreDesktopClaudeBackup({
        projectPath,
        backupId,
        expectedFingerprint: preview.fingerprint,
        scopeKind: scopeKindFor(projectPath),
      });
      credentialBackups(projectPath).delete(backupId);
      return { canceled: false, ...result };
    });
  }
);

ipcMain.handle(
  "agentguard:acceptRisk",
  async (event, projectPath, taskId, reason, expiresAt) => {
    assertMainFrame(event);
    assertApprovedProject(projectPath);
    assertTaskId(taskId);
    if (typeof reason !== "string" || reason.trim().length > 500) {
      throw new Error("接受原因无效或超过 500 个字符。");
    }
    if (expiresAt !== undefined && typeof expiresAt !== "string") {
      throw new Error("到期日期格式无效。");
    }
    return tracked("risk.accept", async () => {
      const service = await desktopService();
      return service.acceptDesktopRisk({
        projectPath,
        taskId,
        reason,
        ...(expiresAt ? { expiresAt } : {}),
      });
    });
  }
);

ipcMain.handle("agentguard:verifyRisk", async (event, projectPath, taskId) => {
  assertMainFrame(event);
  assertApprovedScope(projectPath);
  assertTaskId(taskId);
  return tracked("risk.verify", async () => {
    const service = await desktopService();
    return service.verifyDesktopRisk({
      projectPath,
      taskId,
      scopeKind: scopeKindFor(projectPath),
    });
  });
});

ipcMain.handle("agentguard:revokeRisk", async (event, projectPath, taskId) => {
  assertMainFrame(event);
  assertApprovedProject(projectPath);
  assertTaskId(taskId);
  return tracked("risk.revoke", async () => {
    const service = await desktopService();
    return service.revokeDesktopRisk({ projectPath, taskId });
  });
});

ipcMain.handle(
  "agentguard:trustProvider",
  async (event, projectPath, taskId, kind, reason) => {
    assertMainFrame(event);
    assertApprovedProject(projectPath);
    assertTaskId(taskId);
    if (kind !== "trusted" && kind !== "internal") {
      throw new Error("信任类型仅支持 trusted 或 internal。");
    }
    if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) {
      throw new Error("信任原因无效或超过 500 个字符。");
    }
    return tracked("provider.trust", async () => {
      const service = await desktopService();
      return service.trustDesktopProvider({ projectPath, taskId, kind, reason });
    });
  }
);

ipcMain.handle(
  "agentguard:removeProviderTrust",
  async (event, projectPath, endpoint, kind, reason) => {
    assertMainFrame(event);
    assertApprovedProject(projectPath);
    if (typeof endpoint !== "string" || endpoint.length > 253) {
      throw new Error("可信端点格式无效。");
    }
    if (kind !== "trusted" && kind !== "internal") {
      throw new Error("信任类型仅支持 trusted 或 internal。");
    }
    if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) {
      throw new Error("撤销原因无效或超过 500 个字符。");
    }
    return tracked("provider.untrust", async () => {
      const service = await desktopService();
      return service.removeDesktopProviderTrust({
        projectPath,
        endpoint,
        kind,
        reason,
      });
    });
  }
);

ipcMain.handle(
  "agentguard:ignoreRule",
  async (event, projectPath, taskId, ruleId, reason, expiresAt) => {
    assertMainFrame(event);
    assertApprovedProject(projectPath);
    assertTaskId(taskId);
    assertRuleId(ruleId);
    assertPolicyReason(reason);
    if (
      expiresAt !== undefined &&
      (typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt)))
    ) {
      throw new Error("到期日期格式无效。");
    }
    return tracked("rule.ignore", async () => {
      const service = await desktopService();
      return service.ignoreDesktopRule({
        projectPath,
        taskId,
        ruleId,
        reason,
        ...(expiresAt ? { expiresAt } : {}),
      });
    });
  }
);

ipcMain.handle(
  "agentguard:removeRuleIgnore",
  async (event, projectPath, ruleId, agent, reason) => {
    assertMainFrame(event);
    assertApprovedProject(projectPath);
    assertRuleId(ruleId);
    assertAgentId(agent);
    assertPolicyReason(reason);
    return tracked("rule.unignore", async () => {
      const service = await desktopService();
      return service.removeDesktopRuleIgnore({
        projectPath,
        ruleId,
        agent,
        reason,
      });
    });
  }
);

ipcMain.handle("agentguard:exportReport", async (event, projectPath, format) => {
  assertMainFrame(event);
  assertApprovedScope(projectPath);
  if (format !== "html" && format !== "json") {
    throw new Error("仅支持导出 HTML 或 JSON 报告。");
  }
  return tracked("report.export", async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: `导出 ${format.toUpperCase()} 报告`,
      defaultPath: reportDefaultPath(format),
      filters: [
        format === "html"
          ? { name: "HTML 报告", extensions: ["html"] }
          : { name: "JSON 报告", extensions: ["json"] },
      ],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const service = await desktopService();
    const report = await service.exportDesktopReport({
      projectPath,
      outputPath: result.filePath,
      format,
      scopeKind: scopeKindFor(projectPath),
    });
    generatedReports.add(report.path);
    return { canceled: false, report };
  });
});

ipcMain.handle("agentguard:openReport", async (event, reportPath) => {
  assertMainFrame(event);
  if (typeof reportPath !== "string" || !generatedReports.has(reportPath)) {
    throw new Error("只能打开本次会话中由 AgentGuard 导出的报告。");
  }
  return tracked("report.open", async () => {
    const error = await shell.openPath(reportPath);
    return { ok: error.length === 0, error };
  });
});

ipcMain.handle("agentguard:exportDiagnostics", async (event) => {
  assertMainFrame(event);
  return tracked("diagnostics.export", async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "导出脱敏诊断信息",
      defaultPath: diagnosticsDefaultPath(),
      filters: [{ name: "AgentGuard 诊断 JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const exported = diagnostics().exportTo(result.filePath, {
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
    });
    return { canceled: false, diagnostics: exported };
  });
});

app.whenReady().then(() => {
  diagnostics().record("app.ready", "success");
  createWindow();
  installApplicationMenu();
  nativeTheme.on("updated", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? "#181b1a" : "#f3f5f4");
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
