#!/usr/bin/env python3
"""ZeroTouch Enterprise Orchestrator — Flask Backend (production-hardened)"""

import datetime
import ipaddress
import json
import logging
import os
import queue
import re
import secrets
import socket
import stat
import subprocess
import sys
import threading
import uuid
from functools import wraps
from pathlib import Path
from typing import Generator

import bcrypt
import yaml
from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from storage_backend import StorageError, create_storage

# ─── Environment configuration ───────────────────────────────────────────────

CONFIG_DIR    = Path(os.environ.get('ZTF_DATA_DIR',    Path.home() / '.ztf-ui'))
ZTF_DEFAULT   = os.environ.get('ZTF_PATH',             str(Path.home() / 'zerotouch-framework'))
PYTHON_DEFAULT= os.environ.get('ZTF_PYTHON',           sys.executable)
PORT          = int(os.environ.get('ZTF_PORT',          5001))
LOG_LEVEL     = os.environ.get('ZTF_LOG_LEVEL',        'INFO')
EXEC_TIMEOUT  = int(os.environ.get('ZTF_EXEC_TIMEOUT',  3600))   # seconds
TOKEN_TTL     = int(os.environ.get('ZTF_TOKEN_TTL',     28800))  # seconds (8 h)
MAX_BODY      = int(os.environ.get('ZTF_MAX_BODY',      1048576)) # 1 MB
CONFIG_BACKUPS= int(os.environ.get('ZTF_CONFIG_BACKUPS',5))
STORAGE_BACKEND = os.environ.get('ZTF_STORAGE_BACKEND', 'file').strip().lower() or 'file'
AUDIT_RETENTION_DAYS = int(os.environ.get('ZTF_AUDIT_RETENTION_DAYS', '90'))
EXECUTION_RETENTION_DAYS = int(os.environ.get('ZTF_EXECUTION_RETENTION_DAYS', '180'))

USERS_FILE     = CONFIG_DIR / 'users.json'
HISTORY_FILE   = CONFIG_DIR / 'history.json'
SETTINGS_FILE  = CONFIG_DIR / 'settings.json'
PIPELINES_FILE = CONFIG_DIR / 'pipelines.json'
DRIFT_FILE     = CONFIG_DIR / 'drift.json'
SCHEDULES_FILE = CONFIG_DIR / 'schedules.json'
PARALLEL_FILE  = CONFIG_DIR / 'parallel_runs.json'
APPROVALS_FILE = CONFIG_DIR / 'approvals.json'
LOG_FILE       = CONFIG_DIR / 'ztf-orchestrator.log'

ALLOWED_ORIGINS = [
    f'http://localhost:{PORT}',    f'http://127.0.0.1:{PORT}',
    'http://localhost:5173',       'http://127.0.0.1:5173',
]

# ─── Structured logging ───────────────────────────────────────────────────────

class JSONFormatter(logging.Formatter):
    _standard_attrs = {
        'args', 'asctime', 'created', 'exc_info', 'exc_text', 'filename',
        'funcName', 'levelname', 'levelno', 'lineno', 'module', 'msecs',
        'message', 'msg', 'name', 'pathname', 'process', 'processName',
        'relativeCreated', 'stack_info', 'thread', 'threadName',
    }

    def format(self, record):
        log = {
            'ts':      datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z',
            'level':   record.levelname,
            'msg':     record.getMessage(),
            'logger':  record.name,
        }
        if record.exc_info:
            log['exc'] = self.formatException(record.exc_info)
        for key, value in record.__dict__.items():
            if key in self._standard_attrs or key.startswith('_'):
                continue
            try:
                json.dumps(value)
                log[key] = value
            except TypeError:
                log[key] = str(value)
        return json.dumps(log)


class StorageAuditHandler(logging.Handler):
    """Persist structured log events to the configured storage backend."""

    def __init__(self, storage):
        super().__init__()
        self.storage = storage

    def emit(self, record):
        if not hasattr(self.storage, 'append_audit_event'):
            return
        try:
            event = json.loads(self.format(record))
            self.storage.append_audit_event(event)
        except Exception:
            pass


def _setup_logging() -> logging.Logger:
    logger = logging.getLogger('ztf')
    logger.setLevel(getattr(logging, LOG_LEVEL.upper(), logging.INFO))
    logger.handlers.clear()
    fmt = JSONFormatter()
    sh = logging.StreamHandler(sys.stderr)
    sh.setFormatter(fmt)
    logger.addHandler(sh)
    try:
        fh = logging.FileHandler(str(LOG_FILE))
        fh.setFormatter(fmt)
        logger.addHandler(fh)
    except OSError:
        pass
    if hasattr(_storage, 'append_audit_event'):
        ah = StorageAuditHandler(_storage)
        ah.setFormatter(fmt)
        logger.addHandler(ah)
    return logger

# ─── App setup ────────────────────────────────────────────────────────────────

def _secure_mkdir(p: Path):
    p.mkdir(parents=True, exist_ok=True)
    try: os.chmod(p, stat.S_IRWXU)
    except OSError: pass

def _secure_write(p: Path, data: str):
    p.write_text(data, encoding='utf-8')
    try: os.chmod(p, stat.S_IRUSR | stat.S_IWUSR)
    except OSError: pass

_secure_mkdir(CONFIG_DIR)
try:
    _storage = create_storage(CONFIG_DIR)
except StorageError as exc:
    print(f'ZTF-Orchestrator storage initialisation failed: {exc}', file=sys.stderr, flush=True)
    raise
log = _setup_logging()

app = Flask(__name__, static_folder='dist', static_url_path='/static-dist')
CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=[],
    storage_uri='memory://',
)

# ─── Allowlists ───────────────────────────────────────────────────────────────

ALLOWED_WORKFLOWS = {
    'cluster-create', 'imaging-only', 'imaging', 'site-deploy',
    'config-cluster', 'deploy-pc', 'config-pc', 'pod-config',
    'deploy-management-pc', 'config-management-pc',
    'calm-vm-workloads', 'calm-edgeai-vm-workload', 'ndb',
    'lcm-update',
}

ALLOWED_SCRIPTS = {
    'AddAdServerPe','AddAdServerPc','CreateRoleMappingPe','CreateRoleMappingPc',
    'CreateLocalUser','DeleteLocalUser','AddSamlIdp',
    'CreateSubnetPe','CreateSubnetPc','DeleteSubnetPe','CreateVpc',
    'UpdateDnsNtp','EnableFlowNetworking',
    'CreateContainer','DeleteContainer','CreateObjectStore','CreateBucket',
    'CreateVm','DeleteVm','PowerOnVm','PowerOffVm','CloneVm',
    'UploadImage','DeleteImage',
    'CreateSecurityPolicy','CreateAddressGroup','CreateServiceGroup',
    'CreateCategory','AssignCategoryToVm',
    'CreateNkeCluster','DeleteNkeCluster','EnableNke',
    'CreateDbServer','RegisterNdbCluster','CreateNdbNetworkProfile',
    'DeployPc','RegisterPcToPe','EnableMicrosegmentation','EnableObjects',
    'EnableDr','CreateProtectionRule','CreateRecoveryPlan','RegisterRemoteAz',
    'ConfigureEula','EnablePulse','SetHaReservation','SetRebuildCapacity',
    'UpdateClusterName','UpdateFoundation','UpdateNcc',
}

ALLOWED_REPOS = {
    'https://github.com/nutanixdev/zerotouch-framework.git',
    'https://github.com/nutanixdev/zerotouch-framework',
}

# ─── Dry-run preflight definitions ───────────────────────────────────────────
# required: top-level YAML keys that must be present and non-empty
# ip_fields: keys whose values must be valid IP addresses
# connect: [(field_key, port, label)] — TCP reachability checks
# cluster_dict_connect: (port, label) — check each key of a clusters:{ip: ...} map
WORKFLOW_PREFLIGHT: dict[str, dict] = {
    'cluster-create': {
        'required':    ['pc_ip', 'pc_credential', 'cvm_credential', 'clusters'],
        'ip_fields':   ['pc_ip'],
        'connect':     [('pc_ip', 9440, 'Foundation Central / Prism Central')],
    },
    'imaging-only': {
        'required':    ['pc_ip', 'pc_credential', 'cvm_credential', 'aos_url'],
        'ip_fields':   ['pc_ip'],
        'connect':     [('pc_ip', 9440, 'Foundation Central / Prism Central')],
    },
    'imaging': {
        'required':    ['pc_ip', 'cvm_credential'],
        'ip_fields':   ['pc_ip'],
        'connect':     [('pc_ip', 9440, 'Foundation Central / Prism Central')],
    },
    'site-deploy': {
        'required':    ['pc_ip', 'pc_credential', 'cvm_credential'],
        'ip_fields':   ['pc_ip'],
        'connect':     [('pc_ip', 9440, 'Prism Central')],
    },
    'config-cluster': {
        'required':              ['clusters'],
        'ip_fields':             [],
        'connect':               [],
        'cluster_dict_connect':  (9440, 'Prism Element'),
    },
    'deploy-pc': {
        'required':              ['pe_credential', 'cvm_credential', 'clusters'],
        'ip_fields':             [],
        'connect':               [],
        'cluster_dict_connect':  (9440, 'Prism Element'),
    },
    'config-pc': {
        'required':    ['pc_ip', 'pc_credential'],
        'ip_fields':   ['pc_ip'],
        'connect':     [('pc_ip', 9440, 'Prism Central')],
    },
    'pod-config': {
        'required':    ['pc_ip', 'pc_credential'],
        'ip_fields':   ['pc_ip'],
        'connect':     [('pc_ip', 9440, 'Prism Central')],
    },
    'deploy-management-pc': {
        'required':    ['pc_ip', 'pe_credential'],
        'ip_fields':   ['pc_ip'],
        'connect':     [('pc_ip', 9440, 'Management PC')],
    },
    'config-management-pc': {
        'required':    ['pc_ip', 'pe_credential'],
        'ip_fields':   ['pc_ip'],
        'connect':     [('pc_ip', 9440, 'Management PC')],
    },
    'calm-vm-workloads': {
        'required':    ['ncm_vm_ip', 'ncm_credential'],
        'ip_fields':   ['ncm_vm_ip'],
        'connect':     [('ncm_vm_ip', 9440, 'NCM (Calm)')],
    },
    'calm-edgeai-vm-workload': {
        'required':    ['ncm_vm_ip', 'ncm_credential'],
        'ip_fields':   ['ncm_vm_ip'],
        'connect':     [('ncm_vm_ip', 9440, 'NCM (Calm)')],
    },
    'ndb': {
        'required':    ['cluster_ip', 'pe_credential', 'ndb_credential'],
        'ip_fields':   ['cluster_ip'],
        'connect':     [('cluster_ip', 9440, 'NDB Cluster')],
    },
}

