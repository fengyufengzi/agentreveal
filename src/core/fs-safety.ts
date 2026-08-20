/** 文件写入安全工具：同目录临时文件 + fsync + rename，避免中途失败留下半文件。 */
import {
  chmodSync,
  closeSync,
  fsyncSync,
  linkSync,
  openSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export function fileMode(path: string): number {
  return statSync(path).mode & 0o777;
}

export function atomicWriteFile(
  path: string,
  content: string | Buffer,
  mode = fileMode(path)
): void {
  const tempPath = join(
    dirname(path),
    `.agentreveal-${process.pid}-${randomUUID()}.tmp`
  );
  let fd: number | undefined;
  try {
    fd = openSync(tempPath, "wx", mode);
    writeFileSync(fd, content);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    chmodSync(tempPath, mode);
    renameSync(tempPath, path);
  } catch (err) {
    if (fd !== undefined) closeSync(fd);
    rmSync(tempPath, { force: true });
    throw err;
  }
}

/**
 * 原子创建新文件且绝不覆盖既有目标。
 *
 * 先在同目录完整写入并 fsync 临时文件，再用硬链接原子发布。目标已存在时
 * linkSync 会以 EEXIST 失败，调用方可安全读取赢家写入的内容。
 */
export function atomicCreateFile(
  path: string,
  content: string | Buffer,
  mode: number
): void {
  const tempPath = join(
    dirname(path),
    `.agentreveal-${process.pid}-${randomUUID()}.tmp`
  );
  let fd: number | undefined;
  try {
    fd = openSync(tempPath, "wx", mode);
    writeFileSync(fd, content);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    chmodSync(tempPath, mode);
    linkSync(tempPath, path);
  } catch (err) {
    if (fd !== undefined) closeSync(fd);
    throw err;
  } finally {
    rmSync(tempPath, { force: true });
  }
}
