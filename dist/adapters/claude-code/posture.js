import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { classifyBaseUrl } from "../../rules/provider.js";
import { isProxyManagedPlaceholder } from "../../core/proxy-managed.js";
import { effectiveSources, findingRuleIds, markFieldWinners, } from "../../core/posture/builders.js";
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
function nonEmpty(value) {
    return typeof value === "string" && value.trim() ? value : undefined;
}
function enabledEnvironmentFlag(value) {
    return (typeof value === "string" &&
        ["1", "true", "yes"].includes(value.trim().toLowerCase()));
}
function readJson(path) {
    if (!existsSync(path))
        return {};
    try {
        return { data: asRecord(JSON.parse(readFileSync(path, "utf8"))) };
    }
    catch {
        return { data: {}, unreadable: true };
    }
}
function flattenRelevant(data) {
    const fields = [];
    const env = asRecord(data.env);
    fields.push(...Object.keys(env).map((key) => `env.${key}`));
    for (const key of [
        "model",
        "apiKeyHelper",
        "enableAllProjectMcpServers",
    ]) {
        if (data[key] !== undefined)
            fields.push(key);
    }
    const permissions = asRecord(data.permissions);
    for (const key of [
        "defaultMode",
        "allow",
        "ask",
        "deny",
        "additionalDirectories",
    ]) {
        if (permissions[key] !== undefined)
            fields.push(`permissions.${key}`);
    }
    const sandbox = asRecord(data.sandbox);
    if (sandbox.enabled !== undefined)
        fields.push("sandbox.enabled");
    const sandboxNetwork = asRecord(sandbox.network);
    if (sandboxNetwork.allowedDomains !== undefined) {
        fields.push("sandbox.network.allowedDomains");
    }
    fields.push(...Object.keys(asRecord(data.hooks)).map((key) => `hooks.${key}`));
    fields.push(...(Object.keys(asRecord(data.enabledPlugins)).length > 0
        ? ["enabledPlugins.plugin"]
        : []));
    return fields;
}
function mergeSettings(target, next) {
    const output = { ...target, ...next };
    for (const key of ["env", "permissions", "sandbox", "hooks", "enabledPlugins"]) {
        output[key] = { ...asRecord(target[key]), ...asRecord(next[key]) };
    }
    const targetPermissions = asRecord(target.permissions);
    const nextPermissions = asRecord(next.permissions);
    const permissions = asRecord(output.permissions);
    for (const key of ["allow", "ask", "deny", "additionalDirectories"]) {
        const combined = [
            ...(Array.isArray(targetPermissions[key]) ? targetPermissions[key] : []),
            ...(Array.isArray(nextPermissions[key]) ? nextPermissions[key] : []),
        ];
        if (combined.length > 0)
            permissions[key] = [...new Set(combined)];
    }
    output.permissions = permissions;
    const sandbox = asRecord(output.sandbox);
    sandbox.network = {
        ...asRecord(asRecord(target.sandbox).network),
        ...asRecord(asRecord(next.sandbox).network),
    };
    output.sandbox = sandbox;
    return output;
}
function addFileLayer(layers, path, kind, scope) {
    const parsed = readJson(path);
    if (!parsed.data && !parsed.unreadable)
        return;
    const fields = flattenRelevant(parsed.data ?? {});
    layers.push({
        data: parsed.data ?? {},
        contribution: {
            source: { kind, scope, path },
            fields,
            activeFields: new Set(),
            overriddenFields: new Set(),
            ...(parsed.unreadable ? { unreadable: true } : {}),
        },
    });
}
function winningKind(layers, field) {
    for (let index = layers.length - 1; index >= 0; index -= 1) {
        if (layers[index].contribution.fields.includes(field)) {
            return layers[index].contribution.source.kind;
        }
    }
    return undefined;
}
function permissionSummary(settings, sourceKind) {
    const mode = nonEmpty(asRecord(settings.permissions).defaultMode) ?? "default";
    let filesystemWrite = "ask";
    let commandExecute = "ask";
    let outsideWrite = "ask";
    if (mode === "bypassPermissions") {
        filesystemWrite = "allow";
        commandExecute = "allow";
        outsideWrite = "allow";
    }
    else if (mode === "acceptEdits" || mode === "auto") {
        filesystemWrite = "allow";
    }
    else if (mode === "plan") {
        filesystemWrite = "deny";
        commandExecute = "deny";
        outsideWrite = "deny";
    }
    else if (mode === "dontAsk") {
        filesystemWrite = "unknown";
        commandExecute = "unknown";
        outsideWrite = "unknown";
    }
    const sandbox = asRecord(settings.sandbox);
    const sandboxNetwork = asRecord(sandbox.network);
    const allowedDomains = Array.isArray(sandboxNetwork.allowedDomains)
        ? sandboxNetwork.allowedDomains
        : [];
    const networkDecision = sandbox.enabled === true
        ? allowedDomains.length > 0
            ? "allow"
            : "deny"
        : "unknown";
    return [
        {
            capability: "filesystem-read",
            decision: "allow",
            scope: "project",
            ...(sourceKind ? { sourceKind } : {}),
        },
        {
            capability: "filesystem-write",
            decision: filesystemWrite,
            scope: "project",
            ...(sourceKind ? { sourceKind } : {}),
        },
        {
            capability: "outside-project-write",
            decision: outsideWrite,
            scope: "outside-project",
            ...(sourceKind ? { sourceKind } : {}),
        },
        {
            capability: "command-execute",
            decision: commandExecute,
            scope: "project",
            ...(sourceKind ? { sourceKind } : {}),
        },
        {
            capability: "network-access",
            decision: networkDecision,
            scope: allowedDomains.length > 0 ? "custom" : "unknown",
            ...(sourceKind ? { sourceKind } : {}),
        },
        {
            capability: "mcp-call",
            decision: "ask",
            scope: "project",
            ...(sourceKind ? { sourceKind } : {}),
        },
    ];
}
function mcpIntegrations(home, cwd) {
    const candidates = [];
    let unreadable = false;
    const globalPath = join(home, ".claude.json");
    const global = readJson(globalPath);
    if (global.unreadable)
        unreadable = true;
    if (global.data) {
        candidates.push({
            kind: "user",
            path: globalPath,
            servers: asRecord(global.data.mcpServers),
            scope: "user",
        });
    }
    const projectPath = join(cwd, ".mcp.json");
    const project = readJson(projectPath);
    if (project.unreadable)
        unreadable = true;
    if (project.data) {
        candidates.push({
            kind: "project-shared",
            path: projectPath,
            servers: asRecord(project.data.mcpServers),
            scope: "project",
        });
    }
    if (global.data) {
        const projects = asRecord(global.data.projects);
        const canonical = resolve(cwd);
        const localEntry = Object.entries(projects).find(([path]) => resolve(path) === canonical);
        if (localEntry) {
            candidates.push({
                kind: "project-local",
                path: globalPath,
                servers: asRecord(asRecord(localEntry[1]).mcpServers),
                scope: "project",
            });
        }
    }
    const byName = new Map();
    for (const candidate of candidates) {
        for (const [name, raw] of Object.entries(candidate.servers)) {
            byName.set(name, {
                raw: asRecord(raw),
                kind: candidate.kind,
                path: candidate.path,
            });
        }
    }
    const integrations = [...byName.entries()].map(([name, entry]) => {
        const url = nonEmpty(entry.raw.url);
        const command = nonEmpty(entry.raw.command);
        return {
            kind: "mcp",
            identity: `${name}:${url ?? command ?? "configured"}`,
            enabled: true,
            sourcePath: entry.path,
        };
    });
    const sources = candidates
        .filter((candidate) => Object.keys(candidate.servers).length > 0)
        .map((candidate) => ({
        source: {
            kind: candidate.kind,
            scope: candidate.scope,
            path: candidate.path,
        },
        fields: ["mcpServers"],
        activeFields: new Set(["mcpServers"]),
        overriddenFields: new Set(),
    }));
    return { integrations, sources, unreadable };
}
export function buildClaudeEffectiveState(input) {
    const layers = [];
    addFileLayer(layers, join(input.configDir, "settings.json"), "user", "user");
    addFileLayer(layers, join(input.cwd, ".claude", "settings.json"), "project-shared", "project");
    addFileLayer(layers, join(input.cwd, ".claude", "settings.local.json"), "project-local", "project");
    if (input.cliSettings) {
        layers.push({
            data: input.cliSettings,
            contribution: {
                source: { kind: "cli", scope: "session" },
                fields: flattenRelevant(input.cliSettings),
                activeFields: new Set(),
                overriddenFields: new Set(),
            },
        });
    }
    for (const path of input.managedSettingsPaths ?? []) {
        addFileLayer(layers, path, "managed", "machine");
    }
    markFieldWinners(layers.map((layer) => layer.contribution));
    for (const layer of layers) {
        for (const field of [
            "permissions.allow",
            "permissions.ask",
            "permissions.deny",
            "permissions.additionalDirectories",
        ]) {
            if (layer.contribution.fields.includes(field)) {
                layer.contribution.activeFields.add(field);
                layer.contribution.overriddenFields.delete(field);
            }
        }
    }
    const settings = layers.reduce((current, layer) => mergeSettings(current, layer.data), {});
    const settingsEnv = asRecord(settings.env);
    const effectiveEnv = { ...settingsEnv };
    for (const [key, value] of Object.entries(input.env)) {
        if (value !== undefined)
            effectiveEnv[key] = value;
    }
    const envSource = (key) => input.env[key] !== undefined
        ? "environment"
        : winningKind(layers, `env.${key}`) ?? "environment";
    const authCandidates = [];
    if (enabledEnvironmentFlag(effectiveEnv.CLAUDE_CODE_USE_BEDROCK) ||
        enabledEnvironmentFlag(effectiveEnv.CLAUDE_CODE_USE_VERTEX) ||
        enabledEnvironmentFlag(effectiveEnv.CLAUDE_CODE_USE_FOUNDRY)) {
        authCandidates.push({
            method: "cloud-provider",
            sourceKind: "environment",
            code: "AUTH_CLOUD_PROVIDER",
        });
    }
    for (const [key, code] of [
        ["ANTHROPIC_AUTH_TOKEN", "AUTH_BEARER_TOKEN"],
        ["ANTHROPIC_API_KEY", "AUTH_API_KEY"],
    ]) {
        const value = effectiveEnv[key];
        if (typeof value === "string" && value.trim()) {
            authCandidates.push({
                method: isProxyManagedPlaceholder(value)
                    ? "proxy-injected"
                    : "api-key",
                sourceKind: envSource(key),
                code,
            });
        }
    }
    if (nonEmpty(settings.apiKeyHelper)) {
        authCandidates.push({
            method: "keychain-helper",
            sourceKind: winningKind(layers, "apiKeyHelper") ?? "user",
            code: "AUTH_API_KEY_HELPER",
        });
    }
    if (typeof effectiveEnv.CLAUDE_CODE_OAUTH_TOKEN === "string" &&
        effectiveEnv.CLAUDE_CODE_OAUTH_TOKEN.trim()) {
        authCandidates.push({
            method: "oauth",
            sourceKind: "environment",
            code: "AUTH_OAUTH_TOKEN",
        });
    }
    const globalState = readJson(join(input.home, ".claude.json"));
    if (Object.keys(asRecord(globalState.data?.oauthAccount)).length > 0) {
        authCandidates.push({
            method: "oauth",
            sourceKind: "user",
            code: "AUTH_SUBSCRIPTION_OAUTH",
        });
    }
    const selectedAuth = authCandidates[0];
    const conflicts = authCandidates.slice(1).map((candidate) => ({
        code: `${candidate.code}_OVERRIDDEN`,
        sourceKinds: [candidate.sourceKind, selectedAuth?.sourceKind ?? "user"],
    }));
    const baseUrl = nonEmpty(effectiveEnv.ANTHROPIC_BASE_URL) ??
        "https://api.anthropic.com";
    const provider = classifyBaseUrl(baseUrl, input.providerPolicy);
    const mcp = mcpIntegrations(input.home, input.cwd);
    const integrations = [...mcp.integrations];
    for (const event of Object.keys(asRecord(settings.hooks))) {
        integrations.push({
            kind: "hook",
            identity: event,
            enabled: true,
        });
    }
    for (const [name, enabled] of Object.entries(asRecord(settings.enabledPlugins))) {
        integrations.push({
            kind: "skill",
            identity: name,
            enabled: enabled === true,
        });
    }
    const environmentFields = Object.keys(input.env)
        .filter((key) => input.env[key] !== undefined &&
        [
            "ANTHROPIC_AUTH_TOKEN",
            "ANTHROPIC_API_KEY",
            "ANTHROPIC_BASE_URL",
            "ANTHROPIC_MODEL",
            "CLAUDE_CODE_OAUTH_TOKEN",
            "CLAUDE_CODE_USE_BEDROCK",
            "CLAUDE_CODE_USE_VERTEX",
            "CLAUDE_CODE_USE_FOUNDRY",
        ].includes(key))
        .map((key) => `env.${key}`);
    const contributions = layers.map((layer) => layer.contribution);
    if (environmentFields.length > 0) {
        for (const field of environmentFields) {
            for (const layer of layers) {
                if (layer.contribution.activeFields.has(field)) {
                    layer.contribution.activeFields.delete(field);
                    layer.contribution.overriddenFields.add(field);
                }
            }
        }
        contributions.push({
            source: { kind: "environment", scope: "session" },
            fields: environmentFields,
            activeFields: new Set(environmentFields),
            overriddenFields: new Set(),
        });
    }
    contributions.push(...mcp.sources);
    return {
        agentId: "claude-code",
        displayName: "Claude Code",
        confidence: layers.some((layer) => layer.contribution.unreadable) ||
            mcp.unreadable ||
            globalState.unreadable
            ? "incomplete"
            : input.cliSettings
                ? "confirmed"
                : "inferred",
        configSources: effectiveSources(contributions),
        route: {
            providerClass: provider.type,
            model: nonEmpty(effectiveEnv.ANTHROPIC_MODEL) ??
                nonEmpty(settings.model),
            proxyKind: provider.type === "local" ? "custom" : "none",
            effectiveEndpoint: baseUrl,
        },
        auth: {
            method: selectedAuth?.method ?? "unknown",
            ...(selectedAuth ? { sourceKind: selectedAuth.sourceKind } : {}),
            status: selectedAuth
                ? conflicts.length > 0
                    ? "conflicting"
                    : "active"
                : "unknown",
            conflicts,
        },
        permissions: permissionSummary(settings, winningKind(layers, "permissions.defaultMode")),
        integrations,
        findingIds: findingRuleIds(input.findings),
        taskIds: [],
    };
}
//# sourceMappingURL=posture.js.map