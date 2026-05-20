# ZTF-Orchestrator

A web-based installer and configuration orchestrator for the
[Nutanix ZeroTouch Framework](https://github.com/nutanixdev/zerotouch-framework),
replacing GitHub-based configuration management with a visual interface.

---

## Quick Start

### Option A — Production (Flask serves everything on one port)

```bash
pip install -r requirements.txt
python server.py
```

Open **http://localhost:5001**

Flask serves the pre-built frontend from `dist/` and handles all API calls.
This is the recommended way to run the tool.

### Option B — Development (Vite hot-reload + Flask API)

Run both servers simultaneously in separate terminals:

```bash
# Terminal 1 — Flask API (port 5001)
pip install -r requirements.txt
python server.py

# Terminal 2 — Vite dev server (port 5173)
npm install
npm run dev
```

Open **http://localhost:5173**

Vite proxies all `/api` and `/health` requests to Flask on port 5001.
Use this mode when modifying frontend code.

> **Common mistake:** Opening `http://localhost:5001` when only Vite is running
> (or `http://localhost:5173` when only Flask is running) will show a blank page
> or connection error. Match the URL to whichever server you started.

---

## First Login

On the **very first start**, `server.py` creates a default admin account and
prints the credentials to the terminal:

```
============================================================
  First run — default admin account created
  Username: admin
  Password: a3f8c2e1d94b...
  Change this immediately via Settings > Users.
============================================================
```

1. Copy the password from the terminal output
2. Open the app in your browser
3. Sign in with **username: `admin`** and the printed password
4. Go to **Settings → Users** and create your own account or change the password

### Missed the password?

If you missed the console output, reset it by deleting the users file and
restarting the server — it will regenerate:

```bash
# Linux / macOS
rm ~/.ztf-ui/users.json
python server.py

# Windows (PowerShell)
Remove-Item "$env:USERPROFILE\.ztf-ui\users.json"
python server.py
```

---

## Requirements

- Python 3.9+
- pip
- Node.js 18+ (development mode only)
- git

---

## Security Model

> **Designed for single-operator or small-team use on a trusted internal network.**
> Not designed for internet exposure without a TLS reverse proxy and additional hardening.

### Authentication
On first start the server generates a default admin account. All API endpoints
require a valid session token obtained via `POST /api/auth/login`.

### Roles

| Role | Permissions |
|---|---|
| **admin** | Full access — settings, global config, user management, execution |
| **operator** | Execute workflows, manage config files, read executions |
| **viewer** | Read-only — configs, executions, system check |

### Security controls in place
- bcrypt password hashing
- Session tokens (8-hour TTL, invalidated on logout)
- Rate limiting on login (10/min) and execute (10/min)
- Subprocess argument lists — no shell execution
- Workflow/script allowlist validation before any subprocess call
- Path traversal protection on all config file operations
- YAML `safe_load` validation before accepting any config content
- `Content-Security-Policy`, `X-Frame-Options`, `Permissions-Policy` headers
- Server binds to `127.0.0.1` only

### Deployment boundary

| Context | Safe? |
|---|---|
| Local workstation, single user | Yes |
| Team server, internal network | Yes — add nginx + TLS in front |
| Internet-exposed | No — requires TLS, reverse proxy, and firewall rules |

---

## Features

### Dashboard
System health, recent execution history, quick-action buttons.

### Setup & Install
One-click ZTF installation (git clone + pip install) with real-time output.

### Global Config
Visual credential manager for `global.yml` — vault type (Local/CyberArk),
IPAM method (Static/Infoblox), live YAML preview.

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

### Script Library
61 ZTF scripts across 12 categories. Searchable and individually executable.

### Config File Manager
Create, edit, delete YAML/JSON config files. Automatic backup of the last 5
versions before any overwrite.

### Execution History
Last 1000 execution records with status, duration, and user.

### Settings
ZTF path, Python executable, config directory. Admin-only write access.

---

## Architecture

```
Browser (React 18, TypeScript, Tailwind CSS)
    |
    | REST API + SSE  [Authorization: Bearer <token>]
    |
Flask server (server.py — 127.0.0.1:5001)
    |
    | subprocess([python, main.py, --workflow, X, -f, config.yml])
    | no shell=True · allowlist validated · argument list only
    |
ZeroTouch Framework (main.py)
    |
    | HTTPS (on-premises)
    |
Nutanix Infrastructure (Prism Central · Prism Element · Foundation Central)
```

---

## Environment Variables

All configuration is injectable at runtime. See `.env.example` for the full list.

| Variable | Default | Purpose |
|---|---|---|
| `ZTF_DATA_DIR` | `~/.ztf-ui` | Persistent data directory |
| `ZTF_PATH` | `~/zerotouch-framework` | ZTF installation path |
| `ZTF_PYTHON` | current Python | Python executable |
| `ZTF_PORT` | `5001` | Flask listen port |
| `ZTF_EXEC_TIMEOUT` | `3600` | Max execution time (seconds) |
| `ZTF_TOKEN_TTL` | `28800` | Session token TTL (seconds) |
| `ZTF_LOG_LEVEL` | `INFO` | Log level |

---

## Docker

```bash
# Build and start
docker compose up -d

# View logs (includes first-run admin credentials)
docker compose logs -f

# Stop
docker compose down
```

The container binds only to `127.0.0.1:5001`. Put nginx in front for TLS.

---

## Data Storage

All data is stored in `ZTF_DATA_DIR` (default `~/.ztf-ui/`, permissions 0700):

| File | Contents |
|---|---|
| `users.json` | User accounts with bcrypt-hashed passwords |
| `settings.json` | ZTF path, Python path, config directory |
| `history.json` | Last 1000 execution records |
| `ztf-orchestrator.log` | Structured JSON application log |
| `configs/` | User-generated YAML/JSON workflow configs |
| `configs/*.yml.bak.N` | Config file backups (last 5 per file) |

`global.yml` is written to `<ztfPath>/config/global.yml`.

---

## Air-Gapped Deployment

Both ZTF and ZTF-Orchestrator can run fully offline. See the
[Architecture & Improvement Plan document](docs/) for the full air-gap
deployment procedure.

Key points:
- `dist/` is pre-built and committed — no `npm install` required at runtime
- ZTF includes `calm-whl/` wheels — no PyPI access required for calm-dsl
- Set `ZTF_PATH` to a pre-cloned local copy of zerotouch-framework
- Add your internal Git mirror URL to `ALLOWED_REPOS` in `server.py`

---

## Development

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install Node dependencies (dev only)
npm install

# Run tests
pytest tests/ -v --cov=server

# Vulnerability scan
pip-audit -r requirements.txt
npm audit

# TypeScript check
npx tsc --noEmit

# Build frontend
npm run build
```