PC_IP_WORKFLOWS = {'cluster-create', 'imaging-only', 'imaging'}


def _normalize_ztf_config_keys(workflow: str, config: dict) -> tuple[dict, bool]:
    """Map legacy Orchestrator fc_ip configs to upstream ZTF's pc_ip key."""
    if workflow in PC_IP_WORKFLOWS and 'pc_ip' not in config and config.get('fc_ip'):
        normalized = dict(config)
        normalized['pc_ip'] = normalized.pop('fc_ip')
        return normalized, True
    return config, False


def _normalize_ztf_config_content(workflow: str, config_content: str) -> tuple[str, bool]:
    """Return YAML content with pc_ip if a legacy fc_ip-only file was supplied."""
    try:
        parsed = yaml.safe_load(config_content) or {}
    except yaml.YAMLError:
        return config_content, False
    if not isinstance(parsed, dict):
        return config_content, False
    normalized, changed = _normalize_ztf_config_keys(workflow, parsed)
    if not changed:
        return config_content, False
    return yaml.safe_dump(normalized, sort_keys=False), True

ALLOWED_SETTINGS_KEYS = {
    'ztfPath', 'pythonPath', 'configDir', 'repoUrl', 'webhookUrl',
    'activeProfileId', 'connectionProfiles',
}

# ─── Feature engines (lazy-initialised in _init_engines) ─────────────────────

from scheduler    import ScheduleEngine
from parallel_exec import ParallelEngine
from approvals    import ApprovalManager

_schedule_engine:  ScheduleEngine  | None = None
_parallel_engine:  ParallelEngine  | None = None
_approval_manager: ApprovalManager | None = None

def _init_engines():
    global _schedule_engine, _parallel_engine, _approval_manager
    if _schedule_engine and _parallel_engine and _approval_manager:
        return

    def _sched_run_callback(schedule: dict) -> str:
        """Execute a scheduled workflow via subprocess; return 'success'/'failed'."""
        import time as _t
        settings    = get_settings()
        ztf_path    = settings['ztfPath']
        python_path = settings['pythonPath']
        configs_dir = get_configs_dir()

        workflow       = schedule.get('workflow') or ''
        script         = schedule.get('script') or ''
        config_content = schedule.get('configContent') or ''
        config_file    = schedule.get('configFile') or ''

        import tempfile
        tf_path = None
        if config_content:
            with tempfile.NamedTemporaryFile(
                mode='w', suffix='.yml', dir=str(configs_dir),
                delete=False, prefix='sched_'
            ) as tf:
                tf.write(config_content)
                tf_path = tf.name
        elif config_file:
            config_path = safe_config_path(config_file, configs_dir)
            if config_path is None or not config_path.exists():
                rc = -1
                cmd = [python_path, 'main.py']
                status = 'failed'
                entry = {
                    'id':         str(int(_t.time() * 1000)),
                    'workflow':   workflow or script,
                    'type':       'schedule',
                    'command':    ' '.join(cmd),
                    'status':     status,
                    'returnCode': rc,
                    'timestamp':  datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    'user':       'scheduler',
                    'configFile': config_file,
                }
                hist = read_json(HISTORY_FILE, [])
                hist.insert(0, entry)
                write_json(HISTORY_FILE, hist[:1000])
                _fire_configured_webhook(workflow or script, status, rc, 'scheduler', entry['id'])
                return status
            tf_path = str(config_path)

        cmd = [python_path, 'main.py']
        if workflow:
            cmd.append(f'--workflow={workflow}')
        if script:
            cmd += ['--script', script]
        if tf_path:
            cmd += ['-f', tf_path]

        try:
            r = subprocess.run(
                cmd, cwd=ztf_path, capture_output=True, text=True,
                timeout=EXEC_TIMEOUT
            )
            rc = r.returncode
        except subprocess.TimeoutExpired:
            rc = -1
        except Exception:
            rc = -1
        finally:
            if config_content and tf_path:
                try:
                    Path(tf_path).unlink(missing_ok=True)
                except Exception:
                    pass

        status = 'success' if rc == 0 else 'failed'
        # Record in history
        entry = {
            'id':        str(int(_t.time() * 1000)),
            'workflow':  workflow or script,
            'type':      'schedule',
            'command':   ' '.join(cmd),
            'status':    status,
            'returnCode': rc,
            'timestamp': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'user':      'scheduler',
            'configFile': config_file,
        }
        hist = read_json(HISTORY_FILE, [])
        hist.insert(0, entry)
        write_json(HISTORY_FILE, hist[:1000])
        _fire_configured_webhook(workflow or script, status, rc, 'scheduler',
                                 entry['id'])
        return status

    _schedule_engine  = ScheduleEngine(
        SCHEDULES_FILE,
        _sched_run_callback,
        load_callback=lambda: read_json(SCHEDULES_FILE, []),
        save_callback=lambda schedules: write_json(SCHEDULES_FILE, schedules),
    )
    _parallel_engine  = ParallelEngine(
        PARALLEL_FILE,
        EXEC_TIMEOUT,
        load_callback=lambda: read_json(PARALLEL_FILE, []),
        save_callback=lambda runs: write_json(PARALLEL_FILE, runs),
    )
    _approval_manager = ApprovalManager(
        APPROVALS_FILE,
        _fire_configured_webhook,
        load_callback=lambda: read_json(APPROVALS_FILE, []),
        save_callback=lambda approvals: write_json(APPROVALS_FILE, approvals),
    )
    _schedule_engine.start()

import atexit as _atexit
def _shutdown_engines():
    if _schedule_engine:
        _schedule_engine.shutdown()
_atexit.register(_shutdown_engines)


def _require_engines():
    """Initialise feature engines for test clients or WSGI imports."""
    if not (_schedule_engine and _parallel_engine and _approval_manager):
        _init_engines()


def _schedule_validation_error(data: dict, existing: dict | None = None) -> str:
    candidate = {**(existing or {}), **data}
    cron = str(candidate.get('cronExpr', '')).strip()
    if not cron or len(cron.split()) != 5:
        return 'cronExpr must be a valid 5-field cron expression'
    workflow = str(candidate.get('workflow', '')).strip()
    script = str(candidate.get('script', '')).strip()
    if workflow and workflow not in ALLOWED_WORKFLOWS:
        return 'Unknown workflow'
    if script and script not in ALLOWED_SCRIPTS:
        return 'Unknown script'
    if not workflow and not script:
        return 'workflow or script required'
    return ''

# ─── Concurrency lock ─────────────────────────────────────────────────────────

_RUNNING: set[str] = set()
_RUNNING_LOCK = threading.Lock()

# ─── User & session management ────────────────────────────────────────────────

ROLES = ('admin', 'operator', 'viewer')

def _load_users() -> list[dict]:
    return read_json(USERS_FILE, [])

def _save_users(users: list[dict]):
    write_json(USERS_FILE, users)

def _find_user(username: str) -> dict | None:
    return next((u for u in _load_users() if u['username'] == username), None)

def _ensure_default_admin():
    if _load_users():
        return
    password = secrets.token_hex(12)
    hashed   = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    _save_users([{
        'id':           str(uuid.uuid4()),
        'username':     'admin',
        'password_hash': hashed,
        'role':         'admin',
        'created_at':   datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z',
    }])
    print('\n' + '=' * 60)
    print('  First run — default admin account created')
    print(f'  Username: admin')
    print(f'  Password: {password}')
    print('  Change this immediately via Settings > Users.')
    print('=' * 60 + '\n', flush=True)

# Session store: { token -> { username, role, expires: datetime } }
_SESSIONS: dict[str, dict] = {}
_SESSIONS_LOCK = threading.Lock()

def _create_session(username: str, role: str) -> str:
    token = secrets.token_hex(32)
    expires = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=TOKEN_TTL)
    if hasattr(_storage, 'create_session'):
        _storage.create_session(token, username, role, expires)
        return token
    with _SESSIONS_LOCK:
        _SESSIONS[token] = {'username': username, 'role': role, 'expires': expires}
    return token

def _get_session(token: str) -> dict | None:
    if hasattr(_storage, 'get_session'):
        return _storage.get_session(token)
    with _SESSIONS_LOCK:
        session = _SESSIONS.get(token)
        if session and datetime.datetime.now(datetime.timezone.utc) < session['expires']:
            return session
        if session:
            del _SESSIONS[token]
    return None

def _invalidate_session(token: str):
    if hasattr(_storage, 'invalidate_session'):
        _storage.invalidate_session(token)
        return
    with _SESSIONS_LOCK:
        _SESSIONS.pop(token, None)

def _purge_expired():
    if hasattr(_storage, 'purge_expired_sessions'):
        _storage.purge_expired_sessions()
        return
    now = datetime.datetime.now(datetime.timezone.utc)
    with _SESSIONS_LOCK:
        expired = [t for t, s in _SESSIONS.items() if now >= s['expires']]
        for t in expired:
            del _SESSIONS[t]

