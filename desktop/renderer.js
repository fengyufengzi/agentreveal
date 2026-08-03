const state = {
  projectPath: undefined,
  scopeKind: undefined,
  overview: undefined,
  baseline: undefined,
  lastReportPath: undefined,
  pendingAcceptTask: undefined,
  pendingTrust: undefined,
  pendingIgnore: undefined,
  lastBaselineApply: undefined,
  posturePreview: undefined,
  credentialBackups: [],
  selectedAgent: undefined,
  initialScanState: "idle",
  initialScanError: undefined,
  working: false,
};

const $ = (id) => document.getElementById(id);
const content = $("content");
const summary = $("summary");
const status = $("status");
const statusText = $("statusText");
const statusHint = $("statusHint");
const operationProgress = $("operationProgress");
const assertiveStatus = $("assertiveStatus");
const diagnosticData = $("diagnosticData");
const baselineProfile = $("baselineProfile");

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function scrollMainTo(id, offset = 0) {
  const main = $("mainContent");
  const target = $(id);
  if (!main || !target) return;
  const top = main.scrollTop
    + target.getBoundingClientRect().top
    - main.getBoundingClientRect().top
    - offset;
  main.scrollTo({
    top: Math.max(0, top),
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(text, kind = "idle", hint = "") {
  const resolvedHint = hint || (
    kind === "error"
      ? "操作没有完成。请检查当前配置或重试；诊断导出不会包含配置内容。"
      : kind === "ok"
        ? "状态已经更新，可以继续处理下一项。"
        : ""
  );
  status.className = `status ${kind}`;
  document.body.classList.toggle(
    "has-standalone-status",
    !state.overview && text !== "等待选择项目"
  );
  statusText.textContent = text;
  statusHint.textContent = resolvedHint;
  statusHint.hidden = !resolvedHint;
  operationProgress.hidden = kind !== "working";
  operationProgress.setAttribute("aria-valuetext", text);
  status.setAttribute("aria-live", kind === "error" ? "off" : "polite");
  if (kind === "error") {
    assertiveStatus.textContent = text;
  } else {
    assertiveStatus.textContent = "";
  }
}

function setDialogControlsWorking(working) {
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.setAttribute("aria-busy", String(working && dialog.open));
    dialog.querySelectorAll("button, input, textarea, select").forEach((control) => {
      if (working && dialog.open && !control.disabled) {
        control.dataset.operationDisabled = "true";
        control.disabled = true;
      } else if (!working && control.dataset.operationDisabled === "true") {
        delete control.dataset.operationDisabled;
        control.disabled = false;
      }
    });
  });
}

function setWorking(working) {
  state.working = working;
  document.body.classList.toggle("is-working", working);
  $("mainContent").setAttribute("aria-busy", String(working));
  const shouldInertContent = working
    && (Boolean(state.overview) || state.initialScanState !== "scanning");
  content.toggleAttribute("inert", shouldInertContent);
  $("runBtn").disabled = working || !state.overview;
  $("machineScopeBtn").disabled = working;
  $("selectProjectBtn").disabled = working;
  $("exportHtmlBtn").disabled = working || !state.overview;
  $("exportJsonBtn").disabled = working || !state.overview;
  $("openReportBtn").disabled = working || !state.lastReportPath;
  $("exportDiagnosticsBtn").disabled = working;
  setDialogControlsWorking(working);
  if (!working) operationProgress.hidden = true;
  updateNativeMenuState();
}

function focusResultsHeading() {
  const heading = $("agentsSectionTitle");
  if (!heading) return;
  heading.focus({ preventScroll: true });
  scrollMainTo("agentsSection");
}

function focusInitialScanHeading() {
  const heading = $("initialScanTitle");
  if (!heading) return;
  heading.focus({ preventScroll: true });
  scrollMainTo("initialScanTitle");
}

function focusInitialScanError() {
  const heading = $("initialScanErrorTitle");
  if (!heading) return;
  heading.focus({ preventScroll: true });
  scrollMainTo("initialScanError");
}

function focusTask(taskId) {
  const card = document.querySelector(`[data-task-card="${CSS.escape(taskId)}"]`);
  if (!card) return;
  card.focus({ preventScroll: true });
  card.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "center",
  });
}

function updateNativeMenuState() {
  if (!window.agentguard || typeof window.agentguard.updateMenuState !== "function") return;
  window.agentguard.updateMenuState({
    hasOverview: Boolean(state.overview),
    hasReport: Boolean(state.lastReportPath),
    working: state.working,
  });
}

function closeTransientMenus(except) {
  document
    .querySelectorAll(".report-menu[open], .task-policy-menu[open]")
    .forEach((menu) => {
      if (menu !== except) menu.open = false;
    });
}

function renderCards(items) {
  summary.innerHTML = items
    .map(
      (item) =>
        `<div class="card" data-tone="${escapeHtml(item.tone || "neutral")}"><strong>${escapeHtml(item.value)}</strong><span>${escapeHtml(
          item.label
        )}</span></div>`
    )
    .join("");
}

function list(items) {
  return items?.length
    ? `<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`
    : "";
}

function desktopVerification(items) {
  return (items || []).map((item) =>
    item.includes("agentguard scan")
      ? "完成处置后点击卡片下方“复扫验证”，确认该任务已消失或符合接受条件。"
      : item
  );
}

async function copyCommand(command, button) {
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(command);
      copied = true;
    }
  } catch {
    // file:// 或系统权限不允许 Clipboard API 时继续使用本地选择复制。
  }
  if (!copied) {
    const input = document.createElement("textarea");
    input.value = command;
    input.readOnly = true;
    input.className = "clipboard-fallback";
    document.body.append(input);
    try {
      input.select();
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    } finally {
      input.remove();
    }
  }
  if (!copied) {
    window.prompt("请按 ⌘C 复制下面的命令", command);
    return;
  }
  const originalLabel = button.textContent;
  button.textContent = "已复制";
  button.dataset.copied = "true";
  window.setTimeout(() => {
    if (!button.isConnected) return;
    button.textContent = originalLabel;
    delete button.dataset.copied;
  }, 1800);
}

function credentialBackupForTask(taskId) {
  return state.credentialBackups.find(
    (backup) =>
      backup.scopePath === state.projectPath && backup.taskId === taskId
  );
}

function transactionLabel(transaction) {
  const labels = {
    "awaiting-external-verification": "等待外部验证",
    verified: "已应用并复扫",
    "rolled-back": "验证失败，已回滚",
    restored: "已恢复",
    "backup-cleaned": "备份已清理",
  };
  return labels[transaction?.phase] || "处理中";
}

function postMigrationVerification(backup) {
  if (backup.phase !== "verified" || !backup.verification) return "";
  return `<div class="credential-auth-check">
    <strong>最后确认真实鉴权</strong>
    <p>AgentGuard 已验证配置与复扫，但无法代替一次真实请求。请在新 Terminal 检查认证状态，再重启 Claude Code 完成一次最小请求。</p>
    <div class="command-list"><div class="command-item">
      <div class="command-heading"><span>${escapeHtml(backup.verification.label)}</span><button type="button" class="command-copy" data-copy-command="${escapeHtml(backup.verification.command)}" aria-label="复制 Claude 认证状态检查命令">复制命令</button></div>
      <code>${escapeHtml(backup.verification.command)}</code>
    </div></div>
    ${list(backup.verification.successEvidence)}
    <p>确认上述结果正常后可删除迁移备份；删除后不能一键恢复，普通删除也不等同于 SSD 安全擦除。</p>
  </div>`;
}

function credentialSafetyControls(task, guide) {
  const supportsBackup = guide?.commands?.some(
    (command) => command.id === "macos-claude-keychain-helper"
  );
  if (!supportsBackup) return "";
  const backup = credentialBackupForTask(task.taskId);
  if (backup) {
    const currentTransactionLabel = transactionLabel(backup.transaction);
    const applyDisabled = backup.phase === "verified" ? "disabled" : "";
    return `<section class="credential-safety" data-credential-backup="${escapeHtml(backup.backupId)}">
      <div class="credential-safety-copy"><strong>${escapeHtml(currentTransactionLabel)}</strong>
        <ol class="credential-steps">
          <li data-step-state="complete">已备份 ${escapeHtml(backup.files)} 个 Claude 设置文件</li>
          <li data-step-state="${backup.phase === "verified" ? "complete" : "current"}">在 Terminal 写入并检查 Keychain；凭证只输入 Terminal</li>
          <li data-step-state="${backup.phase === "verified" ? "complete" : "pending"}">AgentGuard 删除明文字段、设置 apiKeyHelper 并复扫</li>
        </ol>
        <p>${escapeHtml(backup.transaction?.message || "应用前会重新核对任务、配置指纹和备份。失败会自动回滚。")}</p>
        ${postMigrationVerification(backup)}
      </div>
      <div class="credential-actions">
        <button class="primary-action" data-credential-action="apply" data-task-id="${escapeHtml(task.taskId)}" data-backup-id="${escapeHtml(backup.backupId)}" ${applyDisabled}>${backup.phase === "verified" ? "已完成复扫" : "Terminal 已验证，应用并复扫"}</button>
        <button class="danger-ghost" data-credential-action="restore" data-backup-id="${escapeHtml(backup.backupId)}">一键恢复</button>
        ${backup.phase === "verified" ? `<button class="danger-ghost" data-credential-action="cleanup" data-task-id="${escapeHtml(task.taskId)}" data-backup-id="${escapeHtml(backup.backupId)}">鉴权正常，清理备份</button>` : ""}
      </div>
    </section>`;
  }
  return `<section class="credential-safety">
    <div><strong>建议先备份，再执行下方命令</strong><p>备份只包含实际含明文字段的 Claude 设置文件，存放于受保护且 Git 忽略的本地目录；本次 Desktop 会话中可一键恢复。</p></div>
    <button class="quiet-action" data-credential-action="backup" data-task-id="${escapeHtml(task.taskId)}">一键备份</button>
  </section>`;
}

function credentialBackupPanel() {
  const backups = state.credentialBackups.filter(
    (backup) => backup.scopePath === state.projectPath
  );
  if (!backups.length) return "";
  return backups
    .map(
      (backup) => `<article class="finding credential-restore-panel">
        <div><h3><span class="badge low">${escapeHtml(transactionLabel(backup.transaction))}</span>Claude Code 迁移前备份</h3><p>${escapeHtml(backup.transaction?.message || "只有迁移后出现启动或鉴权异常时才恢复。")}</p>${postMigrationVerification(backup)}<div class="meta">${escapeHtml(backup.files)} 个设置文件 · 用户确认真实鉴权并主动清理前不会自动删除 · 本次 Desktop 会话可恢复</div></div>
        <div class="credential-actions"><button class="danger-ghost" data-credential-action="restore" data-backup-id="${escapeHtml(backup.backupId)}">迁移异常时恢复</button>${backup.phase === "verified" ? `<button class="danger-ghost" data-credential-action="cleanup" data-task-id="${escapeHtml(backup.taskId)}" data-backup-id="${escapeHtml(backup.backupId)}">鉴权正常，清理备份</button>` : ""}</div>
      </article>`
    )
    .join("");
}

