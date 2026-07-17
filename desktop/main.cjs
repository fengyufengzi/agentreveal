const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "agentguard");
const nodeBin = process.env.AGENTGUARD_NODE || process.execPath;

const COMMANDS = {
  doctor: ["doctor", "--json"],
  scan: ["scan", "--json"],
  map: ["map", "--json"],
  provider: ["provider", "scan", "--json"],
  baselineBalanced: ["baseline", "--profile", "balanced", "--dry-run", "--json"],
  baselineSafe: ["baseline", "--profile", "safe", "--dry-run", "--json"],
  reportHtml: ["report", "--format", "html"],
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 920,
    minHeight: 640,
    title: "AgentGuard",
    backgroundColor: "#101418",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));
}

function runCli(commandName) {
  const args = COMMANDS[commandName];
  if (!args) {
    return Promise.reject(new Error(`Unknown command: ${commandName}`));
  }

  return new Promise((resolve) => {
    const child = spawn(nodeBin, [cliPath, ...args], {
      cwd: repoRoot,
      env: process.env.AGENTGUARD_NODE
        ? process.env
        : { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      resolve({ ok: false, code: -1, stdout, stderr: err.message });
    });
    child.on("close", (code) => {
      // scan/provider/report return 2 when high risk exists; this is expected.
      const ok = code === 0 || code === 2;
      resolve({ ok, code, stdout, stderr });
    });
  });
}

ipcMain.handle("agentguard:run", async (_event, commandName) => runCli(commandName));

ipcMain.handle("agentguard:openReport", async () => {
  await shell.openPath(path.join(repoRoot, "agentguard-report.html"));
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
