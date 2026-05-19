#!/usr/bin/env python3
"""Nutanix ZeroTouch Framework UI - Flask Backend"""

import datetime
import json
import logging
import os
import queue
import re
import secrets
import stat
import subprocess
import sys
import threading
from functools import wraps
from pathlib import Path
from typing import Generator

import yaml
from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ztf-ui")

# ─── App & Config ─────────────────────────────────────────────────────────────

app = Flask(__name__, static_folder="static", static_url_path="")

CORS(app, origins=["http://localhost:5001", "http://127.0.0.1:5001",
                   "http://localhost:5173", "http://127.0.0.1:5173"])

CONFIG_DIR   = Path.home() / ".ztf-ui"
HISTORY_FILE = CONFIG_DIR / "history.json"
SETTINGS_FILE = CONFIG_DIR / "settings.json"
API_KEY_FILE  = CONFIG_DIR / ".api_key"

MAX_BODY_BYTES = 1 * 1024 * 1024  # 1 MB

# ─── Allowed values (allowlist for workflow/script IDs) ───────────────────────

ALLOWED_WORKFLOWS = {
    "cluster-create", "imaging-only", "imaging", "site-deploy",
    "config-cluster", "deploy-pc", "config-pc", "pod-config",
    "deploy-management-pc", "config-management-pc",
    "calm-vm-workloads", "calm-edgeai-vm-workload", "ndb",
}

ALLOWED_SCRIPTS = {
    "AddAdServerPe", "AddAdServerPc", "CreateRoleMappingPe", "CreateRoleMappingPc",
    "CreateLocalUser", "DeleteLocalUser", "AddSamlIdp",
    "CreateSubnetPe", "CreateSubnetPc", "DeleteSubnetPe", "CreateVpc",
    "UpdateDnsNtp", "EnableFlowNetworking",
    "CreateContainer", "DeleteContainer", "CreateObjectStore", "CreateBucket",
    "CreateVm", "DeleteVm", "PowerOnVm", "PowerOffVm", "CloneVm",
    "UploadImage", "DeleteImage",
    "CreateSecurityPolicy", "CreateAddressGroup", "CreateServiceGroup",
    "CreateCategory", "AssignCategoryToVm",
    "CreateNkeCluster", "DeleteNkeCluster", "EnableNke",
    "CreateDbServer", "RegisterNdbCluster", "CreateNdbNetworkProfile",
    "DeployPc", "RegisterPcToPe", "EnableMicrosegmentation", "EnableObjects",
    "EnableDr", "CreateProtectionRule", "CreateRecoveryPlan", "RegisterRemoteAz",
    "ConfigureEula", "EnablePulse", "SetHaReservation", "SetRebuildCapacity",
    "UpdateClusterName",
    "UpdateFoundation", "UpdateNcc",
}

# ─── Secure directory & API key setup ────────────────────────────────────────

def _secure_mkdir(path: Path) -> None:
    path.mkdir(exist_ok=True)
    try:
        os.chmod(path, stat.S_IRWXU)  # 0700 – owner only
    except OSError:
        pass  # Windows does not support Unix permissions


def _secure_write(path: Path, data: str) -> None:
    path.write_text(data)
    try:
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)  # 0600
    except OSError:
        pass


_secure_mkdir(CONFIG_DIR)


def load_or_create_api_key() -> str:
    if API_KEY_FILE.exists():
        key = API_KEY_FILE.read_text().strip()
        if key:
            return key
    key = secrets.token_hex(32)
    _secure_write(API_KEY_FILE, key)
    return key


API_KEY = load_or_create_api_key()

# ─── Auth ─────────────────────────────────────────────────────────────────────

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        client_key = request.headers.get("X-API-Key", "")
        if not secrets.compare_digest(client_key, API_KEY):
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated


# ─── Security headers ─────────────────────────────────────────────────────────

@app.after_request
def add_security_headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Cache-Control"] = "no-store"
    return resp


