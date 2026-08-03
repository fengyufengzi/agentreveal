/**
 * scan 结果 → 自包含 HTML 报告（无外部依赖，内联 CSS）。
 * 安全：所有动态内容一律 HTML 转义，防止 evidence/路径中的字符触发 XSS。
 * 脱敏：findings 已在各 adapter 层脱敏，此处不再接触原始密钥。
 */
import type {
  ActionPriority,
  FindingAction,
  FindingDisposition,
  RiskLevel,
} from "../../adapters/types.js";
import {
  buildActionPlan,
  buildActionTasks,
  taskMissingAcceptanceRules,
  type ActionTask,
  type ActionTaskRequirement,
} from "../action/index.js";
import type { AgentScanResult, ScanReport } from "../scan/index.js";
import {
  buildRemediationGuide,
  type RemediationGuide,
} from "../remediation/index.js";
import { providerTrustCandidateForTask } from "../config/trust.js";
import {
  ruleIgnoreCandidatesForTask,
  type ListedRuleIgnore,
} from "../config/rule-ignore.js";
import { applyRuleIgnores, type IgnoredFinding } from "../triage/index.js";
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

const SEVERITY_ORDER: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const SEVERITY_LABEL: Record<RiskLevel, string> = {
  critical: "严重",
  high: "高危",
  medium: "中危",
  low: "低危",
  info: "提示",
};

const PRIORITY_ORDER: Record<ActionPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

const DISPOSITION_ORDER: FindingDisposition[] = [
  "fix",
  "review",
  "cleanup",
  "observe",
];

const DISPOSITION_LABEL: Record<FindingDisposition, string> = {
  fix: "立即处理",
  review: "需要确认",
  cleanup: "建议清理",
  observe: "配置观察",
};

const DISPOSITION_HELP: Record<FindingDisposition, string> = {
  fix: "证据已经足够，建议按优先级完成整改。",
  review: "需要结合端点归属、用途或信任关系作出决定。",
  cleanup: "当前不紧急，但清理后可以缩小长期暴露面。",
  observe: "用于了解当前环境，默认不作为待修复事项。",
};

/** HTML 实体转义（含引号，覆盖属性与文本上下文）。 */
export function escapeHtml(input: unknown): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function evidenceRows(evidence: Record<string, unknown>): string {
  return Object.entries(evidence)
    .map(([k, v]) => {
      const val = Array.isArray(v) ? v.join(", ") : String(v);
      return `<div class="ev"><span class="ev-k">${escapeHtml(
        k
      )}</span><span class="ev-v">${escapeHtml(val)}</span></div>`;
    })
    .join("");
}

function normalizedDisposition(value: FindingDisposition): FindingDisposition {
  return DISPOSITION_ORDER.includes(value) ? value : "review";
}

function normalizedPriority(value: ActionPriority): ActionPriority {
  return Object.hasOwn(PRIORITY_ORDER, value) ? value : "P2";
}

function fixModeLabel(mode: FindingAction["fixMode"]): string {
  const labels: Record<FindingAction["fixMode"], string> = {
    baseline: "Baseline 支持",
    guided: "引导整改",
    manual: "手动整改",
    none: "无需整改",
  };
  return labels[mode] ?? "处置方式待确认";
}

function actionList(title: string, values: string[], className = ""): string {
  if (values.length === 0) return "";
  return `<div class="action-list ${className}"><strong>${escapeHtml(
    title
  )}</strong><ol>${values
    .map((value) => `<li>${escapeHtml(value)}</li>`)
    .join("")}</ol></div>`;
}

function postureSection(posture: PostureReport | undefined): string {
  if (!posture) return "";
  const cards = posture.agents
    .map(({ state, uncertainty, remediationPlans }) => {
      const sources = state.configSources
        .map(
          (source) =>
            `<li><strong>${escapeHtml(source.kind)}/${escapeHtml(
              source.scope
            )}</strong> <span>${escapeHtml(source.status)}</span>${
              source.path ? ` <code>${escapeHtml(source.path)}</code>` : ""
            }<br><small>${escapeHtml(source.fields.join("、") || "无可识别字段")}</small></li>`
        )
        .join("");
      const permissions = state.permissions
        .map(
          (permission) =>
            `<li><code>${escapeHtml(permission.capability)}</code> ${escapeHtml(
              permission.decision
            )} · ${escapeHtml(permission.scope)}</li>`
        )
        .join("");
      const uncertainties = uncertainty.length
        ? `<div class="posture-uncertainty"><strong>仍缺少的证据</strong><ul>${uncertainty
            .map((entry) => `<li>${escapeHtml(entry.message)}</li>`)
            .join("")}</ul></div>`
        : "";
      const plans = remediationPlans
        .map(
          (plan) => `<details class="posture-plan"><summary>${escapeHtml(
            plan.title
          )} · ${escapeHtml(plan.status)}</summary>
<p><strong>当前：</strong>${escapeHtml(plan.currentExplanation)}</p>
<p><strong>目标：</strong>${escapeHtml(plan.targetState)}</p>
<ol>${plan.steps
  .map(
    (step) =>
      `<li><strong>${escapeHtml(step.title)}</strong>：${escapeHtml(
        step.detail
      )}</li>`
  )
  .join("")}</ol>
<p><strong>为什么不自动执行：</strong>${escapeHtml(
            plan.automation.reason
          )}</p>
<ul>${plan.constraints
  .map((constraint) => `<li>${escapeHtml(constraint)}</li>`)
  .join("")}</ul>
</details>`
        )
        .join("");
      return `<article class="posture-card">
<div class="posture-head"><h3>${escapeHtml(state.displayName)}</h3><span class="posture-confidence">${escapeHtml(
        state.confidence
      )}</span></div>
<dl class="posture-facts">
<div><dt>Provider / 模型</dt><dd>${escapeHtml(
        state.route.providerClass ?? "未确认"
      )} / ${escapeHtml(state.route.model ?? "未确认")}</dd></div>
<div><dt>请求链路</dt><dd>${escapeHtml(
        state.route.effectiveEndpoint ?? "未确认"
      )} · ${escapeHtml(state.route.proxyKind)}${
        state.route.realUpstream
          ? ` → ${escapeHtml(state.route.realUpstream)}`
          : ""
      }</dd></div>
<div><dt>认证来源</dt><dd>${escapeHtml(state.auth.method)} · ${escapeHtml(
        state.auth.status
      )}${state.auth.sourceKind ? ` · ${escapeHtml(state.auth.sourceKind)}` : ""}</dd></div>
</dl>
<details><summary>配置来源与覆盖</summary><ul class="posture-list">${sources || "<li>没有可展示的配置来源。</li>"}</ul></details>
<details><summary>权限与集成</summary><ul class="posture-list">${permissions || "<li>没有可展示的权限摘要。</li>"}</ul><p>${state.integrations.filter((entry) => entry.enabled).length} 个集成已启用。</p></details>
${plans}
${uncertainties}
</article>`;
    })
    .join("");
  return `<section class="posture-section" id="effective-posture">
<h2>当前真正生效</h2>
<p>按 Agent 配置优先级计算 Provider、认证、权限与工具；“推断/证据不完整”不会表述为已确认。</p>
<div class="posture-summary">已确认 ${posture.summary.confirmedCount} · 推断 ${posture.summary.inferredCount} · 证据不完整 ${posture.summary.incompleteCount} · 认证冲突 ${posture.summary.authConflictCount}</div>
<div class="posture-grid">${cards || "<p>当前没有可计算有效状态的配置。</p>"}</div>
</section>`;
}