function taskActions(task, accepted = false) {
  const projectPoliciesAvailable = state.scopeKind === "project";
  const guide = state.overview?.firstRun?.remediationGuides?.[task.taskId];
  const activeCredentialBackup = credentialBackupForTask(task.taskId);
  const remediationAction =
    guide?.mode === "baseline"
      ? `<button class="primary-action task-primary" data-task-action="baseline" data-task-id="${escapeHtml(
          task.taskId
        )}">预览并一键整改</button>`
      : guide?.commands?.some((command) => command.kind === "store") &&
          activeCredentialBackup
        ? ""
        : guide?.commands?.some((command) => command.kind === "store")
        ? `<button class="primary-action task-primary" data-task-action="guide" data-task-id="${escapeHtml(
            task.taskId
          )}">开始安全迁移</button>`
        : `<button class="quiet-action" data-task-action="guide" data-task-id="${escapeHtml(
            task.taskId
          )}">查看修复步骤</button>`;
  const trustCandidate = state.overview?.trustCandidates?.[task.taskId];
  const trustAction = projectPoliciesAvailable && trustCandidate
    ? `<button class="policy-action" data-task-action="trust" data-task-id="${escapeHtml(
        task.taskId
      )}">信任此端点</button>`
    : "";
  const ignoreActions = projectPoliciesAvailable
    ? (state.overview?.ignoreCandidates?.[task.taskId] || [])
    .map(
      (candidate) =>
        `<button class="policy-action" data-task-action="ignore" data-task-id="${escapeHtml(
          task.taskId
        )}" data-rule-id="${escapeHtml(candidate.ruleId)}">忽略 ${escapeHtml(
          candidate.ruleId
        )}</button>`
    )
        .join("")
    : "";
  const policyMenu = (items) => items
    ? `<details class="task-policy-menu"><summary aria-label="打开更多策略操作">更多策略</summary><div class="task-policy-popover">${items}</div></details>`
    : "";
  if (accepted) {
    return `<div class="task-actions">
      <button class="quiet-action" data-task-action="verify" data-task-id="${escapeHtml(
        task.taskId
      )}">复扫验证</button>
      ${policyMenu(`${trustAction}<button class="danger-ghost" data-task-action="revoke" data-task-id="${escapeHtml(
        task.taskId
      )}">撤销接受</button>`)}
    </div>`;
  }
  if (task.disposition === "observe") {
    return `<div class="task-actions">
      <button class="quiet-action" data-task-action="verify" data-task-id="${escapeHtml(
        task.taskId
      )}">复扫验证</button>
      ${policyMenu(ignoreActions)}
    </div>`;
  }
  const canAccept = task.requirements.every((requirement) => requirement.acceptWhen);
  const acceptAction = projectPoliciesAvailable
    ? `<button class="policy-action" data-task-action="accept" data-task-id="${escapeHtml(task.taskId)}" ${
      canAccept ? "" : "disabled title=\"该任务包含尚未定义安全接受条件的规则\""
    }>接受当前风险</button>`
    : "";
  return `<div class="task-actions">
    ${remediationAction}
    <button class="quiet-action" data-task-action="verify" data-task-id="${escapeHtml(
      task.taskId
    )}">复扫验证</button>
    ${policyMenu(`${trustAction}${ignoreActions}${acceptAction}`)}
  </div>`;
}

const SEVERITY_LABELS = {
  critical: "严重",
  high: "高",
  medium: "中",
  low: "低",
  info: "提示",
};

function taskDomId(taskId) {
  return `task-${String(taskId).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function taskCard(task, options = {}) {
  const { compact = false, accepted = false, acceptance } = options;
  const finding = task.primary.finding;
  const action = task.primary.action;
  const headingId = `${taskDomId(task.taskId)}-title`;
  const rationaleId = `${taskDomId(task.taskId)}-rationale`;
  const guide = state.overview?.firstRun?.remediationGuides?.[task.taskId];
  const credentialBackup = credentialBackupForTask(task.taskId);
  const desktopCommands = guide?.commands?.filter(
    (item) =>
      item.kind !== "verify" &&
      item.id !== "claude-credential-backup" &&
      item.id !== "macos-claude-keychain-helper"
  ) || [];
  const commands = desktopCommands.length
    ? `<h4>${credentialBackup ? "复制到 Terminal 依次执行，再返回应用配置" : "备份后复制到 Terminal 依次执行"}</h4><div class="command-list">${desktopCommands
        .map(
          (item) =>
            `<div class="command-item"><div class="command-heading"><span>${escapeHtml(
              item.label
            )}</span><button type="button" class="command-copy" data-copy-command="${escapeHtml(
              item.command
            )}" aria-label="复制命令：${escapeHtml(item.label)}">复制命令</button></div><code>${escapeHtml(
              item.command
            )}</code></div>`
        )
        .join("")}</div>`
    : "";
  const guideNotes = guide?.notes?.length
    ? `<div class="guide-notes">${guide.notes
        .map((note) => `<p>${escapeHtml(note)}</p>`)
        .join("")}</div>`
    : "";
  const credentialSafety = credentialSafetyControls(task, guide);
  const details = `<div class="technical-identity"><span>任务标识</span><code>${escapeHtml(task.taskId)}</code></div>${
    finding.remediation?.length
      ? `<h4>当前系统修复指引</h4>${list(finding.remediation)}`
      : ""
  }<h4>完整下一步</h4>${list(action.nextSteps)}<h4>如何验证</h4>${list(
    desktopVerification(action.verification)
  )}${credentialSafety}${commands}${guideNotes}<div class="guide-notes"><p>完成配置修改后，点击卡片下方“复扫验证”；Desktop 会重新扫描并更新任务状态，不需要执行 CLI 扫描命令。</p></div>`;
  return `<article class="finding task-card" data-task-card="${escapeHtml(task.taskId)}" data-severity="${escapeHtml(task.severity)}" data-priority="${escapeHtml(task.priority)}" tabindex="-1" aria-labelledby="${headingId}" aria-describedby="${rationaleId}">
    <div class="task-head">
      <div class="task-title">
        <div class="task-kicker"><span class="badge ${escapeHtml(task.severity)}" aria-hidden="true">${escapeHtml(
          task.priority
        )}</span><span class="sr-only">优先级 ${escapeHtml(task.priority)}，严重程度 ${escapeHtml(
          SEVERITY_LABELS[task.severity] || task.severity
        )}</span><span class="meta">${task.requirements.length} 条关联规则</span></div>
        <h3 id="${headingId}">${escapeHtml(finding.title)}</h3>
        <p id="${rationaleId}">${escapeHtml(action.rationale)}</p>
      </div>
      <span class="task-agent">${escapeHtml(task.displayName)}</span>
    </div>
    ${action.nextSteps?.[0] ? `<div class="quick-next"><span>建议下一步</span><strong>${escapeHtml(action.nextSteps[0])}</strong></div>` : ""}
    ${
      compact
        ? ""
        : `<details class="task-detail"><summary>查看完整处理与验证</summary><div class="task-detail-content">${details}</div></details>`
    }
    ${
      acceptance
        ? `<div class="acceptance-note"><strong>已接受</strong><span>${escapeHtml(
            acceptance.reason
          )}</span><small>${escapeHtml(
            acceptance.expiresAt ? `到期 ${acceptance.expiresAt}` : "长期有效"
          )}</small></div>`
        : ""
    }
    ${taskActions(task, accepted)}
  </article>`;
}

function prioritizedTaskList(tasks) {
  if (!tasks.length) return "";
  const primary = tasks.slice(0, 3);
  const remaining = tasks.slice(3);
  return `${primary.map((task) => taskCard(task)).join("")}${
    remaining.length
      ? `<details class="more-tasks deferred-tasks"><summary>查看其余 ${escapeHtml(
          remaining.length
        )} 个较低优先级任务</summary><div class="more-task-list">${remaining
          .map((task) => taskCard(task))
          .join("")}</div></details>`
      : ""
  }`;
}

function topTaskNavigation(overview, actionable, configured) {
  const configuredAgents = new Set(configured.map((result) => result.agent));
  const driftCandidates = (overview.firstRun?.topDriftEvents || []).map(
    (event) => ({ kind: "drift", event })
  );
  const taskCandidates = (overview.topTasks || actionable)
    .filter((task) => task.disposition !== "observe")
    .map((task) => ({ kind: "task", task }));
  const candidates = [...driftCandidates, ...taskCandidates].slice(0, 3);
  if (!candidates.length) return "";
  return `<section class="priority-queue" aria-labelledby="priorityQueueTitle">
    <div class="priority-queue-heading"><div><span class="eyebrow">NEXT BEST ACTIONS</span><h3 id="priorityQueueTitle">建议先处理</h3></div><p>配置变化与风险任务共用前三项；选择后进入对应 Agent。</p></div>
    <ol>${candidates.map((candidate, index) => {
      if (candidate.kind === "drift") {
        const drift = candidate.event;
        const targetAgent = configuredAgents.has(drift.agentId)
          ? drift.agentId
          : "cross-agent";
        return `<li><button class="priority-task drift-priority" data-priority-drift="${escapeHtml(
          drift.eventId
        )}" data-priority-agent="${escapeHtml(targetAgent)}" aria-label="第 ${index + 1} 项，${escapeHtml(
          drift.priority
        )} 配置变化，${escapeHtml(drift.currentSummary)}">
          <span class="priority-rank" aria-hidden="true">${index + 1}</span>
          <span class="priority-task-copy"><strong>${escapeHtml(drift.currentSummary)}</strong><small>${escapeHtml(
            drift.agentId
          )} · 配置变化 · ${escapeHtml(drift.priority)}</small></span><span class="priority-task-arrow" aria-hidden="true">›</span>
        </button></li>`;
      }
      const task = candidate.task;
      const targetAgent = task.agent && configuredAgents.has(task.agent)
        ? task.agent
        : "cross-agent";
      return `<li><button class="priority-task" data-priority-task="${escapeHtml(
        task.taskId
      )}" data-priority-agent="${escapeHtml(targetAgent)}" aria-label="第 ${index + 1} 项，${escapeHtml(
        task.priority
      )}，${escapeHtml(task.primary.finding.title)}，${escapeHtml(task.displayName)}">
        <span class="priority-rank" aria-hidden="true">${index + 1}</span>
        <span class="priority-task-copy"><strong>${escapeHtml(task.primary.finding.title)}</strong><small>${escapeHtml(
          task.displayName
        )} · ${escapeHtml(task.priority)}</small></span><span class="priority-task-arrow" aria-hidden="true">›</span>
      </button></li>`;
    }).join("")}</ol>
  </section>`;
}

function postureAgent(overview, agentId) {
  return overview.posture?.agents?.find(
    (entry) => entry.state.agentId === agentId
  );
}

function driftEventsForAgent(overview, agentId) {
  return (overview.drift?.events || []).filter(
    (entry) => entry.agentId === agentId
  );
}

function effectiveStatePanel(overview, agentId) {
  const report = postureAgent(overview, agentId);
  if (!report) {
    return `<article><span>当前真正生效</span><strong>证据不足，尚未计算</strong></article>`;
  }
  const effective = report.state;
  const sourceSummary = effective.configSources.map(
    (source) => `${source.scope}/${source.kind} · ${source.status}`
  );
  const route = [
    effective.route.providerClass,
    effective.route.model,
    effective.route.proxyKind !== "none"
      ? `经 ${effective.route.proxyKind}`
      : undefined,
    effective.route.effectiveEndpoint,
    effective.route.realUpstream
      ? `真实上游 ${effective.route.realUpstream}`
      : undefined,
  ].filter(Boolean);
  const auth = [
    effective.auth.method,
    effective.auth.sourceKind,
    effective.auth.status,
  ].filter(Boolean);
  const permissions = effective.permissions.map(
    (entry) => `${entry.capability} · ${entry.decision} · ${entry.scope}`
  );
  const integrations = effective.integrations
    .filter((entry) => entry.enabled)
    .map((entry) => `${entry.kind} · ${entry.identity}`);
  return `<article class="effective-summary"><span>当前真正生效</span>
    <strong>${escapeHtml(effective.confidence === "confirmed" ? "已确认" : effective.confidence === "inferred" ? "根据本机证据推断" : "证据不完整")}</strong>
    <div class="effective-facts">
      <div><b>配置来源</b>${factValue(sourceSummary, "未识别")}</div>
      <div><b>请求链路</b>${factValue(route, "未确认")}</div>
      <div><b>认证来源</b>${factValue(auth, "未确认")}</div>
      <div><b>权限</b>${factValue(permissions, "未识别显式权限")}</div>
      <div><b>集成</b>${factValue(integrations, "未发现已启用集成")}</div>
    </div>
    ${report.uncertainty?.length
      ? `<details class="posture-uncertainty"><summary>仍缺少 ${escapeHtml(report.uncertainty.length)} 类证据</summary><ul>${report.uncertainty
          .map((entry) => `<li>${escapeHtml(entry.message)}</li>`)
          .join("")}</ul></details>`
      : ""}
  </article>`;
}

