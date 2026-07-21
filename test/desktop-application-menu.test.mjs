import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  MENU_COMMANDS,
  applyApplicationMenuState,
  createApplicationMenuTemplate,
  normalizeMenuState,
} = require("../desktop/application-menu.cjs");

function menuItems(template) {
  return template.flatMap((item) => [item, ...(Array.isArray(item.submenu) ? menuItems(item.submenu) : [])]);
}

test("desktop application menu: 所有点击项只发送固定白名单命令", () => {
  const commands = [];
  const template = createApplicationMenuTemplate({
    isMac: true,
    sendCommand: (command) => commands.push(command),
  });
  const items = menuItems(template);
  const commandItems = items.filter((item) => typeof item.click === "function");
  for (const item of commandItems) item.click();
  assert.deepEqual(new Set(commands), MENU_COMMANDS);
  assert.equal(items.find((item) => item.id === "scan-current").accelerator, "CmdOrCtrl+R");
  assert.equal(items.find((item) => item.id === "scan-machine").accelerator, "CmdOrCtrl+Shift+R");
  assert.equal(items.find((item) => item.id === "select-project").accelerator, "CmdOrCtrl+O");
  assert.equal(items.find((item) => item.id === "export-html").accelerator, "CmdOrCtrl+Shift+E");
});

test("desktop application menu: 菜单状态只接受三个布尔字段并控制可用性", () => {
  assert.equal(normalizeMenuState({ hasOverview: true, hasReport: false, working: false }).hasOverview, true);
  assert.equal(normalizeMenuState({ hasOverview: true, hasReport: false, working: false, path: "/tmp/x" }), undefined);
  assert.equal(normalizeMenuState({ hasOverview: "yes", hasReport: false, working: false }), undefined);

  const items = new Map([
    "scan-current",
    "scan-machine",
    "select-project",
    "export-html",
    "export-json",
    "open-report",
    "show-developer-data",
    "export-diagnostics",
  ].map((id) => [id, { id, enabled: false }]));
  const menu = { getMenuItemById: (id) => items.get(id) };
  assert.equal(
    applyApplicationMenuState(menu, { hasOverview: true, hasReport: true, working: false }),
    true
  );
  assert.equal(items.get("export-html").enabled, true);
  assert.equal(items.get("open-report").enabled, true);
  assert.equal(items.get("scan-current").enabled, true);
  applyApplicationMenuState(menu, { hasOverview: true, hasReport: true, working: true });
  assert.ok([...items.values()].every((item) => item.enabled === false));
});
