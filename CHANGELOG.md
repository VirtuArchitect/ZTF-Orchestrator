# Changelog

All notable changes to ZTF-Orchestrator are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.2.4]  2026-05-21

### Summary
Feature release: Multi-script composition and Audit Log UI. Closes both
remaining explicit gaps from the architecture document.

### Added

#### Multi-Script Composition
- **Script queue** — clicking a script now toggles it in an ordered queue;
  numbered badges show queue position directly in the list
- **Reordering** — up/down arrows within the queue panel
- **Execution** — Run passes the full queue to ZTF as
  `--script A,B,C` in a single invocation; ZTF executes scripts sequentially
- **Backend** — `script` parameter now accepts a JSON array or a
  comma-separated string; every ID is validated against the allowlist
  before execution

#### Audit Log UI
- **`GET /api/audit-log`** — reads `ztf-orchestrator.log`, parses
  structured JSON lines, returns last N entries (default 200, max 1000);
  supports `?level=`, `?user=`, `?action=` query filters; admin-only
- **Audit Log page** — newest-first list with timestamp, level badge,
  message, user, IP, and status; expandable rows show all additional
  structured fields; free-text search and level filter buttons
  (ALL / INFO / WARNING / ERROR)
- Sidebar nav item (ScrollText icon) between Pipelines and Users

### Tests
- 6 new tests: multi-script array and comma-string acceptance, unknown
  script rejection, audit log RBAC (viewer and operator get 403)
- Coverage maintained at 74% (78 tests total)

---

## [1.2.3]  2026-05-21

### Summary
Feature release: Pipeline Builder. Operators can now chain workflows
sequentially with automatic pass/fail gates, enabling fully unattended
end-to-end Nutanix site deployments.

### Added

#### Pipeline Builder
- **Pipelines page** — create, edit, delete, and run named pipelines
  from the sidebar. Each pipeline is an ordered list of workflow + config
  file pairs stored in `~/.ztf-ui/pipelines.json`.
- **Builder UI** — per-step workflow selector (all 13 workflows) and
  config file picker, with up/down reordering and add/remove controls.
- **Sequential execution engine** — `POST /api/pipelines/<id>/run`
  chains ZTF subprocess invocations inside a single SSE stream. Each
  step only starts if the previous step exited with return code 0. On
  first failure, remaining steps are marked skipped and the stream closes.
- **Step progress rail** — the execution modal shows all steps with live
  status: pending → running (spinner) → success / failed / skipped.
  Terminal output is combined with step-separator headers between steps.
- **History integration** — pipeline runs recorded with `type: pipeline`,
  full `steps[]` result array, and webhook notification on completion.
- **RBAC** — admin and operator can create/edit/delete/run; viewer can
  list only.

#### API
- `GET/POST /api/pipelines` — list and create
- `GET/PUT/DELETE /api/pipelines/<id>` — read, update, delete
- `POST /api/pipelines/<id>/run` — SSE execution stream

### Changed
- Sidebar: Pipelines nav item (GitBranch icon) between Executions and Users
- Coverage: 72% → 74% (13 new tests in `tests/test_pipelines.py`)

---

## [1.2.2]  2026-05-21

### Summary
Feature and polish release. Adds execution re-run directly from history,
fixes the favicon, and corrects the sidebar version string.

### Added
- **Execution re-run** expand any row in Execution History to see a
  **Re-run** button alongside the config filename. Clicking fires the
  workflow or script immediately using the original stored YAML no
  form re-entry required. The config is saved with each execution record
  going forward; older records without stored config do not show the button.
  History reloads automatically when the re-run modal closes.

### Fixed
- **Favicon not displaying** `favicon.png` was placed in `static/` (not
  served at `/`) and `index.html` still referenced `/favicon.svg`. Moved to
  `public/` so Vite copies it into `dist/` on build; updated the `<link>`
  to `type="image/png" href="/favicon.png"`.
- **Sidebar version string** the bottom-left sidebar showed `ZTF UI v1.0.0`
  regardless of the installed version. Updated to `v1.2.2` and aligned with
  the other version strings in `server.py`, `package.json`, and `Settings.tsx`.
