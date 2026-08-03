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

contextBridge.exposeInMainWorld("agentguard", {
  scanMachine: () => ipcRenderer.invoke("agentguard:scanMachine"),
  selectProject: () => ipcRenderer.invoke("agentguard:selectProject"),
  scanProject: (projectPath) =>
    ipcRenderer.invoke("agentguard:scanProject", projectPath),
  previewPostureBaseline: (projectPath) =>
    ipcRenderer.invoke("agentguard:previewPostureBaseline", projectPath),
  savePostureBaseline: (
    projectPath,
    expectedCurrentFingerprint,
    expectedStorageRevision,
    replace
  ) =>
    ipcRenderer.invoke(
      "agentguard:savePostureBaseline",
      projectPath,
      expectedCurrentFingerprint,
      expectedStorageRevision,
      replace
    ),
  removePostureBaseline: (projectPath, expectedStorageRevision) =>
    ipcRenderer.invoke(
      "agentguard:removePostureBaseline",
      projectPath,
      expectedStorageRevision
    ),
  verifyPosture: (projectPath) =>
    ipcRenderer.invoke("agentguard:verifyPosture", projectPath),
  previewBaseline: (projectPath, profile) =>
    ipcRenderer.invoke("agentguard:previewBaseline", projectPath, profile),
  applyBaseline: (projectPath, profile, expectedPlanFingerprint) =>
    ipcRenderer.invoke(
      "agentguard:applyBaseline",
      projectPath,
      profile,
      expectedPlanFingerprint
    ),
  restoreBaseline: (projectPath, backupId) =>
    ipcRenderer.invoke(
      "agentguard:restoreBaseline",
      projectPath,
      backupId
    ),
  backupClaudeRemediation: (projectPath, taskId) =>
    ipcRenderer.invoke(
      "agentguard:backupClaudeRemediation",
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
      "agentguard:applyClaudeMigration",
      projectPath,
      taskId,
      backupId,
      expectedFingerprint
    ),
  restoreClaudeRemediation: (projectPath, backupId) =>
    ipcRenderer.invoke(
      "agentguard:restoreClaudeRemediation",
      projectPath,
      backupId
    ),
  cleanupClaudeCredentialBackup: (projectPath, taskId, backupId) =>
    ipcRenderer.invoke(
      "agentguard:cleanupClaudeCredentialBackup",
      projectPath,
      taskId,
      backupId
    ),
  acceptRisk: (projectPath, taskId, reason, expiresAt) =>
    ipcRenderer.invoke(
      "agentguard:acceptRisk",
      projectPath,
      taskId,
      reason,
      expiresAt
    ),
  verifyRisk: (projectPath, taskId) =>
    ipcRenderer.invoke("agentguard:verifyRisk", projectPath, taskId),
  revokeRisk: (projectPath, taskId) =>
    ipcRenderer.invoke("agentguard:revokeRisk", projectPath, taskId),
  trustProvider: (projectPath, taskId, kind, reason) =>
    ipcRenderer.invoke(
      "agentguard:trustProvider",
      projectPath,
      taskId,
      kind,
      reason
    ),
  removeProviderTrust: (projectPath, endpoint, kind, reason) =>
    ipcRenderer.invoke(
      "agentguard:removeProviderTrust",
      projectPath,
      endpoint,
      kind,
      reason
    ),
  ignoreRule: (projectPath, taskId, ruleId, reason, expiresAt) =>
    ipcRenderer.invoke(
      "agentguard:ignoreRule",
      projectPath,
      taskId,
      ruleId,
      reason,
      expiresAt
    ),
  removeRuleIgnore: (projectPath, ruleId, agent, reason) =>
    ipcRenderer.invoke(
      "agentguard:removeRuleIgnore",
      projectPath,
      ruleId,
      agent,
      reason
    ),
  exportReport: (projectPath, format) =>
    ipcRenderer.invoke("agentguard:exportReport", projectPath, format),
  exportDiagnostics: () =>
    ipcRenderer.invoke("agentguard:exportDiagnostics"),
  openReport: (reportPath) =>
    ipcRenderer.invoke("agentguard:openReport", reportPath),
  updateMenuState: (state) =>
    ipcRenderer.send("agentguard:menuState", state),
  onMenuCommand: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("agentguard:menuCommand", (_event, command) => {
      if (MENU_COMMANDS.has(command)) callback(command);
    });
  },
});
