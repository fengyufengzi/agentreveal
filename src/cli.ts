/** AgentGuard CLI 入口。骨架阶段：doctor 已接真实 discovery，其余命令为占位。 */
import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { discoverAll } from "./core/discovery/index.js";
import { scanAll } from "./core/scan/index.js";
import { buildMap } from "./core/map/index.js";
import { buildBaselinePlan, type BaselineProfile } from "./core/baseline/index.js";
import {
  applyBaseline,
  backupOpenCodeConfig,
  restoreBaselineBackup,
  restoreLatestBaselineBackup,
} from "./core/apply/index.js";
import { formatDoctor } from "./core/report/doctor-format.js";
import { formatScan } from "./core/report/scan-format.js";
import { formatMap } from "./core/report/map-format.js";
import { formatBaseline } from "./core/report/baseline-format.js";
import { renderHtmlReport } from "./core/report/html-report.js";
import type { ScanReport } from "./core/scan/index.js";
import { withOutputContract, type OutputCommand } from "./core/output-contract.js";
import {
  buildActionPlan,
  buildActionTasks,
  taskMissingAcceptanceRules,
  type ActionTask,
} from "./core/action/index.js";
import { AcceptanceStore } from "./core/acceptance/index.js";
import { applyAcceptances } from "./core/triage/index.js";
import { verifyRiskTask } from "./core/verification/index.js";
import { TaskSnapshotStore } from "./core/verification/snapshot.js";

const program = new Command();

function printJson(command: OutputCommand, payload: object): void {
  console.log(JSON.stringify(withOutputContract(command, payload), null, 2));
}

function acceptanceStore(): AcceptanceStore {
  const path = process.env.AGENTGUARD_ACCEPTANCE_PATH;
  return new AcceptanceStore(path ? { path } : {});
}

function taskSnapshotStore(): TaskSnapshotStore {
  const path = process.env.AGENTGUARD_TASK_SNAPSHOT_PATH;
  return new TaskSnapshotStore(path ? { path } : {});
}

function triageReport(report: ScanReport) {
  const records = acceptanceStore().list({ activeOnly: true });
  return applyAcceptances(report, records);
}

program
  .name("agentguard")
  .description("面向多 Agent、多模型、多 Provider 的 AI Coding Agent 安全配置中心")
  .version("0.0.5-pilot.1");

program
  .command("doctor")
  .description("体检本机 AI Coding Agent 环境，列出已发现的 Agent 与配置路径")
  .option("--json", "以 JSON 输出，便于自动化")
  .action(async (opts: { json?: boolean }) => {
    const found = await discoverAll();
    if (opts.json) {
      printJson("doctor", { agents: found });
    } else {
      console.log(formatDoctor(found));
    }
  });

const hasHighRisk = (report: ScanReport): boolean =>
  [...report.allFindings, ...report.correlations].some(
    (f) => f.severity === "critical" || f.severity === "high"
  );

const providerOnly = (report: ScanReport): ScanReport => ({
  results: report.results.map((r) => ({
    ...r,
    findings: r.findings.filter((f) => f.category === "provider"),
  })),
  allFindings: report.allFindings.filter((f) => f.category === "provider"),
  correlations: report.correlations,
});

function parseProfile(raw: string): BaselineProfile | undefined {
  return raw === "safe" || raw === "balanced" ? raw : undefined;
}

program
  .command("scan")
  .description("扫描全部已发现 Agent 的风险（深度解析 Provider / 代理链路 / 密钥）")
  .option("--json", "以 JSON 输出，便于自动化")
  .action(async (opts: { json?: boolean }) => {
    const triaged = triageReport(await scanAll());
    const report = triaged.activeReport;
    if (opts.json) {
      printJson("scan", {
        ...report,
        acceptedTaskCount: triaged.acceptedTasks.length,
      });
    } else {
      console.log(formatScan(report));
      if (triaged.acceptedTasks.length > 0) {
        console.log(
          `\n已隐藏 ${triaged.acceptedTasks.length} 个已接受风险任务；运行 agentguard risk list 查看。`
        );
      }
    }
    // 有高危及以上风险时以非零码退出，便于 CI 集成（含跨 Agent 关联项）。
    if (hasHighRisk(report)) process.exitCode = 2;
  });

program
  .command("provider")
  .description("Provider 风险相关命令")
  .command("scan")
  .description("仅扫描 Provider / base_url / 代理链路相关风险")
  .option("--json", "以 JSON 输出，便于自动化")
  .action(async (opts: { json?: boolean }) => {
    const report = providerOnly(triageReport(await scanAll()).activeReport);
    if (opts.json) {
      printJson("provider.scan", report);
    } else {
      console.log(formatScan(report));
    }
    if (hasHighRisk(report)) process.exitCode = 2;
  });

const risk = program.command("risk").description("确认暂不修复、查看或撤销已接受风险");

