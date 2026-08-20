import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildDesktopOverview,
  exportDesktopReport,
  triageDesktopFixture,
} from "../dist/desktop/service.js";
import { buildFirstRunSummary } from "../dist/core/first-run/index.js";
import { formatFirstRun } from "../dist/core/report/first-run-format.js";
import { renderHtmlReport } from "../dist/core/report/html-report.js";
import { buildJsonReport } from "../dist/core/report/json-report.js";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);

function finding(id, severity, evidence) {
  return { id, category: "synthetic", severity, title: id, evidence };
}

function result(agent, displayName, findings) {
  return {
    agent,
    displayName,
    discovery: { agent, displayName, configFound: true },
    findings,
  };
}

test("Q2 输出一致性：CLI、JSON、HTML 与 Desktop 共用 Top 3、taskId 和完整 requirements", () => {
  const results = [
    result("gemini", "Gemini CLI", [
      finding("GEMINI_MCP_TRUST_BYPASS", "high", { server: "docs" }),
      finding("GEMINI_MCP_STDIO", "info", {
        server: "docs",
        command: "synthetic-mcp",
      }),
      finding("GEMINI_MCP_SECRET_ENV", "medium", {
        server: "docs",
        envKeys: ["API_TOKEN"],
      }),
    ]),
    result("openclaw", "OpenClaw", [
      finding("OPENCLAW_GATEWAY_EXPOSED_BIND", "high", {
        bind: "0.0.0.0",
        port: 18789,
      }),
      finding("OPENCLAW_TAILSCALE_EXPOSURE", "high", { mode: "funnel" }),
    ]),
    result("workspace", "当前项目", [
      finding("PROJECT_SENSITIVE_FILE", "high", {
        path: ".env",
        kind: "env-file",
      }),
    ]),
  ];
  const report = {
    results,
    allFindings: results.flatMap((entry) => entry.findings),
    correlations: [],
  };

  const cli = buildFirstRunSummary(report, { platform: "darwin" });
  const json = buildJsonReport(report);
  const desktop = buildDesktopOverview(
    "/Users/example/project",
    triageDesktopFixture(report),
    "2026-08-17T00:00:00.000Z"
  );
  const terminal = formatFirstRun(cli);
  const html = renderHtmlReport(report, {
    generatedAt: new Date("2026-08-17T00:00:00.000Z"),
  });

  const expectedTaskIds = cli.tasks.map((task) => task.taskId);
  const expectedTopIds = cli.topTasks.map((task) => task.taskId);
  assert.equal(expectedTaskIds.length, 3);
  assert.equal(expectedTopIds.length, 3);
  assert.deepEqual(json.tasks.map((task) => task.taskId), expectedTaskIds);
  assert.deepEqual(json.topTasks.map((task) => task.taskId), expectedTopIds);
  assert.deepEqual(desktop.tasks.map((task) => task.taskId), expectedTaskIds);
  assert.deepEqual(desktop.topTasks.map((task) => task.taskId), expectedTopIds);

  const expectedRequirements = cli.tasks.map((task) =>
    task.requirements.map((requirement) => requirement.ruleId)
  );
  assert.deepEqual(
    json.tasks.map((task) => task.requirements.map((requirement) => requirement.ruleId)),
    expectedRequirements
  );
  assert.deepEqual(
    desktop.tasks.map((task) => task.requirements.map((requirement) => requirement.ruleId)),
    expectedRequirements
  );

  for (const task of cli.topTasks) {
    assert.match(terminal, new RegExp(task.taskId));
    assert.ok(html.includes(`id="${task.taskId}"`));
    for (const requirement of task.requirements) {
      assert.ok(html.includes(requirement.ruleId));
    }
  }

  assert.equal(json.schemaVersion, 1);
  assert.equal(json.command, "report.json");
  assert.equal(json.summary.taskCount, 3);
  assert.ok(!JSON.stringify({ json, desktop, terminal, html }).includes("raw-secret"));
});

test("真实 CLI 与 Desktop JSON 导出都包含统一行动任务和 Top 3", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-output-parity-"));
  const outputPath = join(root, "desktop-report.json");
  const previous = {
    HOME: process.env.HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    AGENTREVEAL_ACCEPTANCE_PATH: process.env.AGENTREVEAL_ACCEPTANCE_PATH,
    AGENTREVEAL_TASK_SNAPSHOT_PATH: process.env.AGENTREVEAL_TASK_SNAPSHOT_PATH,
    AGENTREVEAL_POSTURE_SNAPSHOT_PATH: process.env.AGENTREVEAL_POSTURE_SNAPSHOT_PATH,
  };
  try {
    writeFileSync(join(root, ".env"), "SYNTHETIC_VALUE=fixture\n");
    const env = {
      ...process.env,
      HOME: root,
      XDG_CONFIG_HOME: join(root, "xdg"),
      AGENTREVEAL_ACCEPTANCE_PATH: join(root, "acceptances.json"),
      AGENTREVEAL_TASK_SNAPSHOT_PATH: join(root, "task-snapshot.json"),
      AGENTREVEAL_POSTURE_SNAPSHOT_PATH: join(root, "posture-snapshot.json"),
    };
    const cli = spawnSync(
      process.execPath,
      [join(repoRoot, "bin", "agentreveal"), "report", "--format", "json", "--output", "-"],
      { cwd: root, env, encoding: "utf8" }
    );
    assert.equal(cli.status, 2, cli.stderr);
    const cliReport = JSON.parse(cli.stdout);

    Object.assign(process.env, env);
    await exportDesktopReport({
      projectPath: root,
      outputPath,
      format: "json",
    });
    const desktopReport = JSON.parse(readFileSync(outputPath, "utf8"));

    assert.equal(cliReport.tasks.length, 1);
    assert.equal(cliReport.topTasks.length, 1);
    assert.equal(desktopReport.tasks.length, 1);
    assert.equal(desktopReport.topTasks.length, 1);
    assert.equal(desktopReport.tasks[0].taskId, cliReport.tasks[0].taskId);
    assert.deepEqual(
      desktopReport.tasks[0].requirements,
      cliReport.tasks[0].requirements
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
