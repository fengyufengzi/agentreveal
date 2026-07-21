import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  backupRestoreFileState,
  createBackup,
  restoreBackupTransaction,
} from "../dist/core/backup/index.js";
import { atomicWriteFile } from "../dist/core/fs-safety.js";

test("backup transaction: 多文件恢复中途失败会回滚已恢复文件", () => {
  const root = mkdtempSync(join(tmpdir(), "agentguard-backup-transaction-"));
  try {
    const cwd = join(root, "project");
    const configDir = join(root, "configs");
    const first = join(configDir, "settings.json");
    const second = join(configDir, "settings.local.json");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    writeFileSync(first, '{"value":"original-first"}\n');
    writeFileSync(second, '{"value":"original-second"}\n');
    const backup = createBackup(cwd, [
      { agent: "claude-code", path: first },
      { agent: "claude-code", path: second },
    ], "synthetic-transaction");
    writeFileSync(first, '{"value":"current-first"}\n');
    writeFileSync(second, '{"value":"current-second"}\n');
    const expected = backupRestoreFileState(backup);
    let writes = 0;

    assert.throws(
      () =>
        restoreBackupTransaction(backup, expected, {
          writeFile(path, content, mode) {
            writes += 1;
            if (writes === 2) throw new Error("synthetic second write failure");
            atomicWriteFile(path, content, mode);
          },
        }),
      /已自动回滚/
    );
    assert.equal(readFileSync(first, "utf8"), '{"value":"current-first"}\n');
    assert.equal(readFileSync(second, "utf8"), '{"value":"current-second"}\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
