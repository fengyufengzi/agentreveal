import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const { MENU_COMMANDS } = require("../desktop/application-menu.cjs");
const preloadSource = readFileSync(
  new URL("../desktop/preload.cjs", import.meta.url),
  "utf8"
);

test("desktop preload: sandboxed runtime exposes the complete typed bridge", () => {
  let exposed;
  const listeners = new Map();
  const invocations = [];
  const sends = [];
  const electron = {
    contextBridge: {
      exposeInMainWorld: (name, bridge) => {
        exposed = { name, bridge };
      },
    },
    ipcRenderer: {
      invoke: (...args) => {
        invocations.push(args);
        return Promise.resolve({});
      },
      on: (channel, listener) => listeners.set(channel, listener),
      send: (...args) => sends.push(args),
    },
  };

  runInNewContext(preloadSource, {
    require: (specifier) => {
      if (specifier === "electron") return electron;
      throw new Error(`sandboxed preload cannot require ${specifier}`);
    },
  });

  assert.equal(exposed.name, "agentreveal");
  assert.equal(typeof exposed.bridge.selectProject, "function");
  assert.equal(typeof exposed.bridge.backupClaudeRemediation, "function");
  assert.equal(typeof exposed.bridge.applyClaudeMigration, "function");
  assert.equal(typeof exposed.bridge.cleanupClaudeCredentialBackup, "function");
  assert.equal(typeof exposed.bridge.updateMenuState, "function");
  exposed.bridge.selectProject();
  assert.deepEqual(invocations.at(-1), ["agentreveal:selectProject"]);
  exposed.bridge.updateMenuState({ hasOverview: false, hasReport: false, working: false });
  assert.deepEqual(sends.at(-1), [
    "agentreveal:menuState",
    { hasOverview: false, hasReport: false, working: false },
  ]);

  const commands = [];
  exposed.bridge.onMenuCommand((command) => commands.push(command));
  const menuListener = listeners.get("agentreveal:menuCommand");
  for (const command of MENU_COMMANDS) menuListener({}, command);
  menuListener({}, "arbitrary-command");
  assert.deepEqual(commands, [...MENU_COMMANDS]);
});
