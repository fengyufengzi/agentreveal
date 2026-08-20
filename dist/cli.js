/** AgentReveal CLI 入口。骨架阶段：doctor 已接真实 discovery，其余命令为占位。 */
import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { buildContext, discoverAll } from "./core/discovery/index.js";
import { scanAll } from "./core/scan/index.js";
import { buildMap } from "./core/map/index.js";
import { buildBaselinePlan } from "./core/baseline/index.js";
import { applyBaseline, backupOpenCodeConfig, restoreBaselineBackup, restoreLatestBaselineBackup, } from "./core/apply/index.js";
import { formatDoctor } from "./core/report/doctor-format.js";
import { formatFirstRun } from "./core/report/first-run-format.js";
import { formatScan } from "./core/report/scan-format.js";
import { formatMap } from "./core/report/map-format.js";
import { formatBaseline } from "./core/report/baseline-format.js";
import { renderHtmlReport } from "./core/report/html-report.js";
import { buildJsonReport } from "./core/report/json-report.js";
import { buildFirstRunSummary } from "./core/first-run/index.js";
import { withOutputContract } from "./core/output-contract.js";
import { buildActionPlan, buildActionTasks, taskMissingAcceptanceRules, } from "./core/action/index.js";
import { AcceptanceStore } from "./core/acceptance/index.js";
import { applyAcceptances } from "./core/triage/index.js";
import { verifyRiskTask } from "./core/verification/index.js";
import { TaskSnapshotStore } from "./core/verification/snapshot.js";
import { addProviderTrust, listProviderTrust, removeProviderTrust, } from "./core/config/trust.js";
import { activeRuleIgnoresSafely, addRuleIgnore, listRuleIgnores, removeRuleIgnore, ruleIgnoreCandidatesForTask, } from "./core/config/rule-ignore.js";
import { claudeCodeAdapter } from "./adapters/claude-code/index.js";
import { createClaudeCredentialBackup, previewClaudeCredentialRestore, restoreClaudeCredentialBackup, } from "./core/credential-backup/index.js";
import { PostureSnapshotStore, inspectPosture, inspectPostureWithDrift, loadDriftPolicyStates, } from "./core/posture/index.js";
import { formatPosture } from "./core/report/posture-format.js";
import { formatDrift } from "./core/report/drift-format.js";
import { buildRuleFeedback } from "./core/feedback/index.js";
import { buildModelSafeScan } from "./core/integration/model-safe-scan.js";
import { PRODUCT_VERSION } from "./version.js";
const program = new Command();
const invocationArgs = process.argv.slice(2);
const bareJson = invocationArgs.length === 1 && invocationArgs[0] === "--json";
const bareInvocation = invocationArgs.length === 0 || bareJson;
function printJson(command, payload) {
    console.log(JSON.stringify(withOutputContract(command, payload), null, 2));
}
function acceptanceStore() {
    const path = process.env.AGENTREVEAL_ACCEPTANCE_PATH;
    return new AcceptanceStore(path ? { path } : {});
}
function taskSnapshotStore() {
    const path = process.env.AGENTREVEAL_TASK_SNAPSHOT_PATH;
    return new TaskSnapshotStore(path ? { path } : {});
}
function postureSnapshotStore(cwd = process.cwd()) {
    const path = process.env.AGENTREVEAL_POSTURE_SNAPSHOT_PATH;
    const keyPath = process.env.AGENTREVEAL_POSTURE_KEY_PATH;
    const acceptancePath = process.env.AGENTREVEAL_ACCEPTANCE_PATH;
    return new PostureSnapshotStore({
        cwd,
        ...(path ? { path } : {}),
        ...(keyPath ? { keyPath } : {}),
        policyStates: (now) => loadDriftPolicyStates(cwd, {
            ...(acceptancePath ? { acceptancePath } : {}),
            now,
        }),
    });
}
function triageReport(report) {
    const records = acceptanceStore().list({ activeOnly: true });
    return applyAcceptances(report, records, activeRuleIgnoresSafely(process.cwd()));
}
async function currentClaudeConfigDir() {
    const found = await claudeCodeAdapter.discover(buildContext());
    if (!found.configFound || !found.configPath) {
        throw new Error("未发现 Claude Code 配置目录；请确认 ~/.claude 或 CLAUDE_CONFIG_DIR。");
    }
    return found.configPath;
}
program
    .name("agentreveal")
    .description("面向多 Agent、多模型、多 Provider 的 AI Coding Agent 安全配置中心")
    .version(PRODUCT_VERSION)
    .addHelpText("after", "\nBare JSON: agentreveal --json");
