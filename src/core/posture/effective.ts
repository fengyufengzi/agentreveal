import { adapters } from "../../adapters/index.js";
import type { DiscoveryContext } from "../../adapters/types.js";
import type { Adapter, AgentDiscovery } from "../../adapters/types.js";
import { buildContext } from "../discovery/index.js";
import { loadAgentGuardConfig } from "../config/index.js";
import type {
  EffectiveAgentState,
  EffectivePostureInspection,
  ManagedProxyRouteObservation,
} from "./types.js";

function normalizedEndpoint(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const port =
      url.port ||
      (url.protocol === "http:" ? "80" : url.protocol === "https:" ? "443" : "");
    return `${url.protocol}//${url.hostname.toLowerCase()}:${port}`;
  } catch {
    return undefined;
  }
}

function applyManagedRoutes(
  states: EffectiveAgentState[],
  routes: readonly ManagedProxyRouteObservation[]
): EffectiveAgentState[] {
  return states.map((state) => {
    const route = routes.find(
      (candidate) =>
        candidate.consumerAgentId === state.agentId &&
        normalizedEndpoint(candidate.localEndpoint) ===
          normalizedEndpoint(state.route.effectiveEndpoint)
    );
    if (!route || state.auth.method !== "proxy-injected") return state;
    return {
      ...state,
      confidence: state.confidence === "incomplete" ? "incomplete" : "confirmed",
      route: {
        ...state.route,
        proxyKind: route.proxyKind,
        ...(route.providerClass ? { providerClass: route.providerClass } : {}),
        ...(route.realUpstream ? { realUpstream: route.realUpstream } : {}),
      },
    };
  });
}

function incompleteInspection(
  adapter: Adapter,
  discovery: AgentDiscovery
): EffectivePostureInspection {
  return {
    state: {
      agentId: adapter.agent as EffectiveAgentState["agentId"],
      displayName: adapter.displayName,
      confidence: "incomplete",
      configSources: [
        {
          kind: adapter.agent === "cc-switch" ? "proxy" : "user",
          scope: "user",
          status: "unreadable",
          ...(discovery.configPath ? { path: discovery.configPath } : {}),
          fields: ["inspection"],
        },
      ],
      route: { proxyKind: "unknown" },
      auth: { method: "unknown", status: "unknown", conflicts: [] },
      permissions: [],
      integrations: [],
      findingIds: [],
      taskIds: [],
    },
  };
}

/**
 * CLI 与 Desktop 后续共用的唯一有效状态入口。
 * E1 只提供 typed core；E2 才把结果加入用户可见输出。
 */
export async function inspectEffectiveStates(
  ctx: DiscoveryContext = buildContext()
): Promise<EffectiveAgentState[]> {
  const config = loadAgentGuardConfig(ctx.cwd);
  const inspectionContext: DiscoveryContext = {
    ...ctx,
    providerPolicy: {
      trustedEndpoints: [
        ...(config.providerPolicy.trustedEndpoints ?? []),
        ...(ctx.providerPolicy?.trustedEndpoints ?? []),
      ],
      internalEndpoints: [
        ...(config.providerPolicy.internalEndpoints ?? []),
        ...(ctx.providerPolicy?.internalEndpoints ?? []),
      ],
    },
  };
  const inspections: EffectivePostureInspection[] = [];
  for (const adapter of adapters) {
    if (!adapter.inspectPosture) continue;
    let discovery;
    try {
      discovery = await adapter.discover(inspectionContext);
    } catch {
      continue;
    }
    if (!discovery.configFound) continue;
    try {
      inspections.push(
        await adapter.inspectPosture(inspectionContext, discovery)
      );
    } catch {
      inspections.push(incompleteInspection(adapter, discovery));
    }
  }

  const routes = inspections.flatMap(
    (inspection) => inspection.managedProxyRoutes ?? []
  );
  return applyManagedRoutes(
    inspections.map((inspection) => inspection.state),
    routes
  ).sort((left, right) => left.agentId.localeCompare(right.agentId));
}
