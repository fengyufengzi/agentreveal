/** CC Switch 代理接管写入 Agent live 配置的公开占位符，不是真实 Provider 凭证。 */
export const PROXY_MANAGED_PLACEHOLDER = "PROXY_MANAGED";

/** 面向用户的统一说明，避免把占位符误称为模型或真实密钥。 */
export const PROXY_MANAGED_AUTH_LABEL =
  "PROXY_MANAGED（CC Switch 鉴权占位符）";

export function isProxyManagedPlaceholder(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.trim() === PROXY_MANAGED_PLACEHOLDER
  );
}

export function ccSwitchAppLabel(appType: unknown): string {
  const normalized = String(appType ?? "").trim().toLowerCase();
  if (normalized === "claude" || normalized === "claude-code") return "Claude Code";
  if (normalized === "codex") return "Codex";
  if (normalized === "gemini" || normalized === "gemini-cli") return "Gemini CLI";
  if (normalized === "openclaw") return "OpenClaw";
  return String(appType ?? "未知 Agent");
}