program
    .command("doctor")
    .description("体检本机 AI Coding Agent 环境，列出已发现的 Agent 与配置路径")
    .option("--json", "以 JSON 输出，便于自动化")
    .action(async (opts) => {
    const found = await discoverAll();
    if (opts.json) {
        printJson("doctor", { agents: found });
    }
    else {
        console.log(formatDoctor(found));
    }
});
program
    .command("feedback")
    .description("生成最小脱敏规则反馈 JSON；只输出到本机，不自动上传")
    .requiredOption("--rule <ruleId>", "扫描结果中的稳定规则 ID")
    .requiredOption("--judgment <judgment>", "expected | false-positive | unclear")
    .requiredOption("--outcome <outcome>", "not-attempted | resolved | mitigated | still-present | accepted | ignored | abandoned")
    .action((opts) => {
    const feedback = buildRuleFeedback({
        productVersion: PRODUCT_VERSION,
        ruleId: opts.rule,
        judgment: opts.judgment,
        actionOutcome: opts.outcome,
    });
    console.log(JSON.stringify(feedback, null, 2));
});
const hasHighRisk = (report) => [...report.allFindings, ...report.correlations].some((f) => f.severity === "critical" || f.severity === "high");
program.action(async () => {
    if (!bareInvocation) {
        const knownCommand = program.commands.some((command) => command.name() === invocationArgs[0]);
        if (knownCommand)
            return;
        console.error(`未知命令 "${invocationArgs[0]}"。运行 agentreveal --help 查看可用命令。`);
        process.exitCode = 1;
        return;
    }
    const ctx = buildContext();
    const [scanReport, postureState] = await Promise.all([
        scanAll(ctx),
        inspectPostureWithDrift(ctx, postureSnapshotStore(ctx.cwd), {
            tolerateStoreErrors: true,
        }),
    ]);
    const triaged = triageReport(scanReport);
    const summary = buildFirstRunSummary(triaged.activeReport, {
        acceptedTaskCount: triaged.acceptedTasks.length,
        ignoredFindingCount: triaged.ignoredFindings.length,
        posture: postureState.posture,
        drift: postureState.drift,
    });
    taskSnapshotStore().capture(summary.tasks);
    if (bareJson) {
        console.log(JSON.stringify(summary, null, 2));
    }
    else {
        console.log(formatFirstRun(summary));
    }
    if (hasHighRisk(triaged.activeReport))
        process.exitCode = 2;
});
const providerOnly = (report) => ({
    results: report.results.map((r) => ({
        ...r,
        findings: r.findings.filter((f) => f.category === "provider"),
    })),
    allFindings: report.allFindings.filter((f) => f.category === "provider"),
    correlations: report.correlations,
});
function parseProfile(raw) {
    return raw === "safe" || raw === "balanced" ? raw : undefined;
}
program
    .command("scan")
    .description("扫描全部已发现 Agent 的风险（深度解析 Provider / 代理链路 / 密钥）")
    .option("--json", "以 JSON 输出，便于自动化")
    .action(async (opts) => {
    const ctx = buildContext();
    const [scanReport, postureState] = await Promise.all([
        scanAll(ctx),
        inspectPostureWithDrift(ctx, postureSnapshotStore(ctx.cwd), {
            tolerateStoreErrors: true,
        }),
    ]);
    const triaged = triageReport(scanReport);
    const report = triaged.activeReport;
    if (opts.json) {
        printJson("scan", {
            ...report,
            acceptedTaskCount: triaged.acceptedTasks.length,
            ignoredFindingCount: triaged.ignoredFindings.length,
            posture: postureState.posture,
            drift: postureState.drift,
        });
    }
    else {
        console.log(formatScan(report));
        console.log(`\n${formatPosture(postureState.posture)}`);
        console.log(`\n${formatDrift(postureState.drift)}`);
        if (triaged.acceptedTasks.length > 0) {
            console.log(`\n已隐藏 ${triaged.acceptedTasks.length} 个已接受风险任务；运行 agentreveal risk list 查看。`);
        }
        if (triaged.ignoredFindings.length > 0) {
            console.log(`\n已隐藏 ${triaged.ignoredFindings.length} 条项目规则发现；运行 agentreveal ignore list 查看。`);
        }
    }
    // 有高危及以上风险时以非零码退出，便于 CI 集成（含跨 Agent 关联项）。
    if (hasHighRisk(report))
        process.exitCode = 2;
});
const integrationCommand = program
    .command("integration")
    .description("为受控集成生成最小、只读的机器输出");
