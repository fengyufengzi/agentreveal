/**
 * 当前项目敏感文件名扫描。
 *
 * 约束：默认只读；只检查文件名/相对路径，不读取文件内容，不跟随符号链接。
 */
import { readdirSync, lstatSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
const SKIP_DIRS = new Set([
    ".git",
    "node_modules",
    "dist",
    "coverage",
    ".next",
    ".nuxt",
    "build",
    "out",
    ".turbo",
    ".cache",
]);
const EXAMPLE_ENV_RE = /^\.env\.(example|sample|template|local\.example)$/i;
const RULES = [
    {
        id: "env-file",
        label: "环境变量文件",
        severity: "high",
        test: (_rel, base) => (base === ".env" || base.startsWith(".env.")) && !EXAMPLE_ENV_RE.test(base),
    },
    {
        id: "private-key",
        label: "私钥或证书文件",
        severity: "high",
        test: (_rel, base) => /^(id_rsa|id_dsa|id_ecdsa|id_ed25519)$/i.test(base) ||
            /\.(pem|key|p12|pfx)$/i.test(base),
    },
    {
        id: "cloud-credential",
        label: "云服务凭证文件",
        severity: "high",
        test: (rel, base) => /(^|\/)\.aws\/credentials$/i.test(rel) ||
            /(^|\/)application_default_credentials\.json$/i.test(rel) ||
            /(^|\/)(service-account|service_account|credentials)\.json$/i.test(rel) ||
            /^.+-firebase-adminsdk-.+\.json$/i.test(base),
    },
    {
        id: "kubeconfig",
        label: "Kubernetes 配置",
        severity: "medium",
        test: (rel, base) => /(^|\/)\.kube\/config$/i.test(rel) ||
            /(^|\/)kubeconfig$/i.test(rel) ||
            /^kube\.config$/i.test(base),
    },
];
function normalizeRel(path) {
    return path.split(sep).join("/");
}
function matchRule(relPath) {
    const base = basename(relPath);
    return RULES.find((rule) => rule.test(relPath, base));
}
/** 扫描当前项目目录中的敏感文件名，返回已脱敏的风险发现。 */
export function scanSensitiveFiles(cwd, opts = {}) {
    const maxDepth = opts.maxDepth ?? 6;
    const maxFindings = opts.maxFindings ?? 50;
    const findings = [];
    let truncated = false;
    const walk = (dir, depth) => {
        if (depth > maxDepth || findings.length >= maxFindings) {
            if (findings.length >= maxFindings)
                truncated = true;
            return;
        }
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (findings.length >= maxFindings) {
                truncated = true;
                return;
            }
            const fullPath = join(dir, entry.name);
            const relPath = normalizeRel(relative(cwd, fullPath));
            let isSymlink = false;
            try {
                isSymlink = lstatSync(fullPath).isSymbolicLink();
            }
            catch {
                continue;
            }
            if (isSymlink)
                continue;
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name))
                    walk(fullPath, depth + 1);
                continue;
            }
            if (!entry.isFile())
                continue;
            const rule = matchRule(relPath);
            if (!rule)
                continue;
            findings.push({
                id: "PROJECT_SENSITIVE_FILE",
                category: "sensitive",
                severity: rule.severity,
                title: `当前项目包含${rule.label}`,
                description: "Agent 在项目目录内工作时，可能读取或上传该文件内容。",
                evidence: {
                    path: relPath,
                    kind: rule.id,
                },
                recommendation: "确认该文件是否必须放在项目目录；如不需要，移出项目或加入 Agent 的 deny/ignore 规则。",
                fixable: false,
            });
        }
    };
    walk(cwd, 0);
    if (truncated) {
        findings.push({
            id: "PROJECT_SENSITIVE_SCAN_TRUNCATED",
            category: "sensitive",
            severity: "info",
            title: "敏感文件扫描结果已截断",
            description: "为避免报告过长，当前只展示前若干项匹配结果。",
            evidence: { maxFindings },
            fixable: false,
        });
    }
    return findings;
}
//# sourceMappingURL=index.js.map