- **`backup_config` Windows compatibility** — `Path.rename()` raises
  `FileExistsError` on Windows when the `.bak.1` target already exists.
  Replaced with `Path.replace()`, which is atomic and overwrites on all
  platforms.

### Changed
- Execution history records now include `configContent` and `configFile`
  fields to support re-run. Existing records without these fields are
  unaffected.

---

## [1.2.1]  2026-05-21

### Summary
Bug-fix and security patch release. Resolves three functional regressions
in the 1.2.0 UI, patches seven CVEs in Python dependencies, fixes the
CI pipeline, and adds webhook notifications.

### Fixed

#### UI
- **Global Config round-trip** — opening the Global Config page no longer
  resets all fields to defaults. The fetched `global.yml` is now parsed back
  into form state: vault type, IP allocation method, credentials, CyberArk
  settings, and Infoblox settings all populate correctly on load.
- **Config backup restore unreachable** — the server-side `.bak.N` backup
  files created on every config overwrite were previously inaccessible from
  the UI. A **History** button now appears when backups exist; clicking it
  shows all versions with timestamps and sizes, each with a **Restore**
  action (the current file is backed up before restoring).
- **Dashboard no auto-refresh** — the dashboard fetched system checks and
  execution history once on mount and never updated. It now polls every
  30 seconds and includes a manual **Refresh** button with a spinner.

#### CI / Build
- `npm ci` was failing with a peer dependency conflict: `@vitejs/plugin-react@4.x`
  declares `vite@"^4–7"` as its peer but the lockfile had `vite@8`. Upgraded
  to `@vitejs/plugin-react@^6.0.2` which targets `vite@^8`.
- `tests/conftest.py` — `admin_token` fixture referenced `isolated_data_dir`
  without declaring it as a parameter, causing pytest to inject the raw fixture
  function instead of the resolved `Path`. Fixed parameter declaration; added
  `server._ensure_default_admin()` call after module reload so `users.json`
  exists before any test reads it.
- Four POST path-traversal test assertions updated to accept HTTP 405 alongside
  400/404 — Werkzeug normalises `../../etc/passwd` URLs before routing, landing
  on the GET-only SPA fallback.
- Added 11 targeted tests (backup list/restore, executions, global config,
  user role update) to restore coverage above the 70% CI gate.

### Added
- **Webhook notifications** — set a URL in **Settings → Notifications** to
  receive a `POST` on every workflow or script completion. Payload includes
  `workflow`, `status`, `returnCode`, `user`, `timestamp`, and `executionId`.
  Fired in a daemon thread using stdlib `urllib` (no new dependency); failures
  are logged and never interrupt an execution.
- **Favicon** — `static/favicon.png`: dark-navy background with a faceted
  teal prism and automation arc.

### Security
- `flask` upgraded `3.0.3 → 3.1.3` — resolves **CVE-2026-27205**.
- `flask-cors` upgraded `4.0.1 → 6.0.2` — resolves **CVE-2024-6844**,
  **CVE-2024-6866**, **CVE-2024-6839**, **PYSEC-2024-71**, **PYSEC-2024-260**.
  `PYSEC-2024-271` (CRLF log injection in debug mode, no fix available in any
  release) suppressed in `pip-audit` with documented justification; app binds
  to localhost only and debug logging is off by default.

### Changed
- `.gitignore` expanded to exclude `__pycache__/`, `*.pyc`, `.coverage`,
  `.pytest_cache/` — generated artefacts are no longer committable.
- `dist/` rebuilt against `@vitejs/plugin-react@6` and new frontend changes.

---

## [1.2.0] 2026-05-20

### Summary
Production hardening release. Replaces the shared API key with a full
username/password authentication system, adds role-based access control,
structured logging, rate limiting, execution timeout, concurrency locking,
config file versioning, a Docker deployment model, a CI pipeline, and a
pytest test suite.

### Added

#### Authentication & Authorisation
- User authentication: bcrypt-hashed passwords stored in `users.json`
- Session tokens (64-char hex, 8-hour TTL) returned on `POST /api/auth/login`
- `POST /api/auth/logout` invalidates the current session token
- `GET /api/auth/me` returns current user info
- Three roles: `admin`, `operator`, `viewer` enforced on every endpoint
- Role matrix:
  - **admin** — full access including settings, global config, and user management
  - **operator** — execute workflows, manage config files, read executions
  - **viewer** — read-only access to configs, executions, and system check
