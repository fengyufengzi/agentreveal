#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_PRINTED_FINDINGS = 100;

export const allowedEmails = new Set([
  'wangmarsen@gmail.com',
  'i@izs.me',
  'noreply@users.noreply.github.com',
  'noreply@anthropic.com',
]);

const allowedHomeNames = new Set([
  'example',
  'me',
  'runner',
  'test',
  'u',
  'user',
  'username',
]);

const textExtensions = new Set([
  '', '.md', '.txt', '.json', '.jsonc', '.js', '.mjs', '.cjs', '.ts', '.tsx',
  '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.html', '.css', '.xml',
  '.sh', '.zsh', '.bash', '.ps1', '.gitignore', '.npmrc', '.lock', '.map',
]);

const organizationTerms = [
  ['平安', '科技'].join(''),
  ['平安', '集团'].join(''),
  ['中国', '平安'].join(''),
];

const privateProjectTerms = [
  ['centos', '.hk'].join(''),
  ['kedaya', '.xyz'].join(''),
  ['131.186', '.31.23'].join(''),
  ['tian', 'li'].join(''),
];

const placeholderMarkers = [
  'acceptance-secret', 'changeme', 'demo', 'do-not-leak', 'dummy', 'example', 'fake', 'fixture',
  'placeholder', 'plaintext', 'plaintoken', 'raw-secret', 'redact', 'sample',
  'secret-value', 'should-not-leak', 'supersecret', 'test-token', 'your-key', 'xxx',
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isLikelyPlaceholder(value) {
  const normalized = value.toLowerCase();
  if (placeholderMarkers.some((marker) => normalized.includes(marker))) return true;
  if (/^(?:x+|\*+|a+|0+|1+|redacted)$/i.test(value.replace(/[-_]/g, ''))) return true;
  if (value.includes('${') || value.includes('{env:') || value.includes('<')) return true;
  return false;
}

const rules = [
  {
    id: 'ORGANIZATION_IDENTITY',
    description: '发现不应公开的组织名称或品牌关键字',
    pattern: new RegExp(`(?:${organizationTerms.map(escapeRegExp).join('|')}|PING\\s*AN)`, 'giu'),
  },
  {
    id: 'PRIVATE_PROJECT_IDENTITY',
    description: '发现不应公开的个人域名或本机 profile 标识',
    pattern: new RegExp(`(?:${privateProjectTerms.map(escapeRegExp).join('|')})`, 'giu'),
  },
  {
    id: 'UNAPPROVED_EMAIL',
    description: '发现未在公开身份白名单中的邮箱地址',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
    allow: (match) => allowedEmails.has(match[0].toLowerCase()),
  },
  {
    id: 'PRIVATE_KEY',
    description: '发现私钥 PEM 头',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu,
  },
  {
    id: 'AWS_ACCESS_KEY',
    description: '发现疑似 AWS Access Key ID',
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu,
    allow: (match) => isLikelyPlaceholder(match[0]),
  },
  {
    id: 'GITHUB_TOKEN',
    description: '发现疑似 GitHub 访问令牌',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,255}\b/gu,
    allow: (match) => isLikelyPlaceholder(match[0]),
  },
  {
    id: 'AI_PROVIDER_TOKEN',
    description: '发现疑似 AI Provider API Key',
    pattern: /\b(?:sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,})\b/gu,
    allow: (match) => isLikelyPlaceholder(match[0]),
  },
  {
    id: 'SLACK_TOKEN',
    description: '发现疑似 Slack Token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/gu,
    allow: (match) => isLikelyPlaceholder(match[0]),
  },
  {
    id: 'GENERIC_SECRET_ASSIGNMENT',
    description: '发现疑似写入源码或文档的凭证值',
    pattern: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password)\b\s*[:=]\s*["']([^"'\r\n]{12,})["']/giu,
    allow: (match) => isLikelyPlaceholder(match[1]),
  },
  {
    id: 'LOCAL_HOME_PATH',
    description: '发现可能暴露本机用户名的绝对用户目录',
    pattern: /(?:\/Users\/([^/\s"']+)|\/home\/([^/\s"']+)|[A-Za-z]:\\Users\\([^\\\s"']+))/gu,
    allow: (match) => {
      const homeName = (match[1] ?? match[2] ?? match[3] ?? '').toLowerCase();
      return allowedHomeNames.has(homeName) || /[<>{}$%]/u.test(homeName);
    },
  },
];

