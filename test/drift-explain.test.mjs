/**
 * Drift 对比解释卡：从 DriftEvent 派生可读分类标签。
 * 覆盖 15 种 DriftEventKind × 4 种 DriftChangeKind 组合的稳定映射。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  DRIFT_CARD_CLASSES,
  buildDriftCard,
  cardGuidance,
  cardLabel,
  classifyDriftEvent,
  previousVsCurrent,
  sortByCardPriority,
} from "../dist/core/posture/drift-explain.js";

const ALL_KINDS = [
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

const ALL_CHANGES = ["added", "removed", "changed", "reappeared"];

function makeEvent({ kind, change, severity = "medium", priority = "P1", previousCategory }) {
  return {
    eventId: `drift-${kind}-${change}`,
    agentId: "claude-code",
    kind,
    change,
    priority,
    severity,
    currentSummary: `${kind}/${change} 测试摘要`,
    ...(previousCategory ? { previousCategory } : {}),
    action: ["确认来源与权限"],
    verification: ["复扫并确认"],
  };
}

test("classifyDriftEvent: agent-lifecycle kind 一律归类为 agent-lifecycle", () => {
  for (const change of ALL_CHANGES) {
    assert.equal(
      classifyDriftEvent(makeEvent({ kind: "agent-added", change })),
      "agent-lifecycle"
    );
    assert.equal(
      classifyDriftEvent(makeEvent({ kind: "agent-removed", change })),
      "agent-lifecycle"
    );
  }
});

test("classifyDriftEvent: agent-version-changed 一律归类为 agent-version", () => {
  for (const change of ALL_CHANGES) {
    assert.equal(
      classifyDriftEvent(makeEvent({ kind: "agent-version-changed", change })),
      "agent-version"
    );
  }
});

test("classifyDriftEvent: 策略到期 → policy-expired", () => {
  assert.equal(
    classifyDriftEvent(makeEvent({ kind: "acceptance-expired", change: "removed" })),
    "policy-expired"
  );
  assert.equal(
    classifyDriftEvent(makeEvent({ kind: "ignore-expired", change: "removed" })),
    "policy-expired"
  );
});

test("classifyDriftEvent: risk-* 一律按 change 映射", () => {
  assert.equal(
    classifyDriftEvent(makeEvent({ kind: "risk-added", change: "added" })),
    "new-coverage"
  );
  assert.equal(
    classifyDriftEvent(makeEvent({ kind: "risk-resolved", change: "removed" })),
    "lost-coverage"
  );
  assert.equal(
    classifyDriftEvent(makeEvent({ kind: "risk-reappeared", change: "reappeared" })),
    "regression"
  );
});

test("classifyDriftEvent: auth-source-changed 一律归类为 conflict", () => {
  for (const change of ALL_CHANGES) {
    assert.equal(
      classifyDriftEvent(makeEvent({ kind: "auth-source-changed", change })),
      "conflict"
    );
  }
});

test("classifyDriftEvent: provider-route-changed + severity=high → conflict；否则按 change", () => {
  assert.equal(
    classifyDriftEvent(
      makeEvent({ kind: "provider-route-changed", change: "changed", severity: "high" })
    ),
    "conflict"
  );
  assert.equal(
    classifyDriftEvent(
      makeEvent({ kind: "provider-route-changed", change: "added", severity: "medium" })
    ),
    "new-coverage"
  );
  assert.equal(
    classifyDriftEvent(
      makeEvent({ kind: "provider-route-changed", change: "removed", severity: "low" })
    ),
    "lost-coverage"
  );
});

test("classifyDriftEvent: permission-changed 按 severity 映射", () => {
  assert.equal(
    classifyDriftEvent(
      makeEvent({ kind: "permission-changed", change: "changed", severity: "high" })
    ),
    "expansion"
  );
  assert.equal(
    classifyDriftEvent(
      makeEvent({ kind: "permission-changed", change: "changed", severity: "low" })
    ),
    "contraction"
  );
  assert.equal(
    classifyDriftEvent(
      makeEvent({ kind: "permission-changed", change: "changed", severity: "medium" })
    ),
    "changed-coverage"
  );
});

test("classifyDriftEvent: integration-* 按 change 映射", () => {
  assert.equal(
    classifyDriftEvent(makeEvent({ kind: "integration-added", change: "added" })),
    "new-coverage"
  );
  assert.equal(
    classifyDriftEvent(makeEvent({ kind: "integration-removed", change: "removed" })),
    "lost-coverage"
  );
  assert.equal(
    classifyDriftEvent(makeEvent({ kind: "integration-changed", change: "changed" })),
    "changed-coverage"
  );
});

test("classifyDriftEvent: config-source-changed + previousCategory=conflicting → conflict", () => {
  assert.equal(
    classifyDriftEvent(
      makeEvent({
        kind: "config-source-changed",
        change: "changed",
        severity: "medium",
        previousCategory: "user[conflicting]",
      })
    ),
    "conflict"
  );
  assert.equal(
    classifyDriftEvent(
      makeEvent({
        kind: "config-source-changed",
        change: "changed",
        severity: "medium",
        previousCategory: "environment",
      })
    ),
    "changed-coverage"
  );
});

test("classifyDriftEvent: 全 60 种组合均能归类（不抛错且结果在白名单内）", () => {
  for (const kind of ALL_KINDS) {
    for (const change of ALL_CHANGES) {
      const cls = classifyDriftEvent(makeEvent({ kind, change }));
      assert.ok(
        DRIFT_CARD_CLASSES.includes(cls),
        `${kind}/${change} 归类为 ${cls}，不在白名单`
      );
    }
  }
});

test("cardLabel/cardGuidance: 每种分类都有非空中文标签与解释", () => {
  for (const cls of DRIFT_CARD_CLASSES) {
    const label = cardLabel(cls);
    const guidance = cardGuidance(cls);
    assert.ok(label.length > 0, `分类 ${cls} 标签为空`);
    assert.ok(guidance.length > 0, `分类 ${cls} 解释为空`);
  }
});

test("buildDriftCard: 包含 cls/label/guidance 三件套", () => {
  const card = buildDriftEvent(
    makeEvent({ kind: "auth-source-changed", change: "changed" })
  );
  assert.equal(card.cls, "conflict");
  assert.equal(card.label, "冲突");
  assert.ok(card.guidance.includes("认证") || card.guidance.includes("多来源"));
});

function buildDriftEvent(event) {
  return buildDriftCard(event);
}

test("previousVsCurrent: 无 previousCategory 时返回 undefined", () => {
  const e = makeEvent({ kind: "auth-source-changed", change: "changed" });
  assert.equal(previousVsCurrent(e), undefined);
});

test("previousVsCurrent: 有 previousCategory 时返回 '上次：...' 文本", () => {
  const e = makeEvent({
    kind: "config-source-changed",
    change: "changed",
    previousCategory: "environment",
  });
  const text = previousVsCurrent(e);
  assert.ok(text.startsWith("上次："));
  assert.ok(text.includes("environment"));
});

test("sortByCardPriority: conflict/regression/expansion 排在前三", () => {
  const events = [
    makeEvent({ kind: "integration-added", change: "added", severity: "medium" }),
    makeEvent({ kind: "auth-source-changed", change: "changed", severity: "high", priority: "P1" }),
    makeEvent({ kind: "risk-reappeared", change: "reappeared", severity: "high", priority: "P0" }),
    makeEvent({ kind: "permission-changed", change: "changed", severity: "high" }),
  ];
  const sorted = sortByCardPriority(events);
  assert.equal(sorted[0].card.cls, "conflict");
  assert.equal(sorted[1].card.cls, "regression");
  assert.equal(sorted[2].card.cls, "expansion");
});
