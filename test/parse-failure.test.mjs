import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { claudeCodeAdapter } from "../dist/adapters/claude-code/index.js";
import { codexAdapter } from "../dist/adapters/codex/index.js";
import { ccSwitchAdapter } from "../dist/adapters/cc-switch/index.js";
import { opencodeAdapter } from "../dist/adapters/opencode/index.js";
import { geminiAdapter } from "../dist/adapters/gemini/index.js";
import { openclawAdapter } from "../dist/adapters/openclaw/index.js";
import {
  buildParseFailureFinding,
  describeParseFailure,
} from "../dist/core/parse-failure.js";
import { loadAgentGuardConfig } from "../dist/core/config/index.js";
import { buildActionPlan, buildActionTasks } from "../dist/core/action/index.js";
import { formatScan } from "../dist/core/report/scan-format.js";
import { renderHtmlReport } from "../dist/core/report/html-report.js";

const RAW_SECRET = "SUPER_SECRET_STACK_TOKEN_7429";

function reportFor(agent, displayName, configPath, finding) {
  const result = {
    agent,
    displayName,
    discovery: { agent, displayName, configFound: true, configPath },
    findings: [finding],
  };
  return { results: [result], allFindings: [finding], correlations: [] };
}

test("安全解析失败只输出文件、固定原因和已跳过状态", () => {
  const path = "/Users/example/.codex/config.toml";
  const error = new SyntaxError(`Unexpected ${RAW_SECRET}\n    at /private/internal.ts:42:9`);
  const finding = buildParseFailureFinding({
    id: "CODEX_PARSE_FAILED",
    displayName: "Codex",
    configPath: path,
    error,
    format: "TOML",
  });

  assert.deepEqual(finding.evidence, {
    path,
    reason: "TOML 格式无效",
    status: "已安全跳过",
  });
  assert.match(finding.title, /已安全跳过/);

  const report = reportFor("codex", "Codex", path, finding);
  const outputs = [JSON.stringify(finding), formatScan(report), renderHtmlReport(report)];
  for (const output of outputs) {
    assert.ok(output.includes(path));
    assert.ok(output.includes("已安全跳过"));
    assert.ok(!output.includes(RAW_SECRET));
    assert.ok(!output.includes("internal.ts"));
    assert.ok(!output.includes("SyntaxError"));
  }
});

test("解析失败任务身份只依赖配置文件，不随底层错误文本漂移", () => {
  const path = "/Users/example/.gemini/settings.json";
  const makeTaskId = (message) => {
    const finding = buildParseFailureFinding({
      id: "GEMINI_PARSE_FAILED",
      displayName: "Gemini CLI",
      configPath: path,
      error: new SyntaxError(message),
      format: "JSON",
    });
    return buildActionTasks(
      buildActionPlan(reportFor("gemini", "Gemini CLI", path, finding))
    )[0].taskId;
  };

  assert.equal(makeTaskId("first raw error"), makeTaskId("different raw error"));
});

