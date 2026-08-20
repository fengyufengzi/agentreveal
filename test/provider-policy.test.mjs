/**
 * Provider trust policy 测试。
 * 从 dist/ 导入。运行前需 npm run build。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyBaseUrl } from "../dist/rules/provider.js";
import { scanAll } from "../dist/core/scan/index.js";

async function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), "agentreveal-policy-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("provider policy: trusted/internal endpoint 覆盖未知端点分类", () => {
  const direct = classifyBaseUrl("https://ai.example.com/v1", {
    trustedEndpoints: ["https://ai.example.com"],
  });
  assert.equal(direct.type, "enterprise_internal");
  assert.equal(direct.level, "low");

  const wildcard = classifyBaseUrl("https://llm.corp.example.com/v1", {
    internalEndpoints: ["*.corp.example.com"],
  });
  assert.equal(wildcard.type, "enterprise_internal");
});

test("provider policy: http flag 不因 trusted endpoint 消失", () => {
  const cls = classifyBaseUrl("http://relay.example.com/v1", {
    trustedEndpoints: ["relay.example.com"],
  });
  assert.equal(cls.type, "enterprise_internal");
  assert.ok(cls.flags.includes("使用非 TLS 明文 http"));
});

test("scanAll: .agentreveal.json 能信任项目内配置的未知 Provider", async () => {
  await withTemp(async (root) => {
    const home = join(root, "home");
    const cwd = join(root, "project");
    const xdg = join(root, "xdg");
    mkdirSync(join(xdg, "opencode"), { recursive: true });
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });

    writeFileSync(
      join(cwd, ".agentreveal.json"),
      JSON.stringify({
        providers: {
          trusted: ["https://relay.unknown.xyz"],
        },
      })
    );
    writeFileSync(
      join(xdg, "opencode", "opencode.json"),
      JSON.stringify({
        provider: {
          relay: { options: { baseURL: "https://relay.unknown.xyz/v1" } },
        },
        permission: { bash: "allow" },
      })
    );

    const report = await scanAll({
      home,
      cwd,
      env: { XDG_CONFIG_HOME: xdg },
    });

    const ids = report.allFindings.map((f) => f.id);
    assert.ok(!ids.includes("OPENCODE_CUSTOM_PROVIDER"));
    const bashFinding = report.allFindings.find(
      (f) => f.id === "OPENCODE_BASH_UNRESTRICTED"
    );
    assert.equal(bashFinding.action.disposition, "fix");
    assert.equal(bashFinding.action.fixMode, "baseline");
    assert.equal(bashFinding.fixable, true);
    const workspace = report.results.find((r) => r.agent === "workspace");
    assert.ok(
      workspace.discovery.notes.some((n) => n.includes(".agentreveal.json"))
    );
  });
});
