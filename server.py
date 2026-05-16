#!/usr/bin/env python3
"""ZeroTouch Framework UI - Flask Backend"""

import json
import os
import subprocess
import sys
import threading
from pathlib import Path
from typing import Generator

import yaml
from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

# Config directories
CONFIG_DIR = Path.home() / ".ztf-ui"
HISTORY_FILE = CONFIG_DIR / "history.json"
SETTINGS_FILE = CONFIG_DIR / "settings.json"

CONFIG_DIR.mkdir(exist_ok=True)


def read_json(path: Path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}


def write_json(path: Path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def get_settings():
    defaults = {
        "ztfPath": str(Path.home() / "zerotouch-framework"),
        "pythonPath": sys.executable,
        "configDir": str(CONFIG_DIR / "configs"),
        "repoUrl": "https://github.com/nutanixdev/zerotouch-framework.git",
    }
    return {**defaults, **read_json(SETTINGS_FILE, {})}


# ─── Serve Frontend ───────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


# ─── Settings ─────────────────────────────────────────────────────────────────

@app.route("/api/settings", methods=["GET"])
def get_settings_route():
    return jsonify(get_settings())


@app.route("/api/settings", methods=["POST"])
def post_settings():
    write_json(SETTINGS_FILE, request.json)
    return jsonify({"success": True})


# ─── System Check ─────────────────────────────────────────────────────────────

@app.route("/api/system/check")
def system_check():
    settings = get_settings()
    python_path = settings["pythonPath"]
    ztf_path = settings["ztfPath"]

    def run_check(name, cmd):
        try:
            result = subprocess.run(
                cmd, shell=True, capture_output=True, text=True, timeout=10
            )
            return {"name": name, "ok": result.returncode == 0, "value": result.stdout.strip()}
        except Exception as e:
            return {"name": name, "ok": False, "value": str(e)}

    checks = [
        run_check("Python 3.9+", f'{python_path} --version'),
        run_check("pip", f'{python_path} -m pip --version'),
        run_check("git", "git --version"),
        run_check("ZTF Installed", f'test -f "{ztf_path}/main.py" && echo found'),
    ]

    ztf_installed = any(c["name"] == "ZTF Installed" and c["ok"] for c in checks)

    if ztf_installed:
        req_file = Path(ztf_path) / "requirements" / "requirements.txt"
        checks.append({
            "name": "Requirements File",
            "ok": req_file.exists(),
            "value": str(req_file),
        })

    return jsonify({"checks": checks, "ztfInstalled": ztf_installed})


# ─── Install ZTF ──────────────────────────────────────────────────────────────

@app.route("/api/install", methods=["POST"])
def install_ztf():
    settings = get_settings()
    ztf_path = settings["ztfPath"]
    repo_url = settings["repoUrl"]
    python_path = settings["pythonPath"]

    def generate() -> Generator[str, None, None]:
        def send(event_type, data):
            yield f"data: {json.dumps({'type': event_type, 'data': data})}\n\n"

        def run_cmd(cmd, cwd=None, env=None):
            yield from send("log", f"$ {cmd}")
            proc = subprocess.Popen(
                cmd, shell=True, cwd=cwd, env=env,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
            )
            for line in proc.stdout:
                yield from send("stdout", line.rstrip())
            proc.wait()
            if proc.returncode != 0:
                raise RuntimeError(f"Command failed with exit code {proc.returncode}")

        try:
            if not Path(ztf_path, "main.py").exists():
                yield from send("step", "Cloning ZeroTouch Framework...")
                yield from run_cmd(f'git clone {repo_url} "{ztf_path}"')
            else:
                yield from send("step", "Updating existing ZeroTouch Framework...")
                yield from run_cmd("git pull", cwd=ztf_path)

            yield from send("step", "Installing Python dependencies...")
            ztf = Path(ztf_path)

            # Find the requirements file
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

            # Patch any hardcoded absolute paths to local wheel files.
            # prod.txt ships with developer-machine paths like:
            #   calm-dsl @ file:///Users/darshan.p/.../calm-whl/calm.dsl-X.whl
            # Replace them with the correct path inside the cloned repo.
            import re
            import tempfile
            req_text = (ztf / req_file).read_text()
            def fix_local_wheel(m):
                whl_name = Path(m.group(1)).name
                local = ztf / "calm-whl" / whl_name
                if local.exists():
                    return f"@ file://{local}"
                return m.group(0)
            patched = re.sub(r'@ file://(\S+\.whl)', fix_local_wheel, req_text)

            if patched != req_text:
                yield from send("log", "Patched hardcoded wheel paths to local repo copies")
                tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
                tmp.write(patched)
                tmp.close()
                install_arg = tmp.name
            else:
                install_arg = str(ztf / req_file)

            # `scrypt` requires OpenSSL headers which are absent on stock macOS.
            # It is only needed for CyberArk vault auth — strip it from the main
            # install and attempt it separately so it doesn't block everything else.
            import platform, os
            pip_env = os.environ.copy()
            scrypt_line_re = re.compile(r'^scrypt\b.*', re.MULTILINE)

            patched_for_install = patched if patched != req_text else (ztf / req_file).read_text()
            scrypt_lines = scrypt_line_re.findall(patched_for_install)
            patched_no_scrypt = scrypt_line_re.sub('# scrypt skipped – requires OpenSSL headers', patched_for_install)

            tmp2 = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
            tmp2.write(patched_no_scrypt)
            tmp2.close()
            install_arg = tmp2.name

            yield from send("log", f"Using requirements file: {req_file}")
            # prod.txt is a fully-compiled pip-tools lockfile — every transitive
            # dependency is already listed and pinned, so --no-deps is safe and
            # prevents pip from re-resolving deps from wheel METADATA (which would
            # pull scrypt back in via calm-dsl's Requires-Dist).
            yield from run_cmd(
                f'{python_path} -m pip install --no-deps -r "{install_arg}"',
                cwd=ztf_path, env=pip_env
            )

            # Now try scrypt separately with OpenSSL hints (optional – CyberArk only)
            if scrypt_lines:
                yield from send("step", "Attempting optional scrypt install (CyberArk vault support)...")
                scrypt_env = pip_env.copy()
                if platform.system() == "Darwin":
                    # Try common OpenSSL locations (Homebrew, MacPorts, system)
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
                        f'{python_path} -m pip install "scrypt==0.8.20"',
                        cwd=ztf_path, env=scrypt_env
                    )
                    yield from send("log", "scrypt installed ✓ (CyberArk vault support enabled)")
                except RuntimeError:
                    yield from send("log",
                        "⚠ scrypt could not be built (OpenSSL headers not found). "
                        "CyberArk vault auth will be unavailable, but all other ZTF features work normally. "
                        "Install OpenSSL (e.g. via Homebrew: brew install openssl) and re-run setup to enable it."
                    )

            yield from send("done", "ZeroTouch Framework installed successfully!")
        except Exception as e:
            yield from send("error", str(e))

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})


