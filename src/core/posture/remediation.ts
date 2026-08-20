import type {
  EffectiveAgentState,
  EffectiveAuthConflict,
} from "./types.js";

export type PosturePlanStatus =
  | "action-required"
  | "review"
  | "informational";

export interface PosturePlanStep {
  id: string;
  title: string;
  detail: string;
  kind: "review" | "backup" | "configure" | "verify";
  terminalCommand?: {
    command: string;
    label: string;
    successEvidence: string;
    readOnly: true;
  };
}

export interface PostureRemediationPlan {
  planId:
    | "claude-auth-conflict"
    | "codex-auth-route-conflict"
    | "cc-switch-route-status"
    | "cc-switch-token-rotation";
  agentId: EffectiveAgentState["agentId"];
  category: "authentication" | "provider-route";
  status: PosturePlanStatus;
  title: string;
  currentExplanation: string;
  targetState: string;
  steps: PosturePlanStep[];
  automation: {
    mode: "guided" | "guided-with-existing-backup";
    available: false;
    reason: string;
  };
  constraints: string[];
}

const AUTH_CONFLICT_LABELS: Record<string, string> = {
  AUTH_CLOUD_PROVIDER_OVERRIDDEN: "云厂商认证",
  AUTH_BEARER_TOKEN_OVERRIDDEN: "Bearer Token",
  AUTH_API_KEY_OVERRIDDEN: "API Key",
  AUTH_API_KEY_HELPER_OVERRIDDEN: "apiKeyHelper / Keychain",
  AUTH_OAUTH_TOKEN_OVERRIDDEN: "OAuth Token",
  AUTH_SUBSCRIPTION_OAUTH_OVERRIDDEN: "订阅 OAuth 登录",
  AUTH_PROVIDER_ENV_KEY_OVERRIDDEN: "Provider 环境变量",
  AUTH_PROVIDER_COMMAND_OVERRIDDEN: "Provider 认证命令",
  AUTH_PROXY_MANAGED_OVERRIDDEN: "代理注入凭证",
  AUTH_FILE_API_KEY_OVERRIDDEN: "auth.json API Key",
  AUTH_CHATGPT_OAUTH_OVERRIDDEN: "ChatGPT OAuth",
};

function authMethodLabel(method: EffectiveAgentState["auth"]["method"]): string {
  const labels: Record<EffectiveAgentState["auth"]["method"], string> = {
    "cloud-provider": "云厂商认证",
    oauth: "OAuth",
    "api-key": "API Key",
    "keychain-helper": "Keychain/helper",
    environment: "环境变量",
    "config-file": "配置文件凭证",
    "proxy-injected": "代理注入凭证",
    none: "无认证",
    unknown: "未确认",
  };
  return labels[method];
}

function conflictLabels(conflicts: readonly EffectiveAuthConflict[]): string[] {
  return [...new Set(
    conflicts.map(
      (entry) => AUTH_CONFLICT_LABELS[entry.code] ?? "另一认证来源"
    )
  )].sort((left, right) => left.localeCompare(right));
}

function sourceLabel(state: EffectiveAgentState): string {
  return state.auth.sourceKind
    ? `${authMethodLabel(state.auth.method)}（${state.auth.sourceKind}）`
    : authMethodLabel(state.auth.method);
}