# ─── Auth decorators ──────────────────────────────────────────────────────────

def _current_session() -> dict | None:
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        return _get_session(auth[7:])
    return None

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        session = _current_session()
        if not session:
            return jsonify({'error': 'Unauthorized'}), 401
        request.current_user = session
        return f(*args, **kwargs)
    return decorated

def require_role(*roles):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            session = _current_session()
            if not session:
                return jsonify({'error': 'Unauthorized'}), 401
            if session['role'] not in roles:
                return jsonify({'error': 'Forbidden'}), 403
            request.current_user = session
            return f(*args, **kwargs)
        return decorated
    return decorator

# ─── Request / response hooks ─────────────────────────────────────────────────

@app.before_request
def check_body_size():
    if request.content_length and request.content_length > MAX_BODY:
        return jsonify({'error': 'Request body too large'}), 413

@app.before_request
def log_request():
    _purge_expired()
    session = _current_session()
    path = request.full_path.rstrip('?')
    action = f'{request.method} {path}'
    log.info(action,
             extra={'event': 'http_request',
                    'action': action,
                    'method': request.method,
                    'path': request.path,
                    'query': request.query_string.decode('utf-8', errors='replace'),
                    'ip': request.remote_addr,
                    'user': session['username'] if session else 'anonymous'})

@app.after_request
def add_security_headers(resp):
    resp.headers['X-Content-Type-Options']  = 'nosniff'
    resp.headers['X-Frame-Options']         = 'DENY'
    resp.headers['Cache-Control']           = 'no-store'
    resp.headers['Permissions-Policy']      = 'geolocation=(), microphone=(), camera=()'
    resp.headers['Referrer-Policy']         = 'strict-origin-when-cross-origin'
    resp.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "connect-src 'self'"
    )
    return resp

# ─── Helpers ──────────────────────────────────────────────────────────────────

def read_json(path: Path, default=None):
    fallback = default if default is not None else {}
    return _storage.read_json(path, fallback)

def write_json(path: Path, data):
    _storage.write_json(path, data)

def get_settings() -> dict:
    default_profile = {
        'id': 'default',
        'name': 'Default',
        'description': 'Shared connection defaults for generated ZTF configuration',
        'environment': 'lab',
        'prismCentral': {
            'endpoint': '',
            'credentialRef': 'pc_user',
            'remoteCredentialRef': 'remote_pc_credentials',
            'defaultPcVersion': '',
            'enableObjects': False,
            'enableNke': False,
            'enableFlow': False,
            'enableNetworkController': False,
        },
        'foundationCentral': {
            'endpoint': '',
            'credentialRef': 'pc_user',
            'apiKeyRef': '',
            'aosUrl': '',
            'hypervisorType': 'kvm',
            'hypervisorUrl': '',
            'foundationVersion': '',
        },
        'prismElement': {
            'defaultClusterVip': '',
            'peCredentialRef': 'pe_user',
            'cvmCredentialRef': 'cvm_credential',
            'storageContainer': '',
            'networkName': '',
        },
        'ncm': {
            'endpoint': '',
            'credentialRef': 'ncm_user',
            'projectName': '',
            'accountName': 'NTNX_LOCAL_AZ',
        },
        'directory': {
            'domain': '',
            'ldapUrl': '',
            'serviceAccountCredentialRef': 'service_account_credential',
            'defaultGroups': '',
        },
        'ipam': {
            'method': 'static',
            'infobloxHost': '',
            'credentialRef': 'infoblox_user',
            'dnsView': 'default',
            'networkView': 'default',
        },
        'defaults': {
            'dnsServers': '',
            'ntpServers': '',
            'timezone': 'UTC',
            'siteCode': '',
        },
    }
    defaults = {
        'ztfPath':    ZTF_DEFAULT,
        'pythonPath': PYTHON_DEFAULT,
        'configDir':  str(CONFIG_DIR / 'configs'),
        'repoUrl':    'https://github.com/nutanixdev/zerotouch-framework.git',
        'webhookUrl': '',
        'activeProfileId': 'default',
        'connectionProfiles': [default_profile],
    }
    stored = read_json(SETTINGS_FILE, {})
    merged = {**defaults, **stored}
    profiles = merged.get('connectionProfiles')
    if not isinstance(profiles, list) or not profiles:
        merged['connectionProfiles'] = [default_profile]
        merged['activeProfileId'] = 'default'
    elif not any(p.get('id') == merged.get('activeProfileId') for p in profiles if isinstance(p, dict)):
        first = next((p for p in profiles if isinstance(p, dict) and p.get('id')), default_profile)
        merged['activeProfileId'] = first['id']
    return merged


def _tcp_check(host: str, port: int, timeout: float = 5.0) -> tuple[bool, float]:
    """Return (reachable, latency_ms). Never raises."""
    import time as _t
    t0 = _t.monotonic()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True, (_t.monotonic() - t0) * 1000
    except OSError:
        return False, 0.0


def _run_preflight(workflow: str, config_content: str, execution_id: str) -> Generator[str, None, None]:
    """Yield SSE events for dry-run pre-flight checks (no subprocess)."""

    def send(t: str, d):
        yield f"data: {json.dumps({'type': t, 'data': d, 'executionId': execution_id})}\n\n"

    passed = 0
    failed = 0

    yield from send('start', {'command': f'dry-run --workflow {workflow}', 'workingDir': ''})
    yield from send('stdout', f'ZeroTouch Enterprise Orchestrator — Dry Run Pre-flight')
    yield from send('stdout', f'Workflow : {workflow}')
    yield from send('stdout', '-' * 52)

    # ── 1. Parse YAML ────────────────────────────────────────────────────────
    try:
        config: dict = yaml.safe_load(config_content) or {}
        config, normalized_pc_ip = _normalize_ztf_config_keys(workflow, config)
        yield from send('stdout', '[PASS] YAML is valid and parseable')
        if normalized_pc_ip:
            yield from send('stdout', '[INFO] Legacy fc_ip detected; using pc_ip for Nutanix ZTF compatibility')
        passed += 1
    except yaml.YAMLError as exc:
        yield from send('stdout', f'[FAIL] YAML parse error: {exc}')
        failed += 1
        yield from send('stdout', '')
        yield from send('stdout', f'Result: {passed} passed, {failed} failed')
        yield from send('done', {'status': 'failed', 'dryRun': True})
        return

    preflight = WORKFLOW_PREFLIGHT.get(workflow, {})
    if not preflight:
        yield from send('stdout', f'[INFO] No preflight schema defined for "{workflow}" — YAML check only')

    # ── 2. Required fields ───────────────────────────────────────────────────
    for field in preflight.get('required', []):
        val = config.get(field)
        empty = val is None or (isinstance(val, (str, list, dict)) and not val)
        if empty:
            yield from send('stdout', f'[FAIL] Required field missing : {field}')
            failed += 1
        else:
            display = str(val) if not isinstance(val, (list, dict)) else f'({len(val)} item{"s" if len(val) != 1 else ""})'
            yield from send('stdout', f'[PASS] Required field present : {field} = {display}')
            passed += 1

    # ── 3. IP address format ─────────────────────────────────────────────────
    for field in preflight.get('ip_fields', []):
        val = str(config.get(field, '')).strip()
        if not val:
            continue   # already caught by required check
        try:
            ipaddress.ip_address(val)
            yield from send('stdout', f'[PASS] IP address valid        : {field} = {val}')
            passed += 1
        except ValueError:
            yield from send('stdout', f'[FAIL] IP address invalid      : {field} = "{val}"')
            failed += 1

    # ── 4. TCP reachability ──────────────────────────────────────────────────
    for (field, port, label) in preflight.get('connect', []):
        host = str(config.get(field, '')).strip()
        if not host:
            continue   # already caught
        reachable, ms = _tcp_check(host, port)
        if reachable:
            yield from send('stdout', f'[PASS] Reachable ({ms:>5.0f}ms)    : {label} {host}:{port}')
            passed += 1
        else:
            yield from send('stdout', f'[FAIL] Unreachable             : {label} {host}:{port}')
            failed += 1

    # ── 5. Cluster-dict connectivity (deploy-pc / config-cluster) ────────────
    if 'cluster_dict_connect' in preflight:
        port, label = preflight['cluster_dict_connect']
        clusters = config.get('clusters', {})
        if isinstance(clusters, dict):
            for ip in list(clusters.keys())[:4]:
                try:
                    ipaddress.ip_address(str(ip).strip())
                except ValueError:
                    continue
                reachable, ms = _tcp_check(str(ip), port)
                if reachable:
                    yield from send('stdout', f'[PASS] Reachable ({ms:>5.0f}ms)    : {label} {ip}:{port}')
                    passed += 1
                else:
                    yield from send('stdout', f'[FAIL] Unreachable             : {label} {ip}:{port}')
                    failed += 1

    # ── Summary ──────────────────────────────────────────────────────────────
    yield from send('stdout', '-' * 52)
    yield from send('stdout', f'Result: {passed} passed, {failed} failed')
    status = 'success' if failed == 0 else 'failed'
    yield from send('done', {'status': status, 'dryRun': True, 'passed': passed, 'failed': failed})


def _load_pipelines() -> list[dict]:
    return read_json(PIPELINES_FILE, [])

def _save_pipelines(pipelines: list[dict]) -> None:
    write_json(PIPELINES_FILE, pipelines)


def _fire_webhook(url: str, payload: dict) -> None:
    """Best-effort webhook POST — runs in a daemon thread, never raises."""
    import urllib.request as _req
    try:
        body = json.dumps(payload).encode()
        req  = _req.Request(
            url, data=body,
            headers={'Content-Type': 'application/json', 'User-Agent': 'ZTF-Orchestrator/1.2.0'},
            method='POST',
        )
        with _req.urlopen(req, timeout=8):
            pass
        log.info('webhook_fired', extra={'url': url, 'workflow': payload.get('workflow'), 'status': payload.get('status')})
    except Exception as exc:
        log.warning('webhook_failed', extra={'url': url, 'error': str(exc)})


