/**
 * OpenCode deepScan 单元测试。
 * 覆盖 parse.ts + risk.ts 各规则，并锁死「apiKey 绝不出现在输出中」。
 * 从 dist/ 导入。运行前需 npm run build。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOpenCodeConfig } from "./fixtures/build-opencode.mjs";
import { parseOpenCode } from "../dist/adapters/opencode/parse.js";
import { buildOpenCodeFindings } from "../dist/adapters/opencode/risk.js";

function scan(config, fn) {
  const { configPath, cleanup } = buildOpenCodeConfig(config);
  try {
    const data = parseOpenCode(configPath);
    return fn({ data, findings: buildOpenCodeFindings(data) });
  } finally {
    cleanup();
  }
}
const ids = (f) => f.map((x) => x.id);
const byId = (f, id) => f.filter((x) => x.id === id);

const KEY = "sk-plainkey-AAAAAAAAAAAA";

test("bare 配置（仅 $schema）→ 0 风险", () => {
  scan({ $schema: "https://opencode.ai/config.json" }, ({ findings }) => {
    assert.equal(findings.length, 0);
  });
});

test("规则: 自定义 provider baseURL 未知 → medium", () => {
  scan(
    { provider: { relay: { options: { baseURL: "https://relay.unknown.xyz/v1" } } } },
    ({ findings }) => {
      assert.equal(byId(findings, "OPENCODE_CUSTOM_PROVIDER")[0].severity, "medium");
    }
  );
});

test("规则: apiKey 明文 → high；{env:} 引用不触发", () => {
  scan(
    { provider: { a: { options: { apiKey: KEY } } } },
    ({ findings }) => {
      assert.equal(byId(findings, "OPENCODE_PLAINTEXT_KEY").length, 1);
    }
  );
  scan(
    { provider: { a: { options: { apiKey: "{env:OPENAI_API_KEY}" } } } },
    ({ findings }) => {
      assert.equal(byId(findings, "OPENCODE_PLAINTEXT_KEY").length, 0);
    }
  );
});

test("规则: permission.bash=allow → high；全 allow → wildcard", () => {
  scan({ permission: { bash: "allow", edit: "allow" } }, ({ findings }) => {
    assert.equal(byId(findings, "OPENCODE_BASH_UNRESTRICTED")[0].severity, "high");
    assert.equal(byId(findings, "OPENCODE_PERMISSION_WILDCARD").length, 1);
  });
});

test("规则: bash=ask 不触发", () => {
  scan({ permission: { bash: "ask", edit: "allow" } }, ({ findings }) => {
    assert.equal(byId(findings, "OPENCODE_BASH_UNRESTRICTED").length, 0);
    assert.equal(byId(findings, "OPENCODE_PERMISSION_WILDCARD").length, 0);
  });
});

test("规则: share=auto → medium", () => {
  scan({ share: "auto" }, ({ findings }) => {
    assert.equal(byId(findings, "OPENCODE_SHARE_AUTO")[0].severity, "medium");
  });
});

test("规则: autoupdate 仅显式 true 才提示", () => {
  scan({ autoupdate: true }, ({ findings }) => {
    assert.equal(byId(findings, "OPENCODE_AUTOUPDATE_ON").length, 1);
  });
  scan({ autoupdate: false }, ({ findings }) => {
    assert.equal(byId(findings, "OPENCODE_AUTOUPDATE_ON").length, 0);
  });
  scan({}, ({ findings }) => {
    assert.equal(byId(findings, "OPENCODE_AUTOUPDATE_ON").length, 0);
  });
});

test("规则: MCP local 命令 + disabled 跳过", () => {
  scan(
    {
      mcp: {
        a: { type: "local", command: ["node", "server.js"] },
        b: { type: "local", command: ["x"], enabled: false },
      },
    },
    ({ findings }) => {
      const f = byId(findings, "OPENCODE_MCP_LOCAL");
      assert.equal(f.length, 1);
      assert.equal(f[0].evidence.command, "node");
    }
  );
});

test("规则: MCP headers 内嵌密钥（仅键名）", () => {
  scan(
    {
      mcp: {
        r: { type: "remote", url: "https://mcp.unknown.xyz", headers: { Authorization: `Bearer ${KEY}` } },
      },
    },
    ({ findings }) => {
      const sec = byId(findings, "OPENCODE_MCP_SECRET_ENV");
      assert.deepEqual(sec[0].evidence.keys, ["Authorization"]);
      assert.ok(!JSON.stringify(findings).includes(KEY));
    }
  );
});

test("隐私红线: apiKey 不出现在完整 findings 输出中", () => {
  scan(
    {
      provider: { a: { options: { apiKey: KEY } } },
      mcp: { r: { type: "remote", url: "https://x.io", headers: { "X-Api-Key": KEY } } },
    },
    ({ findings }) => {
      assert.ok(!JSON.stringify(findings).includes(KEY));
    }
  );
});
