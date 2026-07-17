import type { ActionTask } from "../action/index.js";
export interface TaskRuleSnapshot {
    ruleId: string;
    priority: ActionTask["priority"];
    severity: ActionTask["severity"];
    disposition: ActionTask["disposition"];
    fixMode: ActionTask["requirements"][number]["fixMode"];
}
export interface TaskSnapshot {
    taskId: string;
    family: string;
    source: ActionTask["source"];
    agent?: string;
    rules: TaskRuleSnapshot[];
}
export interface TaskSnapshotStoreOptions {
    path?: string;
    cwd?: string;
    scopeId?: string;
    now?: () => Date;
}
export declare function defaultTaskSnapshotPath(home?: string): string;
export declare class TaskSnapshotStore {
    readonly path: string;
    readonly scopeId: string;
    private readonly now;
    constructor(options?: TaskSnapshotStoreOptions);
    private read;
    private write;
    get(taskId: string): TaskSnapshot | undefined;
    capture(tasks: readonly ActionTask[]): void;
}
