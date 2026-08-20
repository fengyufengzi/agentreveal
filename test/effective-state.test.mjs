import test from "node:test";
import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildClaudeEffectiveState } from "../dist/adapters/claude-code/posture.js";
import { buildCodexEffectiveState } from "../dist/adapters/codex/posture.js";
import { buildCcSwitchPosture } from "../dist/adapters/cc-switch/posture.js";
import { parseCcSwitchDb } from "../dist/adapters/cc-switch/parse.js";
import {
  buildDriftSnapshot,
  inspectEffectiveStates,
} from "../dist/core/posture/index.js";
import { inspectDesktopEffectiveStates } from "../dist/desktop/service.js";
import { buildCcSwitchDb } from "./fixtures/build-db.mjs";

function writeJson(path, value) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

function makeProject(root, name = "project") {
  const cwd = join(root, name);
  mkdirSync(join(cwd, ".git"), { recursive: true });
  return cwd;
}

test("Claude effective: environment/auth precedence、settings 层级和 MCP 同名覆盖", () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-claude-effective-"));
  try {
    const home = join(root, "home");
    const configDir = join(home, ".claude");
    const cwd = makeProject(root);
    const managedPath = join(root, "managed-settings.json");
    mkdirSync(configDir, { recursive: true });
    writeJson(join(configDir, "settings.json"), {
      env: {
        ANTHROPIC_BASE_URL: "https://user.example.com",
        ANTHROPIC_API_KEY: "SECRET_PLACEHOLDER",
      },
      model: "user-model",
      apiKeyHelper: "/Users/example/bin/key-helper",
      permissions: { defaultMode: "acceptEdits", allow: ["Read"] },
      enabledPlugins: { "reviewer@example": true },
    });
    writeJson(join(cwd, ".claude", "settings.json"), {
      model: "project-model",
      permissions: { allow: ["Bash(git status)"] },
    });
    writeJson(join(cwd, ".claude", "settings.local.json"), {
      env: {
        ANTHROPIC_AUTH_TOKEN: "PROXY_MANAGED",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:15721",
      },
      hooks: { PreToolUse: [{ hooks: [] }] },
    });
    writeJson(managedPath, {
      permissions: { defaultMode: "plan", deny: ["Bash(curl *)"] },
    });
    writeJson(join(home, ".claude.json"), {
      oauthAccount: { accountUuid: "EXAMPLE_ACCOUNT" },
      mcpServers: {
        shared: { command: "user-mcp" },
      },
      projects: {
        [cwd]: {
          mcpServers: {
            shared: { command: "local-mcp" },
          },
        },
      },
    });
    writeJson(join(cwd, ".mcp.json"), {
      mcpServers: {
        shared: { command: "project-mcp" },
        remote: { type: "http", url: "https://mcp.example.com" },
      },
    });

    const state = buildClaudeEffectiveState({
      configDir,
      home,
      cwd,
      env: {
        ANTHROPIC_API_KEY: "SECRET_PLACEHOLDER",
        ANTHROPIC_BASE_URL: "https://session.example.com",
      },
      findings: [{ id: "CLAUDE_HOOKS_PRESENT" }],
      managedSettingsPaths: [managedPath],
      cliSettings: { model: "cli-model" },
    });

    assert.equal(state.confidence, "confirmed");
    assert.equal(state.route.model, "cli-model");
    assert.equal(
      state.route.effectiveEndpoint,
      "https://session.example.com"
    );
    assert.equal(state.auth.method, "proxy-injected");
    assert.equal(state.auth.sourceKind, "project-local");
    assert.equal(state.auth.status, "conflicting");
    assert.ok(
      state.auth.conflicts.some((entry) =>
        entry.code.includes("AUTH_API_KEY")
      )
    );
    assert.equal(
      state.permissions.find(
        (permission) => permission.capability === "filesystem-write"
      ).decision,
      "deny"
    );
    const sharedMcp = state.integrations.find(
      (integration) =>
        integration.kind === "mcp" &&
        integration.identity.startsWith("shared:")
    );
    assert.equal(sharedMcp.identity, "shared:local-mcp");
    assert.ok(
      state.integrations.some(
        (integration) =>
          integration.kind === "hook" &&
          integration.identity === "PreToolUse"
      )
    );
    assert.deepEqual(state.findingIds, ["CLAUDE_HOOKS_PRESENT"]);

    const dump = JSON.stringify(state);
    assert.doesNotMatch(dump, /SECRET_PLACEHOLDER|EXAMPLE_ACCOUNT/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Claude effective: 损坏 project settings 降级为 incomplete 且不回显原文", () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-claude-incomplete-"));
  try {
    const home = join(root, "home");
    const configDir = join(home, ".claude");
    const cwd = makeProject(root);
    mkdirSync(configDir, { recursive: true });
    writeJson(join(configDir, "settings.json"), { model: "safe-model" });
    mkdirSync(join(cwd, ".claude"), { recursive: true });
    writeFileSync(
      join(cwd, ".claude", "settings.local.json"),
      "{ broken SECRET_PLACEHOLDER"
    );

    const state = buildClaudeEffectiveState({
      configDir,
      home,
      cwd,
      env: {},
      findings: [{ id: "CLAUDE_PARSE_FAILED" }],
    });
    assert.equal(state.confidence, "incomplete");
    assert.equal(
      state.configSources.find((source) => source.status === "unreadable").kind,
      "project-local"
    );
    assert.doesNotMatch(JSON.stringify(state), /SECRET_PLACEHOLDER/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Codex effective: CLI > trusted project > profile > user > system，项目不能改 Provider", () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-codex-effective-"));
  try {
    const baseDir = join(root, "codex-home");
    const configPath = join(baseDir, "config.toml");
    const cwd = makeProject(root);
    const nested = join(cwd, "packages", "app");
    const systemPath = join(root, "system-config.toml");
    mkdirSync(baseDir, { recursive: true });
    mkdirSync(join(nested, ".codex"), { recursive: true });
    writeFileSync(
      systemPath,
      'model = "system-model"\nsandbox_mode = "read-only"\n'
    );
    writeFileSync(
      configPath,
      `model = "user-model"
model_provider = "gateway"
approval_policy = "on-request"
sandbox_mode = "read-only"

[model_providers.gateway]
base_url = "https://gateway.example.com/v1"
env_key = "GATEWAY_API_KEY"

[projects."${cwd}"]
trust_level = "trusted"

[mcp_servers.user]
command = "user-mcp"
`
    );
    writeFileSync(
      join(baseDir, "review.config.toml"),
      'model = "profile-model"\nsandbox_mode = "workspace-write"\n'
    );
    mkdirSync(join(cwd, ".codex"), { recursive: true });
    writeFileSync(
      join(cwd, ".codex", "config.toml"),
      'model = "project-model"\nmodel_provider = "project-evil"\n'
    );
    writeFileSync(
      join(nested, ".codex", "config.toml"),
      'sandbox_mode = "danger-full-access"\napproval_policy = "never"\n'
    );
    writeJson(join(baseDir, "auth.json"), {
      auth_mode: "chatgpt",
      tokens: { access_token: "SECRET_PLACEHOLDER" },
    });

    const state = buildCodexEffectiveState({
      baseDir,
      configPath,
      cwd: nested,
      env: { GATEWAY_API_KEY: "SECRET_PLACEHOLDER" },
      findings: [{ id: "CODEX_CUSTOM_PROVIDER" }],
      systemConfigPath: systemPath,
      profile: "review",
      cliOverrides: { model: "cli-model" },
    });

    assert.equal(state.confidence, "confirmed");
    assert.equal(state.route.model, "cli-model");
    assert.equal(
      state.route.effectiveEndpoint,
      "https://gateway.example.com/v1"
    );
    assert.equal(state.auth.method, "environment");
    assert.equal(state.auth.status, "conflicting");
    assert.equal(
      state.permissions.find(
        (permission) => permission.capability === "outside-project-write"
      ).decision,
      "allow"
    );
    const projectSource = state.configSources.find(
      (source) =>
        source.kind === "project-local" &&
        source.path?.endsWith("project/.codex/config.toml")
    );
    assert.equal(projectSource.status, "overridden");
    assert.ok(projectSource.fields.includes("model_provider"));
    assert.doesNotMatch(
      JSON.stringify(state),
      /SECRET_PLACEHOLDER|project-evil/
    );
    const snapshot = buildDriftSnapshot(
      [state],
      Buffer.alloc(32, 13),
      new Date("2026-07-23T00:00:00.000Z")
    );
    assert.doesNotMatch(
      JSON.stringify(snapshot),
      new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Codex effective: untrusted project 层不生效，损坏层安全降级", () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-codex-untrusted-"));
  try {
    const baseDir = join(root, "codex-home");
    const configPath = join(baseDir, "config.toml");
    const cwd = makeProject(root);
    mkdirSync(baseDir, { recursive: true });
    writeFileSync(
      configPath,
      'model = "user-model"\nsandbox_mode = "read-only"\n'
    );
    mkdirSync(join(cwd, ".codex"), { recursive: true });
    writeFileSync(
      join(cwd, ".codex", "config.toml"),
      'model = "project-model"\nsandbox_mode = "danger-full-access"\n'
    );
    const untrusted = buildCodexEffectiveState({
      baseDir,
      configPath,
      cwd,
      env: {},
      findings: [],
      projectTrusted: false,
    });
    assert.equal(untrusted.route.model, "user-model");
    assert.equal(
      untrusted.configSources.find(
        (source) => source.kind === "project-local"
      ).status,
      "overridden"
    );
    assert.equal(
      untrusted.permissions.find(
        (permission) => permission.capability === "filesystem-write"
      ).decision,
      "deny"
    );

    writeFileSync(join(cwd, ".codex", "config.toml"), "[[[ broken");
    const broken = buildCodexEffectiveState({
      baseDir,
      configPath,
      cwd,
      env: {},
      findings: [{ id: "CODEX_PARSE_FAILED" }],
      projectTrusted: true,
    });
    assert.equal(broken.confidence, "incomplete");
    assert.ok(
      broken.configSources.some((source) => source.status === "unreadable")
    );

    const missingProfile = buildCodexEffectiveState({
      baseDir,
      configPath,
      cwd,
      env: {},
      findings: [],
      projectTrusted: false,
      profile: "missing-profile",
    });
    assert.equal(missingProfile.confidence, "incomplete");
    assert.ok(
      missingProfile.configSources.some(
        (source) =>
          source.kind === "profile" && source.status === "unreadable"
      )
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CC Switch effective: 输出消费 Agent 路由，未知 schema 降级", () => {
  const fixture = buildCcSwitchDb({
    providers: [
      {
        app_type: "claude",
        name: "Claude Gateway",
        is_current: true,
        settings_config: {
          env: {
            ANTHROPIC_BASE_URL: "https://claude.example.com",
            ANTHROPIC_AUTH_TOKEN: "SECRET_PLACEHOLDER",
          },
        },
      },
      {
        app_type: "codex",
        name: "Codex Gateway",
        is_current: true,
        settings_config: {
          config: 'base_url = "https://codex-upstream.example.com/v1"',
          auth: { OPENAI_API_KEY: "SECRET_PLACEHOLDER" },
        },
      },
    ],
    proxies: [
      { app_type: "claude", proxy_enabled: true, listen_port: 15721 },
      { app_type: "codex", proxy_enabled: true, listen_port: 15722 },
    ],
  });
  try {
    const data = parseCcSwitchDb(fixture.dbPath);
    const inspection = buildCcSwitchPosture(data, fixture.dbPath, []);
    assert.equal(inspection.state.confidence, "inferred");
    assert.equal(inspection.managedProxyRoutes.length, 2);
    assert.deepEqual(
      inspection.managedProxyRoutes.map((route) => route.consumerAgentId),
      ["claude-code", "codex"]
    );
    assert.equal(
      inspection.managedProxyRoutes[0].realUpstream,
      "https://claude.example.com"
    );
    assert.doesNotMatch(JSON.stringify(inspection), /SECRET_PLACEHOLDER/);

    const unknown = buildCcSwitchPosture(
      { ...data, schemaKnown: false, schemaVersion: 999 },
      fixture.dbPath,
      []
    );
    assert.equal(unknown.state.confidence, "incomplete");
  } finally {
    fixture.cleanup();
  }
});

test("core effective: Claude 的 PROXY_MANAGED 与 CC Switch 接管同时成立才确认真实上游", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-effective-core-"));
  const dbFixture = buildCcSwitchDb({
    providers: [
      {
        app_type: "claude",
        name: "Gateway",
        is_current: true,
        settings_config: {
          env: {
            ANTHROPIC_BASE_URL: "https://upstream.example.com",
            ANTHROPIC_AUTH_TOKEN: "SECRET_PLACEHOLDER",
          },
        },
      },
      {
        app_type: "codex",
        name: "Codex Gateway",
        is_current: true,
        settings_config: {
          config: 'base_url = "https://codex-upstream.example.com/v1"',
          auth: { OPENAI_API_KEY: "SECRET_PLACEHOLDER" },
        },
      },
    ],
    proxies: [
      {
        app_type: "claude",
        proxy_enabled: true,
        listen_address: "127.0.0.1",
        listen_port: 15721,
      },
      {
        app_type: "codex",
        proxy_enabled: true,
        listen_address: "127.0.0.1",
        listen_port: 15722,
      },
    ],
  });
  try {
    const home = join(root, "home");
    const cwd = makeProject(root);
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeJson(join(home, ".claude", "settings.json"), {
      env: {
        ANTHROPIC_BASE_URL: "http://127.0.0.1:15721",
        ANTHROPIC_AUTH_TOKEN: "PROXY_MANAGED",
      },
    });
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(
      join(home, ".codex", "config.toml"),
      'openai_base_url = "http://127.0.0.1:15722"\n'
    );
    writeJson(join(home, ".codex", "auth.json"), {
      auth_mode: "apikey",
      OPENAI_API_KEY: "PROXY_MANAGED",
    });
    mkdirSync(join(home, ".cc-switch"), { recursive: true });
    copyFileSync(
      dbFixture.dbPath,
      join(home, ".cc-switch", "cc-switch.db")
    );
    const ctx = { home, cwd, env: {} };
    const first = await inspectEffectiveStates(ctx);
    const second = await inspectEffectiveStates(ctx);
    assert.deepEqual(first, second);
    assert.deepEqual(
      await inspectDesktopEffectiveStates(ctx),
      first
    );

    const claude = first.find((state) => state.agentId === "claude-code");
    assert.equal(claude.auth.method, "proxy-injected");
    assert.equal(claude.route.proxyKind, "cc-switch");
    assert.equal(
      claude.route.realUpstream,
      "https://upstream.example.com"
    );
    assert.equal(claude.confidence, "confirmed");
    const codex = first.find((state) => state.agentId === "codex");
    assert.equal(codex.auth.method, "proxy-injected");
    assert.equal(codex.route.proxyKind, "cc-switch");
    assert.equal(
      codex.route.realUpstream,
      "https://codex-upstream.example.com/v1"
    );

    const snapshot = buildDriftSnapshot(
      first,
      Buffer.alloc(32, 12),
      new Date("2026-07-23T00:00:00.000Z")
    );
    const snapshotText = JSON.stringify(snapshot);
    assert.doesNotMatch(
      snapshotText,
      /127\.0\.0\.1|upstream\.example\.com|agentreveal-effective-core/
    );

    writeJson(join(home, ".claude", "settings.json"), {
      env: {
        ANTHROPIC_BASE_URL: "http://127.0.0.1:15721",
        ANTHROPIC_AUTH_TOKEN: "SECRET_PLACEHOLDER",
      },
    });
    const withoutPlaceholder = await inspectEffectiveStates(ctx);
    const unconfirmedClaude = withoutPlaceholder.find(
      (state) => state.agentId === "claude-code"
    );
    assert.equal(unconfirmedClaude.auth.method, "api-key");
    assert.equal(unconfirmedClaude.route.proxyKind, "custom");
    assert.equal(unconfirmedClaude.route.realUpstream, undefined);
  } finally {
    dbFixture.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});
