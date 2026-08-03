import type { RiskFinding } from "../types.js";
import { classifyBaseUrl, type ProviderTrustPolicy } from "../../rules/provider.js";
import { findingRuleIds } from "../../core/posture/builders.js";
import type {
  EffectiveAgentState,
  EffectivePostureInspection,
  ManagedProxyRouteObservation,
} from "../../core/posture/types.js";
import type { CcSwitchData } from "./parse.js";

function consumerAgentId(
  appType: string
): ManagedProxyRouteObservation["consumerAgentId"] | undefined {
  const normalized = appType.trim().toLowerCase();
  if (normalized === "claude" || normalized === "claude-code") {
    return "claude-code";
  }
  if (normalized === "codex") return "codex";
  return undefined;
}

function localEndpoint(address: string, port: number): string {
  const host = address.includes(":") && !address.startsWith("[")
    ? `[${address}]`
    : address;
  return `http://${host}:${port}`;
}

function fieldToken(value: string): string {
  return value.replace(/[^A-Za-z0-9_$-]/g, "_").slice(0, 64) || "unknown";
}

export function buildCcSwitchPosture(
  data: CcSwitchData,
  dbPath: string,
  findings: readonly RiskFinding[],
  providerPolicy: ProviderTrustPolicy = {}
): EffectivePostureInspection {
  const routes: ManagedProxyRouteObservation[] = [];
  for (const proxy of data.proxies) {
    if (!proxy.enabled) continue;
    const consumer = consumerAgentId(proxy.appType);
    if (!consumer) continue;
    const current = data.providers.find(
      (provider) =>
        provider.appType === proxy.appType && provider.isCurrent
    );
    const realUpstream = current?.baseUrl ?? (
      current?.name ? `provider:${current.name}` : undefined
    );
    routes.push({
      consumerAgentId: consumer,
      proxyKind: "cc-switch",
      localEndpoint: localEndpoint(proxy.listenAddress, proxy.listenPort),
      ...(realUpstream ? { realUpstream } : {}),
      ...(current?.baseUrl
        ? {
            providerClass: classifyBaseUrl(
              current.baseUrl,
              providerPolicy
            ).type,
          }
        : {}),
    });
  }

  const activeProviders = data.providers.filter(
    (provider) => provider.isCurrent || provider.inFailoverQueue
  );
  const fields = [
    "schemaVersion",
    ...activeProviders.map(
      (provider) =>
        `providers.${fieldToken(provider.appType)}.${provider.isCurrent ? "current" : "failover"}`
    ),
    ...data.proxies
      .filter((proxy) => proxy.enabled)
      .map((proxy) => `proxy.${fieldToken(proxy.appType)}.enabled`),
  ];
  const singleRoute = routes.length === 1 ? routes[0] : undefined;
  const hasActiveKey = activeProviders.some((provider) => provider.keyPresent);
  const state: EffectiveAgentState = {
    agentId: "cc-switch",
    displayName: "CC Switch",
    confidence: data.schemaKnown
      ? routes.length <= 1
        ? "confirmed"
        : "inferred"
      : "incomplete",
    configSources: [
      {
        kind: "proxy",
        scope: "user",
        status: data.schemaKnown ? "active" : "conflicting",
        path: dbPath,
        fields,
      },
    ],
    route: {
      proxyKind: "cc-switch",
      ...(singleRoute?.providerClass
        ? { providerClass: singleRoute.providerClass }
        : {}),
      ...(singleRoute
        ? {
            effectiveEndpoint: singleRoute.localEndpoint,
            ...(singleRoute.realUpstream
              ? { realUpstream: singleRoute.realUpstream }
              : {}),
          }
        : {}),
    },
    auth: {
      method: hasActiveKey ? "config-file" : "unknown",
      ...(hasActiveKey ? { sourceKind: "proxy" as const } : {}),
      status: hasActiveKey ? "active" : "unknown",
      conflicts: [],
    },
    permissions: [
      {
        capability: "network-access",
        decision: routes.length > 0 ? "allow" : "unknown",
        scope: routes.length > 0 ? "custom" : "unknown",
        sourceKind: "proxy",
      },
    ],
    integrations: [],
    findingIds: findingRuleIds(findings),
    taskIds: [],
  };
  return {
    state,
    ...(routes.length > 0 ? { managedProxyRoutes: routes } : {}),
  };
}
