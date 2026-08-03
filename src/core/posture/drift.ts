import { createHash } from "node:crypto";
import type { ActionPriority, RiskLevel } from "../../adapters/types.js";
import type {
  DriftAgentSnapshot,
  DriftChangeKind,
  DriftComparison,
  DriftEvent,
  DriftEventKind,
  DriftPolicySnapshot,
  DriftSnapshot,
  PermissionDecision,
  PermissionSnapshot,
} from "./types.js";

const PRIORITY_ORDER: Record<ActionPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

const SEVERITY_ORDER: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const DECISION_RISK: Record<PermissionDecision, number> = {
  deny: 0,
  ask: 1,
  unknown: 2,
  allow: 3,
};

export interface CompareDriftOptions {
  previousObservation?: DriftSnapshot;
  seenEventIds?: readonly string[];
}

export interface DriftComparisonDetails {
  comparison: DriftComparison;
  activeEventIds: string[];
  seenEventIds: string[];
}

function stableEventId(
  agentId: string,
  kind: DriftEventKind,
  subject: string
): string {
  const digest = createHash("sha256")
    .update(`agentguard-drift-v1\0${agentId}\0${kind}\0${subject}`, "utf8")
    .digest("hex")
    .slice(0, 24);
  return `drift-${digest}`;
}