def _fire_configured_webhook(
    workflow: str,
    status: str,
    return_code: int,
    user: str,
    execution_id: str,
    execution_type: str = 'automation',
) -> None:
    """Send a standard execution payload to the configured webhook, if enabled."""
    webhook_url = get_settings().get('webhookUrl', '').strip()
    if not webhook_url:
        return
    _fire_webhook(webhook_url, {
        'executionId': execution_id,
        'workflow':    workflow,
        'type':        execution_type,
        'status':      status,
        'returnCode':  return_code,
        'user':        user,
        'timestamp':   datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z',
    })


def _record_execution_history(
    *,
    execution_id: str,
    workflow_or_script: str,
    execution_type: str,
    status: str,
    user: str,
    config_file: str = '',
    config_content: str = '',
) -> dict:
    """Persist a workflow/script attempt so failed starts remain auditable."""
    entry = {
        'id':            execution_id,
        'workflow':      workflow_or_script,
        'type':          execution_type,
        'status':        status,
        'timestamp':     datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z',
        'user':          user,
        'configFile':    config_file or '',
        'configContent': config_content or '',
    }
    history = read_json(HISTORY_FILE, [])
    history.insert(0, entry)
    write_json(HISTORY_FILE, history[:1000])
    return entry


def get_configs_dir() -> Path:
    d = Path(get_settings().get('configDir', CONFIG_DIR / 'configs'))
    _secure_mkdir(d)
    return d

def safe_config_path(name: str, configs_dir: Path) -> Path | None:
    safe = Path(name).name
    if not safe or safe in ('.', '..'):
        return None
    resolved = (configs_dir / safe).resolve()
    try:
        resolved.relative_to(configs_dir.resolve())
    except ValueError:
        return None
    return resolved

def validate_yaml(content: str) -> tuple[bool, str]:
    try:
        yaml.safe_load(content)
        return True, ''
    except yaml.YAMLError as e:
        return False, str(e)

def backup_config(path: Path):
    """Keep the last N versions of a config before overwriting."""
    if not path.exists():
        return
    for i in range(CONFIG_BACKUPS - 1, 0, -1):
        src = Path(str(path) + f'.bak.{i}')
        dst = Path(str(path) + f'.bak.{i + 1}')
        if src.exists():
            src.replace(dst)   # replace() is atomic and works on Windows
    bak = Path(str(path) + '.bak.1')
    path.replace(bak)          # rename() raises FileExistsError on Windows
    try:
        os.chmod(bak, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass


def _parse_structured_config(content: str, filename: str = '') -> tuple[object, str]:
    """Parse YAML or JSON config content into comparable Python data."""
    try:
        if filename.lower().endswith('.json'):
            return json.loads(content or '{}'), ''
        parsed = yaml.safe_load(content or '') or {}
        return parsed, ''
    except (json.JSONDecodeError, yaml.YAMLError) as exc:
        return None, str(exc)


def _flatten_config(value, prefix: str = '') -> dict[str, object]:
    """Flatten nested dict/list structures into dot paths for drift comparison."""
    if isinstance(value, dict):
        flattened: dict[str, object] = {}
        for key in sorted(value.keys(), key=str):
            path = f'{prefix}.{key}' if prefix else str(key)
            flattened.update(_flatten_config(value[key], path))
        return flattened
    if isinstance(value, list):
        flattened = {}
        for idx, item in enumerate(value):
            path = f'{prefix}[{idx}]' if prefix else f'[{idx}]'
            flattened.update(_flatten_config(item, path))
        return flattened
    return {prefix or '$': value}


def _compare_drift(desired, observed) -> tuple[list[dict], dict]:
    desired_flat = _flatten_config(desired)
    observed_flat = _flatten_config(observed)
    findings: list[dict] = []

    for path in sorted(desired_flat.keys()):
        if path not in observed_flat:
            findings.append({
                'path': path,
                'status': 'missing',
                'desired': desired_flat[path],
                'observed': None,
            })
        elif desired_flat[path] == observed_flat[path]:
            findings.append({
                'path': path,
                'status': 'matched',
                'desired': desired_flat[path],
                'observed': observed_flat[path],
            })
        else:
            findings.append({
                'path': path,
                'status': 'changed',
                'desired': desired_flat[path],
                'observed': observed_flat[path],
            })

    for path in sorted(observed_flat.keys()):
        if path not in desired_flat:
            findings.append({
                'path': path,
                'status': 'unexpected',
                'desired': None,
                'observed': observed_flat[path],
            })

    summary = {
        'matched':    sum(1 for f in findings if f['status'] == 'matched'),
        'changed':    sum(1 for f in findings if f['status'] == 'changed'),
        'missing':    sum(1 for f in findings if f['status'] == 'missing'),
        'unexpected': sum(1 for f in findings if f['status'] == 'unexpected'),
    }
    summary['total'] = sum(summary.values())
    return findings, summary


def _load_drift_runs() -> list[dict]:
    return read_json(DRIFT_FILE, [])


def _save_drift_runs(runs: list[dict]) -> None:
    write_json(DRIFT_FILE, runs[:200])


def _find_last_applied_config(config_file: str, workflow: str = '') -> dict | None:
    history = read_json(HISTORY_FILE, [])
    for entry in history:
        if entry.get('status') != 'success':
            continue
        if entry.get('type') not in ('workflow', 'script'):
            continue
        if config_file and entry.get('configFile') != config_file:
            continue
        if workflow and entry.get('workflow') != workflow:
            continue
        if entry.get('configContent'):
            return entry
    return None

# ─── Static ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('dist', 'index.html')

@app.route('/favicon.ico')
def favicon():
    """Serve the Veridian favicon for browsers that still request /favicon.ico."""
    return send_from_directory('dist', 'favicon.ico', mimetype='image/x-icon')

@app.route('/<path:path>')
def spa_fallback(path):
    if path == 'api' or path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    """React Router catch-all — serve index.html for all non-API client routes."""
    # Let Flask serve real static assets (JS, CSS, images) from dist/
    dist = Path(app.static_folder)
    asset = dist / path
    if asset.exists() and asset.is_file():
        return send_from_directory('dist', path)
    # Everything else is a React route — hand back index.html
    return send_from_directory('dist', 'index.html')

# ─── Health (public — no auth) ────────────────────────────────────────────────

@app.route('/health')
def health():
    settings = get_settings()
    ztf_ok = (Path(settings['ztfPath']) / 'main.py').exists()
    status  = 'healthy' if ztf_ok else 'degraded'
    return jsonify({
        'status':        status,
        'ztf_installed': ztf_ok,
        'storage':       _storage.name,
        'retention': {
            'auditDays': AUDIT_RETENTION_DAYS,
            'executionDays': EXECUTION_RETENTION_DAYS,
        },
        'version':       '1.2.6',
    }), 200 if ztf_ok else 503

# ─── Auth endpoints ───────────────────────────────────────────────────────────

@app.route('/api/auth/login', methods=['POST'])
@limiter.limit('10 per minute')
def auth_login():
    data     = request.json or {}
    username = str(data.get('username', '')).strip()
    password = str(data.get('password', ''))
    if not username or not password:
        return jsonify({'error': 'username and password required'}), 400
    user = _find_user(username)
    if not user or not bcrypt.checkpw(password.encode(), user['password_hash'].encode()):
        log.warning('login_failed', extra={'user': username, 'ip': request.remote_addr})
        return jsonify({'error': 'Invalid credentials'}), 401
    token = _create_session(username, user['role'])
    log.info('login_success', extra={'user': username, 'ip': request.remote_addr})
    return jsonify({
        'token':   token,
        'user':    {'username': username, 'role': user['role']},
        'expires': (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=TOKEN_TTL)).isoformat() + 'Z',
    })

@app.route('/api/auth/logout', methods=['POST'])
@require_auth
def auth_logout():
    auth  = request.headers.get('Authorization', '')
    token = auth[7:] if auth.startswith('Bearer ') else ''
    _invalidate_session(token)
    log.info('logout', extra={'user': request.current_user['username']})
    return jsonify({'success': True})

@app.route('/api/auth/me')
@require_auth
def auth_me():
    return jsonify(request.current_user)

# ─── User management (admin only) ────────────────────────────────────────────

@app.route('/api/users')
@require_role('admin')
def list_users():
    return jsonify([
        {'username': u['username'], 'role': u['role'], 'created_at': u.get('created_at')}
        for u in _load_users()
    ])

@app.route('/api/users', methods=['POST'])
@require_role('admin')
def create_user():
    data     = request.json or {}
    username = str(data.get('username', '')).strip()
    password = str(data.get('password', ''))
    role     = str(data.get('role', 'viewer'))
    if not username or not password:
        return jsonify({'error': 'username and password required'}), 400
    if role not in ROLES:
        return jsonify({'error': f'role must be one of {ROLES}'}), 400
    users = _load_users()
    if any(u['username'] == username for u in users):
        return jsonify({'error': 'User already exists'}), 409
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    users.append({
        'id':            str(uuid.uuid4()),
        'username':      username,
        'password_hash': hashed,
        'role':          role,
        'created_at':    datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z',
    })
    _save_users(users)
    log.info('user_created', extra={'user': request.current_user['username'], 'action': f'created {username}'})
    return jsonify({'success': True}), 201

@app.route('/api/users/<username>', methods=['PUT'])
@require_role('admin')
def update_user(username: str):
    data  = request.json or {}
    users = _load_users()
    user  = next((u for u in users if u['username'] == username), None)
    if not user:
        return jsonify({'error': 'Not found'}), 404
    if 'password' in data:
        user['password_hash'] = bcrypt.hashpw(
            str(data['password']).encode(), bcrypt.gensalt()
        ).decode()
    if 'role' in data:
        if data['role'] not in ROLES:
            return jsonify({'error': f'role must be one of {ROLES}'}), 400
        user['role'] = data['role']
    _save_users(users)
    return jsonify({'success': True})