function driftSection(drift: DriftComparison | undefined): string {
  if (!drift) return "";
  const status =
    drift.status === "no-baseline"
      ? "尚未保存可信状态"
      : drift.status === "unchanged"
        ? "与可信状态一致"
        : drift.status === "unavailable"
          ? "可信状态暂时不可用"
          : "检测到变化";
  const events = drift.events
    .map(
      (entry) =>
        `<li><div><span class="priority pri-${escapeHtml(
          entry.priority.toLowerCase()
        )}">${escapeHtml(entry.priority)}</span> <strong>${escapeHtml(
          entry.currentSummary
        )}</strong></div><p>${escapeHtml(entry.agentId)} · ${escapeHtml(
          entry.kind
        )} · ${escapeHtml(entry.change)}</p>${actionList(
          "建议处理",
          entry.action
        )}${actionList("如何验证", entry.verification, "verify")}</li>`
    )
    .join("");
  return `<section class="drift-section" id="drift">
<h2>自可信状态以来</h2>
<p><strong>${escapeHtml(status)}</strong> · 当前变化 ${drift.activeEventCount} · 已恢复 ${drift.resolvedEventCount}</p>
${drift.status === "no-baseline" ? "<p>首次扫描不会自动信任当前状态。请审核后显式保存可信状态。</p>" : ""}
${events ? `<ol class="drift-list">${events}</ol>` : ""}
</section>`;
}

function taskAgents(task: ActionTask): string[] {
  return [...new Set(task.items.map((item) => item.displayName))];
}

function relatedFindings(task: ActionTask): string {
  return `<div class="related-findings"><strong>关联发现（${
    task.items.length
  }）</strong><ul>${task.items
    .map(
      (item) =>
        `<li><span class="related-agent">${escapeHtml(
          item.displayName
        )}</span><span>${escapeHtml(
          item.finding.title
        )}</span><code>${escapeHtml(item.finding.id)}</code></li>`
    )
    .join("")}</ul></div>`;
}

function requirementCard(requirement: ActionTaskRequirement): string {
  const acceptWhen = requirement.acceptWhen
    ? `<p class="requirement-accept"><strong>接受条件</strong> ${escapeHtml(
        requirement.acceptWhen
      )}</p>`
    : requirement.disposition === "observe"
      ? ""
      : `<p class="requirement-blocked"><strong>不可接受</strong> 当前规则没有已定义的安全接受条件。</p>`;
  return `<div class="rule-requirement"><div class="requirement-head"><code>${escapeHtml(
    requirement.ruleId
  )}</code><span class="priority pri-${requirement.priority.toLowerCase()}">${escapeHtml(
    requirement.priority
  )}</span><span>${escapeHtml(SEVERITY_LABEL[requirement.severity])}</span><span>${escapeHtml(
    fixModeLabel(requirement.fixMode)
  )}</span></div><p><strong>原因</strong> ${escapeHtml(
    requirement.rationale
  )}</p>${actionList("下一步", requirement.nextSteps)}${actionList(
    "如何验证",
    requirement.verification,
    "verify"
  )}${acceptWhen}</div>`;
}

function requirementSection(task: ActionTask): string {
  return `<div class="requirements"><h3>全部规则处置条件（${
    task.requirements.length
  }）</h3>${task.requirements.map(requirementCard).join("")}</div>`;
}

type RemediationOutcome = "complete" | "mitigate" | "assist";

function remediationOutcome(
  task: ActionTask,
  profile: "safe" | "balanced" = "balanced"
): RemediationOutcome {
  const actionable = task.requirements.filter(
    (requirement) => requirement.disposition !== "observe"
  );
  if (
    actionable.length === 0 ||
    actionable.some(
      (requirement) =>
        requirement.fixMode !== "baseline" ||
        !requirement.baselineProfiles?.[profile]
    )
  ) {
    return "assist";
  }
  return actionable.every(
    (requirement) => requirement.baselineProfiles?.[profile] === "resolve"
  )
    ? "complete"
    : "mitigate";
}

function taskFixMode(task: ActionTask): string {
  const modes = new Set(task.requirements.map((requirement) => requirement.fixMode));
  if (modes.size === 1) return fixModeLabel(task.requirements[0].fixMode);
  return "组合处置（必须完成全部规则条件）";
}

