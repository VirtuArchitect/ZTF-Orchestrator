# ZTF-Orchestrator

A web-based installer and configuration orchestrator for the
[Nutanix ZeroTouch Framework](https://github.com/nutanixdev/zerotouch-framework),
replacing GitHub-based configuration management with a visual interface.

---

## Requirements

| Requirement | Version | Notes |
|---|---|---|
| Python | **3.10+** | 3.10 minimum earlier versions are not supported |
| pip | any | Included with Python |
| git | any | Optional only needed for the in-app Setup/Install feature |
| Node.js | 18+ | Development mode only not needed to run the tool |

> **Windows users:** `python` and `python3` both work depending on your installation.
> Always use a virtual environment (see below) to avoid polluting your system Python.

---

## Installation

### Step 1: Clone the repository

```bash
git clone https://github.com/VirtuArchitect/ZTF-Orchestrator.git
cd ZTF-Orchestrator
```

### Step 2: Create a virtual environment

**Windows (PowerShell):**
```powershell
python -m venv venv
venv\Scripts\activate
```

**Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### Step 3: Install Python dependencies

```bash
pip install -r requirements.txt
```

This installs: `flask`, `flask-cors`, `flask-limiter`, `pyyaml`, `bcrypt` (all pinned).

### Step 4: Start the server

```bash
python server.py
```

Open **http://localhost:5001**

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

**Windows (PowerShell):**
```powershell
Remove-Item "$env:USERPROFILE\.ztf-ui\users.json"
python server.py
```

**Linux / macOS:**
```bash
rm ~/.ztf-ui/users.json
python server.py
```

---

## Quick Start (summary)

```powershell
# Windows
git clone https://github.com/VirtuArchitect/ZTF-Orchestrator.git
cd ZTF-Orchestrator
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python server.py
# Open http://localhost:5001 — password printed to this terminal
```

```bash
# Linux / macOS
git clone https://github.com/VirtuArchitect/ZTF-Orchestrator.git
cd ZTF-Orchestrator
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python server.py
# Open http://localhost:5001 — password printed to this terminal
```

---

## Security Model

> **Designed for single-operator or small-team use on a trusted internal network.**
> Not designed for internet exposure without a TLS reverse proxy and additional hardening.

### Authentication
All API endpoints require a valid session token obtained via `POST /api/auth/login`.
Passwords are bcrypt-hashed. Session tokens expire after 8 hours.

### Roles

| Role | Permissions |
|---|---|
| **admin** | Full access — settings, global config, user management, execution |
| **operator** | Execute workflows, manage config files, read executions |
| **viewer** | Read-only — configs, executions, system check |

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
> `http://localhost:5173` serves the live dev version. Use the port that matches
> the server you want.

---

## Features

### Dashboard
System health overview, recent execution history, quick-action buttons.

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

Each workflow has form-based configuration, live YAML preview, and one-click
execution with real-time terminal output.

### Script Library
61 ZTF atomic scripts across 12 categories. Searchable and individually executable.

### Config File Manager
Create, edit, delete YAML/JSON config files. The last 5 versions of each file
are automatically backed up before any overwrite.

### Execution History
Last 1000 execution records — workflow name, status, duration, user, timestamp.

### Settings
ZTF path, Python executable, config directory. Write access is admin-only.

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

The container binds only to `127.0.0.1:5001`. Place nginx in front for TLS.

---

## Data Storage

All persistent data is stored in `ZTF_DATA_DIR` (default `~/.ztf-ui/` on Linux/macOS,
`C:\Users\<you>\.ztf-ui\` on Windows). The directory is created with 0700 permissions;
all files within use 0600.

| Path | Contents |
|---|---|
| `users.json` | User accounts with bcrypt-hashed passwords |
| `settings.json` | ZTF path, Python path, config directory |
| `history.json` | Last 1000 execution records |
| `ztf-orchestrator.log` | Structured JSON application log |
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
- Point `ZTF_PATH` to your local clone; set the repo URL in Settings to your
  internal Git mirror, then add that URL to `ALLOWED_REPOS` in `server.py`
- Use a local PyPI mirror (devpi / Artifactory) for pip installs

---

## Development Reference

```bash
# Activate virtual environment first
source venv/bin/activate        # Linux/macOS
venv\Scripts\activate           # Windows

# Run tests
pytest tests/ -v --cov=server --cov-report=term-missing

# Vulnerability scan (install pip-audit separately)
pip install pip-audit
pip-audit -r requirements.txt
npm audit

# TypeScript type check
npx tsc --noEmit

# Build frontend (outputs to dist/)
npm run build
```

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.
