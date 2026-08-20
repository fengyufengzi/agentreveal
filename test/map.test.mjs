/**
 * 配置地图测试：buildMap 派生逻辑 + formatMap 渲染。
 * 从 dist/ 导入。运行前需 npm run build。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMap } from "../dist/core/map/index.js";
import { formatMap } from "../dist/core/report/map-format.js";

/** 造一个 AgentScanResult。 */
function result(agent, displayName, configFound, findings, source) {
  return {
    agent,
    displayName,
    discovery: { agent, displayName, configFound, source },
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

test("buildMap: 风险取最高严重度；未配置为 n/a；无风险为 ok", () => {
  const report = {
    results: [
      result("cc-switch", "CC Switch", true, [
        F("A", "provider", "medium", { baseUrl: "https://relay.xyz" }),
        F("B", "secret", "high", {}),
        F("C", "sensitive", "high", { path: ".env" }),
      ]),
      result("opencode", "OpenCode", true, []),
      result("gemini", "Gemini", false, []),
    ],
    allFindings: [],
  };
  const map = buildMap(report);
  const [cc, oc, gm] = map.rows;
  assert.equal(cc.risk, "high"); // max(medium, high)
  assert.equal(cc.secretCount, 1);
  assert.equal(cc.sensitiveCount, 1);
  assert.equal(cc.endpoints[0], "relay.xyz"); // 去 scheme
  assert.equal(oc.risk, "ok");
  assert.equal(gm.risk, "n/a");
});

test("buildMap: 端点去重、去 scheme、涵盖 realUpstream/proxy", () => {
  const report = {
    results: [
      result("cc-switch", "CC Switch", true, [
        F("A", "provider", "high", { baseUrl: "https://a.io/" }),
        F("B", "provider", "high", { baseUrl: "https://a.io" }), // 与上重复
        F("C", "provider", "info", { realUpstream: "https://b.io", proxy: "127.0.0.1:15721", appType: "claude" }),
      ]),
    ],
    allFindings: [],
  };
  const map = buildMap(report);
  assert.deepEqual(map.rows[0].endpoints.sort(), ["127.0.0.1:15721", "a.io", "b.io"].sort());
});

test("buildMap: 代理两跳链路来自带 realUpstream+proxy 的 finding", () => {
  const report = {
    results: [
      result("cc-switch", "CC Switch", true, [
        F("P", "provider", "info", {
          appType: "claude",
          appLabel: "Claude Code",
          proxy: "127.0.0.1:15721",
          realUpstream: "https://ai.example.com",
          proxyOwner: "CC Switch",
          authMode: "PROXY_MANAGED（CC Switch 鉴权占位符）",
        }),
      ]),
    ],
    allFindings: [],
  };
  const chains = buildMap(report).proxyChains;
  assert.equal(chains.length, 1);
  assert.deepEqual(chains[0], {
    via: "claude",
    agentLabel: "Claude Code",
    proxy: "127.0.0.1:15721",
    upstream: "https://ai.example.com",
    owner: "CC Switch",
    authMode: "PROXY_MANAGED（CC Switch 鉴权占位符）",
  });
});

test("formatMap: 含表头、风险标签、代理链路段", () => {
  const report = {
    results: [
      result("claude-code", "Claude Code", true, [
        F("P", "provider", "info", { appType: "claude", proxy: "127.0.0.1:15721", realUpstream: "https://x.io" }),
        F("S", "secret", "high", {}),
      ]),
    ],
    allFindings: [],
  };
  const out = formatMap(buildMap(report));
  assert.ok(out.includes("AgentReveal 配置地图"));
  assert.ok(out.includes("Agent"));
  assert.ok(out.includes("高危"));
  assert.ok(out.includes("代理链路"));
  assert.ok(out.includes("claude") && out.includes("https://x.io"));
});

test("formatMap: 未配置 Agent 显示未配置且计数为 -", () => {
  const report = {
    results: [result("gemini", "Gemini", false, [])],
    allFindings: [],
  };
  const out = formatMap(buildMap(report));
  assert.ok(out.includes("未配置"));
});