integrationCommand
    .command("scan")
    .description("扫描并输出不含路径、端点、证据、taskId 或命令的模型安全摘要")
    .option("--format <format>", "输出格式；当前仅支持 model-json", "model-json")
    .action(async (opts) => {
    if (opts.format !== "model-json") {
        throw new Error("integration scan 当前仅支持 --format model-json。");
    }
    const scanReport = await scanAll(buildContext());
    const triaged = triageReport(scanReport);
    const summary = buildModelSafeScan(triaged.activeReport, {
        acceptedTaskCount: triaged.acceptedTasks.length,
        ignoredFindingCount: triaged.ignoredFindings.length,
    });
    console.log(JSON.stringify(summary, null, 2));
    if (hasHighRisk(triaged.activeReport))
        process.exitCode = 2;
});
const driftCommand = program
    .command("drift")
    .description("比较当前有效状态与用户确认的本机可信状态")
    .option("--json", "以 JSON 输出，便于自动化")
    .action(async (opts) => {
    const ctx = buildContext();
    const result = await inspectPostureWithDrift(ctx, postureSnapshotStore(ctx.cwd), { recordObservation: true });
    if (opts.json) {
        printJson("drift", result);
    }
    else {
        console.log(formatPosture(result.posture));
        console.log(`\n${formatDrift(result.drift)}`);
        console.log("\n本次显式 drift 比较已记录最小化观察状态，用于识别恢复和重新出现；未保存原始路径或端点。");
    }
    if (result.drift.activeEventCount > 0)
        process.exitCode = 2;
});
driftCommand
    .command("baseline")
    .description("预览、创建、替换或删除当前项目的本机可信状态")
    .option("--replace", "替换已有可信状态")
    .option("--remove", "删除当前项目的可信状态")
    .option("--confirm", "确认已审核预览并执行写入")
    .option("--json", "以 JSON 输出")
    .action(async (opts) => {
    const json = Boolean(opts.json || driftCommand.opts().json);
    if (opts.replace && opts.remove) {
        throw new Error("--replace 与 --remove 不能同时使用。");
    }
    const ctx = buildContext();
    const store = postureSnapshotStore(ctx.cwd);
    const posture = await inspectPosture(ctx);
    const states = posture.agents.map((entry) => entry.state);
    const preview = store.previewBaseline(states);
    const existing = preview.mutation === "replace";
    if (opts.remove) {
        const removalPreview = {
            mutation: "remove",
            changed: existing,
            previousCapturedAt: preview.previousCapturedAt,
            storageRevision: preview.storageRevision,
            excludesSensitiveContent: true,
        };
        if (!opts.confirm) {
            if (json) {
                printJson("drift.baseline", {
                    applied: false,
                    preview: removalPreview,
                });
            }
            else {
                console.log(existing
                    ? `删除预览：将删除当前项目 ${preview.previousCapturedAt} 的可信状态。`
                    : "删除预览：当前项目没有可信状态。");
                console.log("确认删除：agentreveal drift baseline --remove --confirm");
            }
            process.exitCode = 1;
            return;
        }
        const result = store.removeBaselineConfirmed(preview.storageRevision);
        if (json) {
            printJson("drift.baseline", { applied: true, result });
        }
        else {
            console.log(result.changed
                ? "当前项目的可信状态已删除。"
                : "当前项目没有可删除的可信状态。");
        }
        return;
    }
    if (existing && !opts.replace) {
        console.error("当前项目已有可信状态；审核新预览后使用 --replace --confirm，避免意外覆盖。");
        process.exitCode = 1;
        return;
    }
    if (!existing && opts.replace) {
        console.error("当前项目尚无可信状态；请去掉 --replace 后创建。");
        process.exitCode = 1;
        return;
    }
    if (!opts.confirm) {
        if (json) {
            printJson("drift.baseline", { applied: false, preview });
        }
        else {
            console.log(`${preview.mutation === "create" ? "创建" : "替换"}预览：将保存 ${preview.agentCount} 个 Agent 的以下类别：`);
            preview.savedCategories.forEach((entry) => console.log(`- ${entry}`));
            console.log("不会保存 API Key、Token、原始路径、原始端点、模型名、配置值、evidence 或 taskId。");
            console.log(preview.mutation === "create"
                ? "确认创建：agentreveal drift baseline --confirm"
                : "确认替换：agentreveal drift baseline --replace --confirm");
        }
        process.exitCode = 1;
        return;
    }
    const freshPosture = await inspectPosture(ctx);
    const result = store.saveBaselineConfirmed(freshPosture.agents.map((entry) => entry.state), preview);
    if (json) {
        printJson("drift.baseline", { applied: true, result });
    }
    else {
        console.log(`${result.mutation === "create" ? "已创建" : "已替换"}当前项目可信状态：${result.agentCount} 个 Agent。`);
        console.log("后续运行 agentreveal 或 agentreveal drift 查看变化。");
    }
});
program
    .command("posture")
    .description("解释 Claude Code、Codex、CC Switch 当前真正生效的配置、认证、路由和权限")
    .option("--json", "以 JSON 输出，便于自动化")
    .action(async (opts) => {
    const posture = await inspectPosture();
    if (opts.json) {
        printJson("posture", posture);
    }
    else {
        console.log(formatPosture(posture));
    }
});
program
    .command("provider")
    .description("Provider 风险相关命令")
    .command("scan")
    .description("仅扫描 Provider / base_url / 代理链路相关风险")
    .option("--json", "以 JSON 输出，便于自动化")
    .action(async (opts) => {
    const report = providerOnly(triageReport(await scanAll()).activeReport);
    if (opts.json) {
        printJson("provider.scan", report);
    }
    else {
        console.log(formatScan(report));
    }
    if (hasHighRisk(report))
        process.exitCode = 2;
});
function parseTrustKind(raw) {
    return raw === "trusted" || raw === "internal" ? raw : undefined;
}
const trust = program
    .command("trust")
    .description("管理当前项目的可信/内部 Provider 端点，不掩盖 HTTP、密钥或权限风险");