# ─── Config Files ─────────────────────────────────────────────────────────────

def get_configs_dir():
    settings = get_settings()
    configs_dir = Path(settings.get("configDir", CONFIG_DIR / "configs"))
    configs_dir.mkdir(parents=True, exist_ok=True)
    return configs_dir


@app.route("/api/configs")
def list_configs():
    configs_dir = get_configs_dir()
    files = []
    for f in configs_dir.iterdir():
        if f.suffix in (".yml", ".yaml", ".json"):
            stat = f.stat()
            files.append({"name": f.name, "size": stat.st_size, "modified": stat.st_mtime})
    return jsonify(sorted(files, key=lambda x: x["name"]))


@app.route("/api/configs/<name>", methods=["GET"])
def get_config(name):
    configs_dir = get_configs_dir()
    path = configs_dir / Path(name).name
    if not path.exists():
        return jsonify({"error": "Not found"}), 404
    return jsonify({"name": name, "content": path.read_text()})


@app.route("/api/configs/<name>", methods=["POST"])
def save_config(name):
    configs_dir = get_configs_dir()
    path = configs_dir / Path(name).name
    path.write_text(request.json["content"])
    return jsonify({"success": True})


@app.route("/api/configs/<name>", methods=["DELETE"])
def delete_config(name):
    configs_dir = get_configs_dir()
    path = configs_dir / Path(name).name
    if path.exists():
        path.unlink()
    return jsonify({"success": True})


# ─── Global Config ────────────────────────────────────────────────────────────

