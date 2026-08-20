import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  DSH_COMPATIBILITY,
  inspectForDsh,
  renderDshResult,
  runDshAgentRevealCommand,
  runDshProcess,
} from "../dist/integrations/dsh-adapter.js";
import { PRODUCT_VERSION } from "../dist/version.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const cliPath = join(repoRoot, "bin", "agentreveal");

function processRequest(args, overrides = {}) {
  return {
    executable: process.execPath,
    args,
    cwd: repoRoot,
    env: { ...process.env },
    timeoutMs: 2_000,
    maxOutputBytes: 8 * 1024,
    ...overrides,
  };
}

function clearReport() {
  return {
    schemaVersion: 1,
    command: "integration.scan",
    privacy: {
      localOnly: true,
      uploadsData: false,
      readOnlyScan: true,
      excludesAbsolutePaths: true,
      excludesEndpoints: true,
      excludesEvidence: true,
      excludesTaskIds: true,
      excludesCommands: true,
      excludesUserText: true,
    },
    summary: {
      configuredAgents: 0,
      findingCount: 0,
      actionableTaskCount: 0,
      immediateTaskCount: 0,
      informationalTaskCount: 0,
      acceptedTaskCount: 0,
      ignoredFindingCount: 0,
      omittedActionableTaskCount: 0,
    },
    topRisks: [],
  };
}

function riskReport() {
  const report = clearReport();
  report.summary.configuredAgents = 1;
  report.summary.findingCount = 1;
  report.summary.actionableTaskCount = 1;
  report.summary.immediateTaskCount = 1;
  report.topRisks = [
    {
      source: "agent",
      agent: "opencode",
      category: "secret",
      ruleIds: ["OPENCODE_PLAINTEXT_KEY"],
      priority: "P1",
      severity: "high",
      disposition: "fix",
      message: "检测到需要人工处理的凭据存放或复用风险。",
      requiresHumanAction: true,
      verificationRequired: true,
    },
  ];
  return report;
}

function queuedRunner(results, requests = []) {
  return async (request) => {
    requests.push(request);
    assert.ok(results.length > 0, "收到意外的额外进程调用");
    return results.shift();
  };
}

test("dsh adapter: 固定同包 CLI 与 argv，并接受退出码 0/2", async () => {
  assert.deepEqual(DSH_COMPATIBILITY, {
    packageName: "@deepseek-ai/dsh",
    version: "0.1.0-rc.7",
    node: "^22.19.0 || >=24.0.0",
    profile: "web",
  });
  for (const [exitCode, status, report] of [
    [0, "clear", clearReport()],
    [2, "needs-attention", riskReport()],
  ]) {
    const requests = [];
    const result = await inspectForDsh({
      cwd: "/tmp/agentreveal-safe-project",
      env: { HOME: "/tmp/agentreveal-safe-home", PATH: "/usr/bin:/bin" },
      nodePath: "/fixed/node",
      cliPath: "/fixed/agentreveal",
      cliExists: () => true,
      processRunner: queuedRunner(
        [
          { kind: "completed", exitCode: 0, stdout: `${PRODUCT_VERSION}\n` },
          { kind: "completed", exitCode, stdout: JSON.stringify(report) },
        ],
        requests
      ),
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, status);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests.map(({ executable, args, cwd }) => ({ executable, args, cwd })), [
      {
        executable: "/fixed/node",
        args: ["/fixed/agentreveal", "--version"],
        cwd: "/tmp/agentreveal-safe-project",
      },
      {
        executable: "/fixed/node",
        args: [
          "/fixed/agentreveal",
          "integration",
          "scan",
          "--format",
          "model-json",
        ],
        cwd: "/tmp/agentreveal-safe-project",
      },
    ]);
    assert.equal("shell" in requests[0], false);
    assert.equal(requests[0].maxOutputBytes, 256 * 1024);
  }
});

test("dsh adapter: 真实进程 runner 限制输出、超时、取消并区分缺失 executable", async () => {
  assert.deepEqual(
    await runDshProcess(processRequest(["-e", "process.stdout.write('ok')"])),
    { kind: "completed", exitCode: 0, stdout: "ok" }
  );
  assert.deepEqual(
    await runDshProcess(
      processRequest(["-e", "process.stdout.write('x'.repeat(4096))"], {
        maxOutputBytes: 32,
      })
    ),
    { kind: "output-limit" }
  );
  assert.deepEqual(
    await runDshProcess(
      processRequest(["-e", "setInterval(() => {}, 1000)"], { timeoutMs: 20 })
    ),
    { kind: "timeout" }
  );
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(
    await runDshProcess(processRequest(["-e", "process.exit(0)"], { signal: controller.signal })),
    { kind: "aborted" }
  );
  assert.deepEqual(
    await runDshProcess(
      processRequest([], { executable: join(repoRoot, "missing-node-for-dsh-test") })
    ),
    { kind: "missing" }
  );
});

