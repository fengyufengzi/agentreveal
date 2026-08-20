/**
 * 当前项目敏感文件扫描测试。
 * 从 dist/ 导入。运行前需 npm run build。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSensitiveFiles } from "../dist/core/sensitive/index.js";

function withTempProject(fn) {
  const dir = mkdtempSync(join(tmpdir(), "agentreveal-sensitive-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("sensitive: 只按文件名发现风险，不读取或泄露文件内容", () => {
  withTempProject((dir) => {
    const secret = "sk-live-DO-NOT-LEAK";
    writeFileSync(join(dir, ".env"), `OPENAI_API_KEY=${secret}`);
    writeFileSync(join(dir, ".env.example"), "OPENAI_API_KEY=example");

    const findings = scanSensitiveFiles(dir);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, "PROJECT_SENSITIVE_FILE");
    assert.equal(findings[0].category, "sensitive");
    assert.equal(findings[0].severity, "high");
    assert.equal(findings[0].evidence.path, ".env");
    assert.ok(!JSON.stringify(findings).includes(secret));
  });
});

test("sensitive: 跳过 node_modules 并识别云凭证/kubeconfig", () => {
  withTempProject((dir) => {
    mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
    mkdirSync(join(dir, ".kube"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "pkg", ".env"), "SECRET=x");
    writeFileSync(join(dir, "service-account.json"), "{}");
    writeFileSync(join(dir, ".kube", "config"), "clusters: []");

    const findings = scanSensitiveFiles(dir);
    const paths = findings.map((f) => f.evidence.path).sort();
    assert.deepEqual(paths, [".kube/config", "service-account.json"]);
  });
});
