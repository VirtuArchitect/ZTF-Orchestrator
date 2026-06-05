# Security Policy

ZTF-Orchestrator is intended for trusted internal environments where operators
use it to configure, validate, and execute ZeroTouch Framework workflows.

## Supported Versions

Security fixes are targeted at the current `main` branch and the latest tagged
release. Older versions should be upgraded before deployment in shared or
production-like environments.

## Reporting a Vulnerability

Please avoid posting exploitable details in public issues.

Report suspected vulnerabilities to the repository owner with:

- A concise description of the issue.
- Steps to reproduce, if safe to share.
- The affected version, branch, or commit.
- Any relevant logs, screenshots, or proof-of-concept details.
- Suggested remediation, if known.

The maintainer should triage the report, confirm scope, and publish a fix or
mitigation note before broad disclosure.

## Security Baseline

The current security model includes:

- Role-based access control for admin, operator, and viewer users.
- bcrypt password hashing.
- Expiring bearer session tokens.
- Rate limiting on login, install, and execution endpoints.
- Config path traversal protection.
- YAML parsing through `safe_load`.
- Security response headers.
- Docker Compose localhost-only port publishing by default.

For the latest repository-level security assessment, see
[docs/security/SECURITY_ASSESSMENT.md](docs/security/SECURITY_ASSESSMENT.md).

## Deployment Guidance

Do not expose ZTF-Orchestrator directly to the public internet. For team or
production-like use, place it behind a TLS reverse proxy, restrict network
access, use strong unique credentials, rotate secrets, and validate backups and
recovery procedures.
