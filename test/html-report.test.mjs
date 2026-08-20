/**
 * HTML 报告生成测试。重点：动态内容必须 HTML 转义（防 XSS）。
 * 从 dist/ 导入（编译产物）。运行前需 npm run build。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHtmlReport, escapeHtml } from "../dist/core/report/html-report.js";

/** 造一个含风险的最小 ScanReport。 */
function makeReport(findings) {
  const result = {
    agent: "cc-switch",
    displayName: "CC Switch",
    discovery: { agent: "cc-switch", displayName: "CC Switch", configFound: true, configPath: "/home/u/.cc-switch/cc-switch.db" },
    findings,
  };
  return { results: [result], allFindings: findings, correlations: [] };
}

function countOf(text, needle) {
  return text.split(needle).length - 1;
}

test("escapeHtml 覆盖全部危险字符", () => {
  assert.equal(
    escapeHtml(`<script>&"'`),
    "&lt;script&gt;&amp;&quot;&#39;"
  );
});

test("恶意 title/evidence 被转义，不产生活动脚本标签", () => {
  const findings = [
    {
      id: "X",
      category: "provider",
      severity: "high",
      title: `<img src=x onerror=alert(1)>`,
      description: `</style><script>alert(2)</script>`,
      evidence: { baseUrl: `https://a.io/"><script>alert(3)</script>` },
      recommendation: `<b>hi</b>`,
    },
  ];
  const html = renderHtmlReport(makeReport(findings));
  // 原始 payload 绝不能以可执行形式出现
  assert.ok(!html.includes("<script>alert(2)"));
  assert.ok(!html.includes("<script>alert(3)"));
  assert.ok(!html.includes("<img src=x onerror"));
  // 转义后的实体应存在
  assert.ok(html.includes("&lt;img src=x onerror"));
  assert.ok(html.includes("&lt;script&gt;alert(3)"));
});

test("正常报告包含行动首页、技术证据与严重度徽标", () => {
  const findings = [
    { id: "A", category: "secret", severity: "high", title: "明文密钥" },
    { id: "B", category: "provider", severity: "info", title: "代理" },
  ];
  const html = renderHtmlReport(makeReport(findings), {
    generatedAt: new Date("2026-07-10T00:00:00Z"),
  });
  assert.ok(html.includes("2026-07-10T00:00:00.000Z"));
  assert.ok(html.includes("AgentReveal 下一步行动报告"));
  assert.ok(html.includes("共 2 项发现"));
  assert.ok(html.includes("按 Agent 查看技术证据"));
  assert.ok(html.includes("高危 1"));
  assert.ok(html.includes("明文密钥"));
  assert.ok(html.startsWith("<!doctype html>"));
});

test("顶部按四种处置类型计数，observe 不计入需要行动", () => {
  const findings = [
    { id: "CLAUDE_PLAINTEXT_TOKEN", category: "secret", severity: "high", title: "修复" },
    { id: "CODEX_CUSTOM_PROVIDER", category: "provider", severity: "medium", title: "确认", evidence: { provider: "relay", baseUrl: "https://relay.example/v1" } },
    { id: "CODEX_TRUSTED_PROJECTS", category: "permission", severity: "low", title: "清理", evidence: { projects: ["/work/old"] } },
    { id: "GEMINI_AUTH_MODE", category: "provider", severity: "info", title: "观察", evidence: { authType: "oauth" } },
  ];
  const html = renderHtmlReport(makeReport(findings));
  assert.ok(html.includes("4 项发现 · 4 个行动任务 · 3 个需要行动"));
  assert.ok(html.includes('<strong>1</strong><span>立即处理</span>'));
  assert.ok(html.includes('<strong>1</strong><span>需要确认</span>'));
  assert.ok(html.includes('<strong>1</strong><span>建议清理</span>'));
  assert.ok(html.includes('<strong>1</strong><span>配置观察</span>'));
});

