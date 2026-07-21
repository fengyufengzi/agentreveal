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

const MENU_STATE_KEYS = ["hasOverview", "hasReport", "working"];

function normalizeMenuState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  if (Object.keys(value).some((key) => !MENU_STATE_KEYS.includes(key))) return undefined;
  if (MENU_STATE_KEYS.some((key) => typeof value[key] !== "boolean")) return undefined;
  return {
    hasOverview: value.hasOverview,
    hasReport: value.hasReport,
    working: value.working,
  };
}

function createApplicationMenuTemplate({ isMac = process.platform === "darwin", sendCommand }) {
  if (typeof sendCommand !== "function") {
    throw new Error("应用菜单必须提供固定命令发送函数。");
  }
  const command = (name) => {
    if (!MENU_COMMANDS.has(name)) throw new Error("未知应用菜单命令。");
    return () => sendCommand(name);
  };
  return [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "文件",
      submenu: [
        {
          id: "select-project",
          label: "选择项目并检查…",
          accelerator: "CmdOrCtrl+O",
          click: command("select-project"),
        },
        { type: "separator" },
        {
          id: "export-html",
          label: "导出行动报告…",
          accelerator: "CmdOrCtrl+Shift+E",
          enabled: false,
          click: command("export-html"),
        },
        {
          id: "export-json",
          label: "导出 JSON…",
          enabled: false,
          click: command("export-json"),
        },
        {
          id: "open-report",
          label: "打开最近报告",
          enabled: false,
          click: command("open-report"),
        },
        ...(isMac ? [] : [{ type: "separator" }, { role: "quit" }]),
      ],
    },
    {
      label: "检查",
      submenu: [
        {
          id: "scan-current",
          label: "检查当前范围",
          accelerator: "CmdOrCtrl+R",
          click: command("scan-current"),
        },
        {
          id: "scan-machine",
          label: "只检查这台 Mac",
          accelerator: "CmdOrCtrl+Shift+R",
          click: command("scan-machine"),
        },
      ],
    },
    {
      label: "显示",
      submenu: [
        {
          id: "show-developer-data",
          label: "显示开发者数据",
          enabled: false,
          click: command("show-developer-data"),
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          id: "export-diagnostics",
          label: "导出脱敏诊断…",
          click: command("export-diagnostics"),
        },
      ],
    },
  ];
}

function applyApplicationMenuState(menu, value) {
  const state = normalizeMenuState(value);
  if (!menu || !state) return false;
  const setEnabled = (id, enabled) => {
    const item = menu.getMenuItemById(id);
    if (item) item.enabled = enabled;
  };
  setEnabled("scan-current", !state.working);
  setEnabled("scan-machine", !state.working);
  setEnabled("select-project", !state.working);
  setEnabled("export-html", state.hasOverview && !state.working);
  setEnabled("export-json", state.hasOverview && !state.working);
  setEnabled("open-report", state.hasReport && !state.working);
  setEnabled("show-developer-data", state.hasOverview && !state.working);
  setEnabled("export-diagnostics", !state.working);
  return true;
}

module.exports = {
  MENU_COMMANDS,
  applyApplicationMenuState,
  createApplicationMenuTemplate,
  normalizeMenuState,
};