function claudePlan(
  state: EffectiveAgentState
): PostureRemediationPlan | undefined {
  if (state.agentId !== "claude-code" || state.auth.conflicts.length === 0) {
    return undefined;
  }
  const overridden = conflictLabels(state.auth.conflicts);
  const hasPlaintextFinding = state.findingIds.includes(
    "CLAUDE_PLAINTEXT_TOKEN"
  );
  return {
    planId: "claude-auth-conflict",
    agentId: state.agentId,
    category: "authentication",
    status: "action-required",
    title: "收敛 Claude Code 认证来源",
    currentExplanation:
      `当前按优先级使用 ${sourceLabel(state)}；` +
      `${overridden.join("、")} 仍存在但被覆盖，容易造成换终端或切换 Provider 后行为变化。`,
    targetState:
      "只保留一个已核实的认证来源，并让 Provider、base URL 与该来源保持一致。",
    steps: [
      {
        id: "choose-auth-source",
        title: "确认唯一目标认证来源",
        detail:
          `先决定继续使用 ${sourceLabel(state)}，还是明确切换到一个被覆盖来源；不要同时保留多个长期凭证入口。`,
        kind: "review",
      },
      ...(hasPlaintextFinding
        ? [{
            id: "backup-plaintext-settings",
            title: "先创建受保护的配置备份",
            detail:
              "使用 AgentReveal 已有 Claude 凭证迁移备份边界；备份只覆盖实际含明文字段的设置文件。",
            kind: "backup" as const,
          }]
        : []),
      {
        id: "remove-overridden-auth",
        title: "清理被覆盖的认证来源",
        detail:
          `按当前凭证迁移指引移除不再使用的 ${overridden.join("、")}；不要把密钥复制到命令历史或新配置文件。`,
        kind: "configure",
      },
      {
        id: "verify-claude-auth",
        title: "重新启动并复扫",
        detail:
          "重新启动 Claude Code，完成一次最小请求，再用 AgentReveal 复扫确认认证状态不再冲突且路由符合预期。",
        kind: "verify",
      },
    ],
    automation: {
      mode: hasPlaintextFinding
        ? "guided-with-existing-backup"
        : "guided",
      available: false,
      reason:
        "选择保留 OAuth、API Key、helper 或代理凭证属于用户身份决策；AgentReveal 只复用现有备份和引导边界，不自动删除或轮换凭证。",
    },
    constraints: [
      "不自动轮换、撤销或打印上游凭证。",
      "不把 OAuth、API Key 或 helper 自动迁移为另一种认证。",
      "任何手动修改后都必须重新启动并复扫。",
    ],
  };
}

function codexPlan(
  state: EffectiveAgentState
): PostureRemediationPlan | undefined {
  if (state.agentId !== "codex") return undefined;
  const routeNeedsReview =
    state.route.providerClass !== undefined &&
    state.route.providerClass !== "official" &&
    state.route.providerClass !== "domestic_official";
  if (state.auth.conflicts.length === 0 && !routeNeedsReview) return undefined;
  const overridden = conflictLabels(state.auth.conflicts);
  const route = state.route.providerClass ?? "unknown";
  return {
    planId: "codex-auth-route-conflict",
    agentId: state.agentId,
    category: "authentication",
    status: state.auth.conflicts.length > 0 ? "action-required" : "review",
    title: "对齐 Codex Provider 与认证来源",
    currentExplanation:
      `当前 Provider 分类为 ${route}，认证使用 ${sourceLabel(state)}` +
      (overridden.length > 0
        ? `；${overridden.join("、")} 仍存在但被覆盖。`
        : "；当前未发现多认证来源，但自定义路由仍需核实。"),
    targetState:
      "当前 model_provider、base URL 与唯一认证来源属于同一已核实 Provider，且不依赖被覆盖的 auth.json、环境变量或认证命令。",
    steps: [
      {
        id: "verify-active-provider",
        title: "核对当前 Provider 与 base URL",
        detail:
          "以有效配置中标记为 active 的 model_provider 和 base URL 为准；项目配置不能替代用户级 Provider 定义。",
        kind: "review",
      },
      {
        id: "check-codex-login-status",
        title: "只读检查 Codex 当前登录状态",
        detail:
          "该命令只报告 Codex 是否已登录以及当前认证方式；退出码 0 表示存在有效登录态，但自定义 Provider 的 env_key 或认证命令仍必须与 active model_provider 对齐。",
        kind: "verify",
        terminalCommand: {
          command: "codex login status",
          label: "在新 Terminal 检查 Codex 登录状态",
          successEvidence:
            "命令退出码为 0，显示的认证方式与当前 active Provider 的预期一致；不要据此把 ChatGPT OAuth 误当作自定义 Provider API Key。",
          readOnly: true,
        },
      },
      {
        id: "choose-codex-auth-source",
        title: "选择与 Provider 匹配的唯一认证",
        detail:
          `确认继续使用 ${sourceLabel(state)}，或显式切换后再清理旧来源；OAuth 不应被误认为自定义 Provider 的 API Key。`,
        kind: "review",
      },
      ...(overridden.length > 0
        ? [{
            id: "remove-overridden-codex-auth",
            title: "清理被覆盖的 Codex 认证来源",
            detail:
              `在 Codex 官方登录流程或对应 Provider 配置中清理不再使用的 ${overridden.join("、")}；不要直接让 AgentReveal 改写 auth.json。`,
            kind: "configure" as const,
          }]
        : []),
      {
        id: "verify-codex-route",
        title: "重新启动并复扫",
        detail:
          "完全退出并重新启动 Codex，完成一次最小请求，再用 AgentReveal 复扫确认 Provider、认证来源和真实请求链路一致。",
        kind: "verify",
      },
    ],
    automation: {
      mode: "guided",
      available: false,
      reason:
        "Codex 登录态与 auth.json 由 Codex 管理；AgentReveal 不直接改写或删除认证文件。",
    },
    constraints: [
      "不自动修改 auth.json、OAuth 登录态或 Provider 凭证。",
      "不假设项目级配置能够覆盖用户级 Provider 定义。",
      "不自动轮换或撤销上游凭证。",
    ],
  };
}

