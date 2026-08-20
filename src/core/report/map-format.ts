/** map 命令的终端输出格式化（对齐表格，纯字符串，便于测试/复用）。 */
import type { ConfigMap, MapRisk, MapRow } from "../map/index.js";

const RISK_LABEL: Record<MapRisk, string> = {
  critical: "严重",
  high: "高危",
  medium: "中危",
  low: "低危",
  info: "提示",
  ok: "OK",
  "n/a": "-",
};

/** 端点摘要：最多显示 2 个，其余折叠为 +N。 */
function endpointsCell(row: MapRow): string {
  if (!row.configured) return "未配置";
  if (row.endpoints.length === 0) return "—";
  const shown = row.endpoints.slice(0, 2).join(", ");
  const extra = row.endpoints.length - 2;
  return extra > 0 ? `${shown} +${extra}` : shown;
}

/** 计算显示宽度（中文字符按 2 宽）。 */
function width(s: string): number {
  let w = 0;
  for (const ch of s) w += /[\u4e00-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1;
  return w;
}

/** 按显示宽度右侧补空格。 */
function pad(s: string, target: number): string {
  const gap = target - width(s);
  return gap > 0 ? s + " ".repeat(gap) : s;
}

interface Col {
  header: string;
  get: (r: MapRow) => string;
}

const COLUMNS: Col[] = [
  { header: "Agent", get: (r) => r.displayName },
  { header: "配置", get: (r) => (r.configured ? "✓" : "–") },
  { header: "端点", get: endpointsCell },
  { header: "MCP", get: (r) => (r.configured ? String(r.mcpCount) : "-") },
  { header: "密钥", get: (r) => (r.configured ? String(r.secretCount) : "-") },
  { header: "敏感", get: (r) => (r.configured ? String(r.sensitiveCount) : "-") },
  { header: "权限", get: (r) => (r.configured ? String(r.permissionCount) : "-") },
  { header: "风险", get: (r) => RISK_LABEL[r.risk] },
];

/** 生成完整 map 文本报告。 */
export function formatMap(map: ConfigMap): string {
  const lines: string[] = [];
  lines.push("AgentReveal 配置地图");
  lines.push("");

  // 计算每列宽度
  const widths = COLUMNS.map((c) => {
    let w = width(c.header);
    for (const r of map.rows) w = Math.max(w, width(c.get(r)));
    return w;
  });

  const rowLine = (cells: string[]) =>
    "  " + cells.map((c, i) => pad(c, widths[i])).join("  ").trimEnd();

  lines.push(rowLine(COLUMNS.map((c) => c.header)));
  lines.push(
    "  " + widths.map((w) => "─".repeat(w)).join("  ")
  );
  for (const r of map.rows) {
    lines.push(rowLine(COLUMNS.map((c) => c.get(r))));
  }

  // 代理两跳链路展开
  if (map.proxyChains.length > 0) {
    lines.push("");
    lines.push("代理链路（真实上游）：");
    for (const h of map.proxyChains) {
      lines.push(`  ${h.via}  →  本地代理 ${h.proxy}  →  ${h.upstream}`);
    }
    lines.push("  提示：base_url 指向本地代理时，勿把 127.0.0.1 误判为安全本地服务。");
  }

  lines.push("");
  lines.push("列含义：端点=涉及的非官方/被标记端点；MCP/密钥/敏感/权限=对应类别风险项数。");
  return lines.join("\n");
}
