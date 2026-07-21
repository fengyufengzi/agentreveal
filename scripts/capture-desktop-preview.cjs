const { app, BrowserWindow, nativeTheme } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');

const outputDir = resolve(process.argv[2] || join(tmpdir(), 'agentguard-desktop-preview'));

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');

function task({ id, priority, severity, title, rationale, nextStep, agent, agentId, ruleId }) {
  return {
    taskId: id,
    priority,
    severity,
    disposition: 'fix',
    displayName: agent,
    agent: agentId,
    requirements: [{ ruleId, acceptWhen: '仅在已确认业务用途、资源归属和有效期后接受。' }],
    primary: {
      finding: {
        title,
        remediation: [nextStep, '完成后重新扫描，确认任务已消失或满足接受条件。'],
      },
      action: {
        rationale,
        nextSteps: [nextStep],
        verification: ['完成处置后重新运行 agentguard scan，确认该任务已消失或符合接受条件。'],
      },
    },
  };
}

const previewTasks = [
  task({
    id: 'task-demo-secret',
    priority: 'P0',
    severity: 'high',
    title: 'settings.json 中存在明文 API Key',
    rationale: '配置文件中的长期凭证可能被备份、同步或误提交。',
    nextStep: '先把新凭证存入 Keychain，再删除明文字段并改用可信 apiKeyHelper。',
    agent: 'Claude Code',
    agentId: 'claude-code',
    ruleId: 'CLAUDE_PLAINTEXT_TOKEN',
  }),
  task({
    id: 'task-demo-upstream',
    priority: 'P1',
    severity: 'high',
    title: '确认自建中转站的真实上游与所有者',
    rationale: '当前 Agent 通过本地代理连接到一个尚未登记信任的上游。',
    nextStep: '核对端点所有者、传输协议与日志策略，再决定信任或替换。',
    agent: 'CC Switch',
    agentId: 'cc-switch',
    ruleId: 'CCSWITCH_UNKNOWN_ENDPOINT',
  }),
  task({
    id: 'task-demo-mcp',
    priority: 'P2',
    severity: 'medium',
    title: '项目 MCP 可以启动本地命令',
    rationale: '启用的 stdio MCP 会继承当前用户权限，应确认命令来源和最小权限。',
    nextStep: '确认 MCP 包来源并限制其可访问的目录与环境变量。',
    agent: 'OpenCode',
    agentId: 'opencode',
    ruleId: 'OPENCODE_MCP_LOCAL',
  }),
];

const previewOverview = {
  project: { path: '/Users/example/Project' },
  scope: { kind: 'project', path: '/Users/example/Project', name: 'Project', projectPoliciesAvailable: true },
  summary: {
    configuredAgents: 6,
    taskCount: 7,
    immediateTaskCount: 2,
    acceptedTaskCount: 1,
    ignoredFindingCount: 1,
    findingCount: 12,
  },
  topTasks: previewTasks,
  tasks: previewTasks,
  acceptedTasks: [],
  ignoredFindings: [],
  trustCandidates: {
    'task-demo-upstream': { endpoint: 'relay.demo-example.net' },
  },
  ignoreCandidates: {
    'task-demo-mcp': [{ ruleId: 'OPENCODE_MCP_LOCAL', agent: 'opencode' }],
  },
  ruleIgnores: { entries: [], auditEventCount: 0 },
  providerTrust: { entries: [], auditEventCount: 0 },
  map: {
    proxyChains: [{ via: 'CC Switch', proxy: '127.0.0.1:15721', upstream: 'relay.demo-example.net' }],
    rows: [
      { agent: 'claude-code', displayName: 'Claude Code', endpoints: ['127.0.0.1:15721'], mcpCount: 0, secretCount: 1 },
      { agent: 'cc-switch', displayName: 'CC Switch', endpoints: ['relay.demo-example.net'], mcpCount: 0, secretCount: 0 },
      { agent: 'opencode', displayName: 'OpenCode', endpoints: ['api.openai.com'], mcpCount: 1, secretCount: 0 },
      { agent: 'codex', displayName: 'Codex', endpoints: ['api.openai.com'], mcpCount: 0, secretCount: 0 },
      { agent: 'gemini', displayName: 'Gemini CLI', endpoints: [], mcpCount: 0, secretCount: 0 },
      { agent: 'openclaw', displayName: 'OpenClaw', endpoints: [], mcpCount: 0, secretCount: 0 },
    ],
  },
  report: { results: [
    { agent: 'claude-code', displayName: 'Claude Code', discovery: { configFound: true, configPath: '/Users/example/.claude/settings.json' }, findings: [
      { category: 'provider', title: 'ANTHROPIC_BASE_URL 指向本地端点', evidence: { baseUrl: '127.0.0.1:15721' } },
      { category: 'permission', title: 'defaultMode = bypassPermissions', evidence: { defaultMode: 'bypassPermissions' } },
      { category: 'secret', title: 'settings.json 中存在明文 API Key' },
    ] },
    { agent: 'codex', displayName: 'Codex', discovery: { configFound: true, configPath: '/Users/example/.codex/config.toml' }, findings: [
      { category: 'provider', title: '自定义模型端点', evidence: { provider: 'openai-compatible', baseUrl: 'api.openai.com' } },
    ] },
    { agent: 'cc-switch', displayName: 'CC Switch', discovery: { configFound: true, configPath: '/Users/example/Library/Application Support/CC Switch/cc-switch.db' }, findings: [
      { category: 'provider', title: 'Claude 经 CC Switch 内置代理转发', evidence: { appType: 'claude', proxy: '127.0.0.1:15721', realUpstream: 'relay.demo-example.net' } },
    ] },
    { agent: 'opencode', displayName: 'OpenCode', discovery: { configFound: true, configPath: '/Users/example/.config/opencode/opencode.json' }, findings: [
      { category: 'mcp', title: '本地 MCP：filesystem', evidence: { server: 'filesystem' } },
    ] },
    { agent: 'gemini', displayName: 'Gemini CLI', discovery: { configFound: true, configPath: '/Users/example/.gemini/settings.json' }, findings: [] },
    { agent: 'openclaw', displayName: 'OpenClaw', discovery: { configFound: true, configPath: '/Users/example/.openclaw/openclaw.json' }, findings: [] },
  ] },
  firstRun: {
    remediationGuides: {
      'task-demo-secret': {
        mode: 'guided',
        commands: [
          { id: 'macos-keychain', kind: 'store', label: '将新凭证写入 macOS Keychain（命令会安全提示输入）', command: "security add-generic-password -U -a \"$USER\" -s 'AgentGuard/CLAUDE_PLAINTEXT_TOKEN_task-demo-secret' -w" },
          { id: 'macos-claude-keychain-helper', kind: 'configure', label: '删除 Claude Code 配置中的明文，并改用 Keychain helper', command: '使用 plutil 设置 apiKeyHelper，并删除 env.ANTHROPIC_AUTH_TOKEN / env.ANTHROPIC_API_KEY' },
          { id: 'macos-keychain-check', kind: 'inspect', label: '确认 Keychain 项可读取，但不打印凭证', command: "security find-generic-password -a \"$USER\" -s 'AgentGuard/CLAUDE_PLAINTEXT_TOKEN_task-demo-secret' -w >/dev/null" },
          { id: 'verify-scan', kind: 'verify', label: '重新扫描验证', command: 'agentguard scan' },
        ],
        notes: ['macOS 优先使用 Keychain；配置命令不会打印凭证。完成后请轮换原凭证。'],
      },
    },
  },
};

