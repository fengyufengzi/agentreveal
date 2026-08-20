/** doctor 命令的终端输出格式化（纯字符串，便于测试/复用）。 */
import type { AgentDiscovery } from "../../adapters/types.js";

/** 将一条发现格式化为一行状态。 */
function formatLine(d: AgentDiscovery): string {
  const mark = d.configFound ? "[OK]" : "[--]";
  const name = d.displayName.padEnd(12);
  const status = d.configFound ? "found" : "not configured";
  const where = d.configPath ? `  ${d.configPath}` : "";
  return `${mark} ${name} ${status}${where}`;
}

/** 生成完整 doctor 文本报告。 */
export function formatDoctor(found: AgentDiscovery[]): string {
  const lines: string[] = [];
  lines.push("AgentReveal Doctor");
  lines.push("");
  lines.push("Detected agents:");
  for (const d of found) {
    lines.push("  " + formatLine(d));
  }

  // 备注段（来源、格式提示等）——仅对已发现且有备注的项展示。
  const withNotes = found.filter((d) => d.configFound && d.notes?.length);
  if (withNotes.length) {
    lines.push("");
    lines.push("Notes:");
    for (const d of withNotes) {
      for (const n of d.notes!) {
        lines.push(`  - ${d.displayName}: ${n}`);
      }
    }
  }

  const foundCount = found.filter((d) => d.configFound).length;
  lines.push("");
  lines.push(`Summary: ${foundCount}/${found.length} agents configured.`);
  lines.push("");
  lines.push("Next: 运行 agentreveal scan 做深度风险扫描，或 agentreveal map 看配置地图。");
  return lines.join("\n");
}
