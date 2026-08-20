/**
 * baseline dry-run 测试。
 * 从 dist/ 导入。运行前需 npm run build。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBaselinePlan } from "../dist/core/baseline/index.js";
import { applyBaseline } from "../dist/core/apply/index.js";
import { restoreLatestBaselineBackup } from "../dist/core/apply/index.js";
import { formatBaseline } from "../dist/core/report/baseline-format.js";

async function withOpenCode(config, fn) {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-baseline-"));
  try {
    const home = join(root, "home");
    const cwd = join(root, "project");
    const xdg = join(root, "xdg");
    const ocDir = join(xdg, "opencode");
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    mkdirSync(ocDir, { recursive: true });
    const configPath = join(ocDir, "opencode.json");
    const original = JSON.stringify(config, null, 2);
    writeFileSync(configPath, original);

    return await fn({
      ctx: { home, cwd, env: { XDG_CONFIG_HOME: xdg } },
      configPath,
      original,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("baseline balanced: 生成 OpenCode dry-run 计划且不写文件", async () => {
  await withOpenCode(
    {
      permission: { bash: "allow", edit: "allow" },
      share: "auto",
      autoupdate: true,
    },
    async ({ ctx, configPath, original }) => {
      const plan = await buildBaselinePlan("balanced", ctx);
      assert.equal(plan.dryRun, true);
      assert.equal(plan.files.length, 1);

      const paths = plan.files[0].changes.map((c) => c.path).sort();
      assert.deepEqual(paths, ["autoupdate", "permission.bash", "share"]);
      assert.ok(plan.files[0].diff.includes("+++"));
      assert.equal(readFileSync(configPath, "utf8"), original);
    }
  );
});

test("baseline: dry-run 输出不包含未变更的明文密钥", async () => {
  await withOpenCode(
    {
      provider: {
        relay: { options: { apiKey: "sk-raw-SECRET-SHOULD-NOT-LEAK" } },
      },
      permission: { bash: "allow" },
    },
    async ({ ctx }) => {
      const plan = await buildBaselinePlan("balanced", ctx);
      assert.ok(!JSON.stringify(plan).includes("sk-raw-SECRET-SHOULD-NOT-LEAK"));
    }
  );
});

test("baseline safe: 顶层 permission=allow 转为分项 ask", async () => {
  await withOpenCode(
    {
      permission: "allow",
      share: "auto",
    },
    async ({ ctx }) => {
      const plan = await buildBaselinePlan("safe", ctx);
      const permission = plan.files[0].changes.find((c) => c.path === "permission");
      assert.deepEqual(permission.to, {
        bash: "ask",
        edit: "ask",
        webfetch: "ask",
      });
      assert.equal(
        plan.files[0].changes.find((c) => c.path === "share").to,
        "disabled"
      );

      const text = formatBaseline(plan);
      assert.ok(text.includes("dry-run"));
      assert.ok(text.includes("OpenCode"));
    }
  );
});

test("baseline: 未发现 OpenCode 时返回 warning", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-baseline-empty-"));
  try {
    const plan = await buildBaselinePlan("balanced", {
      home: root,
      cwd: root,
      env: {},
    });
    assert.equal(plan.files.length, 0);
    assert.ok(plan.warnings[0].includes("未发现 OpenCode"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —— Claude Code / Gemini 多 Agent 收敛 —— //

/**
 * 通用夹具：可写入 opencode / claude / gemini 三类配置。
 * files: { opencode?, claudeSettings?, claudeLocal?, geminiSettings?, geminiEnv? }
 * 每个值传对象则 JSON.stringify；geminiEnv 传字符串。
 */
