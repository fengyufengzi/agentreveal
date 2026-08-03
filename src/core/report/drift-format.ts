import type { DriftComparison } from "../posture/types.js";

export function formatDrift(comparison: DriftComparison): string {
  const lines = ["AgentGuard 自可信状态以来"];
  if (comparison.status === "unavailable") {
    lines.push(
      "可信状态不可读取：本机状态文件、身份密钥或权限异常。",
      "当前风险扫描仍可继续，但不会把未知状态自动设为可信；请检查 ~/.agentguard 后重试。"
    );
    return lines.join("\n");
  }
  if (comparison.status === "no-baseline") {
    lines.push(
      "尚未保存可信状态。首次扫描不会自动信任当前配置。",
      "审核完成后运行 agentguard drift baseline --confirm。"
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
  for (const entry of comparison.events) {
    lines.push(
      `- [${entry.priority}/${entry.severity}] ${entry.agentId} · ${entry.currentSummary}`,
      `  变化：${entry.kind}/${entry.change} · ${entry.eventId}`
    );
    if (entry.action[0]) lines.push(`  下一步：${entry.action[0]}`);
    if (entry.verification[0]) {
      lines.push(`  验证：${entry.verification[0]}`);
    }
  }
  return lines.join("\n");
}