async function capture(window, name) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  const image = await window.webContents.capturePage();
  const path = join(outputDir, `${name}.png`);
  writeFileSync(path, image.toPNG());
  console.log(path);
}

app.whenReady().then(async () => {
  mkdirSync(outputDir, { recursive: true });
  const window = new BrowserWindow({
    show: false,
    width: 1120,
    height: 780,
    backgroundColor: '#f6f8f7',
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
      sandbox: true,
    },
  });

  await window.loadFile(resolve(__dirname, '..', 'desktop', 'index.html'));
  await capture(window, 'welcome');
  await window.webContents.executeJavaScript(`
    setWorking(true);
    setStatus('正在本机发现 Agent、重建连接链路并整理行动任务…', 'working', '通常只需几秒；期间不会修改任何配置。');
  `);
  await capture(window, 'welcome-working');
  await window.webContents.executeJavaScript(`
    setWorking(false);
    setStatus('准备扫描这台 Mac', 'idle', '所有检查默认只读，并在本机完成。');
  `);
  nativeTheme.themeSource = 'dark';
  await capture(window, 'welcome-dark');
  nativeTheme.themeSource = 'light';
  await window.webContents.executeJavaScript(`
    state.overview = ${JSON.stringify(previewOverview)};
    updateScope(state.overview);
    setStatus('项目扫描完成：12 项发现，7 个行动任务', 'warn');
    renderCurrentView();
    setWorking(false);
    document.getElementById('mainContent').scrollTo(0, 0);
  `);
  await capture(window, 'workspace-top');
  nativeTheme.themeSource = 'dark';
  await capture(window, 'workspace-dark');
  nativeTheme.themeSource = 'light';
  window.setSize(940, 660);
  await capture(window, 'workspace-compact');
  window.setSize(1120, 780);
  await window.webContents.executeJavaScript(`scrollMainTo('activeAgentWorkspace', 82)`);
  await capture(window, 'workspace-agent');
  await window.webContents.executeJavaScript(`
    (() => {
      const details = document.querySelector('#activeAgentWorkspace .task-detail');
      if (details) {
        details.open = true;
        const main = document.getElementById('mainContent');
        const top = main.scrollTop + details.getBoundingClientRect().top - main.getBoundingClientRect().top - 88;
        main.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
      }
    })();
  `);
  await capture(window, 'workspace-agent-detail');
  await window.webContents.executeJavaScript(`
    (() => {
      const details = document.querySelector('#activeAgentWorkspace .task-detail');
      if (details) details.open = false;
    })();
    state.scopeKind = 'project';
    renderCurrentView();
    document.querySelector('.task-policy-menu > summary')?.click();
  `);
  await capture(window, 'workspace-policy-menu');
  await window.webContents.executeJavaScript(`
    document.querySelector('.task-policy-menu[open]')?.removeAttribute('open');
  `);
  await window.webContents.executeJavaScript(`document.querySelector('[data-agent-overview]').click()`);
  await capture(window, 'workspace-agent-return');
  await window.webContents.executeJavaScript(`
    document.querySelector('[data-agent-view="openclaw"]').click();
  `);
  await capture(window, 'workspace-agent-switch');
  await window.webContents.executeJavaScript(`
    document.querySelector('[data-agent-view="cross-agent"]').click();
  `);
  await capture(window, 'workspace-cross-agent');
  await window.webContents.executeJavaScript(`scrollMainTo('remediationSection', 8)`);
  await capture(window, 'workspace-remediation');
  await window.webContents.executeJavaScript(`
    document.getElementById('mainContent').scrollTo(0, 0);
    document.querySelector('.report-menu').open = true;
  `);
  await capture(window, 'workspace-report-menu');
  nativeTheme.themeSource = 'system';
  await window.close();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