async function withAgents(files, fn) {
  const root = mkdtempSync(join(tmpdir(), "agentreveal-baseline-multi-"));
  try {
    const home = join(root, "home");
    const cwd = join(root, "project");
    const xdg = join(root, "xdg");
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });

    const paths = {};
    if (files.opencode !== undefined) {
      const dir = join(xdg, "opencode");
      mkdirSync(dir, { recursive: true });
      paths.opencode = join(dir, "opencode.json");
      writeFileSync(paths.opencode, JSON.stringify(files.opencode, null, 2));
    }
    if (files.claudeSettings !== undefined || files.claudeLocal !== undefined) {
      const dir = join(home, ".claude");
      mkdirSync(dir, { recursive: true });
      if (files.claudeSettings !== undefined) {
        paths.claudeSettings = join(dir, "settings.json");
        writeFileSync(paths.claudeSettings, JSON.stringify(files.claudeSettings, null, 2));
      }
      if (files.claudeLocal !== undefined) {
        paths.claudeLocal = join(dir, "settings.local.json");
        writeFileSync(paths.claudeLocal, JSON.stringify(files.claudeLocal, null, 2));
      }
    }
    if (files.geminiSettings !== undefined || files.geminiEnv !== undefined) {
      // Gemini adapter 在设置了 XDG_CONFIG_HOME 时读 xdg/gemini。
      const dir = join(xdg, "gemini");
      mkdirSync(dir, { recursive: true });
      paths.geminiSettings = join(dir, "settings.json");
      writeFileSync(
        paths.geminiSettings,
        JSON.stringify(files.geminiSettings ?? {}, null, 2)
      );
      if (files.geminiEnv !== undefined) {
        writeFileSync(join(dir, ".env"), files.geminiEnv);
      }
    }
    if (files.openclaw !== undefined) {
      // OpenClaw discover 读 ctx.home + ".openclaw"，不涉及 XDG。
      const dir = join(home, ".openclaw");
      mkdirSync(dir, { recursive: true });
      paths.openclaw = join(dir, "openclaw.json");
      writeFileSync(paths.openclaw, JSON.stringify(files.openclaw, null, 2));
    }

    const ctx = { home, cwd, env: { XDG_CONFIG_HOME: xdg } };
    return await fn({ ctx, paths });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const fileFor = (plan, agent) => plan.files.find((f) => f.agent === agent);

test("baseline: Claude bypassPermissions → default，不写文件", async () => {
  await withAgents(
    { claudeSettings: { permissions: { defaultMode: "bypassPermissions" } } },
    async ({ ctx, paths }) => {
      const plan = await buildBaselinePlan("balanced", ctx);
      const f = fileFor(plan, "claude-code");
      assert.ok(f);
      const c = f.changes.find((c) => c.path === "permissions.defaultMode");
      assert.equal(c.from, "bypassPermissions");
      assert.equal(c.to, "default");
      // dry-run 不写文件
      assert.ok(
        readFileSync(paths.claudeSettings, "utf8").includes("bypassPermissions")
      );
    }
  );
});

test("baseline: Claude 危险 allow 仅移除无约束项，保留带约束项", async () => {
  await withAgents(
    { claudeSettings: { permissions: { allow: ["Bash", "Bash(git status:*)", "Read"] } } },
    async ({ ctx }) => {
      const plan = await buildBaselinePlan("safe", ctx);
      const c = fileFor(plan, "claude-code").changes.find(
        (c) => c.path === "permissions.allow"
      );
      assert.deepEqual(c.to, ["Bash(git status:*)", "Read"]);
      assert.ok(!c.to.includes("Bash"));
    }
  );
});

test("baseline: Claude settings.local.json 也被收敛（独立 edit）", async () => {
  await withAgents(
    { claudeLocal: { enableAllProjectMcpServers: true } },
    async ({ ctx, paths }) => {
      const plan = await buildBaselinePlan("balanced", ctx);
      const f = plan.files.find(
        (f) => f.agent === "claude-code" && f.configPath === paths.claudeLocal
      );
      assert.ok(f);
      const c = f.changes.find((c) => c.path === "enableAllProjectMcpServers");
      assert.equal(c.to, false);
    }
  );
});

test("baseline: Gemini MCP trust=true → false", async () => {
  await withAgents(
    { geminiSettings: { mcpServers: { x: { command: "node x.js", trust: true } } } },
    async ({ ctx }) => {
      const plan = await buildBaselinePlan("balanced", ctx);
      const c = fileFor(plan, "gemini").changes.find(
        (c) => c.path === "mcpServers.x.trust"
      );
      assert.equal(c.from, true);
      assert.equal(c.to, false);
    }
  );
});

test("baseline: 多 Agent 同时收敛，formatBaseline 含三个展示名", async () => {
  await withAgents(
    {
      opencode: { permission: { bash: "allow" } },
      claudeSettings: { permissions: { defaultMode: "bypassPermissions" } },
      geminiSettings: { mcpServers: { x: { trust: true } } },
    },
    async ({ ctx }) => {
      const plan = await buildBaselinePlan("balanced", ctx);
      const agents = plan.files.map((f) => f.agent).sort();
      assert.deepEqual(agents, ["claude-code", "gemini", "opencode"]);
      const text = formatBaseline(plan);
      assert.ok(text.includes("OpenCode"));
      assert.ok(text.includes("Claude Code"));
      assert.ok(text.includes("Gemini CLI"));
    }
  );
});

test("apply: Claude bypassPermissions 写入并可 restore 回滚", async () => {
  await withAgents(
    { claudeSettings: { permissions: { defaultMode: "bypassPermissions" } } },
    async ({ ctx, paths }) => {
      const result = await applyBaseline("balanced", ctx);
      assert.ok(result.backupId);
      const written = JSON.parse(readFileSync(paths.claudeSettings, "utf8"));
      assert.equal(written.permissions.defaultMode, "default");

      restoreLatestBaselineBackup(ctx.cwd);
      const restored = JSON.parse(readFileSync(paths.claudeSettings, "utf8"));
      assert.equal(restored.permissions.defaultMode, "bypassPermissions");
    }
  );
});

