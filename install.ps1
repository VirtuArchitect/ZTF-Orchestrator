# ─────────────────────────────────────────────────────────────────────────────
# ZTF-Orchestrator — One-Command Installer (Windows PowerShell)
#
# Usage (run in PowerShell as your normal user — no admin required):
#   iex ((New-Object Net.WebClient).DownloadString('https://raw.githubusercontent.com/VirtuArchitect/ZTF-Orchestrator/main/install.ps1'))
#
#   Or download and run with options:
#   $env:ZTF_PORT = "8080"; .\install.ps1
#
# What this script does:
#   1. Checks prerequisites (Python 3.10+, pip, git)
#   2. Clones ZTF-Orchestrator and ZeroTouch Framework
#   3. Creates a shared Python virtual environment
#   4. Installs all dependencies for both components
#   5. Starts ZTF-Orchestrator (prints admin credentials on first run)
# ─────────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'

# ── Configurable ──────────────────────────────────────────────────────────────
$InstallDir       = if ($env:ZTF_INSTALL_DIR) { $env:ZTF_INSTALL_DIR } else { "$env:USERPROFILE\ztf" }
$ZtfPort          = if ($env:ZTF_PORT)         { $env:ZTF_PORT }         else { "5001" }
$OrchestratorRepo = if ($env:ORCHESTRATOR_REPO){ $env:ORCHESTRATOR_REPO } else { "https://github.com/VirtuArchitect/ZTF-Orchestrator.git" }
$ZtfRepo          = if ($env:ZTF_REPO)         { $env:ZTF_REPO }         else { "https://github.com/nutanixdev/zerotouch-framework.git" }

$OrchDir = "$InstallDir\ZTF-Orchestrator"
$ZtfDir  = "$InstallDir\zerotouch-framework"
$VenvDir = "$InstallDir\venv"

function Write-Header { param($msg) Write-Host "`n$msg" -ForegroundColor Cyan }
function Write-Ok     { param($msg) Write-Host "[ OK ] $msg" -ForegroundColor Green }
function Write-Info   { param($msg) Write-Host "[INFO] $msg" -ForegroundColor White }
function Write-Fail   { param($msg) Write-Host "[FAIL] $msg" -ForegroundColor Red; exit 1 }

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  ZTF-Orchestrator — One-Command Installer  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Info "Install directory : $InstallDir"
Write-Info "Port              : $ZtfPort"
Write-Host ""

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
Write-Header "Step 1 of 5 — Checking prerequisites"

# Python 3.10+
$PythonExe = $null
foreach ($candidate in @("python", "python3")) {
    try {
        $ver = & $candidate -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        if ($ver) {
            $parts = $ver.Split('.')
            if ([int]$parts[0] -eq 3 -and [int]$parts[1] -ge 10) {
                $PythonExe = $candidate; break
            }
        }
    } catch {}
}
if (-not $PythonExe) {
    Write-Fail "Python 3.10+ is required but was not found.`nInstall from https://www.python.org/downloads/ and re-run."
}
$pyVersion = & $PythonExe --version
Write-Ok "$pyVersion"

# pip
try { & $PythonExe -m pip --version | Out-Null } catch { Write-Fail "pip not available. Reinstall Python." }
Write-Ok "pip available"

# git
try { git --version | Out-Null } catch { Write-Fail "git not found. Install from https://git-scm.com and re-run." }
Write-Ok "$(git --version)"

# Port availability — warn if in Hyper-V reserved range
if ([int]$ZtfPort -ge 4940 -and [int]$ZtfPort -le 5039) {
    Write-Host "[WARN] Port $ZtfPort may be reserved by Hyper-V on Windows." -ForegroundColor Yellow
    Write-Host "       If the server fails to start, re-run with: `$env:ZTF_PORT = '8080'; .\install.ps1" -ForegroundColor Yellow
}

# ── 2. Clone repositories ─────────────────────────────────────────────────────
Write-Header "Step 2 of 5 — Cloning repositories"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