test("建议先完成的三项按 priority 排序并排除 observe", () => {
  const findings = [
    { id: "CODEX_TRUSTED_PROJECTS", category: "permission", severity: "medium", title: "第三项 P2", evidence: { projects: ["/work/old"] } },
    { id: "GEMINI_AUTH_MODE", category: "provider", severity: "info", title: "不应进入前三", evidence: { authType: "oauth" } },
    { id: "CLAUDE_PLAINTEXT_TOKEN", category: "secret", severity: "high", title: "第一项 P0" },
    { id: "CODEX_CUSTOM_PROVIDER", category: "provider", severity: "medium", title: "第二项 P1", evidence: { provider: "relay", baseUrl: "https://relay.example/v1" } },
  ];
  const html = renderHtmlReport(makeReport(findings));
  const top = html.slice(html.indexOf('<section class="top-actions">'), html.indexOf('</section>', html.indexOf('<section class="top-actions">')));
  assert.ok(top.includes("建议先完成的 3 项"));
  assert.ok(top.indexOf("第一项 P0") < top.indexOf("第二项 P1"));
  assert.ok(top.indexOf("第二项 P1") < top.indexOf("第三项 P2"));
  assert.ok(!top.includes("不应进入前三"));
});

test("行动卡展示原因、步骤、验证、Agent、接受条件与 baseline 效果", () => {
  const findings = [
    {
      id: "OPENCODE_PERMISSION_WILDCARD",
      category: "permission",
      severity: "medium",
      title: "权限全部放行",
      evidence: { bash: "allow", edit: "allow" },
    },
  ];
  const html = renderHtmlReport(makeReport(findings));
  assert.ok(html.includes("CC Switch"));
  assert.ok(html.includes("OPENCODE_PERMISSION_WILDCARD"));
  assert.ok(html.includes("为什么要处理"));
  assert.ok(html.includes("整体 allow 会让编辑、网络和命令工具全部免确认。"));
  assert.ok(html.includes("使用 baseline 改为显式分项权限"));
  assert.ok(html.includes("完成处置后重新运行 agentreveal scan"));
  assert.ok(html.includes("Baseline 支持"));
  assert.ok(html.includes("balanced：风险缓解"));
  assert.ok(html.includes("safe：完整解决"));
  assert.ok(html.includes("agentreveal baseline --profile balanced --dry-run"));
  assert.ok(html.includes("agentreveal apply --profile balanced --backup"));
  assert.ok(html.includes("本机自动整改"));
  assert.ok(html.includes("复制命令"));
  assert.ok(html.includes("仅一次性隔离环境可限时接受。"));
  assert.match(html, /agentreveal risk accept task-[a-f0-9]{12} --reason/);
  assert.ok(html.includes("--confirm"));
  assert.ok(html.includes("agentreveal risk verify task-"));
  assert.ok(html.includes("这是生成时刻的静态快照"));
});

test("未知 Provider 提供可复制的项目级信任命令，HTTP 规则不单独提供", () => {
  const provider = {
    id: "OPENCODE_CUSTOM_PROVIDER",
    category: "provider",
    severity: "medium",
    title: "自建中转",
    evidence: {
      provider: "relay",
      baseUrl: "http://relay.report-example.net:8443/v1",
    },
  };
  const html = renderHtmlReport(makeReport([provider]));
  assert.ok(
    html.includes(
      'agentreveal trust add &quot;relay.report-example.net&quot; --kind trusted'
    )
  );
  assert.ok(html.includes("HTTP、明文密钥和危险权限风险仍会显示"));

  const httpOnly = renderHtmlReport(
    makeReport([
      {
        ...provider,
        id: "OPENCODE_INSECURE_HTTP",
        title: "明文 HTTP",
      },
    ])
  );
  assert.equal(httpOnly.includes("agentreveal trust add"), false);
});

test("已接受任务退出默认待办但保留原因、撤销命令与技术证据", () => {
  const findings = [
    {
      id: "CCSWITCH_UNKNOWN_BASE_URL",
      category: "provider",
      severity: "high",
      title: "自建示例中转",
      evidence: {
        appType: "claude",
        provider: "PersonalRelay",
        baseUrl: "https://relay.example.com/v1",
      },
    },
  ];
  const report = makeReport(findings);
  const initial = renderHtmlReport(report);
  const taskId = initial.match(/id="(task-[a-f0-9]{12})"/)?.[1];
  assert.ok(taskId);

  const html = renderHtmlReport(report, {
    acceptances: [
      {
        taskId,
        reason: "个人自建且已核对 TLS 与访问控制",
        expiresAt: "2027-01-01T00:00:00.000Z",
      },
    ],
  });

  assert.ok(html.includes("1 个已接受"));
  assert.ok(html.includes("0 个行动任务 · 0 个需要行动"));
  assert.ok(html.includes("已接受风险"));
  assert.ok(html.includes("个人自建且已核对 TLS 与访问控制"));
  assert.ok(html.includes(`agentreveal risk revoke ${taskId}`));
  assert.ok(html.includes("自建示例中转"));
  assert.equal(countOf(html, '<article class="action-card'), 0);
  assert.equal(countOf(html, '<div class="finding sev-'), 1);
});

