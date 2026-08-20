# Security Policy

AgentReveal scans local AI Agent configuration, so privacy and credential handling are security-critical.

## Reporting a vulnerability

Please report vulnerabilities or suspected sensitive-data exposure through
[GitHub Security Advisories](https://github.com/fengyufengzi/agentreveal/security/advisories/new).
Do not open a public Issue for a vulnerability that could expose credentials, private configuration, internal endpoints,
or a reproducible path to code execution.

Include the affected AgentReveal version, operating system, reproduction steps, and expected impact. Redact API keys,
tokens, private endpoints, usernames, and configuration contents. A minimal synthetic example is preferred.

## If a credential was exposed

Revoke or rotate it at the upstream provider immediately. Removing it from the current branch or rewriting Git history
does not make an exposed credential safe again.

## Supported versions

AgentReveal is currently pre-release software. Security fixes are applied to the latest preview branch and release only.
