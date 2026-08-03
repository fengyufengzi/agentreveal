import type { DiscoveryContext } from "../../adapters/types.js";
import { buildContext } from "../discovery/index.js";
import { inspectEffectiveStates } from "./effective.js";
import { PostureSnapshotStore } from "./snapshot.js";
import type {
  DriftComparison,
  EffectiveAgentState,
  EffectiveConfidence,
} from "./types.js";
import {
  buildPostureRemediationPlans,
  type PostureRemediationPlan,
} from "./remediation.js";

export interface PostureUncertainty {
  code:
    | "SESSION_CLI_UNOBSERVED"
    | "UNREADABLE_CONFIG_SOURCE"
    | "AUTH_SOURCE_UNCONFIRMED"
    | "ROUTE_SOURCE_UNCONFIRMED";
  message: string;
}

export interface PostureAgentReport {
  state: EffectiveAgentState;
  uncertainty: PostureUncertainty[];
  remediationPlans: PostureRemediationPlan[];
}

export interface PostureReport {
  generatedAt: string;
  summary: {
    agentCount: number;
    confirmedCount: number;
    inferredCount: number;
    incompleteCount: number;
    authConflictCount: number;
  };
  agents: PostureAgentReport[];
}

function uncertainties(state: EffectiveAgentState): PostureUncertainty[] {
  const output: PostureUncertainty[] = [];
  if (state.confidence !== "confirmed") {
    output.push({
      code: "SESSION_CLI_UNOBSERVED",
      message:
        "当前扫描没有附着到正在运行的 Agent 进程，无法确认本次会话是否使用了额外命令行覆盖。",
    });
  }
  if (state.configSources.some((source) => source.status === "unreadable")) {
    output.push({
      code: "UNREADABLE_CONFIG_SOURCE",
      message:
        "至少一个配置来源无法读取或解析；结论仅基于其余可用证据。",
    });
  }
  if (state.auth.method === "unknown" || state.auth.status === "unknown") {
    output.push({
      code: "AUTH_SOURCE_UNCONFIRMED",
      message:
        "没有足够的本机证据确认当前认证来源；Keychain、运行时注入或未启动会话可能未被观察。",
    });
  }
  if (
    !state.route.effectiveEndpoint ||
    state.route.proxyKind === "unknown"
  ) {
    output.push({
      code: "ROUTE_SOURCE_UNCONFIRMED",
      message:
        "没有足够证据确认完整请求链路或真实上游。",
    });
  }
  return output;
}

function countConfidence(
  states: readonly EffectiveAgentState[],
  confidence: EffectiveConfidence
): number {
  return states.filter((state) => state.confidence === confidence).length;
}

export function buildPostureReport(
  states: readonly EffectiveAgentState[],
  generatedAt = new Date()
): PostureReport {
  if (!Number.isFinite(generatedAt.getTime())) {
    throw new Error("有效状态报告时间无效。");
  }
  const sorted = [...states].sort((left, right) =>
    left.agentId.localeCompare(right.agentId)
  );
  return {
    generatedAt: generatedAt.toISOString(),
    summary: {
      agentCount: sorted.length,
      confirmedCount: countConfidence(sorted, "confirmed"),
      inferredCount: countConfidence(sorted, "inferred"),
      incompleteCount: countConfidence(sorted, "incomplete"),
      authConflictCount: sorted.filter(
        (state) => state.auth.status === "conflicting"
      ).length,
    },
    agents: sorted.map((state) => ({
      state,
      uncertainty: uncertainties(state),
      remediationPlans: buildPostureRemediationPlans(state),
    })),
  };
}

export async function inspectPosture(
  ctx: DiscoveryContext = buildContext()
): Promise<PostureReport> {
  return buildPostureReport(await inspectEffectiveStates(ctx));
}

export interface PostureWithDrift {
  posture: PostureReport;
  drift: DriftComparison;
}

export async function inspectPostureWithDrift(
  ctx: DiscoveryContext,
  store: PostureSnapshotStore,
  options: {
    recordObservation?: boolean;
    tolerateStoreErrors?: boolean;
  } = {}
): Promise<PostureWithDrift> {
  const posture = await inspectPosture(ctx);
  const states = posture.agents.map((entry) => entry.state);
  try {
    return {
      posture,
      drift: store.compare(states, {
        recordObservation: options.recordObservation,
      }),
    };
  } catch (error) {
    if (!options.tolerateStoreErrors) throw error;
    return {
      posture,
      drift: {
        status: "unavailable",
        currentCapturedAt: new Date().toISOString(),
        events: [],
        activeEventCount: 0,
        resolvedEventCount: 0,
        errorCode: "BASELINE_UNAVAILABLE",
      },
    };
  }
}
