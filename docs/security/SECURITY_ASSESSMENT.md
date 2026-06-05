# Repository Security Assessment

Assessment date: 2026-06-05

Repository reviewed: `VirtuArchitect/ZTF-Orchestrator`

Local path reviewed:
`C:\Users\john\OneDrive\09 Profile\Documents\GitHub\ZTF-Orchestrator`

Branch and commit reviewed: `main`, `a620303`

Repository state note: the local checkout was behind `origin/main` by 2 commits
at the time of review. Findings therefore apply to the local checkout reviewed,
not necessarily every commit currently available on GitHub.

## Assessment Type

This assessment is a repository-level security review intended to identify
obvious risks in source code, dependencies, authentication, authorization,
execution paths, storage, and deployment configuration.

It is not a formal third-party penetration test, external red-team exercise, or
production assurance certification.

## Scope

In scope:

- Python Flask backend source review.
- React frontend source review.
- Authentication, session, and role enforcement review.
- Workflow/job execution path review.
- PostgreSQL and file storage review.
- Docker Compose deployment review.
- Dependency and static-analysis checks.
- Limited local automated test execution.

Out of scope:

- Live Nutanix workflow execution.
- Prism Central, Foundation Central, or Prism Element attack simulation.
- Production PostgreSQL backup and restore validation.
- Kubernetes runtime validation.
- Load balancing and multi-instance runtime testing.
- CDN or cache-layer validation.
- Full disaster recovery testing.
- External network penetration testing.

## Tools and Commands

Commands executed:

```powershell
npm audit --audit-level=moderate
python -m pip_audit -r requirements.txt
python -m bandit -r . -x .\venv,.\node_modules,.\dist,.\static,.\tests
python -m bandit -r . -x .\venv,.\node_modules,.\dist,.\static,.\tests -q -ll
python -m pytest tests/test_auth.py tests/test_storage_backend.py -q
python -m pytest -q
npm run build
```

Additional manual review covered route decorators, role checks, subprocess
usage, config path handling, security headers, CORS configuration, storage query
construction, Docker Compose defaults, and frontend HTML injection sinks.

## Summary

No critical findings were identified during this baseline review.

The most meaningful remaining hardening items are environment-specific
validation, production secret rotation, and production backup/recovery testing.

## Findings

### Medium: React Router Dependency Advisory

`npm audit` reported moderate advisories affecting `react-router` through
`react-router-dom`.

Recommendation:

- Run `npm audit fix`.
- Rebuild the frontend.
- Regression test login, redirects, and route navigation.

Status: remediated in the current working tree by updating `react-router-dom`
to 6.30.4.

### Medium: Webhook Destination Validation

Webhook notifications are posted to a configured URL using `urllib.request`
without explicit validation of scheme, host, or private/internal IP ranges.

Risk:

- A compromised or over-privileged user could configure the application to make
  server-side requests to internal services.

Recommendation:

- Allow only `https://` webhook URLs by default.
- Optionally maintain an allowlist of webhook domains.
- Block localhost, private, link-local, and metadata-service IP ranges unless a
  specific lab override is enabled.
- Add tests for rejected webhook destinations.

Status: remediated in the current working tree. Webhooks now require HTTPS by
default, reject embedded credentials, block private/internal destinations, and
support an explicit host allowlist for controlled environments.

### Medium: Default PostgreSQL Password in Docker Compose

Docker Compose currently provides a development-friendly default PostgreSQL
password.

Recommendation:

- Require `POSTGRES_PASSWORD` from `.env` for non-local deployments.
- Document password rotation.
- Avoid reusing the default in any persistent environment.

Status: remediated in the current working tree. Docker Compose now requires
`POSTGRES_PASSWORD` to be supplied, normally through `.env`.

### Medium/Low: Direct Flask Bind Address

The Flask entry point binds to all interfaces when run directly. Docker Compose
publishes the container port to `127.0.0.1`, but manual runs may expose the app
on the local network.

Recommendation:

- Make the bind host configurable.
- Default direct/manual runs to `127.0.0.1`.
- Keep Docker deployment documented as localhost-published unless fronted by a
  TLS reverse proxy.

Status: remediated in the current working tree. Manual runs default to
`ZTF_BIND_HOST=127.0.0.1`; Docker Compose sets `ZTF_BIND_HOST=0.0.0.0` inside
the container while publishing only `127.0.0.1:5001` on the host.

### Low: Python Dependency Audit Could Not Complete

`pip-audit` could not complete because the pinned `psycopg[binary]` version did
not resolve cleanly in the audit environment.

Recommendation:

- Update `psycopg[binary]` to a current tested version.
- Rerun `pip-audit`.

Status: remediated in the current working tree by updating `psycopg[binary]` to
3.2.13. Rerun `pip-audit` in release validation.

### Low: PostgreSQL Audit Query Scanner Warning

Bandit flagged dynamic SQL construction in the audit event query. Manual review
indicates the dynamic `where` clause is built from fixed internal fragments and
values are parameterized.

Recommendation:

- Refactor query assembly to avoid f-string SQL fragments where practical.
- If retained, document why the construction is controlled and add a narrow
  scanner suppression only after review.

Status: review recommended.

### Low: Powerful Execution Surface by Design

ZTF-Orchestrator intentionally launches ZeroTouch Framework workflows through
subprocess execution. The implementation avoids `shell=True` and validates
workflow/script IDs against known options, but execution remains a high-impact
operator surface.

Recommendation:

- Keep execution restricted to admin/operator roles.
- Continue logging all execution requests.
- Restrict writable directories.
- Use approval gates for sensitive workflows.
- Treat `ztfPath`, `pythonPath`, and generated config content as privileged
  settings.

Status: mitigated by current controls; ongoing operational risk.

## Positive Controls Observed

- Passwords are bcrypt-hashed.
- Session tokens are generated with strong random values and expire.
- Logout invalidates tokens.
- Route decorators enforce admin, operator, and viewer roles.
- Config file operations use path traversal protection.
- YAML validation uses `safe_load`.
- Security headers are applied to responses.
- Docker Compose publishes the web port to localhost by default.
- Manual Flask runs bind to localhost by default.
- Webhook delivery requires HTTPS by default and blocks private/internal
  destinations unless explicitly allowlisted.
- Subprocess calls use argument arrays rather than `shell=True`.
- Frontend YAML preview escapes content before injecting highlighting markup.

## Test Results

Targeted local tests completed successfully:

```text
106 passed, 1 skipped
```

The skipped test requires `ZTF_TEST_DATABASE_URL` and is intended for PostgreSQL
integration validation when a test database is available.

Dependency audits completed with no known vulnerabilities reported by `npm audit`
or `pip-audit`. Bandit completed with no medium or high findings; remaining low
findings are documented scanner noise around expected subprocess usage and
cleanup exception handling.

## Recommended Next Steps

1. Rerun `npm audit`, `pip-audit`, Bandit, pytest, and the frontend build for
   each release.
2. Rotate PostgreSQL and application secrets before shared or production-like
   deployment.
3. Validate PostgreSQL backup/restore in the target environment.
4. Add a repeatable release security checklist for each version tag.
5. Perform environment-specific UAT against real Nutanix infrastructure before
   representing the product as production validated.

## Assessment Statement

ZTF-Orchestrator has undergone a baseline repository-level security review.
The review found no critical issues, identified several practical hardening
items, and confirmed that core authentication and storage tests pass locally.
Full production assurance still requires environment-specific testing against
the intended Nutanix, database, hosting, and recovery architecture.
