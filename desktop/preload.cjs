const { contextBridge, ipcRenderer } = require("electron");

// Sandboxed preloads only receive Electron's limited require implementation;
// requiring a local module here prevents the entire contextBridge from loading.
const MENU_COMMANDS = new Set([
  "scan-current",
  "scan-machine",
  "select-project",
  "export-html",
  "export-json",
  "open-report",
  "show-developer-data",
  "export-diagnostics",
]);

contextBridge.exposeInMainWorld("agentreveal", {
  scanMachine: () => ipcRenderer.invoke("agentreveal:scanMachine"),
  selectProject: () => ipcRenderer.invoke("agentreveal:selectProject"),
  scanProject: (projectPath) =>
    ipcRenderer.invoke("agentreveal:scanProject", projectPath),
  previewPostureBaseline: (projectPath) =>
    ipcRenderer.invoke("agentreveal:previewPostureBaseline", projectPath),
  savePostureBaseline: (
    projectPath,
    expectedCurrentFingerprint,
    expectedStorageRevision,
    replace
  ) =>
    ipcRenderer.invoke(
      "agentreveal:savePostureBaseline",
      projectPath,
      expectedCurrentFingerprint,
      expectedStorageRevision,
      replace
    ),
  removePostureBaseline: (projectPath, expectedStorageRevision) =>
    ipcRenderer.invoke(
      "agentreveal:removePostureBaseline",
      projectPath,
      expectedStorageRevision
    ),
  verifyPosture: (projectPath) =>
    ipcRenderer.invoke("agentreveal:verifyPosture", projectPath),
  previewBaseline: (projectPath, profile) =>
    ipcRenderer.invoke("agentreveal:previewBaseline", projectPath, profile),
  applyBaseline: (projectPath, profile, expectedPlanFingerprint) =>
    ipcRenderer.invoke(
      "agentreveal:applyBaseline",
      projectPath,
      profile,
      expectedPlanFingerprint
    ),
  restoreBaseline: (projectPath, backupId) =>
    ipcRenderer.invoke(
      "agentreveal:restoreBaseline",
      projectPath,
      backupId
    ),
  backupClaudeRemediation: (projectPath, taskId) =>
    ipcRenderer.invoke(
      "agentreveal:backupClaudeRemediation",
      projectPath,
      taskId
    ),
  applyClaudeMigration: (
    projectPath,
    taskId,
    backupId,
    expectedFingerprint
  ) =>
    ipcRenderer.invoke(
      "agentreveal:applyClaudeMigration",
      projectPath,
      taskId,
      backupId,
      expectedFingerprint
    ),
  restoreClaudeRemediation: (projectPath, backupId) =>
    ipcRenderer.invoke(
      "agentreveal:restoreClaudeRemediation",
      projectPath,
      backupId
    ),
  cleanupClaudeCredentialBackup: (projectPath, taskId, backupId) =>
    ipcRenderer.invoke(
      "agentreveal:cleanupClaudeCredentialBackup",
      projectPath,
      taskId,
      backupId
    ),
  acceptRisk: (projectPath, taskId, reason, expiresAt) =>
    ipcRenderer.invoke(
      "agentreveal:acceptRisk",
      projectPath,
      taskId,
      reason,
      expiresAt
    ),
  verifyRisk: (projectPath, taskId) =>
    ipcRenderer.invoke("agentreveal:verifyRisk", projectPath, taskId),
  revokeRisk: (projectPath, taskId) =>
    ipcRenderer.invoke("agentreveal:revokeRisk", projectPath, taskId),
  trustProvider: (projectPath, taskId, kind, reason) =>
    ipcRenderer.invoke(
      "agentreveal:trustProvider",
      projectPath,
      taskId,
      kind,
      reason
    ),
  removeProviderTrust: (projectPath, endpoint, kind, reason) =>
    ipcRenderer.invoke(
      "agentreveal:removeProviderTrust",
      projectPath,
      endpoint,
      kind,
      reason
    ),
  ignoreRule: (projectPath, taskId, ruleId, reason, expiresAt) =>
    ipcRenderer.invoke(
      "agentreveal:ignoreRule",
      projectPath,
      taskId,
      ruleId,
      reason,
      expiresAt
    ),
  removeRuleIgnore: (projectPath, ruleId, agent, reason) =>
    ipcRenderer.invoke(
      "agentreveal:removeRuleIgnore",
      projectPath,
      ruleId,
      agent,
      reason
    ),
  exportReport: (projectPath, format) =>
    ipcRenderer.invoke("agentreveal:exportReport", projectPath, format),
  exportDiagnostics: () =>
    ipcRenderer.invoke("agentreveal:exportDiagnostics"),
  openReport: (reportPath) =>
    ipcRenderer.invoke("agentreveal:openReport", reportPath),
  updateMenuState: (state) =>
    ipcRenderer.send("agentreveal:menuState", state),
  onMenuCommand: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("agentreveal:menuCommand", (_event, command) => {
      if (MENU_COMMANDS.has(command)) callback(command);
    });
  },
});