function ccSwitchTokenRotationPlan(
  state: EffectiveAgentState
): PostureRemediationPlan | undefined {
  if (state.agentId !== "cc-switch") return undefined;
  const hasPlaintext = state.findingIds.includes("CCSWITCH_PLAINTEXT_KEY");
  const hasShared = state.findingIds.includes("CCSWITCH_SHARED_KEY");
  if (!hasPlaintext && !hasShared) return undefined;
  return {
    planId: "cc-switch-token-rotation",
    agentId: state.agentId,
    category: "authentication",
    status: "action-required",
    title: hasShared
      ? "为 CC Switch Provider 轮换并拆分 Token"
      : "轮换 CC Switch Provider Token",
    currentExplanation:
      (hasPlaintext
        ? "当前 CC Switch Provider 数据库中检测到真实 Token 的存在性。"
        : "") +
      (hasShared
        ? "至少两个 Provider 记录复用了同一凭证指纹，单点泄露会扩大影响范围。"
        : ""),
    targetState:
      "每个项目或 Provider 使用独立、最小权限且可单独撤销的新 Token；旧 Token 在真实请求验证成功后再撤销。",
    steps: [
      {
        id: "inventory-cc-switch-consumers",
        title: "确认受影响 Provider 与消费 Agent",
        detail:
          "在 CC Switch 原应用中核对当前 Provider、使用它的 Claude Code / Codex 等 Agent，以及准备轮换的上游账户；不要把本地代理占位符当作上游 Token。",
        kind: "review",
      },
      {
        id: "create-independent-upstream-token",
        title: "在上游控制台创建独立新 Token",
        detail:
          "为每个项目或 Provider 创建最小权限、可单独撤销的新 Token；不要继续复制同一个 Token 到多个 Provider。",
        kind: "configure",
      },
      {
        id: "replace-token-in-cc-switch",
        title: "只在 CC Switch 原应用中替换",
        detail:
          "把新 Token 填入对应 Provider 的 API Key / Token 字段并保存。AgentReveal 不写 CC Switch SQLite，也不会生成含凭证的命令。",
        kind: "configure",
      },
      {
        id: "verify-consumer-request-before-revoke",
        title: "重启消费 Agent 并验证最小请求",
        detail:
          "完全退出并重启受影响 Agent，确认通过 CC Switch 的一次最小请求成功、Provider 与真实上游符合预期；在这之前保留旧 Token。",
        kind: "verify",
      },
      {
        id: "revoke-old-upstream-token",
        title: "成功后撤销旧 Token",
        detail:
          "回到上游控制台撤销旧 Token，并记录它对应的 Provider；不要仅从 CC Switch 删除记录却让旧 Token 继续有效。",
        kind: "configure",
      },
      {
        id: "rescan-cc-switch-token-status",
        title: "回到 AgentReveal 复扫并正确解释结果",
        detail:
          `${hasShared ? "拆分为独立 Token 后，CCSWITCH_SHARED_KEY 应消失。" : ""}` +
          `${hasPlaintext ? "CCSWITCH_PLAINTEXT_KEY 可能仍存在，因为轮换降低了旧 Token 暴露风险，但 CC Switch SQLite 仍保存真实新 Token；这不是复扫失败。" : ""}`,
        kind: "verify",
      },
    ],
    automation: {
      mode: "guided",
      available: false,
      reason:
        "Token 创建、替换、真实请求验证与撤销跨越上游控制台和 CC Switch 原应用；AgentReveal 保持数据库只读。",
    },
    constraints: [
      "不读取、打印、复制或写入 CC Switch Provider Token。",
      "不自动修改 CC Switch SQLite、备份库或代理开关。",
      "旧 Token 只在新 Token 的真实请求验证成功后撤销。",
      "轮换不能消除 SQLite 明文存储事实；复扫必须如实保留该发现。",
    ],
  };
}

