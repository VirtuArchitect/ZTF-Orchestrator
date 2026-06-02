# ZTF-Orchestrator · v1.2.6

A web-based installer and configuration orchestrator for the
[Nutanix ZeroTouch Framework](https://github.com/nutanixdev/zerotouch-framework),
replacing GitHub-based configuration management with a visual interface.

---

## Requirements

| Requirement | Version | Notes |
|---|---|---|
| Python | **3.10+** | 3.10, 3.11, and 3.12 are all supported |
| pip | any | Bundled with Python 3.10+ |
| git | any | Required to clone both repos |
| Node.js | 18+ | Development mode only — not needed to run the tool |

> **Windows users:** `python` and `python3` both work depending on your installation.
> Always use a virtual environment (see below) to avoid polluting your system Python.

> **Port note (Windows):** Hyper-V reserves ports 4940–5039. If the server fails to
> start on the default port 5001, set `$env:ZTF_PORT = "8080"` before starting.

---

## Installation

### Option A: One-Command (Linux / macOS) - Recommended

```bash
curl -fsSL https://raw.githubusercontent.com/VirtuArchitect/ZTF-Orchestrator/main/install.sh | bash
```

With custom options:

```bash
ZTF_PORT=8080 ZTF_INSTALL_DIR=/opt/ztf bash install.sh
```

The script automatically:
1. Checks Python 3.10+, pip, and git are present
2. Clones ZTF-Orchestrator into `~/ztf/ZTF-Orchestrator`
3. Clones ZeroTouch Framework into `~/ztf/zerotouch-framework`
4. Creates a shared Python virtual environment
5. Installs all dependencies for both components
6. Starts ZTF-Orchestrator (admin credentials printed on first run)

### Option B: One-Command (Windows PowerShell) - Recommended

```powershell
iex ((New-Object Net.WebClient).DownloadString('https://raw.githubusercontent.com/VirtuArchitect/ZTF-Orchestrator/main/install.ps1'))
```

With a custom port:

```powershell
$env:ZTF_PORT = "8080"; .\install.ps1
```

### Option C: Docker

```bash
git clone https://github.com/VirtuArchitect/ZTF-Orchestrator.git
cd ZTF-Orchestrator
docker compose up -d
docker compose logs -f   # admin password printed here on first run
```

ZTF is cloned and installed inside the image at build time - no separate volume mount required.
PostgreSQL is started by default and stores users, sessions, execution history,
approvals, schedules, drift results, and audit events.

For simple file-backed testing without PostgreSQL:

```bash
docker compose -f docker-compose.file.yml up -d --build
```

See [PostgreSQL Backend](docs/postgresql-backend.md) for storage-mode details.

Starter Kubernetes manifests are available in [k8s](k8s/).

### Option D: Manual

**Step 1: Clone the repository**

```bash
git clone https://github.com/VirtuArchitect/ZTF-Orchestrator.git
cd ZTF-Orchestrator
```

**Step 2: Create a virtual environment**

```powershell
# Windows (PowerShell)
python -m venv venv
venv\Scripts\activate
```

```bash
# Linux / macOS
python3 -m venv venv
source venv/bin/activate
```

**Step 3: Install Python dependencies**

```bash
pip install -r requirements.txt
```

**Step 4: Start the server**

```bash
python server.py
```

Open **http://localhost:5001** — the admin password is printed to the terminal on first run.

The pre-built frontend is served directly by Flask from `dist/`.
**No Node.js, no `npm install`, no build step required to run the tool.**

---

## First Login

On the **very first start**, the server creates a default admin account and
prints the credentials to the terminal:

```
============================================================
  First run — default admin account created
  Username: admin
  Password: a3f8c2e1d94b7...
  Change this immediately via Settings > Users.
============================================================
```

1. Copy the password from the terminal output
2. Open **http://localhost:5001** in your browser
3. Sign in with **username: `admin`** and the printed password
4. Navigate to **Settings → Users** to create your own account or change the password

### Missed the password?

Delete `users.json` and restart — credentials are printed again on next start:

```powershell
# Windows (PowerShell)
Remove-Item "$env:USERPROFILE\.ztf-ui\users.json"
python server.py
```

```bash
# Linux / macOS
rm ~/.ztf-ui/users.json
python server.py
```

---

## Features

### Dashboard
System health overview, recent execution history, and quick-action buttons.
Polls every 30 seconds and includes a manual **Refresh** button.

### Setup & Install
One-click ZTF installation — clones the framework from GitHub (or an internal
mirror) and installs pip dependencies. Requires `git` to be on the system PATH.

### Global Config
Visual editor for `global.yml` — vault type (Local/CyberArk), IPAM method
(Static/Infoblox), live YAML preview with download.

### Workflows (13 supported)

| Workflow | Category |
|---|---|
| Cluster Create | Infrastructure |
| Imaging Only | Infrastructure |
| Pod Imaging | Pod Operations |
| Site Deploy | Infrastructure |
| Configure Cluster | Configuration |
| Deploy Prism Central | Prism Central |
| Configure Prism Central | Prism Central |
| Pod Config | Pod Operations |
| Deploy Management PC | Pod Operations |
| Configure Management PC | Pod Operations |
| Calm VM Workloads | Workloads |
| Edge AI Workload | Workloads |
| NDB Deploy | Services |
| LCM Update | Lifecycle Management |

Each workflow has form-based configuration, live YAML preview, and one-click
execution with real-time terminal output.

### Script Library
61 ZTF atomic scripts across 12 categories. Searchable and individually executable.
**Multi-script composition:** click to add scripts to an ordered queue, reorder
with up/down arrows, then run all as a single ZTF invocation (`--script A,B,C`).

### Config File Manager
Create, edit, delete YAML/JSON config files. The last 5 versions of each file
are automatically backed up before any overwrite. A **History** button shows all
backup versions with timestamps and sizes; each version has a **Restore** action.

### Pipelines
Chain workflows into named, sequential pipelines. Each step is a workflow + config
file pair. Steps execute one at a time — a step only starts if the previous step
succeeded. Failed steps halt the pipeline and remaining steps are marked skipped.
A live step-progress rail shows pending / running / success / failed / skipped status.
Pipeline runs are recorded in Execution History with full step results.

### Scheduled Executions
Automate workflow runs using standard 5-field cron expressions (UTC). Create
named schedules with per-schedule YAML config. Schedules survive restarts and
fire automatically via APScheduler. Toggle enable/disable, run immediately
with **Run Now**, and review last-run status per schedule. Scheduled runs are
recorded in Execution History and fire webhook notifications.

### Parallel Execution
Run the same workflow against up to 10 sites simultaneously using a
`ThreadPoolExecutor` engine. Each site supplies its own YAML config; output
is captured per site. Overall status is `success`, `partial`, or `failed`.
Results are stored and browseable with per-site expandable terminal output.

### Approval Gates
Operators submit approval requests — specifying workflow, YAML config, and
notes — before executing sensitive operations. Admins approve or reject with
an optional decision note. Requests auto-expire after 24 hours. A pending
count badge on the sidebar signals outstanding requests to admins.

### Drift Detection
Compare a saved ZTF config file against the last successful applied config or a
pasted current-state JSON/YAML snapshot. Results are classified as **Matched**,
**Changed**, **Missing**, **Unexpected**, or **Unknown** and stored in drift
history for later review.

### Execution History
Last 1,000 execution records — workflow name, status, duration, user, timestamp.
**Re-run:** expand any row to re-run the workflow or script immediately using the
original stored config — no form re-entry required.

### Audit Log
Structured log viewer (admin only). Displays the last 200 entries from
`ztf-orchestrator.log` — timestamp, level badge, message, user, IP, and status.
Filter by level (ALL / INFO / WARNING / ERROR) or free-text search. Expandable
rows show all additional structured fields.

### Users
Admin-only user management: create accounts, assign roles, reset passwords.
Three roles are available:

| Role | Permissions |
|---|---|
| **admin** | Full access — settings, global config, user management, execution |
| **operator** | Execute workflows, manage config files, read executions |
| **viewer** | Read-only — configs, executions, system check |

### Settings
ZTF path, Python executable, config directory. Write access is admin-only.
**Notifications:** set a Webhook URL to receive a `POST` on every workflow or
script completion (payload: `workflow`, `status`, `returnCode`, `user`,
`timestamp`, `executionId`).

---

## Security Model

> **Designed for single-operator or small-team use on a trusted internal network.**
> Not designed for internet exposure without a TLS reverse proxy and additional hardening.

### Authentication
All API endpoints require a valid session token obtained via `POST /api/auth/login`.
Passwords are bcrypt-hashed. Session tokens expire after 8 hours.

### Security controls
- bcrypt password hashing (cost factor 12)
- Session tokens (64-char hex, 8-hour TTL, invalidated on logout)
- Rate limiting: 10/min on login, 10/min on execute, 2/min on install
- All subprocess calls use argument lists — no `shell=True`
- Workflow and script IDs validated against an allowlist before execution
- Path traversal protection on all config file operations
- YAML `safe_load` validation before accepting any config content
- `Content-Security-Policy`, `X-Frame-Options`, `Permissions-Policy` headers
- Server binds to `127.0.0.1` only — not reachable from the network by default

### Deployment boundary

| Context | Status |
|---|---|
| Local workstation, single user | Supported |
| Team server, internal network | Supported — add nginx + TLS in front |
| Internet-exposed | Not supported — requires TLS reverse proxy and firewall rules |

---

## Architecture

```
Browser (React 18, TypeScript, Tailwind CSS)
    |
    |  REST API + Server-Sent Events
    |  Authorization: Bearer <session-token>
    |
Flask server  (server.py — 127.0.0.1:5001)
    |
    |  subprocess([python, main.py, --workflow, X, -f, config.yml])
    |  argument list only · no shell · allowlist validated
    |
ZeroTouch Framework  (main.py)
    |
    |  HTTPS — on-premises only
    |
Nutanix Infrastructure  (Prism Central · Prism Element · Foundation Central)
```

---

## Environment Variables

All defaults work out of the box. Override via environment variables or a `.env`
file (see `.env.example`).

| Variable | Default | Purpose |
|---|---|---|
| `ZTF_DATA_DIR` | `~/.ztf-ui` | Persistent data directory |
| `ZTF_PATH` | `~/zerotouch-framework` | ZTF installation path |
| `ZTF_PYTHON` | current Python | Python executable for running ZTF |
| `ZTF_PORT` | `5001` | Flask listen port |
| `ZTF_EXEC_TIMEOUT` | `3600` | Max workflow execution time (seconds) |
| `ZTF_TOKEN_TTL` | `28800` | Session token lifetime (seconds, default 8 h) |
| `ZTF_LOG_LEVEL` | `INFO` | Log level: DEBUG, INFO, WARNING, ERROR |
| `ZTF_CONFIG_BACKUPS` | `5` | Config file backup versions to retain |

---

## Docker

```bash
# Build and start (first-run admin password printed to logs)
docker compose up -d
docker compose logs -f

# Stop
docker compose down
```

ZTF is cloned and baked into the image at build time — no separate volume mount
or manual ZTF installation required. Use build args to pin a specific ZTF version
or point to an internal mirror:

```bash
ZTF_REPO_URL=https://gitea.internal/ztf.git ZTF_REF=v2.1.0 docker compose up -d
```

| Build arg | Default | Purpose |
|---|---|---|
| `ZTF_REPO_URL` | GitHub URL | Git URL to clone ZTF from during image build |
| `ZTF_REF` | `main` | Git branch or tag to check out during image build |

The container binds only to `127.0.0.1:5001`. Place nginx in front for TLS.

---

## Data Storage

All persistent data is stored in `ZTF_DATA_DIR` (default `~/.ztf-ui/` on Linux/macOS,
`C:\Users\<you>\.ztf-ui\` on Windows). The directory is created with 0700 permissions;
all files within use 0600.

| Path | Contents |
|---|---|
| `users.json` | User accounts with bcrypt-hashed passwords |
| `settings.json` | ZTF path, Python path, config directory, webhook URL |
| `history.json` | Last 1,000 execution records |
| `pipelines.json` | Named pipeline definitions |
| `schedules.json` | Scheduled execution definitions |
| `parallel_runs.json` | Parallel multi-site run results (last 100) |
| `approvals.json` | Approval request records (last 200) |
| `ztf-orchestrator.log` | Structured JSON application log (Audit Log source) |
| `configs/` | User-generated YAML/JSON workflow config files |
| `configs/*.yml.bak.N` | Automatic backups — last 5 versions per file |

`global.yml` is written to `<ZTF_PATH>/config/global.yml`.

---

## Air-Gapped Deployment

Both ZTF and ZTF-Orchestrator can run with no internet access.

**Key points:**
- `dist/` is pre-built and committed — `npm install` is not needed at runtime
- ZTF includes `calm-whl/` bundled wheels — PyPI access is not needed for Calm DSL
- Set `ZTF_PATH` to a pre-cloned local copy of zerotouch-framework
- For the in-app Setup page, set the repository URL to your internal Git mirror
  and add that URL to `ALLOWED_REPOS` in `server.py`
- For Docker air-gap, build the image with `ZTF_REPO_URL` pointing to your mirror
- Use a local PyPI mirror (devpi / Artifactory) for pip installs

---

## Development Mode

Use this mode when modifying frontend TypeScript/React code.
Requires Node.js 18+.

Run both servers simultaneously in **separate terminals**:

```bash
# Terminal 1 — Flask API (port 5001)
source venv/bin/activate   # or venv\Scripts\activate on Windows
python server.py

# Terminal 2 — Vite dev server with hot reload (port 5173)
npm install
npm run dev
```

Open **http://localhost:5173**

Vite proxies all `/api` and `/health` requests to Flask on port 5001.

> **Note:** `http://localhost:5001` serves the pre-built app (no hot reload).
> `http://localhost:5173` serves the live dev version.

---

## Development Reference

```bash
# Activate virtual environment first
source venv/bin/activate        # Linux/macOS
venv\Scripts\activate           # Windows

# Run tests
pytest tests/ -v --cov=server --cov-report=term-missing

# Vulnerability scan
pip install pip-audit
pip-audit -r requirements.txt
npm audit

# TypeScript type check
npx tsc --noEmit

# Build frontend (outputs to dist/)
npm run build
```

---

## Maintainer

ZTF-Orchestrator is developed and maintained by **John Goulden**.

---

## Deployment Guides

| Guide | Description |
|---|---|
| [docs/nginx-tls.md](docs/nginx-tls.md) | nginx reverse proxy with TLS 1.2+, HSTS, SSE-safe settings, BSI alignment |
| [docs/systemd.md](docs/systemd.md) | systemd service unit with hardening, resource limits, journald logging |

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.