test("项目规则忽略退出行动任务但保留审计、撤销命令与技术证据", () => {
  const findings = [{
    id: "CCSWITCH_PROXY_ENABLED",
    category: "provider",
    severity: "info",
    title: "项目自建代理已开启",
    evidence: { appType: "claude", proxy: "127.0.0.1:9000" },
  }];
  const report = makeReport(findings);
  const initial = renderHtmlReport(report);
  assert.match(initial, /agentreveal ignore add task-[a-f0-9]{12} --rule CCSWITCH_PROXY_ENABLED/);

  const html = renderHtmlReport(report, {
    ruleIgnores: [{
      ruleId: "CCSWITCH_PROXY_ENABLED",
      agent: "cc-switch",
      reason: "已核对本机代理进程和受控上游",
      createdAt: "2026-07-18T00:00:00.000Z",
      status: "active",
    }],
  });
  assert.ok(html.includes("1 条项目规则已忽略"));
  assert.ok(html.includes("项目已忽略规则"));
  assert.ok(html.includes("已核对本机代理进程和受控上游"));
  assert.ok(html.includes("agentreveal ignore remove CCSWITCH_PROXY_ENABLED --agent cc-switch"));
  assert.equal(countOf(html, '<article class="action-card'), 0);
  assert.equal(countOf(html, '<div class="finding sev-'), 1);

  const policyWithoutFinding = renderHtmlReport(makeReport([]), {
    ruleIgnores: [{
      ruleId: "CCSWITCH_PROXY_ENABLED",
      agent: "cc-switch",
      reason: "已核对本机代理进程和受控上游",
      createdAt: "2026-07-18T00:00:00.000Z",
      status: "active",
    }],
  });
  assert.ok(policyWithoutFinding.includes("当前扫描未命中（策略仍有效）"));
  assert.ok(policyWithoutFinding.includes("agentreveal ignore remove CCSWITCH_PROXY_ENABLED"));
});

test("同一根因的多个 finding 聚合为一张任务卡，计数按任务而非 finding", () => {
  const evidence = {
    appType: "claude",
    provider: "relay-a",
    baseUrl: "http://relay.example/v1",
  };
  const findings = [
    {
      id: "CCSWITCH_UNKNOWN_BASE_URL",
      category: "provider",
      severity: "high",
      title: "未知端点 relay-a",
      evidence,
    },
    {
      id: "CCSWITCH_INSECURE_HTTP",
      category: "provider",
      severity: "medium",
      title: "明文 HTTP relay-a",
      evidence,
    },
  ];
  const html = renderHtmlReport(makeReport(findings));

  assert.ok(html.includes("2 项发现 · 1 个行动任务 · 1 个需要行动"));
  assert.ok(html.includes('<strong>1</strong><span>立即处理</span>'));
  assert.ok(html.includes('<strong>0</strong><span>需要确认</span>'));
  assert.equal(countOf(html, '<article class="action-card'), 1);
  assert.ok(html.includes("2 项关联"));
  assert.ok(html.includes("未知端点 relay-a"));
  assert.ok(html.includes("明文 HTTP relay-a"));
  assert.ok(html.includes("CCSWITCH_UNKNOWN_BASE_URL"));
  assert.ok(html.includes("CCSWITCH_INSECURE_HTTP"));
  assert.ok(html.includes("经批准的内部/自建 HTTPS 端点"));
  assert.ok(html.includes("loopback 第一跳，或隔离私网中的限时例外"));
  assert.ok(html.includes("必须同时处理或逐项接受全部 2 条关联规则"));
  assert.match(html, /action-meta[^>]*><span>CC Switch<\/span>/);
  // 技术证据区仍保留两条原始 finding。
  assert.equal(countOf(html, '<div class="finding sev-'), 2);
});