@app.route("/api/global-config")
def get_global_config():
    settings = get_settings()
    ztf_path = Path(settings["ztfPath"])
    global_yml = ztf_path / "config" / "global.yml"
    if global_yml.exists():
        return jsonify({"content": global_yml.read_text(), "path": str(global_yml)})
    return jsonify({"content": None, "path": str(global_yml)})


@app.route("/api/global-config", methods=["POST"])
def save_global_config():
    settings = get_settings()
    ztf_path = Path(settings["ztfPath"])
    global_yml = ztf_path / "config" / "global.yml"
    global_yml.parent.mkdir(parents=True, exist_ok=True)
    global_yml.write_text(request.json["content"])
    return jsonify({"success": True})


# ─── Execute Workflow ─────────────────────────────────────────────────────────

@app.route("/api/execute", methods=["POST"])
def execute_workflow():
    data = request.json
    workflow = data.get("workflow")
    script = data.get("script")
    schema = data.get("schema")
    config_content = data.get("configContent")
    config_file = data.get("configFile")
    debug = data.get("debug", False)

    settings = get_settings()
    ztf_path = settings["ztfPath"]
    python_path = settings["pythonPath"]
    configs_dir = get_configs_dir()

    import time
    execution_id = str(int(time.time() * 1000))

    def generate() -> Generator[str, None, None]:
        def send(event_type, event_data):
            yield f"data: {json.dumps({'type': event_type, 'data': event_data, 'executionId': execution_id})}\n\n"

        # Write config file if content provided
        cfg_path = config_file
        if config_content and config_file:
            safe_name = Path(config_file).name
            cfg_path = str(configs_dir / safe_name)
            Path(cfg_path).write_text(config_content)

        # Build command
        cmd_parts = [f'"{python_path}"', "main.py"]
        if workflow:
            cmd_parts += ["--workflow", workflow]
        if script:
            cmd_parts += ["--script", script]
        if schema:
            cmd_parts += ["--schema", schema]
        if cfg_path:
            cmd_parts += ["-f", f'"{cfg_path}"']
        if debug:
            cmd_parts.append("--debug")
        cmd = " ".join(cmd_parts)

        yield from send("start", {"command": cmd, "workingDir": ztf_path})

        import time as time_module
        start_time = time_module.time()

        try:
            proc = subprocess.Popen(
                cmd, shell=True, cwd=ztf_path,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
            )

            # Stream both stdout and stderr
            import select
            while True:
                reads = [proc.stdout.fileno(), proc.stderr.fileno()]
                ret = select.select(reads, [], [], 0.1)
                for fd in ret[0]:
                    if fd == proc.stdout.fileno():
                        line = proc.stdout.readline()
                        if line:
                            yield from send("stdout", line.rstrip())
                    if fd == proc.stderr.fileno():
                        line = proc.stderr.readline()
                        if line:
                            yield from send("stderr", line.rstrip())
                if proc.poll() is not None:
                    # Read remaining
                    for line in proc.stdout:
                        yield from send("stdout", line.rstrip())
                    for line in proc.stderr:
                        yield from send("stderr", line.rstrip())
                    break

            duration = int((time_module.time() - start_time) * 1000)
            status = "success" if proc.returncode == 0 else "failed"

            # Save history
            history = read_json(HISTORY_FILE, [])
            history.insert(0, {
                "id": execution_id,
                "workflow": workflow or script,
                "type": "workflow" if workflow else "script",
                "command": cmd,
                "status": status,
                "duration": duration,
                "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
                "configFile": cfg_path,
            })
            write_json(HISTORY_FILE, history[:100])

            yield from send("done", {"code": proc.returncode, "status": status, "duration": duration})

        except Exception as e:
            yield from send("error", str(e))

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})


# ─── Execution History ────────────────────────────────────────────────────────

@app.route("/api/executions")
def get_executions():
    return jsonify(read_json(HISTORY_FILE, []))


@app.route("/api/executions", methods=["DELETE"])
def clear_executions():
    write_json(HISTORY_FILE, [])
    return jsonify({"success": True})


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 50)
    print("  ZeroTouch Framework UI")
    print("=" * 50)
    print(f"  Open: http://localhost:5001")
    print("=" * 50)
    app.run(port=5001, debug=False, threaded=True)
