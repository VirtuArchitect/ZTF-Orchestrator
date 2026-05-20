#!/bin/bash
# ZTF-Orchestrator quick-start script (Linux / macOS)
# For Windows use PowerShell — see README.md
set -e

cd "$(dirname "$0")"

echo "========================================"
echo "  Nutanix ZeroTouch Framework UI"
echo "========================================"

# ── Check Python 3.10+ ───────────────────────────────────────────────────────
PYTHON_BIN=""
for candidate in python3 python; do
    if command -v "$candidate" &>/dev/null; then
        MAJOR=$("$candidate" -c "import sys; print(sys.version_info.major)")
        MINOR=$("$candidate" -c "import sys; print(sys.version_info.minor)")
        if [ "$MAJOR" -eq 3 ] && [ "$MINOR" -ge 10 ]; then
            PYTHON_BIN="$candidate"
            break
        fi
    fi
done

if [ -z "$PYTHON_BIN" ]; then
    echo ""
    echo "ERROR: Python 3.10 or later is required but was not found."
    echo "  Install Python 3.10+ and ensure it is on your PATH."
    exit 1
fi

PYTHON_VER=$("$PYTHON_BIN" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')")
echo "  Python $PYTHON_VER"

# ── Virtual environment ───────────────────────────────────────────────────────
if [ ! -d "venv" ]; then
    echo "  Creating virtual environment..."
    "$PYTHON_BIN" -m venv venv
fi

# shellcheck disable=SC1091
source venv/bin/activate

# ── Install / update dependencies ────────────────────────────────────────────
echo "  Installing Python dependencies..."
pip install -q -r requirements.txt

# ── Start server ─────────────────────────────────────────────────────────────
echo ""
echo "  Starting ZTF Orchestrator..."
echo "  Open http://localhost:5001 in your browser"
echo "  (Admin credentials printed below on first run)"
echo "========================================"
echo ""

python server.py