function event(input: {
  agentId: DriftEvent["agentId"];
  kind: DriftEventKind;
  subject: string;
  change: DriftChangeKind;
  priority: ActionPriority;
  severity: RiskLevel;
  currentSummary: string;
  previousCategory?: string;
  action: string[];
  verification: string[];
}): DriftEvent {
  return {
    eventId: stableEventId(input.agentId, input.kind, input.subject),
    agentId: input.agentId,
    kind: input.kind,
    change: input.change,
    priority: input.priority,
    severity: input.severity,
    currentSummary: input.currentSummary,
    ...(input.previousCategory
      ? { previousCategory: input.previousCategory }
      : {}),
    action: input.action,
    verification: input.verification,
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function permissionMap(
  snapshot: DriftAgentSnapshot
): Map<string, PermissionSnapshot> {
  return new Map(
    snapshot.permissions.map((permission) => [
      permission.capability,
      permission,
    ])
  );
}

function compareAgent(
  baseline: DriftAgentSnapshot,
  current: DriftAgentSnapshot
): DriftEvent[] {
  const events: DriftEvent[] = [];
  const agentId = current.agentId;
  if (baseline.detectedVersion !== current.detectedVersion) {
    events.push(
      event({
        agentId,
        kind: "agent-version-changed",
        subject: "version",
        change: "changed",
        priority: "P2",
        severity: "low",
        currentSummary: "Agent 版本与可信状态不同。",
        previousCategory: baseline.detectedVersion ? "known" : "unknown",
        action: ["确认版本升级来自预期安装来源，并复核发布说明。"],
        verification: ["重新扫描并确认版本及风险状态稳定。"],
      })
    );
  }

  if (stable(baseline.configSources) !== stable(current.configSources)) {
    events.push(
      event({
        agentId,
        kind: "config-source-changed",
        subject: "config-sources",
        change: "changed",
        priority: "P2",
        severity: "medium",
        currentSummary: "参与生效计算的配置来源或覆盖关系发生变化。",
        action: ["检查新增、移除、覆盖或不可读取的配置层是否符合预期。"],
        verification: ["复扫并确认配置来源及覆盖状态与预期一致。"],
      })
    );
  }

  if (stable(baseline.route) !== stable(current.route)) {
    events.push(
      event({
        agentId,
        kind: "provider-route-changed",
        subject: "provider-route",
        change: "changed",
        priority: "P1",
        severity: "high",
        currentSummary: "Provider、模型、代理或真实上游与可信状态不同。",
        previousCategory:
          baseline.route.providerClass ?? baseline.route.proxyKind,
        action: ["核对当前 Provider、代理所有者和真实上游；不符合预期时切回已审核链路。"],
        verification: ["复扫并确认请求链路恢复为预期状态。"],
      })
    );
  }

  if (stable(baseline.auth) !== stable(current.auth)) {
    events.push(
      event({
        agentId,
        kind: "auth-source-changed",
        subject: "auth-source",
        change: "changed",
        priority: "P1",
        severity: "high",
        currentSummary: "当前认证方式、来源或冲突状态与可信状态不同。",
        previousCategory: baseline.auth.method,
        action: ["确认当前实际生效的认证来源，移除不再需要或意外覆盖的凭证来源。"],
        verification: ["重新启动对应 Agent 并复扫，确认认证来源唯一且符合预期。"],
      })
    );
  }

  const baselinePermissions = permissionMap(baseline);
  const currentPermissions = permissionMap(current);
  const capabilities = new Set([
    ...baselinePermissions.keys(),
    ...currentPermissions.keys(),
  ]);
  for (const capability of capabilities) {
    const previous = baselinePermissions.get(capability);
    const next = currentPermissions.get(capability);
    if (stable(previous) === stable(next)) continue;
    const expanded =
      next !== undefined &&
      (!previous ||
        DECISION_RISK[next.decision] > DECISION_RISK[previous.decision]);
    events.push(
      event({
        agentId,
        kind: "permission-changed",
        subject: `permission:${capability}`,
        change: previous ? "changed" : "added",
        priority: expanded ? "P0" : "P2",
        severity: expanded ? "high" : "medium",
        currentSummary: expanded
          ? `权限能力 ${capability} 扩大或变得不确定。`
          : `权限能力 ${capability} 与可信状态不同。`,
        previousCategory: previous?.decision,
        action: [
          expanded
            ? "确认权限扩大是否必要；非预期时恢复最小权限或使用安全 baseline。"
            : "核对权限变化是否来自预期配置调整。",
        ],
        verification: ["复扫并确认该权限能力恢复或已完成明确审核。"],
      })
    );
  }

  const baselineIntegrations = new Map(
    baseline.integrations.map((integration) => [
      `${integration.kind}:${integration.identity}`,
      integration,
    ])
  );
  const currentIntegrations = new Map(
    current.integrations.map((integration) => [
      `${integration.kind}:${integration.identity}`,
      integration,
    ])
  );
  for (const [identity, integration] of currentIntegrations) {
    const previous = baselineIntegrations.get(identity);
    if (!previous) {
      events.push(
        event({
          agentId,
          kind: "integration-added",
          subject: `integration:${identity}`,
          change: "added",
          priority: "P1",
          severity: "medium",
          currentSummary: `新增或启用了 ${integration.kind.toUpperCase()} 集成。`,
          action: ["核对集成来源、版本、命令或端点以及最小权限。"],
          verification: ["复扫并确认该集成已审核、停用或移除。"],
        })
      );
    } else if (stable(previous) !== stable(integration)) {
      events.push(
        event({
          agentId,
          kind: "integration-changed",
          subject: `integration:${identity}`,
          change: "changed",
          priority: "P1",
          severity: "medium",
          currentSummary: `${integration.kind.toUpperCase()} 集成的启用、版本或来源状态发生变化。`,
          action: ["重新审核集成来源、版本和权限范围。"],
          verification: ["复扫并确认集成状态稳定且符合预期。"],
        })
      );
    }
  }
  for (const [identity, integration] of baselineIntegrations) {
    if (currentIntegrations.has(identity)) continue;
    events.push(
      event({
        agentId,
        kind: "integration-removed",
        subject: `integration:${identity}`,
        change: "removed",
        priority: "P2",
        severity: "low",
        currentSummary: `${integration.kind.toUpperCase()} 集成已移除或不再生效。`,
        action: ["确认移除来自预期变更，且没有造成必要能力缺失。"],
        verification: ["复扫并确认集成清单稳定。"],
      })
    );
  }

  const baselineRules = new Set(baseline.ruleIds);
  const currentRules = new Set(current.ruleIds);
  for (const ruleId of currentRules) {
    if (baselineRules.has(ruleId)) continue;
    events.push(
      event({
        agentId,
        kind: "risk-added",
        subject: `risk:${ruleId}`,
        change: "added",
        priority: "P1",
        severity: "high",
        currentSummary: `新增风险规则 ${ruleId}。`,
        action: ["查看对应风险任务的证据、处置和接受条件。"],
        verification: ["处置后复扫，确认规则消失或符合明确接受条件。"],
      })
    );
  }
  for (const ruleId of baselineRules) {
    if (currentRules.has(ruleId)) continue;
    events.push(
      event({
        agentId,
        kind: "risk-resolved",
        subject: `risk:${ruleId}`,
        change: "removed",
        priority: "P3",
        severity: "info",
        currentSummary: `可信状态中的风险规则 ${ruleId} 当前已不存在。`,
        previousCategory: ruleId,
        action: ["保持当前安全状态。"],
        verification: ["后续扫描中确认该规则没有重新出现。"],
      })
    );
  }
  return events;
}

function policyMap(
  snapshot: DriftSnapshot
): Map<string, DriftPolicySnapshot> {
  return new Map(
    (snapshot.policies ?? []).map((policy) => [
      `${policy.kind}\0${policy.agentId}\0${policy.subjectIdentity}`,
      policy,
    ])
  );
}

function expiredPolicyEvents(
  baseline: DriftSnapshot,
  current: DriftSnapshot
): DriftEvent[] {
  const baselinePolicies = policyMap(baseline);
  return [...policyMap(current).entries()].flatMap(([identity, policy]) => {
    const previous = baselinePolicies.get(identity);
    if (previous?.status !== "active" || policy.status !== "expired") return [];
    const acceptance = policy.kind === "acceptance";
    return [
      event({
        agentId: policy.agentId,
        kind: acceptance ? "acceptance-expired" : "ignore-expired",
        subject: `policy:${identity}`,
        change: "reappeared",
        priority: policy.priority,
        severity: policy.severity,
        currentSummary: acceptance
          ? `先前接受的任务已到期，相关规则 ${policy.ruleIds.join("、")} 重新进入行动范围。`
          : `项目忽略已到期，规则 ${policy.ruleIds.join("、")} 重新进入扫描结果。`,
        previousCategory: "active",
        action: acceptance
          ? ["重新检查当前证据；完成处置，或在仍满足接受条件时重新限时接受。"]
          : ["重新检查当前 finding；完成处置，或在仍符合项目忽略条件时重新登记。"],
        verification: ["复扫并确认风险已处置，或新的限时策略已明确生效。"],
      }),
    ];
  });
}

function activeEvents(
  baseline: DriftSnapshot,
  current: DriftSnapshot
): DriftEvent[] {
  const events: DriftEvent[] = [];
  const baselineAgents = new Map(
    baseline.agents.map((agent) => [agent.agentId, agent])
  );
  const currentAgents = new Map(
    current.agents.map((agent) => [agent.agentId, agent])
  );
  for (const [agentId, currentAgent] of currentAgents) {
    const previous = baselineAgents.get(agentId);
    if (!previous) {
      events.push(
        event({
          agentId,
          kind: "agent-added",
          subject: "agent-presence",
          change: "added",
          priority: "P2",
          severity: "medium",
          currentSummary: "发现可信状态中没有的 Agent 配置。",
          action: ["确认该 Agent 的安装、配置和使用目的。"],
          verification: ["审核后替换可信状态，或移除非预期 Agent 配置。"],
        })
      );
      continue;
    }
    events.push(...compareAgent(previous, currentAgent));
  }
  for (const [agentId] of baselineAgents) {
    if (currentAgents.has(agentId)) continue;
    events.push(
      event({
        agentId,
        kind: "agent-removed",
        subject: "agent-presence",
        change: "removed",
        priority: "P1",
        severity: "high",
        currentSummary: "可信状态中的 Agent 当前未被发现，扫描覆盖可能降低。",
        action: ["确认 Agent 是被预期卸载、配置迁移，还是因权限或解析失败而未发现。"],
        verification: ["复扫并确认 Agent 状态或覆盖范围符合预期。"],
      })
    );
  }
  events.push(...expiredPolicyEvents(baseline, current));
  return events;
}

function resolvedEvent(previous: DriftEvent): DriftEvent {
  return {
    ...previous,
    change: "removed",
    priority: "P3",
    severity: "info",
    currentSummary: `先前的变化已恢复到可信状态：${previous.currentSummary}`,
    action: ["保持当前可信状态。"],
    verification: ["后续扫描中确认该变化没有重新出现。"],
  };
}

function sortEvents(events: DriftEvent[]): DriftEvent[] {
  return events.sort(
    (left, right) =>
      PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] ||
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      left.agentId.localeCompare(right.agentId) ||
      left.eventId.localeCompare(right.eventId)
  );
}

export function compareDriftSnapshots(
  baseline: DriftSnapshot | undefined,
  current: DriftSnapshot,
  options: CompareDriftOptions = {}
): DriftComparisonDetails {
  if (!baseline) {
    return {
      comparison: {
        status: "no-baseline",
        currentCapturedAt: current.capturedAt,
        events: [],
        activeEventCount: 0,
        resolvedEventCount: 0,
      },
      activeEventIds: [],
      seenEventIds: [...new Set(options.seenEventIds ?? [])].sort(),
    };
  }
  const currentEvents = activeEvents(baseline, current);
  const previousEvents = options.previousObservation
    ? activeEvents(baseline, options.previousObservation)
    : [];
  const previousIds = new Set(previousEvents.map((entry) => entry.eventId));
  const currentIds = new Set(currentEvents.map((entry) => entry.eventId));
  const seenIds = new Set(options.seenEventIds ?? []);

  for (const entry of currentEvents) {
    if (!previousIds.has(entry.eventId) && seenIds.has(entry.eventId)) {
      entry.change = "reappeared";
      if (entry.kind === "risk-added") entry.kind = "risk-reappeared";
      entry.currentSummary = `变化重新出现：${entry.currentSummary}`;
    }
  }
  const resolved = previousEvents
    .filter((entry) => !currentIds.has(entry.eventId))
    .map(resolvedEvent);
  currentEvents.forEach((entry) => seenIds.add(entry.eventId));

  const events = sortEvents([...currentEvents, ...resolved]);
  return {
    comparison: {
      status: currentEvents.length > 0 ? "changed" : "unchanged",
      baselineCapturedAt: baseline.capturedAt,
      currentCapturedAt: current.capturedAt,
      events,
      activeEventCount: currentEvents.length,
      resolvedEventCount: resolved.length,
    },
    activeEventIds: [...currentIds].sort(),
    seenEventIds: [...seenIds].sort(),
  };
}