test("不同 evidence 身份保持为不同任务", () => {
  const findings = ["one", "two"].map((name) => ({
    id: "CCSWITCH_UNKNOWN_BASE_URL",
    category: "provider",
    severity: "medium",
    title: `未知端点 ${name}`,
    evidence: {
      appType: "claude",
      provider: name,
      baseUrl: `https://${name}.example/v1`,
    },
  }));
  const html = renderHtmlReport(makeReport(findings));
  assert.ok(html.includes("2 项发现 · 2 个行动任务 · 2 个需要行动"));
  assert.equal(countOf(html, '<article class="action-card'), 2);
});

test("聚合的 baseline 任务只显示一组执行命令", () => {
  const finding = {
    id: "OPENCODE_PERMISSION_WILDCARD",
    category: "permission",
    severity: "medium",
    title: "权限全部放行",
    evidence: { bash: "allow", edit: "allow" },
  };
  const html = renderHtmlReport(makeReport([finding, { ...finding }]));
  assert.ok(html.includes("2 项发现 · 1 个行动任务 · 1 个需要行动"));
  assert.equal(
    countOf(html, "agentreveal baseline --profile balanced --dry-run"),
    1
  );
  assert.equal(
    countOf(html, "agentreveal apply --profile balanced --backup"),
    1
  );
});

test("行动字段全部转义，不产生活动标签", () => {
  const payload = `<img src=x onerror=alert('action')>`;
  const findings = [
    {
      id: `ACTION_${payload}`,
      category: "provider",
      severity: "high",
      title: payload,
    },
  ];
  const html = renderHtmlReport(makeReport(findings));
  assert.ok(!html.includes(payload));
  assert.ok(!html.includes("<img src=x onerror"));
  assert.ok(html.includes("&lt;img src=x onerror"));
});

test("无风险的 Agent 显示未发现风险", () => {
  const report = {
    results: [
      {
        agent: "opencode",
        displayName: "OpenCode",
        discovery: { agent: "opencode", displayName: "OpenCode", configFound: true },
        findings: [],
      },
    ],
    allFindings: [],
  };
  const html = renderHtmlReport(report);
  assert.ok(html.includes("未发现风险"));
});

// —— 顶部总览 + 交互过滤 —— //

test("顶部总览表存在且各 severity 计数正确", () => {
  const findings = [
    { id: "A", category: "secret", severity: "high", title: "明文密钥" },
    { id: "B", category: "provider", severity: "high", title: "未知端点" },
    { id: "C", category: "mcp", severity: "info", title: "本地 MCP" },
  ];
  const html = renderHtmlReport(makeReport(findings));
  assert.ok(html.includes('class="overview"'));
  // CC Switch 行：最高严重度徽标 + 高危 2 + 合计 3
  assert.ok(/CC Switch/.test(html));
  assert.ok(html.includes('<td class="num">2</td>')); // 高危列
  assert.ok(html.includes('<td class="num total">3</td>'));
});

test("总览 Agent 链接锚点与 section id 对应", () => {
  const findings = [
    { id: "A", category: "secret", severity: "high", title: "明文密钥" },
  ];
  const html = renderHtmlReport(makeReport(findings));
  assert.ok(html.includes('href="#agent-cc-switch"'));
  assert.ok(html.includes('id="agent-cc-switch"'));
});

test("交互过滤：内联脚本存在且无外链 script", () => {
  const findings = [
    { id: "A", category: "secret", severity: "high", title: "明文密钥" },
  ];
  const html = renderHtmlReport(makeReport(findings));
  // 徽标带 data-filter，finding 带 data-sev，内联脚本注册 click
  assert.ok(html.includes('data-filter="high"'));
  assert.ok(html.includes('data-sev="high"'));
  assert.ok(html.includes("addEventListener"));
  // 绝不能出现外链脚本
  assert.ok(!/<script[^>]+src=/.test(html));
});

test("过滤脚本不破坏 XSS 转义", () => {
  const findings = [
    {
      id: "X",
      category: "provider",
      severity: "high",
      title: `<img src=x onerror=alert(1)>`,
      evidence: { baseUrl: `"><script>alert(9)</script>` },
    },
  ];
  const html = renderHtmlReport(makeReport(findings));
  assert.ok(!html.includes("<img src=x onerror"));
  assert.ok(!html.includes("<script>alert(9)"));
  assert.ok(html.includes("&lt;img src=x onerror"));
});

