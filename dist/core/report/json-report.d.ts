import type { DriftComparison } from "../posture/types.js";
import type { PostureReport } from "../posture/report.js";
import type { ScanReport } from "../scan/index.js";
export interface JsonReportOptions {
    acceptedTaskCount?: number;
    ignoredFindingCount?: number;
    posture?: PostureReport;
    drift?: DriftComparison;
}
export declare function buildJsonReport(report: ScanReport, options?: JsonReportOptions): {
    drift?: DriftComparison | undefined;
    posture?: PostureReport | undefined;
    summary: {
        configuredAgents: number;
        findingCount: number;
        taskCount: number;
        immediateTaskCount: number;
        informationalTaskCount: number;
        acceptedTaskCount: number;
        ignoredFindingCount: number;
    };
    tasks: import("../action/index.js").ActionTask[];
    topTasks: import("../action/index.js").ActionTask[];
    acceptedTaskCount: number;
    ignoredFindingCount: number;
    results: import("../scan/index.js").AgentScanResult[];
    allFindings: import("../../adapters/types.js").RiskFinding[];
    correlations: import("../../adapters/types.js").RiskFinding[];
} & {
    schemaVersion: typeof import("../output-contract.js").OUTPUT_SCHEMA_VERSION;
    command: "report.json";
};
