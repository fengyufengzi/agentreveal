#!/usr/bin/env node
/**
 * 高价值规则质量核验。
 *
 * 每个合成场景都声明完整预期 ruleId 与行动任务数；脚本运行真实 parser、
 * detector 和 core 聚合逻辑，统计命中、漏报、意外告警与重复任务。
 * 低频不等于低价值，因此本脚本不再按跨场景出现频率生成删除候选。
 *
 * 用法：
 *   node scripts/rule-hit-rate.mjs
 *   node scripts/rule-hit-rate.mjs --out docs/rule-hit-rate.md
 *
 * 当前只允许合成场景；--live 会被明确拒绝。
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildClaudeDir } from "../test/fixtures/build-claude.mjs";
import { buildCodexDir } from "../test/fixtures/build-codex.mjs";
import { buildCcSwitchDb } from "../test/fixtures/build-db.mjs";
import { buildGeminiDir } from "../test/fixtures/build-gemini.mjs";
import { buildOpenCodeConfig } from "../test/fixtures/build-opencode.mjs";
import { buildOpenClawDir } from "../test/fixtures/build-openclaw.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const DISPLAY_NAMES = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "cc-switch": "CC Switch",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
  workspace: "当前项目",
  "cross-agent": "跨 Agent",
};

const FIXTURE_CREDENTIAL = "fixture-credential-value-not-for-use";
const FIXTURE_SHARED_CREDENTIAL = "fixture-shared-credential-not-for-use";

async function loadRuntime() {
  const [
    claudeParse,
    claudeRisk,
    codexParse,
    codexRisk,
    ccParse,
    ccRisk,
    ocParse,
    ocRisk,
    geminiIndex,
    openclawIndex,
    correlateCore,
    sensitiveCore,
    action,
  ] =
    await Promise.all([
      import("../dist/adapters/claude-code/parse.js"),
      import("../dist/adapters/claude-code/risk.js"),
      import("../dist/adapters/codex/parse.js"),
      import("../dist/adapters/codex/risk.js"),
      import("../dist/adapters/cc-switch/parse.js"),
      import("../dist/adapters/cc-switch/risk.js"),
      import("../dist/adapters/opencode/parse.js"),
      import("../dist/adapters/opencode/risk.js"),
      import("../dist/adapters/gemini/index.js"),
      import("../dist/adapters/openclaw/index.js"),
      import("../dist/core/correlate/index.js"),
      import("../dist/core/sensitive/index.js"),
      import("../dist/core/action/index.js"),
    ]);
  return {
    parseClaudeCode: claudeParse.parseClaudeCode,
    buildClaudeCodeFindings: claudeRisk.buildClaudeCodeFindings,
    parseCodex: codexParse.parseCodex,
    buildCodexFindings: codexRisk.buildCodexFindings,
    parseCcSwitchDb: ccParse.parseCcSwitchDb,
    buildCcSwitchFindings: ccRisk.buildCcSwitchFindings,
    parseOpenCode: ocParse.parseOpenCode,
    buildOpenCodeFindings: ocRisk.buildOpenCodeFindings,
    geminiAdapter: geminiIndex.geminiAdapter,
    openclawAdapter: openclawIndex.openclawAdapter,
    correlate: correlateCore.correlate,
    scanSensitiveFiles: sensitiveCore.scanSensitiveFiles,
    buildActionPlan: action.buildActionPlan,
    buildActionTasks: action.buildActionTasks,
  };
}

function withFixture(factory, inspect) {
  const fixture = factory();
  try {
    return inspect(fixture);
  } finally {
    fixture.cleanup();
  }
}

function claude(runtime, options, providerPolicy = {}) {
  return withFixture(
    () => buildClaudeDir(options),
    ({ configDir, home }) =>
      runtime.buildClaudeCodeFindings(
        runtime.parseClaudeCode(configDir, home),
        providerPolicy
      )
  );
}

function codex(runtime, options, providerPolicy = {}) {
  return withFixture(
    () => buildCodexDir(options),
    ({ configPath, baseDir }) =>
      runtime.buildCodexFindings(
        runtime.parseCodex(configPath, baseDir),
        providerPolicy
      )
  );
}

function ccSwitch(runtime, options, providerPolicy = {}) {
  return withFixture(
    () => buildCcSwitchDb(options),
    ({ dbPath }) =>
      runtime.buildCcSwitchFindings(runtime.parseCcSwitchDb(dbPath), providerPolicy)
  );
}

function opencode(runtime, config, providerPolicy = {}) {
  return withFixture(
    () => buildOpenCodeConfig(config),
    ({ configPath }) =>
      runtime.buildOpenCodeFindings(runtime.parseOpenCode(configPath), providerPolicy)
  );
}

async function gemini(runtime, options) {
  const fixture = buildGeminiDir(options);
  try {
    const ctx = { home: fixture.home, cwd: fixture.home, env: {} };
    const found = await runtime.geminiAdapter.discover(ctx);
    return await runtime.geminiAdapter.deepScan(ctx, found);
  } finally {
    fixture.cleanup();
  }
}

async function openclaw(runtime, options) {
  const fixture = buildOpenClawDir(options);
  try {
    const ctx = { home: fixture.home, cwd: fixture.home, env: {} };
    const found = await runtime.openclawAdapter.discover(ctx);
    return await runtime.openclawAdapter.deepScan(ctx, found);
  } finally {
    fixture.cleanup();
  }
}

function workspace(runtime, fileNames, maxFindings = 50) {
  const project = mkdtempSync(resolve(tmpdir(), "agentreveal-rule-project-"));
  try {
    for (const fileName of fileNames) {
      writeFileSync(resolve(project, fileName), "synthetic fixture; content is never scanned\n");
    }
    return runtime.scanSensitiveFiles(project, { maxFindings });
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}

function syntheticResult(agent, displayName, findings) {
  return {
    agent,
    displayName,
    discovery: { agent, displayName, configFound: true },
    findings,
  };
}

function correlation(runtime, results) {
  return { results: [], correlations: runtime.correlate(results) };
}

/** 第一批只覆盖会进入 Top 3 的凭证、Provider 与执行权限规则。 */
export const SCENARIOS = [
  {
    name: "claude-official-clean",
    agent: "claude-code",
    desc: "Claude Code 官方 HTTPS 端点，无风险",
    expectedRuleIds: [],
    expectedTaskCount: 0,
    run: (runtime) => claude(runtime, {
      settings: { env: { ANTHROPIC_BASE_URL: "https://api.anthropic.com" } },
    }),
  },
  {
    name: "claude-unknown-https",
    agent: "claude-code",
    desc: "Claude Code 使用未知 HTTPS Provider",
    expectedRuleIds: ["CLAUDE_UNKNOWN_BASE_URL"],
    expectedTaskCount: 1,
    run: (runtime) => claude(runtime, {
      settings: { env: { ANTHROPIC_BASE_URL: "https://relay.example.com/v1" } },
    }),
  },
  {
    name: "claude-unknown-http",
    agent: "claude-code",
    desc: "Claude Code 的同一未知端点同时使用明文 HTTP",
    expectedRuleIds: ["CLAUDE_UNKNOWN_BASE_URL", "CLAUDE_INSECURE_HTTP"],
    expectedTaskCount: 1,
    run: (runtime) => claude(runtime, {
      settings: { env: { ANTHROPIC_BASE_URL: "http://relay.example.com/v1" } },
    }),
  },
  {
    name: "claude-plaintext-token",
    agent: "claude-code",
    desc: "Claude Code settings 中存在明文凭证",
    expectedRuleIds: ["CLAUDE_PLAINTEXT_TOKEN"],
    expectedTaskCount: 1,
    run: (runtime) => claude(runtime, {
      settingsLocal: { env: { ANTHROPIC_API_KEY: FIXTURE_CREDENTIAL } },
    }),
  },
  {
    name: "claude-bypass-permissions",
    agent: "claude-code",
    desc: "Claude Code 跳过全部工具审批",
    expectedRuleIds: ["CLAUDE_BYPASS_PERMISSIONS"],
    expectedTaskCount: 1,
    run: (runtime) => claude(runtime, {
      settings: { permissions: { defaultMode: "bypassPermissions" } },
    }),
  },
  {
    name: "claude-proxy-placeholder",
    agent: "claude-code",
    desc: "CC Switch 占位符不误报为明文凭证",
    expectedRuleIds: ["CLAUDE_LOCAL_BASE_URL"],
    expectedTaskCount: 1,
    run: (runtime) => claude(runtime, {
      settings: {
        env: {
          ANTHROPIC_AUTH_TOKEN: "PROXY_MANAGED",
          ANTHROPIC_BASE_URL: "http://127.0.0.1:15721",
        },
      },
    }),
  },
  {
    name: "codex-official-clean",
    agent: "codex",
    desc: "Codex 官方 HTTPS 端点，无风险",
    expectedRuleIds: [],
    expectedTaskCount: 0,
    run: (runtime) => codex(runtime, {
      toml: '[model_providers.openai]\nbase_url = "https://api.openai.com/v1"\n',
    }),
  },
  {
    name: "codex-custom-https",
    agent: "codex",
    desc: "Codex 使用未知 HTTPS Provider",
    expectedRuleIds: ["CODEX_CUSTOM_PROVIDER"],
    expectedTaskCount: 1,
    run: (runtime) => codex(runtime, {
      toml: 'model_provider = "relay"\n[model_providers.relay]\nbase_url = "https://relay.example.com/v1"\n',
    }),
  },
  {
    name: "codex-custom-http",
    agent: "codex",
    desc: "Codex 的同一自定义 Provider 同时使用明文 HTTP",
    expectedRuleIds: ["CODEX_CUSTOM_PROVIDER", "CODEX_INSECURE_HTTP"],
    expectedTaskCount: 1,
    run: (runtime) => codex(runtime, {
      toml: 'model_provider = "relay"\n[model_providers.relay]\nbase_url = "http://relay.example.com/v1"\n',
    }),
  },
  {
    name: "codex-plaintext-api-key",
    agent: "codex",
    desc: "Codex auth.json 中存在明文 API Key",
    expectedRuleIds: ["CODEX_PLAINTEXT_API_KEY"],
    expectedTaskCount: 1,
    run: (runtime) => codex(runtime, {
      toml: "",
      auth: { auth_mode: "apikey", OPENAI_API_KEY: FIXTURE_CREDENTIAL },
    }),
  },
  {
    name: "opencode-reference-clean",
    agent: "opencode",
    desc: "OpenCode 使用环境变量引用，不误报明文凭证",
    expectedRuleIds: [],
    expectedTaskCount: 0,
    run: (runtime) => opencode(runtime, {
      provider: { openai: { options: { apiKey: "{env:OPENAI_API_KEY}" } } },
    }),
  },
  {
    name: "opencode-custom-http",
    agent: "opencode",
    desc: "OpenCode 的同一自定义 Provider 同时使用明文 HTTP",
    expectedRuleIds: ["OPENCODE_CUSTOM_PROVIDER", "OPENCODE_INSECURE_HTTP"],
    expectedTaskCount: 1,
    run: (runtime) => opencode(runtime, {
      provider: { relay: { options: { baseURL: "http://relay.example.com/v1" } } },
    }),
  },
  {
    name: "opencode-plaintext-key",
    agent: "opencode",
    desc: "OpenCode 配置中存在明文 API Key",
    expectedRuleIds: ["OPENCODE_PLAINTEXT_KEY"],
    expectedTaskCount: 1,
    run: (runtime) => opencode(runtime, {
      provider: { relay: { options: { apiKey: FIXTURE_CREDENTIAL } } },
    }),
  },
  {
    name: "opencode-broad-permissions",
    agent: "opencode",
    desc: "OpenCode Bash 与整体放行属于同一执行权限根因",
    expectedRuleIds: ["OPENCODE_BASH_UNRESTRICTED", "OPENCODE_PERMISSION_WILDCARD"],
    expectedTaskCount: 1,
    run: (runtime) => opencode(runtime, {
      permission: { bash: "allow", edit: "allow" },
    }),
  },
  {
    name: "ccswitch-official-clean",
    agent: "cc-switch",
    desc: "CC Switch 当前 Provider 为官方 HTTPS 端点",
    expectedRuleIds: [],
    expectedTaskCount: 0,
    run: (runtime) => ccSwitch(runtime, {
      providers: [{
        app_type: "claude",
        name: "Official",
        is_current: true,
        settings_config: { env: { ANTHROPIC_BASE_URL: "https://api.anthropic.com" } },
      }],
    }),
  },
  {
    name: "ccswitch-relay-http",
    agent: "cc-switch",
    desc: "CC Switch 的同一中转端点同时使用明文 HTTP",
    expectedRuleIds: ["CCSWITCH_RELAY_ENDPOINT", "CCSWITCH_INSECURE_HTTP"],
    expectedTaskCount: 1,
    run: (runtime) => ccSwitch(runtime, {
      providers: [{
        app_type: "codex",
        name: "Relay",
        is_current: true,
        settings_config: { config: 'base_url = "http://203.0.113.10:8080"' },
      }],
    }),
  },
  {
    name: "ccswitch-plaintext-shared-key",
    agent: "cc-switch",
    desc: "CC Switch 同时存在明文凭证与跨用途复用",
    expectedRuleIds: ["CCSWITCH_PLAINTEXT_KEY", "CCSWITCH_SHARED_KEY"],
    expectedTaskCount: 2,
    run: (runtime) => ccSwitch(runtime, {
      providers: [
        {
          app_type: "claude",
          name: "Provider A",
          settings_config: { env: { ANTHROPIC_AUTH_TOKEN: FIXTURE_SHARED_CREDENTIAL } },
        },
        {
          app_type: "codex",
          name: "Provider B",
          settings_config: { auth: { OPENAI_API_KEY: FIXTURE_SHARED_CREDENTIAL } },
        },
      ],
    }),
  },
  {
    name: "claude-mcp-server",
    agent: "claude-code",
    desc: "Claude Code 同一全局 MCP 的执行方式与凭证字段合并为一个任务",
    expectedRuleIds: ["CLAUDE_MCP_STDIO", "CLAUDE_MCP_SECRET_ENV"],
    expectedTaskCount: 1,
    run: (runtime) => claude(runtime, {
      globalState: {
        mcpServers: {
          docs: { command: "synthetic-mcp", env: { API_KEY: FIXTURE_CREDENTIAL } },
        },
      },
    }),
  },
  {
    name: "claude-mcp-scope-distinct",
    agent: "claude-code",
    desc: "Claude Code 同名 MCP 的全局与项目作用域保持两个任务",
    expectedRuleIds: ["CLAUDE_MCP_STDIO", "CLAUDE_MCP_REMOTE"],
    expectedTaskCount: 2,
    run: (runtime) => claude(runtime, {
      globalState: {
        mcpServers: { docs: { command: "synthetic-mcp" } },
        projects: {
          "/Users/example/project": {
            mcpServers: { docs: { type: "sse", url: "https://mcp.example.com/sse" } },
          },
        },
      },
    }),
  },
  {
    name: "codex-mcp-server",
    agent: "codex",
    desc: "Codex 同一 MCP 的本地执行与凭证字段合并为一个任务",
    expectedRuleIds: ["CODEX_MCP_STDIO", "CODEX_MCP_SECRET_ENV"],
    expectedTaskCount: 1,
    run: (runtime) => codex(runtime, {
      toml: `[mcp_servers.docs]\ncommand = "synthetic-mcp"\n\n[mcp_servers.docs.env]\nAPI_TOKEN = "${FIXTURE_CREDENTIAL}"\n`,
    }),
  },
  {
    name: "codex-mcp-disabled",
    agent: "codex",
    desc: "Codex 显式停用的 MCP 不产生行动任务",
    expectedRuleIds: [],
    expectedTaskCount: 0,
    run: (runtime) => codex(runtime, {
      toml: '[mcp_servers.disabled]\ncommand = "synthetic-mcp"\nenabled = false\n',
    }),
  },
  {
    name: "opencode-mcp-server",
    agent: "opencode",
    desc: "OpenCode 同一远程 MCP 的端点与凭证字段合并为一个任务",
    expectedRuleIds: ["OPENCODE_MCP_REMOTE", "OPENCODE_MCP_SECRET_ENV"],
    expectedTaskCount: 1,
    run: (runtime) => opencode(runtime, {
      mcp: {
        docs: {
          type: "remote",
          url: "https://mcp.example.com/v1",
          headers: { Authorization: FIXTURE_CREDENTIAL },
        },
      },
    }),
  },
  {
    name: "opencode-mcp-distinct",
    agent: "opencode",
    desc: "OpenCode 两个不同 MCP server 不会被错误合并",
    expectedRuleIds: ["OPENCODE_MCP_REMOTE", "OPENCODE_MCP_REMOTE"],
    expectedTaskCount: 2,
    run: (runtime) => opencode(runtime, {
      mcp: {
        docs: { type: "remote", url: "https://docs-mcp.example.com/v1" },
        repo: { type: "remote", url: "https://repo-mcp.example.com/v1" },
      },
    }),
  },
  {
    name: "gemini-mcp-server",
    agent: "gemini",
    desc: "Gemini 同一 MCP 的 trust、执行与凭证字段合并为一个任务",
    expectedRuleIds: [
      "GEMINI_MCP_TRUST_BYPASS",
      "GEMINI_MCP_STDIO",
      "GEMINI_MCP_SECRET_ENV",
    ],
    expectedTaskCount: 1,
    run: (runtime) => gemini(runtime, {
      settings: {
        mcpServers: {
          docs: {
            command: "synthetic-mcp",
            trust: true,
            env: { API_TOKEN: FIXTURE_CREDENTIAL },
          },
        },
      },
    }),
  },
  {
    name: "gemini-shell-no-sandbox",
    agent: "gemini",
    desc: "Gemini 显式启用 shell 且没有 sandbox",
    expectedRuleIds: ["GEMINI_SHELL_NO_SANDBOX"],
    expectedTaskCount: 1,
    run: (runtime) => gemini(runtime, {
      settings: { tools: { coreTools: ["run_shell_command"] } },
    }),
  },
  {
    name: "gemini-shell-sandboxed",
    agent: "gemini",
    desc: "Gemini shell 已启用 sandbox 时不产生告警",
    expectedRuleIds: [],
    expectedTaskCount: 0,
    run: (runtime) => gemini(runtime, {
      settings: { tools: { coreTools: ["run_shell_command"], sandbox: "docker" } },
    }),
  },
  {
    name: "gemini-env-reference",
    agent: "gemini",
    desc: "Gemini .env 使用环境变量引用时不误报明文凭证",
    expectedRuleIds: [],
    expectedTaskCount: 0,
    run: (runtime) => gemini(runtime, {
      settings: {},
      envText: "GEMINI_API_KEY=${AGENTREVEAL_SYNTHETIC_KEY}\n",
    }),
  },
  {
    name: "gemini-env-plaintext",
    agent: "gemini",
    desc: "Gemini .env 明文凭证只报告键名",
    expectedRuleIds: ["GEMINI_PLAINTEXT_ENV_KEY"],
    expectedTaskCount: 1,
    run: (runtime) => gemini(runtime, {
      settings: {},
      envText: `GEMINI_API_KEY=${FIXTURE_CREDENTIAL}\n`,
    }),
  },
  {
    name: "openclaw-safe-references",
    agent: "openclaw",
    desc: "OpenClaw 环境变量引用、loopback、Tailnet 与 npm 插件不误报",
    expectedRuleIds: [],
    expectedTaskCount: 0,
    run: (runtime) => openclaw(runtime, {
      config: {
        channels: { telegram: { token: "$TELEGRAM_TOKEN" } },
        gateway: {
          bind: "127.0.0.1",
          auth: { token: "${OPENCLAW_GATEWAY_TOKEN}" },
          tailscale: { mode: "tailnet" },
        },
        plugins: { official: { source: "node_modules/openclaw-official" } },
      },
    }),
  },
  {
    name: "openclaw-gateway-exposure",
    agent: "openclaw",
    desc: "OpenClaw 非 loopback 与公开 Funnel 合并为一个网关暴露任务",
    expectedRuleIds: ["OPENCLAW_GATEWAY_EXPOSED_BIND", "OPENCLAW_TAILSCALE_EXPOSURE"],
    expectedTaskCount: 1,
    run: (runtime) => openclaw(runtime, {
      config: {
        gateway: { bind: "0.0.0.0", port: 18789, tailscale: { mode: "funnel" } },
      },
    }),
  },
  {
    name: "openclaw-channel-credentials",
    agent: "openclaw",
    desc: "OpenClaw 渠道 secret 与 token 是两个独立凭证任务",
    expectedRuleIds: [
      "OPENCLAW_CHANNEL_PLAINTEXT_SECRET",
      "OPENCLAW_CHANNEL_PLAINTEXT_TOKEN",
    ],
    expectedTaskCount: 2,
    run: (runtime) => openclaw(runtime, {
      config: {
        channels: {
          synthetic: { appSecret: FIXTURE_CREDENTIAL, token: FIXTURE_SHARED_CREDENTIAL },
        },
      },
    }),
  },
  {
    name: "openclaw-review-inventory",
    agent: "openclaw",
    desc: "OpenClaw workspace、插件来源与 service-env 保持三个不同任务",
    expectedRuleIds: [
      "OPENCLAW_AGENT_WORKSPACE_OVERLAP",
      "OPENCLAW_UNKNOWN_PLUGIN_SOURCE",
      "OPENCLAW_SERVICE_ENV_PRESENT",
    ],
    expectedTaskCount: 3,
    run: (runtime) => openclaw(runtime, {
      serviceEnv: true,
      config: {
        agents: {
          list: [
            { id: "alpha", workspace: "/Users/example/project" },
            { id: "beta", workspace: "/Users/example/project" },
          ],
        },
        plugins: { local: { source: "file:///Users/example/plugin" } },
      },
    }),
  },
  {
    name: "gemini-parse-failure",
    agent: "gemini",
    desc: "Gemini 损坏 JSON 明确形成扫描盲区任务",
    expectedRuleIds: ["GEMINI_PARSE_FAILED"],
    expectedTaskCount: 1,
    run: (runtime) => gemini(runtime, { settingsText: "{ invalid synthetic json" }),
  },
  {
    name: "openclaw-parse-failure",
    agent: "openclaw",
    desc: "OpenClaw 损坏 JSON 明确形成扫描盲区任务",
    expectedRuleIds: ["OPENCLAW_PARSE_FAIL"],
    expectedTaskCount: 1,
    run: (runtime) => openclaw(runtime, { configText: "{ invalid synthetic json" }),
  },
  {
    name: "ccswitch-schema-unknown",
    agent: "cc-switch",
    desc: "CC Switch 未验证 schema 明确形成覆盖审查任务",
    expectedRuleIds: ["CCSWITCH_SCHEMA_UNKNOWN"],
    expectedTaskCount: 1,
    run: (runtime) => ccSwitch(runtime, { schemaVersion: 999 }),
  },
  {
    name: "workspace-scan-truncated",
    agent: "workspace",
    desc: "项目敏感文件达到上限时同时保留已发现路径与截断盲区",
    expectedRuleIds: ["PROJECT_SENSITIVE_FILE", "PROJECT_SENSITIVE_SCAN_TRUNCATED"],
    expectedTaskCount: 2,
    run: (runtime) => workspace(runtime, [".env", ".env.local"], 1),
  },
  {
    name: "cross-agent-shared-proxy",
    agent: "cross-agent",
    desc: "两个 Agent 共用本地代理时产生一个集中风险任务",
    expectedRuleIds: ["XAGENT_SHARED_PROXY"],
    expectedTaskCount: 1,
    run: (runtime) => correlation(runtime, [
      syntheticResult("claude-code", "Claude Code", [{
        id: "CLAUDE_LOCAL_BASE_URL", category: "provider", severity: "info", title: "synthetic",
        evidence: { proxy: "127.0.0.1:15721" },
      }]),
      syntheticResult("codex", "Codex", [{
        id: "CODEX_LOCAL_PROXY", category: "provider", severity: "info", title: "synthetic",
        evidence: { proxy: "127.0.0.1:15721" },
      }]),
    ]),
  },
  {
    name: "cross-agent-single-proxy",
    agent: "cross-agent",
    desc: "只有一个 Agent 使用本地代理时不产生集中风险",
    expectedRuleIds: [],
    expectedTaskCount: 0,
    run: (runtime) => correlation(runtime, [
      syntheticResult("codex", "Codex", [{
        id: "CODEX_LOCAL_PROXY", category: "provider", severity: "info", title: "synthetic",
        evidence: { proxy: "127.0.0.1:15721" },
      }]),
    ]),
  },
  {
    name: "cross-agent-shared-endpoint",
    agent: "cross-agent",
    desc: "两个 Agent 共用非官方端点时产生一个集中风险任务",
    expectedRuleIds: ["XAGENT_SHARED_ENDPOINT"],
    expectedTaskCount: 1,
    run: (runtime) => correlation(runtime, [
      syntheticResult("codex", "Codex", [{
        id: "CODEX_CUSTOM_PROVIDER", category: "provider", severity: "high", title: "synthetic",
        evidence: { baseUrl: "https://relay.example.com/v1" },
      }]),
      syntheticResult("opencode", "OpenCode", [{
        id: "OPENCODE_CUSTOM_PROVIDER", category: "provider", severity: "medium", title: "synthetic",
        evidence: { baseUrl: "https://relay.example.com/v1/" },
      }]),
    ]),
  },
  {
    name: "cross-agent-official-endpoint",
    agent: "cross-agent",
    desc: "两个 Agent 共用官方端点时不产生集中风险",
    expectedRuleIds: [],
    expectedTaskCount: 0,
    run: (runtime) => correlation(runtime, [
      syntheticResult("codex", "Codex", [{
        id: "CODEX_CUSTOM_PROVIDER", category: "provider", severity: "info", title: "synthetic",
        evidence: { baseUrl: "https://api.openai.com/v1" },
      }]),
      syntheticResult("opencode", "OpenCode", [{
        id: "OPENCODE_CUSTOM_PROVIDER", category: "provider", severity: "info", title: "synthetic",
        evidence: { baseUrl: "https://api.openai.com/v1" },
      }]),
    ]),
  },
];