function posturePlansPanel(overview, agentId) {
  const report = postureAgent(overview, agentId);
  const plans = (report?.remediationPlans || []).map(
    (plan) => `<details class="posture-plan">
      <summary>${escapeHtml(plan.title)} · ${escapeHtml(plan.status)}</summary>
      <p><strong>当前：</strong>${escapeHtml(plan.currentExplanation)}</p>
      <p><strong>目标：</strong>${escapeHtml(plan.targetState)}</p>
      <ol>${plan.steps.map(
        (step) => `<li><strong>${escapeHtml(step.title)}</strong>：${escapeHtml(step.detail)}${
          step.terminalCommand
            ? `<div class="command-list"><div class="command-item">
                <div class="command-heading"><span>${escapeHtml(step.terminalCommand.label)}</span><button type="button" class="command-copy" data-copy-command="${escapeHtml(step.terminalCommand.command)}" aria-label="复制只读验证命令：${escapeHtml(step.terminalCommand.label)}">复制命令</button></div>
                <code>${escapeHtml(step.terminalCommand.command)}</code>
                <p>${escapeHtml(step.terminalCommand.successEvidence)}</p>
              </div></div>`
            : ""
        }</li>`
      ).join("")}</ol>
      <p><strong>不自动执行：</strong>${escapeHtml(plan.automation.reason)}</p>
    </details>`
  ).join("");
  if (!plans) return "";
  return `<section class="posture-guidance" aria-label="有效配置处置计划">
    <div class="agent-problems-heading"><div><h4>有效配置处置计划</h4><p>先核对当前认证与请求链路，再按步骤操作；AgentGuard 不自动改写外部登录态或凭证库。</p></div></div>
    ${plans}
  </section>`;
}

function agentDriftPanel(overview, agentId) {
  const events = driftEventsForAgent(overview, agentId);
  if (!events.length) return "";
  return `<section class="agent-drift" aria-label="此 Agent 的配置变化">
    <div class="agent-problems-heading"><div><h4>自可信状态以来</h4><p>已恢复项只保留结果，不会继续要求处理。</p></div><span>${escapeHtml(events.length)} 项</span></div>
    <div class="agent-drift-list">${events.map((entry) => {
      const resolved = entry.change === "removed";
      return `<article id="drift-${escapeHtml(entry.eventId)}" class="finding drift-event ${resolved ? "resolved" : ""}" tabindex="-1" data-drift-card="${escapeHtml(entry.eventId)}">
        <h3><span class="badge ${resolved ? "low" : entry.priority === "P0" || entry.priority === "P1" ? "high" : "medium"}">${escapeHtml(resolved ? "已恢复" : entry.priority)}</span>${escapeHtml(entry.currentSummary)}</h3>
        <p>${escapeHtml(entry.kind)} · ${escapeHtml(entry.change)}</p>
        ${resolved ? "" : `<div class="guide-notes">${list(entry.action)}</div>`}
        <details><summary>如何验证</summary>${list(entry.verification)}</details>
      </article>`;
    }).join("")}</div>
  </section>`;
}

function postureBaselinePanel(overview) {
  const drift = overview.drift;
  if (!drift) return "";
  const hasBaseline =
    drift.status === "unchanged" || drift.status === "changed";
  const statusLabel =
    drift.status === "no-baseline"
      ? "尚未保存可信状态"
      : drift.status === "unchanged"
        ? "与可信状态一致"
        : drift.status === "unavailable"
          ? "可信状态暂时不可用"
          : `发现 ${drift.activeEventCount} 项当前变化`;
  return `<section id="postureSection" class="workspace-section posture-workspace" aria-labelledby="postureSectionTitle">
    <div class="section-heading"><div><h3 id="postureSectionTitle" tabindex="-1">有效配置与可信状态</h3><p>先审核当前真正生效的 Provider、认证、权限和集成，再决定是否保存为比较基准。</p></div><span class="posture-status ${escapeHtml(drift.status)}">${escapeHtml(statusLabel)}</span></div>
    <div class="posture-baseline-copy">
      <div><strong>当前 ${escapeHtml(overview.posture?.summary?.agentCount || 0)} 个 Agent · ${escapeHtml(drift.activeEventCount)} 项变化 · ${escapeHtml(drift.resolvedEventCount)} 项已恢复</strong><p>可信快照只保存结构、分类、稳定代码和本机 HMAC 身份；不保存 Token、原始端点、原始路径或 taskId。</p></div>
      <div class="posture-actions">
        <button class="quiet-action" data-posture-action="verify">复扫验证</button>
        ${drift.status === "unavailable"
          ? ""
          : `<button class="primary-action" data-posture-action="save">${hasBaseline ? "替换可信状态" : "保存为可信状态"}</button>`}
        ${hasBaseline ? `<button class="danger-ghost" data-posture-action="remove">删除可信状态</button>` : ""}
      </div>
    </div>
    ${drift.status === "no-baseline"
      ? `<p class="baseline-note">首次扫描不会自动信任当前状态。请先逐个查看 Agent 的“当前真正生效”，确认后再保存。</p>`
      : ""}
  </section>`;
}

function renderWelcome() {
  renderCards([]);
  content.innerHTML = `<section class="welcome">
    <div class="welcome-copy">
      <div class="privacy-mark">项目优先 · 本机只读检查 · 配置不会上传</div>
      <h3>选择一个代码项目，先从最小范围开始。</h3>
      <p>请选择你正在开发的单个项目根目录，通常是包含 <code>.git</code>、<code>package.json</code> 或 <code>pyproject.toml</code> 的文件夹。</p>
      <div class="welcome-actions"><button class="primary-action" data-welcome-action="select">选择项目并开始扫描</button><button class="quiet-action" data-welcome-action="machine">扫描整台 Mac</button></div>
      <small class="welcome-help">项目扫描会解析项目内的 Agent 配置；普通源代码只检查文件名，不读取内容。整机扫描会检查用户主目录，macOS 可能请求“桌面”“文稿”“下载”等文件夹权限，仅建议在需要跨项目排查时使用。</small>
    </div>
    <div class="trust-steps" aria-label="扫描内容">
      <div class="trust-step"><span class="step-symbol" aria-hidden="true">01</span><div><strong>选哪个目录</strong><small>选择一个代码项目的根目录；之后可以更换并逐个检查。</small></div></div>
      <div class="trust-step"><span class="step-symbol" aria-hidden="true">02</span><div><strong>会读取什么</strong><small>项目内 Agent 配置、敏感文件名，以及常见 Agent 的本机配置。</small></div></div>
      <div class="trust-step"><span class="step-symbol" aria-hidden="true">03</span><div><strong>会做什么</strong><small>默认只读；任何整改都会先预览、确认并备份。</small></div></div>
    </div>
  </section>
  <section class="privacy-strip" aria-label="隐私承诺">
    <div><span class="privacy-icon" aria-hidden="true">✓</span><span><strong>零上传</strong>配置、代码和结果不会自动离开本机</span></div>
    <div><span class="privacy-icon" aria-hidden="true">✓</span><span><strong>凭证脱敏</strong>证据只保留指纹和变量名</span></div>
    <div><span class="privacy-icon" aria-hidden="true">✓</span><span><strong>操作可逆</strong>整改前预览并备份，完成后可以恢复</span></div>
  </section>`;
}

function projectDisplayName(projectPath) {
  const parts = String(projectPath || "")
    .split(/[\\/]/)
    .filter(Boolean);
  return parts.at(-1) || "所选项目";
}

function renderInitialScanProgress() {
  const machineScope = state.scopeKind === "machine";
  const scopeName = machineScope
    ? "整台 Mac"
    : projectDisplayName(state.projectPath);
  const scopeDetail = machineScope
    ? "用户主目录 · macOS 可能请求受保护文件夹权限"
    : state.projectPath;
  renderCards([]);
  content.innerHTML = `<section class="initial-scan-view" aria-labelledby="initialScanTitle" aria-describedby="initialScanDescription">
    <div class="initial-scan-copy">
      <div class="scan-spinner" aria-hidden="true"><span></span></div>
      <span class="eyebrow">LOCAL READ-ONLY SCAN</span>
      <h3 id="initialScanTitle" tabindex="-1">正在检查${machineScope ? "整台 Mac" : `项目 ${escapeHtml(scopeName)}`}</h3>
      <p id="initialScanDescription">正在本机发现已配置 Agent，并检查连接、权限和需要优先处理的安全任务。</p>
      <div class="selected-scope" aria-label="已确认的检查范围">
        <span>${machineScope ? "检查范围" : "已选择项目"}</span>
        <strong>${escapeHtml(scopeName)}</strong>
        <code>${escapeHtml(scopeDetail)}</code>
      </div>
      <p class="scan-wait-note">请保持窗口打开。扫描没有确定百分比，但下方状态会持续确认应用仍在工作。</p>
    </div>
    <div class="scan-plan" aria-label="本次扫描内容">
      <strong>本次会在本机完成</strong>
      <div><span aria-hidden="true">✓</span><p><b>范围已确认</b><small>${machineScope ? "用户主目录" : "单个代码项目"}</small></p></div>
      <div><span aria-hidden="true">···</span><p><b>发现 Agent 与读取配置</b><small>包括常见 Agent 的本机配置</small></p></div>
      <div><span aria-hidden="true">···</span><p><b>整理连接、权限与行动任务</b><small>普通源代码只检查文件名，不读取内容</small></p></div>
      <footer>默认只读 · 配置和结果不会上传</footer>
    </div>
  </section>`;
}

function renderInitialScanError() {
  const machineScope = state.scopeKind === "machine";
  const scopeName = machineScope
    ? "整台 Mac"
    : projectDisplayName(state.projectPath);
  renderCards([]);
  content.innerHTML = `<section id="initialScanError" class="initial-scan-view scan-error-view" aria-labelledby="initialScanErrorTitle" aria-describedby="initialScanErrorDescription">
    <div class="initial-scan-copy">
      <div class="scan-error-symbol" aria-hidden="true">!</div>
      <span class="eyebrow">SCAN NOT COMPLETED</span>
      <h3 id="initialScanErrorTitle" tabindex="-1">没有完成${machineScope ? "整机检查" : `项目 ${escapeHtml(scopeName)} 的检查`}</h3>
      <p id="initialScanErrorDescription">${escapeHtml(state.initialScanError || "扫描遇到问题，结果尚未生成。")}</p>
      <div class="selected-scope" aria-label="上次检查范围">
        <span>${machineScope ? "检查范围" : "上次选择"}</span>
        <strong>${escapeHtml(scopeName)}</strong>
        ${machineScope ? "" : `<code>${escapeHtml(state.projectPath)}</code>`}
      </div>
      <div class="welcome-actions">
        <button class="primary-action" data-welcome-action="retry">${machineScope ? "重新扫描整台 Mac" : "重新扫描所选项目"}</button>
        <button class="quiet-action" data-welcome-action="select">${machineScope ? "选择项目（推荐）" : "更换项目"}</button>
      </div>
      <small class="welcome-help">重试仍保持只读；也可以先导出脱敏诊断，诊断不会包含项目路径、端点或配置内容。</small>
    </div>
    <div class="scan-error-help">
      <strong>可以先这样处理</strong>
      <ol>
        <li>确认项目文件夹仍然存在且当前用户可以读取。</li>
        <li>如果 macOS 刚刚拒绝了文件夹权限，可在系统设置中核对后重试。</li>
        <li>若问题持续，使用顶部“报告”菜单导出脱敏诊断。</li>
      </ol>
    </div>
  </section>`;
}

