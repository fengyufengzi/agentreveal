import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACTION_MATRIX,
  getRuleAction,
} from "../dist/rules/action-matrix.js";
import { RULE_IDS } from "../dist/rules/ids.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && path.endsWith(".ts") ? [path] : [];
  });
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function enumerateFindingIds() {
  const ids = [];
  for (const path of sourceFiles(join(repoRoot, "src"))) {
    const source = stripComments(readFileSync(path, "utf8"));
    for (const match of source.matchAll(/\bid\s*:\s*["']([A-Z][A-Z0-9_]+)["']/g)) {
      ids.push({ id: match[1], path: relative(repoRoot, path) });
    }
  }
  return ids;
}

test("action matrix: 源码具体规则、RuleId 与矩阵严格一一对应", () => {
  const enumerated = enumerateFindingIds();
  assert.ok(
    enumerated.some(({ id }) => id === "DEEPSCAN_FAILED"),
    "源码枚举应看见框架兜底 DEEPSCAN_FAILED"
  );

  const concreteSourceIds = [
    ...new Set(
      enumerated
        .map(({ id }) => id)
        .filter((id) => id !== "DEEPSCAN_FAILED")
    ),
  ].sort();
  const declaredIds = [...RULE_IDS].sort();
  const matrixIds = Object.keys(ACTION_MATRIX).sort();

  assert.equal(concreteSourceIds.length, 63);
  assert.equal(declaredIds.length, 63);
  assert.equal(matrixIds.length, 63);
  assert.deepEqual(declaredIds, concreteSourceIds);
  assert.deepEqual(matrixIds, declaredIds);
  assert.equal(RULE_IDS.includes("DEEPSCAN_FAILED"), false);
  assert.equal("DEEPSCAN_FAILED" in ACTION_MATRIX, false);
});

test("action matrix: 每项都包含可展示、可验证的行动信息", () => {
  for (const id of RULE_IDS) {
    const item = ACTION_MATRIX[id];
    assert.ok(item.rationale.trim(), `${id} rationale`);
    assert.ok(item.nextSteps.length > 0, `${id} nextSteps`);
    assert.ok(item.nextSteps.every((step) => step.trim()), `${id} nextSteps text`);
    assert.ok(item.verification.length > 0, `${id} verification`);
    assert.ok(
      item.verification.every((step) => step.trim()),
      `${id} verification text`
    );
    assert.ok(item.group.family.trim(), `${id} group.family`);
    assert.equal(new Set(item.group.evidenceKeys).size, item.group.evidenceKeys.length);
    assert.equal(getRuleAction(id), item);
  }
  assert.equal(getRuleAction("NOT_A_RULE"), undefined);
});

test("action matrix: 10 个 baseline 规则与实际 profile 效果准确映射", () => {
  const expected = {
    CLAUDE_BYPASS_PERMISSIONS: { safe: "resolve", balanced: "resolve" },
    CLAUDE_DANGEROUS_ALLOW: { safe: "resolve", balanced: "resolve" },
    CLAUDE_ENABLE_ALL_PROJECT_MCP: { safe: "resolve", balanced: "resolve" },
    GEMINI_MCP_TRUST_BYPASS: { safe: "resolve", balanced: "resolve" },
    OPENCODE_AUTOUPDATE_ON: { safe: "resolve", balanced: "resolve" },
    OPENCODE_BASH_UNRESTRICTED: { safe: "resolve", balanced: "resolve" },
    OPENCODE_PERMISSION_WILDCARD: { safe: "resolve", balanced: "mitigate" },
    OPENCODE_SHARE_AUTO: { safe: "resolve", balanced: "resolve" },
    OPENCLAW_GATEWAY_EXPOSED_BIND: { safe: "resolve", balanced: "resolve" },
    OPENCLAW_TAILSCALE_EXPOSURE: { safe: "resolve", balanced: "resolve" },
  };

  const actual = Object.fromEntries(
    Object.entries(ACTION_MATRIX)
      .filter(([, item]) => item.fixMode === "baseline")
      .map(([id, item]) => [id, item.baselineProfiles])
  );

  assert.deepEqual(actual, expected);
  assert.deepEqual(ACTION_MATRIX.OPENCODE_PERMISSION_WILDCARD.baselineProfiles, {
    safe: "resolve",
    balanced: "mitigate",
  });
});

test("action matrix: 可读文档完整列出 63 条规则", () => {
  const doc = readFileSync(
    join(repoRoot, "docs", "rule-disposition-matrix.md"),
    "utf8"
  );
  const documented = [
    ...doc.matchAll(/^\| `([A-Z][A-Z0-9_]+)` \|/gm),
  ].map((match) => match[1]);

  assert.equal(documented.length, 63);
  assert.deepEqual([...documented].sort(), [...RULE_IDS].sort());
});
