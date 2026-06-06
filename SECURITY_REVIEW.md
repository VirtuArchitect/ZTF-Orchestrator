# SECURITY_REVIEW.md

## Security Review Policy

Use this checklist for any security-sensitive change. This is defensive review
guidance for systems the user owns or is authorized to test.

## Scope

Security review is required when touching:

- Authentication, sessions, MFA, password reset, OAuth, SSO, or tokens.
- Authorization, roles, permissions, tenancy, or admin features.
- Payments, billing, subscriptions, invoices, or financial records.
- Personal data, confidential data, secrets, or regulated data.
- File upload, download, parsing, previewing, scanning, or storage.
- Database queries, migrations, search, reports, or exports.
- Shell commands, subprocesses, filesystem paths, archives, or templates.
- Webhooks, callbacks, third-party integrations, or network clients.
- Logging, analytics, telemetry, monitoring, or error reporting.
- Build, dependency, container, CI/CD, deployment, or infrastructure config.

## Review Checklist

### Authentication and Session Safety

- Verify login, logout, session renewal, and token expiration behavior.
- Check that credentials and tokens are not logged or exposed.
- Confirm password reset and account recovery flows cannot be abused.

### Authorization and Access Control

- Confirm every protected action checks the current user's permission.
- Check tenant, organization, project, and ownership boundaries.
- Test direct-object access attempts where relevant.
- Confirm admin-only actions cannot be reached by normal users.

### Input and Injection

- Validate external input at trust boundaries.
- Check SQL, NoSQL, command, path, template, LDAP, and expression injection.
- Escape or sanitize HTML and rich text output.
- Avoid unsafe deserialization.

### File and Path Handling

- Restrict file type, size, extension, and content where relevant.
- Prevent path traversal and unsafe archive extraction.
- Store uploads outside executable paths.
- Avoid trusting client-provided filenames or MIME types.

### Secrets and Sensitive Data

- Do not commit secrets, tokens, private keys, or credentials.
- Do not print secrets in logs, errors, telemetry, or test snapshots.
- Use environment variables or secret managers for sensitive configuration.
- Redact personal or sensitive data in logs.

### Dependency and Supply Chain

- Avoid unnecessary dependencies.
- Prefer maintained packages with clear provenance.
- Run dependency audit tooling when available.
- Check install scripts, lockfile changes, and transitive risk for new packages.

### Errors and Logging

- Return useful but non-sensitive errors.
- Avoid exposing stack traces, query details, tokens, or internal paths.
- Confirm security-relevant events are logged appropriately.

### Abuse Resistance

- Consider rate limits, replay attacks, duplicate submissions, and brute force.
- Check idempotency for payments, webhooks, and retries.
- Validate webhook signatures and timestamps where applicable.

## Security Tooling Examples

Use tools appropriate for the stack and only within authorized scope:

```bash
gitleaks detect
trufflehog filesystem .
semgrep scan
npm audit
pnpm audit
pip-audit
safety check
bundler audit
cargo audit
govulncheck ./...
docker scout cves
```

## Penetration Testing Boundary

Do not perform penetration testing against third-party systems or systems without
explicit authorization. For authorized testing, define:

- Target systems and domains.
- Allowed test types.
- Excluded tests.
- Time window.
- Rate limits.
- Contacts and escalation process.
- Data handling rules.

