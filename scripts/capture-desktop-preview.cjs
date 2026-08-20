const { app, BrowserWindow, nativeTheme } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');

const outputDir = resolve(process.argv[2] || join(tmpdir(), 'agentreveal-desktop-preview'));

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
        verification: ['完成处置后重新运行 agentreveal scan，确认该任务已消失或符合接受条件。'],
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

const previewDriftEvent = {
  eventId: 'drift-demo-route',
  agentId: 'claude-code',
  kind: 'provider-route-changed',
  change: 'changed',
  priority: 'P1',
  severity: 'high',
  currentSummary: '有效 Provider 路由发生变化',
  previousCategory: 'relay_or_proxy',
  action: ['确认 CC Switch 当前选中的 Provider 与真实上游是否符合预期。'],
  verification: ['复扫后确认路由与已审核的可信状态一致。'],
};

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
  posture: {
    generatedAt: '2026-07-23T00:00:00.000Z',
    summary: {
      agentCount: 3,
      confirmedCount: 1,
      inferredCount: 2,
      incompleteCount: 0,
      authConflictCount: 1,
    },
    agents: [
      {
        state: {
          agentId: 'claude-code',
          displayName: 'Claude Code',
          confidence: 'confirmed',
          configSources: [
            { kind: 'user', scope: 'user', status: 'active', path: '/Users/example/.claude/settings.json', fields: ['ANTHROPIC_BASE_URL', 'apiKeyHelper'] },
            { kind: 'proxy', scope: 'user', status: 'active', path: '/Users/example/Library/Application Support/CC Switch/cc-switch.db', fields: ['provider'] },
          ],
          route: {
            providerClass: 'relay_or_proxy',
            model: 'claude-sonnet',
            proxyKind: 'cc-switch',
            effectiveEndpoint: 'http://127.0.0.1:15721',
            realUpstream: 'https://relay.demo-example.net',
          },
          auth: { method: 'proxy-injected', sourceKind: 'proxy', status: 'active', conflicts: [] },
          permissions: [{ capability: 'command-execute', decision: 'allow', scope: 'global', sourceKind: 'user' }],
          integrations: [],
          findingIds: ['CLAUDE_PLAINTEXT_TOKEN'],
          taskIds: ['task-demo-secret'],
        },
        uncertainty: [],
      },
      {
        state: {
          agentId: 'codex',
          displayName: 'Codex',
          confidence: 'inferred',
          configSources: [{ kind: 'user', scope: 'user', status: 'active', path: '/Users/example/.codex/config.toml', fields: ['model_provider'] }],
          route: { providerClass: 'official', model: 'gpt-5', proxyKind: 'none', effectiveEndpoint: 'https://api.openai.com' },
          auth: { method: 'oauth', sourceKind: 'user', status: 'active', conflicts: [] },
          permissions: [{ capability: 'filesystem-write', decision: 'ask', scope: 'project', sourceKind: 'user' }],
          integrations: [],
          findingIds: [],
          taskIds: [],
        },
        uncertainty: [{ code: 'SESSION_CLI_UNOBSERVED', message: '当前扫描没有附着到正在运行的 Agent 进程，无法确认本次会话是否使用了额外命令行覆盖。' }],
        remediationPlans: [{
          planId: 'codex-auth-route-conflict',
          agentId: 'codex',
          category: 'authentication',
          status: 'review',
          title: '对齐 Codex Provider 与认证来源',
          currentExplanation: '当前 Provider 分类为 relay_or_proxy，认证使用 OAuth；自定义路由仍需核实。',
          targetState: 'Provider、base URL 与唯一认证来源属于同一已核实 Provider。',
          steps: [{
            id: 'check-codex-login-status',
            title: '只读检查 Codex 当前登录状态',
            detail: '退出码 0 只表示存在登录态，仍需核对 active Provider。',
            kind: 'verify',
            terminalCommand: {
              command: 'codex login status',
              label: '在新 Terminal 检查 Codex 登录状态',
              successEvidence: '显示的认证方式与当前 active Provider 的预期一致。',
              readOnly: true,
            },
          }],
          automation: { mode: 'guided', available: false, reason: 'AgentReveal 不改写 auth.json。' },
          constraints: ['auth.json 保持只读。'],
        }],
      },
      {
        state: {
          agentId: 'cc-switch',
          displayName: 'CC Switch',
          confidence: 'inferred',
          configSources: [{ kind: 'proxy', scope: 'user', status: 'active', path: '/Users/example/Library/Application Support/CC Switch/cc-switch.db', fields: ['providers', 'proxy'] }],
          route: { providerClass: 'relay_or_proxy', proxyKind: 'cc-switch', effectiveEndpoint: 'http://127.0.0.1:15721', realUpstream: 'https://relay.demo-example.net' },
          auth: { method: 'proxy-injected', sourceKind: 'proxy', status: 'conflicting', conflicts: [{ code: 'MULTIPLE_PROVIDER_CREDENTIALS', sourceKinds: ['proxy'] }] },
          permissions: [],
          integrations: [],
          findingIds: ['CCSWITCH_UNKNOWN_ENDPOINT', 'CCSWITCH_PLAINTEXT_KEY', 'CCSWITCH_SHARED_KEY'],
          taskIds: ['task-demo-upstream'],
        },
        uncertainty: [{ code: 'SESSION_CLI_UNOBSERVED', message: '无法观察当前会话的临时命令行覆盖。' }],
        remediationPlans: [{
          planId: 'cc-switch-token-rotation',
          agentId: 'cc-switch',
          category: 'authentication',
          status: 'action-required',
          title: '为 CC Switch Provider 轮换并拆分 Token',
          currentExplanation: 'Provider 数据库中存在真实 Token，且多个 Provider 复用了同一凭证指纹。',
          targetState: '每个项目或 Provider 使用独立、最小权限且可单独撤销的新 Token。',
          steps: [
            { id: 'create', title: '创建独立新 Token', detail: '在上游控制台创建最小权限的新 Token。', kind: 'configure' },
            { id: 'replace', title: '只在 CC Switch 原应用中替换', detail: 'AgentReveal 保持 SQLite 只读。', kind: 'configure' },
            { id: 'rescan', title: '复扫并正确解释结果', detail: '共享规则应消失；SQLite 仍存真实新 Token 时明文规则可能继续存在，这不是复扫失败。', kind: 'verify' },
          ],
          automation: { mode: 'guided', available: false, reason: 'AgentReveal 不写 CC Switch SQLite。' },
          constraints: ['不读取或写入 Provider Token。'],
        }],
      },
    ],
  },
  drift: {
    status: 'changed',
    baselineCapturedAt: '2026-07-22T00:00:00.000Z',
    currentCapturedAt: '2026-07-23T00:00:00.000Z',
    events: [previewDriftEvent],
    activeEventCount: 1,
    resolvedEventCount: 0,
  },
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
    topDriftEvents: [previewDriftEvent],
    remediationGuides: {
      'task-demo-secret': {
        mode: 'guided',
        commands: [
          { id: 'macos-keychain', kind: 'store', label: '将新凭证写入 macOS Keychain（命令会安全提示输入）', command: "security add-generic-password -U -a \"$USER\" -s 'AgentReveal/CLAUDE_PLAINTEXT_TOKEN_task-demo-secret' -w" },
          { id: 'macos-claude-keychain-helper', kind: 'configure', label: '删除 Claude Code 配置中的明文，并改用 Keychain helper', command: '使用 plutil 设置 apiKeyHelper，并删除 env.ANTHROPIC_AUTH_TOKEN / env.ANTHROPIC_API_KEY' },
          { id: 'macos-keychain-check', kind: 'inspect', label: '确认 Keychain 项可读取，但不打印凭证', command: "security find-generic-password -a \"$USER\" -s 'AgentReveal/CLAUDE_PLAINTEXT_TOKEN_task-demo-secret' -w >/dev/null" },
          { id: 'verify-scan', kind: 'verify', label: '重新扫描验证', command: 'agentreveal scan' },
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
  nativeTheme.themeSource = 'dark';
  await capture(window, 'welcome-dark');
  nativeTheme.themeSource = 'light';
  await window.webContents.executeJavaScript(`
    setWorking(true);
    setStatus('等待你在 Finder 中选择项目文件夹…', 'working', '取消选择不会改变当前检查结果。');
  `);
  await capture(window, 'welcome-working');
  await window.webContents.executeJavaScript(`
    state.projectPath = '/Users/example/Project';
    state.scopeKind = 'project';
    state.initialScanState = 'scanning';
    renderCurrentView();
    setStatus('正在扫描所选项目、检查常见 Agent 配置并整理行动任务…', 'working', '项目检查仍默认只读；配置和结果不会上传。');
  `);
  await capture(window, 'project-scanning');
  nativeTheme.themeSource = 'dark';
  await capture(window, 'project-scanning-dark');
  nativeTheme.themeSource = 'light';
  window.setSize(760, 660);
  await capture(window, 'project-scanning-compact');
  window.setSize(1120, 780);
  await window.webContents.executeJavaScript(`
    setWorking(false);
    state.initialScanState = 'error';
    state.initialScanError = '扫描服务暂时无法读取所选范围，结果尚未生成。';
    setStatus(state.initialScanError, 'error', '可以重试、更换项目或导出脱敏诊断。');
    renderCurrentView();
  `);
  await capture(window, 'project-scan-error');
  nativeTheme.themeSource = 'dark';
  await capture(window, 'project-scan-error-dark');
  nativeTheme.themeSource = 'light';
  window.setSize(760, 660);
  await capture(window, 'project-scan-error-compact');
  window.setSize(1120, 780);
  await window.webContents.executeJavaScript(`
    state.overview = ${JSON.stringify(previewOverview)};
    state.initialScanState = 'idle';
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
    state.selectedAgent = 'claude-code';
    state.credentialBackups = [{
      scopePath: '/Users/example/Project',
      taskId: 'task-demo-secret',
      backupId: 'preview-backup',
      files: 1,
      fingerprint: '${'a'.repeat(64)}',
      phase: 'awaiting-keychain',
    }];
    renderOverview(state.overview);
    (() => {
      const details = document.querySelector('[data-task-card="task-demo-secret"] .task-detail');
      if (details) details.open = true;
      const safety = document.querySelector('[data-credential-backup="preview-backup"]');
      if (!safety) return;
      const main = document.getElementById('mainContent');
      const top = main.scrollTop + safety.getBoundingClientRect().top - main.getBoundingClientRect().top - 112;
      main.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
    })();
  `);
  await capture(window, 'workspace-credential-migration');
  nativeTheme.themeSource = 'dark';
  await capture(window, 'workspace-credential-migration-dark');
  nativeTheme.themeSource = 'light';
  window.setSize(760, 660);
  await window.webContents.executeJavaScript(`
    (() => {
      const safety = document.querySelector('[data-credential-backup="preview-backup"]');
      if (!safety) return;
      const main = document.getElementById('mainContent');
      const top = main.scrollTop + safety.getBoundingClientRect().top - main.getBoundingClientRect().top - 90;
      main.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
    })();
  `);
  await capture(window, 'workspace-credential-migration-compact');
  window.setSize(1120, 780);
  await window.webContents.executeJavaScript(`
    state.credentialBackups[0].phase = 'verified';
    state.credentialBackups[0].transaction = {
      operation: 'claude-credential',
      phase: 'verified',
      files: 1,
      backupId: 'preview-backup',
      restoreAvailable: true,
      message: 'Claude 明文字段已删除，apiKeyHelper 已配置，复扫验证通过。',
    };
    state.credentialBackups[0].verification = {
      command: 'claude auth status --text',
      label: '在新 Terminal 检查 Claude Code 当前认证状态',
      successEvidence: [
        '命令成功并显示预期认证状态；如果没有明确列出 helper 来源，仍以真实请求为准。',
        '完全退出并重新启动 Claude Code，完成一次最小请求。',
        '确认实际请求成功且 Provider / base URL 与当前有效状态一致。',
      ],
    };
    renderOverview(state.overview);
    document.getElementById('mainContent').scrollTo(0, document.getElementById('mainContent').scrollHeight);
  `);
  await capture(window, 'workspace-credential-post-auth');
  nativeTheme.themeSource = 'dark';
  await capture(window, 'workspace-credential-post-auth-dark');
  nativeTheme.themeSource = 'light';
  window.setSize(760, 660);
  await window.webContents.executeJavaScript(`
    document.querySelector('.credential-restore-panel')?.scrollIntoView({ block: 'center' });
  `);
  await capture(window, 'workspace-credential-post-auth-compact');
  window.setSize(1120, 780);
  await window.webContents.executeJavaScript(`
    state.credentialBackups = [];
    document.querySelector('[data-agent-view="codex"]').click();
    document.querySelector('.posture-plan')?.setAttribute('open', '');
    document.querySelector('.posture-guidance')?.scrollIntoView({ block: 'center' });
  `);
  await capture(window, 'workspace-codex-auth-guide');
  await window.webContents.executeJavaScript(`
    document.querySelector('[data-agent-view="cc-switch"]').click();
    document.querySelector('.posture-plan')?.setAttribute('open', '');
    document.querySelector('.posture-guidance')?.scrollIntoView({ block: 'center' });
  `);
  await capture(window, 'workspace-cc-switch-token-guide');
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