function endpointCards(overview) {
  const chains = overview.map.proxyChains || [];
  if (chains.length) {
    return chains
      .map(
        (chain) => `<article class="finding chain">
          <h3>${escapeHtml(chain.agentLabel || chain.via)}${chain.owner ? ` · ${escapeHtml(chain.owner)}` : ""}</h3>
          <p>${escapeHtml(chain.proxy)} <span>→</span> ${escapeHtml(chain.upstream)}</p>
          <div class="meta">${escapeHtml(chain.owner ? `经 ${chain.owner}：本地代理 → 真实上游` : "本地代理 → 真实上游")}${chain.authMode ? ` · ${escapeHtml(chain.authMode)}` : ""}</div>
        </article>`
      )
      .join("");
  }
  const rows = overview.map.rows.filter((row) => row.endpoints?.length);
  return rows.length
    ? rows
        .map(
          (row) => `<article class="finding">
            <h3>${escapeHtml(row.displayName)}</h3>
            <p>${escapeHtml(row.endpoints.join("、"))}</p>
          </article>`
        )
        .join("")
    : `<div class="empty">当前扫描没有可展示的 Provider 或代理链路。</div>`;
}

function renderOverview(overview) {
  const configured = overview.report.results.filter(
    (result) => result.agent !== "workspace" && result.discovery.configFound
  );
  const actionable = overview.tasks.filter((task) => task.disposition !== "observe");
  renderCards([]);
  const groupedAgents = new Set(configured.map((result) => result.agent));
  const otherTasks = actionable.filter(
    (task) => !task.agent || !groupedAgents.has(task.agent)
  );
  ensureAgentSelection(configured, actionable);
  const selectedResult = configured.find((result) => result.agent === state.selectedAgent);
  const agentNavigation = configured.length
    ? `<nav class="agent-directory" aria-label="选择 Agent" role="tablist">${configured
        .map((result) => agentDirectoryCard(result, overview, actionable))
        .join("")}${crossAgentDirectoryCard(otherTasks, overview)}</nav>`
    : "";
  const selectedWorkspace = selectedResult
    ? agentWorkspace(selectedResult, overview, actionable)
    : state.selectedAgent === "cross-agent"
      ? crossAgentWorkspace(otherTasks, overview)
      : `<div class="empty">尚未发现已配置的 AI Coding Agent。</div>`;
  const selectedTabId = `agent-tab-${String(state.selectedAgent).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const panelLabel = configured.length
    ? `aria-labelledby="${selectedTabId}"`
    : `aria-label="Agent 检查结果"`;
  content.innerHTML = `${topTaskNavigation(overview, actionable, configured)}
    ${postureBaselinePanel(overview)}
    <section id="agentsSection" class="workspace-section agent-focus-section">
      <div class="agent-section-intro"><div><h3 id="agentsSectionTitle" tabindex="-1">已配置的 Agent</h3><p>选择一个 Agent 查看配置状态、重点问题和安全下一步，也可使用左右方向键切换。</p></div><span>${escapeHtml(configured.length)} 个已配置</span></div>
      ${agentNavigation}
      <div class="agent-workspace-list" id="activeAgentWorkspace" role="tabpanel" ${panelLabel} tabindex="-1">${selectedWorkspace}</div>
    </section>
    <section id="remediationSection" class="workspace-section remediation-workspace">
      <div class="section-heading"><h3>安全修改与恢复（高级）</h3><span>只在准备修改配置或需要回退时使用</span></div>
      <div class="remediation-guide" aria-label="安全修改与恢复使用场景">
        <article><strong>手动迁移凭证</strong><p>先在任务中备份，再复制命令到 Terminal，完成后点“复扫验证”；只有迁移后启动或鉴权异常时才恢复。</p></article>
        <article><strong>自动收敛配置</strong><p>先预览逐文件差异，再确认、自动备份并应用，最后复扫；这里只处理明确支持的权限和暴露面配置，不处理明文凭证。</p></article>
      </div>
      ${credentialBackupPanel()}
      ${baselineWorkspace()}
    </section>`;
}

function uniqueText(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

function agentAliases(result) {
  const aliases = [result.agent, result.displayName.toLowerCase()];
  if (result.agent === "claude-code") aliases.push("claude");
  if (result.agent === "cc-switch") aliases.push("cc switch", "ccswitch");
  if (result.agent === "gemini") aliases.push("gemini cli");
  return aliases;
}

function agentConnections(result, overview, row) {
  const direct = row?.endpoints || [];
  const aliases = agentAliases(result);
  const chains = (overview.map.proxyChains || [])
    .filter((chain) => {
      const via = `${chain.via || ""} ${chain.agentLabel || ""}`.toLowerCase();
      return aliases.some((alias) => via.includes(alias));
    })
    .map((chain) => `${chain.owner ? `经 ${chain.owner}：` : ""}${chain.proxy} → ${chain.upstream}`);
  return uniqueText([...chains, ...direct]);
}

function providerNames(result, overview) {
  const aliases = agentAliases(result);
  const proxyAuthModes = (overview.map.proxyChains || [])
    .filter((chain) => {
      const via = `${chain.via || ""} ${chain.agentLabel || ""}`.toLowerCase();
      return aliases.some((alias) => via.includes(alias));
    })
    .map((chain) => chain.authMode);
  return uniqueText([
    ...proxyAuthModes,
    ...result.findings.flatMap((finding) => {
      const evidence = finding.evidence || {};
      const values = [];
      if (typeof evidence.provider === "string") values.push(evidence.provider);
      if (Array.isArray(evidence.providers)) values.push(...evidence.providers);
      if (typeof evidence.authType === "string") values.push(evidence.authType);
      if (typeof evidence.authMode === "string") values.push(evidence.authMode);
      return values;
    }),
  ]);
}

function factValue(items, empty) {
  return items.length
    ? `<div class="fact-tags">${items
        .map((item) => `<span>${escapeHtml(item)}</span>`)
        .join("")}</div>`
    : `<span class="fact-empty">${escapeHtml(empty)}</span>`;
}

function agentInitials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return parts.map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return parts[0]?.slice(0, 2).toUpperCase() || "AI";
}

function agentPriority(result, actionable) {
  const ranks = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const tasks = actionable.filter((task) => task.agent === result.agent);
  return tasks.reduce((best, task) => Math.min(best, ranks[task.priority] ?? 4), 5);
}

function ensureAgentSelection(configured, actionable) {
  const valid = new Set([...configured.map((result) => result.agent), "cross-agent"]);
  if (state.selectedAgent && valid.has(state.selectedAgent)) return;
  const ranked = configured
    .map((result, index) => ({ result, index, priority: agentPriority(result, actionable) }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index);
  state.selectedAgent = ranked[0]?.result.agent || "cross-agent";
}

function agentDirectoryCard(result, overview, actionable) {
  const tasks = actionable.filter((task) => task.agent === result.agent);
  const immediate = tasks.filter((task) => task.priority === "P0" || task.priority === "P1").length;
  const row = overview.map.rows.find((candidate) => candidate.agent === result.agent);
  const stateClass = immediate ? "urgent" : tasks.length ? "review" : "clear";
  const stateText = immediate
    ? `${immediate} 个优先问题`
    : tasks.length
      ? `${tasks.length} 个待确认`
      : "状态良好";
  const selected = state.selectedAgent === result.agent;
  return `<button id="agent-tab-${escapeHtml(result.agent)}" class="agent-directory-card ${stateClass} ${selected ? "selected" : ""}" data-agent-view="${escapeHtml(result.agent)}" role="tab" aria-selected="${selected}" aria-controls="activeAgentWorkspace" tabindex="${selected ? "0" : "-1"}">
    <span class="agent-avatar" aria-hidden="true">${escapeHtml(agentInitials(result.displayName))}</span>
    <span class="agent-directory-copy"><strong>${escapeHtml(result.displayName)}</strong><small>${row?.secretCount ? `${escapeHtml(row.secretCount)} 项凭证风险` : "已完成本地检查"}</small></span>
    <span class="agent-directory-state"><span class="agent-status-copy"><i></i>${escapeHtml(stateText)}</span><b class="agent-card-affordance" aria-hidden="true">${selected ? "当前" : "查看 ›"}</b></span>
  </button>`;
}

function projectDecisionCount(overview) {
  if (state.scopeKind !== "project") return 0;
  return overview.acceptedTasks.length
    + (overview.ruleIgnores?.entries || []).filter((entry) => entry.status === "active").length
    + (overview.providerTrust?.entries || []).length;
}

function crossAgentDirectoryCard(otherTasks, overview) {
  const decisions = projectDecisionCount(overview);
  const total = otherTasks.length + decisions;
  const immediate = otherTasks.filter((task) => task.priority === "P0" || task.priority === "P1").length;
  const stateClass = immediate ? "urgent" : total ? "review" : "clear";
  const selected = state.selectedAgent === "cross-agent";
  return `<button id="agent-tab-cross-agent" class="agent-directory-card cross ${stateClass} ${selected ? "selected" : ""}" data-agent-view="cross-agent" role="tab" aria-selected="${selected}" aria-controls="activeAgentWorkspace" tabindex="${selected ? "0" : "-1"}">
    <span class="agent-avatar" aria-hidden="true">XA</span>
    <span class="agent-directory-copy"><strong>跨 Agent</strong><small>关联链路与项目决策</small></span>
    <span class="agent-directory-state"><span class="agent-status-copy"><i></i>${escapeHtml(total ? `${total} 个关联项` : "当前无关联项")}</span><b class="agent-card-affordance" aria-hidden="true">${selected ? "当前" : "查看 ›"}</b></span>
  </button>`;
}

function agentWorkspace(result, overview, actionable) {
  const row = overview.map.rows.find((candidate) => candidate.agent === result.agent);
  const tasks = actionable.filter((task) => task.agent === result.agent);
  const immediate = tasks.filter((task) => task.priority === "P0" || task.priority === "P1").length;
  const connections = agentConnections(result, overview, row);
  const providers = providerNames(result, overview);
  const permissions = uniqueText(
    result.findings
      .filter((finding) => finding.category === "permission")
      .map((finding) => finding.title)
  );
  const mcp = uniqueText(
    result.findings
      .filter((finding) => finding.category === "mcp")
      .map((finding) => finding.title)
  );
  const taskContent = tasks.length
    ? prioritizedTaskList(tasks)
    : `<div class="agent-clear"><span>✓</span><div><strong>当前没有需要行动的问题</strong><p>仍建议在配置或 Agent 版本变化后重新扫描。</p></div></div>`;
  const status = immediate
    ? `${immediate} 个优先问题`
    : tasks.length
      ? `${tasks.length} 个待确认问题`
      : "当前无行动项";
  return `<section class="agent-workspace" id="agent-${escapeHtml(result.agent)}" data-active-agent="${escapeHtml(result.agent)}">
    <div class="agent-workspace-head">
      <div class="agent-identity"><span class="agent-avatar large" aria-hidden="true">${escapeHtml(agentInitials(result.displayName))}</span><div><span class="eyebrow">AGENT PROFILE</span><h3>${escapeHtml(result.displayName)}</h3><p>${escapeHtml(result.discovery.notes?.join(" · ") || "已发现并完成本地只读检查")}</p></div></div>
      <div class="agent-profile-actions"><button class="agent-back-action" data-agent-overview>← Agent 列表</button><span class="agent-risk-count ${immediate ? "urgent" : tasks.length ? "review" : "clear"}">${escapeHtml(status)}</span></div>
    </div>
    <div class="agent-workspace-body">
      <aside class="agent-inspector" aria-label="${escapeHtml(result.displayName)} 配置摘要">
        <div class="agent-inspector-heading"><span>配置摘要</span><small>只读证据</small></div>
        <div class="agent-facts">
          ${effectiveStatePanel(overview, result.agent)}
          <article><span>配置位置</span><strong class="path-value">${escapeHtml(result.discovery.configPath || "未发现主配置路径")}</strong></article>
          <article><span>连接 / 上游</span>${factValue(connections, "未识别到显式自定义端点")}</article>
          <article><span>模型 / Provider / 鉴权</span>${factValue(providers, "未识别到显式模型、Provider 或鉴权占位符")}</article>
          <article><span>安全相关权限</span>${factValue(permissions, "未发现需要提示的高风险权限")}</article>
          <article><span>MCP / 工具</span>${factValue(mcp, row?.mcpCount ? `${row.mcpCount} 项 MCP 配置需要查看` : "未发现需要提示的 MCP 配置")}</article>
          <article><span>凭证状态</span><strong>${row?.secretCount ? `${escapeHtml(row.secretCount)} 项凭证问题` : "未发现明文凭证问题"}</strong></article>
        </div>
      </aside>
      <section class="agent-task-pane">
        ${posturePlansPanel(overview, result.agent)}
        ${agentDriftPanel(overview, result.agent)}
        <div class="agent-problems-heading"><div><h4>问题与修复建议</h4><p>优先显示需要处理的任务，技术证据保留在详情中。</p></div><span>${escapeHtml(tasks.length)} 项</span></div>
        <div class="agent-task-list">${taskContent}</div>
      </section>
    </div>
  </section>`;
}

function crossAgentWorkspace(otherTasks, overview) {
  const decisions = projectDecisionCount(overview);
  const taskContent = otherTasks.length
    ? prioritizedTaskList(otherTasks)
    : `<div class="agent-clear"><span>✓</span><div><strong>当前没有跨 Agent 行动任务</strong><p>共享代理、共享端点和项目文件问题会集中显示在这里。</p></div></div>`;
  return `<section class="agent-workspace cross-agent-workspace" id="agent-cross-agent" data-active-agent="cross-agent">
    <div class="agent-workspace-head">
      <div class="agent-identity"><span class="agent-avatar large" aria-hidden="true">XA</span><div><span class="eyebrow">CROSS-AGENT / PROJECT</span><h3>跨 Agent 与当前项目</h3><p>集中查看共享连接链路、项目文件问题，以及已经接受、信任或忽略的决策。</p></div></div>
      <div class="agent-profile-actions"><button class="agent-back-action" data-agent-overview>← Agent 列表</button><span class="agent-risk-count ${otherTasks.length ? "review" : "clear"}">${escapeHtml(otherTasks.length)} 个行动 · ${escapeHtml(decisions)} 个决策</span></div>
    </div>
    <div class="cross-agent-summary">
      <article><span>跨 Agent 行动</span><strong>${escapeHtml(otherTasks.length)}</strong></article>
      <article><span>当前项目决策</span><strong>${escapeHtml(decisions)}</strong></article>
      <article><span>检查范围</span><strong>${state.scopeKind === "project" ? "本机 + 项目" : "仅本机"}</strong></article>
    </div>
    <div class="agent-problems-heading"><div><h4>关联问题与项目决策</h4><p>这里不重复显示任何单一 Agent 已经拥有的任务。</p></div><span>${escapeHtml(otherTasks.length)} 项</span></div>
    <div class="agent-task-list">${taskContent}</div>
    ${projectDecisions(overview)}
  </section>`;
}

function projectDecisions(overview) {
  if (state.scopeKind !== "project") return "";
  const accepted = overview.acceptedTasks
    .map((entry) => taskCard(entry.task, { accepted: true, acceptance: entry }))
    .join("");
  const ignores = (overview.ruleIgnores?.entries || [])
    .filter((entry) => entry.status === "active")
    .map(
      (entry) => `<article class="finding"><h3><span class="badge info">已忽略</span>${escapeHtml(
        entry.ruleId
      )}</h3><p>${escapeHtml(entry.reason)}</p><div class="meta">${escapeHtml(
        entry.agent
      )} · ${escapeHtml(entry.expiresAt ? `到期 ${entry.expiresAt}` : "长期有效")}</div><div class="task-actions"><button class="danger-ghost" data-ignore-action="remove" data-rule-id="${escapeHtml(
        entry.ruleId
      )}" data-agent="${escapeHtml(entry.agent)}">撤销忽略</button></div></article>`
    )
    .join("");
  const trusted = (overview.providerTrust?.entries || [])
    .map(
      (entry) => `<article class="finding"><h3><span class="badge low">${escapeHtml(
        entry.kind
      )}</span>${escapeHtml(entry.endpoint)}</h3><p>只改变未知端点分类；HTTP、凭证和权限风险仍会独立显示。</p><div class="task-actions"><button class="danger-ghost" data-trust-action="remove" data-endpoint="${escapeHtml(
        entry.endpoint
      )}" data-kind="${escapeHtml(entry.kind)}">撤销信任</button></div></article>`
    )
    .join("");
  const decisions = `${accepted}${ignores}${trusted}`;
  return decisions
    ? `<details class="more-tasks policy-decisions"><summary>查看已接受、信任或忽略的项目决策</summary><div class="more-task-list">${decisions}</div></details>`
    : "";
}

