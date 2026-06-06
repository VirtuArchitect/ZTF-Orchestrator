# AGENTS.md

## Repository Instructions

This repository expects production-grade engineering by default. Follow these
instructions for all code changes in this repo.

## Companion Guides

- For testing strategy, required checks, and smoke testing, follow
  `TESTING_GUIDE.md`.
- For security-sensitive work, follow `SECURITY_REVIEW.md`.
- For code review tasks, follow `CODE_REVIEW.md`.
- Before any penetration testing or vulnerability testing, define authorization
  and scope with `PENTEST_SCOPE_TEMPLATE.md`.

## Project Context

- Read the project README, package/build files, test configuration, and nearby
  code before making edits.
- Prefer existing frameworks, helpers, architecture, naming, and style.
- Keep changes focused on the requested behavior.
- Do not introduce new runtime dependencies unless there is a clear need.
- Do not change public APIs, data schemas, migrations, or security boundaries
  without calling out the impact.

## Definition of Done

Work is not complete until:

- The requested change is implemented.
- Relevant tests are added or updated, or the reason for not adding tests is
  explained.
- Relevant automated checks are run.
- A smoke test verifies the main changed path.
- Security-sensitive changes receive a security review.
- Remaining risks or skipped checks are documented.

## Required Checks

Use the commands defined by this repository. If commands are unknown, inspect the
project files first, then choose the closest relevant checks.

Recommended check order:

1. Fast targeted test for the changed area.
2. Lint and type checks.
3. Broader test suite when the change has wider risk.
4. Build check when packaging or frontend behavior changed.
5. Manual or automated smoke test.

## Smoke Testing

A smoke test should prove the changed path works at a basic user or system level.

Examples:

- Start the app and open the changed screen.
- Call the changed API endpoint with a valid request and at least one invalid
  request.
- Run the changed CLI command with a representative input.
- Exercise the changed workflow through the UI.
- Confirm the app starts cleanly after configuration or dependency changes.

Document the exact smoke test in the final response.

## Security Review Trigger

Perform a security review when touching:

- Authentication or sessions.
- Authorization, roles, permissions, or admin features.
- Payments, billing, invoices, subscriptions, or financial data.
- User data, personal data, or sensitive records.
- File upload, download, parsing, previews, or storage.
- SQL, ORM queries, search queries, or database migrations.
- Shell commands, subprocesses, path handling, or filesystem access.
- External webhooks, callbacks, OAuth, tokens, or API keys.
- Logging, analytics, telemetry, or error reporting.
- Dependency, build, CI/CD, container, or deployment configuration.

Use `SECURITY_REVIEW.md` for the review checklist.

## Final Response Format

Include:

- Summary of changes.
- Tests and checks run.
- Smoke test performed.
- Security notes if applicable.
- Untested items or residual risk.