# ─── Body size guard ──────────────────────────────────────────────────────────

@app.before_request
def check_content_length():
    if request.content_length and request.content_length > MAX_BODY_BYTES:
        return jsonify({"error": "Request body too large"}), 413


# ─── Helpers ──────────────────────────────────────────────────────────────────

def read_json(path: Path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}


def write_json(path: Path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    try:
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass


def get_settings():
    defaults = {
        "ztfPath": str(Path.home() / "zerotouch-framework"),
        "pythonPath": sys.executable,
        "configDir": str(CONFIG_DIR / "configs"),
        "repoUrl": "https://github.com/nutanixdev/zerotouch-framework.git",
    }
    return {**defaults, **read_json(SETTINGS_FILE, {})}


def safe_config_path(name: str, configs_dir: Path) -> Path | None:
    """Return resolved path only if it stays within configs_dir, else None."""
    safe_name = Path(name).name          # strip any directory components
    if not safe_name or safe_name in (".", ".."):
        return None
    resolved = (configs_dir / safe_name).resolve()
    try:
        resolved.relative_to(configs_dir.resolve())
    except ValueError:
        return None
    return resolved


def validate_yaml(content: str) -> tuple[bool, str]:
    """Return (ok, error_message). Uses safe_load to prevent yaml bombs."""
    try:
        yaml.safe_load(content)
        return True, ""
    except yaml.YAMLError as e:
        return False, str(e)


# ─── Serve Frontend ───────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


# ─── Settings ─────────────────────────────────────────────────────────────────

@app.route("/api/settings", methods=["GET"])
@require_auth
def get_settings_route():
    return jsonify(get_settings())


@app.route("/api/settings", methods=["POST"])
@require_auth
def post_settings():
    data = request.json or {}
    # Only allow known keys to prevent settings pollution
    allowed_keys = {"ztfPath", "pythonPath", "configDir", "repoUrl"}
    filtered = {k: v for k, v in data.items() if k in allowed_keys}
    write_json(SETTINGS_FILE, filtered)
    return jsonify({"success": True})


# ─── System Check ─────────────────────────────────────────────────────────────

@app.route("/api/system/check")
@require_auth
def system_check():
    settings = get_settings()
    python_path = settings["pythonPath"]
    ztf_path = settings["ztfPath"]

    def run_check(name: str, cmd: list[str]) -> dict:
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=10
            )
            return {"name": name, "ok": result.returncode == 0, "value": result.stdout.strip()}
        except Exception:
            return {"name": name, "ok": False, "value": "check failed"}

    ztf_installed = (Path(ztf_path) / "main.py").exists()

    checks = [
        run_check("Python 3.9+", [python_path, "--version"]),
        run_check("pip",          [python_path, "-m", "pip", "--version"]),
        run_check("git",          ["git", "--version"]),
        {"name": "ZTF Installed", "ok": ztf_installed, "value": "found" if ztf_installed else ""},
    ]

    if ztf_installed:
        req_file = Path(ztf_path) / "requirements" / "requirements.txt"
        checks.append({
            "name": "Requirements File",
            "ok": req_file.exists(),
            "value": str(req_file) if req_file.exists() else "",
        })

    return jsonify({"checks": checks, "ztfInstalled": ztf_installed})


# ─── Install ZTF ──────────────────────────────────────────────────────────────