test("baseline: 干净的 Claude/Gemini 配置不产生 change", async () => {
  await withAgents(
    {
      claudeSettings: { permissions: { defaultMode: "default", allow: ["Read"] } },
      geminiSettings: { mcpServers: { x: { command: "node x.js" } } },
    },
    async ({ ctx }) => {
      const plan = await buildBaselinePlan("balanced", ctx);
      assert.equal(fileFor(plan, "claude-code"), undefined);
      assert.equal(fileFor(plan, "gemini"), undefined);
    }
  );
});

test("baseline: 隐私红线 — 明文密钥不进 plan/apply 输出", async () => {
  await withAgents(
    {
      claudeSettings: {
        permissions: { defaultMode: "bypassPermissions" },
        env: { ANTHROPIC_AUTH_TOKEN: "sk-claude-SECRET-LEAK" },
      },
      geminiSettings: { mcpServers: { x: { trust: true } } },
      geminiEnv: "GEMINI_API_KEY=gemini-SECRET-LEAK",
    },
    async ({ ctx }) => {
      const plan = await buildBaselinePlan("balanced", ctx);
      const dump = JSON.stringify(plan);
      assert.ok(!dump.includes("sk-claude-SECRET-LEAK"));
      assert.ok(!dump.includes("gemini-SECRET-LEAK"));

      const result = await applyBaseline("balanced", ctx);
      const rdump = JSON.stringify(result);
      assert.ok(!rdump.includes("sk-claude-SECRET-LEAK"));
      assert.ok(!rdump.includes("gemini-SECRET-LEAK"));
    }
  );
});

// —— OpenClaw 收敛 —— //

test("baseline: OpenClaw 非 loopback bind → 127.0.0.1", async () => {
  await withAgents(
    { openclaw: { gateway: { bind: "0.0.0.0", port: 8080 } } },
    async ({ ctx, paths }) => {
      const plan = await buildBaselinePlan("balanced", ctx);
      const c = fileFor(plan, "openclaw").changes.find(
        (c) => c.path === "gateway.bind"
      );
      assert.equal(c.from, "0.0.0.0");
      assert.equal(c.to, "127.0.0.1");
      // dry-run 不写文件
      assert.ok(readFileSync(paths.openclaw, "utf8").includes("0.0.0.0"));
    }
  );
});

test("baseline: OpenClaw Tailscale funnel → off", async () => {
  await withAgents(
    { openclaw: { gateway: { bind: "127.0.0.1", tailscale: { mode: "funnel" } } } },
    async ({ ctx }) => {
      const plan = await buildBaselinePlan("balanced", ctx);
      const c = fileFor(plan, "openclaw").changes.find(
        (c) => c.path === "gateway.tailscale.mode"
      );
      assert.equal(c.from, "funnel");
      assert.equal(c.to, "off");
    }
  );
});

test("apply: OpenClaw bind 写入并可 restore 回滚", async () => {
  await withAgents(
    { openclaw: { gateway: { bind: "0.0.0.0" } } },
    async ({ ctx, paths }) => {
      const result = await applyBaseline("balanced", ctx);
      assert.ok(result.backupId);
      const written = JSON.parse(readFileSync(paths.openclaw, "utf8"));
      assert.equal(written.gateway.bind, "127.0.0.1");

      restoreLatestBaselineBackup(ctx.cwd);
      const restored = JSON.parse(readFileSync(paths.openclaw, "utf8"));
      assert.equal(restored.gateway.bind, "0.0.0.0");
    }
  );
});

test("baseline: OpenClaw 隐私红线 — gateway.auth.token 不进 plan/apply 输出", async () => {
  await withAgents(
    {
      openclaw: {
        gateway: { bind: "0.0.0.0", auth: { token: "oc-SECRET-LEAK" } },
      },
    },
    async ({ ctx }) => {
      const plan = await buildBaselinePlan("balanced", ctx);
      assert.ok(!JSON.stringify(plan).includes("oc-SECRET-LEAK"));

      const result = await applyBaseline("balanced", ctx);
      assert.ok(!JSON.stringify(result).includes("oc-SECRET-LEAK"));
    }
  );
});

test("baseline: 干净的 OpenClaw 配置不产生 change", async () => {
  await withAgents(
    { openclaw: { gateway: { bind: "127.0.0.1", tailscale: { mode: "off" } } } },
    async ({ ctx }) => {
      const plan = await buildBaselinePlan("balanced", ctx);
      assert.equal(fileFor(plan, "openclaw"), undefined);
    }
  );
});
