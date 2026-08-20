const { app, BrowserWindow } = require("electron");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");

const outputDir = resolve(
  process.argv[2] || join(tmpdir(), "agentreveal-dsh-demo")
);

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");

const scenes = [
  {
    name: "install",
    step: "01 · 安装",
    title: "把 AgentReveal 加入 DSH Web",
    body: "固定 Developer Preview 版本，插件与 CLI 由同一个 npm 包交付。",
    terminal: [
      "$ npm install -g @deepseek-ai/dsh@0.1.0-rc.7 pnpm@11.7.0",
      "$ dsh plugin --profile web add agentreveal@pilot",
      "✓ agentreveal bundle activated in profile web",
    ],
  },
  {
    name: "start",
    step: "02 · 启动",
    title: "打开 DSH Web",
    body: "AgentReveal 只挂载 server-side 命令，不加入模型工具或 MCP。",
    terminal: ["$ dsh web", "dsh web: http://127.0.0.1:3000", "✓ Web profile ready"],
  },
  {
    name: "command",
    step: "03 · 显式触发",
    title: "输入 /agentreveal",
    body: "Slash command 由 DSH UI 直接执行，不会成为发给模型的 prompt。",
    prompt: "/agentreveal",
  },
  {
    name: "scan",
    step: "04 · 本机检查",
    title: "调用同包只读 CLI",
    body: "固定 Node、CLI 与 argv；无 shell、无后台扫描、无配置写入。",
    flow: ["DSH command registry", "integration scan", "strict allowlist"],
  },
  {
    name: "result",
    step: "05 · Top 3",
    title: "只展示需要行动的安全摘要",
    body: "发现 3 个需要处理或确认的本地安全任务。",
    risks: [
      "[P1/high] OpenCode · 凭据 · OPENCODE_PLAINTEXT_KEY",
      "[P1/high] Claude Code · 权限 · CLAUDE_BYPASS_PERMISSIONS",
      "[P2/medium] 跨 Agent · 集中或复用 · XAGENT_SHARED_PROXY",
    ],
  },
  {
    name: "privacy",
    step: "06 · 隐私边界",
    title: "路径、端点和证据不会进入 DSH",
    body: "输出只允许固定枚举、计数、规则 ID 与固定文案。任何额外字段都会安全失败。",
    checks: ["本机运行", "不上传扫描内容", "不含路径 / 端点 / taskId", "不含凭据 / 命令"],
  },
  {
    name: "details",
    step: "07 · 完整处置",
    title: "回到 AgentReveal 查看技术证据",
    body: "DSH 用于发现与摘要；详细证据、备份、确认、复扫和恢复仍由 CLI / macOS Desktop 完成。",
    cta: "AgentReveal CLI / macOS Desktop  →",
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function content(scene) {
  if (scene.terminal) {
    return `<div class="terminal">${scene.terminal
      .map((line) => `<div>${escapeHtml(line)}</div>`)
      .join("")}</div>`;
  }
  if (scene.prompt) {
    return `<div class="chat"><div class="history">How can I help with your project?</div><div class="composer"><span>${escapeHtml(
      scene.prompt
    )}</span><b>↵</b></div></div>`;
  }
  if (scene.flow) {
    return `<div class="flow">${scene.flow
      .map((item, index) => `${index ? '<span class="arrow">→</span>' : ""}<div>${escapeHtml(item)}</div>`)
      .join("")}</div>`;
  }
  if (scene.risks) {
    return `<div class="risks">${scene.risks
      .map((risk, index) => `<div><b>${index + 1}</b><span>${escapeHtml(risk)}</span></div>`)
      .join("")}</div>`;
  }
  if (scene.checks) {
    return `<div class="checks">${scene.checks
      .map((item) => `<div><b>✓</b>${escapeHtml(item)}</div>`)
      .join("")}</div>`;
  }
  return `<div class="cta">${escapeHtml(scene.cta)}</div>`;
}

function html(scene) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#eef3f0;color:#16362d;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
    .window{width:100vw;height:100vh;padding:22px;background:linear-gradient(145deg,#f8faf8,#e9f1ed)}
    .chrome{height:46px;border:1px solid #cbd9d2;border-bottom:0;border-radius:16px 16px 0 0;background:#fff;display:flex;align-items:center;padding:0 18px;gap:8px}
    .dot{width:11px;height:11px;border-radius:50%;background:#ff5f57}.dot:nth-child(2){background:#febc2e}.dot:nth-child(3){background:#28c840}
    .brand{margin-left:14px;font-weight:750;letter-spacing:.2px}.tag{margin-left:auto;border:1px solid #bad1c7;border-radius:999px;padding:5px 10px;color:#34715e;font-size:12px}
    main{height:calc(100% - 46px);border:1px solid #cbd9d2;border-radius:0 0 16px 16px;background:#fff;padding:42px 54px;overflow:hidden}
    .step{color:#18835f;font-size:13px;font-weight:750;letter-spacing:1.6px;text-transform:uppercase}h1{font-size:35px;line-height:1.15;margin:13px 0 12px;letter-spacing:-.8px}p{color:#587068;font-size:17px;line-height:1.6;margin:0;max-width:820px}
    .terminal{margin-top:30px;background:#10251f;color:#d9eee6;border-radius:14px;padding:22px 25px;font:15px/1.8 ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 14px 35px #133a2e20}.terminal div:last-child{color:#64d5a7}
    .chat{margin-top:28px;border:1px solid #d5e1dc;border-radius:15px;padding:24px;background:#f8faf9}.history{height:105px;color:#8a9c95;text-align:center;padding-top:35px}.composer{background:#fff;border:2px solid #50a985;border-radius:13px;padding:17px 18px;font:18px ui-monospace,SFMono-Regular,Menlo,monospace;display:flex}.composer b{margin-left:auto;color:#18835f}
    .flow{display:flex;align-items:center;justify-content:center;margin-top:45px}.flow div{border:1px solid #b9d2c7;border-radius:12px;padding:20px 22px;background:#f7fbf9;font-weight:700}.arrow{font-size:26px;color:#5a9c83;margin:0 15px}
    .risks{margin-top:26px;display:grid;gap:11px}.risks div{border:1px solid #d5dfdb;border-left:4px solid #e5922b;border-radius:10px;padding:15px 18px;display:flex;align-items:center;background:#fffaf4}.risks b{background:#f9e3c5;border-radius:50%;width:27px;height:27px;display:grid;place-items:center;margin-right:13px}.risks span{font:14px ui-monospace,SFMono-Regular,Menlo,monospace}
    .checks{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:13px}.checks div{border:1px solid #c9ddd4;border-radius:12px;background:#f5faf7;padding:18px;font-weight:650}.checks b{color:#18835f;margin-right:9px}
    .cta{margin-top:42px;border-radius:14px;padding:25px 28px;background:#123c31;color:#fff;font-size:22px;font-weight:750;text-align:center;box-shadow:0 14px 35px #123c3130}
  </style></head><body><div class="window"><div class="chrome"><i class="dot"></i><i class="dot"></i><i class="dot"></i><span class="brand">DeepSeek Harness × AgentReveal</span><span class="tag">LOCAL · READ ONLY</span></div><main><div class="step">${escapeHtml(
    scene.step
  )}</div><h1>${escapeHtml(scene.title)}</h1><p>${escapeHtml(scene.body)}</p>${content(
    scene
  )}</main></div></body></html>`;
}

async function capture(window, scene) {
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html(scene))}`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  const image = await window.webContents.capturePage();
  writeFileSync(join(outputDir, `${scene.name}.png`), image.toPNG());
}

app.whenReady().then(async () => {
  mkdirSync(outputDir, { recursive: true });
  const window = new BrowserWindow({
    show: false,
    width: 1000,
    height: 650,
    backgroundColor: "#eef3f0",
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
      sandbox: true,
    },
  });
  for (const scene of scenes) await capture(window, scene);
  window.destroy();
  app.quit();
});
