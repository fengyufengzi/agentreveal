/**
 * Claude Code deepScan 单元测试。
 * 覆盖 parse.ts + risk.ts 各规则，并锁死「token 绝不出现在输出中」。
 * 从 dist/ 导入。运行前需 npm run build。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { buildClaudeDir } from "./fixtures/build-claude.mjs";
import {
  claudePlaintextSettingsFiles,
  parseClaudeCode,
} from "../dist/adapters/claude-code/parse.js";
import { buildClaudeCodeFindings } from "../dist/adapters/claude-code/risk.js";

function scan(opts, fn) {
  const { configDir, home, cleanup } = buildClaudeDir(opts);
  try {
    const data = parseClaudeCode(configDir, home);
    return fn({ data, findings: buildClaudeCodeFindings(data) });
  } finally {
    cleanup();
  }
}
const ids = (f) => f.map((x) => x.id);
const byId = (f, id) => f.filter((x) => x.id === id);

const TOKEN = "sk-ant-PLAINTOKEN-AAAAAAAAAAAA";
const MCP_SECRET = "ghp_MCP-BBBBBBBBBBBB";

test("备份目标: 只返回实际含明文字段的已知 Claude 设置文件", () => {
  const { configDir, cleanup } = buildClaudeDir({
    settings: { env: { ANTHROPIC_AUTH_TOKEN: TOKEN } },
    settingsLocal: { env: { SAFE_FLAG: "1" } },
  });
  try {
    assert.deepEqual(claudePlaintextSettingsFiles(configDir), [
      join(configDir, "settings.json"),
    ]);
  } finally {
    cleanup();
  }
});

test("CC Switch PROXY_MANAGED 只是代理占位符，不触发凭证 P0 或迁移备份", () => {
  const { configDir, home, cleanup } = buildClaudeDir({
    settings: {
      env: {
        ANTHROPIC_AUTH_TOKEN: "PROXY_MANAGED",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:15721",
      },
    },
  });
  try {
    const data = parseClaudeCode(configDir, home);
    const findings = buildClaudeCodeFindings(data);
    assert.equal(data.authTokenPresent, false);
    assert.equal(data.proxyManagedPlaceholderPresent, true);
    assert.equal(byId(findings, "CLAUDE_PLAINTEXT_TOKEN").length, 0);
    assert.deepEqual(claudePlaintextSettingsFiles(configDir), []);
    const localProxy = byId(findings, "CLAUDE_LOCAL_BASE_URL")[0];
    assert.equal(localProxy.title, "Claude Code 使用本地代理接管配置");
    assert.equal(
      localProxy.evidence.authMode,
      "PROXY_MANAGED（CC Switch 鉴权占位符）"
    );
    assert.match(localProxy.description, /不是真实 Provider 凭证/);
    assert.ok(!JSON.stringify(findings).includes(TOKEN));
  } finally {
    cleanup();
  }
});

test("代理占位符不会掩盖另一个设置文件中的真实明文凭证", () => {
  const { configDir, home, cleanup } = buildClaudeDir({
    settings: { env: { ANTHROPIC_AUTH_TOKEN: TOKEN } },
    settingsLocal: {
      env: {
        ANTHROPIC_AUTH_TOKEN: "PROXY_MANAGED",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:15721",
      },
    },
  });
  try {
    const data = parseClaudeCode(configDir, home);
    const findings = buildClaudeCodeFindings(data);
    assert.equal(data.authTokenPresent, true);
    assert.equal(data.proxyManagedPlaceholderPresent, true);
    assert.equal(byId(findings, "CLAUDE_PLAINTEXT_TOKEN").length, 1);
    assert.equal(
      byId(findings, "CLAUDE_LOCAL_BASE_URL")[0].title,
      "ANTHROPIC_BASE_URL 指向本地端点"
    );
    assert.deepEqual(claudePlaintextSettingsFiles(configDir), [
      join(configDir, "settings.json"),
    ]);
  } finally {
    cleanup();
  }
});

test("规则: 明文 ANTHROPIC_AUTH_TOKEN → high；本地 base_url → info", () => {
  scan(
    {
      settings: {
        env: {
          ANTHROPIC_AUTH_TOKEN: TOKEN,
          ANTHROPIC_BASE_URL: "http://127.0.0.1:15721",
        },
      },
    },
    ({ findings }) => {
      assert.equal(byId(findings, "CLAUDE_PLAINTEXT_TOKEN").length, 1);
      const b = byId(findings, "CLAUDE_LOCAL_BASE_URL");
      assert.equal(b.length, 1);
      // 本地 http 不应触发 insecure_http
      assert.ok(!ids(findings).includes("CLAUDE_INSECURE_HTTP"));
    }
  );
});

test("规则: 未知 base_url → high", () => {
  scan(
    { settings: { env: { ANTHROPIC_BASE_URL: "https://relay.unknown.xyz" } } },
    ({ findings }) => {
      assert.equal(byId(findings, "CLAUDE_UNKNOWN_BASE_URL").length, 1);
      assert.equal(byId(findings, "CLAUDE_UNKNOWN_BASE_URL")[0].severity, "high");
    }
  );
});

test("规则: 官方 base_url 无 provider 风险", () => {
  scan(
    { settings: { env: { ANTHROPIC_BASE_URL: "https://api.anthropic.com" } } },
    ({ findings }) => {
      assert.equal(findings.length, 0);
    }
  );
});

test("规则: bypassPermissions → high", () => {
  scan(
    { settings: { permissions: { defaultMode: "bypassPermissions" } } },
    ({ findings }) => {
      assert.equal(byId(findings, "CLAUDE_BYPASS_PERMISSIONS")[0].severity, "high");
    }
  );
});

test("规则: 无约束 Bash allow 规则 → medium；受约束的不算", () => {
  scan(
    {
      settings: {
        permissions: { allow: ["Bash(*)", "Bash(git status:*)", "Read"] },
      },
    },
    ({ findings }) => {
      const f = byId(findings, "CLAUDE_DANGEROUS_ALLOW");
      assert.equal(f.length, 1);
      assert.deepEqual(f[0].evidence.rules, ["Bash(*)"]);
    }
  );
});

test("规则: hooks 与 enableAllProjectMcpServers", () => {
  scan(
    {
      settings: {
        hooks: { PreToolUse: [{ hooks: [{ command: "echo hi" }] }] },
        enableAllProjectMcpServers: true,
      },
    },
    ({ findings }) => {
      assert.ok(ids(findings).includes("CLAUDE_HOOKS_PRESENT"));
      assert.ok(ids(findings).includes("CLAUDE_ENABLE_ALL_PROJECT_MCP"));
    }
  );
});

test("规则: 全局 MCP stdio + env 内嵌密钥（仅键名）", () => {
  scan(
    {
      settings: {},
      globalState: {
        mcpServers: {
          gh: { command: "gh-mcp", env: { GITHUB_TOKEN: MCP_SECRET, PATH: "/usr/bin" } },
        },
      },
    },
    ({ findings }) => {
      const stdio = byId(findings, "CLAUDE_MCP_STDIO");
      assert.equal(stdio.length, 1);
      assert.equal(stdio[0].evidence.scope, "global");
      const sec = byId(findings, "CLAUDE_MCP_SECRET_ENV");
      assert.deepEqual(sec[0].evidence.envKeys, ["GITHUB_TOKEN"]);
      assert.ok(!JSON.stringify(findings).includes(MCP_SECRET));
    }
  );
});

test("规则: 项目级 MCP 远程 URL", () => {
  scan(
    {
      settings: {},
      globalState: {
        projects: {
          "/proj": { mcpServers: { r: { type: "sse", url: "https://mcp.unknown.xyz/sse" } } },
        },
      },
    },
    ({ findings }) => {
      const f = byId(findings, "CLAUDE_MCP_REMOTE");
      assert.equal(f.length, 1);
      assert.equal(f[0].evidence.scope, "project");
      assert.equal(f[0].severity, "medium");
    }
  );
});

test("合并: settings.local.json 覆盖并合并 allow", () => {
  scan(
    {
      settings: { permissions: { allow: ["Read"] } },
      settingsLocal: { permissions: { defaultMode: "bypassPermissions", allow: ["Bash"] } },
    },
    ({ data, findings }) => {
      assert.ok(data.bypassPermissions);
      assert.ok(ids(findings).includes("CLAUDE_DANGEROUS_ALLOW")); // "Bash" 无约束
    }
  );
});

test("隐私红线: token 不出现在完整 findings 输出中", () => {
  scan(
    {
      settings: { env: { ANTHROPIC_AUTH_TOKEN: TOKEN } },
      globalState: { mcpServers: { gh: { command: "x", env: { API_KEY: MCP_SECRET } } } },
    },
    ({ findings }) => {
      const dump = JSON.stringify(findings);
      for (const s of [TOKEN, MCP_SECRET]) {
        assert.ok(!dump.includes(s), `泄露: ${s.slice(0, 8)}…`);
      }
    }
  );
});
