#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ZTF-Orchestrator — One-command installer (Linux / macOS)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/VirtuArchitect/ZTF-Orchestrator/main/install.sh | bash
#
#   Or with options:
#   ZTF_PORT=8080 ZTF_INSTALL_DIR=/opt bash install.sh
#
# What this script does:
#   1. Checks prerequisites (Python 3.10+, pip, git)
#   2. Clones ZTF-Orchestrator into $INSTALL_DIR/ZTF-Orchestrator
#   3. Clones ZeroTouch Framework into $INSTALL_DIR/zerotouch-framework
#   4. Creates a shared Python virtual environment
#   5. Installs all dependencies for both components
#   6. Starts ZTF-Orchestrator (prints admin credentials on first run)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configurable ──────────────────────────────────────────────────────────────
INSTALL_DIR="${ZTF_INSTALL_DIR:-$HOME/ztf}"
ZTF_PORT="${ZTF_PORT:-5001}"
ORCHESTRATOR_REPO="${ORCHESTRATOR_REPO:-https://github.com/VirtuArchitect/ZTF-Orchestrator.git}"
ZTF_REPO="${ZTF_REPO:-https://github.com/nutanixdev/zerotouch-framework.git}"

ORCH_DIR="$INSTALL_DIR/ZTF-Orchestrator"
ZTF_DIR="$INSTALL_DIR/zerotouch-framework"
VENV_DIR="$INSTALL_DIR/venv"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
BOLD='\033[1m';   RESET='\033[0m'

info()  { echo -e "${CYAN}[INFO]${RESET}  $*"; }
ok()    { echo -e "${GREEN}[ OK ]${RESET}  $*"; }
fail()  { echo -e "${RED}[FAIL]${RESET}  $*"; exit 1; }
hdr()   { echo -e "\n${BOLD}$*${RESET}"; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║  ZTF-Orchestrator — One-Command Installer  ║${RESET}"
echo -e "${BOLD}╚════════════════════════════════════════════╝${RESET}"
echo ""
info "Install directory : $INSTALL_DIR"
info "Port              : $ZTF_PORT"
echo ""

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
hdr "Step 1 of 5 — Checking prerequisites"

# Python 3.10+
PYTHON=""
for candidate in python3 python; do
    if command -v "$candidate" &>/dev/null; then
        MAJOR=$("$candidate" -c "import sys; print(sys.version_info.major)")
        MINOR=$("$candidate" -c "import sys; print(sys.version_info.minor)")
        if [ "$MAJOR" -eq 3 ] && [ "$MINOR" -ge 10 ]; then
            PYTHON="$candidate"
            break
        fi
    fi
done
[ -z "$PYTHON" ] && fail "Python 3.10+ is required but was not found. Install it and re-run."
ok "Python $($PYTHON --version)"

# pip
$PYTHON -m pip --version &>/dev/null || fail "pip is not available. Install it with: $PYTHON -m ensurepip"
ok "pip $($PYTHON -m pip --version | awk '{print $2}')"

# git
command -v git &>/dev/null || fail "git is required but was not found. Install git and re-run."
ok "git $(git --version | awk '{print $3}')"

# ── 2. Clone repositories ─────────────────────────────────────────────────────
hdr "Step 2 of 5 — Cloning repositories"
mkdir -p "$INSTALL_DIR"

if [ -d "$ORCH_DIR/.git" ]; then
    info "ZTF-Orchestrator already cloned — pulling latest"
    git -C "$ORCH_DIR" pull --ff-only
else
    info "Cloning ZTF-Orchestrator..."
    git clone --depth 1 "$ORCHESTRATOR_REPO" "$ORCH_DIR"
fi
ok "ZTF-Orchestrator → $ORCH_DIR"

if [ -d "$ZTF_DIR/.git" ]; then
    info "ZeroTouch Framework already cloned — pulling latest"
    git -C "$ZTF_DIR" pull --ff-only
else
    info "Cloning ZeroTouch Framework..."
    git clone --depth 1 "$ZTF_REPO" "$ZTF_DIR"
fi
ok "ZeroTouch Framework → $ZTF_DIR"

# ── 3. Virtual environment ────────────────────────────────────────────────────
hdr "Step 3 of 5 — Creating shared virtual environment"
if [ ! -d "$VENV_DIR" ]; then
    info "Creating venv at $VENV_DIR"
    $PYTHON -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
ok "Virtual environment active"

# ── 4. Install dependencies ───────────────────────────────────────────────────
hdr "Step 4 of 5 — Installing Python dependencies"

info "Installing ZTF-Orchestrator dependencies..."
pip install -q -r "$ORCH_DIR/requirements.txt"
ok "ZTF-Orchestrator dependencies installed"

info "Installing ZeroTouch Framework dependencies..."
if [ -f "$ZTF_DIR/requirements/prod.txt" ]; then
    REQ="$ZTF_DIR/requirements/prod.txt"
elif ls "$ZTF_DIR/requirements/"*.txt 1>/dev/null 2>&1; then
    REQ=$(ls "$ZTF_DIR/requirements/"*.txt | head -1)
elif [ -f "$ZTF_DIR/requirements.txt" ]; then
    REQ="$ZTF_DIR/requirements.txt"
else
    fail "Could not find a requirements file in $ZTF_DIR"
fi
pip install -q -r "$REQ"
ok "ZTF Framework dependencies installed (from $REQ)"

# Bundled Calm DSL wheels (if present — for air-gapped Calm support)
if [ -d "$ZTF_DIR/calm-whl" ] && [ -f "$ZTF_DIR/calm-whl/requirements.txt" ]; then
    info "Installing bundled Calm DSL wheels..."
    pip install -q --no-index --find-links "$ZTF_DIR/calm-whl" \
        -r "$ZTF_DIR/calm-whl/requirements.txt" 2>/dev/null || true
    ok "Calm DSL wheels installed"
fi

# ── 5. Launch ─────────────────────────────────────────────────────────────────
hdr "Step 5 of 5 — Starting ZTF-Orchestrator"

export ZTF_PATH="$ZTF_DIR"
export ZTF_PORT="$ZTF_PORT"
export ZTF_PYTHON="$VENV_DIR/bin/python3"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║  Installation complete!                              ║${RESET}"
echo -e "${BOLD}║                                                      ║${RESET}"
echo -e "${BOLD}║  ZTF-Orchestrator : http://localhost:${ZTF_PORT}         ║${RESET}"
echo -e "${BOLD}║  Admin password   : printed below on first run      ║${RESET}"
echo -e "${BOLD}║  Stop             : Ctrl+C                          ║${RESET}"
echo -e "${BOLD}║                                                      ║${RESET}"
echo -e "${BOLD}║  To restart later:                                   ║${RESET}"
echo -e "${BOLD}║    source $VENV_DIR/bin/activate    ║${RESET}"
echo -e "${BOLD}║    ZTF_PATH=$ZTF_DIR ZTF_PORT=$ZTF_PORT \\            ║${RESET}"
echo -e "${BOLD}║      python $ORCH_DIR/server.py     ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""

cd "$ORCH_DIR"
exec python server.py
