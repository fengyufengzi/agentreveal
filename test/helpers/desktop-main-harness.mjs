import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const mainPath = join(repoRoot, "desktop", "main.cjs");
const realRequire = createRequire(mainPath);

export function mainFrameEvent() {
  const mainFrame = {};
  return { senderFrame: mainFrame, sender: { mainFrame } };
}

export function childFrameEvent() {
  return { senderFrame: {}, sender: { mainFrame: {} } };
}

export function loadDesktopMainHarness({
  openDialogResult = { canceled: false, filePaths: ["/tmp/agentguard-approved-project"] },
  saveDialogResult = { canceled: true },
  messageBoxResult = { response: 0 },
  appPaths = {},
} = {}) {
  const handlers = new Map();
  const eventHandlers = new Map();
  const shellCalls = [];
  const diagnosticsEvents = [];
  const diagnostics = {
    record(operation, outcome) {
      diagnosticsEvents.push({ operation, outcome });
      return true;
    },
    async track(operation, task) {
      diagnosticsEvents.push({ operation, outcome: "started" });
      try {
        const result = await task();
        diagnosticsEvents.push({
          operation,
          outcome: result?.canceled ? "canceled" : result?.ok === false ? "failure" : "success",
        });
        return result;
      } catch (error) {
        diagnosticsEvents.push({ operation, outcome: "failure" });
        throw error;
      }
    },
    exportTo() {
      return { path: "/tmp/agentguard-diagnostics.json", eventCount: 0 };
    },
  };
  const electron = {
    app: {
      getAppPath: () => repoRoot,
      getPath: (name) => appPaths[name] || `/tmp/agentguard-${name}`,
      getVersion: () => "0.0.0-test",
      whenReady: () => ({ then: () => undefined }),
      on: () => undefined,
      quit: () => undefined,
    },
    BrowserWindow: class {},
    dialog: {
      showOpenDialog: async () => openDialogResult,
      showSaveDialog: async () => saveDialogResult,
      showMessageBox: async (...args) =>
        typeof messageBoxResult === "function"
          ? messageBoxResult(...args)
          : messageBoxResult,
    },
    ipcMain: {
      handle(channel, handler) {
        if (handlers.has(channel)) throw new Error(`duplicate IPC handler: ${channel}`);
        handlers.set(channel, handler);
      },
      on(channel, handler) {
        if (eventHandlers.has(channel)) throw new Error(`duplicate IPC event: ${channel}`);
        eventHandlers.set(channel, handler);
      },
    },
    shell: {
      async openPath(path) {
        shellCalls.push(path);
        return "";
      },
    },
  };
  const module = { exports: {} };
  const sandbox = {
    Buffer,
    URL,
    __dirname: dirname(mainPath),
    __filename: mainPath,
    console,
    exports: module.exports,
    module,
    process,
    require(specifier) {
      if (specifier === "electron") return electron;
      if (specifier === "./diagnostics.cjs") {
        return { createDiagnostics: () => diagnostics };
      }
      return realRequire(specifier);
    },
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(readFileSync(mainPath, "utf8"), sandbox, {
    filename: mainPath,
    importModuleDynamically:
      vm.constants?.USE_MAIN_CONTEXT_DEFAULT_LOADER ??
      ((specifier) => import(specifier)),
  });
  return {
    handlers,
    eventHandlers,
    shellCalls,
    diagnosticsEvents,
    mainExports: module.exports,
  };
}