@app.route('/api/users/<username>', methods=['DELETE'])
@require_role('admin')
def delete_user(username: str):
    users = _load_users()
    if username == (request.current_user or {}).get('username'):
        return jsonify({'error': 'Cannot delete your own account'}), 400
    updated = [u for u in users if u['username'] != username]
    if len(updated) == len(users):
        return jsonify({'error': 'Not found'}), 404
    _save_users(updated)
    return jsonify({'success': True})

# ─── Settings ─────────────────────────────────────────────────────────────────

@app.route('/api/settings')
@require_role('admin', 'operator')
def get_settings_route():
    return jsonify(get_settings())

@app.route('/api/settings', methods=['POST'])
@require_role('admin')
def post_settings():
    data     = request.json or {}
    filtered = {k: v for k, v in data.items() if k in ALLOWED_SETTINGS_KEYS}
    write_json(SETTINGS_FILE, filtered)
    return jsonify({'success': True})

# ─── System check ─────────────────────────────────────────────────────────────

@app.route('/api/system/check')
@require_role('admin', 'operator')
def system_check():
    settings    = get_settings()
    python_path = settings['pythonPath']
    ztf_path    = settings['ztfPath']

    def run_check(name: str, cmd: list[str]) -> dict:
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            return {'name': name, 'ok': r.returncode == 0, 'value': r.stdout.strip()}
        except Exception:
            return {'name': name, 'ok': False, 'value': 'check failed'}

    ztf_installed = (Path(ztf_path) / 'main.py').exists()
    checks = [
        run_check('Python 3.9+', [python_path, '--version']),
        run_check('pip',          [python_path, '-m', 'pip', '--version']),
        run_check('git',          ['git', '--version']),
        {'name': 'ZTF Installed', 'ok': ztf_installed, 'value': 'found' if ztf_installed else ''},
    ]
    if ztf_installed:
        # Use the same dynamic lookup as the install endpoint —
        # ZTF ships prod.txt not requirements.txt
        ztf = Path(ztf_path)
        req_file = None
        candidates = ['requirements/requirements.txt', 'requirements.txt']
        req_dir = ztf / 'requirements'
        if req_dir.is_dir():
            for f in sorted(req_dir.glob('*.txt')):
                candidates.insert(0, str(f.relative_to(ztf)))
        for c in candidates:
            if (ztf / c).exists():
                req_file = c
                break
        checks.append({
            'name':  'Requirements File',
            'ok':    req_file is not None,
            'value': req_file or 'not found',
        })
    return jsonify({'checks': checks, 'ztfInstalled': ztf_installed})

# ─── Install ZTF ──────────────────────────────────────────────────────────────

@app.route('/api/install', methods=['POST'])
@require_role('admin')
@limiter.limit('2 per minute')
def install_ztf():
    settings    = get_settings()
    ztf_path    = settings['ztfPath']
    repo_url    = settings['repoUrl']
    python_path = settings['pythonPath']

    if repo_url not in ALLOWED_REPOS:
        return jsonify({'error': 'Repository URL not allowed'}), 400

    def generate() -> Generator[str, None, None]:
        def send(t, d):
            yield f"data: {json.dumps({'type': t, 'data': d})}\n\n"

        def run_cmd(args: list, cwd=None, env=None):
            yield from send('log', '$ ' + ' '.join(str(a) for a in args))
            proc = subprocess.Popen(args, cwd=cwd, env=env,
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            for line in proc.stdout:
                yield from send('stdout', line.rstrip())
            proc.wait()
            if proc.returncode != 0:
                raise RuntimeError(f'Command failed (exit {proc.returncode})')

        def is_git_checkout(path: Path) -> bool:
            try:
                result = subprocess.run(
                    ['git', '-C', str(path), 'rev-parse', '--is-inside-work-tree'],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=10,
                )
                return result.returncode == 0 and result.stdout.strip() == 'true'
            except Exception:
                return False

        try:
            ztf = Path(ztf_path)
            if not (ztf / 'main.py').exists():
                yield from send('step', 'Cloning ZeroTouch Framework...')
                yield from run_cmd(['git', 'clone', repo_url, ztf_path])
            elif is_git_checkout(ztf):
                yield from send('step', 'Updating existing ZeroTouch Framework...')
                yield from run_cmd(['git', 'pull'], cwd=ztf_path)
            else:
                yield from send('step', 'Existing ZeroTouch Framework is not a git checkout; skipping source update.')
                yield from send('log', 'To update source files, set ZTF Path to a cloned zerotouch-framework repository.')

            yield from send('step', 'Installing Python dependencies...')
            req_file = None
            candidates = ['requirements/requirements.txt', 'requirements.txt']
            req_dir = ztf / 'requirements'
            if req_dir.is_dir():
                for f in sorted(req_dir.glob('*.txt')):
                    candidates.insert(0, str(f.relative_to(ztf)))
            for c in candidates:
                if (ztf / c).exists():
                    req_file = c
                    break
            if req_file is None:
                raise RuntimeError('Could not find a requirements file')

            import tempfile
            req_text = (ztf / req_file).read_text()
            def fix_local_wheel(m):
                whl_name = Path(m.group(1)).name
                local = ztf / 'calm-whl' / whl_name
                return f'@ file://{local}' if local.exists() else m.group(0)
            patched = re.sub(r'@ file://(\S+\.whl)', fix_local_wheel, req_text)
            scrypt_re = re.compile(r'^scrypt\b.*', re.MULTILINE)
            scrypt_lines = scrypt_re.findall(patched or req_text)
            base = patched if patched != req_text else req_text
            no_scrypt = scrypt_re.sub('# scrypt skipped', base)

            import platform
            pip_env = os.environ.copy()
            tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
            tmp.write(no_scrypt)
            tmp.close()

            yield from send('log', f'Using requirements file: {req_file}')
            yield from run_cmd([python_path, '-m', 'pip', 'install', '--no-deps', '-r', tmp.name],
                                cwd=ztf_path, env=pip_env)

            if scrypt_lines:
                yield from send('step', 'Attempting optional scrypt install...')
                scrypt_env = pip_env.copy()
                if platform.system() == 'Darwin':
                    for prefix in ['/usr/local/opt/openssl', '/opt/homebrew/opt/openssl', '/usr']:
                        if Path(prefix, 'include/openssl/aes.h').exists():
                            scrypt_env['CFLAGS'] = f'-I{prefix}/include ' + scrypt_env.get('CFLAGS', '')
                            scrypt_env['LDFLAGS'] = f'-L{prefix}/lib ' + scrypt_env.get('LDFLAGS', '')
                            break
                try:
                    yield from run_cmd([python_path, '-m', 'pip', 'install', 'scrypt==0.8.20'],
                                       cwd=ztf_path, env=scrypt_env)
                    yield from send('log', 'scrypt installed (CyberArk vault support enabled)')
                except RuntimeError:
                    yield from send('log', 'scrypt optional — CyberArk vault unavailable. Install OpenSSL to enable.')

            yield from send('done', 'ZeroTouch Framework installed successfully!')
        except GeneratorExit:
            return
        except Exception:
            log.exception('install_error')
            yield from send('error', 'Installation failed. Check server logs for details.')

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'Connection': 'keep-alive'})

# ─── Config files ─────────────────────────────────────────────────────────────

@app.route('/api/configs')
@require_role('admin', 'operator', 'viewer')
def list_configs():
    configs_dir = get_configs_dir()
    files = []
    for f in configs_dir.iterdir():
        if f.suffix in ('.yml', '.yaml', '.json'):
            s = f.stat()
            files.append({'name': f.name, 'size': s.st_size, 'modified': s.st_mtime})
    return jsonify(sorted(files, key=lambda x: x['name']))

@app.route('/api/configs/<name>')
@require_role('admin', 'operator', 'viewer')
def get_config(name):
    configs_dir = get_configs_dir()
    path = safe_config_path(name, configs_dir)
    if path is None or not path.exists():
        return jsonify({'error': 'Not found'}), 404
    return jsonify({'name': path.name, 'content': path.read_text()})

@app.route('/api/configs/<name>', methods=['POST'])
@require_role('admin', 'operator')
def save_config(name):
    configs_dir = get_configs_dir()
    path = safe_config_path(name, configs_dir)
    if path is None:
        return jsonify({'error': 'Invalid filename'}), 400
    if path.suffix not in ('.yml', '.yaml', '.json'):
        return jsonify({'error': 'Only .yml/.yaml/.json files allowed'}), 400
    content = (request.json or {}).get('content', '')
    if path.suffix in ('.yml', '.yaml'):
        ok, err = validate_yaml(content)
        if not ok:
            return jsonify({'error': f'Invalid YAML: {err}'}), 400
    backup_config(path)
    _secure_write(path, content)
    return jsonify({'success': True})

@app.route('/api/configs/<name>', methods=['DELETE'])
@require_role('admin', 'operator')
def delete_config(name):
    configs_dir = get_configs_dir()
    path = safe_config_path(name, configs_dir)
    if path is None:
        return jsonify({'error': 'Invalid filename'}), 400
    if path.exists():
        path.unlink()
    return jsonify({'success': True})

@app.route('/api/configs/<name>/backups')
@require_role('admin', 'operator', 'viewer')
def list_config_backups(name):
    configs_dir = get_configs_dir()
    path = safe_config_path(name, configs_dir)
    if path is None:
        return jsonify({'error': 'Invalid filename'}), 400
    backups = []
    for i in range(1, CONFIG_BACKUPS + 1):
        bak = Path(str(path) + f'.bak.{i}')
        if bak.exists():
            s = bak.stat()
            backups.append({'version': i, 'size': s.st_size, 'modified': s.st_mtime})
    return jsonify(backups)