function baselineWorkspace() {
  if (!state.baseline) {
    return `<section class="baseline-entry"><div><strong>可选：检查是否有适合自动修改的配置</strong><p>点击后只生成所有 Agent 的逐文件差异，不会立即修改。明文凭证仍使用任务里的备份、Terminal 命令和“复扫验证”。</p></div><div class="baseline-entry-actions"><select id="inlineBaselineProfile" aria-label="自动整改策略"><option value="balanced" ${baselineProfile.value === "balanced" ? "selected" : ""}>平衡（推荐）</option><option value="safe" ${baselineProfile.value === "safe" ? "selected" : ""}>保守</option></select><button class="primary-action" data-baseline-action="preview">仅预览可自动修改项</button></div></section>${baselineRestorePanel()}`;
  }
  const plan = state.baseline;
  const changes = plan.files.flatMap((file) => file.changes || []);
  const warnings = (plan.warnings || [])
    .map((warning) => `<p class="baseline-note">${escapeHtml(warning)}</p>`)
    .join("");
  const files = plan.files
    .map(
      (file) => `<article class="finding baseline-file"><h3>${escapeHtml(file.agent)} · ${file.changes.length} 项变更</h3><div class="meta">${escapeHtml(file.configPath)}</div><pre class="baseline-diff">${escapeHtml(file.diff)}</pre></article>`
    )
    .join("");
  return `${warnings}${files || `<div class="empty"><strong>当前没有适合一键自动修改的配置</strong><p>这里无需操作；明文凭证请继续使用对应任务中的安全迁移步骤。</p></div>`}${
    changes.length
      ? `<section class="baseline-controls"><div><strong>确认完整差异后再应用</strong><p>应用前会重新校验计划、要求原生确认并强制备份；完成后立即复扫。</p></div><button data-baseline-action="apply">备份并应用 ${escapeHtml(plan.profile)}</button></section>`
      : ""
  }${baselineRestorePanel()}`;
}

function renderActions(overview) {
  const tasks = overview.tasks;
  renderCards([
    { label: "活动任务 / 观察", value: tasks.length, tone: tasks.length ? "brand" : "safe" },
    { label: "原始发现", value: overview.summary.findingCount },
    { label: "已接受", value: overview.summary.acceptedTaskCount, tone: "safe" },
    { label: "项目已忽略", value: overview.summary.ignoredFindingCount, tone: "safe" },
  ]);
  content.innerHTML = tasks.length
    ? tasks.map((task) => taskCard(task)).join("")
    : `<div class="empty">没有需要处理的行动任务。</div>`;
  if (overview.acceptedTasks.length) {
    content.insertAdjacentHTML(
      "beforeend",
      `<div class="section-heading"><h3>已接受任务</h3><span>仍保留审计，可验证或撤销</span></div>${overview.acceptedTasks
        .map((entry) =>
          taskCard(entry.task, { accepted: true, acceptance: entry })
        )
        .join("")}`
    );
  }
  const activeIgnores = (overview.ruleIgnores?.entries || []).filter(
    (entry) => entry.status === "active"
  );
  if (activeIgnores.length) {
    content.insertAdjacentHTML(
      "beforeend",
      `<div class="section-heading"><h3>项目已忽略规则</h3><span>${escapeHtml(
        overview.ruleIgnores.auditEventCount
      )} 条审计事件 · 当前隐藏 ${escapeHtml(
        overview.ignoredFindings.length
      )} 项发现</span></div>${activeIgnores
        .map((entry) => {
          const findingCount = overview.ignoredFindings.filter(
            (finding) => finding.agent === entry.agent && finding.ruleId === entry.ruleId
          ).length;
          return `<article class="finding">
            <h3><span class="badge info">已忽略</span>${escapeHtml(entry.ruleId)}</h3>
            <p>${escapeHtml(entry.reason)}</p>
            <div class="meta">${escapeHtml(entry.agent)} · ${findingCount} 项当前发现 · ${escapeHtml(
              entry.expiresAt ? `到期 ${entry.expiresAt}` : "长期有效"
            )}</div>
            <div class="task-actions"><button class="danger-ghost" data-ignore-action="remove" data-rule-id="${escapeHtml(
              entry.ruleId
            )}" data-agent="${escapeHtml(entry.agent)}">撤销忽略</button></div>
          </article>`;
        })
        .join("")}`
    );
  }
}

function renderMap(overview) {
  renderCards([
    { label: "Agent / 项目", value: overview.map.rows.length, tone: "brand" },
    { label: "实际代理链路", value: overview.map.proxyChains.length },
    { label: "可信端点", value: overview.providerTrust.entries.length, tone: "safe" },
  ]);
  const trusted = overview.providerTrust.entries.length
    ? overview.providerTrust.entries
        .map(
          (entry) => `<article class="finding">
            <h3><span class="badge low">${escapeHtml(entry.kind)}</span>${escapeHtml(
              entry.endpoint
            )}</h3>
            <p>已登记为当前项目的可信端点；HTTP、密钥和权限问题仍独立检查。</p>
            <div class="task-actions"><button class="danger-ghost" data-trust-action="remove" data-endpoint="${escapeHtml(
              entry.endpoint
            )}" data-kind="${escapeHtml(entry.kind)}">撤销信任</button></div>
          </article>`
        )
        .join("")
    : `<div class="empty">当前项目没有登记可信端点。</div>`;
  content.innerHTML = `${endpointCards(overview)}
    <div class="section-heading"><h3>项目级可信端点</h3><span>${escapeHtml(
      overview.providerTrust.auditEventCount
    )} 条审计事件</span></div>${trusted}`;
}

function renderAgents(overview) {
  const results = overview.report.results;
  renderCards([
    { label: "已配置", value: overview.summary.configuredAgents, tone: "brand" },
    { label: "扫描对象", value: results.length },
  ]);
  content.innerHTML = `<div class="agent-grid">${results
    .map(
      (result) => `<article class="finding agent-card">
        <h3><span class="badge ${result.discovery.configFound ? "low" : "info"}">${
          result.discovery.configFound ? "已发现" : "未发现"
        }</span>${escapeHtml(result.displayName)}</h3>
        <p>${escapeHtml(result.discovery.configPath || "未发现配置")}</p>
        ${
          result.discovery.notes?.length
            ? `<div class="meta">${escapeHtml(result.discovery.notes.join(" | "))}</div>`
            : ""
        }
      </article>`
    )
    .join("")}</div>`;
}

