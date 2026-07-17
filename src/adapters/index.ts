/** Adapter 注册表：新增 Agent 支持只需在此登记一个 adapter。 */
import type { Adapter } from "./types.js";
import { claudeCodeAdapter } from "./claude-code/index.js";
import { codexAdapter } from "./codex/index.js";
import { ccSwitchAdapter } from "./cc-switch/index.js";
import { opencodeAdapter } from "./opencode/index.js";
import { geminiAdapter } from "./gemini/index.js";
import { openclawAdapter } from "./openclaw/index.js";

/** P0 adapter（对应 PRD §4.1）。Gemini / OpenClaw P1 后续加入。 */
export const adapters: Adapter[] = [
  claudeCodeAdapter,
  codexAdapter,
  ccSwitchAdapter,
  opencodeAdapter,
  geminiAdapter,
  openclawAdapter,
];