trust
    .command("add <endpoint>")
    .description("把 URL、域名或通配符加入当前项目信任策略")
    .option("--kind <kind>", "类型：trusted | internal", "trusted")
    .requiredOption("--reason <reason>", "记录信任原因和资源归属")
    .option("--json", "以 JSON 输出")
    .action((endpoint, opts) => {
    const kind = parseTrustKind(opts.kind);
    if (!kind)
        throw new Error("--kind 仅支持 trusted 或 internal。");
    const state = addProviderTrust({
        cwd: process.cwd(),
        endpoint,
        kind,
        reason: opts.reason,
    });
    const normalizedEndpoint = state.audit.at(-1)?.endpoint;
    const entry = normalizedEndpoint ? { endpoint: normalizedEndpoint, kind } : undefined;
    if (opts.json) {
        printJson("trust.add", { entry, configPath: state.configPath });
    }
    else {
        console.log(`已标记 ${entry?.endpoint ?? endpoint} 为 ${kind}。`);
        console.log(`配置：${state.configPath}`);
        console.log("重新运行 agentreveal scan 验证；HTTP、明文密钥和权限风险仍会独立显示。");
    }
});
trust
    .command("list")
    .description("列出当前项目可信/内部端点和审计事件")
    .option("--json", "以 JSON 输出")
    .action((opts) => {
    const state = listProviderTrust(process.cwd());
    if (opts.json) {
        printJson("trust.list", state);
        return;
    }
    if (state.entries.length === 0) {
        console.log("当前项目没有可信或内部端点。");
    }
    else {
        for (const entry of state.entries) {
            console.log(`[${entry.kind}] ${entry.endpoint}`);
        }
    }
    console.log(`配置：${state.configPath}`);
    console.log(`审计事件：${state.audit.length}`);
});
trust
    .command("remove <endpoint>")
    .description("撤销当前项目的一条端点信任")
    .option("--kind <kind>", "类型：trusted | internal", "trusted")
    .requiredOption("--reason <reason>", "记录撤销原因")
    .option("--json", "以 JSON 输出")
    .action((endpoint, opts) => {
    const kind = parseTrustKind(opts.kind);
    if (!kind)
        throw new Error("--kind 仅支持 trusted 或 internal。");
    const state = removeProviderTrust({
        cwd: process.cwd(),
        endpoint,
        kind,
        reason: opts.reason,
    });
    if (opts.json) {
        printJson("trust.remove", {
            endpoint: state.audit.at(-1)?.endpoint ?? endpoint,
            kind,
            configPath: state.configPath,
        });
    }
    else {
        console.log(`已撤销 ${state.audit.at(-1)?.endpoint ?? endpoint} 的 ${kind} 信任。`);
        console.log("重新运行 agentreveal scan 后，相关未知端点风险会重新进入待办。");
    }
});
const ignore = program
    .command("ignore")
    .description("管理当前项目的低优先级规则忽略；按 Agent + ruleId 持续生效并保留审计");