@app.route("/api/install", methods=["POST"])
@require_auth
def install_ztf():
    settings = get_settings()
    ztf_path = settings["ztfPath"]
    repo_url  = settings["repoUrl"]
    python_path = settings["pythonPath"]

    # Only allow the official ZTF repo to prevent arbitrary git clones
    ALLOWED_REPOS = {
        "https://github.com/nutanixdev/zerotouch-framework.git",
        "https://github.com/nutanixdev/zerotouch-framework",
    }
    if repo_url not in ALLOWED_REPOS:
        return jsonify({"error": "Repository URL not allowed"}), 400

    def generate() -> Generator[str, None, None]:
        def send(event_type, data):
            yield f"data: {json.dumps({'type': event_type, 'data': data})}\n\n"

        def run_cmd(args: list, cwd=None, env=None):
            yield from send("log", "$ " + " ".join(str(a) for a in args))
            proc = subprocess.Popen(
                args, cwd=cwd, env=env,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
            )
            for line in proc.stdout:
                yield from send("stdout", line.rstrip())
            proc.wait()
            if proc.returncode != 0:
                raise RuntimeError(f"Command failed (exit {proc.returncode})")

        try:
            if not Path(ztf_path, "main.py").exists():
                yield from send("step", "Cloning ZeroTouch Framework...")
                yield from run_cmd(["git", "clone", repo_url, ztf_path])
            else:
                yield from send("step", "Updating existing ZeroTouch Framework...")
                yield from run_cmd(["git", "pull"], cwd=ztf_path)

            yield from send("step", "Installing Python dependencies...")
            ztf = Path(ztf_path)

            req_file = None
            candidates = ["requirements/requirements.txt", "requirements.txt"]
            req_dir = ztf / "requirements"
            if req_dir.is_dir():
                for f in sorted(req_dir.glob("*.txt")):
                    candidates.insert(0, str(f.relative_to(ztf)))
            for c in candidates:
                if (ztf / c).exists():
                    req_file = c
                    break
            if req_file is None:
                raise RuntimeError(f"Could not find a requirements file in {ztf_path}")

            import tempfile
            req_text = (ztf / req_file).read_text()

            def fix_local_wheel(m):
                whl_name = Path(m.group(1)).name
                local = ztf / "calm-whl" / whl_name
                if local.exists():
                    return f"@ file://{local}"
                return m.group(0)

            patched = re.sub(r'@ file://(\S+\.whl)', fix_local_wheel, req_text)

            import platform
            pip_env = os.environ.copy()
            scrypt_line_re = re.compile(r'^scrypt\b.*', re.MULTILINE)
            base_text = patched if patched != req_text else req_text
            scrypt_lines = scrypt_line_re.findall(base_text)
            patched_no_scrypt = scrypt_line_re.sub(
                '# scrypt skipped – requires OpenSSL headers', base_text
            )

            tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
            tmp.write(patched_no_scrypt)
            tmp.close()
            install_arg = tmp.name

            yield from send("log", f"Using requirements file: {req_file}")
            yield from run_cmd(
                [python_path, "-m", "pip", "install", "--no-deps", "-r", install_arg],
                cwd=ztf_path, env=pip_env
            )

            if scrypt_lines:
                yield from send("step", "Attempting optional scrypt install (CyberArk vault support)...")
                scrypt_env = pip_env.copy()
                if platform.system() == "Darwin":
                    for openssl_prefix in [
                        "/usr/local/opt/openssl",
                        "/opt/homebrew/opt/openssl",
                        "/opt/local",
                        "/usr",
                    ]:
                        if Path(openssl_prefix, "include/openssl/aes.h").exists():
                            scrypt_env["CFLAGS"] = f"-I{openssl_prefix}/include " + scrypt_env.get("CFLAGS", "")
                            scrypt_env["LDFLAGS"] = f"-L{openssl_prefix}/lib " + scrypt_env.get("LDFLAGS", "")
                            yield from send("log", f"Found OpenSSL at {openssl_prefix}")
                            break
                try:
                    yield from run_cmd(
                        [python_path, "-m", "pip", "install", "scrypt==0.8.20"],
                        cwd=ztf_path, env=scrypt_env
                    )
                    yield from send("log", "scrypt installed (CyberArk vault support enabled)")
                except RuntimeError:
                    yield from send("log",
                        "scrypt could not be built (OpenSSL headers not found). "
                        "CyberArk vault auth will be unavailable. "
                        "Install OpenSSL (e.g. brew install openssl) and re-run setup."
                    )

            yield from send("done", "ZeroTouch Framework installed successfully!")
        except Exception as e:
            log.exception("Install error")
            yield from send("error", "Installation failed. Check server logs for details.")

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})