function taskBaselineEffects(task: ActionTask): string {
  if (task.requirements.some((requirement) => requirement.fixMode !== "baseline")) {
    return "";
  }
  return (["balanced", "safe"] as const)
    .map((profile) => {
      const outcome = remediationOutcome(task, profile);
      return `${profile}：${outcome === "complete" ? "完整解决" : outcome === "mitigate" ? "风险缓解" : "辅助步骤"}`;
    })
    .join(" · ");
}

function platformLabel(platform: RemediationGuide["platform"]): string {
  const labels: Record<RemediationGuide["platform"], string> = {
    darwin: "macOS",
    linux: "Linux",
    win32: "Windows PowerShell",
    unsupported: "当前系统",
  };
  return labels[platform];
}

function remediationCommands(task: ActionTask): string {
  const guide = buildRemediationGuide(task);
  const hasUsefulCommand = guide.commands.some(
    (command) => command.kind !== "verify"
  );
  if (!hasUsefulCommand) return "";
  const title =
    guide.mode === "baseline"
      ? `本机自动整改（${platformLabel(guide.platform)}，先预览）`
      : `本机安全引导（${platformLabel(guide.platform)}）`;
  const outcome = remediationOutcome(task);
  const commandOutcome = (item: RemediationGuide["commands"][number]): string => {
    if (item.kind === "verify") return "验证步骤";
    if (!item.completesRemediation) return "辅助步骤";
    if (outcome === "complete") return "完整解决";
    if (outcome === "mitigate") return "风险缓解";
    return "辅助步骤";
  };
  return `<div class="baseline-box remediation-box"><strong>${escapeHtml(
    title
  )}</strong>${guide.commands
    .map(
      (item) =>
        `<div class="command-row"><small>${escapeHtml(
          item.label
        )} <span class="command-outcome outcome-${commandOutcome(item) === "完整解决" ? "complete" : commandOutcome(item) === "风险缓解" ? "mitigate" : "assist"}">${escapeHtml(
          commandOutcome(item)
        )}</span></small><code>${escapeHtml(
          item.command
        )}</code><button type="button" class="copy-command">复制命令</button></div>`
    )
    .join("")}${guide.notes
    .map((note) => `<small class="remediation-note">${escapeHtml(note)}</small>`)
    .join("")}</div>`;
}

function providerTrustCommand(task: ActionTask): string {
  const candidate = providerTrustCandidateForTask(task);
  if (!candidate) return "";
  const command = `agentguard trust add "${candidate.endpoint}" --kind trusted --reason "填写端点所有者、用途和核实依据"`;
  return `<div class="accept-box trust-box"><strong>这是你确认控制的自建/内部端点？</strong>` +
    `<div class="command-row"><code>${escapeHtml(command)}</code><button type="button" class="copy-command">复制命令</button></div>` +
    `<small>该操作只消除“未知端点”提示，并保留项目级审计；HTTP、明文密钥和危险权限风险仍会显示。原因可能进入版本控制，请勿填写秘密。</small></div>`;
}

function projectIgnoreCommands(task: ActionTask): string {
  const candidates = ruleIgnoreCandidatesForTask(task);
  if (candidates.length === 0) return "";
  return `<div class="accept-box ignore-box"><strong>项目内不再提示这些已审核规则</strong>${candidates
    .map((candidate) => {
      const command =
        `agentguard ignore add ${task.taskId} --rule ${candidate.ruleId} ` +
        '--reason "填写审核依据；不要包含密钥或敏感信息"';
      return `<div class="command-row"><small>${escapeHtml(candidate.ruleId)}</small><code>${escapeHtml(
        command
      )}</code><button type="button" class="copy-command">复制命令</button></div>`;
    })
    .join("")}<small>只对当前项目和当前 Agent 生效，但 evidence/task ID 变化后仍会隐藏；P0/P1、强制修复和高风险家族不提供此操作。原因可能进入版本控制，请勿填写秘密。</small></div>`;
}

function actionCard(task: ActionTask, p0ExpiresOn: string): string {
  const finding = task.primary.finding;
  const disposition = normalizedDisposition(task.disposition);
  const priority = normalizedPriority(task.priority);
  const agents = taskAgents(task);
  const missingAcceptanceRules = taskMissingAcceptanceRules(task);
  const parts: string[] = [];
  parts.push(
    `<article class="action-card action-${disposition}" id="${escapeHtml(
      task.taskId
    )}">`
  );
  parts.push(
    `<div class="action-head"><span class="priority pri-${priority.toLowerCase()}">${priority}</span>` +
      `<span class="action-title">${escapeHtml(finding.title)}</span>` +
      (task.items.length > 1
        ? `<span class="task-size">${task.items.length} 项关联</span>`
        : "") +
      `</div>`
  );
  parts.push(
    `<div class="action-meta"><span>${escapeHtml(agents.join("、"))}</span>` +
      `<span>${escapeHtml(SEVERITY_LABEL[task.severity])}</span>` +
      `<span class="rule-id">${escapeHtml(task.taskId)}</span></div>`
  );
  parts.push(relatedFindings(task));
  parts.push(
    `<p class="action-why"><strong>为什么要处理</strong> ${escapeHtml(
      task.requirements.length > 1
        ? `这是一个聚合任务，必须同时处理或逐项接受全部 ${task.requirements.length} 条关联规则；不能只按主规则判断。`
        : task.requirements[0].rationale
    )}</p>`
  );
  parts.push(requirementSection(task));
  parts.push(
    `<div class="fix-mode"><strong>处置方式</strong> ${escapeHtml(
      taskFixMode(task)
    )}${taskBaselineEffects(task) ? ` · ${escapeHtml(taskBaselineEffects(task))}` : ""}</div>`
  );
  parts.push(remediationCommands(task));
  parts.push(providerTrustCommand(task));
  parts.push(projectIgnoreCommands(task));
  if (missingAcceptanceRules.length === 0) {
    parts.push(
      `<div class="accept-box"><strong>确认暂不修复整组任务</strong>` +
        `<code>agentguard risk accept ${escapeHtml(
          task.taskId
        )} --reason "填写真实接受原因"${priority === "P0" ? ` --expires ${escapeHtml(p0ExpiresOn)}` : ""} --confirm</code>` +
        `<small>命令执行前会再次列出全部规则、严重度和接受条件。接受后整组规则不再进入默认待办和退出码判断；可用 agentguard risk revoke ${escapeHtml(
          task.taskId
        )} 随时撤销。${priority === "P0" ? "P0 任务必须设置到期时间。" : ""}</small></div>`
    );
  } else {
    parts.push(
      `<div class="accept-box blocked"><strong>当前不能接受整组任务</strong><small>以下规则没有已定义的安全接受条件：${escapeHtml(
        missingAcceptanceRules.join("、")
      )}。请先完成修复。</small></div>`
    );
  }
  parts.push(
    `<div class="verify-box"><strong>处置后验证当前任务</strong><code>agentguard risk verify ${escapeHtml(
      task.taskId
    )}</code><small>本报告是静态快照；执行处置命令不会自动刷新。请运行 verify，必要时重新生成 HTML。</small></div>`
  );
  parts.push("</article>");
  return parts.join("");
}