const forbiddenArtifactRules = [
  {
    id: 'TRACKED_ENV_FILE',
    description: '发现不应由 Git 或发布包跟踪的环境变量文件',
    pattern: /(?:^|\/)\.env(?:$|\.)/iu,
    allow: (file) => /(?:^|\/)\.env\.(?:example|sample|template)$/iu.test(file),
  },
  {
    id: 'TRACKED_KEY_OR_CERTIFICATE',
    description: '发现不应由 Git 或发布包跟踪的私钥或证书文件',
    pattern: /\.(?:cer|crt|key|p12|pem|pfx)$/iu,
  },
  {
    id: 'TRACKED_DEBUG_LOG',
    description: '发现不应由 Git 或发布包跟踪的调试日志',
    pattern: /(?:^|\/)(?:.*\.log|npm-debug\.log.*|yarn-(?:debug|error)\.log.*|pnpm-debug\.log.*)$/iu,
  },
  {
    id: 'TRACKED_BACKUP',
    description: '发现不应由 Git 或发布包跟踪的配置备份',
    pattern: /^(?:backups?)(?:\/|$)|(?:^|\/)\.agentguard\/backups(?:\/|$)|\.(?:bak|backup)$/iu,
  },
  {
    id: 'TRACKED_LOCAL_REPORT',
    description: '发现不应由 Git 或发布包跟踪的本机扫描或诊断报告',
    pattern: /(?:^|\/)reports\/|(?:^|\/)agentguard-(?:report|diagnostics?)(?:[-.][^/]*)?\.(?:html|json|txt)$/iu,
  },
  {
    id: 'TRACKED_RELEASE_ARCHIVE',
    description: '发现不应直接进入 Git 或 npm 包清单的本机构建资产',
    pattern: /\.(?:dmg|tgz)$/iu,
  },
];

function repositoryRoot(cwd = process.cwd()) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

export function trackedFiles(root = repositoryRoot()) {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
  });
  return output.split('\0').filter(Boolean);
}

export function stagedFiles(root = repositoryRoot()) {
  const output = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
    { cwd: root, encoding: 'utf8' },
  );
  return output.split('\0').filter(Boolean);
}

export function packageFiles(root = repositoryRoot()) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit' });
  const output = execFileSync(
    npm,
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  const manifest = JSON.parse(output);
  if (!Array.isArray(manifest) || !Array.isArray(manifest[0]?.files)) {
    throw new Error('npm pack 未返回可识别的文件清单');
  }
  return manifest[0].files.map((entry) => entry.path);
}

function isTextFile(file) {
  return textExtensions.has(extname(file).toLowerCase());
}

export function scanForbiddenArtifactPaths(files) {
  const findings = [];
  for (const file of files) {
    for (const rule of forbiddenArtifactRules) {
      if (!rule.pattern.test(file) || rule.allow?.(file)) continue;
      findings.push({
        ruleId: rule.id,
        description: rule.description,
        source: file,
        line: 1,
        column: 1,
        matchLength: 0,
      });
    }
  }
  return findings;
}

function lineAndColumn(content, offset) {
  const before = content.slice(0, offset);
  const line = before.split('\n').length;
  const lastNewline = before.lastIndexOf('\n');
  return { line, column: offset - lastNewline };
}