# ─── Config Files ─────────────────────────────────────────────────────────────

def get_configs_dir() -> Path:
    settings = get_settings()
    configs_dir = Path(settings.get("configDir", CONFIG_DIR / "configs"))
    _secure_mkdir(configs_dir)
    return configs_dir


@app.route("/api/configs")
@require_auth
def list_configs():
    configs_dir = get_configs_dir()
    files = []
    for f in configs_dir.iterdir():
        if f.suffix in (".yml", ".yaml", ".json"):
            s = f.stat()
            files.append({"name": f.name, "size": s.st_size, "modified": s.st_mtime})
    return jsonify(sorted(files, key=lambda x: x["name"]))


@app.route("/api/configs/<name>", methods=["GET"])
@require_auth
def get_config(name):
    configs_dir = get_configs_dir()
    path = safe_config_path(name, configs_dir)
    if path is None or not path.exists():
        return jsonify({"error": "Not found"}), 404
    return jsonify({"name": path.name, "content": path.read_text()})


@app.route("/api/configs/<name>", methods=["POST"])
@require_auth
def save_config(name):
    configs_dir = get_configs_dir()
    path = safe_config_path(name, configs_dir)
    if path is None:
        return jsonify({"error": "Invalid filename"}), 400
    if path.suffix not in (".yml", ".yaml", ".json"):
        return jsonify({"error": "Only .yml/.yaml/.json files are allowed"}), 400
    content = (request.json or {}).get("content", "")
    if path.suffix in (".yml", ".yaml"):
        ok, err = validate_yaml(content)
        if not ok:
            return jsonify({"error": f"Invalid YAML: {err}"}), 400
    _secure_write(path, content)
    return jsonify({"success": True})


@app.route("/api/configs/<name>", methods=["DELETE"])
@require_auth
def delete_config(name):
    configs_dir = get_configs_dir()
    path = safe_config_path(name, configs_dir)
    if path is None:
        return jsonify({"error": "Invalid filename"}), 400
    if path.exists():
        path.unlink()
    return jsonify({"success": True})


# ─── Global Config ────────────────────────────────────────────────────────────

@app.route("/api/global-config")
@require_auth
def get_global_config():
    settings = get_settings()
    ztf_path = Path(settings["ztfPath"])
    global_yml = ztf_path / "config" / "global.yml"
    if global_yml.exists():
        return jsonify({"content": global_yml.read_text(), "path": str(global_yml)})
    return jsonify({"content": None, "path": str(global_yml)})


@app.route("/api/global-config", methods=["POST"])
@require_auth
def save_global_config():
    content = (request.json or {}).get("content", "")
    ok, err = validate_yaml(content)
    if not ok:
        return jsonify({"error": f"Invalid YAML: {err}"}), 400
    settings = get_settings()
    ztf_path = Path(settings["ztfPath"])
    global_yml = ztf_path / "config" / "global.yml"
    global_yml.parent.mkdir(parents=True, exist_ok=True)
    _secure_write(global_yml, content)
    return jsonify({"success": True})


# ─── Execute Workflow ─────────────────────────────────────────────────────────

