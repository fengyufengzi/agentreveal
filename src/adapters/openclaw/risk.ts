/**
 * OpenClaw 风险规则。
 * 输出 RiskFinding[]，evidence 仅含字段名/路径/计数/模式，不含任何明文密钥。
 */
import type { RiskFinding } from "../types.js";
import type { OcData } from "./parse.js";

export function buildOpenClawFindings(data: OcData): RiskFinding[] {
  const findings: RiskFinding[] = [];

  // —— 1. 渠道明文 secret ——
  for (const ch of data.channels) {
    if (ch.hasAppSecret) {
      findings.push({
        id: "OPENCLAW_CHANNEL_PLAINTEXT_SECRET",
        category: "secret",
        severity: "high",
        title: `渠道 "${ch.channel}" 含有明文 appSecret`,
        description:
          "appSecret 直接写在 openclaw.json 的 channels 配置中，配置泄露或仓库推送意外提交即凭据泄露。",
        evidence: { channel: ch.channel, field: "appSecret" },
        recommendation:
          "改为通过环境变量注入（如 channels.feishu.appSecret = \"${FEISHU_APP_SECRET}\"），或迁移到独立密钥管理。",
        fixable: false,
      });
    }
    if (ch.hasToken) {
      findings.push({
        id: "OPENCLAW_CHANNEL_PLAINTEXT_TOKEN",
        category: "secret",
        severity: "high",
        title: `渠道 "${ch.channel}" 含有明文 token`,
        description:
          "渠道 token 直接写在 openclaw.json 中。推荐改用环境变量注入或临时轮换。",
        evidence: { channel: ch.channel, field: "token" },
        recommendation: "轮换后改用 ${ENV_VAR} 引用。",
        fixable: false,
      });
    }
  }

  // —— 2. gateway 明文鉴权 + bind 暴露 ——
  if (data.gateway?.auth?.token) {
    findings.push({
      id: "OPENCLAW_GATEWAY_PLAINTEXT_TOKEN",
      category: "secret",
      severity: "high",
      title: "gateway.auth.token 明文存放",
      description:
        "HTTP API 鉴权 token 明文写在 openclaw.json。任何能读到此配置的用户/进程都拥有完整 API 权限。",
      evidence: { field: "gateway.auth.token" },
      recommendation: "改为 ${ENV_VAR} 引用，并定期轮换。",
      fixable: false,
    });
  }
  if (data.gateway?.bind && !isLoopbackBind(data.gateway.bind)) {
    findings.push({
      id: "OPENCLAW_GATEWAY_EXPOSED_BIND",
      category: "permission",
      severity: "high",
      title: `gateway.bind 绑定到非 loopback 地址：${data.gateway.bind}`,
      description:
        "网关监听非本地回环地址（如 0.0.0.0 或 LAN IP），意味着同网段或公网可访问。即使有鉴权，暴露面仍偏大。",
      evidence: { bind: data.gateway.bind, port: data.gateway.port },
      recommendation: "若无明确需要，请改回 loopback（127.0.0.1）；需要远程访问请走 Tailscale/VPN。",
      fixable: false,
    });
  }
  if (data.gateway?.tailscale && typeof data.gateway.tailscale === "object") {
    const mode = (data.gateway.tailscale.mode ?? "").toLowerCase();
    // 仅在 mode 显式开启对外暴露时才报。mode=off / tailnet / undefined 视为安全。
    if (mode === "funnel" || mode === "public" || mode === "expose") {
      const isHigh = mode === "funnel" || mode === "public";
      findings.push({
        id: "OPENCLAW_TAILSCALE_EXPOSURE",
        category: "permission",
        severity: isHigh ? "high" : "medium",
        title: `gateway 通过 Tailscale 暴露到公网（mode=${mode}）`,
        description:
          "Tailscale Funnel / public 会把网关发布到公网，请确认是否需要该暴露。",
        evidence: { mode },
        recommendation: "如非必须请关闭 Tailscale Funnel；仅使用 Tailnet 内访问。",
        fixable: false,
      });
    }
  }

  // —— 3. 多 agent workspace 冲突 ——
  const wsMap = new Map<string, string[]>();
  for (const a of data.agents) {
    if (!a.workspace) continue;
    const list = wsMap.get(a.workspace) ?? [];
    list.push(a.id);
    wsMap.set(a.workspace, list);
  }
  for (const [ws, ids] of wsMap) {
    if (ids.length > 1) {
      findings.push({
        id: "OPENCLAW_AGENT_WORKSPACE_OVERLAP",
        category: "permission",
        severity: "medium",
        title: "多个 agent 共享同一 workspace",
        description:
          "不同 agent 使用同一 workspace 路径，可能导致上下文/MEMORY/工具权限互相覆盖或泄露。",
        evidence: { workspace: ws, agents: ids },
        recommendation: "为每个 agent 分配独立 workspace，或确认确有共享需求。",
        fixable: false,
      });
    }
  }

  // —— 4. 未知 / 加载来源不明的插件 ——
  // 我们无法精确枚举所有"内置"插件；本规则只提示含 source 且 source 非 npm/官方域名的项。
  const SUSPICIOUS_SOURCE_PATTERNS = [/^file:/, /^http:\/\//, /\.local\//i];
  const KNOWN_SOURCES = [
    /^@openclaw\//,
    /^openclaw-/,
    /^@clawhub\//,
    /^node_modules\//,
  ];
  for (const p of data.plugins) {
    if (!p.source) continue;
    const suspicious =
      SUSPICIOUS_SOURCE_PATTERNS.some((re) => re.test(p.source!)) &&
      !KNOWN_SOURCES.some((re) => re.test(p.source!));
    if (suspicious) {
      findings.push({
        id: "OPENCLAW_UNKNOWN_PLUGIN_SOURCE",
        category: "permission",
        severity: "medium",
        title: `插件 "${p.name}" 来源非官方/非 npm`,
        description:
          "插件 source 指向 file:// 或 http:// 本地/远端路径，未走 npm 包签名验证，存在供应链风险。",
        evidence: { plugin: p.name, source: p.source },
        recommendation: "改用 npm 安装的官方插件，或为该路径配置签名校验。",
        fixable: false,
      });
    }
  }

  // —— 5. service-env 文件存在 ——
  if (data.serviceEnvPresent) {
    findings.push({
      id: "OPENCLAW_SERVICE_ENV_PRESENT",
      category: "secret",
      severity: "info",
      title: "检测到 service-env 目录下的 gateway env 文件",
      description:
        "AgentReveal 仅记录文件存在，不读取其中内容。该文件通常包含 API 密钥，请确认文件权限为 600 且目录归属当前用户。",
      evidence: { path: "service-env/*.env" },
      recommendation: "运行 chmod 600 ~/.openclaw/service-env/*.env。",
      fixable: false,
    });
  }

  return findings;
}

export function isLoopbackBind(bind: string): boolean {
  const b = bind.trim().toLowerCase();
  return b === "127.0.0.1" || b === "::1" || b === "localhost" || b === "loopback";
}