function renderBaseline(plan) {
  const changes = plan.files.flatMap((file) => file.changes || []);
  renderCards([
    { label: "Profile", value: plan.profile, tone: "brand" },
    { label: "涉及文件", value: plan.files.length },
    { label: "建议变更", value: changes.length, tone: changes.length ? "urgent" : "safe" },
  ]);
  const warnings = (plan.warnings || [])
    .map(
      (warning) =>
        `<article class="finding baseline-warning"><h3>提示</h3><p>${escapeHtml(
          warning
        )}</p></article>`
    )
    .join("");
  const files = plan.files
    .map(
      (file) => `<article class="finding baseline-file">
        <h3>${escapeHtml(file.agent)} · ${file.changes.length} 项变更</h3>
        <div class="meta">${escapeHtml(file.configPath)}</div>
        <pre class="baseline-diff">${escapeHtml(file.diff)}</pre>
      </article>`
    )
    .join("");
  const controls = changes.length
    ? `<section class="baseline-controls">
        <div><strong>确认上面的完整差异后再应用</strong><p>主进程会再次校验预览指纹，并用原生确认框要求确认。应用前强制备份，完成后立即复扫。</p></div>
        <button data-baseline-action="apply">备份并应用 ${escapeHtml(
          plan.profile
        )}</button>
      </section>`
    : "";
  content.innerHTML = `${warnings}${
    files || `<div class="empty">该 profile 没有建议变更。</div>`
  }${controls}${baselineRestorePanel()}`;
}

function baselineRestorePanel() {
  const last = state.lastBaselineApply;
  if (!last) return "";
  const changes = last.files.reduce(
    (count, file) => count + file.changes.length,
    0
  );
  return `<article class="finding baseline-restore">
    <h3><span class="badge low">${escapeHtml(transactionLabel(last.transaction))}</span>${escapeHtml(last.profile)} baseline</h3>
    <p>${escapeHtml(last.transaction?.message || `已修改 ${last.files.length} 个文件、${changes} 项配置，并完成重新扫描。`)}</p>
    <div class="meta">备份 ID：${escapeHtml(last.backupId)}</div>
    <div class="task-actions"><button class="danger-ghost" data-baseline-action="restore">恢复应用前配置</button></div>
  </article>`;
}

function renderBaselineEmpty() {
  renderCards([
    { label: "Profile", value: baselineProfile.value, tone: "brand" },
    { label: "当前预览", value: "未生成" },
  ]);
  content.innerHTML = `<section class="overview-hero"><div><span class="eyebrow">Advanced · 默认不写入</span><h3>先查看完整差异，再决定是否应用</h3><p>生成预览不会修改配置；真正应用前还会再次确认并强制备份。</p></div></section><div class="empty">点击右上角“生成预览”查看 baseline 差异。</div>${baselineRestorePanel()}`;
}

function renderCurrentView() {
  document.body.classList.toggle("has-overview", Boolean(state.overview));
  document.title = "安全工作台 · AgentGuard";
  baselineProfile.hidden = true;
  $("selectProjectBtn").hidden = !state.overview;
  $("machineScopeBtn").hidden = !state.overview || state.scopeKind !== "project";
  $("runBtn").hidden = !state.overview;
  $("runBtn").textContent = "重新扫描";
  $("selectProjectBtn").textContent =
    state.scopeKind === "project" ? "更换项目" : "选择项目（推荐）";

  if (!state.overview) {
    $("viewTitle").textContent = "选择一个开发项目开始检查";
    $("viewSubtitle").textContent = "从明确的项目范围开始，避免不必要的 macOS 文件夹权限请求。";
    if (state.initialScanState === "scanning") renderInitialScanProgress();
    else if (state.initialScanState === "error") renderInitialScanError();
    else renderWelcome();
    updateNativeMenuState();
    return;
  }
  $("viewTitle").textContent = `${state.overview.scope?.name || "当前范围"} 的 AI Agent 安全状态`;
  $("viewSubtitle").textContent = "装了什么、现状如何、有什么问题、下一步怎么处理。";
  renderOverview(state.overview);
  diagnosticData.textContent = JSON.stringify(
    state.baseline || state.lastBaselineApply || state.overview,
    null,
    2
  );
  updateNativeMenuState();
}

function handleNativeMenuCommand(command) {
  if (state.working) return;
  if (command === "scan-current") {
    if (!state.overview) chooseProject();
    else if (state.scopeKind !== "project") requestMachineScan();
    else scanProject();
  }
  if (command === "scan-machine") requestMachineScan();
  if (command === "select-project") chooseProject();
  if (command === "export-html" && state.overview) exportReport("html");
  if (command === "export-json" && state.overview) exportReport("json");
  if (command === "open-report" && state.lastReportPath) $("openReportBtn").click();
  if (command === "show-developer-data" && state.overview) {
    const raw = $("developerData");
    raw.open = true;
    scrollMainTo("developerData", 12);
    raw.querySelector("summary")?.focus();
  }
  if (command === "export-diagnostics") exportDiagnostics();
}

function updateScope(overview) {
  state.projectPath = overview.scope?.path || overview.project.path;
  state.scopeKind = overview.scope?.kind || "project";
  $("projectPath").textContent =
    state.scopeKind === "machine" ? "整台 Mac · 用户主目录" : state.projectPath;
  $("scopeLabel").textContent = state.scopeKind === "machine" ? "检查范围" : "当前项目";
}

function requestMachineScan() {
  const confirmed = window.confirm(
    "整机扫描会把你的用户主目录作为检查范围。macOS 可能请求访问“桌面”“文稿”“下载”等文件夹。\n\n仅在需要跨项目排查时使用。要继续吗？"
  );
  if (confirmed) scanMachine();
}

async function scanMachine() {
  const shouldFocusResults = !state.overview;
  if (shouldFocusResults) {
    state.scopeKind = "machine";
    state.initialScanState = "scanning";
    state.initialScanError = undefined;
    renderCurrentView();
  }
  setWorking(true);
  if (shouldFocusResults) focusInitialScanHeading();
  setStatus(
    "正在扫描整台 Mac；macOS 可能询问受保护文件夹权限…",
    "working",
    "仅在需要跨项目排查时使用；期间不会修改任何配置。"
  );
  try {
    state.overview = await window.agentguard.scanMachine();
    state.baseline = undefined;
    state.posturePreview = undefined;
    state.lastBaselineApply = undefined;
    state.initialScanState = "idle";
    updateScope(state.overview);
    setStatus(
      `检查完成：发现 ${state.overview.summary.configuredAgents} 个已配置 Agent，${state.overview.summary.taskCount} 个行动任务`,
      state.overview.summary.immediateTaskCount ? "warn" : "ok"
    );
    renderCurrentView();
  } catch (error) {
    if (shouldFocusResults) {
      state.initialScanState = "error";
      state.initialScanError = error.message || String(error);
      renderCurrentView();
    }
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
    if (shouldFocusResults && state.overview) focusResultsHeading();
    else if (shouldFocusResults) focusInitialScanError();
  }
}

async function scanProject() {
  if (!state.projectPath) return;
  const shouldFocusResults = !state.overview;
  if (shouldFocusResults) {
    state.scopeKind = "project";
    state.initialScanState = "scanning";
    state.initialScanError = undefined;
    renderCurrentView();
  }
  setWorking(true);
  if (shouldFocusResults) focusInitialScanHeading();
  setStatus(
    "正在扫描所选项目、检查常见 Agent 配置并整理行动任务…",
    "working",
    "项目检查仍默认只读；项目级决策只有在你明确确认后才会写入。"
  );
  try {
    state.overview = await window.agentguard.scanProject(state.projectPath);
    state.baseline = undefined;
    state.posturePreview = undefined;
    state.initialScanState = "idle";
    updateScope(state.overview);
    setStatus(
      `扫描完成：${state.overview.summary.findingCount} 项发现，${state.overview.summary.taskCount} 个行动任务`,
      state.overview.summary.immediateTaskCount ? "warn" : "ok"
    );
    renderCurrentView();
  } catch (error) {
    if (shouldFocusResults) {
      state.initialScanState = "error";
      state.initialScanError = error.message || String(error);
      renderCurrentView();
    }
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
    if (shouldFocusResults && state.overview) focusResultsHeading();
    else if (shouldFocusResults) focusInitialScanError();
  }
}