function ccSwitchPlan(
  state: EffectiveAgentState
): PostureRemediationPlan | undefined {
  if (state.agentId !== "cc-switch") return undefined;
  const hasProxy = Boolean(state.route.effectiveEndpoint);
  const hasUpstream = Boolean(state.route.realUpstream);
  const anomalous =
    state.confidence === "incomplete" ||
    (hasProxy && !hasUpstream) ||
    state.route.providerClass === "unknown";
  const currentExplanation = !hasProxy
    ? "当前未观察到 CC Switch 对 Claude Code 或 Codex 的有效代理接管；消费 Agent 应按各自官方或自定义配置直连。"
    : hasUpstream
      ? `当前观察到 CC Switch 代理接管，并能关联到真实上游分类 ${state.route.providerClass ?? "unknown"}。`
      : "当前观察到 CC Switch 代理监听，但无法确认所选 Provider 的真实上游。";
  return {
    planId: "cc-switch-route-status",
    agentId: state.agentId,
    category: "provider-route",
    status: anomalous ? "review" : "informational",
    title: !hasProxy
      ? "CC Switch 当前未接管请求"
      : anomalous
        ? "核对 CC Switch 代理与真实上游"
        : "CC Switch 已接管请求链路",
    currentExplanation,
    targetState:
      "要么明确切回消费 Agent 的官方直连，要么由 CC Switch 保持唯一代理接管并能确认当前 Provider 与真实上游。",
    steps: [
      {
        id: "choose-direct-or-proxy",
        title: "确认目标链路",
        detail:
          "选择官方直连或 CC Switch 代理接管，不要让消费 Agent 的 base URL、代理开关与 CC Switch 当前状态互相矛盾。",
        kind: "review",
      },
      {
        id: "change-in-cc-switch",
        title: "只在 CC Switch 原应用中切换",
        detail:
          "如需切换 Provider、关闭代理或切回官方，请在 CC Switch 原应用中操作；AgentReveal 保持数据库只读。",
        kind: "configure",
      },
      {
        id: "verify-real-upstream",
        title: "复扫确认消费 Agent 与真实上游",
        detail:
          "重新启动受影响 Agent 后复扫，确认本地代理、当前 Provider 与真实上游形成一条可解释链路。",
        kind: "verify",
      },
    ],
    automation: {
      mode: "guided",
      available: false,
      reason:
        "CC Switch 状态位于应用数据库；AgentReveal 不写 SQLite，也不绕过 CC Switch 自己的事务和界面。",
    },
    constraints: [
      "不自动修改 CC Switch SQLite、备份库或代理开关。",
      "不把 PROXY_MANAGED 占位符当作真实 API Token。",
      "不自动轮换当前 Provider 的上游凭证。",
    ],
  };
}

export function buildPostureRemediationPlans(
  state: EffectiveAgentState
): PostureRemediationPlan[] {
  return [
    claudePlan(state),
    codexPlan(state),
    ccSwitchTokenRotationPlan(state),
    ccSwitchPlan(state),
  ].filter((entry): entry is PostureRemediationPlan => Boolean(entry));
}
