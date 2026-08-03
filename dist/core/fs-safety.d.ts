export declare function fileMode(path: string): number;
export declare function atomicWriteFile(path: string, content: string | Buffer, mode?: number): void;
/**
 * 原子创建新文件且绝不覆盖既有目标。
 *
 * 先在同目录完整写入并 fsync 临时文件，再用硬链接原子发布。目标已存在时
 * linkSync 会以 EEXIST 失败，调用方可安全读取赢家写入的内容。
 */
export declare function atomicCreateFile(path: string, content: string | Buffer, mode: number): void;
