import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import { classifyBaseUrl } from "../../rules/provider.js";
import { isProxyManagedPlaceholder } from "../../core/proxy-managed.js";
import { effectiveSources, findingRuleIds, markFieldWinners, } from "../../core/posture/builders.js";
const PROJECT_IGNORED_ROOT_KEYS = new Set([
    "openai_base_url",
    "chatgpt_base_url",
    "apps_mcp_product_sku",
    "model_provider",
    "model_providers",
    "notify",
    "profile",
    "profiles",
    "experimental_realtime_ws_base_url",
    "otel",
]);
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
function nonEmpty(value) {
    return typeof value === "string" && value.trim() ? value : undefined;
}
function readToml(path) {
    if (!existsSync(path))
        return {};
    try {
        return {
            data: asRecord(parseToml(readFileSync(path, "utf8"))),
        };
    }
    catch {
        return { data: {}, unreadable: true };
    }
}
function flattenFields(value, prefix = "", output = []) {
    for (const [key, entry] of Object.entries(value)) {
        const dynamicParent = [
            "projects",
            "model_providers",
            "mcp_servers",
            "permissions",
            "agents",
        ].includes(prefix);
        const safeKey = dynamicParent
            ? prefix === "projects"
                ? "project"
                : prefix === "model_providers"
                    ? "provider"
                    : prefix === "mcp_servers"
                        ? "server"
                        : prefix === "permissions"
                            ? "profile"
                            : "role"
            : key;
        const field = prefix ? `${prefix}.${safeKey}` : safeKey;
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
            flattenFields(asRecord(entry), field, output);
        }
        else {
            output.push(field);
        }
    }
    return output;
}
function deepMerge(base, next) {
    const output = { ...base };
    for (const [key, value] of Object.entries(next)) {
        if (value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            output[key] &&
            typeof output[key] === "object" &&
            !Array.isArray(output[key])) {
            output[key] = deepMerge(asRecord(output[key]), asRecord(value));
        }
        else {
            output[key] = value;
        }
    }
    return output;
}
function addLayer(layers, path, kind, scope, options = {}) {
    const parsed = options.data !== undefined
        ? { data: options.data, unreadable: options.unreadable }
        : readToml(path);
    if (!parsed.data && !parsed.unreadable)
        return;
    layers.push({
        data: parsed.data ?? {},
        ignored: options.ignored,
        contribution: {
            source: {
                kind,
                scope,
                ...(path ? { path } : {}),
            },
            fields: flattenFields(parsed.data ?? {}),
            activeFields: new Set(),
            overriddenFields: new Set(),
            ...(parsed.unreadable ? { unreadable: true } : {}),
        },
    });
}
function projectRoot(cwd, markers = [".git"]) {
    let current = resolve(cwd);
    while (true) {
        if (markers.some((marker) => existsSync(join(current, marker)))) {
            return current;
        }
        const parent = dirname(current);
        if (parent === current)
            return resolve(cwd);
        current = parent;
    }
}
function projectConfigPaths(cwd, markers = [".git"]) {
    const root = projectRoot(cwd, markers);
    const segments = [];
    let current = resolve(cwd);
    while (true) {
        segments.push(current);
        if (current === root)
            break;
        const parent = dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return segments
        .reverse()
        .map((directory) => join(directory, ".codex", "config.toml"))
        .filter((path) => existsSync(path));
}
function trustForProject(user, cwd) {
    const canonical = resolve(cwd);
    const markers = Array.isArray(user.project_root_markers)
        ? user.project_root_markers.filter((value) => typeof value === "string" && value.length > 0)
        : [".git"];
    const root = projectRoot(cwd, markers);
    for (const [path, value] of Object.entries(asRecord(user.projects))) {
        if ([canonical, root].includes(resolve(path)) &&
            asRecord(value).trust_level === "trusted") {
            return true;
        }
    }
    return false;
}
function sanitizeProjectLayer(data) {
    return Object.fromEntries(Object.entries(data).filter(([key]) => !PROJECT_IGNORED_ROOT_KEYS.has(key)));
}
function readAuth(baseDir) {
    const path = join(baseDir, "auth.json");
    if (!existsSync(path)) {
        return {
            apiKeyPresent: false,
            proxyManaged: false,
            oauthPresent: false,
            unreadable: false,
            present: false,
        };
    }
    try {
        const value = asRecord(JSON.parse(readFileSync(path, "utf8")));
        const key = value.OPENAI_API_KEY;
        return {
            apiKeyPresent: typeof key === "string" &&
                key.trim().length > 0 &&
                !isProxyManagedPlaceholder(key),
            proxyManaged: isProxyManagedPlaceholder(key),
            oauthPresent: Object.keys(asRecord(value.tokens)).length > 0,
            authMode: nonEmpty(value.auth_mode),
            unreadable: false,
            present: true,
        };
    }
    catch {
        return {
            apiKeyPresent: false,
            proxyManaged: false,
            oauthPresent: false,
            unreadable: true,
            present: true,
        };
    }
}
function permissionSummary(settings, sourceKind) {
    let sandboxMode = nonEmpty(settings.sandbox_mode) ?? "read-only";
    const defaultPermissions = nonEmpty(settings.default_permissions);
    if (defaultPermissions === ":read-only")
        sandboxMode = "read-only";
    if (defaultPermissions === ":workspace")
        sandboxMode = "workspace-write";
    if (defaultPermissions === ":danger-full-access") {
        sandboxMode = "danger-full-access";
    }
    const approval = settings.approval_policy;
    const commandDecision = approval === "never"
        ? "allow"
        : typeof approval === "string"
            ? "ask"
            : "unknown";
    const workspaceWrite = sandboxMode === "workspace-write";
    const fullAccess = sandboxMode === "danger-full-access";
    const networkEnabled = fullAccess ||
        (workspaceWrite &&
            asRecord(settings.sandbox_workspace_write).network_access === true);
    const withSource = sourceKind ? { sourceKind } : {};
    return [
        {
            capability: "filesystem-read",
            decision: "allow",
            scope: "project",
            ...withSource,
        },
        {
            capability: "filesystem-write",
            decision: workspaceWrite || fullAccess ? "allow" : "deny",
            scope: "project",
            ...withSource,
        },
        {
            capability: "outside-project-write",
            decision: fullAccess ? "allow" : "deny",
            scope: "outside-project",
            ...withSource,
        },
        {
            capability: "command-execute",
            decision: commandDecision,
            scope: fullAccess ? "global" : "project",
            ...withSource,
        },
        {
            capability: "network-access",
            decision: networkEnabled ? "allow" : "deny",
            scope: fullAccess ? "global" : "project",
            ...withSource,
        },
        {
            capability: "mcp-call",
            decision: commandDecision === "allow" ? "allow" : "ask",
            scope: "project",
            ...withSource,
        },
    ];
}
function sourceKindForField(layers, field) {
    for (let index = layers.length - 1; index >= 0; index -= 1) {
        if (!layers[index].ignored &&
            layers[index].contribution.fields.includes(field)) {
            return layers[index].contribution.source.kind;
        }
    }
    return undefined;
}
export function buildCodexEffectiveState(input) {
    const layers = [];
    if (input.systemConfigPath) {
        addLayer(layers, input.systemConfigPath, "system", "machine");
    }
    const userParsed = readToml(input.configPath);
    addLayer(layers, input.configPath, "user", "user");
    const user = userParsed.data ?? {};
    if (input.profile) {
        const profilePath = join(input.baseDir, `${input.profile}.config.toml`);
        if (existsSync(profilePath)) {
            addLayer(layers, profilePath, "profile", "session");
        }
        else {
            layers.push({
                data: {},
                contribution: {
                    source: { kind: "profile", scope: "session", path: profilePath },
                    fields: ["profile.selection"],
                    activeFields: new Set(),
                    overriddenFields: new Set(),
                    unreadable: true,
                },
            });
        }
    }
    const trusted = input.projectTrusted ?? trustForProject(user, input.cwd);
    const rootMarkers = Array.isArray(user.project_root_markers)
        ? user.project_root_markers.filter((value) => typeof value === "string" && value.length > 0)
        : [".git"];
    for (const path of projectConfigPaths(input.cwd, rootMarkers)) {
        const parsed = readToml(path);
        if (!parsed.data && !parsed.unreadable)
            continue;
        addLayer(layers, path, "project-local", "project", {
            data: parsed.data ?? {},
            ignored: !trusted,
            unreadable: parsed.unreadable,
        });
    }
    if (input.cliOverrides) {
        addLayer(layers, "", "cli", "session", { data: input.cliOverrides });
    }
    const winningContributions = layers
        .filter((layer) => !layer.ignored)
        .map((layer) => {
        const contribution = layer.contribution;
        const fields = contribution.source.scope === "project"
            ? contribution.fields.filter((field) => !PROJECT_IGNORED_ROOT_KEYS.has(field.split(".")[0]))
            : contribution.fields;
        return { ...contribution, fields };
    });
    markFieldWinners(winningContributions);
    for (const layer of layers) {
        if (layer.contribution.source.scope === "project") {
            for (const field of layer.contribution.fields) {
                if (PROJECT_IGNORED_ROOT_KEYS.has(field.split(".")[0])) {
                    layer.contribution.activeFields.delete(field);
                    layer.contribution.overriddenFields.add(field);
                }
            }
        }
        if (layer.ignored) {
            layer.contribution.activeFields.clear();
            layer.contribution.overriddenFields = new Set(layer.contribution.fields);
        }
    }
    let effective = {};
    for (const layer of layers) {
        if (layer.ignored || layer.contribution.unreadable)
            continue;
        const data = layer.contribution.source.scope === "project"
            ? sanitizeProjectLayer(layer.data)
            : layer.data;
        effective = deepMerge(effective, data);
    }
    const activeProvider = nonEmpty(effective.model_provider) ?? "openai";
    const provider = asRecord(asRecord(effective.model_providers)[activeProvider]);
    const baseUrl = activeProvider === "openai"
        ? nonEmpty(effective.openai_base_url) ?? "https://api.openai.com/v1"
        : nonEmpty(provider.base_url);
    const providerClass = baseUrl
        ? classifyBaseUrl(baseUrl, input.providerPolicy).type
        : "unknown";
    const authFile = readAuth(input.baseDir);
    const authCandidates = [];
    const envKey = nonEmpty(provider.env_key);
    if (envKey && input.env[envKey]) {
        authCandidates.push({
            method: "environment",
            sourceKind: "environment",
            code: "AUTH_PROVIDER_ENV_KEY",
        });
    }
    if (Object.keys(asRecord(provider.auth)).length > 0) {
        authCandidates.push({
            method: "keychain-helper",
            sourceKind: sourceKindForField(layers, "model_providers.provider.auth.command") ?? "user",
            code: "AUTH_PROVIDER_COMMAND",
        });
    }
    if (authFile.proxyManaged) {
        authCandidates.push({
            method: "proxy-injected",
            sourceKind: "proxy",
            code: "AUTH_PROXY_MANAGED",
        });
    }
    else if (authFile.apiKeyPresent) {
        authCandidates.push({
            method: "api-key",
            sourceKind: "user",
            code: "AUTH_FILE_API_KEY",
        });
    }
    else if (authFile.oauthPresent ||
        authFile.authMode === "chatgpt" ||
        effective.forced_login_method === "chatgpt") {
        authCandidates.push({
            method: "oauth",
            sourceKind: "user",
            code: "AUTH_CHATGPT_OAUTH",
        });
    }
    const selectedAuth = authCandidates[0];
    const conflicts = authCandidates.slice(1).map((candidate) => ({
        code: `${candidate.code}_OVERRIDDEN`,
        sourceKinds: [candidate.sourceKind, selectedAuth?.sourceKind ?? "user"],
    }));
    const mcp = asRecord(effective.mcp_servers);
    const integrations = Object.entries(mcp).map(([name, raw]) => {
        const server = asRecord(raw);
        return {
            kind: "mcp",
            identity: `${name}:${nonEmpty(server.url) ?? nonEmpty(server.command) ?? "configured"}`,
            enabled: server.enabled !== false,
        };
    });
    for (const event of Object.keys(asRecord(effective.hooks))) {
        integrations.push({ kind: "hook", identity: event, enabled: true });
    }
    const contributions = layers.map((layer) => layer.contribution);
    if (envKey && input.env[envKey]) {
        contributions.push({
            source: { kind: "environment", scope: "session" },
            fields: [`env.${envKey}`],
            activeFields: new Set([`env.${envKey}`]),
            overriddenFields: new Set(),
        });
    }
    if (authFile.present) {
        contributions.push({
            source: {
                kind: "user",
                scope: "user",
                path: join(input.baseDir, "auth.json"),
            },
            fields: ["auth.mode", "auth.credentialPresent"],
            activeFields: new Set(["auth.mode", "auth.credentialPresent"]),
            overriddenFields: new Set(),
            ...(authFile.unreadable ? { unreadable: true } : {}),
        });
    }
    const permissionSource = sourceKindForField(layers, "default_permissions") ??
        sourceKindForField(layers, "sandbox_mode") ??
        sourceKindForField(layers, "approval_policy");
    const parseIncomplete = layers.some((layer) => layer.contribution.unreadable) ||
        authFile.unreadable;
    return {
        agentId: "codex",
        displayName: "Codex",
        confidence: parseIncomplete
            ? "incomplete"
            : input.cliOverrides
                ? "confirmed"
                : "inferred",
        configSources: effectiveSources(contributions),
        route: {
            providerClass,
            model: nonEmpty(effective.model),
            proxyKind: providerClass === "local" || authFile.proxyManaged
                ? "custom"
                : "none",
            ...(baseUrl ? { effectiveEndpoint: baseUrl } : {}),
        },
        auth: {
            method: selectedAuth?.method ?? (envKey ? "environment" : "unknown"),
            ...(selectedAuth ? { sourceKind: selectedAuth.sourceKind } : {}),
            status: selectedAuth
                ? conflicts.length > 0
                    ? "conflicting"
                    : "active"
                : envKey
                    ? "missing"
                    : "unknown",
            conflicts,
        },
        permissions: permissionSummary(effective, permissionSource),
        integrations,
        findingIds: findingRuleIds(input.findings),
        taskIds: [],
    };
}
//# sourceMappingURL=posture.js.map