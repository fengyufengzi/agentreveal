/**
 * scan 终端格式化测试：验证 remediation 渲染为分步「手动整改步骤」。
 * 从 dist/ 导入（编译产物）。运行前需 npm run build。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatScan } from "../dist/core/report/scan-format.js";

function makeReport(findings) {
  const result = {
    agent: "codex",
    displayName: "Codex",
    discovery: { agent: "codex", displayName: "Codex", configFound: true, configPath: "/home/u/.codex/config.toml" },
    findings,
  };
  return { results: [result], allFindings: findings, correlations: [] };
}

test("含 remediation 的 finding 渲染分步手动整改步骤", () => {
  const findings = [
    {
      id: "CODEX_PLAINTEXT_API_KEY",
      category: "secret",
      severity: "high",
      title: "明文密钥",
      recommendation: "改用 OAuth",
      remediation: ["删除 auth.json 中的 key", "chmod 600 ~/.codex/auth.json"],
    },
  ];
  const text = formatScan(makeReport(findings));
  assert.ok(text.includes("手动整改步骤:"));
  assert.ok(text.includes("1) 删除 auth.json 中的 key"));
  assert.ok(text.includes("2) chmod 600 ~/.codex/auth.json"));
});

test("无 remediation 的 finding 不输出手动整改步骤", () => {
  const findings = [
    { id: "X", category: "provider", severity: "info", title: "代理", recommendation: "确认" },
  ];
  const text = formatScan(makeReport(findings));
  assert.ok(!text.includes("手动整改步骤:"));
});