function acceptedSection(
  tasks: ActionTask[],
  acceptances: ReadonlyMap<string, HtmlAcceptedTask>
): string {
  if (tasks.length === 0) return "";
  return `<section class="accepted-section" id="actions-accepted"><div class="section-head"><div><h2>已接受风险</h2><p>这些事项已由用户确认暂不处理，不进入默认待办；技术证据仍保留在报告下方。</p></div><span class="section-count">${tasks.length}</span></div>${tasks
    .map((task) => {
      const record = acceptances.get(task.taskId);
      const expires = record?.expiresAt
        ? ` · 到期 ${escapeHtml(record.expiresAt)}`
        : " · 长期有效";
      return `<article class="accepted-card" id="accepted-${escapeHtml(
        task.taskId
      )}"><div class="action-head"><span class="accepted-badge">已接受</span><span class="action-title">${escapeHtml(
        task.primary.finding.title
      )}</span></div><div class="action-meta"><span>${escapeHtml(
        taskAgents(task).join("、")
      )}</span><span class="rule-id">${escapeHtml(
        task.taskId
      )}</span></div><p><strong>接受原因</strong> ${escapeHtml(
        record?.reason ?? "未记录"
      )}${expires}</p><code>agentguard risk revoke ${escapeHtml(
        task.taskId
      )}</code></article>`;
    })
    .join("")}</section>`;
}

function ignoredSection(
  policies: readonly ListedRuleIgnore[],
  findings: readonly IgnoredFinding[]
): string {
  if (policies.length === 0) return "";
  return `<section class="accepted-section ignored-section" id="actions-ignored"><div class="section-head"><div><h2>项目已忽略规则</h2><p>这些低优先级规则仍保留审计和技术证据，可随时撤销；策略会跨 evidence/task ID 变化持续生效。当前隐藏 ${findings.length} 项发现。</p></div><span class="section-count">${policies.length}</span></div>${policies
    .map((policy) => {
      const items = findings.filter(
        (finding) =>
          finding.agent === policy.agent && finding.finding.id === policy.ruleId
      );
      const expires = policy.expiresAt
        ? ` · 到期 ${escapeHtml(policy.expiresAt)}`
        : " · 长期有效";
      const titles = [...new Set(items.map((item) => item.finding.title))];
      const command = `agentguard ignore remove ${policy.ruleId} --agent ${policy.agent} --reason "填写撤销原因"`;
      return `<article class="accepted-card ignored-card"><div class="action-head"><span class="accepted-badge">已忽略</span><span class="action-title">${escapeHtml(
        policy.ruleId
      )}</span></div><div class="action-meta"><span>${escapeHtml(
        items[0]?.displayName ?? policy.agent
      )}</span><span>${items.length} 项当前发现</span></div><p><strong>审核原因</strong> ${escapeHtml(
        policy.reason
      )}${expires}</p><p><strong>关联发现</strong> ${escapeHtml(
        titles.join("、") || "当前扫描未命中（策略仍有效）"
      )}</p><div class="command-row"><code>${escapeHtml(
        command
      )}</code><button type="button" class="copy-command">复制命令</button></div></article>`;
    })
    .join("")}</section>`;
}

function actionSummary(tasks: ActionTask[]): string {
  const counts = Object.fromEntries(
    DISPOSITION_ORDER.map((kind) => [kind, 0])
  ) as Record<FindingDisposition, number>;
  for (const task of tasks) {
    counts[normalizedDisposition(task.disposition)]++;
  }
  return `<nav class="action-summary" aria-label="行动摘要">${DISPOSITION_ORDER.map(
    (kind) =>
      `<a class="action-count count-${kind}" href="#actions-${kind}">` +
      `<strong>${counts[kind]}</strong><span>${DISPOSITION_LABEL[kind]}</span></a>`
  ).join("")}</nav>`;
}

