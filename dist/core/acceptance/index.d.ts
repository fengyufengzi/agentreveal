import type { ActionTask } from "../action/index.js";
declare const ACCEPTANCE_SCHEMA_VERSION: 2;
export type AcceptanceStatus = "active" | "expired" | "revoked" | "legacy";
/** 持久化时只保留任务摘要，不复制 evidence 或完整报告。 */
export interface AcceptanceTaskSummary {
    taskId: string;
    family: string;
    source: ActionTask["source"];
    agent?: string;
    displayName: string;
    disposition: ActionTask["disposition"];
    priority: ActionTask["priority"];
    severity: ActionTask["severity"];
    ruleIds: string[];
    /** 旧 v2 记录可能没有；新记录保存每条规则的完整处置摘要。 */
    rules?: AcceptanceRuleSummary[];
    /** 仅兼容早期 v2；新记录不保存可能含内部端点的动态标题。 */
    titles: string[];
}
export interface AcceptanceRuleSummary {
    ruleId: string;
    disposition: ActionTask["disposition"];
    priority: ActionTask["priority"];
    severity: ActionTask["severity"];
    fixMode: ActionTask["requirements"][number]["fixMode"];
    acceptWhen?: string;
}
interface AcceptanceRecordBase {
    taskId: string;
    reason: string;
    createdAt: string;
    expiresAt?: string;
    revokedAt?: string;
    task: AcceptanceTaskSummary;
}
export interface AcceptanceRecord extends AcceptanceRecordBase {
    scopeId: string;
}
export interface LegacyAcceptanceRecord extends AcceptanceRecordBase {
    scopeId?: undefined;
}
export type ListedAcceptance = (AcceptanceRecord & {
    status: Exclude<AcceptanceStatus, "legacy">;
}) | (LegacyAcceptanceRecord & {
    status: "legacy";
});
export interface AcceptanceDocument {
    schemaVersion: typeof ACCEPTANCE_SCHEMA_VERSION;
    /** `${scopeId}:${taskId}` 是主键；数组保留该作用域内的全部接受历史。 */
    acceptances: Record<string, AcceptanceRecord[]>;
    /** v1 记录没有可信作用域，只保留审计，不参与匹配。 */
    legacyAcceptances: Record<string, LegacyAcceptanceRecord[]>;
}
export interface AcceptanceStoreOptions {
    /** 默认 ~/.agentguard/acceptances.json；测试和嵌入场景可注入。 */
    path?: string;
    /** 默认 process.cwd()；仅用于计算不可逆的当前项目 scopeId。 */
    cwd?: string;
    /** 测试或嵌入场景可直接注入已验证的 scopeId。 */
    scopeId?: string;
    /** 注入时钟，保证过期逻辑可重复测试。 */
    now?: () => Date;
}
export interface AcceptOptions {
    expiresAt?: string | Date;
}
export interface ListAcceptanceOptions {
    /** 默认返回当前作用域完整历史；设为 true 时只返回当前有效记录。 */
    activeOnly?: boolean;
    /** 审计工具可查看其它作用域；默认只显示当前项目。 */
    allScopes?: boolean;
    /** 显示无作用域且永不生效的 v1 历史。 */
    includeLegacy?: boolean;
}
export declare function defaultAcceptancePath(home?: string): string;
export declare function canonicalProjectPath(cwd?: string): string;
export declare function projectScopeId(cwd?: string): string;
export declare class AcceptanceStore {
    readonly path: string;
    readonly scopeId: string;
    private readonly now;
    constructor(options?: AcceptanceStoreOptions);
    private currentDate;
    private read;
    private write;
    /** 新增当前项目的一次接受事件；其它项目和旧版记录不参与重复判断。 */
    accept(task: ActionTask, reason: string, options?: AcceptOptions): AcceptanceRecord & {
        status: "active";
    };
    /** 默认返回当前项目历史；legacy 只在显式请求时展示且永不生效。 */
    list(options?: ListAcceptanceOptions): ListedAcceptance[];
    /** 当前项目是否存在未撤销且未过期的接受记录。 */
    isAccepted(taskId: string): boolean;
    /** 撤销当前项目最近一条尚未明确撤销的记录，从不删除历史。 */
    revoke(taskId: string): AcceptanceRecord & {
        status: "revoked";
    };
}
export {};
