import type { ScanReport } from "../scan/index.js";
import { type ListedRuleIgnore } from "../config/rule-ignore.js";
import type { PostureReport } from "../posture/report.js";
import type { DriftComparison } from "../posture/types.js";
export interface HtmlAcceptedTask {
    taskId: string;
    reason: string;
    createdAt?: string;
    expiresAt?: string;
}
export interface HtmlReportOptions {
    generatedAt?: Date;
    /** 当前有效的风险接受记录；过期记录应在持久化层过滤。 */
    acceptances?: readonly HtmlAcceptedTask[];
    /** 当前项目有效的低优先级规则忽略；技术证据仍保留在完整报告中。 */
    ruleIgnores?: readonly ListedRuleIgnore[];
    /** 当前运行时有效状态；只用于本机主动生成的报告，不进入可信快照。 */
    posture?: PostureReport;
    /** 与可信状态的比较；事件摘要不包含原始路径或端点。 */
    drift?: DriftComparison;
}
/** HTML 实体转义（含引号，覆盖属性与文本上下文）。 */
export declare function escapeHtml(input: unknown): string;
/** 生成完整 HTML 报告字符串。 */
export declare function renderHtmlReport(report: ScanReport, opts?: HtmlReportOptions): string;