test("dsh adapter: 版本、进程和输出失败全部安全归类", async () => {
  const cases = [
    {
      name: "missing file",
      options: { cliExists: () => false },
      reason: "cli-missing",
    },
    {
      name: "missing process",
      results: [{ kind: "missing" }],
      reason: "cli-missing",
    },
    {
      name: "version mismatch",
      results: [{ kind: "completed", exitCode: 0, stdout: "0.0.0\n" }],
      reason: "version-mismatch",
    },
    {
      name: "timeout",
      results: [{ kind: "timeout" }],
      reason: "timeout",
    },
    {
      name: "aborted",
      results: [{ kind: "aborted" }],
      reason: "aborted",
    },
    {
      name: "scan output limit",
      results: [
        { kind: "completed", exitCode: 0, stdout: `${PRODUCT_VERSION}\n` },
        { kind: "output-limit" },
      ],
      reason: "scan-failed",
    },
    {
      name: "scan exit one",
      results: [
        { kind: "completed", exitCode: 0, stdout: `${PRODUCT_VERSION}\n` },
        { kind: "completed", exitCode: 1, stdout: "{}" },
      ],
      reason: "scan-failed",
    },
    {
      name: "invalid json",
      results: [
        { kind: "completed", exitCode: 0, stdout: `${PRODUCT_VERSION}\n` },
        { kind: "completed", exitCode: 0, stdout: "not-json" },
      ],
      reason: "invalid-output",
    },
  ];

  for (const entry of cases) {
    const result = await inspectForDsh({
      cliPath: "/fixed/agentreveal",
      cliExists: () => true,
      processRunner: entry.results
        ? queuedRunner(structuredClone(entry.results))
        : undefined,
      ...entry.options,
    });
    assert.deepEqual(result, { ok: false, reason: entry.reason }, entry.name);
  }
});

test("dsh adapter: 拒绝来自子进程的 additive 或动态内容", async () => {
  for (const mutate of [
    (report) => {
      report.path = "/Users/example/project";
    },
    (report) => {
      report.topRisks[0].message = "private endpoint https://relay.invalid";
    },
  ]) {
    const report = riskReport();
    mutate(report);
    const result = await inspectForDsh({
      cliPath: "/fixed/agentreveal",
      cliExists: () => true,
      processRunner: queuedRunner([
        { kind: "completed", exitCode: 0, stdout: `${PRODUCT_VERSION}\n` },
        { kind: "completed", exitCode: 2, stdout: JSON.stringify(report) },
      ]),
    });
    assert.deepEqual(result, { ok: false, reason: "invalid-output" });
  }
});

test("dsh adapter: renderer 不透传模型相邻输出中的动态 message", () => {
  const report = riskReport();
  report.topRisks[0].message =
    "SHOULD_NOT_RENDER /Users/example/project https://relay.invalid";
  const result = renderDshResult({
    ok: true,
    status: "needs-attention",
    report,
  });
  assert.equal(result.kind, "success");
  assert.match(result.text, /OpenCode · 凭据 · OPENCODE_PLAINTEXT_KEY/);
  assert.doesNotMatch(result.text, /SHOULD_NOT_RENDER|Users\/example|relay\.invalid/);
});

test("dsh adapter: slash command 不接受参数", async () => {
  assert.deepEqual(
    await runDshAgentRevealCommand({ rawInput: "--json" }),
    {
      kind: "error",
      text: "用法：/agentreveal（当前只支持无参数的本地只读检查）。",
    }
  );
});

test("dsh adapter: 在隔离 HOME/PATH 中真实运行同包 CLI 且不写任务快照", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-dsh-adapter-"));
  try {
    const home = join(root, "home");
    const project = join(root, "project");
    const xdg = join(root, "xdg");
    mkdirSync(join(xdg, "opencode"), { recursive: true });
    mkdirSync(home, { recursive: true });
    mkdirSync(project, { recursive: true });
    writeFileSync(
      join(xdg, "opencode", "opencode.json"),
      JSON.stringify({ permission: { bash: "ask", edit: "ask" } })
    );
    const taskSnapshotPath = join(root, "must-not-exist", "tasks.json");
    const result = await inspectForDsh({
      cliPath,
      cwd: project,
      env: {
        HOME: home,
        PATH: "/usr/bin:/bin",
        XDG_CONFIG_HOME: xdg,
        AGENTREVEAL_ACCEPTANCE_PATH: join(root, "acceptances.json"),
        AGENTREVEAL_TASK_SNAPSHOT_PATH: taskSnapshotPath,
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, "clear");
    assert.equal(result.report.summary.configuredAgents, 1);
    assert.equal(existsSync(taskSnapshotPath), false);
    const rendered = renderDshResult(result).text;
    assert.doesNotMatch(rendered, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