function topActions(tasks: ActionTask[]): string {
  const top = tasks
    .filter((task) => normalizedDisposition(task.disposition) !== "observe")
    .slice(0, 3);
  if (top.length === 0) {
    return `<section class="top-actions"><h2>建议先完成的事项</h2><p class="empty">当前没有需要立即处置的事项；请查看配置观察并确认环境符合预期。</p></section>`;
  }
  return `<section class="top-actions"><h2>建议先完成的 ${top.length} 项</h2><ol>${top
    .map((task) => {
      const priority = normalizedPriority(task.priority);
      const agents = taskAgents(task);
      return `<li><a href="#${escapeHtml(
        task.taskId
      )}"><span class="priority pri-${priority.toLowerCase()}">${priority}</span>` +
        `<span><strong>${escapeHtml(
          task.primary.finding.title
        )}</strong><small>${escapeHtml(agents.join("、"))} · ${escapeHtml(
          DISPOSITION_LABEL[normalizedDisposition(task.disposition)]
        )}${task.items.length > 1 ? ` · ${task.items.length} 项关联` : ""}</small></span></a></li>`;
    })
    .join("")}</ol></section>`;
}

function actionSections(tasks: ActionTask[], p0ExpiresOn: string): string {
  return DISPOSITION_ORDER.map((kind) => {
    const selected = tasks.filter(
      (task) => normalizedDisposition(task.disposition) === kind
    );
    const cards =
      selected.length > 0
        ? selected.map((task) => actionCard(task, p0ExpiresOn)).join("")
        : `<p class="empty">当前没有此类事项。</p>`;
    return `<section class="action-section" id="actions-${kind}"><div class="section-head"><div><h2>${DISPOSITION_LABEL[kind]}</h2><p>${DISPOSITION_HELP[kind]}</p></div><span class="section-count">${selected.length}</span></div>${cards}</section>`;
  }).join("");
}

function findingCard(f: {
  id: string;
  severity: RiskLevel;
  title: string;
  description?: string;
  evidence?: Record<string, unknown>;
  recommendation?: string;
  remediation?: string[];
}): string {
  const parts: string[] = [];
  parts.push(`<div class="finding sev-${f.severity}" data-sev="${f.severity}">`);
  parts.push(
    `<div class="f-head"><span class="badge sev-${f.severity}">${
      SEVERITY_LABEL[f.severity]
    }</span><span class="f-title">${escapeHtml(
      f.title
    )}</span><span class="f-id">${escapeHtml(f.id)}</span></div>`
  );
  if (f.description)
    parts.push(`<p class="f-desc">${escapeHtml(f.description)}</p>`);
  if (f.evidence)
    parts.push(`<div class="f-ev">${evidenceRows(f.evidence)}</div>`);
  if (f.recommendation)
    parts.push(
      `<p class="f-rec"><strong>建议</strong> ${escapeHtml(
        f.recommendation
      )}</p>`
    );
  if (f.remediation?.length)
    parts.push(
      `<div class="f-steps-wrap"><strong>手动整改步骤</strong><ol class="f-steps">${f.remediation
        .map((step) => `<li>${escapeHtml(step)}</li>`)
        .join("")}</ol></div>`
    );
  parts.push(`</div>`);
  return parts.join("");
}

/** 统计一组 findings 的各严重度计数。 */
function countBySeverity(
  findings: { severity: RiskLevel }[]
): Record<RiskLevel, number> {
  const counts: Record<RiskLevel, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

/** 取一组 findings 的最高严重度（空则 undefined）。 */
function topSeverity(findings: { severity: RiskLevel }[]): RiskLevel | undefined {
  let top: RiskLevel | undefined;
  for (const f of findings) {
    if (top === undefined || SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[top]) {
      top = f.severity;
    }
  }
  return top;
}

const SEVERITY_COLUMNS: RiskLevel[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

/** 顶部总览表：每个已配置 Agent 一行 + 跨 Agent 关联行。 */
function agentOverview(report: ScanReport): string {
  const rows: string[] = [];

  for (const r of report.results) {
    if (!r.discovery.configFound) continue;
    const counts = countBySeverity(r.findings);
    const top = topSeverity(r.findings);
    const topBadge = top
      ? `<span class="badge sev-${top}">${SEVERITY_LABEL[top]}</span>`
      : `<span class="tag ok">✓</span>`;
    const cells = SEVERITY_COLUMNS.map(
      (s) => `<td class="num${counts[s] ? "" : " zero"}">${counts[s]}</td>`
    ).join("");
    rows.push(
      `<tr><td class="ag"><a href="#agent-${escapeHtml(
        r.agent
      )}">${escapeHtml(r.displayName)}</a></td><td>${topBadge}</td>${cells}<td class="num total">${
        r.findings.length
      }</td></tr>`
    );
  }

  const correlations = report.correlations ?? [];
  if (correlations.length > 0) {
    const counts = countBySeverity(correlations);
    const top = topSeverity(correlations);
    const topBadge = top
      ? `<span class="badge sev-${top}">${SEVERITY_LABEL[top]}</span>`
      : "";
    const cells = SEVERITY_COLUMNS.map(
      (s) => `<td class="num${counts[s] ? "" : " zero"}">${counts[s]}</td>`
    ).join("");
    rows.push(
      `<tr><td class="ag"><a href="#correlation">跨 Agent 关联</a></td><td>${topBadge}</td>${cells}<td class="num total">${correlations.length}</td></tr>`
    );
  }

  if (rows.length === 0) return "";

  const head = `<tr><th>Agent</th><th>最高</th>${SEVERITY_COLUMNS.map(
    (s) => `<th>${SEVERITY_LABEL[s]}</th>`
  ).join("")}<th>合计</th></tr>`;

  return `<table class="overview"><thead>${head}</thead><tbody>${rows.join(
    ""
  )}</tbody></table>`;
}

function agentSection(r: AgentScanResult): string {
  const parts: string[] = [];
  parts.push(`<section class="agent" id="agent-${escapeHtml(r.agent)}">`);
  const status = !r.discovery.configFound
    ? `<span class="tag muted">未配置</span>`
    : r.findings.length === 0
      ? `<span class="tag ok">✓ 未发现风险</span>`
      : `<span class="tag">${r.findings.length} 项</span>`;
  parts.push(
    `<h2>${escapeHtml(r.displayName)} ${status}</h2>`
  );
  if (r.discovery.configPath) {
    parts.push(
      `<p class="cfgpath">${escapeHtml(r.discovery.configPath)}</p>`
    );
  }
  const sorted = [...r.findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
  for (const f of sorted) parts.push(findingCard(f));
  parts.push(`</section>`);
  return parts.join("");
}

/** 跨 Agent 关联区块（无关联项则为空字符串）。 */
function correlationSection(report: ScanReport): string {
  const correlations = report.correlations ?? [];
  if (correlations.length === 0) return "";
  const sorted = [...correlations].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
  const parts: string[] = [];
  parts.push(`<section class="agent" id="correlation">`);
  parts.push(
    `<h2>跨 Agent 关联 <span class="tag">${correlations.length} 项</span></h2>`
  );
  parts.push(
    `<p class="cfgpath">派生自各 Agent 端点/代理，标出多个 Agent 汇聚的单点失陷面。</p>`
  );
  for (const f of sorted) parts.push(findingCard(f));
  parts.push(`</section>`);
  return parts.join("");
}

function summaryBadges(report: ScanReport): string {
  const counts: Record<RiskLevel, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const f of report.allFindings) counts[f.severity]++;
  for (const f of report.correlations ?? []) counts[f.severity]++;
  const total = SEVERITY_COLUMNS.reduce((n, s) => n + counts[s], 0);
  // "全部" + 各严重度徽标均带 data-filter，供内联脚本做过滤；徽标本身可点击。
  const all = `<button class="sum badge filter active" data-filter="all">全部 ${total}</button>`;
  const badges = SEVERITY_COLUMNS.map(
    (s) =>
      `<button class="sum badge filter sev-${s}" data-filter="${s}">${SEVERITY_LABEL[s]} ${counts[s]}</button>`
  ).join("");
  return all + badges;
}

const STYLE = `
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;margin:0;background:#0f1115;color:#e6e6e6}
.wrap{max-width:880px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:22px;margin:0 0 4px}
.meta{color:#8a90a0;font-size:12px;margin-bottom:20px}
.snapshot-notice{margin:0 0 18px;padding:10px 12px;border-left:3px solid #3b82f6;background:#151c2a;color:#bfdbfe;font-size:12px}
.posture-section,.drift-section{margin:18px 0 24px;padding:18px;border:1px solid #263044;border-radius:12px;background:#111722}
.posture-section h2,.drift-section h2{margin-top:0}
.posture-summary{margin:10px 0 14px;color:#bfdbfe}
.posture-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
.posture-card{padding:14px;border:1px solid #2d3748;border-radius:10px;background:#0d121c}
.posture-head{display:flex;justify-content:space-between;gap:12px;align-items:center}
.posture-head h3{margin:0}.posture-confidence{font-size:12px;color:#93c5fd}
.posture-facts{margin:12px 0}.posture-facts div{margin:7px 0}.posture-facts dt{font-size:12px;color:#94a3b8}.posture-facts dd{margin:2px 0;overflow-wrap:anywhere}
.posture-list,.drift-list{padding-left:20px}.posture-list li,.drift-list>li{margin:8px 0}
.posture-uncertainty{margin-top:10px;padding:10px;border-left:3px solid #f59e0b;background:#20190d;color:#fde68a}
.posture-uncertainty ul{margin-bottom:0}
.drift-list>li{padding:10px;border-bottom:1px solid #263044}.drift-list>li:last-child{border-bottom:0}
.action-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0 24px}
.action-count{display:flex;align-items:baseline;gap:8px;padding:13px 14px;border:1px solid #303746;border-radius:10px;background:#161a22;color:#e6e6e6;text-decoration:none}
.action-count:hover{border-color:#64748b}
.action-count strong{font-size:22px;line-height:1}
.action-count span{font-size:12px;color:#aeb5c3}
.count-fix{border-top:3px solid #ef4444}
.count-review{border-top:3px solid #f59e0b}
.count-cleanup{border-top:3px solid #3b82f6}
.count-observe{border-top:3px solid #64748b}
.top-actions{margin:0 0 28px;padding:18px 20px;background:#1b2130;border:1px solid #34415a;border-radius:10px}
.top-actions h2,.action-section h2,.evidence-title{font-size:17px;margin:0}
.top-actions ol{margin:12px 0 0;padding-left:24px}
.top-actions li{padding:5px 0}
.top-actions a{display:flex;align-items:flex-start;gap:10px;color:#e6e6e6;text-decoration:none}
.top-actions a:hover strong{text-decoration:underline}
.top-actions a>span:last-child{display:flex;flex-direction:column}
.top-actions small{color:#8a90a0}
.priority{display:inline-block;min-width:34px;padding:2px 7px;border-radius:6px;text-align:center;font-size:11px;font-weight:800;color:#fff;white-space:nowrap}
.pri-p0{background:#b91c1c}.pri-p1{background:#b45309}.pri-p2{background:#1d4ed8}.pri-p3{background:#475569}
.action-section{margin:0 0 28px}
.section-head{display:flex;align-items:center;justify-content:space-between;margin:0 0 10px}
.section-head p{margin:2px 0 0;color:#8a90a0;font-size:12px}
.section-count{display:inline-grid;place-items:center;min-width:30px;height:30px;padding:0 8px;border-radius:15px;background:#232936;font-weight:700}
.action-card{padding:16px 18px;margin:10px 0;background:#161a22;border:1px solid #2b3241;border-left:4px solid #64748b;border-radius:8px}
.action-card.action-fix{border-left-color:#ef4444}.action-card.action-review{border-left-color:#f59e0b}.action-card.action-cleanup{border-left-color:#3b82f6}
.action-head{display:flex;align-items:center;gap:10px}
.action-title{font-size:15px;font-weight:700}
.task-size{padding:1px 7px;border-radius:8px;background:#293243;color:#cbd5e1;font-size:11px;white-space:nowrap}
.action-meta{display:flex;gap:7px;flex-wrap:wrap;margin:5px 0 10px;color:#8a90a0;font-size:11px}
.action-meta span{padding:1px 7px;background:#202633;border-radius:8px}
.action-meta .rule-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.related-findings{margin:9px 0;padding:9px 11px;background:#10141c;border-radius:7px;color:#cbd5e1;font-size:12px}
.related-findings>strong{color:#e6e6e6}
.related-findings ul{list-style:none;margin:6px 0 0;padding:0}
.related-findings li{display:grid;grid-template-columns:minmax(70px,auto) 1fr auto;gap:8px;align-items:baseline;padding:3px 0;border-top:1px solid #202633}
.related-findings li:first-child{border-top:0}
.related-findings code{color:#8a90a0;font-size:10px;word-break:break-all}
.related-agent{color:#7dd3fc;white-space:nowrap}
.action-why,.accept{margin:9px 0;color:#c3c8d4}
.action-why strong,.accept strong,.fix-mode strong,.action-list strong,.baseline-box strong,.accept-box strong{color:#e6e6e6;margin-right:5px}
.action-list{margin:10px 0;padding:10px 12px;background:#121722;border-radius:7px;color:#d7dbe4}
.action-list.verify{background:#112019;color:#c7ead2}
.action-list ol{margin:5px 0 0;padding-left:22px}
.action-list li{margin:3px 0}
.requirements{margin:12px 0}.requirements h3{font-size:13px;margin:0 0 8px;color:#e6e6e6}
.rule-requirement{margin:8px 0;padding:11px 12px;background:#10141c;border:1px solid #293243;border-radius:7px}
.rule-requirement p{margin:7px 0;color:#cbd5e1;font-size:13px}.rule-requirement .action-list{margin:8px 0 0}
.requirement-head{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.requirement-head code{color:#7dd3fc;font-size:11px}.requirement-head span:not(.priority){padding:1px 7px;background:#202633;border-radius:8px;color:#aeb5c3;font-size:11px}
.requirement-accept{padding-top:7px;border-top:1px dashed #303746}.requirement-blocked{padding:7px 9px;background:#2b1717!important;border-radius:5px;color:#fecaca!important}
.fix-mode{margin:10px 0 0;color:#93c5fd;font-size:13px}
.baseline-box{display:flex;flex-direction:column;gap:5px;margin:10px 0;padding:11px 12px;background:#0c0e14;border:1px solid #293243;border-radius:7px}
.baseline-box code{padding:5px 8px;background:#171c26;border-radius:4px;color:#a7f3d0;white-space:pre-wrap;word-break:break-all}
.baseline-box small{color:#fcd34d}
.command-row{display:grid;grid-template-columns:1fr auto;gap:5px 8px;align-items:center}
.command-row small{grid-column:1/-1;color:#aeb5c3}
.command-outcome{display:inline-block;margin-left:5px;padding:1px 6px;border-radius:8px;font-size:10px}.outcome-complete{background:#14532d;color:#bbf7d0}.outcome-mitigate{background:#713f12;color:#fde68a}.outcome-assist{background:#334155;color:#cbd5e1}
.command-row code{min-width:0}
.copy-command{padding:5px 9px;border:1px solid #3b465a;border-radius:5px;background:#202838;color:#dbeafe;cursor:pointer;font:12px inherit;white-space:nowrap}
.copy-command:hover{border-color:#60a5fa}.copy-command.copied{color:#a7f3d0;border-color:#22c55e}
.remediation-note{color:#fcd34d!important}
.accept{padding-top:8px;border-top:1px dashed #303746;color:#cbd5e1;font-size:13px}
.accept-box{display:flex;flex-direction:column;gap:5px;margin:10px 0 0;padding:11px 12px;background:#171521;border:1px solid #3b334d;border-radius:7px}
.accept-box.blocked{background:#261719;border-color:#7f1d1d}.verify-box{display:flex;flex-direction:column;gap:5px;margin:10px 0 0;padding:11px 12px;background:#112019;border:1px solid #28543a;border-radius:7px}.verify-box small{color:#aeb5c3}
.accept-box code,.accepted-card code,.verify-box code{padding:5px 8px;background:#0c0e14;border-radius:4px;color:#c4b5fd;white-space:pre-wrap;word-break:break-all}.verify-box code{color:#a7f3d0}
.accept-box small{color:#aeb5c3}
.accepted-section{margin:36px 0 28px;padding-top:24px;border-top:1px dashed #3b4251}
.accepted-section h2{font-size:17px;margin:0}
.accepted-card{padding:14px 16px;margin:10px 0;background:#14151b;border:1px solid #292d37;border-left:4px solid #8b5cf6;border-radius:8px;color:#cbd5e1}
.ignored-card{border-left-color:#0ea5e9}.ignored-card .accepted-badge{background:#0369a1}
.accepted-card p{margin:8px 0}.accepted-card p strong{color:#e6e6e6;margin-right:5px}
.accepted-badge{padding:2px 7px;border-radius:6px;background:#6d28d9;color:#fff;font-size:11px;font-weight:700}
.empty{margin:10px 0;color:#8a90a0}
.evidence-block{margin-top:42px;padding-top:28px;border-top:1px solid #303746}
.evidence-intro{color:#8a90a0;margin:4px 0 14px;font-size:12px}
.summary{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}
.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;white-space:nowrap}
.sum{font-size:13px;padding:4px 12px}
button.filter{border:1px solid transparent;cursor:pointer;font-family:inherit;opacity:.55;transition:opacity .12s}
button.filter:hover{opacity:.85}
button.filter.active{opacity:1;box-shadow:0 0 0 2px #e6e6e6 inset}
button.filter[data-filter="all"]{background:#334155;color:#e6e6e6}
.overview{width:100%;border-collapse:collapse;margin-bottom:28px;font-size:13px}
.overview th,.overview td{padding:7px 10px;border-bottom:1px solid #232936;text-align:center}
.overview th{color:#8a90a0;font-weight:600;font-size:12px}
.overview td.ag{text-align:left}
.overview td.ag a{color:#7dd3fc;text-decoration:none}
.overview td.ag a:hover{text-decoration:underline}
.overview td.num{font-variant-numeric:tabular-nums;color:#cbd5e1}
.overview td.num.zero{color:#4b5563}
.overview td.total{font-weight:700;color:#e6e6e6}
.sev-critical{background:#7f1d1d;color:#fff}
.sev-high{background:#b45309;color:#fff}
.sev-medium{background:#a16207;color:#fff}
.sev-low{background:#1e40af;color:#fff}
.sev-info{background:#334155;color:#cbd5e1}
.agent{margin:0 0 28px;padding:18px 20px;background:#161a22;border:1px solid #232936;border-radius:10px}
.agent h2{font-size:16px;margin:0 0 4px;display:flex;align-items:center;gap:10px}
.tag{font-size:12px;font-weight:600;color:#cbd5e1;background:#232936;padding:2px 10px;border-radius:10px}
.tag.ok{background:#14532d;color:#bbf7d0}
.tag.muted{background:#232936;color:#6b7280}
.cfgpath{font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#6b7280;margin:0 0 12px;word-break:break-all}
.finding{border-left:3px solid #334155;padding:10px 14px;margin:10px 0;background:#12151d;border-radius:0 8px 8px 0}
.finding.sev-critical{border-left-color:#ef4444}
.finding.sev-high{border-left-color:#f59e0b}
.finding.sev-medium{border-left-color:#eab308}
.finding.sev-low{border-left-color:#3b82f6}
.finding.sev-info{border-left-color:#64748b}
.f-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.f-title{font-weight:600}
.f-id{margin-left:auto;font:11px ui-monospace,Menlo,monospace;color:#6b7280}
.f-desc{margin:8px 0 6px;color:#c3c8d4}
.f-ev{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:#0c0e14;border-radius:6px;padding:8px 10px;margin:6px 0}
.ev{display:flex;gap:8px}
.ev-k{color:#7dd3fc;flex:0 0 auto}
.ev-v{color:#cbd5e1;word-break:break-all}
.f-rec{margin:8px 0 2px;color:#a7f3d0;font-size:13px}
.f-steps-wrap{margin:8px 0 2px;color:#fcd34d;font-size:13px}
.f-steps{margin:4px 0 0;padding-left:22px}
.f-steps li{margin:2px 0}
footer{color:#6b7280;font-size:12px;margin-top:32px;text-align:center}
@media(max-width:640px){.action-summary{grid-template-columns:repeat(2,1fr)}.wrap{padding-left:14px;padding-right:14px}.related-findings li{grid-template-columns:1fr}.related-agent{white-space:normal}}
`;

/**
 * 内联严重度过滤脚本（纯 DOM，无外部依赖，保持报告离线自包含）。
 * 点顶部严重度徽标 → 只显示该 severity 的 .finding；点"全部"复位。
 * 过滤后无匹配项的 section/关联区整段隐藏，避免留空标题。
 */
const FILTER_SCRIPT = `
(function(){
  var buttons=document.querySelectorAll('button.filter');
  var findings=document.querySelectorAll('.finding');
  var sections=document.querySelectorAll('section.agent');
  function apply(sev){
    findings.forEach(function(f){
      f.style.display=(sev==='all'||f.getAttribute('data-sev')===sev)?'':'none';
    });
    sections.forEach(function(s){
      var visible=s.querySelectorAll('.finding');
      var any=false;
      visible.forEach(function(f){ if(f.style.display!=='none') any=true; });
      s.style.display=(sev==='all'||any)?'':'none';
    });
    buttons.forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-filter')===sev);
    });
  }
  buttons.forEach(function(b){
    b.addEventListener('click',function(){ apply(b.getAttribute('data-filter')); });
  });
  document.querySelectorAll('button.copy-command').forEach(function(button){
    button.addEventListener('click',function(){
      var code=button.previousElementSibling;
      var value=code&&code.textContent?code.textContent:'';
      if(!value)return;
      function done(){button.textContent='已复制';button.classList.add('copied');setTimeout(function(){button.textContent='复制命令';button.classList.remove('copied');},1200);}
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(value).then(done).catch(function(){window.prompt('复制下面的命令',value);});
      }else{window.prompt('复制下面的命令',value);}
    });
  });
})();
`;

/** 生成完整 HTML 报告字符串。 */
export function renderHtmlReport(
  report: ScanReport,
  opts: HtmlReportOptions = {}
): string {
  const generatedAt = opts.generatedAt ?? new Date();
  const when = generatedAt.toISOString();
  const p0ExpiresOn = new Date(
    generatedAt.getTime() + 30 * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10);
  const total = report.allFindings.length + (report.correlations?.length ?? 0);
  const ignored = applyRuleIgnores(report, opts.ruleIgnores);
  const tasks = buildActionTasks(buildActionPlan(ignored.report));
  const acceptances = new Map(
    (opts.acceptances ?? []).map((record) => [record.taskId, record])
  );
  const activeTasks = tasks.filter((task) => !acceptances.has(task.taskId));
  const acceptedTasks = tasks.filter((task) => acceptances.has(task.taskId));
  const actionable = activeTasks.filter(
    (task) => normalizedDisposition(task.disposition) !== "observe"
  ).length;
  const overview = agentOverview(report);
  const body = report.results.map(agentSection).join("\n");
  const correlations = correlationSection(report);

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AgentGuard 报告</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<h1>AgentGuard 下一步行动报告</h1>
<div class="meta">生成时间 ${escapeHtml(when)} · 共 ${total} 项发现 · ${activeTasks.length} 个行动任务 · ${actionable} 个需要行动${acceptedTasks.length > 0 ? ` · ${acceptedTasks.length} 个已接受` : ""}${ignored.ignoredFindings.length > 0 ? ` · ${ignored.ignoredFindings.length} 条项目规则已忽略` : ""}</div>
<p class="snapshot-notice">这是生成时刻的静态快照，不会因配置修改自动刷新。完成处置后请运行卡片中的 <code>agentguard risk verify task-...</code>，并重新生成报告。</p>
${postureSection(opts.posture)}
${driftSection(opts.drift)}
${actionSummary(activeTasks)}
${topActions(activeTasks)}
${actionSections(activeTasks, p0ExpiresOn)}
${acceptedSection(acceptedTasks, acceptances)}
${ignoredSection(ignored.activeRuleIgnores, ignored.ignoredFindings)}
<div class="evidence-block" id="technical-evidence">
<h2 class="evidence-title">按 Agent 查看技术证据</h2>
<p class="evidence-intro">严重度表示潜在影响，不等同于行动优先级。可用下方按钮筛选完整发现。</p>
<div class="summary">${summaryBadges(report)}</div>
${overview}
${body}
${correlations}
</div>
<footer>由 AgentGuard 生成 · 证据均已脱敏，不含明文密钥</footer>
</div>
<script>${FILTER_SCRIPT}</script>
</body>
</html>`;
}