@app.route('/api/configs/<name>/restore/<int:version>', methods=['POST'])
@require_role('admin', 'operator')
def restore_config_backup(name, version):
    configs_dir = get_configs_dir()
    path = safe_config_path(name, configs_dir)
    if path is None:
        return jsonify({'error': 'Invalid filename'}), 400
    if not 1 <= version <= CONFIG_BACKUPS:
        return jsonify({'error': 'Invalid version'}), 400
    bak = Path(str(path) + f'.bak.{version}')
    if not bak.exists():
        return jsonify({'error': 'Backup not found'}), 404
    content = bak.read_text()
    backup_config(path)
    _secure_write(path, content)
    return jsonify({'success': True})

# ─── Global config ────────────────────────────────────────────────────────────

@app.route('/api/global-config')
@require_role('admin', 'operator', 'viewer')
def get_global_config():
    settings = get_settings()
    ztf_path = Path(settings['ztfPath'])
    global_yml = ztf_path / 'config' / 'global.yml'
    if global_yml.exists():
        return jsonify({'content': global_yml.read_text(), 'path': str(global_yml)})
    return jsonify({'content': None, 'path': str(global_yml)})

@app.route('/api/global-config', methods=['POST'])
@require_role('admin')
def save_global_config():
    content = (request.json or {}).get('content', '')
    ok, err = validate_yaml(content)
    if not ok:
        return jsonify({'error': f'Invalid YAML: {err}'}), 400
    settings = get_settings()
    global_yml = Path(settings['ztfPath']) / 'config' / 'global.yml'
    global_yml.parent.mkdir(parents=True, exist_ok=True)
    backup_config(global_yml)
    _secure_write(global_yml, content)
    return jsonify({'success': True})

# ─── Pipelines ───────────────────────────────────────────────────────────────

@app.route('/api/pipelines')
@require_role('admin', 'operator', 'viewer')
def list_pipelines():
    return jsonify(_load_pipelines())


@app.route('/api/pipelines', methods=['POST'])
@require_role('admin', 'operator')
def create_pipeline():
    data  = request.json or {}
    name  = str(data.get('name', '')).strip()
    steps = data.get('steps', [])
    if not name:
        return jsonify({'error': 'name required'}), 400
    for s in steps:
        if s.get('workflow') not in ALLOWED_WORKFLOWS:
            return jsonify({'error': f'Unknown workflow: {s.get("workflow")}'}), 400
    pipeline = {
        'id':        str(uuid.uuid4()),
        'name':      name,
        'steps':     steps,
        'createdAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z',
        'updatedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z',
    }
    pipelines = _load_pipelines()
    pipelines.append(pipeline)
    _save_pipelines(pipelines)
    return jsonify(pipeline), 201


@app.route('/api/pipelines/<pipeline_id>')
@require_role('admin', 'operator', 'viewer')
def get_pipeline(pipeline_id: str):
    pipeline = next((p for p in _load_pipelines() if p['id'] == pipeline_id), None)
    if not pipeline:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(pipeline)


@app.route('/api/pipelines/<pipeline_id>', methods=['PUT'])
@require_role('admin', 'operator')
def update_pipeline(pipeline_id: str):
    data      = request.json or {}
    pipelines = _load_pipelines()
    pipeline  = next((p for p in pipelines if p['id'] == pipeline_id), None)
    if not pipeline:
        return jsonify({'error': 'Not found'}), 404
    if 'name' in data:
        pipeline['name'] = str(data['name']).strip()
    if 'steps' in data:
        for s in data['steps']:
            if s.get('workflow') not in ALLOWED_WORKFLOWS:
                return jsonify({'error': f'Unknown workflow: {s.get("workflow")}'}), 400
        pipeline['steps'] = data['steps']
    pipeline['updatedAt'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z'
    _save_pipelines(pipelines)
    return jsonify(pipeline)


@app.route('/api/pipelines/<pipeline_id>', methods=['DELETE'])
@require_role('admin', 'operator')
def delete_pipeline(pipeline_id: str):
    pipelines = _load_pipelines()
    pipelines = [p for p in pipelines if p['id'] != pipeline_id]
    _save_pipelines(pipelines)
    return jsonify({'success': True})


@app.route('/api/pipelines/<pipeline_id>/run', methods=['POST'])
@require_role('admin', 'operator')
@limiter.limit('5 per minute')
def run_pipeline(pipeline_id: str):
    pipeline = next((p for p in _load_pipelines() if p['id'] == pipeline_id), None)
    if not pipeline:
        return jsonify({'error': 'Pipeline not found'}), 404
    steps = pipeline.get('steps', [])
    if not steps:
        return jsonify({'error': 'Pipeline has no steps'}), 400
    for s in steps:
        if s.get('workflow') not in ALLOWED_WORKFLOWS:
            return jsonify({'error': f'Unknown workflow: {s.get("workflow")}'}), 400

    settings     = get_settings()
    ztf_path     = settings['ztfPath']
    python_path  = settings['pythonPath']
    configs_dir  = get_configs_dir()
    current_user = getattr(request, 'current_user', {}).get('username', 'unknown')

    import time as _tm
    pipeline_run_id = str(int(_tm.time() * 1000))

    def generate() -> Generator[str, None, None]:

        def send(t: str, d):
            yield f"data: {json.dumps({'type': t, 'data': d, 'pipelineRunId': pipeline_run_id})}\n\n"

        step_results: list[dict] = []
        overall_status = 'success'

        yield from send('pipeline_start', {
            'pipelineName': pipeline['name'],
            'totalSteps':   len(steps),
        })

        for step_idx, step in enumerate(steps):
            workflow    = step['workflow']
            config_file = step.get('configFile', '')

            yield from send('step_start', {
                'step':       step_idx,
                'workflow':   workflow,
                'configFile': config_file,
            })

            # Resolve config path
            cfg_path: str | None = None
            if config_file:
                path = safe_config_path(config_file, configs_dir)
                if path and path.exists():
                    cfg_path = str(path)

            cmd_args = [python_path, 'main.py', '--workflow', workflow]
            if cfg_path:
                cmd_args += ['-f', cfg_path]

            proc        = None
            kill_timer  = None
            step_status = 'success'

            try:
                proc = subprocess.Popen(
                    cmd_args, cwd=ztf_path,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                )

                def _timeout_kill():
                    if proc and proc.poll() is None:
                        proc.kill()

                kill_timer = threading.Timer(EXEC_TIMEOUT, _timeout_kill)
                kill_timer.start()

                combined: queue.Queue = queue.Queue()

                def _reader(stream, label):
                    for line in stream:
                        combined.put((label, line.rstrip()))
                    combined.put(None)

                t_out = threading.Thread(target=_reader, args=(proc.stdout, 'stdout'), daemon=True)
                t_err = threading.Thread(target=_reader, args=(proc.stderr, 'stderr'), daemon=True)
                t_out.start(); t_err.start()

                done = 0
                while done < 2:
                    item = combined.get()
                    if item is None:
                        done += 1
                    else:
                        label, line = item
                        yield from send(label, line)

                proc.wait()
                step_status = 'success' if proc.returncode == 0 else 'failed'

            except GeneratorExit:
                if proc and proc.poll() is None:
                    proc.kill()
                    log.info('pipeline_cancelled', extra={'user': current_user, 'pipeline': pipeline['name']})
                return

            except Exception as exc:
                yield from send('stderr', f'Step {step_idx} error: {exc}')
                step_status = 'failed'

            finally:
                if kill_timer:
                    kill_timer.cancel()

            step_results.append({
                'step':       step_idx,
                'workflow':   workflow,
                'configFile': config_file,
                'status':     step_status,
                'returnCode': proc.returncode if proc else -1,
            })

            yield from send('step_complete', {
                'step':       step_idx,
                'workflow':   workflow,
                'status':     step_status,
                'returnCode': proc.returncode if proc else -1,
            })

            if step_status == 'failed':
                overall_status = 'failed'
                # Mark remaining steps as skipped
                for remaining_idx in range(step_idx + 1, len(steps)):
                    step_results.append({
                        'step':     remaining_idx,
                        'workflow': steps[remaining_idx]['workflow'],
                        'status':   'skipped',
                    })
                    yield from send('step_skipped', {
                        'step':     remaining_idx,
                        'workflow': steps[remaining_idx]['workflow'],
                    })
                break

        # Record in history
        ts       = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z'
        history  = read_json(HISTORY_FILE, [])
        history.insert(0, {
            'id':         pipeline_run_id,
            'workflow':   f'[Pipeline] {pipeline["name"]}',
            'type':       'pipeline',
            'status':     overall_status,
            'timestamp':  ts,
            'user':       current_user,
            'pipelineId': pipeline_id,
            'steps':      step_results,
        })
        write_json(HISTORY_FILE, history[:1000])

        log.info('pipeline_complete', extra={
            'user':     current_user,
            'pipeline': pipeline['name'],
            'status':   overall_status,
        })

        yield from send('pipeline_done', {
            'status':     overall_status,
            'steps':      step_results,
            'pipelineId': pipeline_id,
        })

        # Webhook notification
        webhook_url = settings.get('webhookUrl', '').strip()
        if webhook_url:
            threading.Thread(
                target=_fire_webhook,
                args=(webhook_url, {
                    'type':         'pipeline',
                    'pipelineName': pipeline['name'],
                    'pipelineId':   pipeline_id,
                    'status':       overall_status,
                    'user':         current_user,
                    'timestamp':    ts,
                    'steps':        step_results,
                }),
                daemon=True,
            ).start()

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'Connection': 'keep-alive'},
    )


# ─── Execute workflow ─────────────────────────────────────────────────────────