const SEVERITY_LABEL = {
  critical: "严重",
  high: "高危",
  medium: "中危",
  low: "低危",
  info: "提示",
} as const;

function printAcceptancePreflight(task: ActionTask): void {
  console.log(`接受前确认：${task.taskId} 将隐藏 ${task.requirements.length} 条规则`);
  for (const requirement of task.requirements) {
    console.log(
      `- [${requirement.priority}/${SEVERITY_LABEL[requirement.severity]}] ${requirement.ruleId}`
    );
    console.log(
      `  接受条件：${requirement.acceptWhen ?? "未定义，当前规则不可接受"}`
    );
  }
  if (task.requirements.some((requirement) => requirement.fixMode !== "baseline")) {
    console.log("修复覆盖：当前任务含手动或引导步骤，自动命令不能完整解决整组规则。");
  } else {
    console.log("修复覆盖：可使用 baseline 处置，但仍须按每条规则重新扫描验证。");
  }
}

risk
  .command("accept <task-id>")
  .description("接受当前扫描中的一个行动任务，使其不再进入默认待办和退出码")
  .requiredOption("--reason <reason>", "必须记录接受原因")
  .option("--expires <date>", "可选到期时间，如 2026-12-31；不传表示长期有效")
  .option("--confirm", "确认已阅读全部关联规则和接受条件")
  .action(
    async (
      taskId: string,
      opts: { reason: string; expires?: string; confirm?: boolean }
    ) => {
      const report = await scanAll();
      const tasks = buildActionTasks(buildActionPlan(report));
      const task = tasks.find(
        (candidate) => candidate.taskId === taskId
      );
      if (!task) {
        console.error(`当前扫描中未找到任务 ${taskId}。请从最新报告复制 task ID。`);
        process.exitCode = 1;
        return;
      }
      taskSnapshotStore().capture(tasks);
      printAcceptancePreflight(task);
      const missingAcceptanceRules = taskMissingAcceptanceRules(task);
      if (missingAcceptanceRules.length > 0) {
        console.error(
          `当前任务不能接受：${missingAcceptanceRules.join("、")} 没有已定义的安全接受条件。`
        );
        process.exitCode = 1;
        return;
      }
      if (task.priority === "P0" && !opts.expires) {
        console.error(
          "P0 任务只能限时接受，请增加 --expires YYYY-MM-DD；不应把高紧急度风险永久隐藏。"
        );
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
      console.log(
        record.expiresAt
          ? `到期时间：${record.expiresAt}`
          : "有效期：长期有效（建议环境变化后重新审核）"
      );
      console.log("重新运行 agentguard scan 或 agentguard report --format html 即可生效。");
    }
  );

risk
  .command("verify <task-id>")
  .description("重新扫描并验证单个任务是否已解决、缓解、接受或发生身份变化")
  .action(async (taskId: string) => {
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
    } else if (result.status === "accepted") {
      console.log(`已接受：任务 ${taskId} 仍存在，但当前项目已有有效接受记录。`);
      console.log(`剩余规则：${remaining}`);
      console.log(
        result.acceptance?.expiresAt
          ? `到期时间：${result.acceptance.expiresAt}`
          : "有效期：长期有效"
      );
      console.log(`作用域：当前项目 (${store.scopeId.slice(6, 18)})`);
    } else if (result.status === "mitigated") {
      console.log(`已缓解但未解决：任务 ${taskId} 仍存在。`);
      console.log(`已消失规则：${result.disappearedRuleIds.join("、")}`);
      console.log(`剩余规则：${remaining}`);
    } else if (result.status === "identity-changed") {
      console.log(`任务身份已变化：未找到原任务 ${taskId}，但相关规则仍存在。`);
      console.log(`可能的新任务：${result.relatedTaskIds.join("、")}`);
      console.log(`剩余规则：${remaining}`);
    } else if (result.status === "expired") {
      console.log(`接受已过期：任务 ${taskId} 已重新进入待办。`);
      console.log(`剩余规则：${remaining}`);
    } else if (result.status === "revoked") {
      console.log(`接受已撤销：任务 ${taskId} 已重新进入待办。`);
      console.log(`剩余规则：${remaining}`);
    } else if (result.status === "unknown") {
      console.error(
        `无法确认任务 ${taskId}：本机没有该任务的报告快照或接受历史。请重新生成报告后再验证。`
      );
      process.exitCode = 1;
    } else {
      console.log(`仍存在：任务 ${taskId} 尚未解决。`);
      console.log(`剩余规则：${remaining}`);
    }

    if (
      result.status !== "unknown" &&
      !["resolved", "accepted"].includes(result.status)
    ) {
      process.exitCode = 2;
    }
  });