@app.route("/api/execute", methods=["POST"])
@require_auth
def execute_workflow():
    data = request.json or {}
    workflow       = data.get("workflow")
    script         = data.get("script")
    config_content = data.get("configContent")
    config_file    = data.get("configFile")
    debug          = bool(data.get("debug", False))

    # Validate workflow/script against allowlist
    if workflow and workflow not in ALLOWED_WORKFLOWS:
        return jsonify({"error": "Unknown workflow"}), 400
    if script and script not in ALLOWED_SCRIPTS:
        return jsonify({"error": "Unknown script"}), 400
    if not workflow and not script:
        return jsonify({"error": "workflow or script is required"}), 400

    settings    = get_settings()
    ztf_path    = settings["ztfPath"]
    python_path = settings["pythonPath"]
    configs_dir = get_configs_dir()

    import time
    execution_id = str(int(time.time() * 1000))

    def generate() -> Generator[str, None, None]:
        def send(event_type, event_data):
            yield f"data: {json.dumps({'type': event_type, 'data': event_data, 'executionId': execution_id})}\n\n"

        # Write config if provided
        cfg_path = None
        if config_content and config_file:
            path = safe_config_path(config_file, configs_dir)
            if path is None:
                yield from send("error", "Invalid config filename")
                return
            if path.suffix in (".yml", ".yaml"):
                ok, err = validate_yaml(config_content)
                if not ok:
                    yield from send("error", f"Invalid YAML: {err}")
                    return
            _secure_write(path, config_content)
            cfg_path = str(path)

        # Build command as a list (no shell, no injection)
        cmd_args = [python_path, "main.py"]
        if workflow:
            cmd_args += ["--workflow", workflow]
        if script:
            cmd_args += ["--script", script]
        if cfg_path:
            cmd_args += ["-f", cfg_path]
        if debug:
            cmd_args.append("--debug")

        # The command shown to the user omits sensitive path info
        display_cmd = " ".join(
            a if i < 3 else (a if not a.startswith(str(Path.home())) else "<config-path>")
            for i, a in enumerate(cmd_args)
        )
        yield from send("start", {"command": display_cmd, "workingDir": ztf_path})

        import time as time_module
        start_time = time_module.time()
        status = "failed"

        try:
            proc = subprocess.Popen(
                cmd_args,
                cwd=ztf_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )

            # Use threads to read stdout/stderr concurrently (works on Windows + Unix)
            combined: queue.Queue = queue.Queue()

            def _reader(stream, label):
                for line in stream:
                    combined.put((label, line.rstrip()))
                combined.put(None)

            t_out = threading.Thread(target=_reader, args=(proc.stdout, "stdout"), daemon=True)
            t_err = threading.Thread(target=_reader, args=(proc.stderr, "stderr"), daemon=True)
            t_out.start()
            t_err.start()

            done = 0
            while done < 2:
                item = combined.get()
                if item is None:
                    done += 1
                else:
                    label, line = item
                    yield from send(label, line)

            proc.wait()
            duration = int((time_module.time() - start_time) * 1000)
            status = "success" if proc.returncode == 0 else "failed"

            # Save history — exclude full command and absolute paths (sensitive)
            history = read_json(HISTORY_FILE, [])
            history.insert(0, {
                "id":        execution_id,
                "workflow":  workflow or script,
                "type":      "workflow" if workflow else "script",
                "status":    status,
                "duration":  duration,
                "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            })
            write_json(HISTORY_FILE, history[:100])

            yield from send("done", {"code": proc.returncode, "status": status, "duration": duration})

        except Exception:
            log.exception("Execution error for workflow=%s script=%s", workflow, script)
            yield from send("error", "Execution failed. Check server logs for details.")

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})


# ─── Execution History ────────────────────────────────────────────────────────

@app.route("/api/executions")
@require_auth
def get_executions():
    return jsonify(read_json(HISTORY_FILE, []))


@app.route("/api/executions", methods=["DELETE"])
@require_auth
def clear_executions():
    write_json(HISTORY_FILE, [])
    return jsonify({"success": True})


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  Nutanix ZeroTouch Framework UI")
    print("=" * 60)
    print(f"  URL:     http://localhost:5001")
    print(f"  API Key: {API_KEY}")
    print()
    print("  Paste the API key into Settings > API Key in the UI.")
    print("  The key is also saved at:", API_KEY_FILE)
    print("=" * 60)
    app.run(host="127.0.0.1", port=5001, debug=False, threaded=True)
