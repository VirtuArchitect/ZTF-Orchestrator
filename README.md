# ZTF-Orchestrator · v1.4.0

A web-based installer and configuration orchestrator for the
[Nutanix ZeroTouch Framework](https://github.com/nutanixdev/zerotouch-framework)
and guided
[Nutanix Kubernetes Platform](https://www.nutanix.com/products/cloud-native/kubernetes-platform)
automation via the optional
[NKP ZeroTouch Framework](https://github.com/VirtuArchitect/nkp-zerotouch-framework)
integration.

Unofficial community framework orchestration. This project is not affiliated with or supported by Nutanix.

ZTF-Orchestrator turns ZeroTouch Framework and NKP deployment preparation into
an internal operations console: teams can define connection settings, generate
workflow or NKP profile YAML, register NKP binaries, check CLI compatibility,
submit execution jobs, capture validation evidence, track output, detect drift,
schedule repeatable tasks, request approvals, and review audit history without
every operator working directly in Git, YAML, and CLI commands.

## ZeroTouch Framework Compatibility

ZTF-Orchestrator's workflow and script launcher targets the legacy
ZeroTouch Framework 1.x CLI (`python main.py --workflow ...` and
`python main.py --script ...`). The default install, Docker, appliance, and
container publishing paths therefore pin ZeroTouch Framework to **v1.5.2**.

`nutanixdev/zerotouch-framework` v2.0.0 is a ground-up rewrite with a new
`ztf plan/apply/refresh/destroy` command model. Upstream v2.0.0 does not yet
port the Foundation Central imaging workflows, Prism Element v2 script family,
pod workflows, Calm/NCM workflows, NDB workflow, or legacy NKE/Karbon flows that
this Orchestrator release exposes. If a ZTF 2.x checkout is configured,
ZTF-Orchestrator reports it as incompatible and blocks legacy workflow/script
execution instead of launching it through the wrong CLI.

Future ZTF 2.x support should be implemented as a separate IaC/plan-apply mode,
not as a drop-in replacement for the current workflow catalog.

## Engineering Quality

This project follows a production-grade quality bar. Changes are expected to
include relevant tests, smoke-test evidence, and security review when sensitive
code is touched. CI checks should pass before merge.

Quality gates include:

- Unit, integration, or end-to-end tests as appropriate.
- Linting and type checks where supported.
- Build verification.
- Manual or automated smoke testing for changed workflows.
- Security review for auth, user data, permissions, file handling,
  dependencies, and external input.

## Why It Exists

ZeroTouch Framework is powerful automation. ZTF-Orchestrator makes that power
easier to consume in day-to-day operations by adding:

- Guided configuration instead of hand-written YAML for common workflows.
- Appliance operations for AHV artifact archive tracking, first-boot checks,
  NKP readiness review, and ZTF compatibility mode visibility.
- Durable job execution instead of browser-bound terminal sessions.
- PostgreSQL-backed operational state for Docker deployments.
- RBAC, approvals, audit logs, and validation status for governance.
- Drift checks, schedules, pipelines, and parallel execution for repeatability.

It complements Prism Central and Foundation Central. It does not replace them;
it orchestrates repeatable ZeroTouch Framework workflows that call Nutanix APIs.

---

## Requirements

| Requirement | Version | Notes |
|---|---|---|
| Python | **3.10+** | 3.10, 3.11, and 3.12 are all supported |
| pip | any | Bundled with Python 3.10+ |
| git | any | Required to clone both repos |
| Node.js | 18+ | Development mode only - not needed to run the tool |

> **Windows users:** `python` and `python3` both work depending on your installation.
> Always use a virtual environment (see below) to avoid polluting your system Python.

> **Port note (Windows):** Hyper-V reserves ports 4940–5039. If the server fails to
> start on the default port 5001, set `$env:ZTF_PORT = "8080"` before starting.

<img width="1438" height="734" alt="image" src="https://github.com/user-attachments/assets/2a679d02-8c6e-48b3-971b-4abebda1a6e8" />




---

## Installation

For a detailed step-by-step guide covering every supported installation option,
including Docker, appliance, Kubernetes starters, manual installs, and
air-gapped deployment, see
[Installation Guide](docs/installation-guide.md).

### Option A: One-Command (Linux / macOS) - Recommended

```bash
curl -fsSL https://raw.githubusercontent.com/VirtuArchitect/ZTF-Orchestrator/main/install.sh | bash
```

With custom options:

```bash
ZTF_PORT=8080 ZTF_INSTALL_DIR=/opt/ztf ZTF_REF=v1.5.2 bash install.sh
```

The script automatically:
1. Checks Python 3.10+, pip, and git are present
2. Clones ZTF-Orchestrator into `~/ztf/ZTF-Orchestrator`
3. Clones ZeroTouch Framework `v1.5.2` into `~/ztf/zerotouch-framework`
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

To override the pinned legacy framework ref for testing:

```powershell
$env:ZTF_REF = "v1.5.2"; .\install.ps1
```

### Option C: Docker

```bash
git clone https://github.com/VirtuArchitect/ZTF-Orchestrator.git
cd ZTF-Orchestrator
cp .env.example .env
# Edit .env and set a unique POSTGRES_PASSWORD before first start.
docker compose up -d
docker compose logs -f   # admin password printed here on first run
```

For one-off Windows PowerShell testing, the PostgreSQL password and database URL
must use the same password:

```powershell
$env:POSTGRES_PASSWORD="use-a-unique-value"
$env:ZTF_DATABASE_URL="postgresql://ztf:use-a-unique-value@postgres:5432/ztf_orchestrator"
docker compose up -d --build
```

For repeatable starts, put those values in `.env` instead of setting them only
for the current PowerShell session.

ZTF is cloned and installed inside the image at build time - no separate volume mount required.
PostgreSQL is started by default and stores users, sessions, execution history,
approvals, schedules, drift results, execution jobs, and audit events. Workflow
and script runs are submitted as durable jobs, then processed by background
workers so execution is no longer tied to an open browser request.

For simple file-backed testing without PostgreSQL:

```bash
docker compose -f docker-compose.file.yml up -d --build
```

See [PostgreSQL Backend](docs/postgresql-backend.md) for storage-mode details.
See [Validation Status](docs/validation-status.md) for what has been locally
validated and what still requires infrastructure UAT.
See [NKP v2.17 Alignment](docs/nkp-v217-alignment.md) for a traceability matrix
between the NKP guide, the NKP framework, and the current ZTF-Orchestrator
integration.
See [Security Assessment](docs/security/SECURITY_ASSESSMENT.md) for the latest
repository-level security review and current hardening recommendations.

Starter Kubernetes manifests are available in [k8s](k8s/).

### Option D: Appliance Deployment

For AHV or VM-based deployments, use the reproducible appliance kit in
[appliance](appliance/). The kit is designed for a small Linux VM running Docker
Compose, PostgreSQL, and the published ZTF-Orchestrator container image.

The repository does not store QCOW2 or OVA binaries. Large appliance images are
published as GitHub Actions artifacts or stored in an internal artifact
repository because GitHub Release assets have a 2 GiB per-file limit. The repo
contains:

- a GHCR container publishing workflow;
- an appliance Compose file that pulls `ghcr.io/virtuarchitect/ztf-orchestrator`;
- first-boot scripts that generate local secrets on the VM;
- a systemd unit for appliance lifecycle;
- cloud-init examples;
- a reference Packer template for AHV-importable QCOW2 builds.

Quick start on a fresh Linux VM:

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates
git clone https://github.com/VirtuArchitect/ZTF-Orchestrator.git /opt/ztf-orchestrator-source
sudo bash /opt/ztf-orchestrator-source/appliance/scripts/firstboot.sh
```

See [Appliance Kit](appliance/README.md) for AHV sizing, first-boot behavior,
version pinning, and QCOW2 build guidance.

### Option E: Manual

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
System health overview, recent execution history, quick-action buttons, and
operational visibility panels. Polls every 30 seconds and includes a manual
**Refresh** button. Compact sections show deployment readiness, queue pressure,
governance attention, schedule state, and storage/backup posture:
ZTF/NKP readiness, NKP deployment profile count, generated NKP configs, queued /
running / failed / long-running jobs, pending approvals, drifted checks, unknown
baselines, enabled schedules, next schedule run, last failed schedule, storage
backend, latest database backup, and backup warnings.

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

### Jobs / Queue
View durable execution jobs created by workflow and script submissions. The page
shows active, queued, running, failed, cancelled, and interrupted job counts,
phase-based estimated progress, persisted job logs, worker timestamps, return
codes, and cancellation controls for queued or running jobs. Admins can delete
terminal queue records after review; queued and running records must be
cancelled or completed before deletion. Progress percentages are orchestration
estimates based on queue state, process launch, and observable ZTF output. When
ZTF or NKP output includes Nutanix task UUIDs, the job captures and displays
those task IDs for follow-up in Prism Central or Prism Element.

### NKP Framework
Optional integration with
[`VirtuArchitect/nkp-zerotouch-framework`](https://github.com/VirtuArchitect/nkp-zerotouch-framework)
for Nutanix Kubernetes Platform automation. The first integration exposes
install/update, framework status, and safe phases only: `validate`, `prepare`,
`generate`, `registry`, `deploy`, `verify`, `kubeconfig`, `secrets`, `backup`,
`runs`, and `ci`. Apply, registry push, upgrade, and destroy actions remain
blocked server-side. Controlled NKP phases (`prepare`, `generate`, `registry`,
and `deploy`) require an approved Approval Gate request before they can be
queued. NKP phase output is submitted through Jobs / Queue so logs, estimated
progress, detected task IDs, history, and cancellation follow the same
operational model as ZTF jobs.

The NKP page also includes a Deployment Profile Builder. Operators can define
the NKP binary/source details, Prism Central endpoint, credential references,
cluster type/version/VIP, DNS/NTP/gateway/subnet information, VLAN/domain
settings, and node inventory with host/CVM/IPMI addresses. Saved profiles can be
validated and rendered into NKP example-style YAML in the existing Config Files
area, then used by the safe-phase launcher. The generated YAML is intentionally
transparent and editable so teams can align it with the exact NKP ZeroTouch
schema they adopt.

Saved NKP profiles are versioned. Each create, update, and restore action writes
an append-only profile revision entry with the operator, timestamp, revision
number, and full profile snapshot. Restoring an older profile creates a new
revision rather than rewriting history. When an NKP safe-phase job is submitted
from a saved profile, the queue record stores trace metadata including profile
ID, profile name, profile revision, template, generated config file, approval ID,
and schema validation status. If a stale profile revision is submitted, the API
rejects it and asks the operator to refresh before launching.

NKP Deployment Template Packs provide guided starting points for common
deployment patterns: **Management Cluster**, **Workload Cluster**, and
**Air-Gapped / Local Registry**. Each pack includes profile defaults, required
fields, optional fields, and a preflight checklist. Applying a template prepares
an editable profile draft; operators still review, fill in site-specific values,
check readiness, and save before generating YAML or submitting approval-gated
phases.

Template metadata is stored with the profile and included in generated YAML.
The preview action lets operators inspect template-specific YAML before saving
or writing a config file. Readiness checks also adapt to the selected pack:
management clusters warn when undersized, workload clusters require a
management-cluster reference, and air-gapped profiles require a local registry
and staged NKP binary path.

The NKP page also discovers installed examples from `configs/environments` in
the configured NKP framework path. ZTF-Orchestrator infers the expected YAML
shape from those examples, validates previews against that shape, and can import
an example into an editable deployment profile. This keeps generated YAML
aligned with the NKP framework installed on the appliance instead of relying on
a static, guessed schema.

The NKP Binary Manager lets operators register NKP binaries or bundles already
staged on the Orchestrator host, upload smaller bundles into the Orchestrator
data directory, record version/source/checksum/default metadata, and apply a
managed binary path directly to a deployment profile. Large production bundles
are best staged on the VM/appliance and registered by path rather than uploaded
through the browser.

Deployment readiness validation scores each NKP profile before execution. The
readiness check verifies required fields, Prism Central endpoint format,
optional API reachability, subnet membership, duplicate IPs, VLAN range, NKP
binary/source path hints, and generated YAML syntax. Profiles are marked
**ready**, **needs attention**, or **blocked** with pass/warning/fail details.
Pasted NKP YAML is parsed before a safe-phase job is queued.

### Validation Evidence
Timestamped evidence records for NKP deployment readiness. Admins and operators
can create an evidence run from a saved NKP profile; viewers can read and
download existing records. Each bundle captures readiness scoring, generated
YAML, schema validation, optional NKP CLI compatibility output, notes, linked
approval/job/task references where available, and a Markdown summary. Downloads
are ZIP bundles intended for change records, customer UAT, and handover packs.

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
**Storage:** view active backend, database location, retention windows, and
create/download admin-only PostgreSQL logical backups. Admins can also restore
a backup from Settings after a guarded confirmation flow; the app creates a
safety backup first and recommends a service restart after restore.
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
- Docker Compose publishes the application to `127.0.0.1:5001` by default

### Deployment boundary

| Context | Status |
|---|---|
| Local workstation, single user | Supported |
| Team server, internal network | Supported — add nginx + TLS in front |
| Internet-exposed | Not supported — requires TLS reverse proxy and firewall rules |

For vulnerability reporting and baseline security guidance, see
[SECURITY.md](SECURITY.md). For the latest repository-level assessment, see
[docs/security/SECURITY_ASSESSMENT.md](docs/security/SECURITY_ASSESSMENT.md).

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
ZeroTouch Framework 1.x  (main.py)
    |
    |  HTTPS — on-premises only
    |
Nutanix Infrastructure  (Prism Central · Prism Element · Foundation Central)
```

---

## Environment Variables

Manual/file-backed defaults work out of the box. PostgreSQL-backed Docker
deployments require `POSTGRES_PASSWORD` in `.env` before first start. Override
other settings via environment variables or a `.env` file (see `.env.example`).

| Variable | Default | Purpose |
|---|---|---|
| `ZTF_DATA_DIR` | `~/.ztf-ui` | Persistent data directory |
| `ZTF_PATH` | `~/zerotouch-framework` | ZTF installation path |
| `ZTF_NKP_PATH` | `~/nkp-zerotouch-framework` | Optional NKP ZeroTouch Framework path |
| `ZTF_PYTHON` | current Python | Python executable for running ZTF |
| `ZTF_REF` | `v1.5.2` | ZeroTouch Framework branch/tag used by Docker and installer paths. Current Orchestrator workflows require ZTF 1.x. |
| `ZTF_PORT` | `5001` | Flask listen port |
| `ZTF_BIND_HOST` | `127.0.0.1` | Flask bind address for manual runs. Docker sets `0.0.0.0` inside the container. |
| `ZTF_EXEC_TIMEOUT` | `3600` | Max workflow execution time (seconds) |
| `ZTF_EXEC_WORKERS` | `1` | Background execution worker count |
| `ZTF_BACKUP_TIMEOUT` | `300` | Max PostgreSQL backup runtime (seconds) |
| `ZTF_NKP_BINARY_MAX_UPLOAD` | `536870912` | Max NKP binary upload size in bytes |
| `ZTF_TOKEN_TTL` | `28800` | Session token lifetime (seconds, default 8 h) |
| `ZTF_LOG_LEVEL` | `INFO` | Log level: DEBUG, INFO, WARNING, ERROR |
| `ZTF_CONFIG_BACKUPS` | `5` | Config file backup versions to retain |
| `ZTF_WEBHOOK_ALLOWED_HOSTS` | empty | Optional comma-separated webhook hostname allowlist |
| `ZTF_WEBHOOK_ALLOW_INSECURE` | `false` | Lab-only option to allow HTTP webhooks |

---

## Docker

```bash
# Build and start (first-run admin password printed to logs)
cp .env.example .env
# Edit .env and set a unique POSTGRES_PASSWORD.
docker compose up -d
docker compose logs -f

# Stop
docker compose down
```

ZTF is cloned and baked into the image at build time — no separate volume mount
or manual ZTF installation required. Use build args to pin a specific ZTF version
or point to an internal mirror:

```bash
ZTF_REPO_URL=https://gitea.internal/ztf.git ZTF_REF=v1.5.2 docker compose up -d
```

| Build arg | Default | Purpose |
|---|---|---|
| `ZTF_REPO_URL` | GitHub URL | Git URL to clone ZTF from during image build |
| `ZTF_REF` | `v1.5.2` | Git branch or tag to check out during image build. Keep this on ZTF 1.x for the current workflow/script launcher. |

The container binds only to `127.0.0.1:5001`. Place nginx in front for TLS.

In Docker and appliance images, the bundled ZeroTouch Framework directory is not
a git checkout. The in-app Setup page can reinstall Python dependencies, but it
cannot `git pull` that baked copy. To update the bundled framework, rebuild the
image with the desired `ZTF_REF` or point Settings > Framework Location at a
separate cloned ZTF 1.x checkout.

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
| `validation_evidence.json` | Timestamped NKP validation evidence and export metadata |
| `ztf-orchestrator.log` | Structured JSON application log (Audit Log source) |
| `configs/` | User-generated YAML/JSON workflow config files |
| `configs/*.yml.bak.N` | Automatic backups — last 5 versions per file |

PostgreSQL logical backups created from Settings are stored in
`backups/postgres/*.dump`.

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
| [docs/installation-guide.md](docs/installation-guide.md) | Step-by-step installation guide for one-command, Docker, appliance, manual, Kubernetes, and air-gapped deployments |
| [docs/appliance-update-manager.md](docs/appliance-update-manager.md) | Connected and air-gapped Appliance Update Manager workflow |
| [docs/nkp-v217-alignment.md](docs/nkp-v217-alignment.md) | Truthful NKP v2.17 alignment matrix, supported areas, partial areas, and UAT gaps |
| [docs/nginx-tls.md](docs/nginx-tls.md) | nginx reverse proxy with TLS 1.2+, HSTS, SSE-safe settings, BSI alignment |
| [docs/systemd.md](docs/systemd.md) | systemd service unit with hardening, resource limits, journald logging |

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.