risk
  .command("list")
  .description("查看风险接受记录")
  .option("--all", "包含已撤销和已过期的审计历史")
  .action((opts: { all?: boolean }) => {
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
    } as const;
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
  .action((taskId: string) => {
    const store = acceptanceStore();
    const record = store.revoke(taskId);
    console.log(`已撤销 ${record.taskId} 的风险接受记录。`);
    console.log(`作用域：当前项目 (${store.scopeId.slice(6, 18)})`);
    console.log("重新运行 agentguard scan 或 agentguard report --format html 即可生效。");
  });

program
  .command("baseline")
  .description("生成 OpenCode / Claude Code / Gemini / OpenClaw 安全基线 dry-run 计划（不写文件）")
  .option("--profile <profile>", "基线：safe | balanced", "balanced")
  .option("--dry-run", "只预览建议和 diff，不写文件")
  .option("--json", "以 JSON 输出，便于自动化")
  .action(async (opts: { profile: string; dryRun?: boolean; json?: boolean }) => {
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
    } else {
      console.log(formatBaseline(plan));
    }
  });

program
  .command("backup")
  .description("备份当前 OpenCode 配置到项目 .agentguard/backups")
  .option("--json", "以 JSON 输出，便于自动化")
  .action(async (opts: { json?: boolean }) => {
    const result = await backupOpenCodeConfig();
    if (opts.json) {
      printJson("backup", result);
      return;
    }
    if (result.backupId) {
      console.log(`备份完成：${result.backupId}（${result.files} 个文件）`);
    } else {
      console.log(result.warnings.join("\n"));
    }
  });

program
  .command("apply")
  .description("应用 OpenCode / Claude Code / Gemini / OpenClaw baseline 变更（必须 --backup）")
  .option("--profile <profile>", "基线：safe | balanced", "balanced")
  .option("--backup", "应用前创建备份")
  .option("--json", "以 JSON 输出，便于自动化")
  .action(
    async (opts: { profile: string; backup?: boolean; json?: boolean }) => {
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
      console.log(
        `应用完成：profile=${result.profile} backup=${result.backupId} files=${result.files.length}`
      );
      for (const file of result.files) {
        console.log(`  - ${file.configPath}: ${file.changes.length} 项变更`);
      }
    }
  );

program
  .command("restore")
  .description("恢复最近一次备份，或用 --id 指定备份")
  .option("--id <id>", "指定备份 ID；默认恢复最近一次")
  .option("--json", "以 JSON 输出，便于自动化")
  .action((opts: { id?: string; json?: boolean }) => {
    const result = opts.id
      ? restoreBaselineBackup(process.cwd(), opts.id)
      : restoreLatestBaselineBackup(process.cwd());
    if (!result) {
      const msg = "未找到可恢复的备份。";
      if (opts.json) printJson("restore", { restored: false, message: msg });
      else console.log(msg);
      return;
    }
    const output = { restored: true, ...result };
    if (opts.json) {
      printJson("restore", output);
    } else {
      console.log(`恢复完成：${result.backupId}（${result.files} 个文件）`);
    }
  });

program
  .command("report")
  .description("扫描并生成可存档的 HTML / JSON 报告")
  .option("-f, --format <format>", "报告格式：html | json", "html")
  .option("-o, --output <path>", "输出文件路径（- 表示标准输出）")
  .action(async (opts: { format: string; output?: string }) => {
    const format = opts.format.toLowerCase();
    if (format !== "html" && format !== "json") {
      console.error(`未知格式 "${opts.format}"，仅支持 html | json`);
      process.exitCode = 1;
      return;
    }

    const report = await scanAll();
    taskSnapshotStore().capture(buildActionTasks(buildActionPlan(report)));
    const triaged = triageReport(report);
    const content =
      format === "json"
        ? JSON.stringify(
            withOutputContract("report.json", {
              ...triaged.activeReport,
              acceptedTaskCount: triaged.acceptedTasks.length,
            }),
            null,
            2
          )
        : renderHtmlReport(report, { acceptances: triaged.activeAcceptances });

    // 默认输出路径按格式取扩展名；-o - 走标准输出。
    const output =
      opts.output ?? `agentguard-report.${format === "json" ? "json" : "html"}`;

    if (output === "-") {
      console.log(content);
    } else {
      writeFileSync(output, content);
      console.log(
        `报告已写入 ${output}（${triaged.activeReport.allFindings.length} 项当前风险` +
          `${triaged.acceptedTasks.length > 0 ? `，${triaged.acceptedTasks.length} 个任务已接受` : ""}，证据均已脱敏）`
      );
    }

    if (hasHighRisk(triaged.activeReport)) process.exitCode = 2;
  });

program
  .command("map")
  .description("生成多 Agent 配置地图：一眼看清每个 Agent 连接了谁、风险在哪里")
  .option("--json", "以 JSON 输出，便于自动化")
  .action(async (opts: { json?: boolean }) => {
    const report = triageReport(await scanAll()).activeReport;
    const map = buildMap(report);
    if (opts.json) {
      printJson("map", map);
    } else {
      console.log(formatMap(map));
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`AgentGuard 执行失败：${message}`);
  process.exitCode = 1;
});