- User management endpoints (`GET/POST /api/users`, `PUT/DELETE /api/users/:username`) — admin only
- First-run default admin account created automatically; credentials printed to console

#### Reliability
- Execution timeout: configurable via `ZTF_EXEC_TIMEOUT` (default 3600s); hung ZTF processes are killed automatically
- Concurrency lock: one execution per workflow at a time; HTTP 409 returned if already running
- Config file backup: last 5 versions retained before any overwrite (`config.yml.bak.1` … `.bak.5`)
- Subprocess killed on client disconnect (`GeneratorExit` handling in SSE generator)

#### Observability
- Structured JSON logging to stderr and `$ZTF_DATA_DIR/ztf-orchestrator.log`
- Every request logged with method, path, user, and remote IP
- Execution events logged: start, complete, timeout, cancel, error
- `/health` endpoint (public, no auth) — returns `status`, `ztf_installed`, `version`; used by Docker `HEALTHCHECK` and load balancers

#### Security
- Rate limiting via Flask-Limiter: 10/min on `/api/auth/login` (brute force protection), 10/min on `/api/execute`, 2/min on `/api/install`
- `Content-Security-Policy` header added to all responses
- `Permissions-Policy` header added (`geolocation`, `microphone`, `camera` denied)
- `Referrer-Policy: strict-origin-when-cross-origin` added
- Execution history expanded to 1000 records; records now include username

#### Configuration
- All paths, ports, timeouts, and TTLs configurable via environment variables
- No hardcoded `~` home directory paths — use `ZTF_DATA_DIR` instead
- `.env.example` documents every supported environment variable

#### Deployment
- `Dockerfile` — non-root `ztf-svc` service account, `HEALTHCHECK`, all config via env
- `docker-compose.yml` — persistent named volumes, localhost-only port binding, log rotation
- `start.sh` superseded by Docker and systemd (see README)

#### Testing
- `tests/conftest.py` — isolated temp directory fixtures; no tests touch `~/.ztf-ui`
- `tests/test_auth.py` — login/logout/token lifecycle, public health endpoint
- `tests/test_validation.py` — allowlist injection, path traversal (8 variants), YAML bombs, body size, settings key filtering
- `tests/test_api.py` — RBAC enforcement per role, config CRUD, backup verification, user management, security headers

#### CI Pipeline
- `.github/workflows/ci.yml`:
  - `pip-audit` vulnerability scan against `requirements.txt`
  - `pytest` with coverage report (`--cov-fail-under=70`)
  - `npm audit --audit-level=high`
  - `tsc --noEmit` TypeScript check
  - `npm run build` frontend build verification
  - Docker image build + `/health` smoke test (on `main` only)

### Changed
- `requirements.txt` — pinned to exact versions; added `bcrypt==4.2.1` and `flask-limiter==3.8.0`
- `package.json` — bumped to `1.2.0`; removed `concurrently`, `express`, `cors` dev dependencies
- `src/store.ts` — replaced `apiKey` field with `sessionToken` + `user` object (persisted to localStorage)
- `src/utils/api.ts` — `apiFetch()` now sends `Authorization: Bearer <token>` instead of `X-API-Key`
- `src/components/Header.tsx` — shows logged-in username, role badge, and logout button
- `src/pages/Settings.tsx` — removed API key field; settings are read-only for non-admin roles
- `src/App.tsx` — added `RequireAuth` guard; unauthenticated users redirected to `/login`
- Execution history limit increased from 100 to 1000 records
- `ZTF_DATA_DIR` now used for all file I/O (was hardcoded `~/.ztf-ui`)

### Removed
- `server.js` — duplicate Express.js backend deleted; Flask (`server.py`) is the single canonical backend
- Shared API key authentication — replaced by per-user session tokens
- `apiKey` field from `Settings` type and Zustand store

---

## [1.1.0] 2026-05-20

### Summary
Security remediation release. Addressed all critical and high severity
vulnerabilities identified in the initial validation review.

### Fixed

