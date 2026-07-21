const { randomUUID } = require("node:crypto");
const {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { isAbsolute, join, resolve } = require("node:path");

const WINDOW_STATE_SCHEMA_VERSION = 1;
const DEFAULT_WINDOW_STATE = Object.freeze({ width: 1180, height: 800, maximized: false });

function finiteInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function sanitizeWindowState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  if (value.schemaVersion !== WINDOW_STATE_SCHEMA_VERSION) return undefined;
  if (!finiteInteger(value.width, 940, 10000)) return undefined;
  if (!finiteInteger(value.height, 660, 10000)) return undefined;
  if (typeof value.maximized !== "boolean") return undefined;
  const hasPosition = value.x !== undefined || value.y !== undefined;
  if (
    hasPosition &&
    (!finiteInteger(value.x, -100000, 100000) || !finiteInteger(value.y, -100000, 100000))
  ) {
    return undefined;
  }
  return {
    schemaVersion: WINDOW_STATE_SCHEMA_VERSION,
    width: value.width,
    height: value.height,
    ...(hasPosition ? { x: value.x, y: value.y } : {}),
    maximized: value.maximized,
  };
}

function statePath(userDataPath) {
  if (typeof userDataPath !== "string" || !isAbsolute(userDataPath)) {
    throw new Error("窗口状态目录必须是绝对路径。");
  }
  return join(resolve(userDataPath), "window-state.json");
}

function loadWindowState(userDataPath) {
  try {
    const path = statePath(userDataPath);
    if (!existsSync(path) || statSync(path).size > 4096) return undefined;
    return sanitizeWindowState(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return undefined;
  }
}

function saveWindowState(userDataPath, value) {
  let tempPath;
  let fd;
  try {
    const path = statePath(userDataPath);
    const normalized = sanitizeWindowState({
      ...value,
      schemaVersion: WINDOW_STATE_SCHEMA_VERSION,
    });
    if (!normalized) return false;
    mkdirSync(resolve(userDataPath), { recursive: true });
    tempPath = join(resolve(userDataPath), `.window-state-${process.pid}-${randomUUID()}.tmp`);
    fd = openSync(tempPath, "wx", 0o600);
    writeFileSync(fd, `${JSON.stringify(normalized)}\n`);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    chmodSync(tempPath, 0o600);
    renameSync(tempPath, path);
    chmodSync(path, 0o600);
    return true;
  } catch {
    if (fd !== undefined) closeSync(fd);
    if (tempPath) rmSync(tempPath, { force: true });
    return false;
  }
}

function intersects(area, bounds) {
  const width = Math.min(area.x + area.width, bounds.x + bounds.width) - Math.max(area.x, bounds.x);
  const height = Math.min(area.y + area.height, bounds.y + bounds.height) - Math.max(area.y, bounds.y);
  return width >= 120 && height >= 80;
}

function resolveWindowBounds(value, workAreas) {
  const state = sanitizeWindowState(value);
  if (!state) return { ...DEFAULT_WINDOW_STATE };
  const bounds = {
    width: state.width,
    height: state.height,
    ...(state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}),
    maximized: state.maximized,
  };
  const areas = Array.isArray(workAreas)
    ? workAreas.filter(
      (area) =>
        area &&
        finiteInteger(area.x, -100000, 100000) &&
        finiteInteger(area.y, -100000, 100000) &&
        finiteInteger(area.width, 1, 10000) &&
        finiteInteger(area.height, 1, 10000)
    )
    : [];
  const matchingArea = state.x !== undefined && state.y !== undefined
    ? areas.find((area) => intersects(area, bounds))
    : undefined;
  const sizingArea = matchingArea || areas[0];
  const width = sizingArea ? Math.min(state.width, Math.max(940, sizingArea.width)) : state.width;
  const height = sizingArea ? Math.min(state.height, Math.max(660, sizingArea.height)) : state.height;
  if (!matchingArea || state.x === undefined || state.y === undefined) {
    return { width, height, maximized: state.maximized };
  }
  return {
    width,
    height,
    x: Math.min(Math.max(state.x, matchingArea.x), matchingArea.x + matchingArea.width - width),
    y: Math.min(Math.max(state.y, matchingArea.y), matchingArea.y + matchingArea.height - height),
    maximized: state.maximized,
  };
}

module.exports = {
  DEFAULT_WINDOW_STATE,
  WINDOW_STATE_SCHEMA_VERSION,
  loadWindowState,
  resolveWindowBounds,
  sanitizeWindowState,
  saveWindowState,
};