async function previewBaseline() {
  if (!state.projectPath) return;
  setWorking(true);
  setStatus("正在生成只读 baseline 预览；不会修改配置…", "working");
  try {
    state.baseline = await window.agentguard.previewBaseline(
      state.projectPath,
      baselineProfile.value
    );
    setStatus("Baseline dry-run 已生成；尚未修改任何配置。", "ok");
    renderCurrentView();
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
}

async function savePostureBaseline() {
  if (!state.projectPath || state.working) return;
  setWorking(true);
  setStatus("正在重新核对当前有效配置并生成可信状态预览…", "working");
  try {
    const preview = await window.agentguard.previewPostureBaseline(
      state.projectPath
    );
    state.posturePreview = preview;
    setStatus("可信状态预览已生成，等待你在原生确认框确认…", "working");
    const result = await window.agentguard.savePostureBaseline(
      state.projectPath,
      preview.currentFingerprint,
      preview.storageRevision,
      preview.hasBaseline
    );
    if (result.canceled) {
      setStatus("已取消，可信状态没有变化。");
      return;
    }
    state.overview = result.overview;
    updateScope(state.overview);
    setStatus(
      result.mutation.mutation === "replace"
        ? "可信状态已替换；后续复扫会以当前状态为新基准。"
        : "可信状态已保存；后续复扫会显示新增、变化、恢复与重新出现。",
      "ok"
    );
    renderCurrentView();
    $("postureSectionTitle")?.focus({ preventScroll: true });
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    state.posturePreview = undefined;
    setWorking(false);
  }
}

async function removePostureBaseline() {
  if (!state.projectPath || state.working) return;
  setWorking(true);
  setStatus("正在校验当前可信状态…", "working");
  try {
    const preview = await window.agentguard.previewPostureBaseline(
      state.projectPath
    );
    state.posturePreview = preview;
    if (!preview.hasBaseline) {
      throw new Error("当前没有可删除的可信状态。");
    }
    setStatus("等待你在原生确认框确认删除…", "working");
    const result = await window.agentguard.removePostureBaseline(
      state.projectPath,
      preview.storageRevision
    );
    if (result.canceled) {
      setStatus("已取消，可信状态没有变化。");
      return;
    }
    state.overview = result.overview;
    updateScope(state.overview);
    setStatus("可信状态已删除；Agent 配置未修改。", "ok");
    renderCurrentView();
    $("postureSectionTitle")?.focus({ preventScroll: true });
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    state.posturePreview = undefined;
    setWorking(false);
  }
}

async function verifyPosture() {
  if (!state.projectPath || state.working) return;
  setWorking(true);
  setStatus("正在复扫并比较可信状态…", "working");
  try {
    state.overview = await window.agentguard.verifyPosture(state.projectPath);
    updateScope(state.overview);
    const drift = state.overview.drift;
    setStatus(
      drift?.status === "changed"
        ? `复扫完成：仍有 ${drift.activeEventCount} 项当前变化。`
        : drift?.status === "unchanged"
          ? "复扫完成：当前有效配置与可信状态一致。"
          : drift?.status === "no-baseline"
            ? "复扫完成：尚未保存可信状态。"
            : "复扫完成，但可信状态暂时不可用。",
      drift?.status === "changed" || drift?.status === "unavailable"
        ? "warn"
        : "ok"
    );
    renderCurrentView();
    $("postureSectionTitle")?.focus({ preventScroll: true });
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
}

async function chooseProject() {
  setWorking(true);
  setStatus("等待选择项目文件夹…", "working", "取消选择不会改变当前检查结果。");
  try {
    const result = await window.agentguard.selectProject();
    if (result.canceled) {
      setStatus("已取消选择项目，当前检查范围保持不变。");
      return;
    }
    if (result.projectPath !== state.projectPath) {
      state.lastBaselineApply = undefined;
      state.baseline = undefined;
    }
    state.projectPath = result.projectPath;
    state.scopeKind = "project";
    await scanProject();
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
}

async function applyBaselinePreview() {
  const plan = state.baseline;
  if (!plan || !state.projectPath || state.working) return;
  setWorking(true);
  setStatus("正在校验预览，等待你在原生确认框确认…", "working");
  try {
    const result = await window.agentguard.applyBaseline(
      state.projectPath,
      plan.profile,
      plan.fingerprint
    );
    if (result.canceled) {
      setStatus("已取消 baseline 应用，配置未修改。");
      return;
    }
    state.overview = result.overview;
    updateScope(state.overview);
    state.lastBaselineApply = {
      ...result.apply,
      transaction: result.transaction,
    };
    state.baseline = undefined;
    setStatus(
      result.transaction.message,
      "ok"
    );
    renderCurrentView();
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
}

async function restoreLastBaseline() {
  const last = state.lastBaselineApply;
  if (!last || !state.projectPath || state.working) return;
  setWorking(true);
  setStatus("正在校验备份，等待你确认恢复…", "working");
  try {
    const result = await window.agentguard.restoreBaseline(
      state.projectPath,
      last.backupId
    );
    if (result.canceled) {
      setStatus("已取消恢复，当前配置保持不变。");
      return;
    }
    state.overview = result.overview;
    updateScope(state.overview);
    state.lastBaselineApply = undefined;
    state.baseline = undefined;
    setStatus(result.transaction.message, "ok");
    renderCurrentView();
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
}

async function exportReport(format) {
  if (!state.projectPath) return;
  setWorking(true);
  setStatus(`正在重新扫描并导出 ${format.toUpperCase()} 报告…`, "working");
  try {
    const result = await window.agentguard.exportReport(state.projectPath, format);
    if (result.canceled) {
      setStatus("已取消导出。");
      return;
    }
    state.lastReportPath = result.report.path;
    $("openReportBtn").disabled = false;
    setStatus(`报告已保存：${result.report.path}`, "ok");
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
}

async function exportDiagnostics() {
  if (state.working) return;
  setWorking(true);
  setStatus("正在生成脱敏诊断文件…", "working");
  try {
    const result = await window.agentguard.exportDiagnostics();
    if (result.canceled) {
      setStatus("已取消诊断导出。");
      return;
    }
    setStatus(
      `脱敏诊断已保存：${result.diagnostics.path}（${result.diagnostics.eventCount} 条事件）`,
      "ok"
    );
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
}

function findTask(taskId) {
  return (
    state.overview?.tasks.find((task) => task.taskId === taskId) ||
    state.overview?.acceptedTasks.find((entry) => entry.task.taskId === taskId)?.task
  );
}

function openAcceptDialog(task) {
  state.pendingAcceptTask = task;
  $("acceptTitle").textContent = task.primary.finding.title;
  $("acceptDescription").textContent = task.requirements
    .map((requirement) => `${requirement.ruleId}：${requirement.acceptWhen}`)
    .join("\n");
  $("acceptReason").value = "";
  $("acceptExpires").value = "";
  $("acceptExpires").required = task.priority === "P0";
  $("acceptExpiryHelp").textContent =
    task.priority === "P0"
      ? "P0 任务必须设置未来的到期日期，到期后会自动重新进入待办。"
      : "可选；建议设置复审日期，避免环境变化后长期沿用旧判断。";
  $("acceptDialog").showModal();
  $("acceptReason").focus();
}

function closeAcceptDialog() {
  state.pendingAcceptTask = undefined;
  $("acceptDialog").close();
}

function openTrustDialogForTask(task) {
  const candidate = state.overview?.trustCandidates?.[task.taskId];
  if (!candidate) return;
  state.pendingTrust = { mode: "add", taskId: task.taskId, endpoint: candidate.endpoint };
  $("trustTitle").textContent = "信任此 Provider 端点";
  $("trustDescription").textContent = `端点：${candidate.endpoint}`;
  $("trustKindLabel").hidden = false;
  $("trustKind").value = "trusted";
  $("trustReason").value = "";
  $("trustSubmitBtn").textContent = "确认信任";
  $("trustDialog").showModal();
  $("trustReason").focus();
}

function openRemoveTrustDialog(endpoint, kind) {
  state.pendingTrust = { mode: "remove", endpoint, kind };
  $("trustTitle").textContent = "撤销端点信任";
  $("trustDescription").textContent = `撤销 ${endpoint} 的 ${kind} 标记后，相关未知端点会重新进入待办。`;
  $("trustKindLabel").hidden = true;
  $("trustReason").value = "";
  $("trustSubmitBtn").textContent = "确认撤销";
  $("trustDialog").showModal();
  $("trustReason").focus();
}

function closeTrustDialog() {
  state.pendingTrust = undefined;
  $("trustDialog").close();
}

function openIgnoreDialogForTask(task, ruleId) {
  const candidate = (state.overview?.ignoreCandidates?.[task.taskId] || []).find(
    (entry) => entry.ruleId === ruleId
  );
  if (!candidate) return;
  state.pendingIgnore = {
    mode: "add",
    taskId: task.taskId,
    ruleId: candidate.ruleId,
    agent: candidate.agent,
  };
  $("ignoreTitle").textContent = `忽略规则 ${candidate.ruleId}`;
  $("ignoreDescription").textContent =
    "只在当前项目和当前 Agent 生效；即使 evidence 或 task ID 变化，该规则仍会继续隐藏。";
  $("ignoreExpiresLabel").hidden = false;
  $("ignoreExpires").value = "";
  $("ignoreReason").value = "";
  $("ignoreSubmitBtn").textContent = "确认忽略";
  $("ignoreDialog").showModal();
  $("ignoreReason").focus();
}

function openRemoveIgnoreDialog(ruleId, agent) {
  state.pendingIgnore = { mode: "remove", ruleId, agent };
  $("ignoreTitle").textContent = `撤销规则忽略 ${ruleId}`;
  $("ignoreDescription").textContent =
    "撤销后，当前 Agent 的相关发现会在重新扫描后恢复到任务列表。";
  $("ignoreExpiresLabel").hidden = true;
  $("ignoreExpires").value = "";
  $("ignoreReason").value = "";
  $("ignoreSubmitBtn").textContent = "确认撤销";
  $("ignoreDialog").showModal();
  $("ignoreReason").focus();
}

function closeIgnoreDialog() {
  state.pendingIgnore = undefined;
  $("ignoreDialog").close();
}

const VERIFICATION_LABELS = {
  resolved: "已解决：当前扫描不再存在该任务。",
  present: "仍存在：任务尚未解决。",
  mitigated: "已缓解但未完全解决。",
  accepted: "任务仍存在，并有有效的风险接受记录。",
  expired: "风险接受已到期，任务重新进入待办。",
  revoked: "风险接受已撤销，任务重新进入待办。",
  "identity-changed": "任务身份发生变化，请查看可能的新任务。",
  unknown: "缺少该任务的历史快照，已记录本次扫描供下次验证。",
};

async function verifyTask(taskId) {
  setWorking(true);
  setStatus("正在重新扫描并验证这项任务…", "working");
  try {
    const result = await window.agentguard.verifyRisk(state.projectPath, taskId);
    state.overview = result.overview;
    updateScope(state.overview);
    setStatus(
      VERIFICATION_LABELS[result.verification.status] || result.verification.status,
      result.verification.status === "resolved" ? "ok" : "warn"
    );
    renderCurrentView();
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
}

function reopenTaskDetail(taskId) {
  const card = document.querySelector(
    `[data-task-card="${CSS.escape(taskId)}"]`
  );
  const details = card?.querySelector("details");
  if (details) details.open = true;
}

async function backupClaudeRemediation(taskId) {
  setWorking(true);
  setStatus("正在创建受保护的 Claude 配置备份…", "working");
  try {
    const result = await window.agentguard.backupClaudeRemediation(
      state.projectPath,
      taskId
    );
    if (result.canceled) {
      setStatus("已取消备份，配置未修改。");
      return;
    }
    state.credentialBackups.push({
      scopePath: state.projectPath,
      taskId,
      backupId: result.backup.backupId,
      files: result.backup.files,
      fingerprint: result.migration.fingerprint,
      phase: result.transaction.phase,
      transaction: result.transaction,
      verification: result.verification,
      retention: result.retention,
    });
    setStatus(
      `已备份 ${result.backup.files} 个 Claude 设置文件；现在可以执行迁移命令。`,
      "ok"
    );
    renderCurrentView();
    reopenTaskDetail(taskId);
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
}

async function applyClaudeMigration(taskId, backupId) {
  const backup = state.credentialBackups.find(
    (candidate) =>
      candidate.scopePath === state.projectPath &&
      candidate.taskId === taskId &&
      candidate.backupId === backupId
  );
  if (!backup) return;
  setWorking(true);
  setStatus("正在重新校验、应用 Claude 配置并复扫…", "working");
  try {
    const result = await window.agentguard.applyClaudeMigration(
      backup.scopePath,
      backup.taskId,
      backup.backupId,
      backup.fingerprint
    );
    if (result.canceled) {
      setStatus("已取消迁移，Claude 配置未修改。");
      return;
    }
    backup.phase = result.transaction.phase;
    backup.transaction = result.transaction;
    backup.verification = result.verification;
    state.overview = result.overview;
    updateScope(state.overview);
    setStatus(
      result.transaction.message,
      result.transaction.phase === "verified" ? "ok" : "error"
    );
    renderCurrentView();
    if (result.transaction.phase !== "verified") reopenTaskDetail(taskId);
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
}

async function cleanupClaudeCredentialBackup(taskId, backupId) {
  const backup = state.credentialBackups.find(
    (candidate) =>
      candidate.scopePath === state.projectPath &&
      candidate.taskId === taskId &&
      candidate.backupId === backupId
  );
  if (!backup) return;
  setWorking(true);
  setStatus("正在重新校验迁移状态与精确备份边界…", "working");
  try {
    const result = await window.agentguard.cleanupClaudeCredentialBackup(
      backup.scopePath,
      backup.taskId,
      backup.backupId
    );
    if (result.canceled) {
      setStatus("已保留迁移备份，仍可一键恢复。");
      return;
    }
    state.credentialBackups = state.credentialBackups.filter(
      (candidate) => candidate.backupId !== backup.backupId
    );
    state.overview = result.overview;
    updateScope(state.overview);
    setStatus(result.transaction.message, "ok");
    renderCurrentView();
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
}

async function restoreClaudeRemediation(backupId) {
  const backup = state.credentialBackups.find(
    (candidate) => candidate.backupId === backupId
  );
  if (!backup) return;
  setWorking(true);
  setStatus("正在校验备份与当前 Claude 配置…", "working");
  try {
    const result = await window.agentguard.restoreClaudeRemediation(
      backup.scopePath,
      backup.backupId
    );
    if (result.canceled) {
      setStatus("已取消恢复，当前配置未修改。");
      return;
    }
    state.credentialBackups = state.credentialBackups.filter(
      (candidate) => candidate.backupId !== backup.backupId
    );
    state.overview = result.overview;
    updateScope(state.overview);
    setStatus(
      `已恢复 ${result.restore.files} 个 Claude 设置文件并重新扫描。`,
      "ok"
    );
    renderCurrentView();
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
}

async function revokeTask(taskId) {
  if (!window.confirm("撤销后，该任务会重新进入默认待办。确认撤销吗？")) return;
  setWorking(true);
  setStatus("正在撤销风险接受记录…", "working");
  try {
    const result = await window.agentguard.revokeRisk(state.projectPath, taskId);
    state.overview = result.overview;
    setStatus("已撤销接受记录，任务已重新进入待办。", "ok");
    renderCurrentView();
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
}

$("selectProjectBtn").addEventListener("click", chooseProject);
$("machineScopeBtn").addEventListener("click", requestMachineScan);
$("runBtn").addEventListener("click", () =>
  state.scopeKind === "project" ? scanProject() : scanMachine()
);
$("exportHtmlBtn").addEventListener("click", () => {
  closeTransientMenus();
  exportReport("html");
});
$("exportJsonBtn").addEventListener("click", () => {
  closeTransientMenus();
  exportReport("json");
});
$("exportDiagnosticsBtn").addEventListener("click", () => {
  closeTransientMenus();
  exportDiagnostics();
});
$("openReportBtn").addEventListener("click", async () => {
  if (!state.lastReportPath) return;
  closeTransientMenus();
  setWorking(true);
  setStatus("正在打开最近导出的报告…", "working");
  try {
    const result = await window.agentguard.openReport(state.lastReportPath);
    if (!result.ok) {
      setStatus(result.error || "无法打开报告。", "error");
      return;
    }
    setStatus("报告已在默认浏览器中打开。", "ok");
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
});
baselineProfile.addEventListener("change", () => {
  state.baseline = undefined;
  renderCurrentView();
});

content.addEventListener("click", (event) => {
  const copyButton = event.target.closest("[data-copy-command]");
  if (copyButton && !state.working) {
    copyCommand(copyButton.dataset.copyCommand, copyButton);
    return;
  }
  const welcomeAction = event.target.closest("[data-welcome-action]");
  if (welcomeAction && !state.working) {
    if (welcomeAction.dataset.welcomeAction === "machine") requestMachineScan();
    if (welcomeAction.dataset.welcomeAction === "select") chooseProject();
    if (welcomeAction.dataset.welcomeAction === "retry") {
      if (state.scopeKind === "machine") requestMachineScan();
      else scanProject();
    }
    return;
  }
  const sectionJump = event.target.closest("[data-section-jump]");
  if (sectionJump) {
    scrollMainTo("agentsSection");
    return;
  }
  const priorityTask = event.target.closest("[data-priority-task]");
  if (priorityTask) {
    state.selectedAgent = priorityTask.dataset.priorityAgent;
    renderOverview(state.overview);
    focusTask(priorityTask.dataset.priorityTask);
    return;
  }
  const priorityDrift = event.target.closest("[data-priority-drift]");
  if (priorityDrift) {
    state.selectedAgent = priorityDrift.dataset.priorityAgent;
    renderOverview(state.overview);
    const card = document.querySelector(
      `[data-drift-card="${CSS.escape(priorityDrift.dataset.priorityDrift)}"]`
    );
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "center",
    });
    return;
  }
  const agentView = event.target.closest("[data-agent-view]");
  if (agentView) {
    state.selectedAgent = agentView.dataset.agentView;
    renderOverview(state.overview);
    content.querySelector(`[data-agent-view="${CSS.escape(state.selectedAgent)}"]`)?.focus();
    scrollMainTo("activeAgentWorkspace", 82);
    return;
  }
  const agentOverview = event.target.closest("[data-agent-overview]");
  if (agentOverview) {
    scrollMainTo("agentsSection");
    content.querySelector(`[data-agent-view="${CSS.escape(state.selectedAgent)}"]`)?.focus({
      preventScroll: true,
    });
    return;
  }
  const scopeAction = event.target.closest("[data-scope-action]");
  if (scopeAction && !state.working) {
    if (scopeAction.dataset.scopeAction === "machine") requestMachineScan();
    if (scopeAction.dataset.scopeAction === "project") chooseProject();
    return;
  }
  const postureAction = event.target.closest("[data-posture-action]");
  if (postureAction && !state.working) {
    if (postureAction.dataset.postureAction === "save") {
      savePostureBaseline();
    }
    if (postureAction.dataset.postureAction === "remove") {
      removePostureBaseline();
    }
    if (postureAction.dataset.postureAction === "verify") {
      verifyPosture();
    }
    return;
  }
  const button = event.target.closest("[data-task-action]");
  if (!button || button.disabled || state.working) return;
  button.closest(".task-policy-menu")?.removeAttribute("open");
  const taskId = button.dataset.taskId;
  const action = button.dataset.taskAction;
  if (action === "baseline") {
    previewBaseline().then(() =>
      scrollMainTo("remediationSection", 8)
    );
  }
  if (action === "guide") {
    const card = document.querySelector(`[data-task-card="${CSS.escape(taskId)}"]`);
    const details = card?.querySelector("details");
    if (details) details.open = true;
    details?.querySelector("summary")?.focus({ preventScroll: true });
    card?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "center",
    });
  }
  if (action === "accept") {
    const task = findTask(taskId);
    if (task) openAcceptDialog(task);
  }
  if (action === "verify") verifyTask(taskId);
  if (action === "revoke") revokeTask(taskId);
  if (action === "trust") {
    const task = findTask(taskId);
    if (task) openTrustDialogForTask(task);
  }
  if (action === "ignore") {
    const task = findTask(taskId);
    if (task) openIgnoreDialogForTask(task, button.dataset.ruleId);
  }
});

content.addEventListener("click", (event) => {
  const button = event.target.closest("[data-credential-action]");
  if (!button || button.disabled || state.working) return;
  if (button.dataset.credentialAction === "backup") {
    backupClaudeRemediation(button.dataset.taskId);
  }
  if (button.dataset.credentialAction === "apply") {
    applyClaudeMigration(
      button.dataset.taskId,
      button.dataset.backupId
    );
  }
  if (button.dataset.credentialAction === "restore") {
    restoreClaudeRemediation(button.dataset.backupId);
  }
  if (button.dataset.credentialAction === "cleanup") {
    cleanupClaudeCredentialBackup(
      button.dataset.taskId,
      button.dataset.backupId
    );
  }
});

document.addEventListener("click", (event) => {
  const activeMenu = event.target.closest(".report-menu, .task-policy-menu");
  closeTransientMenus(activeMenu);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const openMenu = document.querySelector(".task-policy-menu[open], .report-menu[open]");
  if (!openMenu) return;
  event.preventDefault();
  closeTransientMenus();
  openMenu.querySelector(":scope > summary")?.focus();
});

content.addEventListener("keydown", (event) => {
  const current = event.target.closest('[data-agent-view][role="tab"]');
  if (!current || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [...content.querySelectorAll('[data-agent-view][role="tab"]')];
  const currentIndex = tabs.indexOf(current);
  if (currentIndex < 0) return;
  event.preventDefault();
  let nextIndex = currentIndex;
  if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = tabs.length - 1;
  const nextAgent = tabs[nextIndex].dataset.agentView;
  state.selectedAgent = nextAgent;
  renderOverview(state.overview);
  content.querySelector(`[data-agent-view="${CSS.escape(nextAgent)}"]`)?.focus();
});

content.addEventListener("click", (event) => {
  const button = event.target.closest("[data-trust-action='remove']");
  if (!button || state.working) return;
  openRemoveTrustDialog(button.dataset.endpoint, button.dataset.kind);
});

content.addEventListener("click", (event) => {
  const button = event.target.closest("[data-ignore-action='remove']");
  if (!button || state.working) return;
  openRemoveIgnoreDialog(button.dataset.ruleId, button.dataset.agent);
});

content.addEventListener("click", (event) => {
  const button = event.target.closest("[data-baseline-action]");
  if (!button || state.working) return;
  if (button.dataset.baselineAction === "preview") {
    const inlineProfile = $("inlineBaselineProfile");
    if (inlineProfile) baselineProfile.value = inlineProfile.value;
    previewBaseline();
  }
  if (button.dataset.baselineAction === "apply") applyBaselinePreview();
  if (button.dataset.baselineAction === "restore") restoreLastBaseline();
});

$("acceptForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const task = state.pendingAcceptTask;
  if (!task || !state.projectPath || state.working) return;
  const reason = $("acceptReason").value.trim();
  const expiresAt = $("acceptExpires").value || undefined;
  if (!reason) {
    $("acceptReason").reportValidity();
    return;
  }
  setWorking(true);
  setStatus("正在写入本地风险接受记录…", "working");
  try {
    const result = await window.agentguard.acceptRisk(
      state.projectPath,
      task.taskId,
      reason,
      expiresAt
    );
    state.overview = result.overview;
    closeAcceptDialog();
    setStatus("风险已在当前项目接受；可随时验证或撤销。", "ok");
    renderCurrentView();
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
});

$("acceptCancelBtn").addEventListener("click", closeAcceptDialog);
$("acceptDismissBtn").addEventListener("click", closeAcceptDialog);

$("trustForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const pending = state.pendingTrust;
  if (!pending || !state.projectPath || state.working) return;
  const reason = $("trustReason").value.trim();
  if (!reason) {
    $("trustReason").reportValidity();
    return;
  }
  setWorking(true);
  try {
    if (pending.mode === "add") {
      setStatus("正在写入项目级可信端点并重新扫描…", "working");
      const result = await window.agentguard.trustProvider(
        state.projectPath,
        pending.taskId,
        $("trustKind").value,
        reason
      );
      state.overview = result.overview;
      setStatus(`已信任 ${result.entry.endpoint}；其他风险仍会独立显示。`, "ok");
    } else {
      setStatus("正在撤销端点信任并重新扫描…", "working");
      const result = await window.agentguard.removeProviderTrust(
        state.projectPath,
        pending.endpoint,
        pending.kind,
        reason
      );
      state.overview = result.overview;
      setStatus(`已撤销 ${result.entry.endpoint} 的端点信任。`, "ok");
    }
    closeTrustDialog();
    renderCurrentView();
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
});

$("trustCancelBtn").addEventListener("click", closeTrustDialog);
$("trustDismissBtn").addEventListener("click", closeTrustDialog);

$("ignoreForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const pending = state.pendingIgnore;
  if (!pending || !state.projectPath || state.working) return;
  const reason = $("ignoreReason").value.trim();
  if (!reason) {
    $("ignoreReason").reportValidity();
    return;
  }
  setWorking(true);
  try {
    if (pending.mode === "add") {
      setStatus("正在写入项目规则忽略并重新扫描…", "working");
      const result = await window.agentguard.ignoreRule(
        state.projectPath,
        pending.taskId,
        pending.ruleId,
        reason,
        $("ignoreExpires").value || undefined
      );
      state.overview = result.overview;
      setStatus(`已忽略 ${result.entry.agent}/${result.entry.ruleId}。`, "ok");
    } else {
      setStatus("正在撤销项目规则忽略并重新扫描…", "working");
      const result = await window.agentguard.removeRuleIgnore(
        state.projectPath,
        pending.ruleId,
        pending.agent,
        reason
      );
      state.overview = result.overview;
      setStatus(`已撤销 ${result.entry.agent}/${result.entry.ruleId} 的忽略。`, "ok");
    }
    closeIgnoreDialog();
    renderCurrentView();
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    setWorking(false);
  }
});

$("ignoreCancelBtn").addEventListener("click", closeIgnoreDialog);
$("ignoreDismissBtn").addEventListener("click", closeIgnoreDialog);

[
  ["acceptDialog", "pendingAcceptTask"],
  ["trustDialog", "pendingTrust"],
  ["ignoreDialog", "pendingIgnore"],
].forEach(([dialogId, pendingKey]) => {
  const dialog = $(dialogId);
  dialog.addEventListener("cancel", (event) => {
    if (state.working) event.preventDefault();
  });
  dialog.addEventListener("close", () => {
    state[pendingKey] = undefined;
  });
});

if (window.agentguard && typeof window.agentguard.onMenuCommand === "function") {
  window.agentguard.onMenuCommand(handleNativeMenuCommand);
}
renderCurrentView();
