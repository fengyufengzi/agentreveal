const VIEWS = {
  doctor: {
    title: "环境体检",
    subtitle: "查看本机已配置的 AI Coding Agent。",
    render: renderDoctor,
  },
  scan: {
    title: "风险扫描",
    subtitle: "汇总 Provider、MCP、密钥、权限和敏感文件风险。",
    render: renderScan,
  },
  map: {
    title: "配置地图",
    subtitle: "一眼看清每个 Agent 连接了谁、风险在哪里。",
    render: renderMap,
  },
  provider: {
    title: "Provider 风险",
    subtitle: "只查看 base_url、代理链路和未知中转端点。",
    render: renderScan,
  },
  baselineBalanced: {
    title: "Baseline dry-run",
    subtitle: "预览 OpenCode balanced 基线会修改什么，不写文件。",
    render: renderBaseline,
  },
  baselineSafe: {
    title: "Baseline dry-run",
    subtitle: "预览 OpenCode safe 基线会修改什么，不写文件。",
    render: renderBaseline,
  },
};

let currentCommand = "doctor";

const $ = (id) => document.getElementById(id);
const content = $("content");
const summary = $("summary");
const status = $("status");
const rawOutput = $("rawOutput");
const baselineProfile = $("baselineProfile");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(text, kind = "idle") {
  status.className = `status ${kind}`;
  status.textContent = text;
}

function cards(items) {
  summary.innerHTML = items
    .map(
      (item) =>
        `<div class="card"><strong>${escapeHtml(item.value)}</strong><span>${escapeHtml(
          item.label
        )}</span></div>`
    )
    .join("");
}

function parseResult(result) {
  rawOutput.textContent = result.stdout || result.stderr || "";
  if (!result.ok) throw new Error(result.stderr || "命令执行失败");
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(result.stderr || "输出不是合法 JSON");
  }
}

function evidence(ev = {}) {
  return Object.entries(ev)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join(" | ");
}

function findingCard(f) {
  return `<article class="finding">
    <h3><span class="badge ${escapeHtml(f.severity)}">${escapeHtml(
      f.severity
    )}</span>${escapeHtml(f.title)}</h3>
    ${f.description ? `<p>${escapeHtml(f.description)}</p>` : ""}
    ${f.evidence ? `<div class="meta">${escapeHtml(evidence(f.evidence))}</div>` : ""}
  </article>`;
}

function renderDoctor(data) {
  const agents = data.agents || [];
  const configured = agents.filter((a) => a.configFound).length;
  cards([
    { label: "已配置 Agent", value: configured },
    { label: "总计", value: agents.length },
  ]);
  content.innerHTML = agents
    .map(
      (a) => `<article class="finding">
        <h3><span class="badge ${a.configFound ? "low" : "info"}">${
          a.configFound ? "found" : "missing"
        }</span>${escapeHtml(a.displayName)}</h3>
        <p>${escapeHtml(a.configPath || "未发现配置")}</p>
        ${a.notes?.length ? `<div class="meta">${escapeHtml(a.notes.join(" | "))}</div>` : ""}
      </article>`
    )
    .join("");
}

function renderScan(data) {
  const findings = [
    ...(data.allFindings || []),
    ...(data.correlations || []),
  ];
  const high = findings.filter((f) => f.severity === "high" || f.severity === "critical").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  cards([
    { label: "风险总数", value: findings.length },
    { label: "高危及以上", value: high },
    { label: "中危", value: medium },
  ]);
  content.innerHTML = findings.length
    ? findings.map(findingCard).join("")
    : `<div class="empty">未发现风险。</div>`;
}

function renderMap(data) {
  const rows = data.rows || [];
  cards([
    { label: "地图行", value: rows.length },
    { label: "代理链路", value: data.proxyChains?.length || 0 },
  ]);
  content.innerHTML = rows
    .map(
      (r) => `<article class="finding">
        <h3><span class="badge ${escapeHtml(r.risk)}">${escapeHtml(
          r.risk
        )}</span>${escapeHtml(r.displayName)}</h3>
        <p>${escapeHtml((r.endpoints || []).join(", ") || "无端点摘要")}</p>
        <div class="meta">MCP=${r.mcpCount} | 密钥=${r.secretCount} | 敏感=${r.sensitiveCount} | 权限=${r.permissionCount}</div>
      </article>`
    )
    .join("");
}

function renderBaseline(data) {
  const files = data.files || [];
  const changes = files.flatMap((f) => f.changes || []);
  cards([
    { label: "profile", value: data.profile },
    { label: "文件", value: files.length },
    { label: "变更", value: changes.length },
  ]);
  if (data.warnings?.length) {
    content.innerHTML = data.warnings
      .map((w) => `<article class="finding"><h3>Warning</h3><p>${escapeHtml(w)}</p></article>`)
      .join("");
    return;
  }
  content.innerHTML = changes.length
    ? changes
        .map(
          (c) => `<article class="finding">
            <h3>${escapeHtml(c.path)}</h3>
            <p>${escapeHtml(JSON.stringify(c.from))} → ${escapeHtml(JSON.stringify(c.to))}</p>
            <div class="meta">${escapeHtml(c.reason)}</div>
          </article>`
        )
        .join("")
    : `<div class="empty">未生成变更建议。</div>`;
}

async function run(command = currentCommand) {
  currentCommand = command;
  if (command === "baselineBalanced" || command === "baselineSafe") {
    currentCommand = baselineProfile.value;
  }
  const view = VIEWS[currentCommand];
  $("viewTitle").textContent = view.title;
  $("viewSubtitle").textContent = view.subtitle;
  summary.innerHTML = "";
  content.innerHTML = "";
  rawOutput.textContent = "";
  setStatus("运行中...");

  try {
    const result = await window.agentguard.run(currentCommand);
    const data = parseResult(result);
    view.render(data);
    setStatus(result.code === 2 ? "完成：发现高危风险" : "完成", result.code === 2 ? "warn" : "ok");
  } catch (err) {
    setStatus(err.message, "error");
    content.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

document.querySelectorAll(".nav").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    run(button.dataset.command);
  });
});

$("refreshBtn").addEventListener("click", () => run(currentCommand));
$("reportBtn").addEventListener("click", async () => {
  setStatus("生成报告中...");
  const result = await window.agentguard.run("reportHtml");
  rawOutput.textContent = result.stdout || result.stderr;
  setStatus(result.ok ? "HTML 报告已生成" : "报告生成失败", result.ok ? "ok" : "error");
});
$("openReportBtn").addEventListener("click", () => window.agentguard.openReport());
baselineProfile.addEventListener("change", () => {
  if (currentCommand === "baselineBalanced" || currentCommand === "baselineSafe") {
    run(baselineProfile.value);
  }
});

run("doctor");
