import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  addProviderTrust,
  listProviderTrust,
  normalizeProviderEndpoint,
  removeProviderTrust,
} from "../dist/core/config/trust.js";

function withProject(fn) {
  const root = mkdtempSync(join(tmpdir(), "agentguard-trust-"));
  const cwd = join(root, "project");
  mkdirSync(cwd);
  try {
    return fn(cwd);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("provider trust: URL、端口和通配符规范化为可审计 host", () => {
  assert.equal(normalizeProviderEndpoint("https://Relay.Example.com:8443/v1"), "relay.example.com");
  assert.equal(normalizeProviderEndpoint("*.Corp.Example.com"), "*.corp.example.com");
  assert.throws(() => normalizeProviderEndpoint("relay"), /有效 URL/);
  assert.throws(() => normalizeProviderEndpoint("1relay"), /有效 URL/);
  assert.throws(() => normalizeProviderEndpoint("*.127.0.0.1"), /通配符信任/);
  assert.throws(() => normalizeProviderEndpoint("https://user:password@localhost"), /有效 URL/);
});

test("provider trust: add/list/remove 保留未知配置和追加式审计", () => {
  withProject((cwd) => {
    const configPath = join(cwd, ".agentguard.json");
    writeFileSync(
      configPath,
      JSON.stringify({ featureFlag: true, providers: { other: "keep" } })
    );
    const added = addProviderTrust({
      cwd,
      endpoint: "https://relay.example.com/v1",
      kind: "trusted",
      reason: "个人维护的隔离中转站",
      now: new Date("2026-07-17T00:00:00.000Z"),
    });
    assert.deepEqual(added.entries, [
      { endpoint: "relay.example.com", kind: "trusted" },
    ]);
    assert.equal(added.audit[0].action, "add");
    assert.throws(
      () =>
        addProviderTrust({
          cwd,
          endpoint: "relay.example.com",
          kind: "trusted",
          reason: "重复",
        }),
      /已处于 trusted/
    );

    const removed = removeProviderTrust({
      cwd,
      endpoint: "relay.example.com",
      kind: "trusted",
      reason: "服务已下线",
      now: new Date("2026-07-18T00:00:00.000Z"),
    });
    assert.deepEqual(removed.entries, []);
    assert.deepEqual(removed.audit.map((event) => event.action), ["add", "remove"]);
    const raw = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(raw.featureFlag, true);
    assert.equal(raw.providers.other, "keep");
    assert.deepEqual(listProviderTrust(cwd).entries, []);
  });
});

test("provider trust: 损坏配置绝不覆盖", () => {
  withProject((cwd) => {
    const path = join(cwd, ".agentguard.json");
    writeFileSync(path, "{broken");
    assert.throws(
      () =>
        addProviderTrust({
          cwd,
          endpoint: "relay.example.com",
          kind: "trusted",
          reason: "测试",
        }),
      /无法安全更新/
    );
    assert.equal(readFileSync(path, "utf8"), "{broken");
  });
});

test("provider trust: 损坏审计和冲突策略绝不被静默改写", () => {
  withProject((cwd) => {
    const path = join(cwd, ".agentguard.json");
    const invalidAudit = JSON.stringify({
      providerTrustAudit: [{ action: "add", endpoint: "relay.example.com" }],
    });
    writeFileSync(path, invalidAudit);
    assert.throws(() => listProviderTrust(cwd), /providerTrustAudit\[0\]/);
    assert.throws(
      () =>
        addProviderTrust({
          cwd,
          endpoint: "other.example.com",
          kind: "trusted",
          reason: "测试",
        }),
      /providerTrustAudit\[0\]/
    );
    assert.equal(readFileSync(path, "utf8"), invalidAudit);

    const conflict = JSON.stringify({
      providers: {
        trusted: ["relay.example.com"],
        internal: ["relay.example.com"],
      },
    });
    writeFileSync(path, conflict);
    assert.throws(() => listProviderTrust(cwd), /不能同时标记/);
    assert.equal(readFileSync(path, "utf8"), conflict);
  });
});
