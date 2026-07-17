/**
 * backup/apply/restore 测试。
 * 从 dist/ 导入。运行前需 npm run build。
 */
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyBaseline,
  backupOpenCodeConfig,
  restoreBaselineBackup,
  restoreLatestBaselineBackup,
} from "../dist/core/apply/index.js";

async function withOpenCode(config, fn) {
  const root = mkdtempSync(join(tmpdir(), "agentguard-apply-"));
  try {
    const home = join(root, "home");
    const cwd = join(root, "project");
    const xdg = join(root, "xdg");
    const ocDir = join(xdg, "opencode");
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    mkdirSync(ocDir, { recursive: true });
    const configPath = join(ocDir, "opencode.json");
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

    return await fn({
      ctx: { home, cwd, env: { XDG_CONFIG_HOME: xdg } },
      configPath,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("apply: 创建备份后应用 OpenCode baseline，并可恢复", async () => {
  await withOpenCode(
    {
      permission: { bash: "allow", edit: "allow" },
      share: "auto",
    },
    async ({ ctx, configPath }) => {
      const original = readFileSync(configPath, "utf8");
      const result = await applyBaseline("balanced", ctx);

      assert.ok(result.backupId);
      assert.equal(result.files.length, 1);
      const applied = JSON.parse(readFileSync(configPath, "utf8"));
      assert.equal(applied.permission.bash, "ask");
      assert.equal(applied.permission.edit, "allow");
      assert.equal(applied.share, "manual");

      const restored = restoreLatestBaselineBackup(ctx.cwd);
      assert.equal(restored.backupId, result.backupId);
      assert.equal(readFileSync(configPath, "utf8"), original);
    }
  );
});

test("backup: 手动备份 OpenCode 配置", async () => {
  await withOpenCode({ permission: { bash: "ask" } }, async ({ ctx }) => {
    const result = await backupOpenCodeConfig(ctx);
    assert.ok(result.backupId);
    assert.equal(result.files, 1);
    assert.deepEqual(result.warnings, []);
  });
});

test("apply: 无变更时不创建备份", async () => {
  await withOpenCode({ permission: { bash: "ask" } }, async ({ ctx }) => {
    const result = await applyBaseline("balanced", ctx);
    assert.equal(result.backupId, "");
    assert.equal(result.files.length, 0);
  });
});

test("apply: 原子写入和 restore 均保留原配置权限", async () => {
  await withOpenCode(
    { permission: { bash: "allow" } },
    async ({ ctx, configPath }) => {
      chmodSync(configPath, 0o640);
      const result = await applyBaseline("balanced", ctx);
      assert.equal(statSync(configPath).mode & 0o777, 0o640);

      restoreLatestBaselineBackup(ctx.cwd);
      assert.equal(statSync(configPath).mode & 0o777, 0o640);

      const manifestPath = join(
        ctx.cwd,
        ".agentguard",
        "backups",
        result.backupId,
        "manifest.json"
      );
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      assert.equal(statSync(manifestPath).mode & 0o777, 0o600);
      assert.equal(statSync(manifest.files[0].backupPath).mode & 0o777, 0o600);
    }
  );
});

test("restore: 拒绝路径穿越备份 ID", async () => {
  await withOpenCode({ permission: { bash: "ask" } }, async ({ ctx }) => {
    assert.throws(
      () => restoreBaselineBackup(ctx.cwd, "../../outside"),
      /无效的备份 ID/
    );
  });
});

test("restore: 备份内容被篡改时拒绝恢复", async () => {
  await withOpenCode(
    { permission: { bash: "allow" } },
    async ({ ctx }) => {
      const result = await applyBaseline("balanced", ctx);
      const manifestPath = join(
        ctx.cwd,
        ".agentguard",
        "backups",
        result.backupId,
        "manifest.json"
      );
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      writeFileSync(manifest.files[0].backupPath, "tampered\n");
      assert.throws(
        () => restoreBaselineBackup(ctx.cwd, result.backupId),
        /完整性校验失败/
      );
    }
  );
});
