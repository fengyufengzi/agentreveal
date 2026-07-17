/**
 * 跨 Agent 关联测试：correlate 派生逻辑 + formatScan 呈现。
 * 从 dist/ 导入。运行前需 npm run build。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { correlate } from "../dist/core/correlate/index.js";
import { formatScan } from "../dist/core/report/scan-format.js";

/** 造一个 AgentScanResult。 */
function result(agent, displayName, findings) {
  return {
    agent,
    displayName,
    discovery: { agent, displayName, configFound: true },
    findings,
  };
}

const F = (id, category, severity, evidence) => ({
  id,
  category,
  severity,
  title: id,
  evidence,
});

test("correlate: 两 Agent 共用同一本地代理 → XAGENT_SHARED_PROXY(high)", () => {
  const out = correlate([
    result("claude-code", "Claude Code", [
      F("P", "provider", "info", { appType: "claude", proxy: "127.0.0.1:15721", realUpstream: "https://a.io" }),
    ]),
    result("codex", "Codex", [
      F("P", "provider", "info", { appType: "codex", proxy: "127.0.0.1:15721", realUpstream: "https://b.io" }),
    ]),
  ]);
  const shared = out.filter((f) => f.id === "XAGENT_SHARED_PROXY");
  assert.equal(shared.length, 1);
  assert.equal(shared[0].severity, "high");
  assert.equal(shared[0].evidence.proxy, "127.0.0.1:15721");
  assert.deepEqual(shared[0].evidence.agents.sort(), ["Claude Code", "Codex"]);
});

test("correlate: 单个 Agent 用代理 → 不产出", () => {
  const out = correlate([
    result("claude-code", "Claude Code", [
      F("P", "provider", "info", { proxy: "127.0.0.1:15721" }),
    ]),
  ]);
  assert.equal(out.length, 0);
});

test("correlate: 两 Agent 连同一未知端点 → XAGENT_SHARED_ENDPOINT(medium)", () => {
  const out = correlate([
    result("codex", "Codex", [
      F("A", "provider", "high", { baseUrl: "https://relay.xyz/" }),
    ]),
    result("opencode", "OpenCode", [
      F("B", "provider", "high", { baseUrl: "https://relay.xyz" }),
    ]),
  ]);
  const shared = out.filter((f) => f.id === "XAGENT_SHARED_ENDPOINT");
  assert.equal(shared.length, 1);
  assert.equal(shared[0].severity, "medium");
  assert.equal(shared[0].evidence.endpoint, "relay.xyz");
  assert.equal(shared[0].evidence.count, 2);
});

test("correlate: 两 Agent 共用官方端点 → 不产出（官方集中不算风险）", () => {
  const out = correlate([
    result("claude-code", "Claude Code", [
      F("A", "provider", "info", { baseUrl: "https://api.anthropic.com" }),
    ]),
    result("codex", "Codex", [
      F("B", "provider", "info", { baseUrl: "https://api.anthropic.com" }),
    ]),
  ]);
  assert.equal(out.length, 0);
});

test("formatScan: 含跨 Agent 关联段且 Summary 计入关联数", () => {
  const results = [
    result("claude-code", "Claude Code", [
      F("P", "provider", "info", { proxy: "127.0.0.1:15721" }),
    ]),
    result("codex", "Codex", [
      F("P", "provider", "info", { proxy: "127.0.0.1:15721" }),
    ]),
  ];
  const allFindings = results.flatMap((r) => r.findings);
  const correlations = correlate(results);
  const report = { results, allFindings, correlations };
  const out = formatScan(report);
  assert.ok(out.includes("跨 Agent 关联"));
  assert.ok(out.includes("XAGENT_SHARED_PROXY"));
  assert.ok(out.includes("含跨 Agent 关联 1"));
});

test("隐私红线: correlations 输出中不含明文密钥", () => {
  const out = correlate([
    result("codex", "Codex", [
      F("A", "provider", "high", { baseUrl: "https://relay.xyz", proxy: "127.0.0.1:15721" }),
    ]),
    result("opencode", "OpenCode", [
      F("B", "provider", "high", { baseUrl: "https://relay.xyz", proxy: "127.0.0.1:15721" }),
    ]),
  ]);
  const json = JSON.stringify(out);
  // evidence 仅端点/计数/Agent 名，不应出现任何 key 字样值。
  assert.ok(!/sk-[A-Za-z0-9]/.test(json));
  assert.ok(json.includes("relay.xyz"));
  assert.ok(json.includes("127.0.0.1:15721"));
});
