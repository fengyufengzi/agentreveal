import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildActionPlan,
  buildActionTasks,
} from "../dist/core/action/index.js";
import { verifyRiskTask } from "../dist/core/verification/index.js";
import { TaskSnapshotStore } from "../dist/core/verification/snapshot.js";

function tasksFor(findings) {
  const result = {
    agent: "cc-switch",
    displayName: "CC Switch",
    discovery: { agent: "cc-switch", displayName: "CC Switch", configFound: true },
    findings,
  };
  return buildActionTasks(
    buildActionPlan({ results: [result], allFindings: findings, correlations: [] })
  );
}

const evidence = {
  appType: "claude",
  provider: "private-relay",
  baseUrl: "http://internal.example/v1",
};

function fullTask() {
  return tasksFor([
    {
      id: "CCSWITCH_UNKNOWN_BASE_URL",
      category: "provider",
      severity: "high",
      title: "动态内部端点名称",
      evidence,
    },
    {
      id: "CCSWITCH_INSECURE_HTTP",
      category: "provider",
      severity: "medium",
      title: "明文 HTTP",
      evidence,
    },
  ])[0];
}

function snapshotOf(task) {
  return {
    taskId: task.taskId,
    family: task.family,
    source: task.source,
    agent: task.agent,
    rules: task.requirements.map((requirement) => ({
      ruleId: requirement.ruleId,
      priority: requirement.priority,
      severity: requirement.severity,
      disposition: requirement.disposition,
      fixMode: requirement.fixMode,
    })),
  };
}

test("verify: 区分仍存在、部分缓解和已解决", () => {
  const original = fullTask();
  const previous = snapshotOf(original);

  const present = verifyRiskTask({
    taskId: original.taskId,
    currentTasks: [original],
    previous,
  });
  assert.equal(present.status, "present");
  assert.equal(present.remainingRuleIds.length, 2);

  const mitigatedTask = tasksFor([
    {
      id: "CCSWITCH_UNKNOWN_BASE_URL",
      category: "provider",
      severity: "high",
      title: "仍需审核",
      evidence,
    },
  ])[0];
  assert.equal(mitigatedTask.taskId, original.taskId);
  const mitigated = verifyRiskTask({
    taskId: original.taskId,
    currentTasks: [mitigatedTask],
    previous,
  });
  assert.equal(mitigated.status, "mitigated");
  assert.deepEqual(mitigated.disappearedRuleIds, ["CCSWITCH_INSECURE_HTTP"]);

  const resolved = verifyRiskTask({
    taskId: original.taskId,
    currentTasks: [],
    previous,
  });
  assert.equal(resolved.status, "resolved");

  const unknown = verifyRiskTask({
    taskId: original.taskId,
    currentTasks: [],
  });
  assert.equal(unknown.status, "unknown");
});

test("verify: 识别身份变化以及接受、过期、撤销状态", () => {
  const original = fullTask();
  const previous = snapshotOf(original);
  const changed = tasksFor([
    {
      id: "CCSWITCH_UNKNOWN_BASE_URL",
      category: "provider",
      severity: "high",
      title: "另一实例",
      evidence: { ...evidence, baseUrl: "https://changed.example/v1" },
    },
  ])[0];
  assert.notEqual(changed.taskId, original.taskId);
  const identityChanged = verifyRiskTask({
    taskId: original.taskId,
    currentTasks: [changed],
    previous,
  });
  assert.equal(identityChanged.status, "identity-changed");
  assert.deepEqual(identityChanged.relatedTaskIds, [changed.taskId]);

  for (const status of ["active", "expired", "revoked"]) {
    const acceptance = {
      taskId: original.taskId,
      scopeId: `scope-${"a".repeat(64)}`,
      reason: "测试",
      createdAt: "2026-07-15T00:00:00.000Z",
      task: {
        taskId: original.taskId,
        family: original.family,
        source: original.source,
        agent: original.agent,
        displayName: original.displayName,
        disposition: original.disposition,
        priority: original.priority,
        severity: original.severity,
        ruleIds: original.requirements.map((requirement) => requirement.ruleId),
        titles: [],
      },
      status,
    };
    const result = verifyRiskTask({
      taskId: original.taskId,
      currentTasks: [original],
      previous,
      acceptance,
    });
    assert.equal(
      result.status,
      status === "active" ? "accepted" : status
    );
  }
});

test("任务快照: 按项目隔离、0600 写入且不保存路径、标题、evidence 或端点", () => {
  const root = mkdtempSync(join(tmpdir(), "agentguard-snapshot-"));
  try {
    const projectA = join(root, "project-a");
    const projectB = join(root, "project-b");
    const path = join(root, "state", "task-snapshots.json");
    mkdirSync(projectA);
    mkdirSync(projectB);
    const task = fullTask();
    const storeA = new TaskSnapshotStore({ path, cwd: projectA });
    const storeB = new TaskSnapshotStore({ path, cwd: projectB });
    storeA.capture([task]);

    assert.ok(storeA.get(task.taskId));
    assert.equal(storeB.get(task.taskId), undefined);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    const text = readFileSync(path, "utf8");
    assert.doesNotMatch(text, /project-a|private-relay|internal\.example|动态内部端点名称|evidence/);
    assert.match(text, /CCSWITCH_UNKNOWN_BASE_URL/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
