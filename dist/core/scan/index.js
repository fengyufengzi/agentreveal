import { adapters } from "../../adapters/index.js";
import { loadAgentRevealConfig } from "../config/index.js";
import { buildContext } from "../discovery/index.js";
import { correlate } from "../correlate/index.js";
import { scanSensitiveFiles } from "../sensitive/index.js";
import { enrichFinding } from "../action/index.js";
import { buildParseFailureFinding } from "../parse-failure.js";
/**
 * 运行全部 adapter：discover → deepScan。
 * 未实现 deepScan 或未发现配置的 adapter 产出空风险列表。
 */
export async function scanAll(ctx = buildContext()) {
    const agentGuardConfig = loadAgentRevealConfig(ctx.cwd);
    const scanCtx = {
        ...ctx,
        providerPolicy: {
            trustedEndpoints: [
                ...(agentGuardConfig.providerPolicy.trustedEndpoints ?? []),
                ...(ctx.providerPolicy?.trustedEndpoints ?? []),
            ],
            internalEndpoints: [
                ...(agentGuardConfig.providerPolicy.internalEndpoints ?? []),
                ...(ctx.providerPolicy?.internalEndpoints ?? []),
            ],
        },
    };
    const agentResults = await Promise.all(adapters.map(async (a) => {
        let discovery;
        try {
            discovery = await a.discover(scanCtx);
        }
        catch {
            return {
                agent: a.agent,
                displayName: a.displayName,
                discovery: {
                    agent: a.agent,
                    displayName: a.displayName,
                    configFound: false,
                    notes: ["discovery 过程出错，已跳过"],
                },
                findings: [],
            };
        }
        let findings = [];
        if (discovery.configFound && a.deepScan) {
            try {
                findings = await a.deepScan(scanCtx, discovery);
            }
            catch (err) {
                findings = [buildParseFailureFinding({
                        id: "DEEPSCAN_FAILED",
                        displayName: a.displayName,
                        configPath: discovery.configPath,
                        error: err,
                        title: `${a.displayName} 深度扫描失败，已安全跳过`,
                    })];
            }
        }
        findings = findings.map(enrichFinding);
        return {
            agent: a.agent,
            displayName: a.displayName,
            discovery,
            findings,
        };
    }));
    const workspaceResult = {
        agent: "workspace",
        displayName: "当前项目",
        discovery: {
            agent: "workspace",
            displayName: "当前项目",
            configFound: true,
            configPath: ctx.cwd,
            source: "当前工作目录",
            notes: [
                "只检查敏感文件名和相对路径，不读取文件内容",
                ...(agentGuardConfig.configPath
                    ? [`读取 AgentReveal 配置：${agentGuardConfig.configPath}`]
                    : []),
                ...agentGuardConfig.warnings.map((w) => `AgentReveal 配置解析失败：${w}`),
            ],
        },
        findings: scanSensitiveFiles(ctx.cwd).map(enrichFinding),
    };
    const results = [...agentResults, workspaceResult];
    const allFindings = results.flatMap((r) => r.findings);
    const correlations = correlate(agentResults, scanCtx.providerPolicy).map(enrichFinding);
    return { results, allFindings, correlations };
}
//# sourceMappingURL=index.js.map