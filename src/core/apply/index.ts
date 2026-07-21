/** 应用 baseline 计划：并发修改检测、先备份、原子写入、失败自动回滚。 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DiscoveryContext } from "../../adapters/types.js";
import { opencodeAdapter } from "../../adapters/opencode/index.js";
import {
  baselinePlanFingerprint,
  buildBaselineEdits,
  type BaselineFilePlan,
  type BaselineProfile,
} from "../baseline/index.js";
import { createBackup, restoreBackup, latestBackup, readBackup } from "../backup/index.js";
import { buildContext } from "../discovery/index.js";
import { atomicWriteFile, fileMode } from "../fs-safety.js";

export interface ApplyResult {
  profile: BaselineProfile;
  planFingerprint: string;
  backupId: string;
  files: BaselineFilePlan[];
  warnings: string[];
}

export interface ApplyBaselineOptions {
  /** 桌面端等交互入口确认过的 dry-run 指纹；不一致时禁止写入。 */
  expectedPlanFingerprint?: string;
}

export interface ManualBackupResult {
  backupId: string;
  files: number;
  warnings: string[];
}

function renderJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

function contentHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export async function applyBaseline(
  profile: BaselineProfile,
  ctx: DiscoveryContext = buildContext(),
  options: ApplyBaselineOptions = {}
): Promise<ApplyResult> {
  const { edits, warnings } = await buildBaselineEdits(profile, ctx);
  const files = edits.map((edit) => ({
    agent: edit.agent,
    configPath: edit.configPath,
    changes: edit.changes,
    diff: edit.diff,
  }));
  const planFingerprint = baselinePlanFingerprint({ profile, files });
  if (
    options.expectedPlanFingerprint !== undefined &&
    options.expectedPlanFingerprint !== planFingerprint
  ) {
    throw new Error("当前 baseline 计划与已确认预览不一致，请重新生成预览后再应用。");
  }
  if (edits.length === 0) {
    return { profile, planFingerprint, backupId: "", files: [], warnings };
  }

  for (const edit of edits) {
    if (contentHash(edit.configPath) !== edit.sourceHash) {
      throw new Error(
        `配置在 dry-run 计划生成后发生变化，已停止应用：${edit.configPath}`
      );
    }
  }

  const backup = createBackup(
    ctx.cwd,
    edits.map((edit) => ({ agent: edit.agent, path: edit.configPath })),
    `baseline-${profile}`
  );

  try {
    for (const edit of edits) {
      const mode = fileMode(edit.configPath);
      const content = renderJson(edit.nextConfig);
      // 写前和写后都验证 JSON，避免序列化或磁盘异常产生不可解析配置。
      JSON.parse(content);
      atomicWriteFile(edit.configPath, content, mode);
      JSON.parse(readFileSync(edit.configPath, "utf8"));
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    try {
      restoreBackup(backup);
    } catch (rollbackErr) {
      const rollbackReason =
        rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
      throw new Error(
        `应用失败，自动回滚也失败；请保留备份并人工恢复。应用错误：${reason}；回滚错误：${rollbackReason}`
      );
    }
    throw new Error(`应用失败，已从备份自动回滚：${reason}`);
  }

  return {
    profile,
    planFingerprint,
    backupId: backup.id,
    files,
    warnings,
  };
}

export async function backupOpenCodeConfig(
  ctx: DiscoveryContext = buildContext()
): Promise<ManualBackupResult> {
  const found = await opencodeAdapter.discover(ctx);
  if (!found.configFound || !found.configPath) {
    return {
      backupId: "",
      files: 0,
      warnings: ["未发现 OpenCode 配置，无可备份文件。"],
    };
  }

  const backup = createBackup(
    ctx.cwd,
    [{ agent: "opencode", path: found.configPath }],
    "manual-opencode"
  );
  return { backupId: backup.id, files: backup.files.length, warnings: [] };
}

export function restoreLatestBaselineBackup(
  cwd: string
): { backupId: string; files: number } | undefined {
  const backup = latestBackup(cwd);
  if (!backup) return undefined;
  restoreBackup(backup);
  return { backupId: backup.id, files: backup.files.length };
}

export function restoreBaselineBackup(
  cwd: string,
  id: string
): { backupId: string; files: number } {
  const backup = readBackup(cwd, id);
  restoreBackup(backup);
  return { backupId: backup.id, files: backup.files.length };
}