ignore
    .command("add <task-id>")
    .description("从当前扫描任务中选择一条允许忽略的规则")
    .requiredOption("--rule <rule-id>", "要忽略的规则 ID，必须属于当前任务")
    .requiredOption("--reason <reason>", "记录审核依据；不要填写密钥或敏感信息")
    .option("--expires <date>", "可选到期时间，如 2026-12-31")
    .option("--json", "以 JSON 输出")
    .action(async (taskId, opts) => {
    const triaged = triageReport(await scanAll());
    const tasks = buildActionTasks(buildActionPlan(triaged.activeReport));
    const task = tasks.find((candidate) => candidate.taskId === taskId);
    if (!task) {
        console.error(`当前待办中未找到任务 ${taskId}。请从最新报告复制 task ID。`);
        process.exitCode = 1;
        return;
    }
    const candidate = ruleIgnoreCandidatesForTask(task).find((entry) => entry.ruleId === opts.rule);
    if (!candidate) {
        console.error(`${opts.rule} 不是当前任务中允许项目级忽略的规则；P0/P1、强制修复和高风险家族不能忽略。`);
        process.exitCode = 1;
        return;
    }
    const state = addRuleIgnore({
        cwd: process.cwd(),
        ruleId: candidate.ruleId,
        agent: candidate.agent,
        reason: opts.reason,
        ...(opts.expires ? { expiresAt: opts.expires } : {}),
    });
    const entry = state.entries.find((item) => item.ruleId === candidate.ruleId && item.agent === candidate.agent);
    if (opts.json) {
        printJson("ignore.add", { entry, configPath: state.configPath });
    }
    else {
        console.log(`已在当前项目忽略 ${candidate.agent}/${candidate.ruleId}。`);
        console.log(`原因：${entry?.reason ?? opts.reason}`);
        console.log(entry?.expiresAt ? `到期：${entry.expiresAt}` : "有效期：长期（建议定期复审）");
        console.log("该规则即使 evidence/task ID 变化仍会隐藏；运行 agentreveal ignore remove 可撤销。");
    }
});
ignore
    .command("list")
    .description("列出当前项目规则忽略和审计事件")
    .option("--all", "包含已过期策略")
    .option("--json", "以 JSON 输出")
    .action((opts) => {
    const state = listRuleIgnores(process.cwd());
    const entries = opts.all
        ? state.entries
        : state.entries.filter((entry) => entry.status === "active");
    if (opts.json) {
        printJson("ignore.list", { ...state, entries });
        return;
    }
    if (entries.length === 0) {
        console.log(opts.all ? "当前项目没有规则忽略。" : "当前项目没有有效的规则忽略。");
    }
    else {
        for (const entry of entries) {
            const expiry = entry.expiresAt ? ` · 到期 ${entry.expiresAt}` : " · 长期";
            console.log(`[${entry.status === "active" ? "有效" : "已过期"}] ${entry.agent}/${entry.ruleId}${expiry}`);
            console.log(`  原因：${entry.reason}`);
        }
    }
    console.log(`配置：${state.configPath}`);
    console.log(`审计事件：${state.audit.length}`);
});
ignore
    .command("remove <rule-id>")
    .description("撤销当前项目的一条规则忽略")
    .requiredOption("--agent <agent>", "规则所属 Agent")
    .requiredOption("--reason <reason>", "记录撤销原因")
    .option("--json", "以 JSON 输出")
    .action((ruleId, opts) => {
    const state = removeRuleIgnore({
        cwd: process.cwd(),
        ruleId,
        agent: opts.agent,
        reason: opts.reason,
    });
    if (opts.json) {
        printJson("ignore.remove", {
            ruleId,
            agent: opts.agent,
            configPath: state.configPath,
        });
    }
    else {
        console.log(`已撤销 ${opts.agent}/${ruleId} 的项目忽略。`);
        console.log("重新运行 agentreveal scan 后，相关发现会重新进入待办。");
    }
});
const risk = program.command("risk").description("确认暂不修复、查看或撤销已接受风险");
const SEVERITY_LABEL = {
    critical: "严重",
    high: "高危",
    medium: "中危",
    low: "低危",
    info: "提示",
};
function printAcceptancePreflight(task) {
    console.log(`接受前确认：${task.taskId} 将隐藏 ${task.requirements.length} 条规则`);
    for (const requirement of task.requirements) {
        console.log(`- [${requirement.priority}/${SEVERITY_LABEL[requirement.severity]}] ${requirement.ruleId}`);
        console.log(`  接受条件：${requirement.acceptWhen ?? "未定义，当前规则不可接受"}`);
    }
    if (task.requirements.some((requirement) => requirement.fixMode !== "baseline")) {
        console.log("修复覆盖：当前任务含手动或引导步骤，自动命令不能完整解决整组规则。");
    }
    else {
        console.log("修复覆盖：可使用 baseline 处置，但仍须按每条规则重新扫描验证。");
    }
}
risk
    .command("accept <task-id>")
    .description("接受当前扫描中的一个行动任务，使其不再进入默认待办和退出码")
    .requiredOption("--reason <reason>", "必须记录接受原因")
    .option("--expires <date>", "可选到期时间，如 2026-12-31；不传表示长期有效")
    .option("--confirm", "确认已阅读全部关联规则和接受条件")
    .action(async (taskId, opts) => {
    const report = triageReport(await scanAll()).activeReport;
    const tasks = buildActionTasks(buildActionPlan(report));
    const task = tasks.find((candidate) => candidate.taskId === taskId);
    if (!task) {
        console.error(`当前扫描中未找到任务 ${taskId}。请从最新报告复制 task ID。`);
        process.exitCode = 1;
        return;
    }
    taskSnapshotStore().capture(tasks);
    printAcceptancePreflight(task);
    const missingAcceptanceRules = taskMissingAcceptanceRules(task);
    if (missingAcceptanceRules.length > 0) {
        console.error(`当前任务不能接受：${missingAcceptanceRules.join("、")} 没有已定义的安全接受条件。`);
        process.exitCode = 1;
        return;
    }
    if (task.priority === "P0" && !opts.expires) {
        console.error("P0 任务只能限时接受，请增加 --expires YYYY-MM-DD；不应把高紧急度风险永久隐藏。");
        process.exitCode = 1;
        return;
    }
    if (!opts.expires && (task.priority === "P1" || task.disposition === "review")) {
        console.log("复审建议：该任务建议设置 --expires，避免环境变化后长期沿用旧判断。");
    }
    if (!opts.confirm) {
        console.error("尚未写入接受记录。确认全部条件后增加 --confirm。 ");
        process.exitCode = 1;
        return;
    }
    const record = acceptanceStore().accept(task, opts.reason, {
        ...(opts.expires ? { expiresAt: opts.expires } : {}),
    });
    console.log(`已接受 ${record.taskId}：${record.reason}`);
    console.log(`作用域：当前项目 (${record.scopeId.slice(6, 18)})`);
    console.log(record.expiresAt
        ? `到期时间：${record.expiresAt}`
        : "有效期：长期有效（建议环境变化后重新审核）");
    console.log("重新运行 agentreveal scan 或 agentreveal report --format html 即可生效。");
});
risk
    .command("verify <task-id>")
    .description("重新扫描并验证单个任务是否已解决、缓解、接受或发生身份变化")
    .action(async (taskId) => {
    if (!/^task-[A-Za-z0-9_-]{6,128}$/.test(taskId)) {
        console.error("无效的任务 ID。请从最新 HTML 报告复制 task ID。");
        process.exitCode = 1;
        return;
    }
    const snapshots = taskSnapshotStore();
    const previous = snapshots.get(taskId);
    const store = acceptanceStore();
    const acceptance = store.list().find((record) => record.taskId === taskId);
    const currentTasks = buildActionTasks(buildActionPlan(await scanAll()));
    const result = verifyRiskTask({
        taskId,
        currentTasks,
        ...(previous ? { previous } : {}),
        ...(acceptance ? { acceptance } : {}),
    });
    snapshots.capture(currentTasks);
    const remaining = result.remainingRuleIds.join("、") || "无";
    if (result.status === "resolved") {
        console.log(`已解决：当前扫描不再存在任务 ${taskId}。`);
    }
    else if (result.status === "accepted") {
        console.log(`已接受：任务 ${taskId} 仍存在，但当前项目已有有效接受记录。`);
        console.log(`剩余规则：${remaining}`);
        console.log(result.acceptance?.expiresAt
            ? `到期时间：${result.acceptance.expiresAt}`
            : "有效期：长期有效");
        console.log(`作用域：当前项目 (${store.scopeId.slice(6, 18)})`);
    }
    else if (result.status === "mitigated") {
        console.log(`已缓解但未解决：任务 ${taskId} 仍存在。`);
        console.log(`已消失规则：${result.disappearedRuleIds.join("、")}`);
        console.log(`剩余规则：${remaining}`);
    }
    else if (result.status === "identity-changed") {
        console.log(`任务身份已变化：未找到原任务 ${taskId}，但相关规则仍存在。`);
        console.log(`可能的新任务：${result.relatedTaskIds.join("、")}`);
        console.log(`剩余规则：${remaining}`);
    }
    else if (result.status === "expired") {
        console.log(`接受已过期：任务 ${taskId} 已重新进入待办。`);
        console.log(`剩余规则：${remaining}`);
    }
    else if (result.status === "revoked") {
        console.log(`接受已撤销：任务 ${taskId} 已重新进入待办。`);
        console.log(`剩余规则：${remaining}`);
    }
    else if (result.status === "unknown") {
        console.error(`无法确认任务 ${taskId}：本机没有该任务的报告快照或接受历史。请重新生成报告后再验证。`);
        process.exitCode = 1;
    }
    else {
        console.log(`仍存在：任务 ${taskId} 尚未解决。`);
        console.log(`剩余规则：${remaining}`);
    }
    if (result.status !== "unknown" &&
        !["resolved", "accepted"].includes(result.status)) {
        process.exitCode = 2;
    }
});
risk
    .command("list")
    .description("查看风险接受记录")
    .option("--all", "包含已撤销和已过期的审计历史")
    .action((opts) => {
    const store = acceptanceStore();
    const records = store.list({
        activeOnly: !opts.all,
        includeLegacy: Boolean(opts.all),
    });
    if (records.length === 0) {
        console.log(opts.all ? "暂无风险接受记录。" : "暂无有效的风险接受记录。");
        return;
    }
    console.log(`作用域：当前项目 (${store.scopeId.slice(6, 18)})`);
    const labels = {
        active: "有效",
        expired: "已过期",
        revoked: "已撤销",
        legacy: "旧版未作用域·不生效",
    };
    for (const record of records) {
        const title = record.task.titles[0]
            ?? record.task.ruleIds[0]
            ?? record.taskId;
        const expiry = record.expiresAt ? ` · 到期 ${record.expiresAt}` : " · 长期";
        console.log(`[${labels[record.status]}] ${record.taskId}  ${title}`);
        console.log(`  原因：${record.reason}${expiry}`);
    }
    console.log(`\n审计文件：${store.path}`);
});
risk
    .command("revoke <task-id>")
    .description("撤销一个风险接受记录，使该任务重新进入默认待办")
    .action((taskId) => {
    const store = acceptanceStore();
    const record = store.revoke(taskId);
    console.log(`已撤销 ${record.taskId} 的风险接受记录。`);
    console.log(`作用域：当前项目 (${store.scopeId.slice(6, 18)})`);
    console.log("重新运行 agentreveal scan 或 agentreveal report --format html 即可生效。");
});
program
    .command("baseline")
    .description("生成 OpenCode / Claude Code / Gemini / OpenClaw 安全基线 dry-run 计划（不写文件）")
    .option("--profile <profile>", "基线：safe | balanced", "balanced")
    .option("--dry-run", "只预览建议和 diff，不写文件")
    .option("--json", "以 JSON 输出，便于自动化")
    .action(async (opts) => {
    if (!opts.dryRun) {
        console.error("baseline 当前只支持 --dry-run；不会直接修改配置文件。");
        process.exitCode = 1;
        return;
    }
    const profile = parseProfile(opts.profile);
    if (!profile) {
        console.error(`未知 profile "${opts.profile}"，仅支持 safe | balanced`);
        process.exitCode = 1;
        return;
    }
    const plan = await buildBaselinePlan(profile);
    if (opts.json) {
        printJson("baseline", plan);
    }
    else {
        console.log(formatBaseline(plan));
    }
});
program
    .command("backup")
    .description("备份当前 OpenCode 配置到项目 .agentreveal/backups")
    .option("--json", "以 JSON 输出，便于自动化")
    .action(async (opts) => {
    const result = await backupOpenCodeConfig();
    if (opts.json) {
        printJson("backup", result);
        return;
    }
    if (result.backupId) {
        console.log(`备份完成：${result.backupId}（${result.files} 个文件）`);
    }
    else {
        console.log(result.warnings.join("\n"));
    }
});
const credential = program
    .command("credential")
    .description("备份和恢复 Claude Code 明文凭证迁移涉及的设置文件");
