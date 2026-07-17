/**
 * Gemini discovery-only adapter 测试。
 * 从 dist/ 导入。运行前需 npm run build。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import { geminiAdapter } from "../dist/adapters/gemini/index.js";

async function withHome(fn) {
  const home = mkdtempSync(join(tmpdir(), "agentguard-gemini-"));
  try {
    return await fn(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

test("gemini: 发现 settings.json 与 .env，但不读取凭证内容", async () => {
  await withHome(async (home) => {
    const dir = join(home, ".gemini");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "settings.json"), "{}");
    writeFileSync(join(dir, ".env"), "GEMINI_API_KEY=raw-secret");

    const found = await geminiAdapter.discover({
      home,
      cwd: home,
      env: {},
    });

    assert.equal(found.configFound, true);
    assert.equal(found.configPath, join(dir, "settings.json"));
    assert.equal(found.credentialFilePresent, true);
    assert.ok(!JSON.stringify(found).includes("raw-secret"));
  });
});

test("gemini: 目录存在但 settings 缺失时只提示未配置", async () => {
  await withHome(async (home) => {
    mkdirSync(join(home, ".gemini"), { recursive: true });
    const found = await geminiAdapter.discover({ home, cwd: home, env: {} });

    assert.equal(found.configFound, false);
    assert.equal(found.configPath, undefined);
    assert.ok(found.notes.some((n) => n.includes("未发现 settings.json")));
  });
});

// —— deepScan —— //

/** 写入 settings.json（+可选 .env），discover 后 deepScan，返回 findings。 */
async function scanGemini(settings, envText) {
  return withHome(async (home) => {
    const dir = join(home, ".gemini");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "settings.json"), settings);
    if (envText !== undefined) writeFileSync(join(dir, ".env"), envText);
    const ctx = { home, cwd: home, env: {} };
    const found = await geminiAdapter.discover(ctx);
    return geminiAdapter.deepScan(ctx, found);
  });
}

const byId = (findings, id) => findings.find((f) => f.id === id);

test("gemini deepScan: MCP trust=true → GEMINI_MCP_TRUST_BYPASS(high)", async () => {
  const f = await scanGemini(
    JSON.stringify({ mcpServers: { evil: { command: "node evil.js", trust: true } } })
  );
  const hit = byId(f, "GEMINI_MCP_TRUST_BYPASS");
  assert.ok(hit);
  assert.equal(hit.severity, "high");
  assert.equal(hit.evidence.server, "evil");
});

test("gemini deepScan: remote MCP 未知域名 medium，官方域名 info", async () => {
  const unknown = await scanGemini(
    JSON.stringify({ mcpServers: { x: { url: "https://relay.example.io/mcp" } } })
  );
  const u = byId(unknown, "GEMINI_MCP_REMOTE");
  assert.equal(u.severity, "medium");
  assert.equal(u.evidence.url, "https://relay.example.io/mcp");

  const official = await scanGemini(
    JSON.stringify({ mcpServers: { g: { httpUrl: "https://mcp.googleapis.com/v1" } } })
  );
  assert.equal(byId(official, "GEMINI_MCP_REMOTE").severity, "info");
});

test("gemini deepScan: stdio MCP command → GEMINI_MCP_STDIO(info)", async () => {
  const f = await scanGemini(
    JSON.stringify({ mcpServers: { local: { command: "python server.py" } } })
  );
  const hit = byId(f, "GEMINI_MCP_STDIO");
  assert.equal(hit.severity, "info");
  assert.equal(hit.evidence.command, "python server.py");
});

test("gemini deepScan: MCP env 含密钥 → GEMINI_MCP_SECRET_ENV，evidence 仅键名", async () => {
  const f = await scanGemini(
    JSON.stringify({
      mcpServers: { s: { command: "x", env: { API_KEY: "sk-should-not-leak", FOO: "bar" } } },
    })
  );
  const hit = byId(f, "GEMINI_MCP_SECRET_ENV");
  assert.equal(hit.severity, "medium");
  assert.deepEqual(hit.evidence.envKeys, ["API_KEY"]);
  assert.ok(!JSON.stringify(hit).includes("sk-should-not-leak"));
});

test("gemini deepScan: .env 明文密钥触发 high，${VAR} 引用不触发", async () => {
  const plain = await scanGemini(JSON.stringify({}), "GEMINI_API_KEY=raw-secret-value");
  const hit = byId(plain, "GEMINI_PLAINTEXT_ENV_KEY");
  assert.equal(hit.severity, "high");
  assert.deepEqual(hit.evidence.keys, ["GEMINI_API_KEY"]);
  assert.ok(!JSON.stringify(plain).includes("raw-secret-value"));

  const ref = await scanGemini(JSON.stringify({}), "GEMINI_API_KEY=${MY_SECRET}");
  assert.equal(byId(ref, "GEMINI_PLAINTEXT_ENV_KEY"), undefined);
});

test("gemini deepScan: run_shell_command 无 sandbox → GEMINI_SHELL_NO_SANDBOX", async () => {
  const noSandbox = await scanGemini(
    JSON.stringify({ tools: { coreTools: ["run_shell_command"] } })
  );
  assert.equal(byId(noSandbox, "GEMINI_SHELL_NO_SANDBOX").severity, "medium");

  const withSandbox = await scanGemini(
    JSON.stringify({ tools: { coreTools: ["run_shell_command"], sandbox: "docker" } })
  );
  assert.equal(byId(withSandbox, "GEMINI_SHELL_NO_SANDBOX"), undefined);
});

test("gemini deepScan: 隐私红线 — 任何密钥值都不出现在结果中", async () => {
  const f = await scanGemini(
    JSON.stringify({
      security: { auth: { selectedType: "gemini-api-key" } },
      mcpServers: {
        s: {
          url: "https://relay.example.io",
          headers: { Authorization: "Bearer header-secret" },
          env: { TOKEN: "env-secret" },
        },
      },
    }),
    "GOOGLE_API_KEY=dotenv-secret"
  );
  const dump = JSON.stringify(f);
  for (const secret of ["header-secret", "env-secret", "dotenv-secret"]) {
    assert.ok(!dump.includes(secret), `泄漏了 ${secret}`);
  }
});

test("gemini deepScan: 空 settings.json 不误报", async () => {
  const f = await scanGemini("{}");
  assert.equal(f.length, 0);
});

test("gemini deepScan: 坏 JSON → GEMINI_PARSE_FAILED(info)", async () => {
  const f = await scanGemini("{ not valid json ");
  const hit = byId(f, "GEMINI_PARSE_FAILED");
  assert.ok(hit);
  assert.equal(hit.severity, "info");
});
