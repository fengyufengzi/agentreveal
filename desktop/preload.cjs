const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentguard", {
  run: (commandName) => ipcRenderer.invoke("agentguard:run", commandName),
  openReport: () => ipcRenderer.invoke("agentguard:openReport"),
});
