export const EFFECTIVE_CONFIDENCE = [
    "confirmed",
    "inferred",
    "incomplete",
];
export const CONFIG_SOURCE_KINDS = [
    "managed",
    "system",
    "cli",
    "profile",
    "project-local",
    "project-shared",
    "user",
    "environment",
    "proxy",
];
export const CONFIG_SOURCE_SCOPES = [
    "machine",
    "user",
    "project",
    "session",
];
export const CONFIG_SOURCE_STATUSES = [
    "active",
    "overridden",
    "conflicting",
    "unreadable",
];
export const AUTH_METHODS = [
    "cloud-provider",
    "oauth",
    "api-key",
    "keychain-helper",
    "environment",
    "config-file",
    "proxy-injected",
    "none",
    "unknown",
];
export const AUTH_STATUSES = [
    "active",
    "overridden",
    "conflicting",
    "missing",
    "unknown",
];
export const PERMISSION_CAPABILITIES = [
    "filesystem-read",
    "filesystem-write",
    "outside-project-write",
    "command-execute",
    "network-access",
    "mcp-call",
];
export const PERMISSION_DECISIONS = [
    "allow",
    "ask",
    "deny",
    "unknown",
];
export const PERMISSION_SCOPES = [
    "project",
    "outside-project",
    "global",
    "custom",
    "unknown",
];
export const INTEGRATION_KINDS = ["mcp", "skill", "hook"];
export const PROXY_KINDS = [
    "none",
    "cc-switch",
    "system",
    "custom",
    "unknown",
];
export const DRIFT_POLICY_KINDS = ["acceptance", "ignore"];
export const DRIFT_POLICY_STATUSES = ["active", "expired"];
export const DRIFT_EVENT_KINDS = [
    "agent-added",
    "agent-removed",
    "agent-version-changed",
    "config-source-changed",
    "provider-route-changed",
    "auth-source-changed",
    "permission-changed",
    "integration-added",
    "integration-removed",
    "integration-changed",
    "risk-added",
    "risk-resolved",
    "risk-reappeared",
    "acceptance-expired",
    "ignore-expired",
];
export const DRIFT_CHANGE_KINDS = [
    "added",
    "removed",
    "changed",
    "reappeared",
];
export const DRIFT_STATUSES = [
    "no-baseline",
    "unchanged",
    "changed",
    "unavailable",
];
export const BASELINE_MUTATIONS = ["create", "replace", "remove"];
//# sourceMappingURL=types.js.map