import type { ScanReport } from "../scan/index.js";
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
}
/** HTML 实体转义（含引号，覆盖属性与文本上下文）。 */
export declare function escapeHtml(input: unknown): string;
/** 生成完整 HTML 报告字符串。 */
export declare function renderHtmlReport(report: ScanReport, opts?: HtmlReportOptions): string;