function countIds(ids) {
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

function expandCountDifference(primary, secondary) {
  const output = [];
  for (const [id, count] of primary) {
    const delta = count - (secondary.get(id) ?? 0);
    for (let index = 0; index < delta; index += 1) output.push(id);
  }
  return output.sort();
}

function reportForScenario(runtime, scenario, output) {
  const normalized = Array.isArray(output)
    ? {
        results: [syntheticResult(
          scenario.agent,
          DISPLAY_NAMES[scenario.agent],
          output
        )],
        correlations: [],
      }
    : output;
  const allFindings = normalized.results.flatMap((result) => result.findings);
  const report = {
    results: normalized.results,
    allFindings,
    correlations: normalized.correlations ?? [],
  };
  return {
    findings: [...allFindings, ...report.correlations],
    tasks: runtime.buildActionTasks(runtime.buildActionPlan(report)),
    serialized: JSON.stringify(report),
  };
}

export async function evaluateScenario(runtime, scenario) {
  const output = await scenario.run(runtime);
  const { findings, tasks, serialized } = reportForScenario(runtime, scenario, output);
  const expected = countIds(scenario.expectedRuleIds);
  const actual = countIds(findings.map((finding) => finding.id));
  const missing = expandCountDifference(expected, actual);
  const unexpected = expandCountDifference(actual, expected);
  const taskDelta = tasks.length - scenario.expectedTaskCount;
  return {
    name: scenario.name,
    agent: scenario.agent,
    desc: scenario.desc,
    expectedRuleIds: [...scenario.expectedRuleIds].sort(),
    actualRuleIds: findings.map((finding) => finding.id).sort(),
    expectedTaskCount: scenario.expectedTaskCount,
    actualTaskCount: tasks.length,
    missing,
    unexpected,
    duplicateTaskExcess: Math.max(0, taskDelta),
    missingTaskCount: Math.max(0, -taskDelta),
    taskRuleIds: tasks.map((task) => task.requirements.map((rule) => rule.ruleId).sort()),
    privacySafe:
      !serialized.includes(FIXTURE_CREDENTIAL) &&
      !serialized.includes(FIXTURE_SHARED_CREDENTIAL),
    passed:
      missing.length === 0 &&
      unexpected.length === 0 &&
      taskDelta === 0 &&
      !serialized.includes(FIXTURE_CREDENTIAL) &&
      !serialized.includes(FIXTURE_SHARED_CREDENTIAL),
  };
}

export async function runScenarios(scenarios = SCENARIOS) {
  const runtime = await loadRuntime();
  const results = [];
  for (const scenario of scenarios) {
    results.push(await evaluateScenario(runtime, scenario));
  }
  return results;
}

export function summarizeResults(results) {
  const assessedRuleIds = new Set();
  const missing = [];
  const unexpected = [];
  let expectedFindings = 0;
  let actualFindings = 0;
  let expectedTasks = 0;
  let actualTasks = 0;
  let duplicateTaskExcess = 0;
  let missingTaskCount = 0;
  for (const result of results) {
    result.expectedRuleIds.forEach((id) => assessedRuleIds.add(id));
    result.actualRuleIds.forEach((id) => assessedRuleIds.add(id));
    expectedFindings += result.expectedRuleIds.length;
    actualFindings += result.actualRuleIds.length;
    expectedTasks += result.expectedTaskCount;
    actualTasks += result.actualTaskCount;
    duplicateTaskExcess += result.duplicateTaskExcess;
    missingTaskCount += result.missingTaskCount;
    missing.push(...result.missing.map((id) => `${result.name}:${id}`));
    unexpected.push(...result.unexpected.map((id) => `${result.name}:${id}`));
  }
  return {
    scenarioCount: results.length,
    passedScenarioCount: results.filter((result) => result.passed).length,
    assessedRuleCount: assessedRuleIds.size,
    expectedFindings,
    actualFindings,
    expectedTasks,
    actualTasks,
    duplicateTaskExcess,
    missingTaskCount,
    missing,
    unexpected,
    privacyFailures: results.filter((result) => !result.privacySafe).map((result) => result.name),
  };
}

function codeList(values) {
  return values.length > 0 ? values.map((value) => `\`${value}\``).join("<br>") : "—";
}

export function buildMarkdown(results, generatedAt = new Date()) {
  const summary = summarizeResults(results);
  const passed = summary.passedScenarioCount === summary.scenarioCount;
  const lines = [
    "# AgentReveal 高价值规则质量基线",
    "",
    `> 状态：Active · 生成日期：${generatedAt.toISOString().slice(0, 10)} · 数据源：${summary.scenarioCount} 个合成场景`,
    "",
    "> 本报告只使用合成配置，并运行真实 parser、detector 与行动任务聚合。低频不代表低价值；本报告不根据出现频率建议删除规则。",
    "",
    "## 1. 质量门禁",
    "",
    `- 结果：${passed ? "✓ 通过" : "✗ 未通过"}`,
    `- 场景：${summary.passedScenarioCount}/${summary.scenarioCount} 通过`,
    `- 当前批次覆盖：${summary.assessedRuleCount} 条高价值 ruleId`,
    `- finding：预期 ${summary.expectedFindings}，实际 ${summary.actualFindings}`,
    `- 行动任务：预期 ${summary.expectedTasks}，实际 ${summary.actualTasks}`,
    `- 漏报：${summary.missing.length}；意外告警：${summary.unexpected.length}；重复任务：${summary.duplicateTaskExcess}；错误合并：${summary.missingTaskCount}`,
    `- 隐私失败：${summary.privacyFailures.length}`,
    "",
    "## 2. 场景结果",
    "",
    "| 场景 | Agent | 预期 ruleId | 实际 ruleId | 任务 | 结果 |",
    "|---|---|---|---|---:|---|",
  ];
  for (const result of results) {
    lines.push(
      `| \`${result.name}\`<br>${result.desc} | ${DISPLAY_NAMES[result.agent]} | ${codeList(result.expectedRuleIds)} | ${codeList(result.actualRuleIds)} | ${result.actualTaskCount}/${result.expectedTaskCount} | ${result.passed ? "✓" : "✗"} |`
    );
  }
  lines.push(
    "",
    "## 3. 当前重复告警结论",
    "",
    "- 同一 Provider 的“未知/中转端点”与“明文 HTTP”保留两条技术 finding，但聚合为一个行动任务；用户只处理一次，同时保留两个验证条件。",
    "- OpenCode 的 `OPENCODE_BASH_UNRESTRICTED` 与 `OPENCODE_PERMISSION_WILDCARD` 来自同一份宽泛权限配置，保留两条规则要求，但聚合为一个执行权限任务。",
    "- 同一个 MCP server 的端点/启动方式、trust 和疑似凭证字段按 Agent 与 server 聚合；Claude Code 额外保留 global/project 作用域，两个不同 server 或作用域不会误合并。",
    "- OpenClaw 同一网关的非 loopback bind 与 Funnel/public 暴露聚合为一个网关暴露任务，并保留两个独立验证条件。",
    "- 明文凭证与密钥复用属于不同根因，继续显示为两个任务，不为追求更少数量而错误合并。",
    "",
    "## 4. 失败明细",
    "",
  );
  if (passed) {
    lines.push("> 当前批次无漏报、意外告警、重复任务或凭证明文泄漏。");
  } else {
    lines.push(`- 漏报：${codeList(summary.missing)}`);
    lines.push(`- 意外告警：${codeList(summary.unexpected)}`);
    lines.push(`- 重复任务：${summary.duplicateTaskExcess}`);
    lines.push(`- 错误合并：${summary.missingTaskCount}`);
    lines.push(`- 隐私失败：${codeList(summary.privacyFailures)}`);
  }
  lines.push(
    "",
    "## 5. 边界与下一批",
    "",
    "当前批次覆盖 Claude Code、Codex、CC Switch、OpenCode、Gemini CLI、OpenClaw、当前项目与跨 Agent 关联中的 43 条高价值 ruleId。尚未进入场景的规则继续按 Q2/Q3 计划补齐；未覆盖不等于低价值或删除候选。",
    "",
    "## 6. 复现命令",
    "",
    "```bash",
    "npm run build",
    "node scripts/rule-hit-rate.mjs",
    "```",
    ""
  );
  return lines.join("\n");
}

function parseArgs(argv) {
  if (argv.includes("--live")) {
    throw new Error("--live 模式未启用；规则质量基线只允许读取合成 fixture。");
  }
  const outIndex = argv.indexOf("--out");
  if (outIndex >= 0 && !argv[outIndex + 1]) {
    throw new Error("--out 缺少输出路径。");
  }
  const supported = new Set(["--out"]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--") && !supported.has(arg)) {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return {
    outPath: outIndex >= 0
      ? resolve(argv[outIndex + 1])
      : resolve(repoRoot, "docs", "rule-hit-rate.md"),
  };
}

export async function main(argv = process.argv.slice(2)) {
  const { outPath } = parseArgs(argv);
  if (!existsSync(resolve(repoRoot, "dist", "core", "action", "index.js"))) {
    throw new Error("dist 不存在；请先运行 `npm run build`。");
  }
  const results = await runScenarios();
  const summary = summarizeResults(results);
  writeFileSync(outPath, buildMarkdown(results));
  console.error(
    `[info] ${summary.passedScenarioCount}/${summary.scenarioCount} 场景通过，` +
    `${summary.assessedRuleCount} 条规则，${summary.duplicateTaskExcess} 个重复任务`
  );
  if (summary.passedScenarioCount !== summary.scenarioCount) process.exitCode = 1;
  return { results, summary, outPath };
}

const invokedAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  main().catch((error) => {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  });
}
