import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { projectScopeId } from "../acceptance/index.js";
import { atomicCreateFile, atomicWriteFile } from "../fs-safety.js";
import { RULE_IDS } from "../../rules/ids.js";
import { loadOrCreatePostureIdentityKey, postureHmacIdentity, } from "./identity.js";
import { AUTH_METHODS, AUTH_STATUSES, CONFIG_SOURCE_KINDS, CONFIG_SOURCE_SCOPES, CONFIG_SOURCE_STATUSES, EFFECTIVE_CONFIDENCE, DRIFT_POLICY_KINDS, DRIFT_POLICY_STATUSES, INTEGRATION_KINDS, PERMISSION_CAPABILITIES, PERMISSION_DECISIONS, PERMISSION_SCOPES, PROXY_KINDS, } from "./types.js";
import { compareDriftSnapshots } from "./drift.js";
const DRIFT_SNAPSHOT_SCHEMA_VERSION = 1;
const AGENT_IDS = [
    "claude-code",
    "codex",
    "cc-switch",
    "opencode",
    "gemini",
    "openclaw",
];
const POLICY_AGENT_IDS = [...AGENT_IDS, "workspace"];
const PROVIDER_TYPES = [
    "official",
    "domestic_official",
    "local",
    "enterprise_internal",
    "relay_or_proxy",
    "openai_compatible_unknown",
    "unknown",
];
export function defaultPostureSnapshotPath(home = homedir()) {
    return join(home, ".agentreveal", "posture-snapshots.json");
}
function uniqueSorted(values) {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
function optionalIdentity(key, context, value) {
    return value?.trim() ? postureHmacIdentity(key, context, value) : undefined;
}
function snapshotAgent(state, key) {
    const routeModelIdentity = optionalIdentity(key, `model:${state.agentId}`, state.route.model);
    const effectiveEndpointIdentity = optionalIdentity(key, `effective-endpoint:${state.agentId}`, state.route.effectiveEndpoint);
    const realUpstreamIdentity = optionalIdentity(key, `real-upstream:${state.agentId}`, state.route.realUpstream);
    return {
        agentId: state.agentId,
        ...(state.detectedVersion ? { detectedVersion: state.detectedVersion } : {}),
        confidence: state.confidence,
        configSources: state.configSources
            .map((source) => {
            const pathIdentity = optionalIdentity(key, `config-source-path:${state.agentId}:${source.kind}:${source.scope}`, source.path);
            return {
                kind: source.kind,
                scope: source.scope,
                status: source.status,
                fieldNames: uniqueSorted(source.fields),
                ...(pathIdentity ? { pathIdentity } : {}),
            };
        })
            .sort((left, right) => `${left.kind}\0${left.scope}\0${left.status}\0${left.pathIdentity ?? ""}`.localeCompare(`${right.kind}\0${right.scope}\0${right.status}\0${right.pathIdentity ?? ""}`)),
        route: {
            ...(state.route.providerClass
                ? { providerClass: state.route.providerClass }
                : {}),
            proxyKind: state.route.proxyKind,
            ...(routeModelIdentity ? { modelIdentity: routeModelIdentity } : {}),
            ...(effectiveEndpointIdentity ? { effectiveEndpointIdentity } : {}),
            ...(realUpstreamIdentity ? { realUpstreamIdentity } : {}),
        },
        auth: {
            method: state.auth.method,
            ...(state.auth.sourceKind ? { sourceKind: state.auth.sourceKind } : {}),
            status: state.auth.status,
            conflictCodes: uniqueSorted(state.auth.conflicts.map((entry) => entry.code)),
        },
        permissions: state.permissions
            .map((permission) => ({
            capability: permission.capability,
            decision: permission.decision,
            scope: permission.scope,
            ...(permission.sourceKind ? { sourceKind: permission.sourceKind } : {}),
        }))
            .sort((left, right) => `${left.capability}\0${left.scope}\0${left.decision}\0${left.sourceKind ?? ""}`.localeCompare(`${right.capability}\0${right.scope}\0${right.decision}\0${right.sourceKind ?? ""}`)),
        integrations: state.integrations
            .map((integration) => {
            const versionIdentity = optionalIdentity(key, `integration-version:${state.agentId}:${integration.kind}`, integration.version);
            const sourcePathIdentity = optionalIdentity(key, `integration-source:${state.agentId}:${integration.kind}`, integration.sourcePath);
            return {
                kind: integration.kind,
                identity: postureHmacIdentity(key, `integration:${state.agentId}:${integration.kind}`, integration.identity),
                enabled: integration.enabled,
                ...(versionIdentity ? { versionIdentity } : {}),
                ...(sourcePathIdentity ? { sourcePathIdentity } : {}),
            };
        })
            .sort((left, right) => `${left.kind}\0${left.identity}`.localeCompare(`${right.kind}\0${right.identity}`)),
        ruleIds: uniqueSorted(state.findingIds),
    };
}
function snapshotPolicy(policy, key) {
    if (!POLICY_AGENT_IDS.includes(policy.agentId)) {
        throw new Error("漂移策略 Agent 无效。");
    }
    if (!DRIFT_POLICY_KINDS.includes(policy.kind)) {
        throw new Error("漂移策略类型无效。");
    }
    if (!DRIFT_POLICY_STATUSES.includes(policy.status)) {
        throw new Error("漂移策略状态无效。");
    }
    if (!policy.subject.trim()) {
        throw new Error("漂移策略身份无效。");
    }
    for (const ruleId of policy.ruleIds) {
        if (!RULE_IDS.includes(ruleId))
            throw new Error("漂移策略规则无效。");
    }
    return {
        kind: policy.kind,
        agentId: policy.agentId,
        subjectIdentity: postureHmacIdentity(key, `policy:${policy.kind}:${policy.agentId}`, policy.subject),
        status: policy.status,
        ruleIds: uniqueSorted(policy.ruleIds),
        priority: policy.priority,
        severity: policy.severity,
    };
}
function assertString(value, label) {
    if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
        throw new Error(`${label}无效。`);
    }
}
function assertStringArray(value, label) {
    if (!Array.isArray(value))
        throw new Error(`${label}无效。`);
    for (const entry of value)
        assertString(entry, label);
}
function assertIdentifierArray(value, label) {
    assertStringArray(value, label);
    if (value.some((entry) => entry.length > 128 || !/^[A-Za-z_$][A-Za-z0-9_$.-]*$/.test(entry))) {
        throw new Error(`${label}必须只包含配置字段名。`);
    }
}
function assertCode(value, label) {
    assertString(value, label);
    if (value.length > 128 || !/^[A-Z][A-Z0-9_]*$/.test(value)) {
        throw new Error(`${label}必须是稳定代码。`);
    }
}
function assertEnum(value, allowed, label) {
    if (typeof value !== "string" || !allowed.includes(value)) {
        throw new Error(`${label}无效。`);
    }
}
function assertKeys(value, allowed, label) {
    const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unknown.length > 0)
        throw new Error(`${label}包含未知字段。`);
}
function assertObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label}无效。`);
    }
}
function assertEffectiveState(value) {
    assertObject(value, "有效配置状态");
    assertKeys(value, [
        "agentId",
        "displayName",
        "detectedVersion",
        "confidence",
        "configSources",
        "route",
        "auth",
        "permissions",
        "integrations",
        "findingIds",
        "taskIds",
    ], "有效配置状态");
    assertEnum(value.agentId, AGENT_IDS, "Agent ID");
    assertString(value.displayName, "Agent 展示名");
    if (value.detectedVersion !== undefined) {
        assertString(value.detectedVersion, "Agent 版本");
    }
    assertEnum(value.confidence, EFFECTIVE_CONFIDENCE, "有效配置可信度");
    if (!Array.isArray(value.configSources))
        throw new Error("配置来源无效。");
    for (const rawSource of value.configSources) {
        assertObject(rawSource, "配置来源");
        assertKeys(rawSource, ["kind", "scope", "status", "path", "fields"], "配置来源");
        assertEnum(rawSource.kind, CONFIG_SOURCE_KINDS, "配置来源类型");
        assertEnum(rawSource.scope, CONFIG_SOURCE_SCOPES, "配置来源作用域");
        assertEnum(rawSource.status, CONFIG_SOURCE_STATUSES, "配置来源状态");
        if (rawSource.path !== undefined)
            assertString(rawSource.path, "配置来源路径");
        assertIdentifierArray(rawSource.fields, "配置字段名");
    }
    assertObject(value.route, "有效路由");
    assertKeys(value.route, [
        "providerClass",
        "model",
        "proxyKind",
        "effectiveEndpoint",
        "realUpstream",
    ], "有效路由");
    if (value.route.providerClass !== undefined) {
        assertEnum(value.route.providerClass, PROVIDER_TYPES, "Provider 分类");
    }
    assertEnum(value.route.proxyKind, PROXY_KINDS, "代理类型");
    for (const field of ["model", "effectiveEndpoint", "realUpstream"]) {
        if (value.route[field] !== undefined)
            assertString(value.route[field], "有效路由字段");
    }
    assertObject(value.auth, "认证状态");
    assertKeys(value.auth, ["method", "sourceKind", "status", "conflicts"], "认证状态");
    assertEnum(value.auth.method, AUTH_METHODS, "认证方式");
    if (value.auth.sourceKind !== undefined) {
        assertEnum(value.auth.sourceKind, CONFIG_SOURCE_KINDS, "认证来源");
    }
    assertEnum(value.auth.status, AUTH_STATUSES, "认证状态");
    if (!Array.isArray(value.auth.conflicts))
        throw new Error("认证冲突无效。");
    for (const rawConflict of value.auth.conflicts) {
        assertObject(rawConflict, "认证冲突");
        assertKeys(rawConflict, ["code", "sourceKinds"], "认证冲突");
        assertCode(rawConflict.code, "认证冲突代码");
        if (!Array.isArray(rawConflict.sourceKinds))
            throw new Error("认证冲突来源无效。");
        for (const kind of rawConflict.sourceKinds) {
            assertEnum(kind, CONFIG_SOURCE_KINDS, "认证冲突来源");
        }
    }
    if (!Array.isArray(value.permissions))
        throw new Error("权限状态无效。");
    for (const rawPermission of value.permissions) {
        assertObject(rawPermission, "权限状态");
        assertKeys(rawPermission, ["capability", "decision", "scope", "sourceKind"], "权限状态");
        assertEnum(rawPermission.capability, PERMISSION_CAPABILITIES, "权限能力");
        assertEnum(rawPermission.decision, PERMISSION_DECISIONS, "权限决定");
        assertEnum(rawPermission.scope, PERMISSION_SCOPES, "权限作用域");
        if (rawPermission.sourceKind !== undefined) {
            assertEnum(rawPermission.sourceKind, CONFIG_SOURCE_KINDS, "权限来源");
        }
    }
    if (!Array.isArray(value.integrations))
        throw new Error("集成状态无效。");
    for (const rawIntegration of value.integrations) {
        assertObject(rawIntegration, "集成状态");
        assertKeys(rawIntegration, ["kind", "identity", "enabled", "version", "sourcePath"], "集成状态");
        assertEnum(rawIntegration.kind, INTEGRATION_KINDS, "集成类型");
        assertString(rawIntegration.identity, "集成身份");
        if (typeof rawIntegration.enabled !== "boolean")
            throw new Error("集成启用状态无效。");
        if (rawIntegration.version !== undefined)
            assertString(rawIntegration.version, "集成版本");
        if (rawIntegration.sourcePath !== undefined) {
            assertString(rawIntegration.sourcePath, "集成来源路径");
        }
    }
    assertStringArray(value.findingIds, "规则 ID");
    for (const ruleId of value.findingIds) {
        assertEnum(ruleId, RULE_IDS, "规则 ID");
    }
    assertStringArray(value.taskIds, "任务 ID");
}
export function buildDriftSnapshot(states, key, capturedAt = new Date(), policyStates = []) {
    if (!Number.isFinite(capturedAt.getTime()))
        throw new Error("可信快照时间无效。");
    const agents = states.map((state) => {
        assertEffectiveState(state);
        return snapshotAgent(state, key);
    });
    const ids = agents.map((agent) => agent.agentId);
    if (new Set(ids).size !== ids.length) {
        throw new Error("可信快照不能包含重复 Agent。");
    }
    const policies = policyStates.map((policy) => snapshotPolicy(policy, key));
    const policyIds = policies.map((policy) => `${policy.kind}\0${policy.agentId}\0${policy.subjectIdentity}`);
    if (new Set(policyIds).size !== policyIds.length) {
        throw new Error("可信快照不能包含重复策略。");
    }
    return {
        schemaVersion: DRIFT_SNAPSHOT_SCHEMA_VERSION,
        capturedAt: capturedAt.toISOString(),
        agents: agents.sort((left, right) => left.agentId.localeCompare(right.agentId)),
        policies: policies.sort((left, right) => left.kind.localeCompare(right.kind) ||
            left.agentId.localeCompare(right.agentId) ||
            left.subjectIdentity.localeCompare(right.subjectIdentity)),
    };
}
function emptyDocument() {
    return {
        schemaVersion: DRIFT_SNAPSHOT_SCHEMA_VERSION,
        scopes: {},
        observations: {},
        seenEventIds: {},
        audit: [],
    };
}
function isHmacIdentity(value) {
    return typeof value === "string" && /^hmac-sha256:[a-f0-9]{64}$/.test(value);
}
function validateDocument(value) {
    assertObject(value, "可信快照文件");
    assertKeys(value, ["schemaVersion", "scopes", "observations", "seenEventIds", "audit"], "可信快照文件");
    if (value.schemaVersion !== DRIFT_SNAPSHOT_SCHEMA_VERSION) {
        throw new Error("可信快照文件版本无效。");
    }
    assertObject(value.scopes, "可信快照作用域");
    const observations = value.observations === undefined ? {} : value.observations;
    assertObject(observations, "可信快照观察状态");
    for (const [scopeId, rawSnapshot] of [
        ...Object.entries(value.scopes),
        ...Object.entries(observations),
    ]) {
        if (!/^scope-[a-f0-9]{64}$/.test(scopeId)) {
            throw new Error("可信快照作用域 ID 无效。");
        }
        assertObject(rawSnapshot, "可信快照");
        assertKeys(rawSnapshot, ["schemaVersion", "capturedAt", "agents", "policies"], "可信快照");
        if (rawSnapshot.schemaVersion !== DRIFT_SNAPSHOT_SCHEMA_VERSION) {
            throw new Error("可信快照版本无效。");
        }
        if (typeof rawSnapshot.capturedAt !== "string" ||
            !Number.isFinite(Date.parse(rawSnapshot.capturedAt))) {
            throw new Error("可信快照时间无效。");
        }
        if (!Array.isArray(rawSnapshot.agents))
            throw new Error("可信快照 Agent 列表无效。");
        const agentIds = new Set();
        for (const rawAgent of rawSnapshot.agents) {
            assertObject(rawAgent, "可信快照 Agent");
            assertKeys(rawAgent, [
                "agentId",
                "detectedVersion",
                "confidence",
                "configSources",
                "route",
                "auth",
                "permissions",
                "integrations",
                "ruleIds",
            ], "可信快照 Agent");
            assertEnum(rawAgent.agentId, AGENT_IDS, "可信快照 Agent ID");
            if (agentIds.has(rawAgent.agentId))
                throw new Error("可信快照包含重复 Agent。");
            agentIds.add(rawAgent.agentId);
            if (rawAgent.detectedVersion !== undefined) {
                assertString(rawAgent.detectedVersion, "可信快照 Agent 版本");
            }
            assertEnum(rawAgent.confidence, EFFECTIVE_CONFIDENCE, "可信快照可信度");
            if (!Array.isArray(rawAgent.configSources))
                throw new Error("可信快照配置来源无效。");
            for (const rawSource of rawAgent.configSources) {
                assertObject(rawSource, "可信快照配置来源");
                assertKeys(rawSource, ["kind", "scope", "status", "fieldNames", "pathIdentity"], "可信快照配置来源");
                assertEnum(rawSource.kind, CONFIG_SOURCE_KINDS, "可信快照配置来源类型");
                assertEnum(rawSource.scope, CONFIG_SOURCE_SCOPES, "可信快照配置来源作用域");
                assertEnum(rawSource.status, CONFIG_SOURCE_STATUSES, "可信快照配置来源状态");
                assertIdentifierArray(rawSource.fieldNames, "可信快照字段名");
                if (rawSource.pathIdentity !== undefined && !isHmacIdentity(rawSource.pathIdentity)) {
                    throw new Error("可信快照路径身份无效。");
                }
            }
            assertObject(rawAgent.route, "可信快照路由");
            assertKeys(rawAgent.route, [
                "providerClass",
                "proxyKind",
                "modelIdentity",
                "effectiveEndpointIdentity",
                "realUpstreamIdentity",
            ], "可信快照路由");
            if (rawAgent.route.providerClass !== undefined) {
                assertEnum(rawAgent.route.providerClass, PROVIDER_TYPES, "可信快照 Provider 分类");
            }
            assertEnum(rawAgent.route.proxyKind, PROXY_KINDS, "可信快照代理类型");
            for (const field of [
                "modelIdentity",
                "effectiveEndpointIdentity",
                "realUpstreamIdentity",
            ]) {
                if (rawAgent.route[field] !== undefined && !isHmacIdentity(rawAgent.route[field])) {
                    throw new Error("可信快照路由身份无效。");
                }
            }
            assertObject(rawAgent.auth, "可信快照认证");
            assertKeys(rawAgent.auth, ["method", "sourceKind", "status", "conflictCodes"], "可信快照认证");
            assertEnum(rawAgent.auth.method, AUTH_METHODS, "可信快照认证方式");
            if (rawAgent.auth.sourceKind !== undefined) {
                assertEnum(rawAgent.auth.sourceKind, CONFIG_SOURCE_KINDS, "可信快照认证来源");
            }
            assertEnum(rawAgent.auth.status, AUTH_STATUSES, "可信快照认证状态");
            assertStringArray(rawAgent.auth.conflictCodes, "可信快照冲突代码");
            for (const code of rawAgent.auth.conflictCodes) {
                assertCode(code, "可信快照冲突代码");
            }
            if (!Array.isArray(rawAgent.permissions))
                throw new Error("可信快照权限无效。");
            for (const rawPermission of rawAgent.permissions) {
                assertObject(rawPermission, "可信快照权限");
                assertKeys(rawPermission, ["capability", "decision", "scope", "sourceKind"], "可信快照权限");
                assertEnum(rawPermission.capability, PERMISSION_CAPABILITIES, "可信快照权限能力");
                assertEnum(rawPermission.decision, PERMISSION_DECISIONS, "可信快照权限决定");
                assertEnum(rawPermission.scope, PERMISSION_SCOPES, "可信快照权限作用域");
                if (rawPermission.sourceKind !== undefined) {
                    assertEnum(rawPermission.sourceKind, CONFIG_SOURCE_KINDS, "可信快照权限来源");
                }
            }
            if (!Array.isArray(rawAgent.integrations))
                throw new Error("可信快照集成无效。");
            for (const rawIntegration of rawAgent.integrations) {
                assertObject(rawIntegration, "可信快照集成");
                assertKeys(rawIntegration, ["kind", "identity", "enabled", "versionIdentity", "sourcePathIdentity"], "可信快照集成");
                assertEnum(rawIntegration.kind, INTEGRATION_KINDS, "可信快照集成类型");
                if (!isHmacIdentity(rawIntegration.identity))
                    throw new Error("可信快照集成身份无效。");
                if (typeof rawIntegration.enabled !== "boolean") {
                    throw new Error("可信快照集成启用状态无效。");
                }
                for (const field of ["versionIdentity", "sourcePathIdentity"]) {
                    if (rawIntegration[field] !== undefined &&
                        !isHmacIdentity(rawIntegration[field])) {
                        throw new Error("可信快照集成身份无效。");
                    }
                }
            }
            assertStringArray(rawAgent.ruleIds, "可信快照规则 ID");
            for (const ruleId of rawAgent.ruleIds) {
                assertEnum(ruleId, RULE_IDS, "可信快照规则 ID");
            }
        }
        const policies = rawSnapshot.policies ?? [];
        if (!Array.isArray(policies))
            throw new Error("可信快照策略列表无效。");
        const policyIds = new Set();
        for (const rawPolicy of policies) {
            assertObject(rawPolicy, "可信快照策略");
            assertKeys(rawPolicy, [
                "kind",
                "agentId",
                "subjectIdentity",
                "status",
                "ruleIds",
                "priority",
                "severity",
            ], "可信快照策略");
            assertEnum(rawPolicy.kind, DRIFT_POLICY_KINDS, "可信快照策略类型");
            assertEnum(rawPolicy.agentId, POLICY_AGENT_IDS, "可信快照策略 Agent");
            if (!isHmacIdentity(rawPolicy.subjectIdentity)) {
                throw new Error("可信快照策略身份无效。");
            }
            assertEnum(rawPolicy.status, DRIFT_POLICY_STATUSES, "可信快照策略状态");
            assertStringArray(rawPolicy.ruleIds, "可信快照策略规则");
            for (const ruleId of rawPolicy.ruleIds) {
                assertEnum(ruleId, RULE_IDS, "可信快照策略规则");
            }
            assertEnum(rawPolicy.priority, ["P0", "P1", "P2", "P3"], "可信快照策略优先级");
            assertEnum(rawPolicy.severity, ["critical", "high", "medium", "low", "info"], "可信快照策略严重性");
            const policyId = `${rawPolicy.kind}\0${rawPolicy.agentId}\0${rawPolicy.subjectIdentity}`;
            if (policyIds.has(policyId))
                throw new Error("可信快照包含重复策略。");
            policyIds.add(policyId);
        }
    }
    const seenEventIds = value.seenEventIds === undefined ? {} : value.seenEventIds;
    assertObject(seenEventIds, "可信快照事件历史");
    for (const [scopeId, rawIds] of Object.entries(seenEventIds)) {
        if (!/^scope-[a-f0-9]{64}$/.test(scopeId)) {
            throw new Error("可信快照事件作用域 ID 无效。");
        }
        assertStringArray(rawIds, "可信快照事件 ID");
        if (rawIds.some((entry) => !/^drift-[a-f0-9]{24}$/.test(entry))) {
            throw new Error("可信快照事件 ID 无效。");
        }
    }
    const audit = value.audit === undefined ? [] : value.audit;
    if (!Array.isArray(audit))
        throw new Error("可信快照审计无效。");
    for (const rawEntry of audit) {
        assertObject(rawEntry, "可信快照审计");
        assertKeys(rawEntry, ["at", "action", "scopeId"], "可信快照审计");
        if (typeof rawEntry.at !== "string" ||
            !Number.isFinite(Date.parse(rawEntry.at))) {
            throw new Error("可信快照审计时间无效。");
        }
        assertEnum(rawEntry.action, ["create", "replace", "remove"], "可信快照审计操作");
        if (typeof rawEntry.scopeId !== "string" ||
            !/^scope-[a-f0-9]{64}$/.test(rawEntry.scopeId)) {
            throw new Error("可信快照审计作用域无效。");
        }
    }
    return {
        schemaVersion: DRIFT_SNAPSHOT_SCHEMA_VERSION,
        scopes: value.scopes,
        observations: observations,
        seenEventIds: seenEventIds,
        audit: audit,
    };
}
export class PostureSnapshotStore {
    path;
    keyPath;
    scopeId;
    now;
    random;
    policyStates;
    constructor(options = {}) {
        this.path = options.path ?? defaultPostureSnapshotPath();
        this.keyPath =
            options.keyPath ?? join(dirname(this.path), "state-key");
        this.scopeId = options.scopeId ?? projectScopeId(options.cwd);
        if (!/^scope-[a-f0-9]{64}$/.test(this.scopeId)) {
            throw new Error("无效的可信快照项目作用域 ID。");
        }
        this.now = options.now ?? (() => new Date());
        this.random = options.random;
        this.policyStates = options.policyStates ?? (() => []);
    }
    read() {
        if (!existsSync(this.path))
            return emptyDocument();
        try {
            const directoryStatus = statSync(dirname(this.path));
            if (!directoryStatus.isDirectory()) {
                throw new Error("可信快照目录无效。");
            }
            if ((directoryStatus.mode & 0o077) !== 0) {
                throw new Error("可信快照目录权限过宽，必须为 0700。");
            }
            const status = statSync(this.path);
            if (!status.isFile()) {
                throw new Error("可信快照路径不是普通文件。");
            }
            if ((status.mode & 0o077) !== 0) {
                throw new Error("可信快照权限过宽，必须为 0600。");
            }
            const document = validateDocument(JSON.parse(readFileSync(this.path, "utf8")));
            loadOrCreatePostureIdentityKey({
                path: this.keyPath,
                allowCreate: false,
            });
            return document;
        }
        catch (error) {
            throw new Error(`无法读取可信快照 ${this.path}：${error instanceof Error ? error.message : String(error)}`);
        }
    }
    write(document) {
        const directory = dirname(this.path);
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        chmodSync(directory, 0o700);
        atomicWriteFile(this.path, JSON.stringify(document, null, 2) + "\n", 0o600);
    }
    storageRevision() {
        if (!existsSync(this.path))
            return "missing";
        return `sha256:${createHash("sha256")
            .update(readFileSync(this.path))
            .digest("hex")}`;
    }
    snapshotFingerprint(snapshot) {
        return `sha256:${createHash("sha256")
            .update(JSON.stringify({
            schemaVersion: snapshot.schemaVersion,
            agents: snapshot.agents,
        }), "utf8")
            .digest("hex")}`;
    }
    buildSnapshot(states, key) {
        const capturedAt = this.now();
        return buildDriftSnapshot(states, key, capturedAt, this.policyStates(capturedAt));
    }
    withMutationLock(operation) {
        const directory = dirname(this.path);
        if (existsSync(directory)) {
            const status = statSync(directory);
            if (!status.isDirectory()) {
                throw new Error("可信快照目录无效。");
            }
            if ((status.mode & 0o077) !== 0) {
                throw new Error("可信快照目录权限过宽，必须为 0700。");
            }
        }
        else {
            mkdirSync(directory, { recursive: true, mode: 0o700 });
            chmodSync(directory, 0o700);
        }
        const lockPath = `${this.path}.lock`;
        try {
            atomicCreateFile(lockPath, "agentreveal-posture-lock-v1\n", 0o600);
        }
        catch (error) {
            if (error.code === "EEXIST") {
                throw new Error("可信快照正在被另一个进程修改，请稍后重试。");
            }
            throw error;
        }
        try {
            return operation();
        }
        finally {
            try {
                unlinkSync(lockPath);
            }
            catch {
                // 主操作结果优先；下次并发检查会明确暴露残留锁。
            }
        }
    }
    previewBaseline(states) {
        const document = this.read();
        const key = loadOrCreatePostureIdentityKey({
            path: this.keyPath,
            allowCreate: true,
            ...(this.random ? { random: this.random } : {}),
        });
        const snapshot = this.buildSnapshot(states, key);
        const previous = document.scopes[this.scopeId];
        return {
            mutation: previous ? "replace" : "create",
            currentFingerprint: this.snapshotFingerprint(snapshot),
            storageRevision: this.storageRevision(),
            ...(previous ? { previousCapturedAt: previous.capturedAt } : {}),
            agentCount: snapshot.agents.length,
            savedCategories: [
                "Agent 与版本",
                "配置来源枚举与字段名",
                "Provider、模型、端点和路径的本机 HMAC 身份",
                "认证来源与稳定冲突代码",
                "权限能力",
                "MCP、Skill、Hook 的本机 HMAC 身份",
                "已登记规则 ID",
                "接受与项目忽略策略的本机 HMAC 身份、状态和规则 ID",
            ],
            excludesSensitiveContent: true,
        };
    }
    getBaseline() {
        return this.read().scopes[this.scopeId];
    }
    saveBaseline(states, options = {}) {
        return this.withMutationLock(() => {
            const revision = this.storageRevision();
            if (options.expectedStorageRevision &&
                options.expectedStorageRevision !== revision) {
                throw new Error("可信快照文件在确认后发生变化，已拒绝覆盖。");
            }
            const documentExists = existsSync(this.path);
            const document = this.read();
            const key = loadOrCreatePostureIdentityKey({
                path: this.keyPath,
                allowCreate: !documentExists,
                ...(this.random ? { random: this.random } : {}),
            });
            const snapshot = this.buildSnapshot(states, key);
            if (options.expectedCurrentFingerprint &&
                options.expectedCurrentFingerprint !==
                    this.snapshotFingerprint(snapshot)) {
                throw new Error("当前有效状态在确认后发生变化，已拒绝保存可信状态。");
            }
            const action = document.scopes[this.scopeId] ? "replace" : "create";
            document.scopes[this.scopeId] = snapshot;
            delete document.observations[this.scopeId];
            delete document.seenEventIds[this.scopeId];
            document.audit.push({
                at: this.now().toISOString(),
                action,
                scopeId: this.scopeId,
            });
            if (this.storageRevision() !== revision) {
                throw new Error("可信快照文件在写入前发生并发变化，已拒绝覆盖。");
            }
            this.write(document);
            return snapshot;
        });
    }
    saveBaselineConfirmed(states, preview) {
        const hadBaseline = Boolean(this.getBaseline());
        const snapshot = this.saveBaseline(states, {
            expectedCurrentFingerprint: preview.currentFingerprint,
            expectedStorageRevision: preview.storageRevision,
        });
        return {
            mutation: hadBaseline ? "replace" : "create",
            changed: true,
            capturedAt: snapshot.capturedAt,
            agentCount: snapshot.agents.length,
            storageRevision: this.storageRevision(),
        };
    }
    compare(states, options = {}) {
        const run = () => {
            const document = this.read();
            const baseline = document.scopes[this.scopeId];
            if (!baseline) {
                return {
                    status: "no-baseline",
                    currentCapturedAt: this.now().toISOString(),
                    events: [],
                    activeEventCount: 0,
                    resolvedEventCount: 0,
                };
            }
            const key = loadOrCreatePostureIdentityKey({
                path: this.keyPath,
                allowCreate: false,
            });
            const current = this.buildSnapshot(states, key);
            const details = compareDriftSnapshots(baseline, current, {
                ...(document.observations[this.scopeId]
                    ? { previousObservation: document.observations[this.scopeId] }
                    : {}),
                seenEventIds: document.seenEventIds[this.scopeId] ?? [],
            });
            if (options.recordObservation) {
                document.observations[this.scopeId] = current;
                document.seenEventIds[this.scopeId] = details.seenEventIds;
                this.write(document);
            }
            return details.comparison;
        };
        return options.recordObservation ? this.withMutationLock(run) : run();
    }
    removeBaseline(options = {}) {
        return this.withMutationLock(() => {
            const revision = this.storageRevision();
            if (options.expectedStorageRevision &&
                options.expectedStorageRevision !== revision) {
                throw new Error("可信快照文件在确认后发生变化，已拒绝删除。");
            }
            const document = this.read();
            if (!document.scopes[this.scopeId])
                return false;
            delete document.scopes[this.scopeId];
            delete document.observations[this.scopeId];
            delete document.seenEventIds[this.scopeId];
            document.audit.push({
                at: this.now().toISOString(),
                action: "remove",
                scopeId: this.scopeId,
            });
            if (this.storageRevision() !== revision) {
                throw new Error("可信快照文件在删除前发生并发变化，已拒绝覆盖。");
            }
            this.write(document);
            return true;
        });
    }
    removeBaselineConfirmed(storageRevision) {
        const changed = this.removeBaseline({
            expectedStorageRevision: storageRevision,
        });
        return {
            mutation: "remove",
            changed,
            agentCount: 0,
            storageRevision: this.storageRevision(),
        };
    }
}
//# sourceMappingURL=snapshot.js.map