test("六类 Agent 的损坏配置统一降级，且原始内容不进入 finding", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentguard-parse-failure-"));
  try {
    const ctx = { home: root, cwd: root, env: {} };
    const cases = [];

    const claudeDir = join(root, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    const claudePath = join(claudeDir, "settings.json");
    writeFileSync(claudePath, `{ ${RAW_SECRET}`);
    cases.push({
      adapter: claudeCodeAdapter,
      found: { agent: "claude-code", displayName: "Claude Code", configFound: true, configPath: claudeDir },
      id: "CLAUDE_PARSE_FAILED",
      path: claudePath,
    });

    const codexPath = join(root, ".codex", "config.toml");
    mkdirSync(dirname(codexPath), { recursive: true });
    writeFileSync(codexPath, `= ${RAW_SECRET}`);
    cases.push({
      adapter: codexAdapter,
      found: { agent: "codex", displayName: "Codex", configFound: true, configPath: codexPath },
      id: "CODEX_PARSE_FAILED",
      path: codexPath,
    });

    const ccPath = join(root, ".cc-switch", "cc-switch.db");
    mkdirSync(dirname(ccPath), { recursive: true });
    writeFileSync(ccPath, RAW_SECRET);
    cases.push({
      adapter: ccSwitchAdapter,
      found: { agent: "cc-switch", displayName: "CC Switch", configFound: true, configPath: ccPath },
      id: "CCSWITCH_PARSE_FAILED",
      path: ccPath,
    });

    const opencodePath = join(root, ".config", "opencode", "opencode.json");
    mkdirSync(dirname(opencodePath), { recursive: true });
    writeFileSync(opencodePath, `{ ${RAW_SECRET}`);
    cases.push({
      adapter: opencodeAdapter,
      found: { agent: "opencode", displayName: "OpenCode", configFound: true, configPath: opencodePath },
      id: "OPENCODE_PARSE_FAILED",
      path: opencodePath,
    });

    const geminiPath = join(root, ".gemini", "settings.json");
    mkdirSync(dirname(geminiPath), { recursive: true });
    writeFileSync(geminiPath, `{ ${RAW_SECRET}`);
    cases.push({
      adapter: geminiAdapter,
      found: { agent: "gemini", displayName: "Gemini CLI", configFound: true, configPath: geminiPath },
      id: "GEMINI_PARSE_FAILED",
      path: geminiPath,
    });

    const openclawPath = join(root, ".openclaw", "openclaw.json");
    mkdirSync(dirname(openclawPath), { recursive: true });
    writeFileSync(openclawPath, `{ ${RAW_SECRET}`);
    cases.push({
      adapter: openclawAdapter,
      found: { agent: "openclaw", displayName: "OpenClaw", configFound: true, configPath: openclawPath },
      id: "OPENCLAW_PARSE_FAIL",
      path: openclawPath,
    });

    for (const entry of cases) {
      const findings = await entry.adapter.deepScan(ctx, entry.found);
      assert.equal(findings.length, 1, entry.id);
      assert.equal(findings[0].id, entry.id);
      assert.equal(findings[0].evidence.path, entry.path);
      assert.equal(findings[0].evidence.status, "已安全跳过");
      assert.ok(!JSON.stringify(findings).includes(RAW_SECRET), entry.id);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("项目策略配置损坏时使用安全警告，不回显解析器原文", () => {
  const root = mkdtempSync(join(tmpdir(), "agentguard-policy-failure-"));
  try {
    writeFileSync(join(root, ".agentguard.json"), `{ ${RAW_SECRET}`);
    const config = loadAgentGuardConfig(root);
    assert.equal(config.configPath, join(root, ".agentguard.json"));
    assert.deepEqual(config.warnings, ["JSON 格式无效，已安全忽略此项目策略文件"]);
    assert.ok(!JSON.stringify(config).includes(RAW_SECRET));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Codex 主配置损坏时仍检查独立 auth.json，但不回显密钥", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentguard-codex-partial-"));
  try {
    const configPath = join(root, "config.toml");
    writeFileSync(configPath, "not = = valid [[[");
    writeFileSync(
      join(root, "auth.json"),
      JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: RAW_SECRET })
    );
    const findings = await codexAdapter.deepScan(
      { home: root, cwd: root, env: {} },
      { agent: "codex", displayName: "Codex", configFound: true, configPath }
    );
    assert.deepEqual(
      findings.map((finding) => finding.id),
      ["CODEX_PARSE_FAILED", "CODEX_PLAINTEXT_API_KEY"]
    );
    assert.ok(!JSON.stringify(findings).includes(RAW_SECRET));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("权限、缺失和数据库失败映射为固定原因", () => {
  assert.equal(
    describeParseFailure(Object.assign(new Error(RAW_SECRET), { code: "EACCES" }), "/a").reason,
    "当前用户没有读取权限"
  );
  assert.equal(
    describeParseFailure(Object.assign(new Error(RAW_SECRET), { code: "ENOENT" }), "/a").reason,
    "扫描期间配置文件已不存在"
  );
  assert.equal(
    describeParseFailure(new Error(RAW_SECRET), "/a", "SQLite").reason,
    "SQLite 数据库无法读取，可能已损坏或版本不兼容"
  );
});