test("correlations 计入总览末行", () => {
  const report = {
    results: [
      {
        agent: "claude-code",
        displayName: "Claude Code",
        discovery: { agent: "claude-code", displayName: "Claude Code", configFound: true },
        findings: [{ id: "A", category: "secret", severity: "high", title: "x" }],
      },
    ],
    allFindings: [{ id: "A", category: "secret", severity: "high", title: "x" }],
    correlations: [
      { id: "XAGENT_SHARED_PROXY", category: "provider", severity: "high", title: "共享代理" },
    ],
  };
  const html = renderHtmlReport(report);
  assert.ok(html.includes('href="#correlation"'));
  assert.ok(html.includes("跨 Agent 关联"));
});

test("remediation 渲染为有序步骤列表且每步转义", () => {
  const findings = [
    {
      id: "CODEX_PLAINTEXT_API_KEY",
      category: "secret",
      severity: "high",
      title: "明文密钥",
      recommendation: "改用 OAuth",
      remediation: [
        "删除 auth.json 中的 key",
        `<script>alert('step')</script>`,
      ],
    },
  ];
  const html = renderHtmlReport(makeReport(findings));
  assert.ok(html.includes('<ol class="f-steps">'));
  assert.ok(html.includes("删除 auth.json 中的 key"));
  assert.ok(html.includes("手动整改步骤"));
  // 步骤中的 payload 必须被转义
  assert.ok(!html.includes("<script>alert('step')"));
  assert.ok(html.includes("&lt;script&gt;alert("));
});

test("drift section: 包含分类徽标（drift-class-conflict/regression/expansion）", () => {
  const html = renderHtmlReport(
    { results: [
        { agent: "claude-code", displayName: "Claude Code",
          discovery: { agent: "claude-code", displayName: "Claude Code", configFound: true, configPath: "/tmp/x" },
          findings: [] },
        { agent: "codex", displayName: "Codex",
          discovery: { agent: "codex", displayName: "Codex", configFound: true, configPath: "/tmp/x" },
          findings: [] },
        { agent: "opencode", displayName: "OpenCode",
          discovery: { agent: "opencode", displayName: "OpenCode", configFound: true, configPath: "/tmp/x" },
          findings: [] },
      ],
      allFindings: [], correlations: [] },
    {
      drift: {
      status: "changed",
      activeEventCount: 3,
      resolvedEventCount: 1,
      baselineCapturedAt: "2026-08-05T00:00:00Z",
      events: [
        {
          eventId: "drift-html-1",
          agentId: "claude-code",
          kind: "auth-source-changed",
          change: "changed",
          priority: "P1",
          severity: "high",
          currentSummary: "认证来源与上次可信状态不同。",
          previousCategory: "user[active]",
          action: ["确认实际生效的认证来源"],
          verification: ["复扫确认认证来源唯一"],
        },
        {
          eventId: "drift-html-2",
          agentId: "codex",
          kind: "permission-changed",
          change: "changed",
          priority: "P0",
          severity: "high",
          currentSummary: "权限能力扩大。",
          action: ["复核权限扩大"],
          verification: ["复扫确认"],
        },
        {
          eventId: "drift-html-3",
          agentId: "opencode",
          kind: "risk-reappeared",
          change: "reappeared",
          priority: "P1",
          severity: "medium",
          currentSummary: "之前已解决的风险再次出现。",
          action: ["重新处置"],
          verification: ["复扫确认"],
        },
      ],
    },
  });
  assert.match(html, /data-drift-class="conflict"/);
  assert.match(html, /data-drift-class="expansion"/);
  assert.match(html, /data-drift-class="regression"/);
  assert.match(html, /drift-class-conflict/);
  assert.match(html, /drift-class-expansion/);
  assert.match(html, /drift-class-regression/);
  // 解读文案通过 drift-guidance class 渲染
  assert.match(html, /class="drift-guidance"/);
  assert.match(html, /多来源或权限相互竞争/);
  // XSS：previousCategory 必须转义
  assert.ok(!html.includes("<user[active]"), "previousCategory 不可被插入 raw HTML");
  assert.match(html, /user\[active\]/, "previousCategory 应原样显示在转义后文本中");
});

test("drift section: 状态 no-baseline 时不渲染分类卡", () => {
  const html = renderHtmlReport(makeReport([]), {
    drift: {
      status: "no-baseline",
      activeEventCount: 0,
      resolvedEventCount: 0,
      events: [],
    },
  });
  assert.match(html, /尚未保存可信状态/);
  assert.doesNotMatch(html, /data-drift-class/);
});
