/** 文件写入安全工具：同目录临时文件 + fsync + rename，避免中途失败留下半文件。 */
import { chmodSync, closeSync, fsyncSync, openSync, renameSync, rmSync, statSync, writeFileSync, } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
export function fileMode(path) {
    return statSync(path).mode & 0o777;
}
export function atomicWriteFile(path, content, mode = fileMode(path)) {
    const tempPath = join(dirname(path), `.agentguard-${process.pid}-${randomUUID()}.tmp`);
    let fd;
    try {
        fd = openSync(tempPath, "wx", mode);
        writeFileSync(fd, content);
        fsyncSync(fd);
        closeSync(fd);
        fd = undefined;
        chmodSync(tempPath, mode);
        renameSync(tempPath, path);
    }
    catch (err) {
        if (fd !== undefined)
            closeSync(fd);
        rmSync(tempPath, { force: true });
        throw err;
    }
}
//# sourceMappingURL=fs-safety.js.map