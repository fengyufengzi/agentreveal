/**
 * 单任务验证使用的本地规则快照。
 *
 * 只保存 taskId、规则 ID 和静态处置元数据，不保存 finding title、evidence、路径或端点。
 */
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { projectScopeId } from "../acceptance/index.js";
import { atomicWriteFile } from "../fs-safety.js";
const SNAPSHOT_SCHEMA_VERSION = 1;
export function defaultTaskSnapshotPath(home = homedir()) {
    return join(home, ".agentreveal", "task-snapshots.json");
}
function emptyDocument() {
    return { schemaVersion: SNAPSHOT_SCHEMA_VERSION, scopes: {} };
}
function validateDocument(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("任务快照文件格式无效。");
    }
    const document = value;
    if (document.schemaVersion !== SNAPSHOT_SCHEMA_VERSION ||
        !document.scopes ||
        typeof document.scopes !== "object" ||
        Array.isArray(document.scopes)) {
        throw new Error("任务快照文件版本或结构无效。");
    }
    for (const [scopeId, rawScope] of Object.entries(document.scopes)) {
        if (!/^scope-[a-f0-9]{64}$/.test(scopeId)) {
            throw new Error("任务快照作用域无效。");
        }
        if (!rawScope || typeof rawScope !== "object" || Array.isArray(rawScope)) {
            throw new Error("任务快照作用域结构无效。");
        }
        const scope = rawScope;
        if (typeof scope.capturedAt !== "string" ||
            !Number.isFinite(Date.parse(scope.capturedAt)) ||
            !scope.tasks ||
            typeof scope.tasks !== "object" ||
            Array.isArray(scope.tasks)) {
            throw new Error("任务快照作用域结构无效。");
        }
        for (const [taskId, rawTask] of Object.entries(scope.tasks)) {
            if (!/^task-[A-Za-z0-9_-]{6,128}$/.test(taskId) ||
                !rawTask ||
                typeof rawTask !== "object" ||
                Array.isArray(rawTask)) {
                throw new Error("任务快照条目无效。");
            }
            const task = rawTask;
            if (task.taskId !== taskId ||
                typeof task.family !== "string" ||
                !["agent", "correlation"].includes(task.source) ||
                (task.agent !== undefined && typeof task.agent !== "string") ||
                !Array.isArray(task.rules) ||
                task.rules.some((rule) => !rule ||
                    typeof rule.ruleId !== "string" ||
                    !["P0", "P1", "P2", "P3"].includes(rule.priority) ||
                    !["critical", "high", "medium", "low", "info"].includes(rule.severity) ||
                    !["fix", "review", "cleanup", "observe"].includes(rule.disposition) ||
                    !["baseline", "guided", "manual", "none"].includes(rule.fixMode))) {
                throw new Error("任务快照条目无效。");
            }
        }
    }
    return document;
}
function taskSnapshot(task) {
    return {
        taskId: task.taskId,
        family: task.family,
        source: task.source,
        ...(task.agent ? { agent: task.agent } : {}),
        rules: task.requirements.map((requirement) => ({
            ruleId: requirement.ruleId,
            priority: requirement.priority,
            severity: requirement.severity,
            disposition: requirement.disposition,
            fixMode: requirement.fixMode,
        })),
    };
}
export class TaskSnapshotStore {
    path;
    scopeId;
    now;
    constructor(options = {}) {
        this.path = options.path ?? defaultTaskSnapshotPath();
        this.scopeId = options.scopeId ?? projectScopeId(options.cwd);
        if (!/^scope-[a-f0-9]{64}$/.test(this.scopeId)) {
            throw new Error("无效的项目作用域 ID。");
        }
        this.now = options.now ?? (() => new Date());
    }
    read() {
        if (!existsSync(this.path))
            return emptyDocument();
        try {
            return validateDocument(JSON.parse(readFileSync(this.path, "utf8")));
        }
        catch (error) {
            throw new Error(`无法读取任务快照 ${this.path}：${error instanceof Error ? error.message : String(error)}`);
        }
    }
    write(document) {
        const directory = dirname(this.path);
        const directoryExisted = existsSync(directory);
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        if (!directoryExisted)
            chmodSync(directory, 0o700);
        atomicWriteFile(this.path, JSON.stringify(document, null, 2) + "\n", 0o600);
    }
    get(taskId) {
        return this.read().scopes[this.scopeId]?.tasks[taskId];
    }
    capture(tasks) {
        const now = this.now();
        if (!Number.isFinite(now.getTime()))
            throw new Error("当前时间无效。");
        const document = this.read();
        document.scopes[this.scopeId] = {
            capturedAt: now.toISOString(),
            tasks: Object.fromEntries(tasks.map((task) => [task.taskId, taskSnapshot(task)])),
        };
        this.write(document);
    }
}
//# sourceMappingURL=snapshot.js.map