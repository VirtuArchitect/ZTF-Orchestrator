# Contributing to ZTF-Orchestrator

Thank you for helping improve ZTF-Orchestrator. This project is an unofficial
community orchestration tool for operational automation, so contributions should
favor reliability, clarity, and safe change management.

Please also read:

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Testing Guide](TESTING_GUIDE.md)
- [Security Review](SECURITY_REVIEW.md)
- [Code Review Guide](CODE_REVIEW.md)

## Ways to Contribute

Useful contributions include:

- Bug reports with clear reproduction steps.
- Documentation improvements.
- Focused fixes for workflow, UI, API, appliance, or packaging behavior.
- Tests that cover regressions or operational edge cases.
- Security hardening and safer defaults.
- Compatibility notes for supported ZeroTouch Framework and NKP versions.

## Before You Start

For larger changes, open an issue or discussion first. This is especially
important for changes involving:

- Authentication, RBAC, sessions, or user management.
- File uploads, archive handling, subprocesses, or filesystem paths.
- Docker, appliance, CI/CD, systemd, or deployment behavior.
- Public APIs, configuration schemas, or persisted data formats.
- ZeroTouch Framework or NKP workflow compatibility.

Keep changes focused. Avoid unrelated refactors in the same pull request.

## Development Setup

Clone the repository:

```bash
git clone https://github.com/VirtuArchitect/ZTF-Orchestrator.git
cd ZTF-Orchestrator
```

Install Python dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt pytest pytest-cov pip-audit defusedxml
```

On Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt pytest pytest-cov pip-audit defusedxml
```

Install frontend dependencies:

```bash
npm ci
```

Run the app in development mode as needed:

```bash
npm run dev
python server.py
```

Docker-based development and appliance workflows are documented in the
[Installation Guide](docs/installation-guide.md) and [Appliance Kit](appliance/README.md).

## Branches and Commits

- Create a topic branch for each change.
- Use clear commit messages that describe the behavior changed.
- Do not commit secrets, generated credentials, private customer data, or local
  environment files.
- Do not include unrelated formatting churn or generated artifacts unless they
  are required for the change.

## Pull Requests

Every pull request should explain:

- What changed.
- Why it changed.
- What tests and checks were run.
- What smoke test was performed.
- Whether the change is security-sensitive.
- Any residual risk or follow-up work.

The repository includes a pull request template under
`.github/pull_request_template.md`. Please fill it out.

## Definition of Done

A change is not complete until:

- The requested behavior is implemented.
- Relevant tests are added or updated, or the test gap is explained.
- Relevant automated checks are run.
- A smoke test verifies the main changed path.
- Security-sensitive changes receive a security review.
- Remaining risks or skipped checks are documented.

## Testing Expectations

Testing depth should match risk.

For small backend changes, run a targeted pytest command, for example:

```bash
python -m pytest tests/test_api.py -k "appliance_update"
```

For broader backend changes, run the full Python suite:

```bash
python -m pytest tests/ -v --cov=server --cov-report=term-missing --cov-fail-under=70
```

To match CI more closely, run the Python checks in Docker:

```bash
docker run --rm \
  -v "$PWD:/work" \
  -w /work \
  -e ZTF_STORAGE_BACKEND=file \
  -e ZTF_DATABASE_URL= \
  -e POSTGRES_PASSWORD= \
  python:3.11-slim \
  bash -lc 'pip install -r requirements.txt pytest pytest-cov pip-audit defusedxml && pytest tests/ -v --cov=server --cov-report=term-missing --cov-fail-under=70'
```

For frontend changes, run:

```bash
npm run build
```

For navigation, theme, or UI workflow changes, also consider the visual smoke
tests:

```bash
ZTF_VISUAL_BASE_URL=http://127.0.0.1:5173 npm run smoke:visual
```

## Security Review

Use [SECURITY_REVIEW.md](SECURITY_REVIEW.md) when touching:

- Authentication, sessions, tokens, or account management.
- Authorization, roles, permissions, or admin features.
- User data, secrets, credentials, logs, or audit data.
- File upload, download, parsing, previews, archives, or storage.
- Shell commands, subprocesses, path handling, or filesystem access.
- External webhooks, callbacks, OAuth, network clients, or API keys.
- Database queries, migrations, reports, search, imports, or exports.
- Dependency, build, container, CI/CD, appliance, or deployment configuration.

Security-sensitive pull requests should include the review notes and the tests
or smoke tests used to validate the risk area.

## Responsible Disclosure

Do not open a public issue for vulnerabilities, credentials, exploit details, or
anything that could put users or systems at risk. Use the repository's private
security reporting process when available. If private reporting is not
available, contact the maintainer using the contact information on the
maintainer's GitHub profile.

## Appliance and Air-Gapped Changes

Appliance changes can affect production operations. Be explicit about:

- Upgrade and rollback behavior.
- Whether a VM snapshot or PostgreSQL backup is required.
- Whether the change affects standard, air-gapped, or minimal builds.
- Host-level commands such as Docker, systemd, tar, or shell scripts.
- Offline artifact transfer, checksums, and package verification.

For appliance updates, see
[Appliance Update Manager](docs/appliance-update-manager.md).

## Documentation

Update documentation when behavior, commands, configuration, UI workflows, or
operational assumptions change. Common files include:

- [README.md](README.md)
- [CHANGELOG.md](CHANGELOG.md)
- [Installation Guide](docs/installation-guide.md)
- [Appliance Update Manager](docs/appliance-update-manager.md)
- [Validation Status](docs/validation-status.md)

Version bumps should keep `server.py`, `src/version.ts`, `package.json`,
`package-lock.json`, `CHANGELOG.md`, and user-facing documentation aligned.

## Code Style

- Prefer existing architecture, helpers, names, and UI patterns.
- Avoid new runtime dependencies unless there is a clear need.
- Keep public APIs, configuration schemas, and persisted data formats stable
  unless the impact is documented.
- Validate input at trust boundaries.
- Use structured parsers and APIs instead of ad hoc string manipulation where
  practical.
- Keep comments useful and concise.

## License

By contributing, you agree that your contributions are provided under the
project's existing license.
