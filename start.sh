#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "ZeroTouch Framework UI"
echo "======================"

# Check Python
if ! command -v python3 &>/dev/null; then
    echo "ERROR: Python 3 is required but not found."
    exit 1
fi

PYTHON_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "Python $PYTHON_VER detected"

# Install dependencies
echo "Installing Python dependencies..."
python3 -m pip install -r requirements.txt -q

# Start server
echo ""
echo "Starting ZTF UI server..."
echo "Open http://localhost:5001 in your browser"
echo ""
python3 server.py
