/**
 * CC Switch deepScan 单元测试。
 * 覆盖 parse.ts + risk.ts 各规则触发，并锁死「密钥绝不出现在输出中」。
 * 从 dist/ 导入（编译产物，与 NodeNext .js 说明符一致）。运行前需 npm run build。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCcSwitchDb } from "./fixtures/build-db.mjs";
import { parseCcSwitchDb } from "../dist/adapters/cc-switch/parse.js";
import { buildCcSwitchFindings } from "../dist/adapters/cc-switch/risk.js";

/** 便捷：建库→解析→产出 findings，跑完自动清理。 */
function scan(opts, fn) {
  const { dbPath, cleanup } = buildCcSwitchDb(opts);
  try {
    const data = parseCcSwitchDb(dbPath);
    const findings = buildCcSwitchFindings(data);
    return fn({ data, findings });
  } finally {
    cleanup();
  }
}

const ids = (findings) => findings.map((f) => f.id);
const byId = (findings, id) => findings.filter((f) => f.id === id);

// —— 密钥常量（测试专用，绝不应出现在任何 finding 输出中）——
const SECRET_A = "sk-ant-SUPERSECRET-AAAAAAAAAAAA";
const SECRET_SHARED = "sk-minimax-SHARED-BBBBBBBBBBBB";
const SECRET_C = "sk-codex-CCCCCCCCCCCC";

test("parse: 提取 base_url 与密钥指纹，不返回明文", () => {
  scan(
    {
      providers: [
        {
          app_type: "claude",
          name: "MiniMax",
          is_current: true,
          settings_config: {
            env: {
              ANTHROPIC_BASE_URL: "https://api.minimaxi.com",
              ANTHROPIC_AUTH_TOKEN: SECRET_A,
            },
          },
        },
      ],
    },
    ({ data }) => {
      const p = data.providers[0];
      assert.equal(p.baseUrl, "https://api.minimaxi.com");
      assert.equal(p.keyPresent, true);
      assert.match(p.keyFingerprint, /^[0-9a-f]{12}$/);
      // 明文绝不出现在任何序列化字段里
      assert.ok(!JSON.stringify(data).includes(SECRET_A));
    }
  );
});

test("codex: base_url 埋在 config TOML 字符串里也能提取", () => {
  scan(
    {
      providers: [
        {
          app_type: "codex",
          name: "Relay",
          settings_config: {
            auth: { OPENAI_API_KEY: SECRET_C },
            config: 'model = "gpt-4"\nbase_url = "http://203.0.113.10:8080"\n',
          },
        },
      ],
    },
    ({ data }) => {
      assert.equal(data.providers[0].baseUrl, "http://203.0.113.10:8080");
      assert.equal(data.providers[0].keyPresent, true);
    }
  );
});

test("规则: 当前激活的未知 endpoint → high", () => {
  scan(
    {
      providers: [
        {
          app_type: "claude",
          name: "centos",
          is_current: true,
          settings_config: { env: { ANTHROPIC_BASE_URL: "https://ai.example.com" } },
        },
      ],
    },
    ({ findings }) => {
      const f = byId(findings, "CCSWITCH_UNKNOWN_BASE_URL");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "high"); // isCurrent 抬高
    }
  );
});

test("规则: 公网裸 IP + http → relay + insecure_http", () => {
  scan(
    {
      providers: [
        {
          app_type: "codex",
          name: "Relay",
          settings_config: {
            config: 'base_url = "http://203.0.113.10:8080"',
          },
        },
      ],
    },
    ({ findings }) => {
      assert.ok(ids(findings).includes("CCSWITCH_RELAY_ENDPOINT"));
      assert.ok(ids(findings).includes("CCSWITCH_INSECURE_HTTP"));
    }
  );
});

test("规则: 官方 endpoint 不产生 provider 风险", () => {
  scan(
    {
      providers: [
        {
          app_type: "claude",
          name: "Official",
          is_current: true,
          settings_config: { env: { ANTHROPIC_BASE_URL: "https://api.anthropic.com" } },
        },
      ],
    },
    ({ findings }) => {
      assert.ok(!ids(findings).includes("CCSWITCH_UNKNOWN_BASE_URL"));
      assert.ok(!ids(findings).includes("CCSWITCH_RELAY_ENDPOINT"));
    }
  );
});