credential
    .command("backup <task-id>")
    .description("按当前扫描任务备份 Claude 设置文件，再执行凭证迁移")
    .option("--json", "以 JSON 输出，便于自动化")
    .action(async (taskId, opts) => {
    const report = triageReport(await scanAll()).activeReport;
    const task = buildActionTasks(buildActionPlan(report)).find((candidate) => candidate.taskId === taskId);
    const result = createClaudeCredentialBackup({
        cwd: process.cwd(),
        task,
        taskId,
        configDir: await currentClaudeConfigDir(),
    });
    if (opts.json) {
        printJson("credential.backup", result);
        return;
    }
    console.log(`Claude 迁移前备份完成：${result.backupId}（${result.files} 个文件）`);
    console.log("现在可以执行报告中的 Keychain 与 apiKeyHelper 迁移命令。");
    console.log(`如迁移后启动或鉴权异常，先预览恢复：agentreveal credential restore ${result.backupId}`);
});
credential
    .command("restore <backup-id>")
    .description("预览或确认恢复一次 Claude 凭证迁移备份")
    .option("--confirm <fingerprint>", "使用本次预览指纹确认写入")
    .option("--json", "以 JSON 输出，便于自动化")
    .action(async (backupId, opts) => {
    const input = {
        cwd: process.cwd(),
        backupId,
        configDir: await currentClaudeConfigDir(),
    };
    if (!opts.confirm) {
        const preview = previewClaudeCredentialRestore(input);
        const output = { restored: false, ...preview };
        if (opts.json) {
            printJson("credential.restore", output);
        }
        else {
            console.log(`恢复预览：将覆盖 ${preview.files} 个 Claude 设置文件；其中 ${preview.changedFiles} 个与备份不同。`);
            console.log("恢复会重新带回旧明文字段，仅在迁移后启动或鉴权异常时使用。");
            console.log(`确认写入：agentreveal credential restore ${backupId} --confirm ${preview.fingerprint}`);
        }
        process.exitCode = 1;
        return;
    }
    const result = restoreClaudeCredentialBackup({
        ...input,
        expectedFingerprint: opts.confirm,
    });
    const output = { restored: true, ...result };
    if (opts.json) {
        printJson("credential.restore", output);
    }
    else {
        console.log(`Claude 配置已恢复：${result.backupId}（${result.files} 个文件）`);
        console.log("旧明文凭证字段已重新出现；排除故障后仍需轮换并重新迁移。");
        console.log("运行 agentreveal scan 重新验证风险状态。");
    }
});
program
    .command("apply")
    .description("应用 OpenCode / Claude Code / Gemini / OpenClaw baseline 变更（必须 --backup）")
    .option("--profile <profile>", "基线：safe | balanced", "balanced")
    .option("--backup", "应用前创建备份")
    .option("--json", "以 JSON 输出，便于自动化")
    .action(async (opts) => {
    if (!opts.backup) {
        console.error("apply 必须显式传入 --backup，确保可恢复。");
        process.exitCode = 1;
        return;
    }
    const profile = parseProfile(opts.profile);
    if (!profile) {
        console.error(`未知 profile "${opts.profile}"，仅支持 safe | balanced`);
        process.exitCode = 1;
        return;
    }
    const result = await applyBaseline(profile);
    if (opts.json) {
        printJson("apply", result);
        return;
    }
    if (result.files.length === 0) {
        console.log(result.warnings.join("\n") || "没有可应用的 baseline 变更。");
        return;
    }
    console.log(`应用完成：profile=${result.profile} backup=${result.backupId} files=${result.files.length}`);
    for (const file of result.files) {
        console.log(`  - ${file.configPath}: ${file.changes.length} 项变更`);
    }
});
program
    .command("restore")
    .description("恢复最近一次备份，或用 --id 指定备份")
    .option("--id <id>", "指定备份 ID；默认恢复最近一次")
    .option("--json", "以 JSON 输出，便于自动化")
    .action((opts) => {
    const result = opts.id
        ? restoreBaselineBackup(process.cwd(), opts.id)
        : restoreLatestBaselineBackup(process.cwd());
    if (!result) {
        const msg = "未找到可恢复的备份。";
        if (opts.json)
            printJson("restore", { restored: false, message: msg });
        else
            console.log(msg);
        return;
    }
    const output = { restored: true, ...result };
    if (opts.json) {
        printJson("restore", output);
    }
    else {
        console.log(`恢复完成：${result.backupId}（${result.files} 个文件）`);
    }
});
program
    .command("report")
    .description("扫描并生成可存档的 HTML / JSON 报告")
    .option("-f, --format <format>", "报告格式：html | json", "html")
    .option("-o, --output <path>", "输出文件路径（- 表示标准输出）")
    .action(async (opts) => {
    const format = opts.format.toLowerCase();
    if (format !== "html" && format !== "json") {
        console.error(`未知格式 "${opts.format}"，仅支持 html | json`);
        process.exitCode = 1;
        return;
    }
    const ctx = buildContext();
    const [report, postureState] = await Promise.all([
        scanAll(ctx),
        inspectPostureWithDrift(ctx, postureSnapshotStore(ctx.cwd), {
            tolerateStoreErrors: true,
        }),
    ]);
    taskSnapshotStore().capture(buildActionTasks(buildActionPlan(report)));
    const triaged = triageReport(report);
    const content = format === "json"
        ? JSON.stringify(buildJsonReport(triaged.activeReport, {
            acceptedTaskCount: triaged.acceptedTasks.length,
            ignoredFindingCount: triaged.ignoredFindings.length,
            posture: postureState.posture,
            drift: postureState.drift,
        }), null, 2)
        : renderHtmlReport(report, {
            acceptances: triaged.activeAcceptances,
            ruleIgnores: triaged.activeRuleIgnores,
            posture: postureState.posture,
            drift: postureState.drift,
        });
    // 默认输出路径按格式取扩展名；-o - 走标准输出。
    const output = opts.output ?? `agentreveal-report.${format === "json" ? "json" : "html"}`;
    if (output === "-") {
        console.log(content);
    }
    else {
        writeFileSync(output, content);
        console.log(`报告已写入 ${output}（${triaged.activeReport.allFindings.length} 项当前风险` +
            `${triaged.acceptedTasks.length > 0 ? `，${triaged.acceptedTasks.length} 个任务已接受` : ""}` +
            `${triaged.ignoredFindings.length > 0 ? `，${triaged.ignoredFindings.length} 条项目规则已忽略` : ""}` +
            "，证据均已脱敏）");
    }
    if (hasHighRisk(triaged.activeReport))
        process.exitCode = 2;
});
program
    .command("map")
    .description("生成多 Agent 配置地图：一眼看清每个 Agent 连接了谁、风险在哪里")
    .option("--json", "以 JSON 输出，便于自动化")
    .action(async (opts) => {
    const report = triageReport(await scanAll()).activeReport;
    const map = buildMap(report);
    if (opts.json) {
        printJson("map", map);
    }
    else {
        console.log(formatMap(map));
    }
});
const parseArgv = bareJson ? process.argv.slice(0, 2) : process.argv;
program.parseAsync(parseArgv).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`AgentReveal 执行失败：${message}`);
    process.exitCode = 1;
});
//# sourceMappingURL=cli.js.map