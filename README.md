# ZeroTouch Framework UI

A fully functional web-based installer and configuration UI for the [Nutanix ZeroTouch Framework](https://github.com/nutanixdev/zerotouch-framework), replacing GitHub-based configuration management with a visual interface.

## Quick Start

```bash
# Install Python dependencies
pip3 install flask flask-cors pyyaml

# Start the UI server
python3 server.py
```

Open **http://localhost:5001** in your browser.

Or use the start script:
```bash
bash start.sh
```

## Requirements

- **Python 3.9+** (already installed on your system)
- **pip** (for installing dependencies)
- **Internet connection** (for initial ZTF install and CDN-based UI assets)
- **git** (for cloning ZTF repository)

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

Each workflow has:
- Visual form-based configuration
- Live YAML generation matching ZTF format
- Download config file
- One-click execution with real-time log streaming

### Script Library (40+ scripts)
- Browse all ZTF scripts organized by category
- Run individual scripts with custom configuration
- Real-time execution output

### Config File Manager
- Browse, create, edit, and delete YAML/JSON config files
- Upload/download configs
- Syntax-highlighted editor

### Execution History
- Full history of all workflow and script runs
- Filter by status (all/success/failed)
- View command details

### Settings
- Configure ZTF installation path
- Python executable path
- Config files directory

## Architecture

```
Browser (React 18 via ESM + Tailwind CSS)
         ↕  REST API + SSE
Python Flask Server (server.py)
         ↕  subprocess
ZeroTouch Framework (main.py)
```

The UI runs entirely client-side using ES modules from esm.sh (no build step required).
The Flask server handles API calls, file management, and executing ZTF commands.

## File Structure

```
ztf-ui/
├── server.py        # Flask backend (REST API + SSE execution)
├── static/
│   ├── index.html   # HTML entry point (CDN imports)
│   └── app.js       # Complete React SPA (ES modules)
├── requirements.txt # Python dependencies
└── start.sh         # Quick start script
```

## First Time Setup

1. Start the server: `python3 server.py`
2. Open http://localhost:5001
3. Go to **Setup & Install** → click "Run Prerequisites Check"
4. Click "Install Framework" to clone ZTF and install its dependencies
5. Go to **Settings** → verify the ZTF path is correct
6. Go to **Global Config** → add your credentials
7. Go to **Workflows** → select a workflow, configure, and run!

## Notes

- Config files are stored in `~/.ztf-ui/configs/`
- Execution history is stored in `~/.ztf-ui/history.json`
- Settings are stored in `~/.ztf-ui/settings.json`
- Global config (`global.yml`) is saved directly to the ZTF installation directory