if (Test-Path "$OrchDir\.git") {
    Write-Info "ZTF-Orchestrator already cloned — pulling latest"
    git -C $OrchDir pull --ff-only
} else {
    Write-Info "Cloning ZTF-Orchestrator..."
    git clone --depth 1 $OrchestratorRepo $OrchDir
}
Write-Ok "ZTF-Orchestrator → $OrchDir"

if (Test-Path "$ZtfDir\.git") {
    Write-Info "ZeroTouch Framework already cloned — pulling latest"
    git -C $ZtfDir pull --ff-only
} else {
    Write-Info "Cloning ZeroTouch Framework..."
    git clone --depth 1 $ZtfRepo $ZtfDir
}
Write-Ok "ZeroTouch Framework → $ZtfDir"

# ── 3. Virtual environment ────────────────────────────────────────────────────
Write-Header "Step 3 of 5 — Creating shared virtual environment"

if (-not (Test-Path $VenvDir)) {
    Write-Info "Creating venv at $VenvDir"
    & $PythonExe -m venv $VenvDir
}
$PipExe  = "$VenvDir\Scripts\pip.exe"
$VenvPy  = "$VenvDir\Scripts\python.exe"
Write-Ok "Virtual environment ready"

# ── 4. Install dependencies ───────────────────────────────────────────────────
Write-Header "Step 4 of 5 — Installing Python dependencies"

Write-Info "Installing ZTF-Orchestrator dependencies..."
& $PipExe install -q -r "$OrchDir\requirements.txt"
Write-Ok "ZTF-Orchestrator dependencies installed"

Write-Info "Installing ZeroTouch Framework dependencies..."
$ReqFile = $null
if (Test-Path "$ZtfDir\requirements\prod.txt")  { $ReqFile = "$ZtfDir\requirements\prod.txt" }
elseif (Test-Path "$ZtfDir\requirements.txt")   { $ReqFile = "$ZtfDir\requirements.txt" }
else {
    $found = Get-ChildItem "$ZtfDir\requirements" -Filter "*.txt" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { $ReqFile = $found.FullName }
}
if (-not $ReqFile) { Write-Fail "Could not locate a requirements file in $ZtfDir" }
& $PipExe install -q -r $ReqFile
Write-Ok "ZTF Framework dependencies installed (from $ReqFile)"

# Bundled Calm DSL wheels (if present)
$CalmWhl = "$ZtfDir\calm-whl"
$CalmReq = "$CalmWhl\requirements.txt"
if ((Test-Path $CalmWhl) -and (Test-Path $CalmReq)) {
    Write-Info "Installing bundled Calm DSL wheels..."
    & $PipExe install -q --no-index --find-links $CalmWhl -r $CalmReq 2>$null
    Write-Ok "Calm DSL wheels installed"
}

# ── 5. Launch ─────────────────────────────────────────────────────────────────
Write-Header "Step 5 of 5 — Starting ZTF-Orchestrator"

$env:ZTF_PATH   = $ZtfDir
$env:ZTF_PORT   = $ZtfPort
$env:ZTF_PYTHON = $VenvPy

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  Installation complete!                              ║" -ForegroundColor Green
Write-Host "║                                                      ║" -ForegroundColor Green
Write-Host "║  ZTF-Orchestrator : http://localhost:$ZtfPort         ║" -ForegroundColor Green
Write-Host "║  Admin password   : printed below on first run      ║" -ForegroundColor Green
Write-Host "║  Stop             : Ctrl+C                          ║" -ForegroundColor Green
Write-Host "║                                                      ║" -ForegroundColor Green
Write-Host "║  To restart later:                                   ║" -ForegroundColor Green
Write-Host "║    $VenvDir\Scripts\activate  ║" -ForegroundColor Green
Write-Host "║    python $OrchDir\server.py  ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

Set-Location $OrchDir
& $VenvPy server.py