@app.route('/api/execute', methods=['POST'])
@require_role('admin', 'operator')
@limiter.limit('10 per minute')
def execute_workflow():
    data           = request.json or {}
    workflow       = data.get('workflow')
    config_content = data.get('configContent')
    config_file    = data.get('configFile')
    debug          = bool(data.get('debug', False))
    dry_run        = bool(data.get('dryRun', False))

    # script accepts a single ID string or a list for multi-script composition
    raw_script = data.get('script')
    if isinstance(raw_script, list):
        script_ids = [str(s).strip() for s in raw_script if str(s).strip()]
    elif raw_script:
        script_ids = [s.strip() for s in str(raw_script).split(',') if s.strip()]
    else:
        script_ids = []
    script = ','.join(script_ids) if script_ids else None

    if workflow and workflow not in ALLOWED_WORKFLOWS:
        return jsonify({'error': 'Unknown workflow'}), 400
    for sid in script_ids:
        if sid not in ALLOWED_SCRIPTS:
            return jsonify({'error': f'Unknown script: {sid}'}), 400
    if not workflow and not script:
        return jsonify({'error': 'workflow or script required'}), 400

    # Dry-run: run pre-flight checks only — no subprocess, no concurrency lock
    if dry_run:
        import time as _tm
        execution_id = str(int(_tm.time() * 1000))
        return Response(
            _run_preflight(workflow or script or '', config_content or '', execution_id),
            mimetype='text/event-stream',
            headers={'Cache-Control': 'no-cache', 'Connection': 'keep-alive'},
        )

    settings    = get_settings()
    ztf_path    = settings['ztfPath']
    python_path = settings['pythonPath']
    configs_dir = get_configs_dir()

    # Concurrency lock — one execution per workflow at a time
    lock_key = workflow or script
    with _RUNNING_LOCK:
        if lock_key in _RUNNING:
            return jsonify({'error': f'A "{lock_key}" execution is already running'}), 409
        _RUNNING.add(lock_key)

    import time
    execution_id  = str(int(time.time() * 1000))
    current_user  = getattr(request, 'current_user', {}).get('username', 'unknown')

    def generate() -> Generator[str, None, None]:
        proc = None
        kill_timer = None
        effective_config_content = config_content or ''

        def send(t, d):
            yield f"data: {json.dumps({'type': t, 'data': d, 'executionId': execution_id})}\n\n"

        def record_failed_attempt(reason: str):
            entry = _record_execution_history(
                execution_id=execution_id,
                workflow_or_script=workflow or script,
                execution_type='workflow' if workflow else 'script',
                status='failed',
                user=current_user,
                config_file=config_file or '',
                config_content=effective_config_content,
            )
            log.info('execution_complete', extra={
                'user': current_user, 'workflow': workflow or script,
                'action': 'execute', 'status': 'failed', 'reason': reason,
            })
            return entry

        try:
            cfg_path = None
            if effective_config_content and config_file:
                path = safe_config_path(config_file, configs_dir)
                if path is None:
                    record_failed_attempt('invalid_config_filename')
                    yield from send('error', 'Invalid config filename')
                    yield from send('done', {'code': -1, 'status': 'failed'})
                    return
                if path.suffix in ('.yml', '.yaml'):
                    ok, err = validate_yaml(effective_config_content)
                    if not ok:
                        record_failed_attempt('invalid_yaml')
                        yield from send('error', f'Invalid YAML: {err}')
                        yield from send('done', {'code': -1, 'status': 'failed'})
                        return
                    normalized_content, normalized_pc_ip = _normalize_ztf_config_content(workflow or '', effective_config_content)
                    if normalized_pc_ip:
                        effective_config_content = normalized_content
                        yield from send('stdout', 'Legacy fc_ip detected; saved as pc_ip for Nutanix ZTF compatibility')
                backup_config(path)
                _secure_write(path, effective_config_content)
                cfg_path = str(path)

            cmd_args = [python_path, 'main.py']
            if workflow: cmd_args += ['--workflow', workflow]
            if script:   cmd_args += ['--script',   script]
            if cfg_path: cmd_args += ['-f',          cfg_path]
            if debug:    cmd_args.append('--debug')

            display = ' '.join(cmd_args[:4]) + (' ...' if len(cmd_args) > 4 else '')
            yield from send('start', {'command': display, 'workingDir': ztf_path})

            log.info('execution_start', extra={
                'user': current_user, 'workflow': workflow or script,
                'action': 'execute', 'status': 'started',
            })

            proc = subprocess.Popen(
                cmd_args, cwd=ztf_path,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            )

            # Kill timer for execution timeout
            def _timeout_kill():
                if proc.poll() is None:
                    proc.kill()
                    log.warning('execution_timeout', extra={'user': current_user, 'workflow': workflow or script})

            kill_timer = threading.Timer(EXEC_TIMEOUT, _timeout_kill)
            kill_timer.start()

            # Thread readers — cross-platform stdout/stderr streaming
            combined: queue.Queue = queue.Queue()

            def _reader(stream, label):
                for line in stream:
                    combined.put((label, line.rstrip()))
                combined.put(None)

            t_out = threading.Thread(target=_reader, args=(proc.stdout, 'stdout'), daemon=True)
            t_err = threading.Thread(target=_reader, args=(proc.stderr, 'stderr'), daemon=True)
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

        except GeneratorExit:
            # Client disconnected — kill the subprocess
            if proc and proc.poll() is None:
                proc.kill()
                log.info('execution_cancelled', extra={'user': current_user, 'workflow': workflow or script})
            return

        except Exception:
            log.exception('execution_error', extra={'user': current_user, 'workflow': workflow or script})
            record_failed_attempt('exception')
            yield from send('error', 'Execution failed. Check server logs for details.')
            yield from send('done', {'code': -1, 'status': 'failed'})

        else:
            import time as tm
            duration = 0  # calculated below
            status   = 'success' if proc and proc.returncode == 0 else 'failed'

            entry = _record_execution_history(
                execution_id=execution_id,
                workflow_or_script=workflow or script,
                execution_type='workflow' if workflow else 'script',
                status=status,
                user=current_user,
                config_file=config_file or '',
                config_content=effective_config_content,
            )

            log.info('execution_complete', extra={
                'user': current_user, 'workflow': workflow or script,
                'action': 'execute', 'status': status,
            })

            webhook_url = settings.get('webhookUrl', '').strip()
            if webhook_url:
                threading.Thread(
                    target=_fire_webhook,
                    args=(webhook_url, {
                        'executionId': execution_id,
                        'workflow':    workflow or script,
                        'type':        'workflow' if workflow else 'script',
                        'status':      status,
                        'returnCode':  proc.returncode if proc else -1,
                        'user':        current_user,
                        'timestamp':   entry['timestamp'],
                    }),
                    daemon=True,
                ).start()

            yield from send('done', {'code': proc.returncode if proc else -1,
                                     'status': status})

        finally:
            if kill_timer:
                kill_timer.cancel()
            with _RUNNING_LOCK:
                _RUNNING.discard(lock_key)

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'Connection': 'keep-alive'})

# ─── Audit log ───────────────────────────────────────────────────────────────

@app.route('/api/audit-log')
@require_role('admin')
def get_audit_log():
    """Return the last N structured log entries from ztf-orchestrator.log."""
    limit  = min(int(request.args.get('limit', 200)), 1000)
    level  = request.args.get('level', '').upper()
    user   = request.args.get('user', '').lower()
    action = request.args.get('action', '').lower()

    if hasattr(_storage, 'read_audit_events'):
        return jsonify(_storage.read_audit_events(limit, level, user, action))

    if not LOG_FILE.exists():
        return jsonify([])

    entries: list[dict] = []
    try:
        with open(LOG_FILE, encoding='utf-8', errors='replace') as f:
            for raw in f:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    entry = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if level  and entry.get('level', '').upper() != level:
                    continue
                if user   and entry.get('user',  '').lower() != user:
                    continue
                if action and action not in entry.get('msg', '').lower() \
                          and action not in entry.get('action', '').lower():
                    continue
                entries.append(entry)
    except OSError:
        return jsonify([])

    return jsonify(entries[-limit:])


@app.route('/api/maintenance/retention', methods=['POST'])
@require_role('admin')
def run_retention_cleanup():
    """Apply configured retention cleanup where the storage backend supports it."""
    if not hasattr(_storage, 'cleanup_retention'):
        return jsonify({
            'success': True,
            'storage': _storage.name,
            'message': 'File-backed retention is handled by per-document limits.',
        })
    _storage.cleanup_retention(AUDIT_RETENTION_DAYS, EXECUTION_RETENTION_DAYS)
    log.info('retention_cleanup', extra={
        'action': 'retention_cleanup',
        'user': request.current_user['username'],
        'status': 'success',
    })
    return jsonify({
        'success': True,
        'storage': _storage.name,
        'auditRetentionDays': AUDIT_RETENTION_DAYS,
        'executionRetentionDays': EXECUTION_RETENTION_DAYS,
    })


# ─── Drift detection ─────────────────────────────────────────────────────────

@app.route('/api/drift')
@require_role('admin', 'operator', 'viewer')
def list_drift_runs():
    return jsonify(_load_drift_runs())


