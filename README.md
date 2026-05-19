# ZTF-Orchestrator

A web-based installer and configuration orchestrator for the [Nutanix ZeroTouch Framework](https://github.com/nutanixdev/zerotouch-framework), replacing GitHub-based configuration management with a visual interface.

## Quick Start

```bash
# Install Node dependencies
npm install

# Start the UI and API servers
npm run dev
```

Or use the Python Flask backend directly:

```bash
pip install -r requirements.txt
python server.py
```

Open **http://localhost:5001** in your browser.

## Security Model

> **This tool is designed for single-operator use on a trusted local machine.**
> It is not designed for multi-user or internet-exposed deployments without additional hardening.

### API Key Authentication

On first startup, the server generates a random 64-character API key and saves it to `~/.ztf-ui/.api_key` (permissions: 0600). The key is printed to the server console.

**First run setup:**
1. Start the server — the API key is printed to the console
2. Open http://localhost:5001
3. Go to **Settings** and paste the API key into the **API Key** field
4. Click **Save Settings** — the key is stored in your browser's localStorage

All API requests require this key via the `X-API-Key` header. Requests without a valid key return HTTP 401.

### Security Boundaries

| Deployment | Safe? | Notes |
|---|---|---|
| Local workstation, single user | Yes | Intended use case |
| Shared team server with localhost tunnel | With care | Add TLS, ensure only authorised users have access |
| Exposed to a network or internet | No | Requires reverse proxy with TLS + additional auth |

### What is protected

- **Command injection**: Workflow and script IDs are validated against a hardcoded allowlist before being passed to subprocess. Subprocess calls use argument lists, not shell strings.
- **Path traversal**: Config file names are validated and resolved paths are checked to remain within the configs directory.
- **CORS**: Restricted to localhost origins only.
- **Request size**: Bodies limited to 1 MB.
- **YAML**: All user-supplied YAML is validated with `yaml.safe_load()` before acceptance.
- **File permissions**: `~/.ztf-ui/` is created with 0700, all files within with 0600.
- **Execution history**: Full commands and config paths are not stored in history to avoid credential exposure.
- **Error messages**: Exception details are logged server-side only; clients receive a generic failure message.

### What is not protected (known limitations)

- **No multi-user RBAC**: All authenticated users have full access to all operations.
- **No execution timeout**: Long-running ZTF processes are not automatically killed.
- **Credentials in global.yml**: ZTF's `global.yml` stores credentials as YAML. Use the CyberArk vault backend in production environments.
- **No audit log**: Execution history tracks workflow name and status, not full audit trails.

## Requirements

- Python 3.9+
- pip
- git
- Node.js (for frontend dev server)

## Features

### Dashboard
- System status and health checks
- Recent execution history
- Quick action buttons for common workflows

### Setup & Install
- Automated ZTF framework installation (clones GitHub repo + installs pip dependencies)
- Prerequisites check (Python, pip, git)
- Real-time installation output

### Global Configuration (`global.yml`)
- Visual credential manager for all ZTF credential references
- Vault settings (Local or CyberArk)
- IPAM configuration (Static or Infoblox)
- Live YAML preview and download

### Workflows (13 supported)

| Workflow | Category |
|----------|----------|
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

Each workflow has form-based configuration, live YAML generation, and one-click execution with real-time log streaming.

### Script Library (60+ scripts)
- Browse all ZTF scripts organised by category
- Run individual scripts with custom configuration
- Real-time execution output

### Config File Manager
- Browse, create, edit, and delete YAML/JSON config files
- YAML validation on save

### Execution History
- History of all workflow and script runs
- Filter by status

### Settings
- ZTF installation path
- Python executable path
- Config files directory
- API Key management

## Architecture

```
Browser (React 18, TypeScript, Tailwind CSS)
         ↕  REST API + SSE  [X-API-Key header required]
Python Flask Server (server.py)  [localhost:5001]
         ↕  subprocess (argument list, no shell)
ZeroTouch Framework (main.py)
```

## First Time Setup

1. Start the server: `python server.py`
2. Copy the API key printed to the console
3. Open http://localhost:5001
4. Go to **Settings** → paste the API key → Save
5. Go to **Setup & Install** → run Prerequisites Check → Install Framework
6. Go to **Global Config** → add credentials
7. Go to **Workflows** → configure and run

## Data Storage

All data is stored in `~/.ztf-ui/` (permissions: 0700):

| File | Purpose |
|---|---|
| `.api_key` | Server API key (0600) |
| `settings.json` | ZTF path and Python path |
| `history.json` | Last 100 execution records |
| `configs/` | User-generated YAML/JSON config files (0600 each) |

`global.yml` is written directly to the ZTF installation directory (`<ztfPath>/config/global.yml`).
