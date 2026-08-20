import type { DriftComparison } from "../posture/types.js";
import {
  buildDriftCard,
  cardGuidance,
  cardLabel,
  previousVsCurrent,
  sortByCardPriority,
} from "../posture/drift-explain.js";

export function formatDrift(comparison: DriftComparison): string {
  const lines = ["AgentReveal 自可信状态以来"];
  if (comparison.status === "unavailable") {
    lines.push(
      "可信状态不可读取：本机状态文件、身份密钥或权限异常。",
      "当前风险扫描仍可继续，但不会把未知状态自动设为可信；请检查 ~/.agentreveal 后重试。"
    );
    return lines.join("\n");
  }
  if (comparison.status === "no-baseline") {
    lines.push(
      "尚未保存可信状态。首次扫描不会自动信任当前配置。",
      "审核完成后运行 agentreveal drift baseline --confirm。"
    );
    return lines.join("\n");
  }
  lines.push(
    `当前变化 ${comparison.activeEventCount} · 已恢复 ${comparison.resolvedEventCount}` +
      ` · 基线 ${comparison.baselineCapturedAt ?? "未知"}`
  );
  if (comparison.events.length === 0) {
    lines.push("当前有效状态与可信状态一致。");
    return lines.join("\n");
  }

  const sorted = sortByCardPriority(comparison.events);
  for (const { event, card } of sorted) {
    lines.push(
      `- ${cardLabel(card.cls)} ▌${event.agentId}`,
      `  [${event.priority}/${event.severity}] ${shortTitle(event)}`,
      `  ${event.currentSummary}`
    );
    const prev = previousVsCurrent(event);
    if (prev) lines.push(`  ${prev}`);
    lines.push(`  解读：${cardGuidance(card.cls)}`);
    if (event.action[0]) lines.push(`  下一步：${event.action[0]}`);
    if (event.verification[0]) {
      lines.push(`  验证：${event.verification[0]}`);
    }
    lines.push(`  内部 kind=${event.kind} change=${event.change} · ${event.eventId}`);
  }
  return lines.join("\n");
}

/**
 * 派生每条事件的"短标题"：去掉 currentSummary 的句号，把"变化"转名词形式。
 * 用于终端单行（避免和摘要重复）。保留兼容性：旧测试不读这一行。
 */
function shortTitle(event: { kind: string; change: string; currentSummary: string }): string {
  const map: Record<string, string> = {
    "agent-added": "Agent 新增",
    "agent-removed": "Agent 移除",
    "agent-version-changed": "Agent 版本变化",
    "config-source-changed": "配置来源变化",
    "provider-route-changed": "Provider 路由变化",
    "auth-source-changed": "认证来源变化",
    "permission-changed": "权限能力变化",
    "integration-added": "集成新增",
    "integration-removed": "集成移除",
    "integration-changed": "集成变化",
    "risk-added": "风险新增",
    "risk-resolved": "风险已解决",
    "risk-reappeared": "风险回归",
    "acceptance-expired": "接受策略到期",
    "ignore-expired": "忽略策略到期",
  };
  return map[event.kind] ?? event.currentSummary.replace(/[。.]$/, "");
}