@app.route('/api/drift/check', methods=['POST'])
@require_role('admin', 'operator')
def check_drift():
    data = request.json or {}
    config_file = str(data.get('configFile', '')).strip()
    workflow = str(data.get('workflow', '')).strip()
    baseline = str(data.get('baseline', 'last_applied')).strip() or 'last_applied'
    current_state_content = data.get('currentStateContent')

    if not config_file:
        return jsonify({'error': 'configFile required'}), 400
    if workflow and workflow not in ALLOWED_WORKFLOWS:
        return jsonify({'error': f'Unknown workflow: {workflow}'}), 400
    if baseline not in ('last_applied', 'current_state'):
        return jsonify({'error': 'baseline must be last_applied or current_state'}), 400

    configs_dir = get_configs_dir()
    desired_path = safe_config_path(config_file, configs_dir)
    if desired_path is None or not desired_path.exists():
        return jsonify({'error': 'Config file not found'}), 404

    desired_content = desired_path.read_text()
    desired, desired_error = _parse_structured_config(desired_content, desired_path.name)
    if desired_error:
        return jsonify({'error': f'Desired config parse error: {desired_error}'}), 400

    observed_source = baseline
    observed_label = 'Last successful execution'
    observed_content = ''
    applied_execution = None

    if baseline == 'current_state':
        observed_label = 'Current state snapshot'
        observed_content = str(current_state_content or '')
        if not observed_content.strip():
            return jsonify({'error': 'currentStateContent required for current_state baseline'}), 400
    else:
        applied_execution = _find_last_applied_config(config_file, workflow)
        if not applied_execution:
            result = {
                'id': str(uuid.uuid4()),
                'configFile': config_file,
                'workflow': workflow,
                'status': 'unknown',
                'baseline': baseline,
                'observedLabel': observed_label,
                'summary': {'matched': 0, 'changed': 0, 'missing': 0, 'unexpected': 0, 'total': 0},
                'findings': [],
                'timestamp': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z',
                'user': request.current_user['username'],
                'message': 'No successful execution with stored config content was found for this config file.',
            }
            runs = _load_drift_runs()
            runs.insert(0, result)
            _save_drift_runs(runs)
            log.info('drift_check',
                     extra={'user': request.current_user['username'],
                            'action': 'drift_check',
                            'workflow': workflow or config_file,
                            'status': 'unknown'})
            return jsonify(result), 200
        observed_content = applied_execution.get('configContent', '')

    observed, observed_error = _parse_structured_config(observed_content, config_file)
    if observed_error:
        return jsonify({'error': f'Observed state parse error: {observed_error}'}), 400

    findings, summary = _compare_drift(desired, observed)
    drift_count = summary['changed'] + summary['missing'] + summary['unexpected']
    status = 'matched' if drift_count == 0 else 'drifted'

    result = {
        'id': str(uuid.uuid4()),
        'configFile': config_file,
        'workflow': workflow,
        'status': status,
        'baseline': observed_source,
        'observedLabel': observed_label,
        'appliedExecutionId': applied_execution.get('id') if applied_execution else None,
        'summary': summary,
        'findings': findings,
        'timestamp': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z',
        'user': request.current_user['username'],
    }

    runs = _load_drift_runs()
    runs.insert(0, result)
    _save_drift_runs(runs)

    log.info('drift_check',
             extra={'user': request.current_user['username'],
                    'action': 'drift_check',
                    'workflow': workflow or config_file,
                    'status': status})
    return jsonify(result)


@app.route('/api/drift', methods=['DELETE'])
@require_role('admin')
def clear_drift_runs():
    write_json(DRIFT_FILE, [])
    return jsonify({'success': True})


# ─── Scheduled executions ─────────────────────────────────────────────────────

@app.route('/api/schedules')
@require_role('admin', 'operator', 'viewer')
def list_schedules():
    _require_engines()
    return jsonify(_schedule_engine.list_schedules())

@app.route('/api/schedules', methods=['POST'])
@require_role('admin', 'operator')
def create_schedule():
    data = request.json or {}
    _require_engines()
    error = _schedule_validation_error(data)
    if error:
        return jsonify({'error': error}), 400
    s = _schedule_engine.create_schedule(data)
    return jsonify(s), 201

@app.route('/api/schedules/<sid>')
@require_role('admin', 'operator', 'viewer')
def get_schedule(sid):
    _require_engines()
    s = _schedule_engine.get_schedule(sid)
    if not s:
        return jsonify({'error': 'not found'}), 404
    return jsonify(s)

@app.route('/api/schedules/<sid>', methods=['PUT'])
@require_role('admin', 'operator')
def update_schedule(sid):
    data = request.json or {}
    _require_engines()
    existing = _schedule_engine.get_schedule(sid)
    if not existing:
        return jsonify({'error': 'not found'}), 404
    error = _schedule_validation_error(data, existing)
    if error:
        return jsonify({'error': error}), 400
    s = _schedule_engine.update_schedule(sid, data)
    if not s:
        return jsonify({'error': 'not found'}), 404
    return jsonify(s)

@app.route('/api/schedules/<sid>', methods=['DELETE'])
@require_role('admin')
def delete_schedule(sid):
    _require_engines()
    if not _schedule_engine.delete_schedule(sid):
        return jsonify({'error': 'not found'}), 404
    return jsonify({'success': True})

@app.route('/api/schedules/<sid>/run-now', methods=['POST'])
@require_role('admin', 'operator')
def run_schedule_now(sid):
    _require_engines()
    if not _schedule_engine.run_now(sid):
        return jsonify({'error': 'not found'}), 404
    return jsonify({'success': True})

# ─── Parallel execution ────────────────────────────────────────────────────────

@app.route('/api/parallel-runs')
@require_role('admin', 'operator', 'viewer')
def list_parallel_runs():
    _require_engines()
    return jsonify(_parallel_engine.list_runs())

@app.route('/api/parallel-runs/<run_id>')
@require_role('admin', 'operator', 'viewer')
def get_parallel_run(run_id):
    _require_engines()
    run = _parallel_engine.get_run(run_id)
    if not run:
        return jsonify({'error': 'not found'}), 404
    return jsonify(run)

@app.route('/api/parallel-runs', methods=['POST'])
@require_role('admin', 'operator')
@limiter.limit('5 per minute')
def start_parallel_run():
    data     = request.json or {}
    _require_engines()
    workflow = data.get('workflow', '')
    sites    = data.get('sites', [])

    if not workflow or workflow not in ALLOWED_WORKFLOWS:
        return jsonify({'error': 'Unknown workflow'}), 400
    if not sites or not isinstance(sites, list):
        return jsonify({'error': 'sites must be a non-empty list'}), 400
    if len(sites) > 10:
        return jsonify({'error': 'Maximum 10 sites per parallel run'}), 400

    settings    = get_settings()
    current_user = getattr(request, 'current_user', {}).get('username', 'unknown')

    try:
        run = _parallel_engine.submit(
            workflow   = workflow,
            sites      = sites,
            python_path = settings['pythonPath'],
            ztf_path   = settings['ztfPath'],
            configs_dir = get_configs_dir(),
            user        = current_user,
            on_webhook  = _fire_configured_webhook,
        )
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    return jsonify(run), 202

@app.route('/api/parallel-runs/<run_id>', methods=['DELETE'])
@require_role('admin')
def delete_parallel_run(run_id):
    _require_engines()
    if not _parallel_engine.delete_run(run_id):
        return jsonify({'error': 'not found'}), 404
    return jsonify({'success': True})

# ─── Approval gates ────────────────────────────────────────────────────────────

@app.route('/api/approvals')
@require_role('admin', 'operator', 'viewer')
def list_approvals():
    _require_engines()
    status_filter = request.args.get('status')
    return jsonify(_approval_manager.list_approvals(status=status_filter))

@app.route('/api/approvals', methods=['POST'])
@require_role('admin', 'operator')
def create_approval():
    data = request.json or {}
    _require_engines()
    workflow = data.get('workflow', '')
    if not workflow or workflow not in ALLOWED_WORKFLOWS:
        return jsonify({'error': 'Unknown workflow'}), 400
    current_user = getattr(request, 'current_user', {}).get('username', 'unknown')
    approval = _approval_manager.create_request(
        workflow       = workflow,
        config_file    = data.get('configFile', ''),
        config_content = data.get('configContent', ''),
        requested_by   = current_user,
        notes          = data.get('notes', ''),
        pipeline_id    = data.get('pipelineId'),
    )
    return jsonify(approval), 201

@app.route('/api/approvals/<aid>')
@require_role('admin', 'operator', 'viewer')
def get_approval(aid):
    _require_engines()
    approval = _approval_manager.get_approval(aid)
    if not approval:
        return jsonify({'error': 'not found'}), 404
    return jsonify(approval)

@app.route('/api/approvals/<aid>/approve', methods=['POST'])
@require_role('admin')
def approve_request(aid):
    _require_engines()
    current_user = getattr(request, 'current_user', {}).get('username', 'unknown')
    notes = (request.json or {}).get('notes', '')
    result = _approval_manager.decide(aid, 'approved', current_user, notes)
    if not result:
        return jsonify({'error': 'not found'}), 404
    return jsonify(result)

@app.route('/api/approvals/<aid>/reject', methods=['POST'])
@require_role('admin')
def reject_request(aid):
    _require_engines()
    current_user = getattr(request, 'current_user', {}).get('username', 'unknown')
    notes = (request.json or {}).get('notes', '')
    result = _approval_manager.decide(aid, 'rejected', current_user, notes)
    if not result:
        return jsonify({'error': 'not found'}), 404
    return jsonify(result)

@app.route('/api/approvals/<aid>', methods=['DELETE'])
@require_role('admin')
def delete_approval(aid):
    _require_engines()
    if not _approval_manager.delete_approval(aid):
        return jsonify({'error': 'not found'}), 404
    return jsonify({'success': True})

# ─── Execution history ────────────────────────────────────────────────────────

@app.route('/api/executions')
@require_role('admin', 'operator', 'viewer')
def get_executions():
    return jsonify(read_json(HISTORY_FILE, []))

@app.route('/api/executions', methods=['DELETE'])
@require_role('admin')
def clear_executions():
    write_json(HISTORY_FILE, [])
    return jsonify({'success': True})

# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    _ensure_default_admin()
    _init_engines()
    print('=' * 60)
    print('  ZeroTouch Enterprise Orchestrator  v1.2.6')
    print('=' * 60)
    print(f'  URL:  http://localhost:{PORT}')
    print(f'  Logs: {LOG_FILE}')
    print('=' * 60, flush=True)
    app.run(host='0.0.0.0', port=PORT, debug=False, threaded=True)