#### Critical
- **Command injection** — all subprocess calls converted from `shell=True` + string
  concatenation to argument lists. `workflow` and `script` values validated against
  hardcoded allowlists (`ALLOWED_WORKFLOWS`, `ALLOWED_SCRIPTS`) before any subprocess
  call. Applies to both `server.py` and `server.js`.
- **Path traversal** — config file names resolved and checked to remain within the
  configured `configs` directory using `Path.resolve()` + `relative_to()` before any
  read, write, or delete operation.

#### High
- **Missing authentication** — all API endpoints protected by `X-API-Key` header
  validation using `secrets.compare_digest()` (Python) / `crypto.timingSafeEqual()`
  (Node.js). Key auto-generated as 64-char hex on first start, stored at
  `$ZTF_DATA_DIR/.api_key` (0600 permissions).
- **Unrestricted CORS** — replaced `CORS(app)` / `cors()` (wildcard) with explicit
  localhost-only origin lists.

#### Medium
- **Exception leakage** — full exception stack traces no longer sent to browser via
  SSE. Full detail logged server-side; generic message sent to client.
- **Insecure file permissions** — `~/.ztf-ui/` created with 0700; all files within
  created with 0600 on every write.
- **Sensitive execution history** — full command strings and config file paths removed
  from `history.json`.
- **YAML injection** — `yaml.safe_load()` validation applied to all user-submitted
  YAML content before acceptance.
- **Arbitrary repo clone** — `ALLOWED_REPOS` set enforces only the official ZTF
  GitHub URL during install.

#### Low
- **Request body size** — 1 MB cap enforced via `before_request` hook (Flask) and
  `express.json({ limit: '1mb' })` (Node.js).
- **Security headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Cache-Control: no-store` added to all responses.
- **Server bind address** — Flask bound to `127.0.0.1` only (was `0.0.0.0`).

### Added
- `src/utils/api.ts` — `apiFetch()` wrapper injects `X-API-Key` on every request
- `apiKey` field in `Settings` type and Zustand store (stored in localStorage only,
  never sent to server as part of the settings payload)
- API Key field in Settings page with show/hide toggle
- `select` module replaced with two thread readers + `queue.Queue` for
  cross-platform subprocess output streaming (Windows compatibility)

### Changed
- `server.py` — `shell=True` removed from all subprocess calls
- `server.js` — `spawn('bash', ['-c', cmd])` replaced with `spawn(args[0], args.slice(1))`
- All frontend `fetch()` calls replaced with `apiFetch()`
- `README.md` — added Security Model section, deployment boundaries table,
  updated first-time setup instructions

---

## [1.0.0] 2026-05-16

### Summary
Initial release. Web-based graphical interface for the
[Nutanix ZeroTouch Framework](https://github.com/nutanixdev/zerotouch-framework),
replacing GitHub Actions and CLI-based configuration management with a visual
operator interface.

### Added
- React 18 + TypeScript frontend (Vite, Tailwind CSS, Zustand)
- Flask 3.0 backend (`server.py`) and Express.js backend (`server.js`)
- 13 workflow forms: Cluster Create, Imaging Only, Pod Imaging, Site Deploy,
  Configure Cluster, Deploy/Configure Prism Central, Pod Config,
  Deploy/Configure Management PC, Calm VM Workloads, Edge AI Workload, NDB Deploy
- Script library: 61 ZTF scripts across 12 categories, searchable and executable
- Live YAML preview with download for all workflow configurations
- Real-time execution output via Server-Sent Events (SSE)
- Execution history with status filtering
- Global Config page: vault (Local/CyberArk) and IPAM (Static/Infoblox) configuration
- Config Files page: browse, create, edit, delete YAML/JSON configs
- Setup page: prerequisites check and one-click ZTF installation
- Dashboard: system health, recent executions, quick-action buttons
- Settings page: ZTF path, Python executable, config directory

---

[1.2.4]: https://github.com/VirtuArchitect/ZTF-Orchestrator/compare/v1.2.3...v1.2.4
[1.2.3]: https://github.com/VirtuArchitect/ZTF-Orchestrator/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/VirtuArchitect/ZTF-Orchestrator/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/VirtuArchitect/ZTF-Orchestrator/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/VirtuArchitect/ZTF-Orchestrator/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/VirtuArchitect/ZTF-Orchestrator/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/tag/v1.0.0
