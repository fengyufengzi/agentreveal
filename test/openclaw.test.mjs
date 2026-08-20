/**
 * OpenClaw adapter 单元测试。
 *
 * 与其他 adapter 测试一致：
 * - 从 dist/ 导入编译产物
 * - 用 node:test / node:assert
 * - 关键：隐私红线——完整 findings 序列化中绝不含明文密钥
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { openclawAdapter } from "../dist/adapters/openclaw/index.js";
import { parseOpenClaw } from "../dist/adapters/openclaw/parse.js";
import { buildOpenClawFindings } from "../dist/adapters/openclaw/risk.js";

const tmpRoot = mkdtempSync(join(tmpdir(), "agentreveal-openclaw-"));

function makeConfig(dir, obj) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "openclaw.json"), JSON.stringify(obj));
  // service-env
  mkdirSync(join(dir, "service-env"), { recursive: true });
  writeFileSync(join(dir, "service-env", "ai.openclaw.gateway.env"), "# fixture\n");
}

function makeHome(configObj) {
  const home = join(tmpRoot, `home-${Math.random().toString(36).slice(2, 8)}`);
  const openclawDir = join(home, ".openclaw");
  makeConfig(openclawDir, configObj);
  // cron
  mkdirSync(join(openclawDir, "cron"), { recursive: true });
  return home;
}

const baseConfig = {
  meta: { lastTouchedVersion: "2026.6.11", lastTouchedAt: "2026-07-08T05:52:14Z" },
  auth: {},
  agents: { defaults: {}, list: [{ id: "main" }] },
};

// ---------- parse.ts ----------

test("parseOpenClaw: 配置缺失返回 ok:false", () => {
  const r = parseOpenClaw(undefined, "/nope");
  assert.equal(r.ok, false);
});

test("parseOpenClaw: JSON 损坏时降级", () => {
  const dir = join(tmpRoot, `bad-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "openclaw.json"), "{not json");
  const r = parseOpenClaw(join(dir, "openclaw.json"), dir);
  assert.equal(r.ok, false);
  assert.match(r.reason, /JSON/);
});

test("parseOpenClaw: 正常字段归一化", () => {
  const home = makeHome({
    ...baseConfig,
    gateway: { port: 18789, bind: "127.0.0.1", mode: "local" },
    channels: {
      feishu: { appId: "cli_xxx", appSecret: "very-long-secret-value-XYZ-12345" },
    },
    plugins: {
      "openclaw-feishu": { source: "node_modules/openclaw-feishu", enabled: true },
      "my-local": { source: "file:///tmp/suspect", enabled: true },
    },
    agents: {
      list: [
        { id: "main", workspace: "/Users/me/.openclaw/workspace" },
        { id: "kb", workspace: "/Users/me/.openclaw/workspace" },
      ],
    },
  });
  const r = parseOpenClaw(
    join(home, ".openclaw", "openclaw.json"),
    home,
    join(home, ".openclaw", "service-env")
  );
  assert.equal(r.ok, true);
  assert.equal(r.data.gateway?.port, 18789);
  assert.equal(r.data.gateway?.bind, "127.0.0.1");
  assert.equal(r.data.channels.length, 1);
  assert.equal(r.data.channels[0].hasAppSecret, true);
  assert.equal(r.data.channels[0].hasToken, false);
  // 关键：返回值里没有明文
  const ser = JSON.stringify(r.data);
  assert.ok(!ser.includes("very-long-secret-value-XYZ-12345"));
});

test("parseOpenClaw: 缺 service-env 不算错", () => {
  const home = makeHome(baseConfig);
  const r = parseOpenClaw(
    join(home, ".openclaw", "openclaw.json"),
    home
    // 不传 serviceEnvDir
  );
  assert.equal(r.ok, true);
  assert.equal(r.data.serviceEnvPresent, false);
});

test("parseOpenClaw: 环境变量引用不误报为明文凭证", () => {
  const root = mkdtempSync(join(tmpdir(), "ag-openclaw-envref-"));
  const configPath = join(root, "openclaw.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      channels: {
        feishu: { appSecret: "${FEISHU_APP_SECRET}" },
        telegram: { token: "$TELEGRAM_TOKEN" },
      },
      gateway: { auth: { token: "${OPENCLAW_GATEWAY_TOKEN}" } },
    })
  );

  const parsed = parseOpenClaw(configPath, root);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.data.channels, []);
  assert.equal(parsed.data.gateway?.auth, undefined);
});

// ---------- risk.ts ----------

test("buildOpenClawFindings: 渠道明文 appSecret → high", () => {
  const f = buildOpenClawFindings({
    configFound: true,
    channels: [{ channel: "feishu", hasAppSecret: true, hasToken: false }],
    plugins: [],
    agents: [],
    serviceEnvPresent: false,
  });
  const hit = f.find((x) => x.id === "OPENCLAW_CHANNEL_PLAINTEXT_SECRET");
  assert.ok(hit, "应产出明文 secret finding");
  assert.equal(hit.severity, "high");
  assert.equal(hit.category, "secret");
  // evidence 不含明文 secret
  assert.ok(!JSON.stringify(hit.evidence).includes("very-long-secret-value"));
});

test("buildOpenClawFindings: gateway 明文 token → high", () => {
  const f = buildOpenClawFindings({
    configFound: true,
    channels: [],
    plugins: [],
    agents: [],
    gateway: { auth: { token: "***" } },
    serviceEnvPresent: false,
  });
  const hit = f.find((x) => x.id === "OPENCLAW_GATEWAY_PLAINTEXT_TOKEN");
  assert.ok(hit, "应产出 gateway token 明文 finding");
  assert.equal(hit.severity, "high");
});

test("buildOpenClawFindings: 非 loopback bind → high", () => {
  const f = buildOpenClawFindings({
    configFound: true,
    channels: [],
    plugins: [],
    agents: [],
    gateway: { bind: "0.0.0.0", port: 18789 },
    serviceEnvPresent: false,
  });
  const hit = f.find((x) => x.id === "OPENCLAW_GATEWAY_EXPOSED_BIND");
  assert.ok(hit);
  assert.equal(hit.severity, "high");
});

test("buildOpenClawFindings: loopback bind 不报", () => {
  const f = buildOpenClawFindings({
    configFound: true,
    channels: [],
    plugins: [],
    agents: [],
    gateway: { bind: "127.0.0.1" },
    serviceEnvPresent: false,
  });
  assert.ok(!f.find((x) => x.id === "OPENCLAW_GATEWAY_EXPOSED_BIND"));
});

test("buildOpenClawFindings: tailscale mode=funnel → high", () => {
  const f = buildOpenClawFindings({
    configFound: true,
    channels: [],
    plugins: [],
    agents: [],
    gateway: { tailscale: { mode: "funnel" } },
    serviceEnvPresent: false,
  });
  const hit = f.find((x) => x.id === "OPENCLAW_TAILSCALE_EXPOSURE");
  assert.ok(hit);
  assert.equal(hit.severity, "high");
});

test("buildOpenClawFindings: tailscale mode=off 不报", () => {
  const f = buildOpenClawFindings({
    configFound: true,
    channels: [],
    plugins: [],
    agents: [],
    gateway: { tailscale: { mode: "off" } },
    serviceEnvPresent: false,
  });
  assert.ok(!f.find((x) => x.id === "OPENCLAW_TAILSCALE_EXPOSURE"));
});

test("buildOpenClawFindings: 多 agent 同 workspace → medium", () => {
  const f = buildOpenClawFindings({
    configFound: true,
    channels: [],
    plugins: [],
    agents: [
      { id: "a", workspace: "/same/path" },
      { id: "b", workspace: "/same/path" },
    ],
    serviceEnvPresent: false,
  });
  const hit = f.find((x) => x.id === "OPENCLAW_AGENT_WORKSPACE_OVERLAP");
  assert.ok(hit);
  assert.equal(hit.severity, "medium");
});

test("buildOpenClawFindings: file:// 插件源 → medium", () => {
  const f = buildOpenClawFindings({
    configFound: true,
    channels: [],
    plugins: [{ name: "my-local", source: "file:///tmp/suspect", enabled: true }],
    agents: [],
    serviceEnvPresent: false,
  });
  const hit = f.find((x) => x.id === "OPENCLAW_UNKNOWN_PLUGIN_SOURCE");
  assert.ok(hit);
  assert.equal(hit.severity, "medium");
});

test("buildOpenClawFindings: npm 包插件源不报", () => {
  const f = buildOpenClawFindings({
    configFound: true,
    channels: [],
    plugins: [{ name: "ok", source: "node_modules/openclaw-feishu", enabled: true }],
    agents: [],
    serviceEnvPresent: false,
  });
  assert.ok(!f.find((x) => x.id === "OPENCLAW_UNKNOWN_PLUGIN_SOURCE"));
});

test("buildOpenClawFindings: service-env 存在 → info", () => {
  const f = buildOpenClawFindings({
    configFound: true,
    channels: [],
    plugins: [],
    agents: [],
    serviceEnvPresent: true,
  });
  const hit = f.find((x) => x.id === "OPENCLAW_SERVICE_ENV_PRESENT");
  assert.ok(hit);
  assert.equal(hit.severity, "info");
});

// ---------- adapter discover ----------

test("openclawAdapter.discover: 未安装时 configFound=false", async () => {
  const fakeHome = join(tmpRoot, `nope-${Math.random().toString(36).slice(2, 6)}`);
  const d = await openclawAdapter.discover({
    home: fakeHome,
    cwd: fakeHome,
    env: {},
  });
  assert.equal(d.configFound, false);
});

test("openclawAdapter.discover: 已安装时返回 configPath + 备注", async () => {
  const home = makeHome(baseConfig);
  const d = await openclawAdapter.discover({
    home,
    cwd: home,
    env: {},
  });
  assert.equal(d.configFound, true);
  assert.match(d.configPath, /openclaw\.json$/);
  assert.ok(d.notes?.some((n) => n.includes("service-env")));
  assert.ok(d.notes?.some((n) => n.includes("cron")));
});

test("openclawAdapter.discover: OPENCLAW_HOME 覆盖默认路径", async () => {
  const customHome = join(tmpRoot, `custom-${Math.random().toString(36).slice(2, 6)}`);
  makeConfig(customHome, baseConfig);
  const d = await openclawAdapter.discover({
    home: "/nonexistent",
    cwd: "/tmp",
    env: { OPENCLAW_HOME: customHome },
  });
  assert.equal(d.configFound, true);
  assert.equal(d.source, "OPENCLAW_HOME");
});

test("openclawAdapter.deepScan: 端到端产出 findings（无明文泄漏）", async () => {
  const home = makeHome({
    ...baseConfig,
    channels: {
      feishu: { appId: "cli_xxx", appSecret: "DEADBEEF-SECRET-VALUE-12345" },
    },
    gateway: { port: 18789, bind: "0.0.0.0", auth: { token: "DEADBEEF-TOKEN-99999" } },
  });
  const ctx = { home, cwd: home, env: {} };
  const found = await openclawAdapter.discover(ctx);
  const findings = await openclawAdapter.deepScan(ctx, found);
  assert.ok(findings.length >= 2);
  // 关键：完整序列化中不含任何明文
  const fullDump = JSON.stringify({ found, findings });
  assert.ok(!fullDump.includes("DEADBEEF-SECRET-VALUE-12345"));
  assert.ok(!fullDump.includes("DEADBEEF-TOKEN-99999"));
});

test("openclawAdapter.deepScan: 配置损坏 → 降级到 OPENCLAW_PARSE_FAIL", async () => {
  const home = join(tmpRoot, `badcfg-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(join(home, ".openclaw"), { recursive: true });
  writeFileSync(join(home, ".openclaw", "openclaw.json"), "{not json");
  const ctx = { home, cwd: home, env: {} };
  const found = await openclawAdapter.discover(ctx);
  const findings = await openclawAdapter.deepScan(ctx, found);
  const hit = findings.find((x) => x.id === "OPENCLAW_PARSE_FAIL");
  assert.ok(hit);
  assert.equal(hit.severity, "info");
  assert.equal(hit.evidence.reason, "JSON 格式无效");
  assert.equal(hit.evidence.status, "已安全跳过");
});

test("隐私红线: 完整 deepScan 输出不含明文密钥", async () => {
  const home = makeHome({
    ...baseConfig,
    channels: {
      feishu: { appSecret: "PLAINTEXT-FEISHU-AAA-111" },
      telegram: { token: "PLAINTEXT-TG-BBB-222" },
    },
    gateway: { auth: { token: "PLAINTEXT-GW-CCC-333" } },
  });
  const ctx = { home, cwd: home, env: {} };
  const found = await openclawAdapter.discover(ctx);
  const findings = await openclawAdapter.deepScan(ctx, found);
  const ser = JSON.stringify({ found, findings });
  assert.ok(!ser.includes("PLAINTEXT-FEISHU-AAA-111"));
  assert.ok(!ser.includes("PLAINTEXT-TG-BBB-222"));
  assert.ok(!ser.includes("PLAINTEXT-GW-CCC-333"));
});

// ---------- cleanup ----------
test("teardown", () => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {}
  assert.ok(true);
});
