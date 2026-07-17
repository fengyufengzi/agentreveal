/**
 * Codex deepScan 单元测试。
 * 覆盖 parse.ts + risk.ts 各规则触发，并锁死「token/密钥绝不出现在输出中」。
 * 从 dist/ 导入（编译产物）。运行前需 npm run build。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCodexDir } from "./fixtures/build-codex.mjs";
import { parseCodex } from "../dist/adapters/codex/parse.js";
import { buildCodexFindings } from "../dist/adapters/codex/risk.js";

function scan(opts, fn) {
  const { configPath, baseDir, cleanup } = buildCodexDir(opts);
  try {
    const data = parseCodex(configPath, baseDir);
    return fn({ data, findings: buildCodexFindings(data) });
  } finally {
    cleanup();
  }
}

const ids = (f) => f.map((x) => x.id);
const byId = (f, id) => f.filter((x) => x.id === id);

const SECRET_KEY = "sk-openai-RAWKEY-AAAAAAAAAAAA";
const SECRET_MCP = "ghp_MCPTOKEN-BBBBBBBBBBBB";

test("parse: 提取自定义 provider / mcp / trusted / proxy", () => {
  scan(
    {
      toml: `
model_provider = "custom"

[model_providers.custom]
base_url = "https://relay.example.io/v1"
wire_api = "chat"
env_key = "MY_KEY"

[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp"]

[projects."/a"]
trust_level = "trusted"

[network]
proxy_url = "http://127.0.0.1:7890"
`,
    },
    ({ data }) => {
      assert.equal(data.activeProvider, "custom");
      assert.equal(data.providers[0].baseUrl, "https://relay.example.io/v1");
      assert.equal(data.mcpServers[0].name, "playwright");
      assert.deepEqual(data.trustedProjects, ["/a"]);
      assert.equal(data.proxyUrl, "http://127.0.0.1:7890");
    }
  );
});

test("规则: 当前激活的未知自定义 provider → high", () => {
  scan(
    {
      toml: `
model_provider = "custom"
[model_providers.custom]
base_url = "https://relay.example.io/v1"
`,
    },
    ({ findings }) => {
      const f = byId(findings, "CODEX_CUSTOM_PROVIDER");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "high");
    }
  );
});

test("规则: 官方端点不产生 provider 风险", () => {
  scan(
    {
      toml: `
[model_providers.oai]
base_url = "https://api.openai.com/v1"
`,
    },
    ({ findings }) => {
      assert.ok(!ids(findings).includes("CODEX_CUSTOM_PROVIDER"));
    }
  );
});

test("规则: http 自定义端点 → insecure_http", () => {
  scan(
    {
      toml: `
[model_providers.local]
base_url = "http://203.0.113.10:8080/v1"
`,
    },
    ({ findings }) => {
      assert.ok(ids(findings).includes("CODEX_INSECURE_HTTP"));
    }
  );
});

test("规则: auth.json 中原始 API Key → high；OAuth 不触发", () => {
  scan(
    { toml: "", auth: { auth_mode: "apikey", OPENAI_API_KEY: SECRET_KEY } },
    ({ findings }) => {
      const f = byId(findings, "CODEX_PLAINTEXT_API_KEY");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "high");
      assert.ok(Array.isArray(f[0].remediation) && f[0].remediation.length > 0);
      assert.ok(f[0].remediation.every((s) => typeof s === "string" && s.length > 0));
    }
  );
  scan(
    { toml: "", auth: { auth_mode: "chatgpt", OPENAI_API_KEY: null, tokens: { access_token: SECRET_KEY } } },
    ({ findings }) => {
      assert.ok(!ids(findings).includes("CODEX_PLAINTEXT_API_KEY"));
    }
  );
});

test("规则: 本地 stdio MCP → info；disabled 跳过", () => {
  scan(
    {
      toml: `
[mcp_servers.a]
command = "npx"

[mcp_servers.b]
command = "./thing"
enabled = false
`,
    },
    ({ findings }) => {
      const f = byId(findings, "CODEX_MCP_STDIO");
      assert.equal(f.length, 1);
      assert.equal(f[0].evidence.server, "a");
    }
  );
});

test("规则: 远程 URL MCP 未知端点 → medium", () => {
  scan(
    {
      toml: `
[mcp_servers.remote]
url = "https://mcp.unknown-relay.xyz/sse"
type = "sse"
`,
    },
    ({ findings }) => {
      const f = byId(findings, "CODEX_MCP_REMOTE");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "medium");
    }
  );
});

test("规则: MCP env 内嵌疑似密钥 → medium，仅报键名", () => {
  scan(
    {
      toml: `
[mcp_servers.gh]
command = "gh-mcp"

[mcp_servers.gh.env]
GITHUB_TOKEN = "${SECRET_MCP}"
NODE_PATH = "/usr/lib"
`,
    },
    ({ findings }) => {
      const f = byId(findings, "CODEX_MCP_SECRET_ENV");
      assert.equal(f.length, 1);
      assert.deepEqual(f[0].evidence.envKeys, ["GITHUB_TOKEN"]);
      assert.ok(!JSON.stringify(f[0]).includes(SECRET_MCP));
    }
  );
});

test("规则: >=5 个 trusted 项目 → medium", () => {
  scan(
    {
      toml: `
[projects."/a"]
trust_level = "trusted"
[projects."/b"]
trust_level = "trusted"
[projects."/c"]
trust_level = "trusted"
[projects."/d"]
trust_level = "trusted"
[projects."/e"]
trust_level = "trusted"
[projects."/f"]
trust_level = "untrusted"
`,
    },
    ({ findings }) => {
      const f = byId(findings, "CODEX_TRUSTED_PROJECTS");
      assert.equal(f.length, 1);
      assert.equal(f[0].evidence.count, 5);
      assert.equal(f[0].severity, "medium");
    }
  );
});

test("兼容: TOML 损坏不抛错，仍返回 auth 信息", () => {
  scan(
    { toml: "this is = = not valid toml [[[", auth: { auth_mode: "apikey", OPENAI_API_KEY: SECRET_KEY } },
    ({ data, findings }) => {
      assert.equal(data.configParsed, false);
      assert.ok(ids(findings).includes("CODEX_PLAINTEXT_API_KEY"));
    }
  );
});

test("隐私红线: token/密钥都不出现在完整 findings 输出中", () => {
  scan(
    {
      toml: `
[mcp_servers.gh]
command = "gh-mcp"
[mcp_servers.gh.env]
GITHUB_TOKEN = "${SECRET_MCP}"
`,
      auth: { auth_mode: "apikey", OPENAI_API_KEY: SECRET_KEY, tokens: { access_token: SECRET_KEY } },
    },
    ({ findings }) => {
      const dump = JSON.stringify(findings);
      for (const s of [SECRET_KEY, SECRET_MCP]) {
        assert.ok(!dump.includes(s), `泄露: ${s.slice(0, 8)}…`);
      }
    }
  );
});
