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

## Public GitHub Metadata

- Public GitHub metadata must not mention agent or automation provenance. Avoid
  those references in branch names, commit messages, PR titles, workflow names,
  run names, release notes, generated artifacts, and merge commits.
- Use neutral branch prefixes such as `feature/`, `fix/`, `docs/`, or a
  maintainer-specific prefix.
- Before merging, check PR titles and merge commit messages for source branch
  names or automation references that would appear in GitHub Actions, releases,
  or public commit history.

## ZTF-Orchestrator Specific Rules

- Verify `cwd`, repository identity, branch, remote, and `git status --short`
  before making edits, especially when multiple ZTF worktrees or release
  artifact directories are present.
- Do not push directly to protected `main`. Use a focused branch and PR for
  public GitHub changes. Keep `main` PR-only for public repository history,
  even when a maintainer asks for commit, push, pull, or merge work.
- Preserve existing local changes and artifacts. Do not delete, overwrite,
  reset, clean, or regenerate untracked files, release artifacts, update
  packages, `.env` files, `.env.*` backups, recovery notes, or appliance
  outputs without explicit confirmation and a listed target set.
- Keep release metadata aligned. Version changes, changelog entries, README
  references, release notes, demo/public documentation, and release-integrity
  tests should be updated together when user-visible behavior changes.
- Treat GitHub Pages and demo behavior as simulated unless live lab validation
  proves otherwise. Do not imply production certification or vendor support
  beyond source, test, runtime, or vendor-documented evidence.
- For Foundation Central, FCA, Dell, Nutanix, AHV, Prism, or appliance behavior,
  distinguish verified implementation from plausible or intended behavior.
- For offline or air-gapped bundles, inspect `.dockerignore`, Docker build
  context, image contents, image size, package contents, and checksums before
  calling the artifact shippable.
- Keep appliance artifact boundaries explicit. Offline update packages, Docker
  image tars, GitHub Release assets, GitHub Actions QCOW2 artifacts, and
  durable internal artifact storage are separate deliverables and must not be
  described interchangeably.
- Avoid publishing local usernames, OneDrive paths, machine-specific paths,
  secrets, lab IPs, or private environment details in public documentation,
  releases, screenshots, or generated artifacts.

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

Common ZTF checks:

```bash
python -m pytest tests/test_release_integrity.py -q
python -m pytest -q
npm run build
npm run build:demo
npm run smoke:visual
git diff --check
```

- Frontend, routing, theme, demo, or visual changes usually require
  `npm run build` and a browser or Playwright smoke test.
- Release, installer, appliance, offline-bundle, Docker, or documentation-link
  changes usually require `tests/test_release_integrity.py`.
- API, workflow, validation, or backend changes usually require focused pytest
  coverage plus a representative API or workflow smoke test.

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

For implementation work, include:

- Summary of changes.
- Tests and checks run.
- Smoke test performed.
- Security notes if applicable.
- Untested items or residual risk.

For code review tasks, follow `CODE_REVIEW.md` and lead with findings ordered by
severity before any summary or contextual notes.