test("规则: 明文密钥计数", () => {
  scan(
    {
      providers: [
        { app_type: "claude", name: "A", settings_config: { env: { ANTHROPIC_AUTH_TOKEN: SECRET_A } } },
        { app_type: "codex", name: "B", settings_config: { auth: { OPENAI_API_KEY: SECRET_C } } },
        { app_type: "gemini", name: "C", settings_config: {} }, // 无密钥
      ],
    },
    ({ findings }) => {
      const f = byId(findings, "CCSWITCH_PLAINTEXT_KEY");
      assert.equal(f.length, 1);
      assert.equal(f[0].evidence.count, 2);
      assert.ok(Array.isArray(f[0].remediation) && f[0].remediation.length > 0);
      assert.ok(f[0].remediation.every((s) => typeof s === "string" && s.length > 0));
    }
  );
});

test("规则: 同一密钥跨 Agent 复用 → high，evidence 用指纹非明文", () => {
  scan(
    {
      providers: [
        { app_type: "claude", name: "M1", settings_config: { env: { ANTHROPIC_AUTH_TOKEN: SECRET_SHARED } } },
        { app_type: "openclaw", name: "M2", settings_config: { baseUrl: "https://api.minimaxi.com", apiKey: SECRET_SHARED } },
      ],
    },
    ({ findings }) => {
      const f = byId(findings, "CCSWITCH_SHARED_KEY");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "high"); // 跨 2 类 Agent
      assert.match(f[0].evidence.fingerprint, /^[0-9a-f]{12}$/);
      assert.ok(!JSON.stringify(f[0]).includes(SECRET_SHARED));
    }
  );
});

test("规则: 内置代理还原真实上游", () => {
  scan(
    {
      providers: [
        {
          app_type: "claude",
          name: "centos",
          is_current: true,
          settings_config: { env: { ANTHROPIC_BASE_URL: "https://ai.example.com" } },
        },
      ],
      proxies: [
        { app_type: "claude", proxy_enabled: true, listen_address: "127.0.0.1", listen_port: 15721 },
      ],
    },
    ({ findings }) => {
      const f = byId(findings, "CCSWITCH_PROXY_ENABLED");
      assert.equal(f.length, 1);
      assert.equal(f[0].evidence.realUpstream, "https://ai.example.com");
    }
  );
});

test("规则: 故障转移队列含未知上游 → high", () => {
  scan(
    {
      providers: [
        {
          app_type: "claude",
          name: "official",
          is_current: true,
          settings_config: { env: { ANTHROPIC_BASE_URL: "https://api.anthropic.com" } },
        },
        {
          app_type: "claude",
          name: "backup-unknown",
          in_failover_queue: true,
          settings_config: { env: { ANTHROPIC_BASE_URL: "https://unknown.example.com" } },
        },
      ],
      proxies: [
        { app_type: "claude", proxy_enabled: true, auto_failover_enabled: true },
      ],
    },
    ({ findings }) => {
      const f = byId(findings, "CCSWITCH_PROXY_FAILOVER_UNKNOWN");
      assert.equal(f.length, 1);
      assert.equal(f[0].severity, "high");
    }
  );
});

test("规则: 未知 schema 版本 → 兼容提示", () => {
  scan({ schemaVersion: 99, providers: [] }, ({ findings }) => {
    assert.ok(ids(findings).includes("CCSWITCH_SCHEMA_UNKNOWN"));
  });
});

test("兼容: 旧版无 proxy_config 表不报错", () => {
  scan(
    {
      withProxyTable: false,
      providers: [
        { app_type: "claude", name: "A", settings_config: { env: { ANTHROPIC_BASE_URL: "https://api.anthropic.com" } } },
      ],
    },
    ({ data, findings }) => {
      assert.deepEqual(data.proxies, []);
      assert.ok(Array.isArray(findings));
    }
  );
});

test("隐私红线: 任何密钥都不出现在完整 findings 输出中", () => {
  scan(
    {
      providers: [
        { app_type: "claude", name: "A", is_current: true, settings_config: { env: { ANTHROPIC_BASE_URL: "https://ai.example.com", ANTHROPIC_AUTH_TOKEN: SECRET_A } } },
        { app_type: "openclaw", name: "B", settings_config: { baseUrl: "https://api.minimaxi.com", apiKey: SECRET_SHARED } },
        { app_type: "claude", name: "C", settings_config: { env: { ANTHROPIC_AUTH_TOKEN: SECRET_SHARED } } },
        { app_type: "codex", name: "D", settings_config: { auth: { OPENAI_API_KEY: SECRET_C }, config: 'base_url = "http://203.0.113.10:8080"' } },
      ],
    },
    ({ findings }) => {
      const dump = JSON.stringify(findings);
      for (const s of [SECRET_A, SECRET_SHARED, SECRET_C]) {
        assert.ok(!dump.includes(s), `密钥泄露: ${s.slice(0, 8)}…`);
      }
    }
  );
});