export function scanText(source, content) {
  if (content.includes('\0')) return [];

  const findings = [];
  for (const rule of rules) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    for (const match of content.matchAll(pattern)) {
      if (rule.allow?.(match)) continue;
      const location = lineAndColumn(content, match.index ?? 0);
      findings.push({
        ruleId: rule.id,
        description: rule.description,
        source,
        ...location,
        matchLength: match[0].length,
      });
    }
  }
  return findings;
}

export function scanRepository({ root = repositoryRoot(), files = trackedFiles(root) } = {}) {
  const findings = scanForbiddenArtifactPaths(files);
  for (const file of files) {
    if (!isTextFile(file)) continue;
    const absolutePath = resolve(root, file);
    if (statSync(absolutePath).size > MAX_TEXT_FILE_BYTES) continue;
    findings.push(...scanText(file, readFileSync(absolutePath, 'utf8')));
  }
  return findings;
}

export function scanHistory(root = repositoryRoot()) {
  const history = execFileSync(
    'git',
    ['log', '--all', '-p', '--no-color', '--format=AGENTGUARD_COMMIT:%H'],
    { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  );

  const findings = [];
  let commit = 'unknown';
  let block = [];

  const flush = () => {
    if (block.length === 0) return;
    findings.push(...scanText(`history:${commit}`, block.join('\n')));
    block = [];
  };

  for (const line of history.split('\n')) {
    if (line.startsWith('AGENTGUARD_COMMIT:')) {
      flush();
      commit = line.slice('AGENTGUARD_COMMIT:'.length, 'AGENTGUARD_COMMIT:'.length + 12);
    } else {
      block.push(line);
    }
  }
  flush();

  const unique = new Map();
  for (const finding of findings) {
    unique.set(`${finding.source}:${finding.ruleId}`, finding);
  }
  return [...unique.values()];
}

function printHuman(findings, mode) {
  if (findings.length === 0) {
    console.log(`✓ ${mode} 敏感信息检查通过`);
    return;
  }

  console.error(`✗ ${mode} 发现 ${findings.length} 项潜在敏感信息：`);
  for (const finding of findings.slice(0, MAX_PRINTED_FINDINGS)) {
    console.error(
      `- [${finding.ruleId}] ${finding.source}:${finding.line}:${finding.column} `
      + `${finding.description}（匹配内容已隐藏，长度 ${finding.matchLength}）`,
    );
  }
  if (findings.length > MAX_PRINTED_FINDINGS) {
    console.error(`- 其余 ${findings.length - MAX_PRINTED_FINDINGS} 项未显示`);
  }
}

function usage() {
  console.log('Usage: node scripts/sanitize.mjs [--staged | --history | --package] [--json]');
}

export function main(argv = process.argv.slice(2)) {
  const known = new Set(['--help', '-h', '--history', '--json', '--package', '--staged']);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length > 0) {
    console.error(`未知参数：${unknown.join(', ')}`);
    usage();
    return 2;
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    usage();
    return 0;
  }
  const selectedModes = ['--history', '--package', '--staged'].filter((flag) => argv.includes(flag));
  if (selectedModes.length > 1) {
    console.error('--history、--package 与 --staged 不能同时使用');
    return 2;
  }

  const root = repositoryRoot();
  const mode = argv.includes('--history')
    ? 'Git 历史'
    : argv.includes('--package')
      ? 'npm 发布内容'
      : argv.includes('--staged')
        ? '暂存区'
        : '当前版本';
  const findings = argv.includes('--history')
    ? scanHistory(root)
    : scanRepository({
      root,
      files: argv.includes('--package')
        ? packageFiles(root)
        : argv.includes('--staged')
          ? stagedFiles(root)
          : trackedFiles(root),
    });

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ mode, findingCount: findings.length, findings }, null, 2));
  } else {
    printHuman(findings, mode);
  }
  return findings.length === 0 ? 0 : 1;
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`敏感信息检查执行失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
