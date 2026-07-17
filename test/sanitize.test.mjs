import assert from 'node:assert/strict';
import test from 'node:test';

import { isLikelyPlaceholder, scanText } from '../scripts/sanitize.mjs';

test('sanitize: 检出组织身份、未批准邮箱、本机路径和真实形态凭证', () => {
  const content = [
    ['平安', '科技'].join(''),
    ['centos', '.hk'].join(''),
    ['employee', '@', 'corp.example'].join(''),
    ['/Users', '/alice', '/project'].join(''),
    ['ghp', '_', 'a'.repeat(36)].join(''),
    ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
  ].join('\n');

  const ids = new Set(scanText('fixture.txt', content).map((finding) => finding.ruleId));
  assert.deepEqual(
    ids,
    new Set([
      'ORGANIZATION_IDENTITY',
      'PRIVATE_PROJECT_IDENTITY',
      'UNAPPROVED_EMAIL',
      'LOCAL_HOME_PATH',
      'GITHUB_TOKEN',
      'PRIVATE_KEY',
    ]),
  );
});

test('sanitize: 允许公开邮箱、示例路径和明显测试凭证', () => {
  const content = [
    'wangmarsen@gmail.com',
    'i@izs.me',
    ['/Users', '/me', '/project'].join(''),
    ['sk-ant-', 'SUPERSECRET-', 'A'.repeat(20)].join(''),
    'api_key: "sk-xxx-your-key-redacted"',
  ].join('\n');

  assert.deepEqual(scanText('fixture.txt', content), []);
});

test('sanitize: finding 不回显匹配到的敏感内容', () => {
  const secret = ['ghp', '_', 'b'.repeat(36)].join('');
  const findings = scanText('fixture.txt', secret);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'GITHUB_TOKEN');
  assert.equal(JSON.stringify(findings).includes(secret), false);
  assert.equal(findings[0].matchLength, secret.length);
});

test('sanitize: placeholder 判断覆盖文档与测试常用占位值', () => {
  assert.equal(isLikelyPlaceholder('sk-xxx-your-key-redacted'), true);
  assert.equal(isLikelyPlaceholder('${OPENAI_API_KEY}'), true);
  assert.equal(isLikelyPlaceholder('actual-looking-random-9f7Q2mK4zP8'), false);
});
