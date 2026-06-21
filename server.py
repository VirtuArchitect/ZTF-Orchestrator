#!/usr/bin/env python3
"""ZeroTouch Enterprise Orchestrator — Flask Backend (production-hardened)"""

import datetime
import hashlib
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
import urllib.parse
import urllib.request
import uuid
import zipfile
from copy import deepcopy
from functools import wraps
from io import BytesIO
from pathlib import Path
from typing import Generator

import bcrypt
import yaml
from flask import Flask, Response, jsonify, request, send_file, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from storage_backend import StorageError, create_storage

# ─── Environment configuration ───────────────────────────────────────────────

CONFIG_DIR    = Path(os.environ.get('ZTF_DATA_DIR',    Path.home() / '.ztf-ui'))
ZTF_DEFAULT   = os.environ.get('ZTF_PATH',             str(Path.home() / 'zerotouch-framework'))
NKP_DEFAULT   = os.environ.get('ZTF_NKP_PATH',         str(Path.home() / 'nkp-zerotouch-framework'))
PYTHON_DEFAULT= os.environ.get('ZTF_PYTHON',           sys.executable)
PORT          = int(os.environ.get('ZTF_PORT',          5001))
BIND_HOST     = os.environ.get('ZTF_BIND_HOST',         '127.0.0.1')
LOG_LEVEL     = os.environ.get('ZTF_LOG_LEVEL',        'INFO')
EXEC_TIMEOUT  = int(os.environ.get('ZTF_EXEC_TIMEOUT',  3600))   # seconds
EXEC_WORKERS  = max(1, int(os.environ.get('ZTF_EXEC_WORKERS', '1')))
WEBHOOK_ALLOW_INSECURE = os.environ.get('ZTF_WEBHOOK_ALLOW_INSECURE', '').lower() in {'1', 'true', 'yes'}
WEBHOOK_ALLOWED_HOSTS = {
    host.strip().lower()
    for host in os.environ.get('ZTF_WEBHOOK_ALLOWED_HOSTS', '').split(',')
    if host.strip()
}
TOKEN_TTL     = int(os.environ.get('ZTF_TOKEN_TTL',     28800))  # seconds (8 h)
MAX_BODY      = int(os.environ.get('ZTF_MAX_BODY',      1048576)) # 1 MB
CONFIG_BACKUPS= int(os.environ.get('ZTF_CONFIG_BACKUPS',5))
STORAGE_BACKEND = os.environ.get('ZTF_STORAGE_BACKEND', 'file').strip().lower() or 'file'
AUDIT_RETENTION_DAYS = int(os.environ.get('ZTF_AUDIT_RETENTION_DAYS', '90'))
EXECUTION_RETENTION_DAYS = int(os.environ.get('ZTF_EXECUTION_RETENTION_DAYS', '180'))
NKP_BINARY_MAX_UPLOAD = int(os.environ.get('ZTF_NKP_BINARY_MAX_UPLOAD', str(512 * 1024 * 1024)))
APP_VERSION = '1.4.0'
ZTF_LEGACY_REF = os.environ.get('ZTF_REF', 'v1.5.2')

USERS_FILE     = CONFIG_DIR / 'users.json'
HISTORY_FILE   = CONFIG_DIR / 'history.json'
SETTINGS_FILE  = CONFIG_DIR / 'settings.json'
PIPELINES_FILE = CONFIG_DIR / 'pipelines.json'
DRIFT_FILE     = CONFIG_DIR / 'drift.json'
SCHEDULES_FILE = CONFIG_DIR / 'schedules.json'
PARALLEL_FILE  = CONFIG_DIR / 'parallel_runs.json'
APPROVALS_FILE = CONFIG_DIR / 'approvals.json'
JOBS_FILE      = CONFIG_DIR / 'jobs.json'
NKP_PROFILES_FILE = CONFIG_DIR / 'nkp_profiles.json'
NKP_PROFILE_REVISIONS_FILE = CONFIG_DIR / 'nkp_profile_revisions.json'
NKP_BINARIES_FILE = CONFIG_DIR / 'nkp_binaries.json'
VALIDATION_EVIDENCE_FILE = CONFIG_DIR / 'validation_evidence.json'
APPLIANCE_ARTIFACTS_FILE = CONFIG_DIR / 'appliance_artifacts.json'
APPLIANCE_UPDATES_FILE = CONFIG_DIR / 'appliance_updates.json'
APPLIANCE_UPDATE_REQUEST_FILE = CONFIG_DIR / 'appliance_update_request.json'
LOG_FILE       = CONFIG_DIR / 'ztf-orchestrator.log'
POSTGRES_BACKUP_DIR = CONFIG_DIR / 'backups' / 'postgres'
NKP_BINARIES_DIR = CONFIG_DIR / 'nkp-binaries'
ALLOWED_UPDATE_REPOS = {
    item.strip().lower()
    for item in os.environ.get(
        'ZTF_UPDATE_ALLOWED_REPOS',
        'VirtuArchitect/ZTF-Orchestrator,nutanixdev/zerotouch-framework,VirtuArchitect/nkp-zerotouch-framework',
    ).split(',')
    if item.strip()
}
UPDATE_TARGETS = {
    'ztf-orchestrator': {
        'label': 'ZTF-Orchestrator',
        'defaultRepo': 'VirtuArchitect/ZTF-Orchestrator',
        'requestType': 'ztf-orchestrator-container-update',
        'defaultPath': '',
    },
    'ztf-framework': {
        'label': 'ZeroTouch Framework',
        'defaultRepo': 'nutanixdev/zerotouch-framework',
        'requestType': 'ztf-framework-source-update',
        'defaultPath': ZTF_DEFAULT,
    },
    'nkp-framework': {
        'label': 'NKP Framework',
        'defaultRepo': 'VirtuArchitect/nkp-zerotouch-framework',
        'requestType': 'nkp-framework-source-update',
        'defaultPath': NKP_DEFAULT,
    },
}

ALLOWED_ORIGINS = [
    f'http://localhost:{PORT}',    f'http://127.0.0.1:{PORT}',
    'http://localhost:5173',       'http://127.0.0.1:5173',
]


def _database_location(database_url: str) -> str:
    """Return a non-sensitive database location for UI/status output."""
    if not database_url:
        return ''
    try:
        from urllib.parse import urlparse
        parsed = urlparse(database_url)
        host = parsed.hostname or ''
        port = f':{parsed.port}' if parsed.port else ''
        name = parsed.path.lstrip('/')
        return f'{parsed.scheme}://{host}{port}/{name}' if host else parsed.scheme
    except Exception:
        return 'configured'


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z'


def _resolve_ztf_main(ztf_path: str | Path) -> Path | None:
    """Return the legacy ZeroTouch Framework 1.x entrypoint."""
    root = Path(ztf_path)
    candidate = root / 'main.py'
    if candidate.exists():
        return candidate
    return None


def _ztf_installed(ztf_path: str | Path) -> bool:
    return _resolve_ztf_main(ztf_path) is not None


def _ztf_detect(ztf_path: str | Path) -> dict:
    root = Path(ztf_path)
    legacy_main = root / 'main.py'
    package_main = root / 'ztf' / 'main.py'
    pyproject = root / 'pyproject.toml'

    if legacy_main.exists():
        return {
            'installed': True,
            'compatible': True,
            'layout': 'legacy-1.x',
            'entrypoint': str(legacy_main),
            'requiredRef': ZTF_LEGACY_REF,
            'message': 'Legacy ZTF 1.x workflow/script CLI detected',
        }
    if package_main.exists() or pyproject.exists():
        return {
            'installed': True,
            'compatible': False,
            'layout': 'ztf-2.x',
            'entrypoint': str(package_main) if package_main.exists() else '',
            'requiredRef': ZTF_LEGACY_REF,
            'message': (
                'ZTF 2.x detected. ZTF-Orchestrator legacy workflows require '
                f'ZeroTouch Framework {ZTF_LEGACY_REF} or the 1.x branch.'
            ),
        }
    return {
        'installed': False,
        'compatible': False,
        'layout': 'missing',
        'entrypoint': '',
        'requiredRef': ZTF_LEGACY_REF,
        'message': 'ZeroTouch Framework was not found',
    }


def _ztf_incompatible_error(ztf_path: str | Path) -> tuple[dict, int] | None:
    info = _ztf_detect(ztf_path)
    if info.get('compatible'):
        return None
    return {
        'error': info['message'],
        'ztf': info,
    }, 409


def _ztf_requirements_file(ztf_path: str | Path) -> str | None:
    root = Path(ztf_path)
    candidates = ['requirements/requirements.txt', 'requirements.txt']
    req_dir = root / 'requirements'
    if req_dir.is_dir():
        for path in sorted(req_dir.glob('*.txt')):
            candidates.insert(0, str(path.relative_to(root)))
    for candidate in candidates:
        if (root / candidate).exists():
            return candidate
    return None


def _ztf_main_arg(ztf_path: str | Path) -> str:
    main = _resolve_ztf_main(ztf_path)
    if main is None:
        return 'main.py'
    try:
        return str(main.relative_to(Path(ztf_path)))
    except ValueError:
        return str(main)


def _nkp_script(nkp_path: str | Path) -> Path | None:
    root = Path(nkp_path)
    candidates = (
        [root / 'scripts' / 'zt.ps1', root / 'scripts' / 'zt.sh']
        if os.name == 'nt'
        else [root / 'scripts' / 'zt.sh', root / 'scripts' / 'zt.ps1']
    )
    return next((candidate for candidate in candidates if candidate.exists()), None)


def _nkp_installed(nkp_path: str | Path) -> bool:
    return _nkp_script(nkp_path) is not None


def _parse_iso_datetime(value: str | None):
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except (TypeError, ValueError):
        return None


def _artifact_status(record: dict) -> str:
    verified_at = _parse_iso_datetime(record.get('verifiedAt'))
    expires_at = _parse_iso_datetime(record.get('expiresAt'))
    now = datetime.datetime.now(datetime.timezone.utc)
    if verified_at:
        return 'verified'
    if expires_at and expires_at < now:
        return 'expired'
    if expires_at and expires_at - now <= datetime.timedelta(days=14):
        return 'expiring'
    if record.get('archiveLocation'):
        return 'archived'
    return 'pending'


def _load_appliance_artifacts() -> list[dict]:
    artifacts = read_json(APPLIANCE_ARTIFACTS_FILE, [])
    if not isinstance(artifacts, list):
        return []
    normalized = []
    for item in artifacts:
        if not isinstance(item, dict) or not item.get('id'):
            continue
        record = dict(item)
        record['status'] = _artifact_status(record)
        normalized.append(record)
    return sorted(normalized, key=lambda item: item.get('updatedAt') or item.get('createdAt') or '', reverse=True)


def _save_appliance_artifacts(artifacts: list[dict]) -> None:
    write_json(APPLIANCE_ARTIFACTS_FILE, artifacts[:500])


def _clean_text(value, limit: int = 512) -> str:
    return str(value or '').strip()[:limit]


def _normalize_release_repo(value: str | None) -> tuple[str | None, str | None]:
    raw = _clean_text(value or 'VirtuArchitect/ZTF-Orchestrator', 256)
    if raw.startswith('https://github.com/'):
        parsed = urllib.parse.urlparse(raw)
        parts = [part for part in parsed.path.strip('/').split('/') if part]
        raw = '/'.join(parts[:2])
    raw = raw.removesuffix('.git')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', raw):
        return None, 'repository must be an owner/name GitHub repository'
    if raw.lower() not in ALLOWED_UPDATE_REPOS:
        return None, 'repository is not in the appliance update allowlist'
    return raw, None


def _valid_update_version(value: str) -> bool:
    return bool(re.fullmatch(r'v?[0-9][A-Za-z0-9_.-]{0,63}', value))


def _valid_container_image(value: str) -> bool:
    if not value:
        return True
    allowed_prefixes = (
        'ghcr.io/virtuarchitect/ztf-orchestrator:',
        'ztf-orchestrator:',
    )
    if not value.startswith(allowed_prefixes):
        return False
    tag = value.rsplit(':', 1)[-1]
    return _valid_update_version(tag) or tag == 'latest'


def _valid_git_ref(value: str) -> bool:
    if not value:
        return False
    if value.startswith(('-', '/', '.')) or value.endswith(('/', '.')):
        return False
    if '..' in value or '@{' in value or '\\' in value:
        return False
    return bool(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._/-]{0,127}', value))


def _clean_update_target(value: str | None) -> str | None:
    target = _clean_text(value or 'ztf-orchestrator', 64).lower()
    return target if target in UPDATE_TARGETS else None


def _update_status(record: dict) -> str:
    if record.get('appliedAt'):
        return 'applied'
    if record.get('stagedAt'):
        return 'staged'
    if record.get('verifiedAt'):
        return 'verified'
    if record.get('source') == 'github':
        return 'available'
    return 'imported'


def _load_appliance_updates() -> list[dict]:
    updates = read_json(APPLIANCE_UPDATES_FILE, [])
    if not isinstance(updates, list):
        return []
    normalized = []
    for item in updates:
        if not isinstance(item, dict) or not item.get('id'):
            continue
        record = dict(item)
        record['status'] = _update_status(record)
        normalized.append(record)
    return sorted(normalized, key=lambda item: item.get('updatedAt') or item.get('createdAt') or '', reverse=True)


def _save_appliance_updates(updates: list[dict]) -> None:
    write_json(APPLIANCE_UPDATES_FILE, updates[:100])


def _clean_update_manifest(data: dict, existing: dict | None = None) -> tuple[dict | None, str | None]:
    existing = existing or {}
    target = _clean_update_target(data.get('target', existing.get('target', 'ztf-orchestrator')))
    if not target:
        return None, 'target must be ztf-orchestrator, ztf-framework, or nkp-framework'
    target_info = UPDATE_TARGETS[target]

    source = _clean_text(data.get('source', existing.get('source', 'offline')), 32).lower()
    if source not in {'github', 'offline'}:
        return None, 'source must be github or offline'

    version = _clean_text(data.get('version', existing.get('version', '')), 64)
    if not version or not _valid_update_version(version):
        return None, 'version must be a release tag such as v1.4.1'

    repo, error = _normalize_release_repo(data.get('repository', existing.get('repository', target_info['defaultRepo'])))
    if error:
        return None, error

    container_image = _clean_text(
        data.get(
            'containerImage',
            existing.get('containerImage', f'ghcr.io/virtuarchitect/ztf-orchestrator:{version}' if target == 'ztf-orchestrator' else ''),
        ),
        256,
    )
    if target == 'ztf-orchestrator' and not _valid_container_image(container_image):
        return None, 'containerImage must use the approved ZTF-Orchestrator image namespace'
    if target != 'ztf-orchestrator' and container_image:
        return None, 'containerImage is only valid for ztf-orchestrator updates'

    target_path = _clean_text(data.get('targetPath', existing.get('targetPath', target_info['defaultPath'])), 512)
    if target != 'ztf-orchestrator' and not target_path:
        return None, 'targetPath is required for framework updates'
    if target != 'ztf-orchestrator' and not target_path.startswith('/'):
        return None, 'targetPath must be an absolute appliance host path'

    checksum = _clean_text(data.get('checksum', existing.get('checksum', '')), 128).lower()
    if checksum and not re.fullmatch(r'[a-f0-9]{64}', checksum):
        return None, 'checksum must be a SHA-256 hex digest'

    source_ref = _clean_text(data.get('sourceRef', existing.get('sourceRef', version)), 128)
    if not _valid_git_ref(source_ref):
        return None, 'sourceRef must be a safe git ref or release tag'

    raw_assets = data.get('assets', existing.get('assets', []))
    assets = []
    if isinstance(raw_assets, list):
        for asset in raw_assets[:20]:
            if not isinstance(asset, dict):
                continue
            try:
                size = int(asset.get('size') or 0)
            except (TypeError, ValueError):
                size = 0
            assets.append({
                'name': _clean_text(asset.get('name', ''), 160),
                'size': max(0, size),
                'url': _clean_text(asset.get('url', asset.get('browser_download_url', '')), 512),
            })

    now = _now_iso()
    record = {
        **existing,
        'target': target,
        'targetLabel': target_info['label'],
        'source': source,
        'repository': repo,
        'version': version,
        'name': _clean_text(data.get('name', existing.get('name', version)), 160),
        'releaseUrl': _clean_text(data.get('releaseUrl', existing.get('releaseUrl', '')), 512),
        'artifactUrl': _clean_text(data.get('artifactUrl', existing.get('artifactUrl', '')), 512),
        'containerImage': container_image,
        'sourceRef': source_ref,
        'targetPath': target_path,
        'checksum': checksum,
        'manifestSha256': _clean_text(data.get('manifestSha256', existing.get('manifestSha256', '')), 128).lower(),
        'publishedAt': _clean_text(data.get('publishedAt', existing.get('publishedAt', '')), 64),
        'notes': _clean_text(data.get('notes', existing.get('notes', '')), 1200),
        'prerelease': bool(data.get('prerelease', existing.get('prerelease', False))),
        'assets': assets,
        'verifiedAt': _clean_text(data.get('verifiedAt', existing.get('verifiedAt', '')), 64),
        'verifiedBy': _clean_text(data.get('verifiedBy', existing.get('verifiedBy', '')), 128),
        'stagedAt': _clean_text(data.get('stagedAt', existing.get('stagedAt', '')), 64),
        'stagedBy': _clean_text(data.get('stagedBy', existing.get('stagedBy', '')), 128),
        'requestId': _clean_text(data.get('requestId', existing.get('requestId', '')), 128),
        'requestPath': _clean_text(data.get('requestPath', existing.get('requestPath', '')), 512),
        'appliedAt': _clean_text(data.get('appliedAt', existing.get('appliedAt', '')), 64),
        'appliedBy': _clean_text(data.get('appliedBy', existing.get('appliedBy', '')), 128),
        'updatedAt': now,
    }
    if record.get('manifestSha256') and not re.fullmatch(r'[a-f0-9]{64}', record['manifestSha256']):
        return None, 'manifestSha256 must be a SHA-256 hex digest'
    for field in ('verifiedAt', 'stagedAt', 'appliedAt'):
        if record.get(field) and not _parse_iso_datetime(record[field]):
            return None, f'{field} must be an ISO timestamp'
    if not record.get('id'):
        record['id'] = str(uuid.uuid4())
        record['createdAt'] = now
    record['status'] = _update_status(record)
    return record, None


def _latest_github_release(repository: str, include_prerelease: bool = False, target: str = 'ztf-orchestrator') -> dict:
    url = f'https://api.github.com/repos/{repository}/releases'
    req = urllib.request.Request(
        url,
        headers={
            'Accept': 'application/vnd.github+json',
            'User-Agent': f'ZTF-Orchestrator/{APP_VERSION}',
            'X-GitHub-Api-Version': '2022-11-28',
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:  # nosec B310 - allowlisted GitHub API URL.
        releases = json.loads(resp.read().decode('utf-8'))
    if not isinstance(releases, list):
        raise RuntimeError('GitHub release response was not a list')
    for release in releases:
        if not isinstance(release, dict) or release.get('draft'):
            continue
        if release.get('prerelease') and not include_prerelease:
            continue
        tag = str(release.get('tag_name') or '').strip()
        if not tag:
            continue
        assets = release.get('assets') if isinstance(release.get('assets'), list) else []
        return {
            'target': target,
            'source': 'github',
            'repository': repository,
            'version': tag,
            'name': release.get('name') or tag,
            'releaseUrl': release.get('html_url') or '',
            'artifactUrl': release.get('zipball_url') or '',
            'containerImage': f'ghcr.io/virtuarchitect/ztf-orchestrator:{tag}' if target == 'ztf-orchestrator' else '',
            'targetPath': UPDATE_TARGETS.get(target, UPDATE_TARGETS['ztf-orchestrator'])['defaultPath'],
            'sourceRef': tag,
            'publishedAt': release.get('published_at') or '',
            'prerelease': bool(release.get('prerelease')),
            'assets': [
                {
                    'name': _clean_text(asset.get('name', ''), 160),
                    'size': int(asset.get('size') or 0),
                    'url': _clean_text(asset.get('browser_download_url', ''), 512),
                }
                for asset in assets
                if isinstance(asset, dict)
            ][:20],
        }
    raise RuntimeError('No matching GitHub release was found')


def _clean_artifact_payload(data: dict, existing: dict | None = None) -> tuple[dict | None, str | None]:
    existing = existing or {}
    profile = _clean_text(data.get('profile', existing.get('profile', '')), 32).lower()
    if profile not in {'standard', 'airgap', 'minimal'}:
        return None, 'profile must be standard, airgap, or minimal'

    version = _clean_text(data.get('version', existing.get('version', '')), 64)
    if not version:
        return None, 'version is required'

    checksum = _clean_text(data.get('checksum', existing.get('checksum', '')), 128).lower()
    if checksum and not re.fullmatch(r'[a-f0-9]{64}', checksum):
        return None, 'checksum must be a SHA-256 hex digest'

    expires_at = _clean_text(data.get('expiresAt', existing.get('expiresAt', '')), 64)
    if expires_at and not _parse_iso_datetime(expires_at):
        return None, 'expiresAt must be an ISO timestamp'

    verified_at = _clean_text(data.get('verifiedAt', existing.get('verifiedAt', '')), 64)
    if verified_at and not _parse_iso_datetime(verified_at):
        return None, 'verifiedAt must be an ISO timestamp'
    try:
        size_bytes = int(data.get('sizeBytes', existing.get('sizeBytes') or 0) or 0)
    except (TypeError, ValueError):
        return None, 'sizeBytes must be a number'

    now = _now_iso()
    record = {
        **existing,
        'profile': profile,
        'version': version,
        'artifactName': _clean_text(data.get('artifactName', existing.get('artifactName', '')), 160),
        'archiveLocation': _clean_text(data.get('archiveLocation', existing.get('archiveLocation', '')), 512),
        'checksum': checksum,
        'checksumFile': _clean_text(data.get('checksumFile', existing.get('checksumFile', '')), 160),
        'workflowUrl': _clean_text(data.get('workflowUrl', existing.get('workflowUrl', '')), 512),
        'releaseUrl': _clean_text(data.get('releaseUrl', existing.get('releaseUrl', '')), 512),
        'sizeBytes': max(0, size_bytes),
        'expiresAt': expires_at,
        'verifiedAt': verified_at,
        'notes': _clean_text(data.get('notes', existing.get('notes', '')), 1000),
        'updatedAt': now,
    }
    if not record.get('id'):
        record['id'] = str(uuid.uuid4())
        record['createdAt'] = now
    record['status'] = _artifact_status(record)
    return record, None


def _appliance_status() -> dict:
    source_dir = Path('/opt/ztf-orchestrator-source')
    install_dir = Path('/opt/ztf-orchestrator')
    preload_dir = Path('/opt/ztf-orchestrator-preload')
    compose_file = install_dir / 'appliance' / 'docker-compose.appliance.yml'
    env_file = Path('/etc/ztf-orchestrator-appliance.env')
    firstboot_log = Path('/var/log/ztf-orchestrator-firstboot.log')
    nkp_host_path = preload_dir / 'nkp-zerotouch-framework'
    bundles_path = preload_dir / 'bundles'
    checks = [
        {'name': 'Source checkout', 'ok': source_dir.exists(), 'value': str(source_dir)},
        {'name': 'Install directory', 'ok': install_dir.exists(), 'value': str(install_dir)},
        {'name': 'Appliance Compose file', 'ok': compose_file.exists(), 'value': str(compose_file)},
        {'name': 'Appliance environment', 'ok': env_file.exists(), 'value': str(env_file)},
        {'name': 'Firstboot log', 'ok': firstboot_log.exists(), 'value': str(firstboot_log)},
        {'name': 'NKP framework preload', 'ok': nkp_host_path.exists(), 'value': str(nkp_host_path)},
        {'name': 'NKP bundle preload', 'ok': bundles_path.exists(), 'value': str(bundles_path)},
    ]
    return {
        'detected': any(check['ok'] for check in checks),
        'checks': checks,
        'containerPaths': {
            'ztfFramework': '/opt/zerotouch-framework',
            'nkpFramework': '/var/lib/ztf-orchestrator/nkp-zerotouch-framework',
            'nkpBundles': '/var/lib/ztf-orchestrator/bundles',
        },
    }


def _nkp_command(nkp_path: str | Path, phase: str, config_path: str, strict: bool = False) -> list[str]:
    script = _nkp_script(nkp_path)
    if script is None:
        raise RuntimeError('NKP ZeroTouch Framework script was not found')
    if phase not in NKP_SAFE_PHASES:
        raise ValueError('NKP phase is not allowed')

    if script.suffix.lower() == '.ps1':
        cmd = ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(script), phase, '-Config', config_path]
        if strict:
            cmd.append('-Strict')
        return cmd

    cmd = ['bash', str(script), phase, '--config', config_path]
    if strict:
        cmd.append('--strict')
    return cmd


def _list_nkp_profiles() -> list[dict]:
    profiles = read_json(NKP_PROFILES_FILE, [])
    if not isinstance(profiles, list):
        return []
    return [_normalize_nkp_profile(item) for item in profiles if isinstance(item, dict)]


def _save_nkp_profiles(profiles: list[dict]) -> None:
    write_json(NKP_PROFILES_FILE, profiles)


def _list_nkp_profile_revisions(profile_id: str | None = None) -> list[dict]:
    revisions = read_json(NKP_PROFILE_REVISIONS_FILE, [])
    if not isinstance(revisions, list):
        return []
    if profile_id:
        revisions = [item for item in revisions if isinstance(item, dict) and item.get('profileId') == profile_id]
    return sorted(
        [item for item in revisions if isinstance(item, dict)],
        key=lambda item: (str(item.get('profileId') or ''), int(item.get('revision') or 0), str(item.get('createdAt') or '')),
        reverse=True,
    )


def _save_nkp_profile_revisions(revisions: list[dict]) -> None:
    write_json(NKP_PROFILE_REVISIONS_FILE, revisions[:2000])


def _profile_revision_value(profile: dict | None) -> int:
    try:
        return max(1, int((profile or {}).get('revision') or 1))
    except (TypeError, ValueError):
        return 1


def _record_nkp_profile_revision(profile: dict, action: str, user: str) -> dict:
    snapshot = json.loads(json.dumps(profile))
    revision = _profile_revision_value(profile)
    entry = {
        'id': str(uuid.uuid4()),
        'profileId': profile.get('id'),
        'profileName': profile.get('name', ''),
        'revision': revision,
        'action': action,
        'createdAt': _now_iso(),
        'createdBy': user or 'unknown',
        'profile': snapshot,
    }
    revisions = _list_nkp_profile_revisions()
    revisions.insert(0, entry)
    _save_nkp_profile_revisions(revisions)
    return entry


def _build_nkp_execution_trace(data: dict, phase: str, config_file: str, config_content: str, approval_id: str) -> tuple[dict, tuple[dict, int] | None]:
    trace = {
        'framework': 'nkp',
        'phase': phase,
        'configFile': config_file,
        'configSource': 'inline' if config_content else 'file',
        'approvalId': approval_id or '',
    }
    profile_id = str(data.get('profileId') or '').strip()
    if profile_id:
        profile = next((item for item in _list_nkp_profiles() if item.get('id') == profile_id), None)
        if not profile:
            return trace, ({'error': 'NKP deployment profile was not found'}, 404)
        current_revision = _profile_revision_value(profile)
        requested_revision = data.get('profileRevision')
        if requested_revision not in (None, ''):
            try:
                requested_revision_int = int(requested_revision)
            except (TypeError, ValueError):
                return trace, ({'error': 'profileRevision must be an integer'}, 400)
            if requested_revision_int != current_revision:
                return trace, ({
                    'error': 'NKP deployment profile revision has changed; refresh before submitting',
                    'currentRevision': current_revision,
                    'requestedRevision': requested_revision_int,
                }, 409)
        trace.update({
            'profileId': profile_id,
            'profileName': profile.get('name', ''),
            'profileRevision': current_revision,
            'templateId': ((profile.get('template') or {}).get('id') or ''),
            'templateName': ((profile.get('template') or {}).get('name') or ''),
        })
    elif data.get('profileName'):
        trace['profileName'] = str(data.get('profileName') or '').strip()

    schema_validation = {}
    if config_content:
        schema_validation = _nkp_schema_validate_content(config_content)
    elif config_file:
        path = safe_config_path(config_file, get_configs_dir())
        if path and path.exists():
            try:
                schema_validation = _nkp_schema_validate_content(path.read_text(encoding='utf-8'))
            except OSError:
                schema_validation = {}
    if schema_validation:
        trace['schemaStatus'] = schema_validation.get('status', '')
        trace['schemaMissing'] = schema_validation.get('missing', [])
        trace['schemaWarnings'] = schema_validation.get('warnings', [])
    if data.get('generatedConfigFile'):
        trace['generatedConfigFile'] = str(data.get('generatedConfigFile') or '').strip()
    return trace, None


def _list_nkp_binaries() -> list[dict]:
    binaries = read_json(NKP_BINARIES_FILE, [])
    if not isinstance(binaries, list):
        return []
    return [_with_nkp_binary_status(item) for item in binaries if isinstance(item, dict)]


def _save_nkp_binaries(binaries: list[dict]) -> None:
    write_json(NKP_BINARIES_FILE, binaries)


def _safe_nkp_binary_filename(name: str) -> str:
    filename = Path(name or '').name
    filename = re.sub(r'[^A-Za-z0-9._-]+', '-', filename).strip('.-')
    if not filename:
        filename = f'nkp-binary-{uuid.uuid4().hex[:8]}'
    return filename[:180]


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _with_nkp_binary_status(binary: dict) -> dict:
    item = dict(binary)
    path = Path(str(item.get('path') or ''))
    exists = path.exists()
    item['exists'] = exists
    item['status'] = 'available' if exists else 'missing'
    if exists:
        try:
            item['size'] = path.stat().st_size if path.is_file() else None
        except OSError:
            item['size'] = item.get('size')
    return item


def _resolve_nkp_cli_path(path_text: str) -> Path | None:
    """Resolve a registered NKP binary/bundle path to an executable CLI path."""
    if not path_text:
        return None
    root = Path(str(path_text)).expanduser()
    candidates = []
    if root.is_file():
        candidates.append(root)
    candidates.extend([
        root / 'cli' / ('nkp.exe' if os.name == 'nt' else 'nkp'),
        root / ('nkp.exe' if os.name == 'nt' else 'nkp'),
        root / 'nkp',
        root / 'cli' / 'nkp',
    ])
    for candidate in candidates:
        try:
            if candidate.exists() and candidate.is_file():
                return candidate
        except OSError:
            continue
    return None


def _nkp_compat_command(label: str, args: list[str], *, required_tokens: list[str] | None = None) -> dict:
    check_id = re.sub(r'[^a-z0-9_]+', '_', label.strip().lower()).strip('_') or 'nkp_check'
    return {
        'id': check_id,
        'label': label,
        'args': args,
        'requiredTokens': required_tokens or [],
    }


NKP_COMPATIBILITY_COMMANDS = [
    _nkp_compat_command('NKP version', ['--version']),
    _nkp_compat_command('Nutanix cluster create help', ['create', 'cluster', 'nutanix', '--help'], required_tokens=[
        'create cluster nutanix', 'endpoint', 'control-plane', 'worker',
    ]),
    _nkp_compat_command('Nutanix image builder help', ['create', 'image', 'nutanix', '--help'], required_tokens=[
        'create image nutanix', 'cluster', 'endpoint', 'subnet',
    ]),
    _nkp_compat_command('Bundle push help', ['push', 'bundle', '--help'], required_tokens=[
        'push', 'bundle', 'registry',
    ]),
    _nkp_compat_command('Image bundle push help', ['push', 'image-bundle', '--help'], required_tokens=[
        'push', 'image-bundle', 'registry',
    ]),
]


def _nkp_cli_compatibility(path_text: str, timeout: int = 8) -> dict:
    cli = _resolve_nkp_cli_path(path_text)
    checks = []
    if cli is None:
        return {
            'status': 'blocked',
            'cliPath': '',
            'summary': {'passed': 0, 'warnings': 0, 'failed': 1},
            'checks': [{
                'id': 'nkp_cli_path',
                'label': 'NKP CLI path',
                'status': 'fail',
                'detail': 'No nkp executable found at the registered path or under cli/nkp',
                'command': '',
                'output': '',
            }],
        }

    for spec in NKP_COMPATIBILITY_COMMANDS:
        command = [str(cli), *spec['args']]
        output = ''
        status = 'warn'
        detail = ''
        try:
            result = subprocess.run(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=timeout,
            )
            output = (result.stdout or '').strip()
            searchable = f"{' '.join(spec['args'])}\n{output}".lower()
            missing = [token for token in spec['requiredTokens'] if token.lower() not in searchable]
            if result.returncode == 0 and not missing:
                status = 'pass'
                detail = 'Command completed and expected NKP v2.17-relevant help terms were observed'
            elif result.returncode == 0:
                status = 'warn'
                detail = f"Command completed, but expected help terms need review: {', '.join(missing)}"
            else:
                status = 'warn'
                detail = f'Command returned exit code {result.returncode}; review output for installed CLI syntax'
        except subprocess.TimeoutExpired:
            status = 'warn'
            detail = f'Command timed out after {timeout} seconds'
        except OSError as exc:
            status = 'fail'
            detail = f'Could not execute NKP CLI: {exc}'
        checks.append({
            'id': spec['id'],
            'label': spec['label'],
            'status': status,
            'detail': detail,
            'command': ' '.join(command),
            'output': output[:4000],
        })

    failed = sum(1 for item in checks if item['status'] == 'fail')
    warnings = sum(1 for item in checks if item['status'] == 'warn')
    return {
        'status': 'blocked' if failed else 'compatible' if warnings == 0 else 'needs_review',
        'cliPath': str(cli),
        'summary': {
            'passed': sum(1 for item in checks if item['status'] == 'pass'),
            'warnings': warnings,
            'failed': failed,
        },
        'checks': checks,
    }


def _list_validation_evidence() -> list[dict]:
    evidence = read_json(VALIDATION_EVIDENCE_FILE, [])
    if not isinstance(evidence, list):
        return []
    return sorted(
        [item for item in evidence if isinstance(item, dict)],
        key=lambda item: str(item.get('createdAt') or ''),
        reverse=True,
    )


def _save_validation_evidence(evidence: list[dict]) -> None:
    write_json(VALIDATION_EVIDENCE_FILE, evidence[:500])


def _redact_command_output(text: str) -> str:
    value = str(text or '')
    value = re.sub(r'(?i)(password|token|secret|apikey|api_key)\s*[:=]\s*\S+', r'\1=<redacted>', value)
    value = re.sub(r'postgresql://([^:\s/]+):([^@\s]+)@', r'postgresql://\1:<redacted>@', value)
    return value[:12000]


def _evidence_summary_status(readiness: dict, compatibility: dict | None, schema_validation: dict | None = None) -> str:
    if readiness.get('status') == 'blocked':
        return 'blocked'
    if compatibility and compatibility.get('status') == 'blocked':
        return 'blocked'
    if schema_validation and schema_validation.get('status') == 'fail':
        return 'blocked'
    if readiness.get('status') == 'needs_attention' or (compatibility and compatibility.get('status') == 'needs_review'):
        return 'needs_review'
    if schema_validation and schema_validation.get('status') == 'warn':
        return 'needs_review'
    return 'ready'


def _build_validation_evidence(data: dict, user: str) -> dict:
    profile_id = str(data.get('profileId') or '').strip()
    profile = None
    if profile_id:
        profile = next((item for item in _list_nkp_profiles() if item.get('id') == profile_id), None)
        if not profile:
            raise ValueError('NKP deployment profile was not found')
    elif isinstance(data.get('profile'), dict):
        profile = _normalize_nkp_profile(data['profile'])

    generated_yaml = ''
    readiness: dict = {}
    schema_validation: dict = {}
    compatibility = None

    if profile:
        generated_yaml = _nkp_profile_to_yaml(profile)
        readiness = _nkp_profile_readiness(profile)
        schema_validation = _nkp_schema_validate_content(generated_yaml)
        if data.get('includeCompatibility'):
            binary_path = str(((profile.get('nkp') or {}).get('binaryPath')) or '').strip()
            if binary_path:
                compatibility = _nkp_cli_compatibility(binary_path)

    if not generated_yaml and data.get('configFile'):
        path = safe_config_path(str(data.get('configFile') or ''), get_configs_dir())
        if path and path.exists():
            generated_yaml = path.read_text(encoding='utf-8')
            schema_validation = schema_validation or _nkp_schema_validate_content(generated_yaml)

    if not generated_yaml:
        raise ValueError('generatedYaml, configFile, profileId, or profile is required')

    if not readiness:
        readiness = {'status': 'unknown', 'score': 0, 'summary': {'passed': 0, 'warnings': 0, 'failed': 0}, 'checks': []}
    schema_validation = _nkp_schema_validate_content(generated_yaml)

    job_id = str(data.get('jobId') or '').strip()
    job = _job_manager.get_job(job_id) if job_id else None
    output_excerpt = _redact_command_output(data.get('output') or '')
    if job and not output_excerpt:
        output_excerpt = _redact_command_output('\n'.join(
            str(event.get('data') or '') for event in job.get('logs', [])[-80:]
        ))

    created_at = _now_iso()
    record = {
        'id': str(uuid.uuid4()),
        'type': str(data.get('type') or 'nkp-validation'),
        'status': _evidence_summary_status(readiness, compatibility, schema_validation),
        'createdAt': created_at,
        'createdBy': user or 'unknown',
        'notes': str(data.get('notes') or '').strip(),
        'profileId': (profile or {}).get('id') or profile_id,
        'profileName': (profile or {}).get('name') or str(data.get('profileName') or '').strip(),
        'profileRevision': _profile_revision_value(profile) if profile else data.get('profileRevision'),
        'configFile': str(data.get('configFile') or '').strip(),
        'approvalId': str(data.get('approvalId') or '').strip(),
        'jobId': job_id,
        'taskIds': job.get('taskIds', []) if job else data.get('taskIds', []),
        'readiness': readiness,
        'schemaValidation': schema_validation,
        'compatibility': compatibility,
        'generatedYaml': generated_yaml,
        'outputExcerpt': output_excerpt,
        'metadata': data.get('metadata') if isinstance(data.get('metadata'), dict) else {},
    }
    evidence = _list_validation_evidence()
    evidence.insert(0, record)
    _save_validation_evidence(evidence)
    log.info('validation_evidence_created', extra={
        'event': 'validation_evidence_created',
        'action': 'create_validation_evidence',
        'user': user,
        'evidenceId': record['id'],
        'status': record['status'],
        'profileId': record.get('profileId'),
    })
    return record


def _validation_evidence_markdown(record: dict) -> str:
    lines = [
        f"# Validation Evidence - {record.get('profileName') or record.get('id')}",
        '',
        f"- Status: {record.get('status')}",
        f"- Created: {record.get('createdAt')}",
        f"- Created by: {record.get('createdBy')}",
        f"- Profile: {record.get('profileName') or 'n/a'}",
        f"- Profile revision: {record.get('profileRevision') or 'n/a'}",
        f"- Config file: {record.get('configFile') or 'n/a'}",
        f"- Approval ID: {record.get('approvalId') or 'n/a'}",
        f"- Job ID: {record.get('jobId') or 'n/a'}",
        f"- Task IDs: {', '.join(record.get('taskIds') or []) or 'n/a'}",
        '',
        '## Readiness',
        '',
        f"- Status: {(record.get('readiness') or {}).get('status', 'unknown')}",
        f"- Score: {(record.get('readiness') or {}).get('score', 0)}%",
        '',
    ]
    for check in (record.get('readiness') or {}).get('checks', []):
        lines.append(f"- {check.get('status', '').upper()}: {check.get('label')} - {check.get('detail')}")
    lines += ['', '## Schema Validation', '', f"- Status: {(record.get('schemaValidation') or {}).get('status', 'unknown')}"]
    missing = (record.get('schemaValidation') or {}).get('missing') or []
    warnings = (record.get('schemaValidation') or {}).get('warnings') or []
    if missing:
        lines.append(f"- Missing: {', '.join(missing)}")
    if warnings:
        lines.append(f"- Warnings: {'; '.join(warnings)}")
    compatibility = record.get('compatibility') or {}
    if compatibility:
        lines += ['', '## NKP CLI Compatibility', '', f"- Status: {compatibility.get('status', 'unknown')}"]
        for check in compatibility.get('checks', []):
            lines.append(f"- {check.get('status', '').upper()}: {check.get('label')} - {check.get('detail')}")
    lines += ['', '## Notes', '', record.get('notes') or 'No notes supplied.', '']
    return '\n'.join(lines)


def _validation_evidence_zip(record: dict) -> BytesIO:
    buffer = BytesIO()
    safe_id = _safe_nkp_binary_filename(record.get('id') or 'validation-evidence')
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f'{safe_id}/evidence.json', json.dumps(record, indent=2))
        zf.writestr(f'{safe_id}/summary.md', _validation_evidence_markdown(record))
        if record.get('generatedYaml'):
            zf.writestr(f'{safe_id}/generated.yaml', record.get('generatedYaml'))
        if record.get('outputExcerpt'):
            zf.writestr(f'{safe_id}/output.txt', record.get('outputExcerpt'))
    buffer.seek(0)
    return buffer


def _set_default_nkp_binary(binaries: list[dict], binary_id: str) -> bool:
    found = False
    for item in binaries:
        is_target = item.get('id') == binary_id
        item['default'] = is_target
        if is_target:
            item['updatedAt'] = _now_iso()
            found = True
    return found


def _slugify(value: str, fallback: str = 'nkp-profile') -> str:
    slug = re.sub(r'[^a-z0-9-]+', '-', (value or '').strip().lower()).strip('-')
    return slug or fallback


def _split_csv(value) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [item.strip() for item in str(value or '').split(',') if item.strip()]


NKP_TEMPLATE_PACKS = [
    {
        'id': 'management-cluster',
        'name': 'Management Cluster',
        'category': 'Connected',
        'description': 'Baseline NKP management cluster profile for a connected site with Prism Central access.',
        'recommendedUse': 'Use first when standing up the management plane that will own or coordinate workload clusters.',
        'profileDefaults': {
            'name': 'NKP Management Cluster',
            'description': 'Management cluster deployment profile generated from the ZTF-Orchestrator template pack.',
            'environment': 'production',
            'nkp': {
                'version': '',
                'binaryPath': '',
                'registry': '',
                'sshKeyRef': 'admin_cred',
            },
            'prismCentral': {
                'endpoint': '',
                'credentialRef': 'pc_user',
            },
            'cluster': {
                'name': 'nkp-mgmt',
                'type': 'management',
                'kubernetesVersion': '',
                'vip': '',
            },
            'network': {
                'subnet': '',
                'gateway': '',
                'dnsServers': [],
                'ntpServers': [],
                'domain': '',
                'vlanId': '',
            },
            'nodes': [
                {'name': 'mgmt-node-1', 'serial': '', 'hostIp': '', 'cvmIp': '', 'ipmiIp': '', 'rack': ''},
                {'name': 'mgmt-node-2', 'serial': '', 'hostIp': '', 'cvmIp': '', 'ipmiIp': '', 'rack': ''},
                {'name': 'mgmt-node-3', 'serial': '', 'hostIp': '', 'cvmIp': '', 'ipmiIp': '', 'rack': ''},
            ],
        },
        'requiredFields': [
            'Prism Central endpoint and credential reference',
            'NKP binary path or registered default binary',
            'Cluster name, Kubernetes version, and cluster VIP',
            'Subnet, gateway, DNS, NTP, domain, and VLAN',
            'At least three management node host/CVM/IPMI addresses',
        ],
        'optionalFields': [
            'Private registry endpoint for image mirroring',
            'Rack or serial metadata for site traceability',
        ],
        'preflightChecklist': [
            'Confirm Prism Central API reachability on TCP/9440 from the Orchestrator host.',
            'Confirm DNS and NTP services are reachable from the deployment network.',
            'Confirm all node, CVM, IPMI, VIP, and gateway addresses are unique.',
            'Confirm the NKP binary exists on the Orchestrator host or appliance.',
        ],
    },
    {
        'id': 'workload-cluster',
        'name': 'Workload Cluster',
        'category': 'Connected',
        'description': 'Workload cluster profile intended to be deployed after a management cluster is available.',
        'recommendedUse': 'Use for application or tenant clusters that should inherit site networking and PC defaults.',
        'profileDefaults': {
            'name': 'NKP Workload Cluster',
            'description': 'Workload cluster deployment profile generated from the ZTF-Orchestrator template pack.',
            'environment': 'production',
            'nkp': {
                'version': '',
                'binaryPath': '',
                'registry': '',
                'sshKeyRef': 'admin_cred',
            },
            'prismCentral': {
                'endpoint': '',
                'credentialRef': 'pc_user',
            },
            'cluster': {
                'name': 'nkp-workload',
                'type': 'workload',
                'kubernetesVersion': '',
                'vip': '',
            },
            'network': {
                'subnet': '',
                'gateway': '',
                'dnsServers': [],
                'ntpServers': [],
                'domain': '',
                'vlanId': '',
            },
            'nodes': [
                {'name': 'worker-node-1', 'serial': '', 'hostIp': '', 'cvmIp': '', 'ipmiIp': '', 'rack': ''},
                {'name': 'worker-node-2', 'serial': '', 'hostIp': '', 'cvmIp': '', 'ipmiIp': '', 'rack': ''},
            ],
        },
        'requiredFields': [
            'Existing management cluster context outside this profile',
            'Prism Central endpoint and credential reference',
            'Workload cluster name, Kubernetes version, and cluster VIP',
            'Worker node host/CVM/IPMI addresses',
        ],
        'optionalFields': [
            'Registry endpoint if the workload cluster uses a mirrored image source',
            'Environment label for chargeback or lifecycle grouping',
        ],
        'preflightChecklist': [
            'Confirm the target management cluster is healthy before workload deployment.',
            'Confirm workload subnet routing, DNS, NTP, and gateway are correct.',
            'Confirm worker node addresses are unique and inside the workload CIDR.',
        ],
    },
    {
        'id': 'airgapped-local-registry',
        'name': 'Air-Gapped / Local Registry',
        'category': 'Restricted',
        'description': 'Profile pack for environments that use staged NKP binaries and a private/local image registry.',
        'recommendedUse': 'Use for disconnected, dark-site, or tightly controlled networks where internet pulls are not allowed.',
        'profileDefaults': {
            'name': 'NKP Air-Gapped Cluster',
            'description': 'Air-gapped deployment profile generated from the ZTF-Orchestrator template pack.',
            'environment': 'restricted',
            'nkp': {
                'version': '',
                'binaryPath': '',
                'registry': 'registry.local:5000',
                'sshKeyRef': 'admin_cred',
            },
            'prismCentral': {
                'endpoint': '',
                'credentialRef': 'pc_user',
            },
            'cluster': {
                'name': 'nkp-restricted',
                'type': 'management',
                'kubernetesVersion': '',
                'vip': '',
            },
            'network': {
                'subnet': '',
                'gateway': '',
                'dnsServers': [],
                'ntpServers': [],
                'domain': 'local',
                'vlanId': '',
            },
            'nodes': [
                {'name': 'restricted-node-1', 'serial': '', 'hostIp': '', 'cvmIp': '', 'ipmiIp': '', 'rack': ''},
                {'name': 'restricted-node-2', 'serial': '', 'hostIp': '', 'cvmIp': '', 'ipmiIp': '', 'rack': ''},
                {'name': 'restricted-node-3', 'serial': '', 'hostIp': '', 'cvmIp': '', 'ipmiIp': '', 'rack': ''},
            ],
        },
        'requiredFields': [
            'Registered NKP binary path on persistent Orchestrator storage',
            'Private registry endpoint and image mirror readiness',
            'Prism Central endpoint reachable from the restricted network',
            'DNS/NTP services that do not depend on public internet access',
        ],
        'optionalFields': [
            'Registry credential reference if the local registry requires authentication',
            'Site/rack metadata for offline audit trails',
        ],
        'preflightChecklist': [
            'Confirm all NKP artifacts are staged locally before execution.',
            'Confirm the private registry contains required NKP images.',
            'Confirm no deployment step depends on public DNS or internet routing.',
            'Confirm backup and rollback artifacts are available in the same restricted site.',
        ],
    },
]


def _public_nkp_template_pack(template: dict) -> dict:
    return deepcopy(template)


def _nkp_template_summary(template: dict | None) -> dict:
    if not template:
        return {'id': '', 'name': '', 'category': '', 'managementClusterRef': ''}
    return {
        'id': str(template.get('id') or '').strip(),
        'name': str(template.get('name') or '').strip(),
        'category': str(template.get('category') or '').strip(),
        'managementClusterRef': str(template.get('managementClusterRef') or '').strip(),
    }


def _nkp_template_by_id(template_id: str) -> dict | None:
    return next((item for item in NKP_TEMPLATE_PACKS if item.get('id') == template_id), None)


def _meaningful_nkp_node(node: dict) -> bool:
    if not isinstance(node, dict):
        return False
    return any(str(node.get(key) or '').strip() for key in ('serial', 'hostIp', 'cvmIp', 'ipmiIp', 'rack'))


def _merge_profile_template(defaults: dict, overrides: dict) -> dict:
    merged = deepcopy(defaults)

    def merge_dict(target: dict, source: dict) -> dict:
        for key, value in source.items():
            if key in {'id', 'createdAt', 'updatedAt'}:
                continue
            if key == 'nodes' and isinstance(value, list):
                if any(_meaningful_nkp_node(item) for item in value):
                    target[key] = deepcopy(value)
                continue
            if isinstance(value, dict) and isinstance(target.get(key), dict):
                merge_dict(target[key], value)
                continue
            if isinstance(value, list):
                if value:
                    target[key] = deepcopy(value)
                continue
            if value is not None and str(value).strip():
                target[key] = value
        return target

    return merge_dict(merged, overrides or {})


def _nkp_profile_template_pack(profile: dict) -> dict | None:
    template_id = str((profile.get('template') or {}).get('id') or '').strip()
    return _nkp_template_by_id(template_id)


NKP_EXAMPLE_REQUIRED_FALLBACK = {
    'environment': ['name', 'type', 'provider'],
    'nkp': ['version', 'bundlePath', 'cliPath'],
    'nutanix': ['prismCentralEndpoint', 'clusterName', 'subnetName', 'imageName', 'storageContainer', 'project'],
    'cluster': [
        'name', 'kubernetesVersion', 'controlPlaneEndpointIp',
        'controlPlaneEndpointPort', 'controlPlaneReplicas', 'workerReplicas',
        'podCidr', 'serviceCidr', 'ntpServers', 'sshPublicKeyFile', 'sshUsername',
    ],
}


def _nkp_examples_root(nkp_path: str | Path) -> Path:
    return Path(nkp_path) / 'configs' / 'environments'


def _nkp_example_files(nkp_path: str | Path) -> list[Path]:
    root = _nkp_examples_root(nkp_path)
    if not root.is_dir():
        return []
    files = [
        path for path in root.rglob('*')
        if path.is_file() and path.suffix.lower() in {'.yaml', '.yml'}
    ]
    return sorted(files, key=lambda item: item.name)[:100]


def _nkp_example_relpath(path: Path, nkp_path: str | Path) -> str:
    return path.resolve().relative_to(_nkp_examples_root(nkp_path).resolve()).as_posix()


def _safe_nkp_example_path(nkp_path: str | Path, relpath: str) -> Path | None:
    root = _nkp_examples_root(nkp_path).resolve()
    candidate = (root / str(relpath or '')).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    if candidate.suffix.lower() not in {'.yaml', '.yml'} or not candidate.is_file():
        return None
    return candidate


def _nkp_schema_from_examples(nkp_path: str | Path) -> dict:
    examples = []
    top_level_sets: list[set[str]] = []
    nested: dict[str, list[set[str]]] = {}
    for path in _nkp_example_files(nkp_path):
        try:
            data = yaml.safe_load(path.read_text(encoding='utf-8')) or {}
        except (OSError, yaml.YAMLError):
            continue
        if not isinstance(data, dict):
            continue
        keys = {str(key) for key in data.keys()}
        top_level_sets.append(keys)
        for key, value in data.items():
            if isinstance(value, dict):
                nested.setdefault(str(key), []).append({str(item) for item in value.keys()})
        examples.append({
            'name': path.name,
            'path': _nkp_example_relpath(path, nkp_path),
            'topLevelKeys': sorted(keys),
        })

    if top_level_sets:
        required_top_level = sorted(set.intersection(*top_level_sets))
        optional_top_level = sorted(set.union(*top_level_sets) - set(required_top_level))
    else:
        required_top_level = sorted(NKP_EXAMPLE_REQUIRED_FALLBACK.keys())
        optional_top_level = ['registry']

    nested_required = {}
    for key in required_top_level:
        if nested.get(key):
            nested_required[key] = sorted(set.intersection(*nested[key]))
        else:
            nested_required[key] = NKP_EXAMPLE_REQUIRED_FALLBACK.get(key, [])
    for key, fields in NKP_EXAMPLE_REQUIRED_FALLBACK.items():
        nested_required.setdefault(key, fields)

    return {
        'source': 'installed_examples' if examples else 'fallback',
        'examples': examples,
        'requiredTopLevel': required_top_level,
        'optionalTopLevel': optional_top_level,
        'nestedRequired': nested_required,
    }


def _nkp_schema_validate_content(content: str, nkp_path: str | Path | None = None) -> dict:
    nkp_path = nkp_path or (get_settings().get('nkpPath') or NKP_DEFAULT)
    schema = _nkp_schema_from_examples(nkp_path)
    try:
        data = yaml.safe_load(content) or {}
    except yaml.YAMLError as exc:
        return {
            'status': 'fail',
            'schema': schema,
            'missing': [],
            'warnings': [],
            'errors': [f'YAML parse error: {exc}'],
        }
    if not isinstance(data, dict):
        return {
            'status': 'fail',
            'schema': schema,
            'missing': [],
            'warnings': [],
            'errors': ['NKP YAML must be a mapping at the document root'],
        }

    missing = []
    warnings = []
    for key in schema.get('requiredTopLevel', []):
        if key not in data:
            missing.append(key)
    for key, fields in (schema.get('nestedRequired') or {}).items():
        if key not in data or not isinstance(data.get(key), dict):
            continue
        for field in fields:
            value = data[key].get(field)
            if value in (None, '', []):
                missing.append(f'{key}.{field}')

    known = set(schema.get('requiredTopLevel', [])) | set(schema.get('optionalTopLevel', []))
    extras = sorted(str(key) for key in data.keys() if str(key) not in known)
    if extras:
        warnings.append(f'Extra top-level keys not observed in NKP examples: {", ".join(extras)}')

    env_type = str(((data.get('environment') or {}) if isinstance(data.get('environment'), dict) else {}).get('type') or '').lower()
    if env_type in {'air-gapped', 'airgapped'} and not isinstance(data.get('registry'), dict):
        missing.append('registry')

    status = 'fail' if missing else 'warn' if warnings else 'pass'
    return {
        'status': status,
        'schema': schema,
        'missing': missing,
        'warnings': warnings,
        'errors': [],
    }


def _nkp_profile_from_example(data: dict, source_name: str = '') -> dict:
    environment = data.get('environment') if isinstance(data.get('environment'), dict) else {}
    nkp = data.get('nkp') if isinstance(data.get('nkp'), dict) else {}
    nutanix = data.get('nutanix') if isinstance(data.get('nutanix'), dict) else {}
    cluster = data.get('cluster') if isinstance(data.get('cluster'), dict) else {}
    registry = data.get('registry') if isinstance(data.get('registry'), dict) else {}
    env_type = str(environment.get('type') or '').lower()
    template_id = (
        'airgapped-local-registry' if env_type in {'air-gapped', 'airgapped'}
        else 'management-cluster'
    )
    template = _nkp_template_by_id(template_id)
    profile = {
        'name': str(cluster.get('name') or environment.get('name') or Path(source_name).stem or 'NKP Imported Profile'),
        'description': f'Imported from NKP example {source_name}'.strip(),
        'environment': str(environment.get('name') or env_type or 'lab'),
        'template': _nkp_template_summary(template),
        'nkp': {
            'version': str(nkp.get('version') or ''),
            'binaryPath': str(nkp.get('bundlePath') or nkp.get('cliPath') or ''),
            'registry': str(registry.get('endpoint') or ''),
            'sshKeyRef': 'admin_cred',
        },
        'prismCentral': {
            'endpoint': str(nutanix.get('prismCentralEndpoint') or ''),
            'credentialRef': 'pc_user',
        },
        'cluster': {
            'name': str(cluster.get('name') or ''),
            'type': 'management',
            'kubernetesVersion': str(cluster.get('kubernetesVersion') or ''),
            'vip': str(cluster.get('controlPlaneEndpointIp') or ''),
        },
        'network': {
            'subnet': str(cluster.get('loadBalancerIpRange') or ''),
            'gateway': '',
            'dnsServers': [],
            'ntpServers': cluster.get('ntpServers') if isinstance(cluster.get('ntpServers'), list) else [],
            'domain': '',
            'vlanId': '',
        },
        'proxy': {
            'httpProxy': str(((environment.get('proxy') or {}) if isinstance(environment.get('proxy'), dict) else {}).get('httpProxy') or ''),
            'httpsProxy': str(((environment.get('proxy') or {}) if isinstance(environment.get('proxy'), dict) else {}).get('httpsProxy') or ''),
            'noProxy': _split_csv(((environment.get('proxy') or {}) if isinstance(environment.get('proxy'), dict) else {}).get('noProxy')),
        },
        'registry': {
            'endpoint': str(registry.get('endpoint') or ''),
            'namespace': str(registry.get('namespace') or 'nkp'),
            'credentialRef': str(registry.get('credentialRef') or ''),
            'caCert': str(registry.get('caCert') or ''),
            'insecure': bool(registry.get('insecure') or False),
        },
        'imageBuilder': {
            'enabled': False,
            'prismElementCluster': str(nutanix.get('clusterName') or ''),
            'subnet': str(nutanix.get('subnetName') or ''),
            'sourceImage': '',
            'artifactBundle': '',
            'imageName': str(nutanix.get('imageName') or 'nkp-node-image'),
            'bastionHost': '',
            'gpuProfile': '',
            'fips': False,
            'insecure': False,
        },
        'nodes': [{'name': 'node-1', 'serial': '', 'hostIp': '', 'cvmIp': '', 'ipmiIp': '', 'rack': ''}],
    }
    return _normalize_nkp_profile(profile)


def _valid_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(str(value).strip())
        return True
    except ValueError:
        return False


def _endpoint_host(value: str) -> str:
    text = str(value or '').strip()
    if not text:
        return ''
    parsed = urllib.parse.urlparse(text if '://' in text else f'https://{text}')
    return parsed.hostname or ''


def _validate_nkp_profile(profile: dict) -> list[str]:
    errors: list[str] = []

    def require(path: str, label: str) -> str:
        current = profile
        for part in path.split('.'):
            if not isinstance(current, dict):
                current = {}
                break
            current = current.get(part)
        value = str(current or '').strip()
        if not value:
            errors.append(f'{label} is required')
        return value

    name = require('name', 'Profile name')
    require('cluster.name', 'Cluster name')
    require('prismCentral.endpoint', 'Prism Central endpoint')
    gateway = require('network.gateway', 'Network gateway')
    subnet = require('network.subnet', 'Network subnet')

    if gateway and not _valid_ip(gateway):
        errors.append('Network gateway must be a valid IP address')
    if subnet:
        try:
            ipaddress.ip_network(subnet, strict=False)
        except ValueError:
            errors.append('Network subnet must be a valid CIDR, for example 10.42.10.0/24')

    dns = _split_csv((profile.get('network') or {}).get('dnsServers'))
    ntp = _split_csv((profile.get('network') or {}).get('ntpServers'))
    if not dns:
        errors.append('At least one DNS server is required')
    if not ntp:
        errors.append('At least one NTP server is required')
    for item in dns:
        if not _valid_ip(item):
            errors.append(f'DNS server {item} must be a valid IP address')

    nodes = profile.get('nodes') if isinstance(profile.get('nodes'), list) else []
    if not nodes:
        errors.append('At least one node is required')
    for index, node in enumerate(nodes, start=1):
        if not isinstance(node, dict):
            errors.append(f'Node {index} must be an object')
            continue
        node_label = node.get('name') or f'Node {index}'
        for key, label in [('hostIp', 'host IP'), ('cvmIp', 'CVM IP')]:
            value = str(node.get(key) or '').strip()
            if not value:
                errors.append(f'{node_label} {label} is required')
            elif not _valid_ip(value):
                errors.append(f'{node_label} {label} must be a valid IP address')
        ipmi_ip = str(node.get('ipmiIp') or '').strip()
        if ipmi_ip and not _valid_ip(ipmi_ip):
            errors.append(f'{node_label} IPMI IP must be a valid IP address')

    if not name:
        errors.append('A profile cannot be saved without a name')
    return errors


def _nkp_profile_readiness(profile: dict, check_connectivity: bool = False) -> dict:
    checks: list[dict] = []

    def add(check_id: str, label: str, status: str, detail: str) -> None:
        checks.append({'id': check_id, 'label': label, 'status': status, 'detail': detail})

    required_errors = _validate_nkp_profile(profile)
    add(
        'required_fields',
        'Required deployment fields',
        'fail' if required_errors else 'pass',
        '; '.join(required_errors) if required_errors else 'All required profile fields are populated',
    )

    pc_endpoint = (profile.get('prismCentral') or {}).get('endpoint', '')
    pc_host = _endpoint_host(pc_endpoint)
    if not pc_host:
        add('prism_central_endpoint', 'Prism Central endpoint format', 'fail', 'Prism Central endpoint must include a host')
    else:
        add('prism_central_endpoint', 'Prism Central endpoint format', 'pass', f'Host resolved from profile: {pc_host}')
        if check_connectivity:
            reachable, latency = _tcp_check(pc_host, 9440, timeout=3.0)
            add(
                'prism_central_connectivity',
                'Prism Central API reachability',
                'pass' if reachable else 'warn',
                f'Reachable on TCP/9440 in {latency:.0f} ms' if reachable else 'TCP/9440 was not reachable from the Orchestrator host',
            )
    if not check_connectivity:
        add(
            'prism_central_connectivity',
            'Prism Central API reachability',
            'warn',
            'Connectivity check not run; use it only from a network that can reach the deployment target',
        )

    network = profile.get('network') or {}
    subnet_text = str(network.get('subnet') or '').strip()
    subnet = None
    try:
        subnet = ipaddress.ip_network(subnet_text, strict=False)
    except ValueError:
        pass

    ip_values: list[tuple[str, str]] = []
    cluster_vip = str((profile.get('cluster') or {}).get('vip') or '').strip()
    if cluster_vip:
        ip_values.append(('Cluster VIP', cluster_vip))
    gateway = str(network.get('gateway') or '').strip()
    if gateway:
        ip_values.append(('Gateway', gateway))
    for index, node in enumerate(profile.get('nodes') if isinstance(profile.get('nodes'), list) else [], start=1):
        label = node.get('name') or f'Node {index}'
        for key, name in (('hostIp', 'host'), ('cvmIp', 'CVM'), ('ipmiIp', 'IPMI')):
            value = str(node.get(key) or '').strip()
            if value:
                ip_values.append((f'{label} {name}', value))

    if subnet:
        outside = []
        for label, value in ip_values:
            try:
                if ipaddress.ip_address(value) not in subnet:
                    outside.append(f'{label} {value}')
            except ValueError:
                outside.append(f'{label} {value}')
        add(
            'subnet_membership',
            'IP addresses within subnet',
            'fail' if outside else 'pass',
            '; '.join(outside) if outside else f'All profile IPs are inside {subnet}',
        )

    seen: dict[str, list[str]] = {}
    for label, value in ip_values:
        if _valid_ip(value):
            seen.setdefault(value, []).append(label)
    duplicates = [f"{ip} ({', '.join(labels)})" for ip, labels in seen.items() if len(labels) > 1]
    add(
        'unique_ips',
        'Unique node and service IPs',
        'fail' if duplicates else 'pass',
        '; '.join(duplicates) if duplicates else 'No duplicate IP addresses found',
    )

    vlan = str(network.get('vlanId') or '').strip()
    if vlan:
        try:
            vlan_id = int(vlan)
            vlan_ok = 1 <= vlan_id <= 4094
        except ValueError:
            vlan_ok = False
        add('vlan_id', 'VLAN ID range', 'pass' if vlan_ok else 'fail', 'Valid VLAN ID' if vlan_ok else 'VLAN ID must be between 1 and 4094')
    else:
        add('vlan_id', 'VLAN ID range', 'warn', 'No VLAN ID supplied; confirm this is intentional')

    nkp = profile.get('nkp') or {}
    binary_path = str(nkp.get('binaryPath') or '').strip()
    if binary_path:
        exists = Path(binary_path).exists()
        add(
            'nkp_binary_source',
            'NKP binary/source path',
            'pass' if exists else 'warn',
            'Path exists on the Orchestrator host' if exists else 'Path was supplied but does not exist on the Orchestrator host',
        )
    else:
        add('nkp_binary_source', 'NKP binary/source path', 'warn', 'No NKP binary/source path supplied')

    proxy = profile.get('proxy') or {}
    if proxy.get('httpProxy') or proxy.get('httpsProxy'):
        no_proxy = _split_csv(proxy.get('noProxy'))
        add(
            'proxy_no_proxy',
            'Proxy no-proxy list',
            'pass' if no_proxy else 'warn',
            f'{len(no_proxy)} no-proxy entr{"y" if len(no_proxy) == 1 else "ies"} configured'
            if no_proxy else 'Proxy is configured without a no-proxy list; include Prism Central, registry, VIP, node, pod/service, and local domains as required',
        )

    image_builder = profile.get('imageBuilder') or {}
    if image_builder.get('enabled'):
        missing_image_builder = [
            label for key, label in [
                ('prismElementCluster', 'Prism Element cluster'),
                ('subnet', 'image subnet'),
                ('sourceImage', 'source/base image'),
                ('artifactBundle', 'artifact bundle'),
                ('imageName', 'target image name'),
            ]
            if not str(image_builder.get(key) or '').strip()
        ]
        add(
            'image_builder_inputs',
            'Nutanix Image Builder inputs',
            'fail' if missing_image_builder else 'pass',
            '; '.join(missing_image_builder) if missing_image_builder else 'Required Image Builder planning inputs are populated',
        )
        add(
            'image_builder_execution',
            'Image Builder execution support',
            'warn',
            'Profile captures NKP Image Builder inputs, but live image creation still requires NKP CLI validation and infrastructure UAT',
        )

    template = profile.get('template') or {}
    template_id = str(template.get('id') or '').strip()
    nodes = profile.get('nodes') if isinstance(profile.get('nodes'), list) else []
    if template_id == 'management-cluster':
        add(
            'template_management_node_count',
            'Management cluster node count',
            'pass' if len(nodes) >= 3 else 'warn',
            f'{len(nodes)} node(s) defined; three or more nodes are recommended for management clusters',
        )
    elif template_id == 'workload-cluster':
        management_ref = str(template.get('managementClusterRef') or '').strip()
        add(
            'template_workload_management_ref',
            'Management cluster reference',
            'pass' if management_ref else 'fail',
            f'Workload cluster targets management cluster {management_ref}' if management_ref else 'Workload cluster templates require a management cluster reference before execution',
        )
    elif template_id == 'airgapped-local-registry':
        registry = str(nkp.get('registry') or '').strip()
        registry_meta = profile.get('registry') or {}
        registry_endpoint = str(registry_meta.get('endpoint') or registry).strip()
        add(
            'template_airgap_registry',
            'Air-gapped registry',
            'pass' if registry_endpoint else 'fail',
            f'Private registry configured: {registry_endpoint}' if registry_endpoint else 'Air-gapped template requires a private/local registry endpoint',
        )
        add(
            'template_airgap_local_binary',
            'Air-gapped local NKP binary',
            'pass' if binary_path else 'fail',
            'NKP binary/source path is configured for local staging' if binary_path else 'Air-gapped template requires a staged NKP binary path',
        )
        ca_cert = str(registry_meta.get('caCert') or '').strip()
        add(
            'template_airgap_registry_ca',
            'Air-gapped registry CA',
            'pass' if registry_meta.get('insecure') or ca_cert else 'warn',
            'Registry TLS handling configured'
            if registry_meta.get('insecure') or ca_cert else 'No registry CA certificate supplied; confirm this is valid for the target registry',
        )

    try:
        generated_content = _nkp_profile_to_yaml(profile)
        yaml.safe_load(generated_content)
        add('generated_yaml', 'Generated YAML parse check', 'pass', 'Generated YAML is syntactically valid')
        schema_result = _nkp_schema_validate_content(generated_content)
        add(
            'nkp_example_schema',
            'NKP example schema alignment',
            'pass' if schema_result['status'] == 'pass' else 'warn' if schema_result['status'] == 'warn' else 'fail',
            'Generated YAML matches installed NKP example shape'
            if schema_result['status'] == 'pass'
            else '; '.join(schema_result.get('missing') or schema_result.get('warnings') or schema_result.get('errors') or ['Schema alignment needs review']),
        )
    except yaml.YAMLError as exc:
        add('generated_yaml', 'Generated YAML parse check', 'fail', str(exc))

    weights = {'pass': 1.0, 'warn': 0.5, 'fail': 0.0}
    score = round((sum(weights.get(item['status'], 0.0) for item in checks) / max(len(checks), 1)) * 100)
    failed = sum(1 for item in checks if item['status'] == 'fail')
    warnings = sum(1 for item in checks if item['status'] == 'warn')
    status = 'blocked' if failed else 'ready' if warnings == 0 else 'needs_attention'
    return {
        'status': status,
        'score': score,
        'summary': {'passed': sum(1 for item in checks if item['status'] == 'pass'), 'warnings': warnings, 'failed': failed},
        'checks': checks,
    }


def _normalize_nkp_profile(data: dict, existing: dict | None = None) -> dict:
    now = _now_iso()
    existing = existing or {}
    profile_id = str(data.get('id') or existing.get('id') or uuid.uuid4())
    data_template = data.get('template') if isinstance(data.get('template'), dict) else {}
    existing_template = existing.get('template') if isinstance(existing.get('template'), dict) else {}
    template_id = str(data_template.get('id') or existing_template.get('id') or '').strip()
    known_template = _nkp_template_by_id(template_id)
    profile = {
        'id': profile_id,
        'name': str(data.get('name') or existing.get('name') or '').strip(),
        'description': str(data.get('description') or existing.get('description') or '').strip(),
        'environment': str(data.get('environment') or existing.get('environment') or 'lab').strip() or 'lab',
        'template': {
            'id': template_id,
            'name': str(data_template.get('name') or existing_template.get('name') or (known_template or {}).get('name') or '').strip(),
            'category': str(data_template.get('category') or existing_template.get('category') or (known_template or {}).get('category') or '').strip(),
            'managementClusterRef': str(data_template.get('managementClusterRef') or existing_template.get('managementClusterRef') or '').strip(),
        },
        'nkp': {
            'version': str(((data.get('nkp') or {}).get('version')) or ((existing.get('nkp') or {}).get('version')) or '').strip(),
            'binaryPath': str(((data.get('nkp') or {}).get('binaryPath')) or ((existing.get('nkp') or {}).get('binaryPath')) or '').strip(),
            'registry': str(((data.get('nkp') or {}).get('registry')) or ((existing.get('nkp') or {}).get('registry')) or '').strip(),
            'sshKeyRef': str(((data.get('nkp') or {}).get('sshKeyRef')) or ((existing.get('nkp') or {}).get('sshKeyRef')) or '').strip(),
        },
        'prismCentral': {
            'endpoint': str(((data.get('prismCentral') or {}).get('endpoint')) or ((existing.get('prismCentral') or {}).get('endpoint')) or '').strip(),
            'credentialRef': str(((data.get('prismCentral') or {}).get('credentialRef')) or ((existing.get('prismCentral') or {}).get('credentialRef')) or 'pc_user').strip(),
        },
        'cluster': {
            'name': str(((data.get('cluster') or {}).get('name')) or ((existing.get('cluster') or {}).get('name')) or '').strip(),
            'type': str(((data.get('cluster') or {}).get('type')) or ((existing.get('cluster') or {}).get('type')) or 'management').strip(),
            'kubernetesVersion': str(((data.get('cluster') or {}).get('kubernetesVersion')) or ((existing.get('cluster') or {}).get('kubernetesVersion')) or '').strip(),
            'vip': str(((data.get('cluster') or {}).get('vip')) or ((existing.get('cluster') or {}).get('vip')) or '').strip(),
        },
        'network': {
            'subnet': str(((data.get('network') or {}).get('subnet')) or ((existing.get('network') or {}).get('subnet')) or '').strip(),
            'gateway': str(((data.get('network') or {}).get('gateway')) or ((existing.get('network') or {}).get('gateway')) or '').strip(),
            'dnsServers': _split_csv(((data.get('network') or {}).get('dnsServers')) or ((existing.get('network') or {}).get('dnsServers'))),
            'ntpServers': _split_csv(((data.get('network') or {}).get('ntpServers')) or ((existing.get('network') or {}).get('ntpServers'))),
            'domain': str(((data.get('network') or {}).get('domain')) or ((existing.get('network') or {}).get('domain')) or '').strip(),
            'vlanId': str(((data.get('network') or {}).get('vlanId')) or ((existing.get('network') or {}).get('vlanId')) or '').strip(),
        },
        'proxy': {
            'httpProxy': str(((data.get('proxy') or {}).get('httpProxy')) or ((existing.get('proxy') or {}).get('httpProxy')) or '').strip(),
            'httpsProxy': str(((data.get('proxy') or {}).get('httpsProxy')) or ((existing.get('proxy') or {}).get('httpsProxy')) or '').strip(),
            'noProxy': _split_csv(((data.get('proxy') or {}).get('noProxy')) or ((existing.get('proxy') or {}).get('noProxy'))),
        },
        'registry': {
            'endpoint': str(((data.get('registry') or {}).get('endpoint')) or ((existing.get('registry') or {}).get('endpoint')) or ((data.get('nkp') or {}).get('registry')) or ((existing.get('nkp') or {}).get('registry')) or '').strip(),
            'namespace': str(((data.get('registry') or {}).get('namespace')) or ((existing.get('registry') or {}).get('namespace')) or 'nkp').strip(),
            'credentialRef': str(((data.get('registry') or {}).get('credentialRef')) or ((existing.get('registry') or {}).get('credentialRef')) or '').strip(),
            'caCert': str(((data.get('registry') or {}).get('caCert')) or ((existing.get('registry') or {}).get('caCert')) or '').strip(),
            'insecure': bool(((data.get('registry') or {}).get('insecure')) or ((existing.get('registry') or {}).get('insecure')) or False),
        },
        'imageBuilder': {
            'enabled': bool(((data.get('imageBuilder') or {}).get('enabled')) or ((existing.get('imageBuilder') or {}).get('enabled')) or False),
            'prismElementCluster': str(((data.get('imageBuilder') or {}).get('prismElementCluster')) or ((existing.get('imageBuilder') or {}).get('prismElementCluster')) or '').strip(),
            'subnet': str(((data.get('imageBuilder') or {}).get('subnet')) or ((existing.get('imageBuilder') or {}).get('subnet')) or '').strip(),
            'sourceImage': str(((data.get('imageBuilder') or {}).get('sourceImage')) or ((existing.get('imageBuilder') or {}).get('sourceImage')) or '').strip(),
            'artifactBundle': str(((data.get('imageBuilder') or {}).get('artifactBundle')) or ((existing.get('imageBuilder') or {}).get('artifactBundle')) or '').strip(),
            'imageName': str(((data.get('imageBuilder') or {}).get('imageName')) or ((existing.get('imageBuilder') or {}).get('imageName')) or 'nkp-node-image').strip(),
            'bastionHost': str(((data.get('imageBuilder') or {}).get('bastionHost')) or ((existing.get('imageBuilder') or {}).get('bastionHost')) or '').strip(),
            'gpuProfile': str(((data.get('imageBuilder') or {}).get('gpuProfile')) or ((existing.get('imageBuilder') or {}).get('gpuProfile')) or '').strip(),
            'fips': bool(((data.get('imageBuilder') or {}).get('fips')) or ((existing.get('imageBuilder') or {}).get('fips')) or False),
            'insecure': bool(((data.get('imageBuilder') or {}).get('insecure')) or ((existing.get('imageBuilder') or {}).get('insecure')) or False),
        },
        'nodes': [],
        'revision': _profile_revision_value(data) if data.get('revision') is not None else _profile_revision_value(existing),
        'createdAt': existing.get('createdAt') or now,
        'updatedAt': now,
    }

    for node in data.get('nodes') if isinstance(data.get('nodes'), list) else existing.get('nodes', []):
        if not isinstance(node, dict):
            continue
        profile['nodes'].append({
            'name': str(node.get('name') or '').strip(),
            'serial': str(node.get('serial') or '').strip(),
            'hostIp': str(node.get('hostIp') or '').strip(),
            'cvmIp': str(node.get('cvmIp') or '').strip(),
            'ipmiIp': str(node.get('ipmiIp') or '').strip(),
            'rack': str(node.get('rack') or '').strip(),
        })
    return profile


def _nkp_profile_to_yaml(profile: dict) -> str:
    template_summary = _nkp_template_summary(profile.get('template') or {})
    template_id = template_summary.get('id')
    cluster = profile.get('cluster') or {}
    nkp = profile.get('nkp') or {}
    network = profile.get('network') or {}
    proxy = profile.get('proxy') or {}
    registry = profile.get('registry') or {}
    image_builder = profile.get('imageBuilder') or {}
    pc_endpoint = str((profile.get('prismCentral') or {}).get('endpoint') or '')
    if pc_endpoint and '://' not in pc_endpoint:
        pc_endpoint = f'https://{pc_endpoint}:9440'
    elif pc_endpoint and ':' not in urllib.parse.urlparse(pc_endpoint).netloc:
        parsed = urllib.parse.urlparse(pc_endpoint)
        if parsed.hostname:
            pc_endpoint = f'{parsed.scheme}://{parsed.hostname}:9440'
    binary_path = str(nkp.get('binaryPath') or '')
    env_type = 'air-gapped' if template_id == 'airgapped-local-registry' else 'connected'
    provider = 'air-gapped-ahv' if template_id == 'airgapped-local-registry' else 'nutanix-ahv'
    control_planes = 3 if template_id in {'management-cluster', 'airgapped-local-registry'} else 1
    worker_replicas = max(len(profile.get('nodes') if isinstance(profile.get('nodes'), list) else []) - control_planes, 0)
    payload = {
        'environment': {
            'name': profile.get('environment') or _slugify(profile.get('name', ''), 'nkp-environment'),
            'type': env_type,
            'provider': provider,
        },
        'nkp': {
            'version': nkp.get('version', ''),
            'bundleType': 'air-gapped' if template_id == 'airgapped-local-registry' else 'standard',
            'bundlePath': binary_path,
            'cliPath': str(Path(binary_path) / 'cli' / 'nkp') if binary_path and not binary_path.endswith('nkp') else binary_path,
            'kubectlPath': str(Path(binary_path) / 'kubectl') if binary_path and not binary_path.endswith('kubectl') else '',
        },
        'nutanix': {
            'prismCentralEndpoint': pc_endpoint,
            'clusterName': cluster.get('name', ''),
            'subnetName': network.get('vlanId') or network.get('subnet') or '',
            'imageName': image_builder.get('imageName') or 'nkp-node-image',
            'storageContainer': 'default-container',
            'project': 'default',
            'credentialRef': (profile.get('prismCentral') or {}).get('credentialRef', ''),
        },
        'cluster': {
            'name': cluster.get('name', ''),
            'kubernetesVersion': cluster.get('kubernetesVersion', ''),
            'controlPlaneEndpointIp': cluster.get('vip', ''),
            'controlPlaneEndpointPort': 6443,
            'controlPlaneReplicas': control_planes,
            'workerReplicas': worker_replicas,
            'podCidr': '192.168.0.0/16',
            'serviceCidr': '10.96.0.0/12',
            'loadBalancerIpRange': network.get('subnet', ''),
            'ntpServers': network.get('ntpServers', []),
            'sshPublicKeyFile': nkp.get('sshKeyRef', ''),
            'sshUsername': 'nutanix',
            'selfManaged': True,
            'fips': False,
        },
    }
    if proxy.get('httpProxy') or proxy.get('httpsProxy') or proxy.get('noProxy'):
        payload['environment']['proxy'] = {
            'httpProxy': proxy.get('httpProxy', ''),
            'httpsProxy': proxy.get('httpsProxy', ''),
            'noProxy': proxy.get('noProxy', []),
        }
    if template_id == 'workload-cluster':
        payload['managementCluster'] = {
            'reference': template_summary.get('managementClusterRef', ''),
        }
    if template_id == 'airgapped-local-registry':
        payload['registry'] = {
            'endpoint': registry.get('endpoint') or nkp.get('registry', ''),
            'namespace': registry.get('namespace') or 'nkp',
            'insecure': bool(registry.get('insecure') or False),
            'caCert': registry.get('caCert', ''),
            'credentialRef': registry.get('credentialRef', ''),
            'pushConcurrency': 2,
            'onExistingTag': 'skip',
        }
    if image_builder.get('enabled'):
        payload['imageBuilder'] = {
            'enabled': True,
            'prismElementCluster': image_builder.get('prismElementCluster') or cluster.get('name', ''),
            'subnet': image_builder.get('subnet') or network.get('vlanId') or network.get('subnet') or '',
            'sourceImage': image_builder.get('sourceImage', ''),
            'artifactBundle': image_builder.get('artifactBundle', ''),
            'imageName': image_builder.get('imageName') or 'nkp-node-image',
            'bastionHost': image_builder.get('bastionHost', ''),
            'gpuProfile': image_builder.get('gpuProfile', ''),
            'fips': bool(image_builder.get('fips') or False),
            'insecure': bool(image_builder.get('insecure') or False),
        }
    return yaml.safe_dump(payload, sort_keys=False)


def _postgres_backup_metadata(path: Path) -> dict:
    stat_result = path.stat()
    return {
        'filename': path.name,
        'size': stat_result.st_size,
        'createdAt': datetime.datetime.fromtimestamp(
            stat_result.st_mtime,
            datetime.timezone.utc,
        ).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z',
    }


def _list_postgres_backups() -> list[dict]:
    if not POSTGRES_BACKUP_DIR.exists():
        return []
    backups = [
        _postgres_backup_metadata(path)
        for path in POSTGRES_BACKUP_DIR.glob('ztf-orchestrator-*.dump')
        if path.is_file()
    ]
    return sorted(backups, key=lambda item: item['createdAt'], reverse=True)


def _postgres_backup_path(filename: str) -> Path | None:
    safe_name = Path(filename).name
    if safe_name != filename or not safe_name.startswith('ztf-orchestrator-') or not safe_name.endswith('.dump'):
        return None
    path = (POSTGRES_BACKUP_DIR / safe_name).resolve()
    try:
        path.relative_to(POSTGRES_BACKUP_DIR.resolve())
    except ValueError:
        return None
    return path


def _parse_iso_datetime(value: str | None) -> datetime.datetime | None:
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return None


def _extract_task_ids(text: str) -> list[str]:
    """Return Nutanix task UUIDs from framework output lines that identify tasks."""
    if not text or 'task' not in text.lower():
        return []
    seen: set[str] = set()
    task_ids: list[str] = []
    for match in TASK_ID_RE.finditer(text):
        task_id = match.group(1).lower()
        if task_id not in seen:
            seen.add(task_id)
            task_ids.append(task_id)
    return task_ids


def _pg_dump_command(database_url: str, output_path: Path) -> tuple[list[str], dict[str, str]]:
    parsed = urllib.parse.urlparse(database_url)
    if parsed.scheme not in {'postgresql', 'postgres'}:
        raise ValueError('ZTF_DATABASE_URL must use postgresql://')
    if not parsed.hostname:
        raise ValueError('ZTF_DATABASE_URL must include a host')
    db_name = parsed.path.lstrip('/')
    if not db_name:
        raise ValueError('ZTF_DATABASE_URL must include a database name')

    env = os.environ.copy()
    env['PGCONNECT_TIMEOUT'] = env.get('PGCONNECT_TIMEOUT', '10')
    if parsed.password:
        env['PGPASSWORD'] = urllib.parse.unquote(parsed.password)

    cmd = [
        'pg_dump',
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        '--file', str(output_path),
        '--host', parsed.hostname,
        '--port', str(parsed.port or 5432),
        '--username', urllib.parse.unquote(parsed.username or 'ztf'),
        db_name,
    ]
    return cmd, env


def _pg_restore_command(database_url: str, input_path: Path) -> tuple[list[str], dict[str, str]]:
    parsed = urllib.parse.urlparse(database_url)
    if parsed.scheme not in {'postgresql', 'postgres'}:
        raise ValueError('ZTF_DATABASE_URL must use postgresql://')
    if not parsed.hostname:
        raise ValueError('ZTF_DATABASE_URL must include a host')
    db_name = parsed.path.lstrip('/')
    if not db_name:
        raise ValueError('ZTF_DATABASE_URL must include a database name')

    env = os.environ.copy()
    env['PGCONNECT_TIMEOUT'] = env.get('PGCONNECT_TIMEOUT', '10')
    if parsed.password:
        env['PGPASSWORD'] = urllib.parse.unquote(parsed.password)

    cmd = [
        'pg_restore',
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--single-transaction',
        '--host', parsed.hostname,
        '--port', str(parsed.port or 5432),
        '--username', urllib.parse.unquote(parsed.username or 'ztf'),
        '--dbname', db_name,
        str(input_path),
    ]
    return cmd, env


def _create_postgres_backup(requested_by: str) -> dict:
    if _storage.name != 'postgres':
        raise RuntimeError('Database backups are only available when PostgreSQL storage is active')
    database_url = os.environ.get('ZTF_DATABASE_URL', '').strip()
    if not database_url:
        raise RuntimeError('ZTF_DATABASE_URL is not configured')

    _secure_mkdir(POSTGRES_BACKUP_DIR)
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    output_path = POSTGRES_BACKUP_DIR / f'ztf-orchestrator-{timestamp}.dump'
    cmd, env = _pg_dump_command(database_url, output_path)

    try:
        result = subprocess.run(
            cmd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=int(os.environ.get('ZTF_BACKUP_TIMEOUT', '300')),
        )
    except FileNotFoundError as exc:
        raise RuntimeError('pg_dump is not installed or not on PATH') from exc
    except subprocess.TimeoutExpired as exc:
        output_path.unlink(missing_ok=True)
        raise RuntimeError('PostgreSQL backup timed out') from exc

    if result.returncode != 0:
        output_path.unlink(missing_ok=True)
        err = (result.stderr or result.stdout or 'pg_dump failed').strip()
        raise RuntimeError(err[:500])

    try:
        os.chmod(output_path, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass

    metadata = _postgres_backup_metadata(output_path)
    log.info('postgres_backup_created', extra={
        'action': 'postgres_backup_created',
        'user': requested_by,
        'backupFile': metadata['filename'],
        'size': metadata['size'],
    })
    return metadata

# ─── Structured logging ───────────────────────────────────────────────────────

def _restore_postgres_backup(filename: str, requested_by: str) -> dict:
    if _storage.name != 'postgres':
        raise RuntimeError('Database restore is only available when PostgreSQL storage is active')
    database_url = os.environ.get('ZTF_DATABASE_URL', '').strip()
    if not database_url:
        raise RuntimeError('ZTF_DATABASE_URL is not configured')

    backup_path = _postgres_backup_path(filename)
    if not backup_path or not backup_path.exists() or not backup_path.is_file():
        raise FileNotFoundError('Backup not found')

    safety_backup = _create_postgres_backup(requested_by)
    cmd, env = _pg_restore_command(database_url, backup_path)

    try:
        result = subprocess.run(
            cmd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=int(os.environ.get('ZTF_RESTORE_TIMEOUT', os.environ.get('ZTF_BACKUP_TIMEOUT', '300'))),
        )
    except FileNotFoundError as exc:
        raise RuntimeError('pg_restore is not installed or not on PATH') from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError('PostgreSQL restore timed out') from exc

    if result.returncode != 0:
        err = (result.stderr or result.stdout or 'pg_restore failed').strip()
        raise RuntimeError(err[:500])

    restored = _postgres_backup_metadata(backup_path)
    log.warning('postgres_backup_restored', extra={
        'action': 'postgres_backup_restored',
        'user': requested_by,
        'backupFile': restored['filename'],
        'safetyBackupFile': safety_backup['filename'],
        'status': 'success',
    })
    return {'restored': restored, 'safetyBackup': safety_backup}


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


def _is_allowed_approval_workflow(workflow: str) -> bool:
    if workflow in ALLOWED_WORKFLOWS:
        return True
    if workflow.startswith('nkp:'):
        return workflow.split(':', 1)[1] in NKP_SAFE_PHASES
    return False

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

ALLOWED_NKP_REPOS = {
    'https://github.com/VirtuArchitect/nkp-zerotouch-framework.git',
    'https://github.com/VirtuArchitect/nkp-zerotouch-framework',
}

NKP_SAFE_PHASES = {
    'validate', 'prepare', 'generate', 'registry', 'deploy',
    'verify', 'kubeconfig', 'secrets', 'backup', 'runs', 'ci',
}

NKP_APPROVAL_REQUIRED_PHASES = {
    'prepare', 'generate', 'registry', 'deploy',
}

TASK_ID_RE = re.compile(
    r'\b(?:task(?:_id| id)?|task_uuid|task uuid|nutanix task)\s*[:=]?\s*'
    r'([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\b'
)


def _nkp_approval_error(
    approval: dict | None,
    phase: str,
    config_file: str,
    config_content: str,
) -> str | None:
    if not approval:
        return 'Approved NKP execution request was not found'
    if approval.get('status') != 'approved':
        return 'NKP execution request is not approved'
    if approval.get('workflow') != f'nkp:{phase}':
        return 'NKP execution approval does not match the requested phase'
    expires = _parse_iso_datetime(approval.get('expiresAt'))
    if expires and expires < datetime.datetime.now(datetime.timezone.utc):
        return 'NKP execution approval has expired'
    approved_config_file = str(approval.get('configFile') or '').strip()
    if approved_config_file and config_file and approved_config_file != config_file:
        return 'NKP execution approval does not match the requested config file'
    approved_content = approval.get('configContent') or ''
    if approved_content and config_content and approved_content != config_content:
        return 'NKP execution approval does not match the requested YAML content'
    return None

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
    'ztfPath', 'nkpPath', 'pythonPath', 'configDir', 'repoUrl', 'nkpRepoUrl', 'webhookUrl',
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

        incompatible = _ztf_incompatible_error(ztf_path)
        if incompatible:
            rc = -1
            status = 'failed'
            entry = {
                'id':         str(int(_t.time() * 1000)),
                'workflow':   workflow or script,
                'type':       'schedule',
                'command':    '',
                'status':     status,
                'returnCode': rc,
                'timestamp':  datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'user':       'scheduler',
                'configFile': config_file,
                'output':     incompatible[0]['error'],
            }
            hist = read_json(HISTORY_FILE, [])
            hist.insert(0, entry)
            write_json(HISTORY_FILE, hist[:1000])
            _fire_configured_webhook(workflow or script, status, rc, 'scheduler', entry['id'])
            return status

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
                cmd = [python_path, _ztf_main_arg(ztf_path)]
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

        cmd = [python_path, _ztf_main_arg(ztf_path)]
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
_MAINTENANCE_LOCK = threading.RLock()
_MAINTENANCE = {
    'active': False,
    'reason': '',
    'startedAt': '',
    'startedBy': '',
}


def _maintenance_state() -> dict:
    with _MAINTENANCE_LOCK:
        return dict(_MAINTENANCE)


def _maintenance_active() -> bool:
    return bool(_maintenance_state().get('active'))


def _enter_maintenance(reason: str, user: str) -> bool:
    with _MAINTENANCE_LOCK:
        if _MAINTENANCE['active']:
            return False
        _MAINTENANCE.update({
            'active': True,
            'reason': reason,
            'startedAt': _now_iso(),
            'startedBy': user,
        })
        return True


def _exit_maintenance() -> None:
    with _MAINTENANCE_LOCK:
        _MAINTENANCE.update({
            'active': False,
            'reason': '',
            'startedAt': '',
            'startedBy': '',
        })


def _maintenance_error() -> tuple[dict, int]:
    state = _maintenance_state()
    reason = state.get('reason') or 'maintenance'
    return {
        'error': f'Execution queue is locked for {reason}',
        'maintenance': state,
    }, 503

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
    max_body = NKP_BINARY_MAX_UPLOAD if request.path == '/api/nkp/binaries/upload' else MAX_BODY
    if request.content_length and request.content_length > max_body:
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
        'nkpPath':    NKP_DEFAULT,
        'pythonPath': PYTHON_DEFAULT,
        'configDir':  str(CONFIG_DIR / 'configs'),
        'repoUrl':    'https://github.com/nutanixdev/zerotouch-framework.git',
        'nkpRepoUrl': 'https://github.com/VirtuArchitect/nkp-zerotouch-framework.git',
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


def _is_private_or_internal_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return True
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _webhook_host_allowed(hostname: str) -> bool:
    host = hostname.lower().rstrip('.')
    for allowed in WEBHOOK_ALLOWED_HOSTS:
        allowed = allowed.rstrip('.')
        if host == allowed or host.endswith(f'.{allowed}'):
            return True
    return False


def _validate_webhook_url(url: str) -> tuple[bool, str]:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {'https'} and not (WEBHOOK_ALLOW_INSECURE and parsed.scheme == 'http'):
        return False, 'webhook URL must use https'
    if not parsed.hostname:
        return False, 'webhook URL must include a hostname'
    if parsed.username or parsed.password:
        return False, 'webhook URL must not contain embedded credentials'

    host = parsed.hostname.strip().lower()
    if _webhook_host_allowed(host):
        return True, ''

    try:
        ipaddress.ip_address(host)
        addresses = [host]
    except ValueError:
        try:
            infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == 'https' else 80), type=socket.SOCK_STREAM)
            addresses = sorted({info[4][0] for info in infos})
        except OSError:
            return False, 'webhook hostname could not be resolved'

    if not addresses:
        return False, 'webhook hostname did not resolve to an address'
    blocked = [addr for addr in addresses if _is_private_or_internal_ip(addr)]
    if blocked:
        return False, 'webhook URL resolves to a private or internal address'
    return True, ''


def _fire_webhook(url: str, payload: dict) -> None:
    """Best-effort webhook POST — runs in a daemon thread, never raises."""
    import urllib.request as _req
    try:
        ok, reason = _validate_webhook_url(url)
        if not ok:
            log.warning('webhook_rejected', extra={'url': url, 'error': reason})
            return
        body = json.dumps(payload).encode()
        req  = _req.Request(
            url, data=body,
            headers={'Content-Type': 'application/json', 'User-Agent': f'ZTF-Orchestrator/{APP_VERSION}'},
            method='POST',
        )
        # URL is scheme, host, credential, DNS, and private-range validated above.
        with _req.urlopen(req, timeout=8):  # nosec B310
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


class ExecutionJobManager:
    """Durable workflow/script queue backed by the configured storage backend."""

    TERMINAL = {'success', 'failed', 'cancelled', 'interrupted'}
    TERMINAL_PROGRESS = {
        'success': ('Completed', 100, 'Execution finished successfully'),
        'failed': ('Failed', 100, 'Execution ended with an error; review the persisted log'),
        'cancelled': ('Cancelled', 100, 'Execution was cancelled by an operator'),
        'interrupted': ('Interrupted', 100, 'Execution was interrupted before completion'),
    }
    OUTPUT_MILESTONES = [
        (('preflight', 'pre-flight', 'checking', 'validat', 'prerequisite'), 20, 'Running pre-flight checks'),
        (('config', 'yaml', 'credential', 'settings'), 35, 'Preparing workflow configuration'),
        (('connect', 'api', 'prism', 'foundation', 'nutanix'), 45, 'Connecting to Nutanix services'),
        (('deploy', 'create', 'configure', 'cluster', 'workflow', 'task'), 65, 'Executing workflow steps'),
        (('verify', 'poll', 'status', 'wait'), 75, 'Waiting for platform response'),
        (('complete', 'success', 'finished', 'done'), 90, 'Collecting final output'),
    ]

    def __init__(self, workers: int):
        self.workers = workers
        self._lock = threading.RLock()
        self._condition = threading.Condition(self._lock)
        self._active: dict[str, subprocess.Popen] = {}
        self._stop = False
        self._started = False
        self._recover_interrupted_jobs()

    def start(self) -> None:
        if self._started:
            return
        self._started = True
        for idx in range(self.workers):
            threading.Thread(target=self._worker_loop, name=f'ztf-job-worker-{idx + 1}', daemon=True).start()

    def stop(self) -> None:
        with self._condition:
            self._stop = True
            for proc in list(self._active.values()):
                if proc.poll() is None:
                    proc.kill()
            self._condition.notify_all()

    def submit(self, payload: dict, user: str) -> dict:
        if _maintenance_active():
            raise RuntimeError('Execution queue is locked for maintenance')
        now = self._now()
        job_type = payload.get('type') or ('workflow' if payload.get('workflow') else 'script')
        workflow_name = payload.get('workflow') or payload.get('script') or payload.get('nkpPhase') or ''
        job = {
            'id': str(int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)),
            'status': 'queued',
            'workflow': workflow_name,
            'type': job_type,
            'framework': payload.get('framework') or 'ztf',
            'user': user,
            'createdAt': now,
            'updatedAt': now,
            'startedAt': '',
            'finishedAt': '',
            'returnCode': None,
            'payload': payload,
            'logs': [],
            'progress': self._progress('Queued', 0, 'Waiting for an execution worker'),
        }
        if isinstance(payload.get('trace'), dict):
            job['trace'] = payload['trace']
        with self._condition:
            jobs = self._load_jobs()
            jobs.insert(0, job)
            self._save_jobs(jobs)
            self._condition.notify()
        log.info('job_queued', extra={'user': user, 'workflow': job['workflow'], 'jobId': job['id']})
        return self._public_job(job)

    def list_jobs(self, limit: int = 200) -> list[dict]:
        return [self._public_job(job) for job in self._load_jobs()[:limit]]

    def get_job(self, job_id: str, include_logs: bool = True) -> dict | None:
        for job in self._load_jobs():
            if job.get('id') == job_id:
                return self._public_job(job, include_logs)
        return None

    def cancel(self, job_id: str, user: str) -> dict | None:
        proc = None
        with self._condition:
            jobs = self._load_jobs()
            job = self._find_job(jobs, job_id)
            if not job:
                return None
            if job.get('status') in self.TERMINAL:
                return self._public_job(job)
            proc = self._active.get(job_id)
            self._append_event(job, 'stderr', f'Cancellation requested by {user}')
            if job.get('status') == 'queued':
                self._finish_job(job, 'cancelled', -1)
            else:
                job['status'] = 'cancelling'
                job['updatedAt'] = self._now()
                self._set_progress(job, 'Cancelling', max(90, self._progress_percent(job)), 'Cancellation requested by operator')
            self._save_jobs(jobs)
            self._condition.notify_all()
        if proc and proc.poll() is None:
            proc.kill()
        log.info('job_cancel_requested', extra={'user': user, 'jobId': job_id})
        return self.get_job(job_id)

    def delete(self, job_id: str, user: str) -> tuple[dict | None, str | None]:
        with self._condition:
            jobs = self._load_jobs()
            job = self._find_job(jobs, job_id)
            if not job:
                return None, 'not_found'
            if job.get('status') not in self.TERMINAL:
                return self._public_job(job), 'active'
            updated = [item for item in jobs if item.get('id') != job_id]
            self._save_jobs(updated)
            self._condition.notify_all()
        log.info('job_deleted', extra={'user': user, 'jobId': job_id, 'workflow': job.get('workflow')})
        return self._public_job(job), None

    def active_count(self) -> int:
        with self._condition:
            return sum(1 for job in self._load_jobs() if job.get('status') in {'running', 'cancelling'})

    def stream_events(self, job_id: str, start_offset: int = 0) -> Generator[str, None, None]:
        offset = max(0, start_offset)
        last_job_update = ''
        while True:
            with self._condition:
                job = self.get_job(job_id, include_logs=True)
                if not job:
                    yield self._sse('error', 'Job not found', job_id)
                    return
                logs = job.get('logs', [])
                updated_at = job.get('updatedAt', '')
                if updated_at != last_job_update:
                    yield self._sse('job', self._public_job(job, include_logs=False), job_id)
                    last_job_update = updated_at
                for event in logs[offset:]:
                    yield self._sse(event.get('type', 'stdout'), event.get('data', ''), job_id)
                offset = len(logs)
                if job.get('status') in self.TERMINAL:
                    yield self._sse('done', {
                        'code': job.get('returnCode', -1),
                        'status': job.get('status'),
                        'jobId': job_id,
                    }, job_id)
                    return
                self._condition.wait(timeout=1.0)

    def _worker_loop(self) -> None:
        while True:
            with self._condition:
                job = self._next_queued_job()
                while not job or _maintenance_active():
                    if self._stop:
                        return
                    self._condition.wait(timeout=1.0)
                    job = None if _maintenance_active() else self._next_queued_job()
                if self._stop:
                    return
                self._mark_running(job)
                job_id = job['id']
                payload = dict(job.get('payload') or {})
            self._run_job(job_id, payload, job.get('user', 'unknown'))

    def _run_job(self, job_id: str, payload: dict, user: str) -> None:
        if payload.get('framework') == 'nkp':
            self._run_nkp_job(job_id, payload, user)
            return

        proc = None
        kill_timer = None
        workflow = payload.get('workflow')
        script = payload.get('script')
        config_content = payload.get('configContent') or ''
        config_file = payload.get('configFile') or ''
        debug = bool(payload.get('debug', False))
        effective_config_content = config_content
        status = 'failed'
        return_code = -1
        try:
            settings = get_settings()
            ztf_path = settings['ztfPath']
            python_path = settings['pythonPath']
            incompatible = _ztf_incompatible_error(ztf_path)
            if incompatible:
                self._emit(job_id, 'error', incompatible[0]['error'])
                return
            configs_dir = get_configs_dir()
            cfg_path = None

            if effective_config_content and config_file:
                self._update_progress(job_id, 'Preparing configuration', 15, 'Validating and saving workflow YAML')
                path = safe_config_path(config_file, configs_dir)
                if path is None:
                    self._emit(job_id, 'error', 'Invalid config filename')
                    return
                if path.suffix in ('.yml', '.yaml'):
                    ok, err = validate_yaml(effective_config_content)
                    if not ok:
                        self._emit(job_id, 'error', f'Invalid YAML: {err}')
                        return
                    normalized_content, normalized_pc_ip = _normalize_ztf_config_content(workflow or '', effective_config_content)
                    if normalized_pc_ip:
                        effective_config_content = normalized_content
                        self._emit(job_id, 'stdout', 'Legacy fc_ip detected; saved as pc_ip for Nutanix ZTF compatibility')
                backup_config(path)
                _secure_write(path, effective_config_content)
                cfg_path = str(path)

            cmd_args = [python_path, _ztf_main_arg(ztf_path)]
            if workflow: cmd_args += ['--workflow', workflow]
            if script:   cmd_args += ['--script', script]
            if cfg_path: cmd_args += ['-f', cfg_path]
            if debug:    cmd_args.append('--debug')

            display = ' '.join(cmd_args[:4]) + (' ...' if len(cmd_args) > 4 else '')
            self._update_progress(job_id, 'Starting ZTF process', 30, 'Launching ZeroTouch Framework CLI')
            self._emit(job_id, 'start', {'command': display, 'workingDir': ztf_path})
            log.info('execution_start', extra={
                'user': user, 'workflow': workflow or script,
                'action': 'execute', 'status': 'started', 'jobId': job_id,
            })

            proc = subprocess.Popen(
                cmd_args, cwd=ztf_path,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            )
            with self._condition:
                self._active[job_id] = proc
            self._update_progress(job_id, 'Executing workflow', 50, 'Streaming ZeroTouch Framework output')

            def _timeout_kill():
                if proc.poll() is None:
                    proc.kill()
                    self._emit(job_id, 'stderr', f'Execution timed out after {EXEC_TIMEOUT} seconds')
                    log.warning('execution_timeout', extra={'user': user, 'workflow': workflow or script, 'jobId': job_id})

            kill_timer = threading.Timer(EXEC_TIMEOUT, _timeout_kill)
            kill_timer.start()

            combined: queue.Queue = queue.Queue()

            def _reader(stream, label):
                for line in stream:
                    combined.put((label, line.rstrip()))
                combined.put(None)

            threading.Thread(target=_reader, args=(proc.stdout, 'stdout'), daemon=True).start()
            threading.Thread(target=_reader, args=(proc.stderr, 'stderr'), daemon=True).start()

            done = 0
            while done < 2:
                item = combined.get()
                if item is None:
                    done += 1
                else:
                    label, line = item
                    self._emit(job_id, label, line)

            proc.wait()
            return_code = proc.returncode
            current = self.get_job(job_id, include_logs=False) or {}
            status = 'cancelled' if current.get('status') == 'cancelling' else ('success' if return_code == 0 else 'failed')

        except Exception:
            log.exception('execution_error', extra={'user': user, 'workflow': workflow or script, 'jobId': job_id})
            self._emit(job_id, 'error', 'Execution failed. Check server logs for details.')
            status = 'failed'
            return_code = -1
        finally:
            if kill_timer:
                kill_timer.cancel()
            with self._condition:
                self._active.pop(job_id, None)
            entry = _record_execution_history(
                execution_id=job_id,
                workflow_or_script=workflow or script,
                execution_type='workflow' if workflow else 'script',
                status=status,
                user=user,
                config_file=config_file,
                config_content=effective_config_content,
            )
            self._complete(job_id, status, return_code)
            log.info('execution_complete', extra={
                'user': user, 'workflow': workflow or script,
                'action': 'execute', 'status': status, 'jobId': job_id,
            })
            _fire_configured_webhook(
                workflow=workflow or script,
                status=status,
                return_code=return_code,
                user=user,
                execution_id=job_id,
                execution_type='workflow' if workflow else 'script',
            )

    def _run_nkp_job(self, job_id: str, payload: dict, user: str) -> None:
        proc = None
        kill_timer = None
        phase = str(payload.get('nkpPhase') or '').strip()
        config_file = str(payload.get('configFile') or '').strip()
        config_content = payload.get('configContent') or ''
        strict = bool(payload.get('strict', False))
        status = 'failed'
        return_code = -1
        cfg_path = None

        try:
            if phase not in NKP_SAFE_PHASES:
                self._emit(job_id, 'error', 'NKP phase is not allowed by this integration')
                return
            if payload.get('apply') or payload.get('confirmDestroy'):
                self._emit(job_id, 'error', 'NKP apply and destructive operations are not enabled in this release')
                return

            settings = get_settings()
            nkp_path = settings.get('nkpPath') or NKP_DEFAULT
            python_path = settings.get('pythonPath') or PYTHON_DEFAULT
            configs_dir = get_configs_dir()

            if not _nkp_installed(nkp_path):
                self._emit(job_id, 'error', 'NKP ZeroTouch Framework is not installed or the script path is invalid')
                return

            self._update_progress(job_id, 'Preparing NKP phase', 15, 'Validating NKP phase and configuration')
            if config_content:
                if not config_file:
                    config_file = f'nkp-{phase}.yaml'
                path = safe_config_path(config_file, configs_dir)
                if path is None or path.suffix not in ('.yml', '.yaml'):
                    self._emit(job_id, 'error', 'Invalid NKP config filename')
                    return
                ok, err = validate_yaml(config_content)
                if not ok:
                    self._emit(job_id, 'error', f'Invalid YAML: {err}')
                    return
                backup_config(path)
                _secure_write(path, config_content)
                cfg_path = str(path)
            elif config_file:
                path = safe_config_path(config_file, configs_dir)
                if path is None or not path.exists():
                    example_path = safe_config_path(config_file, Path(nkp_path) / 'configs' / 'environments')
                    path = example_path if example_path and example_path.exists() else path
                if path is None or not path.exists() or path.suffix not in ('.yml', '.yaml'):
                    self._emit(job_id, 'error', 'NKP config file was not found')
                    return
                cfg_path = str(path)
            else:
                self._emit(job_id, 'error', 'NKP config file or YAML content is required')
                return

            cmd_args = _nkp_command(nkp_path, phase, cfg_path, strict)
            display = ' '.join(str(arg) for arg in cmd_args[:6]) + (' ...' if len(cmd_args) > 6 else '')
            self._update_progress(job_id, f'Running NKP {phase}', 30, 'Launching NKP ZeroTouch Framework')
            self._emit(job_id, 'start', {'command': display, 'workingDir': nkp_path})
            log.info('nkp_execution_start', extra={
                'user': user, 'workflow': f'nkp:{phase}',
                'action': 'execute', 'status': 'started', 'jobId': job_id,
            })

            env = os.environ.copy()
            env['PYTHON_BIN'] = python_path
            proc = subprocess.Popen(
                cmd_args, cwd=nkp_path, env=env,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            )
            with self._condition:
                self._active[job_id] = proc
            self._update_progress(job_id, f'NKP {phase} in progress', 50, 'Streaming NKP framework output')

            def _timeout_kill():
                if proc.poll() is None:
                    proc.kill()
                    self._emit(job_id, 'stderr', f'Execution timed out after {EXEC_TIMEOUT} seconds')
                    log.warning('nkp_execution_timeout', extra={'user': user, 'workflow': f'nkp:{phase}', 'jobId': job_id})

            kill_timer = threading.Timer(EXEC_TIMEOUT, _timeout_kill)
            kill_timer.start()

            combined: queue.Queue = queue.Queue()

            def _reader(stream, label):
                for line in stream:
                    combined.put((label, line.rstrip()))
                combined.put(None)

            threading.Thread(target=_reader, args=(proc.stdout, 'stdout'), daemon=True).start()
            threading.Thread(target=_reader, args=(proc.stderr, 'stderr'), daemon=True).start()

            done = 0
            while done < 2:
                item = combined.get()
                if item is None:
                    done += 1
                else:
                    label, line = item
                    self._emit(job_id, label, line)

            proc.wait()
            return_code = proc.returncode
            current = self.get_job(job_id, include_logs=False) or {}
            status = 'cancelled' if current.get('status') == 'cancelling' else ('success' if return_code == 0 else 'failed')
        except Exception:
            log.exception('nkp_execution_error', extra={'user': user, 'workflow': f'nkp:{phase}', 'jobId': job_id})
            self._emit(job_id, 'error', 'NKP execution failed. Check server logs for details.')
            status = 'failed'
            return_code = -1
        finally:
            if kill_timer:
                kill_timer.cancel()
            with self._condition:
                self._active.pop(job_id, None)
            _record_execution_history(
                execution_id=job_id,
                workflow_or_script=f'nkp:{phase or "unknown"}',
                execution_type='nkp',
                status=status,
                user=user,
                config_file=config_file,
                config_content=config_content,
            )
            self._complete(job_id, status, return_code)
            log.info('nkp_execution_complete', extra={
                'user': user, 'workflow': f'nkp:{phase}',
                'action': 'execute', 'status': status, 'jobId': job_id,
            })
            _fire_configured_webhook(
                workflow=f'nkp:{phase or "unknown"}',
                status=status,
                return_code=return_code,
                user=user,
                execution_id=job_id,
                execution_type='nkp',
            )

    def _recover_interrupted_jobs(self) -> None:
        with self._condition:
            jobs = self._load_jobs()
            changed = False
            for job in jobs:
                if job.get('status') in {'queued', 'running', 'cancelling'}:
                    self._append_event(job, 'stderr', 'Execution interrupted during service restart')
                    self._finish_job(job, 'interrupted', -1)
                    changed = True
            if changed:
                self._save_jobs(jobs)

    def _emit(self, job_id: str, event_type: str, data) -> None:
        with self._condition:
            jobs = self._load_jobs()
            job = self._find_job(jobs, job_id)
            if not job:
                return
            self._append_event(job, event_type, data)
            self._advance_progress_from_event(job, event_type, data)
            self._save_jobs(jobs)
            self._condition.notify_all()

    def _complete(self, job_id: str, status: str, return_code: int) -> None:
        with self._condition:
            jobs = self._load_jobs()
            job = self._find_job(jobs, job_id)
            if job:
                self._finish_job(job, status, return_code)
                self._save_jobs(jobs)
            self._condition.notify_all()

    def _mark_running(self, job: dict) -> None:
        jobs = self._load_jobs()
        current = self._find_job(jobs, job['id'])
        if current:
            now = self._now()
            current['status'] = 'running'
            current['startedAt'] = now
            current['updatedAt'] = now
            self._set_progress(current, 'Starting execution', 10, 'Worker accepted the job')
            self._save_jobs(jobs)
            job.update(current)

    def _next_queued_job(self) -> dict | None:
        jobs = self._load_jobs()
        queued = [job for job in jobs if job.get('status') == 'queued']
        if not queued:
            return None
        return sorted(queued, key=lambda item: item.get('createdAt', ''))[0]

    def _append_event(self, job: dict, event_type: str, data) -> None:
        logs = job.setdefault('logs', [])
        logs.append({'type': event_type, 'data': data, 'ts': self._now()})
        job['updatedAt'] = self._now()

    def _finish_job(self, job: dict, status: str, return_code: int) -> None:
        now = self._now()
        job['status'] = status
        job['returnCode'] = return_code
        job['finishedAt'] = now
        job['updatedAt'] = now
        phase, percent, detail = self.TERMINAL_PROGRESS.get(status, ('Finished', 100, 'Execution finished'))
        self._set_progress(job, phase, percent, detail)

    def _update_progress(self, job_id: str, phase: str, percent: int, detail: str) -> None:
        with self._condition:
            jobs = self._load_jobs()
            job = self._find_job(jobs, job_id)
            if not job:
                return
            if self._set_progress(job, phase, percent, detail):
                self._save_jobs(jobs)
                self._condition.notify_all()

    def _advance_progress_from_event(self, job: dict, event_type: str, data) -> None:
        if event_type == 'start':
            self._set_progress(job, 'Starting ZTF process', 30, 'ZeroTouch Framework CLI launched')
            return
        if event_type not in {'stdout', 'stderr'} or not isinstance(data, str):
            return
        self._record_task_ids_from_output(job, data)
        text = data.lower()
        for tokens, percent, detail in self.OUTPUT_MILESTONES:
            if any(token in text for token in tokens):
                self._set_progress(job, detail, percent, data[:160])
                break

    def _record_task_ids_from_output(self, job: dict, data: str) -> None:
        task_ids = _extract_task_ids(data)
        if not task_ids:
            return
        existing = job.setdefault('taskIds', [])
        if not isinstance(existing, list):
            existing = []
            job['taskIds'] = existing
        changed = False
        for task_id in task_ids:
            if task_id not in existing:
                existing.append(task_id)
                changed = True
        if changed:
            job['updatedAt'] = self._now()

    def _set_progress(self, job: dict, phase: str, percent: int, detail: str) -> bool:
        percent = max(0, min(100, int(percent)))
        current = job.get('progress') if isinstance(job.get('progress'), dict) else {}
        current_percent = self._progress_percent(job)
        if percent < current_percent and job.get('status') not in self.TERMINAL:
            return False
        progress = self._progress(phase, percent, detail)
        if (
            current.get('phase') == progress['phase']
            and current.get('percent') == progress['percent']
            and current.get('detail') == progress['detail']
            and current.get('estimated') == progress['estimated']
        ):
            return False
        job['progress'] = progress
        job['updatedAt'] = progress['updatedAt']
        return True

    def _progress_percent(self, job: dict) -> int:
        progress = job.get('progress') if isinstance(job.get('progress'), dict) else {}
        try:
            return int(progress.get('percent', 0))
        except (TypeError, ValueError):
            return 0

    def _progress(self, phase: str, percent: int, detail: str) -> dict:
        return {
            'phase': phase,
            'percent': max(0, min(100, int(percent))),
            'detail': detail,
            'estimated': True,
            'updatedAt': self._now(),
        }

    def _load_jobs(self) -> list[dict]:
        jobs = read_json(JOBS_FILE, [])
        return jobs if isinstance(jobs, list) else []

    def _save_jobs(self, jobs: list[dict]) -> None:
        write_json(JOBS_FILE, jobs[:1000])

    @staticmethod
    def _find_job(jobs: list[dict], job_id: str) -> dict | None:
        return next((job for job in jobs if job.get('id') == job_id), None)

    @staticmethod
    def _now() -> str:
        return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z'

    @staticmethod
    def _sse(event_type: str, data, job_id: str) -> str:
        return f"data: {json.dumps({'type': event_type, 'data': data, 'executionId': job_id, 'jobId': job_id})}\n\n"

    @staticmethod
    def _public_job(job: dict, include_logs: bool = False) -> dict:
        public = {k: v for k, v in job.items() if k != 'payload'}
        if not include_logs:
            public.pop('logs', None)
        return public


_job_manager = ExecutionJobManager(EXEC_WORKERS)
_job_manager.start()


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

def _bounded_int_arg(name: str, default: int, minimum: int, maximum: int):
    raw = request.args.get(name, default)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None, (jsonify({'error': f'{name} must be an integer'}), 400)
    if value < minimum or value > maximum:
        return None, (jsonify({'error': f'{name} must be between {minimum} and {maximum}'}), 400)
    return value, None

@app.route('/health')
def health():
    settings = get_settings()
    ztf_info = _ztf_detect(settings['ztfPath'])
    ztf_ok = bool(ztf_info.get('compatible'))
    status  = 'healthy' if ztf_ok else 'degraded'
    return jsonify({
        'status':  status,
        'version': APP_VERSION,
        'ztf': ztf_info,
    }), 200 if ztf_ok else 503


@app.route('/api/visibility/summary')
@require_role('admin', 'operator', 'viewer')
def operational_visibility_summary():
    _init_engines()
    settings = get_settings()
    now = datetime.datetime.now(datetime.timezone.utc)
    jobs = _job_manager.list_jobs(1000)
    drift_runs = _load_drift_runs()
    schedules = _schedule_engine.list_schedules()
    approvals = _approval_manager.list_approvals()
    backups = _list_postgres_backups()
    profiles = _list_nkp_profiles()
    binaries = _list_nkp_binaries()
    evidence = _list_validation_evidence()
    latest_evidence = evidence[0] if evidence else None
    available_binaries = [item for item in binaries if item.get('exists')]
    default_binary = next((item for item in binaries if item.get('default')), None)
    configs_dir = get_configs_dir()
    generated_nkp_configs = [
        path.name for path in configs_dir.glob('nkp*.y*ml')
        if path.is_file() and path.suffix.lower() in ('.yaml', '.yml')
    ]

    long_running = 0
    for job in jobs:
        if job.get('status') not in {'queued', 'running', 'cancelling'}:
            continue
        started = _parse_iso_datetime(job.get('startedAt') or job.get('createdAt'))
        if started and now - started > datetime.timedelta(minutes=30):
            long_running += 1

    enabled_schedules = [item for item in schedules if item.get('enabled')]
    schedule_dates = [
        parsed for parsed in (_parse_iso_datetime(item.get('nextRun')) for item in enabled_schedules)
        if parsed is not None
    ]
    next_run = min(schedule_dates).strftime('%Y-%m-%dT%H:%M:%S.%f') + 'Z' if schedule_dates else None
    failed_schedules = [
        item for item in schedules
        if item.get('lastStatus') in {'failed', 'error'}
    ]
    failed_schedules.sort(key=lambda item: item.get('lastRun') or '', reverse=True)

    latest_backup = backups[0] if backups else None
    backup_warning = 'PostgreSQL not active'
    if _storage.name == 'postgres':
        if not latest_backup:
            backup_warning = 'No backup'
        else:
            backup_time = _parse_iso_datetime(latest_backup.get('createdAt'))
            if backup_time and now - backup_time > datetime.timedelta(days=7):
                backup_warning = f'{(now - backup_time).days} days old'
            else:
                backup_warning = 'OK'

    ztf_installed = _ztf_installed(settings['ztfPath'])
    nkp_installed = _nkp_installed(settings.get('nkpPath') or NKP_DEFAULT)
    return jsonify({
        'generatedAt': _now_iso(),
        'operations': {
            'queued': sum(1 for job in jobs if job.get('status') == 'queued'),
            'running': sum(1 for job in jobs if job.get('status') in {'running', 'cancelling'}),
            'failed': sum(1 for job in jobs if job.get('status') in {'failed', 'interrupted'}),
            'longRunning': long_running,
            'totalJobs': len(jobs),
        },
        'governance': {
            'pendingApprovals': sum(1 for item in approvals if item.get('status') == 'pending'),
            'driftedChecks': sum(1 for item in drift_runs if item.get('status') == 'drifted'),
            'unknownBaselines': sum(1 for item in drift_runs if item.get('status') == 'unknown'),
            'latestDriftStatus': drift_runs[0].get('status') if drift_runs else 'not_checked',
        },
        'schedules': {
            'enabled': len(enabled_schedules),
            'total': len(schedules),
            'nextRun': next_run,
            'lastFailed': failed_schedules[0].get('name') if failed_schedules else None,
        },
        'storage': {
            'backend': _storage.name,
            'databaseConfigured': bool(os.environ.get('ZTF_DATABASE_URL', '')),
            'databaseLocation': _database_location(os.environ.get('ZTF_DATABASE_URL', '')),
            'lastBackup': latest_backup,
            'backupWarning': backup_warning,
        },
        'deployment': {
            'ztfInstalled': ztf_installed,
            'nkpInstalled': nkp_installed,
            'nkpProfiles': len(profiles),
            'generatedNkpConfigs': len(generated_nkp_configs),
            'nkpBinaries': len(binaries),
            'availableNkpBinaries': len(available_binaries),
            'defaultNkpBinary': (default_binary or {}).get('name'),
        },
        'evidence': {
            'total': len(evidence),
            'latestStatus': latest_evidence.get('status') if latest_evidence else 'missing',
            'latestAt': latest_evidence.get('createdAt') if latest_evidence else None,
            'latestProfile': latest_evidence.get('profileName') if latest_evidence else None,
            'ready': sum(1 for item in evidence if item.get('status') == 'ready'),
            'blocked': sum(1 for item in evidence if item.get('status') == 'blocked'),
            'needsReview': sum(1 for item in evidence if item.get('status') == 'needs_review'),
        },
    })

@app.route('/api/health/details')
@require_role('admin')
def health_details():
    settings = get_settings()
    ztf_info = _ztf_detect(settings['ztfPath'])
    ztf_ok = bool(ztf_info.get('compatible'))
    nkp_ok = _nkp_installed(settings.get('nkpPath') or NKP_DEFAULT)
    status  = 'healthy' if ztf_ok else 'degraded'
    jobs = _job_manager.list_jobs(1000)
    binaries = _list_nkp_binaries()
    available_binaries = [item for item in binaries if item.get('exists')]
    return jsonify({
        'status':        status,
        'ztf_installed': ztf_ok,
        'ztf':           ztf_info,
        'nkp_installed': nkp_ok,
        'storage':       _storage.name,
        'database': {
            'configured': bool(os.environ.get('ZTF_DATABASE_URL', '')),
            'location': _database_location(os.environ.get('ZTF_DATABASE_URL', '')),
        },
        'dataDir':       str(CONFIG_DIR),
        'retention': {
            'auditDays': AUDIT_RETENTION_DAYS,
            'executionDays': EXECUTION_RETENTION_DAYS,
        },
        'jobs': {
            'workers': EXEC_WORKERS,
            'queued': sum(1 for job in jobs if job.get('status') == 'queued'),
            'running': sum(1 for job in jobs if job.get('status') in ('running', 'cancelling')),
            'recent': len(jobs),
        },
        'nkpBinaries': {
            'total': len(binaries),
            'available': len(available_binaries),
            'default': next((item.get('name') for item in binaries if item.get('default')), None),
        },
        'version':       APP_VERSION,
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
    nkp_path    = settings.get('nkpPath') or NKP_DEFAULT

    def run_check(name: str, cmd: list[str]) -> dict:
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            return {'name': name, 'ok': r.returncode == 0, 'value': r.stdout.strip()}
        except Exception:
            return {'name': name, 'ok': False, 'value': 'check failed'}

    ztf_info = _ztf_detect(ztf_path)
    ztf_installed = bool(ztf_info.get('compatible'))
    nkp_installed = _nkp_installed(nkp_path)
    nkp_binaries = _list_nkp_binaries()
    available_nkp_binaries = sum(1 for item in nkp_binaries if item.get('exists'))
    checks = [
        run_check('Python 3.9+', [python_path, '--version']),
        run_check('pip',          [python_path, '-m', 'pip', '--version']),
        run_check('git',          ['git', '--version']),
        {'name': 'ZTF Installed', 'ok': ztf_installed, 'value': ztf_info['message'] if ztf_info.get('installed') else ''},
        {'name': 'NKP Framework', 'ok': True, 'value': 'found' if nkp_installed else 'not installed (optional)'},
        {
            'name': 'NKP Binaries',
            'ok': True,
            'value': f'{available_nkp_binaries}/{len(nkp_binaries)} available' if nkp_binaries else 'none registered (optional)',
        },
    ]
    if ztf_installed:
        # Use the same dynamic lookup as the install endpoint —
        # ZTF ships prod.txt not requirements.txt
        req_file = _ztf_requirements_file(ztf_path)
        checks.append({
            'name':  'Requirements File',
            'ok':    True,
            'value': req_file or 'not required - packaged install',
        })
    return jsonify({
        'checks': checks,
        'ztfInstalled': ztf_installed,
        'ztf': ztf_info,
        'nkpInstalled': nkp_installed,
        'nkpBinaries': {'total': len(nkp_binaries), 'available': available_nkp_binaries},
    })

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
            if is_git_checkout(ztf):
                yield from send('step', f'Updating existing ZeroTouch Framework to {ZTF_LEGACY_REF}...')
                yield from run_cmd(['git', 'fetch', '--depth', '1', 'origin', ZTF_LEGACY_REF], cwd=ztf_path)
                yield from run_cmd(['git', 'checkout', 'FETCH_HEAD'], cwd=ztf_path)
            elif not _ztf_installed(ztf):
                yield from send('step', f'Cloning ZeroTouch Framework {ZTF_LEGACY_REF}...')
                yield from run_cmd(['git', 'clone', '--depth', '1', '--branch', ZTF_LEGACY_REF, repo_url, ztf_path])
            else:
                yield from send('step', 'Using existing bundled ZeroTouch Framework.')
                yield from send(
                    'log',
                    'Source update skipped because this ZTF path is not a git checkout. '
                    'This is expected for Docker/appliance images where ZTF is baked into the image.'
                )
                yield from send(
                    'log',
                    f'To change the bundled framework, rebuild the image with ZTF_REF={ZTF_LEGACY_REF} '
                    'or set ZTF Path to a cloned zerotouch-framework 1.x checkout.'
                )

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


@app.route('/api/nkp/status')
@require_role('admin', 'operator', 'viewer')
def nkp_status():
    settings = get_settings()
    nkp_path = settings.get('nkpPath') or NKP_DEFAULT
    script = _nkp_script(nkp_path)
    examples_dir = Path(nkp_path) / 'configs' / 'environments'
    configs = []
    if examples_dir.is_dir():
        configs = sorted(path.name for path in examples_dir.glob('*.yaml') if path.is_file())
    return jsonify({
        'installed': script is not None,
        'path': nkp_path,
        'repoUrl': settings.get('nkpRepoUrl') or '',
        'script': str(script) if script else '',
        'safePhases': sorted(NKP_SAFE_PHASES),
        'configs': configs,
    })


@app.route('/api/nkp/install', methods=['POST'])
@require_role('admin')
@limiter.limit('2 per minute')
def install_nkp():
    settings = get_settings()
    nkp_path = settings.get('nkpPath') or NKP_DEFAULT
    repo_url = settings.get('nkpRepoUrl') or ''

    if repo_url not in ALLOWED_NKP_REPOS:
        return jsonify({'error': 'NKP repository URL not allowed'}), 400

    def generate() -> Generator[str, None, None]:
        def send(t, d):
            yield f"data: {json.dumps({'type': t, 'data': d})}\n\n"

        def run_cmd(args: list, cwd=None):
            yield from send('log', '$ ' + ' '.join(str(a) for a in args))
            proc = subprocess.Popen(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
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
            nkp = Path(nkp_path)
            if not _nkp_installed(nkp):
                yield from send('step', 'Cloning NKP ZeroTouch Framework...')
                yield from run_cmd(['git', 'clone', repo_url, nkp_path])
            elif is_git_checkout(nkp):
                yield from send('step', 'Updating existing NKP ZeroTouch Framework...')
                yield from run_cmd(['git', 'pull', '--ff-only'], cwd=nkp_path)
            else:
                yield from send('step', 'Existing NKP framework is not a git checkout; skipping source update.')

            if not _nkp_installed(nkp):
                raise RuntimeError('NKP framework script was not found after install')
            yield from send('done', 'NKP ZeroTouch Framework installed successfully!')
        except GeneratorExit:
            return
        except Exception:
            log.exception('nkp_install_error')
            yield from send('error', 'NKP installation failed. Check server logs for details.')

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'Connection': 'keep-alive'})


@app.route('/api/nkp/jobs', methods=['POST'])
@require_role('admin', 'operator')
def submit_nkp_job():
    data = request.json or {}
    if _maintenance_active():
        body, status_code = _maintenance_error()
        return jsonify(body), status_code
    phase = str(data.get('phase') or '').strip()
    if phase not in NKP_SAFE_PHASES:
        return jsonify({'error': 'NKP phase is not allowed'}), 400
    if data.get('apply') or data.get('confirmDestroy'):
        return jsonify({'error': 'NKP apply and destructive operations are not enabled in this release'}), 400

    config_file = str(data.get('configFile') or '').strip()
    config_content = data.get('configContent') or ''
    if not config_file and not config_content:
        return jsonify({'error': 'configFile or configContent is required'}), 400
    if config_content:
        ok, err = validate_yaml(config_content)
        if not ok:
            return jsonify({'error': f'Invalid NKP YAML: {err}'}), 400
    elif config_file:
        path = safe_config_path(config_file, get_configs_dir())
        if path is None or not path.exists():
            return jsonify({'error': 'NKP config file was not found'}), 400
        ok, err = validate_yaml(path.read_text(encoding='utf-8'))
        if not ok:
            return jsonify({'error': f'Invalid NKP YAML: {err}'}), 400

    approval_id = str(data.get('approvalId') or '').strip()
    if phase in NKP_APPROVAL_REQUIRED_PHASES:
        if not approval_id:
            return jsonify({
                'error': f'NKP phase "{phase}" requires an approved approval request',
                'approvalRequired': True,
                'requiredPhases': sorted(NKP_APPROVAL_REQUIRED_PHASES),
            }), 403
        _require_engines()
        approval = _approval_manager.get_approval(approval_id)
        approval_error = _nkp_approval_error(approval, phase, config_file, config_content)
        if approval_error:
            return jsonify({
                'error': approval_error,
                'approvalRequired': True,
                'requiredPhases': sorted(NKP_APPROVAL_REQUIRED_PHASES),
            }), 403

    current_user = getattr(request, 'current_user', {}).get('username', 'unknown')
    trace, trace_error = _build_nkp_execution_trace(data, phase, config_file, config_content, approval_id)
    if trace_error:
        body, status_code = trace_error
        return jsonify(body), status_code
    job = _job_manager.submit({
        'framework': 'nkp',
        'type': 'nkp',
        'nkpPhase': phase,
        'configFile': config_file,
        'configContent': config_content,
        'strict': bool(data.get('strict', False)),
        'approvalId': approval_id or None,
        'trace': trace,
    }, current_user)
    if approval_id:
        _require_engines()
        _approval_manager.link_job(approval_id, job['id'])
    return jsonify(job), 202


@app.route('/api/nkp/binaries')
@require_role('admin', 'operator', 'viewer')
def list_nkp_binaries():
    return jsonify(_list_nkp_binaries())


@app.route('/api/nkp/binaries', methods=['POST'])
@require_role('admin', 'operator')
def register_nkp_binary():
    data = request.json or {}
    path_text = str(data.get('path') or '').strip()
    if not path_text:
        return jsonify({'error': 'Binary path is required'}), 400
    name = str(data.get('name') or Path(path_text).name or 'NKP binary').strip()
    now = _now_iso()
    binaries = read_json(NKP_BINARIES_FILE, [])
    if not isinstance(binaries, list):
        binaries = []
    binary = {
        'id': str(uuid.uuid4()),
        'name': name,
        'version': str(data.get('version') or '').strip(),
        'path': path_text,
        'source': 'registered',
        'checksum': str(data.get('checksum') or '').strip(),
        'size': None,
        'default': bool(data.get('default')) or not binaries,
        'createdAt': now,
        'updatedAt': now,
        'createdBy': getattr(request, 'current_user', {}).get('username', 'unknown'),
    }
    if binary['default']:
        for item in binaries:
            item['default'] = False
    binaries.insert(0, binary)
    _save_nkp_binaries(binaries)
    log.info('nkp_binary_registered', extra={
        'event': 'nkp_binary_registered',
        'action': 'register_nkp_binary',
        'user': (request.current_user or {}).get('username'),
        'binaryId': binary['id'],
    })
    return jsonify(_with_nkp_binary_status(binary)), 201


@app.route('/api/nkp/binaries/upload', methods=['POST'])
@require_role('admin', 'operator')
def upload_nkp_binary():
    uploaded = request.files.get('file')
    if not uploaded or not uploaded.filename:
        return jsonify({'error': 'Binary file is required'}), 400
    filename = _safe_nkp_binary_filename(uploaded.filename)
    _secure_mkdir(NKP_BINARIES_DIR)
    target = NKP_BINARIES_DIR / f'{uuid.uuid4().hex[:8]}-{filename}'
    uploaded.save(target)
    try:
        os.chmod(target, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass
    now = _now_iso()
    binaries = read_json(NKP_BINARIES_FILE, [])
    if not isinstance(binaries, list):
        binaries = []
    binary = {
        'id': str(uuid.uuid4()),
        'name': str(request.form.get('name') or Path(filename).stem or filename).strip(),
        'version': str(request.form.get('version') or '').strip(),
        'path': str(target),
        'source': 'uploaded',
        'checksum': _sha256_file(target),
        'size': target.stat().st_size,
        'default': str(request.form.get('default') or '').lower() in {'1', 'true', 'yes'} or not binaries,
        'createdAt': now,
        'updatedAt': now,
        'createdBy': getattr(request, 'current_user', {}).get('username', 'unknown'),
    }
    if binary['default']:
        for item in binaries:
            item['default'] = False
    binaries.insert(0, binary)
    _save_nkp_binaries(binaries)
    log.info('nkp_binary_uploaded', extra={
        'event': 'nkp_binary_uploaded',
        'action': 'upload_nkp_binary',
        'user': (request.current_user or {}).get('username'),
        'binaryId': binary['id'],
    })
    return jsonify(_with_nkp_binary_status(binary)), 201


@app.route('/api/nkp/binaries/<binary_id>/default', methods=['POST'])
@require_role('admin', 'operator')
def default_nkp_binary(binary_id):
    binaries = read_json(NKP_BINARIES_FILE, [])
    if not isinstance(binaries, list) or not _set_default_nkp_binary(binaries, binary_id):
        return jsonify({'error': 'Not found'}), 404
    _save_nkp_binaries(binaries)
    return jsonify(next(_with_nkp_binary_status(item) for item in binaries if item.get('id') == binary_id))


@app.route('/api/nkp/binaries/<binary_id>', methods=['DELETE'])
@require_role('admin', 'operator')
def delete_nkp_binary(binary_id):
    binaries = read_json(NKP_BINARIES_FILE, [])
    if not isinstance(binaries, list):
        return jsonify({'error': 'Not found'}), 404
    target = next((item for item in binaries if item.get('id') == binary_id), None)
    if not target:
        return jsonify({'error': 'Not found'}), 404
    updated = [item for item in binaries if item.get('id') != binary_id]
    if target.get('default') and updated:
        updated[0]['default'] = True
        updated[0]['updatedAt'] = _now_iso()
    _save_nkp_binaries(updated)
    if target.get('source') == 'uploaded':
        try:
            path = Path(str(target.get('path') or ''))
            if path.exists() and path.resolve().is_relative_to(NKP_BINARIES_DIR.resolve()):
                path.unlink()
        except OSError:
            pass
    log.info('nkp_binary_deleted', extra={
        'event': 'nkp_binary_deleted',
        'action': 'delete_nkp_binary',
        'user': (request.current_user or {}).get('username'),
        'binaryId': binary_id,
    })
    return jsonify({'success': True})


@app.route('/api/nkp/compatibility', methods=['POST'])
@require_role('admin', 'operator')
@limiter.limit('10 per minute')
def check_nkp_compatibility():
    data = request.json or {}
    path_text = str(data.get('path') or '').strip()
    binary_id = str(data.get('binaryId') or '').strip()
    if binary_id:
        binary = next((item for item in _list_nkp_binaries() if item.get('id') == binary_id), None)
        if not binary:
            return jsonify({'error': 'NKP binary reference not found'}), 404
        path_text = str(binary.get('path') or '')
    if not path_text:
        default_binary = next((item for item in _list_nkp_binaries() if item.get('default')), None)
        path_text = str((default_binary or {}).get('path') or '')
    if not path_text:
        return jsonify({'error': 'NKP binary path is required'}), 400
    result = _nkp_cli_compatibility(path_text)
    log.info('nkp_compatibility_checked', extra={
        'event': 'nkp_compatibility_checked',
        'action': 'check_nkp_compatibility',
        'user': (request.current_user or {}).get('username'),
        'status': result.get('status'),
        'cliPath': result.get('cliPath', ''),
    })
    return jsonify(result)


@app.route('/api/nkp/templates')
@require_role('admin', 'operator', 'viewer')
def list_nkp_templates():
    return jsonify([_public_nkp_template_pack(item) for item in NKP_TEMPLATE_PACKS])


@app.route('/api/nkp/templates/<template_id>/apply', methods=['POST'])
@require_role('admin', 'operator')
def apply_nkp_template(template_id):
    template = next((item for item in NKP_TEMPLATE_PACKS if item.get('id') == template_id), None)
    if not template:
        return jsonify({'error': 'NKP template pack not found'}), 404
    payload = request.json or {}
    overrides = payload.get('overrides') if isinstance(payload.get('overrides'), dict) else {}
    merged = _merge_profile_template(template.get('profileDefaults') or {}, overrides)
    merged['template'] = _nkp_template_summary(template)
    profile = _normalize_nkp_profile(merged)
    return jsonify({
        'template': _public_nkp_template_pack(template),
        'profile': profile,
        'readiness': _nkp_profile_readiness(profile),
    })


@app.route('/api/nkp/profiles/preview', methods=['POST'])
@require_role('admin', 'operator', 'viewer')
def preview_nkp_profile_config():
    profile = _normalize_nkp_profile(request.json or {})
    content = _nkp_profile_to_yaml(profile)
    readiness = _nkp_profile_readiness(profile)
    return jsonify({
        'content': content,
        'readiness': readiness,
        'schemaValidation': _nkp_schema_validate_content(content),
        'template': _nkp_template_summary(profile.get('template') or {}),
    })


@app.route('/api/nkp/schema')
@require_role('admin', 'operator', 'viewer')
def get_nkp_schema():
    settings = get_settings()
    nkp_path = settings.get('nkpPath') or NKP_DEFAULT
    return jsonify(_nkp_schema_from_examples(nkp_path))


@app.route('/api/nkp/schema/validate', methods=['POST'])
@require_role('admin', 'operator', 'viewer')
def validate_nkp_schema():
    data = request.json or {}
    if isinstance(data.get('profile'), dict):
        content = _nkp_profile_to_yaml(_normalize_nkp_profile(data['profile']))
    else:
        content = str(data.get('content') or '')
    if not content.strip():
        return jsonify({'error': 'content or profile is required'}), 400
    return jsonify(_nkp_schema_validate_content(content))


@app.route('/api/nkp/examples')
@require_role('admin', 'operator', 'viewer')
def list_nkp_examples():
    settings = get_settings()
    nkp_path = settings.get('nkpPath') or NKP_DEFAULT
    examples = []
    for path in _nkp_example_files(nkp_path):
        try:
            data = yaml.safe_load(path.read_text(encoding='utf-8')) or {}
        except (OSError, yaml.YAMLError):
            data = {}
        environment = data.get('environment') if isinstance(data, dict) and isinstance(data.get('environment'), dict) else {}
        cluster = data.get('cluster') if isinstance(data, dict) and isinstance(data.get('cluster'), dict) else {}
        examples.append({
            'name': path.name,
            'path': _nkp_example_relpath(path, nkp_path),
            'environmentType': environment.get('type', ''),
            'provider': environment.get('provider', ''),
            'clusterName': cluster.get('name', ''),
            'topLevelKeys': sorted(str(key) for key in data.keys()) if isinstance(data, dict) else [],
        })
    return jsonify({
        'root': str(_nkp_examples_root(nkp_path)),
        'examples': examples,
        'schema': _nkp_schema_from_examples(nkp_path),
    })


@app.route('/api/nkp/examples/import', methods=['POST'])
@require_role('admin', 'operator')
def import_nkp_example():
    settings = get_settings()
    nkp_path = settings.get('nkpPath') or NKP_DEFAULT
    relpath = str((request.json or {}).get('path') or '').strip()
    path = _safe_nkp_example_path(nkp_path, relpath)
    if path is None:
        return jsonify({'error': 'NKP example was not found'}), 404
    try:
        content = path.read_text(encoding='utf-8')
        data = yaml.safe_load(content) or {}
    except (OSError, yaml.YAMLError) as exc:
        return jsonify({'error': f'Could not read NKP example: {exc}'}), 400
    if not isinstance(data, dict):
        return jsonify({'error': 'NKP example must contain a YAML mapping'}), 400
    profile = _nkp_profile_from_example(data, path.name)
    generated = _nkp_profile_to_yaml(profile)
    return jsonify({
        'example': {
            'name': path.name,
            'path': _nkp_example_relpath(path, nkp_path),
            'content': content,
        },
        'profile': profile,
        'generatedContent': generated,
        'sourceSchemaValidation': _nkp_schema_validate_content(content, nkp_path),
        'generatedSchemaValidation': _nkp_schema_validate_content(generated, nkp_path),
        'readiness': _nkp_profile_readiness(profile),
    })


@app.route('/api/nkp/profiles')
@require_role('admin', 'operator', 'viewer')
def list_nkp_profiles():
    return jsonify(_list_nkp_profiles())


@app.route('/api/nkp/profiles', methods=['POST'])
@require_role('admin', 'operator')
def create_nkp_profile():
    profile = _normalize_nkp_profile(request.json or {})
    profile['revision'] = 1
    errors = _validate_nkp_profile(profile)
    if errors:
        return jsonify({'error': 'NKP deployment profile is incomplete', 'validation': errors}), 400
    profiles = _list_nkp_profiles()
    if any(item.get('name', '').lower() == profile['name'].lower() for item in profiles):
        return jsonify({'error': 'An NKP deployment profile with this name already exists'}), 400
    profiles.insert(0, profile)
    _save_nkp_profiles(profiles)
    _record_nkp_profile_revision(profile, 'created', (request.current_user or {}).get('username') or 'unknown')
    log.info('nkp_profile_created', extra={
        'event': 'nkp_profile_created',
        'action': 'create_nkp_profile',
        'user': (request.current_user or {}).get('username'),
        'profileId': profile['id'],
    })
    return jsonify(profile), 201


@app.route('/api/nkp/profiles/readiness', methods=['POST'])
@require_role('admin', 'operator', 'viewer')
def check_nkp_profile_readiness_draft():
    profile = _normalize_nkp_profile(request.json or {})
    check_connectivity = str(request.args.get('connectivity', '')).lower() in {'1', 'true', 'yes'}
    return jsonify(_nkp_profile_readiness(profile, check_connectivity=check_connectivity))


@app.route('/api/nkp/profiles/<profile_id>')
@require_role('admin', 'operator', 'viewer')
def get_nkp_profile(profile_id):
    profile = next((item for item in _list_nkp_profiles() if item.get('id') == profile_id), None)
    if not profile:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(profile)


@app.route('/api/nkp/profiles/<profile_id>/readiness')
@require_role('admin', 'operator', 'viewer')
def check_nkp_profile_readiness(profile_id):
    profile = next((item for item in _list_nkp_profiles() if item.get('id') == profile_id), None)
    if not profile:
        return jsonify({'error': 'Not found'}), 404
    check_connectivity = str(request.args.get('connectivity', '')).lower() in {'1', 'true', 'yes'}
    return jsonify(_nkp_profile_readiness(profile, check_connectivity=check_connectivity))


@app.route('/api/nkp/profiles/<profile_id>', methods=['PUT'])
@require_role('admin', 'operator')
def update_nkp_profile(profile_id):
    profiles = _list_nkp_profiles()
    idx = next((i for i, item in enumerate(profiles) if item.get('id') == profile_id), None)
    if idx is None:
        return jsonify({'error': 'Not found'}), 404
    profile = _normalize_nkp_profile({**(request.json or {}), 'id': profile_id}, profiles[idx])
    errors = _validate_nkp_profile(profile)
    if errors:
        return jsonify({'error': 'NKP deployment profile is incomplete', 'validation': errors}), 400
    if any(item.get('id') != profile_id and item.get('name', '').lower() == profile['name'].lower() for item in profiles):
        return jsonify({'error': 'An NKP deployment profile with this name already exists'}), 400
    profile['revision'] = _profile_revision_value(profiles[idx]) + 1
    profiles[idx] = profile
    _save_nkp_profiles(profiles)
    _record_nkp_profile_revision(profile, 'updated', (request.current_user or {}).get('username') or 'unknown')
    log.info('nkp_profile_updated', extra={
        'event': 'nkp_profile_updated',
        'action': 'update_nkp_profile',
        'user': (request.current_user or {}).get('username'),
        'profileId': profile_id,
    })
    return jsonify(profile)


@app.route('/api/nkp/profiles/<profile_id>/revisions')
@require_role('admin', 'operator', 'viewer')
def list_nkp_profile_revisions(profile_id):
    profile = next((item for item in _list_nkp_profiles() if item.get('id') == profile_id), None)
    if not profile:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(_list_nkp_profile_revisions(profile_id))


@app.route('/api/nkp/profiles/<profile_id>/revisions/<int:revision>/restore', methods=['POST'])
@require_role('admin', 'operator')
def restore_nkp_profile_revision(profile_id, revision):
    profiles = _list_nkp_profiles()
    idx = next((i for i, item in enumerate(profiles) if item.get('id') == profile_id), None)
    if idx is None:
        return jsonify({'error': 'Not found'}), 404
    entry = next((item for item in _list_nkp_profile_revisions(profile_id) if int(item.get('revision') or 0) == revision), None)
    if not entry or not isinstance(entry.get('profile'), dict):
        return jsonify({'error': 'Revision not found'}), 404
    restored = _normalize_nkp_profile(entry['profile'])
    restored['id'] = profile_id
    restored['createdAt'] = profiles[idx].get('createdAt') or restored.get('createdAt') or _now_iso()
    restored['revision'] = _profile_revision_value(profiles[idx]) + 1
    restored['updatedAt'] = _now_iso()
    errors = _validate_nkp_profile(restored)
    if errors:
        return jsonify({'error': 'Stored NKP profile revision is incomplete', 'validation': errors}), 400
    profiles[idx] = restored
    _save_nkp_profiles(profiles)
    _record_nkp_profile_revision(restored, f'restored_from_{revision}', (request.current_user or {}).get('username') or 'unknown')
    log.info('nkp_profile_revision_restored', extra={
        'event': 'nkp_profile_revision_restored',
        'action': 'restore_nkp_profile_revision',
        'user': (request.current_user or {}).get('username'),
        'profileId': profile_id,
        'revision': revision,
    })
    return jsonify(restored)


@app.route('/api/nkp/profiles/<profile_id>', methods=['DELETE'])
@require_role('admin', 'operator')
def delete_nkp_profile(profile_id):
    profiles = _list_nkp_profiles()
    updated = [item for item in profiles if item.get('id') != profile_id]
    if len(updated) == len(profiles):
        return jsonify({'error': 'Not found'}), 404
    _save_nkp_profiles(updated)
    log.info('nkp_profile_deleted', extra={
        'event': 'nkp_profile_deleted',
        'action': 'delete_nkp_profile',
        'user': (request.current_user or {}).get('username'),
        'profileId': profile_id,
    })
    return jsonify({'success': True})


@app.route('/api/nkp/profiles/<profile_id>/generate', methods=['POST'])
@require_role('admin', 'operator')
def generate_nkp_profile_config(profile_id):
    profile = next((item for item in _list_nkp_profiles() if item.get('id') == profile_id), None)
    if not profile:
        return jsonify({'error': 'Not found'}), 404
    errors = _validate_nkp_profile(profile)
    if errors:
        return jsonify({'error': 'NKP deployment profile is incomplete', 'validation': errors}), 400

    filename = str((request.json or {}).get('filename') or f"{_slugify(profile['name'], 'nkp-deployment')}.yaml").strip()
    if Path(filename).name != filename:
        return jsonify({'error': 'Invalid config filename'}), 400
    if not filename.lower().endswith(('.yaml', '.yml')):
        filename = f'{filename}.yaml'
    path = safe_config_path(filename, get_configs_dir())
    if path is None:
        return jsonify({'error': 'Invalid config filename'}), 400

    content = _nkp_profile_to_yaml(profile)
    _secure_write(path, content)
    readiness = _nkp_profile_readiness(profile)
    schema_validation = _nkp_schema_validate_content(content)
    log.info('nkp_profile_config_generated', extra={
        'event': 'nkp_profile_config_generated',
        'action': 'generate_nkp_profile_config',
        'user': (request.current_user or {}).get('username'),
        'profileId': profile_id,
        'configFile': path.name,
    })
    return jsonify({
        'success': True,
        'filename': path.name,
        'content': content,
        'readiness': readiness,
        'schemaValidation': schema_validation,
        'trace': {
            'framework': 'nkp',
            'profileId': profile.get('id'),
            'profileName': profile.get('name', ''),
            'profileRevision': _profile_revision_value(profile),
            'templateId': ((profile.get('template') or {}).get('id') or ''),
            'templateName': ((profile.get('template') or {}).get('name') or ''),
            'generatedConfigFile': path.name,
            'schemaStatus': schema_validation.get('status', ''),
        },
    })

# ─── Config files ─────────────────────────────────────────────────────────────

@app.route('/api/validation-evidence')
@require_role('admin', 'operator', 'viewer')
def list_validation_evidence():
    try:
        limit = int(request.args.get('limit', '200'))
    except ValueError:
        return jsonify({'error': 'limit must be an integer'}), 400
    return jsonify(_list_validation_evidence()[:max(1, min(limit, 500))])


@app.route('/api/validation-evidence', methods=['POST'])
@require_role('admin', 'operator')
def create_validation_evidence():
    try:
        record = _build_validation_evidence(request.json or {}, (request.current_user or {}).get('username', 'unknown'))
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    return jsonify(record), 201


@app.route('/api/validation-evidence/<evidence_id>')
@require_role('admin', 'operator', 'viewer')
def get_validation_evidence(evidence_id):
    record = next((item for item in _list_validation_evidence() if item.get('id') == evidence_id), None)
    if not record:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(record)


@app.route('/api/validation-evidence/<evidence_id>/download')
@require_role('admin', 'operator', 'viewer')
def download_validation_evidence(evidence_id):
    record = next((item for item in _list_validation_evidence() if item.get('id') == evidence_id), None)
    if not record:
        return jsonify({'error': 'Not found'}), 404
    bundle = _validation_evidence_zip(record)
    filename = f"ztf-validation-evidence-{_safe_nkp_binary_filename(evidence_id)}.zip"
    return send_file(bundle, mimetype='application/zip', as_attachment=True, download_name=filename)


@app.route('/api/validation-evidence/<evidence_id>', methods=['DELETE'])
@require_role('admin')
def delete_validation_evidence(evidence_id):
    evidence = _list_validation_evidence()
    updated = [item for item in evidence if item.get('id') != evidence_id]
    if len(updated) == len(evidence):
        return jsonify({'error': 'Not found'}), 404
    _save_validation_evidence(updated)
    log.info('validation_evidence_deleted', extra={
        'event': 'validation_evidence_deleted',
        'action': 'delete_validation_evidence',
        'user': (request.current_user or {}).get('username'),
        'evidenceId': evidence_id,
    })
    return jsonify({'success': True})


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
    incompatible = _ztf_incompatible_error(ztf_path)
    if incompatible:
        body, status_code = incompatible
        return jsonify(body), status_code

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

            cmd_args = [python_path, _ztf_main_arg(ztf_path), '--workflow', workflow]
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
    if _maintenance_active():
        body, status_code = _maintenance_error()
        return jsonify(body), status_code
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

    incompatible = _ztf_incompatible_error(get_settings()['ztfPath'])
    if incompatible:
        body, status_code = incompatible
        return jsonify(body), status_code

    # Dry-run: run pre-flight checks only — no subprocess, no concurrency lock
    if dry_run:
        import time as _tm
        execution_id = str(int(_tm.time() * 1000))
        return Response(
            _run_preflight(workflow or script or '', config_content or '', execution_id),
            mimetype='text/event-stream',
            headers={'Cache-Control': 'no-cache', 'Connection': 'keep-alive'},
        )

    current_user = getattr(request, 'current_user', {}).get('username', 'unknown')
    job = _job_manager.submit({
        'workflow': workflow,
        'script': script,
        'configContent': config_content,
        'configFile': config_file,
        'debug': debug,
    }, current_user)

    return Response(
        _job_manager.stream_events(job['id']),
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

            cmd_args = [python_path, _ztf_main_arg(ztf_path)]
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

@app.route('/api/jobs', methods=['POST'])
@require_role('admin', 'operator')
@limiter.limit('10 per minute')
def submit_job():
    data = request.json or {}
    if _maintenance_active():
        body, status_code = _maintenance_error()
        return jsonify(body), status_code
    workflow = data.get('workflow')
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

    incompatible = _ztf_incompatible_error(get_settings()['ztfPath'])
    if incompatible:
        body, status_code = incompatible
        return jsonify(body), status_code

    current_user = getattr(request, 'current_user', {}).get('username', 'unknown')
    job = _job_manager.submit({
        'workflow': workflow,
        'script': script,
        'configContent': data.get('configContent'),
        'configFile': data.get('configFile'),
        'debug': bool(data.get('debug', False)),
    }, current_user)
    return jsonify(job), 202


@app.route('/api/jobs')
@require_role('admin', 'operator', 'viewer')
def list_jobs():
    limit, error = _bounded_int_arg('limit', 200, 1, 1000)
    if error:
        return error
    return jsonify(_job_manager.list_jobs(limit))


@app.route('/api/jobs/<job_id>')
@require_role('admin', 'operator', 'viewer')
def get_job(job_id):
    include_logs = request.args.get('logs', 'true').lower() != 'false'
    job = _job_manager.get_job(job_id, include_logs=include_logs)
    if not job:
        return jsonify({'error': 'not found'}), 404
    return jsonify(job)


@app.route('/api/jobs/<job_id>/stream')
@require_role('admin', 'operator', 'viewer')
def stream_job(job_id):
    offset, error = _bounded_int_arg('offset', 0, 0, 1000000)
    if error:
        return error
    return Response(
        _job_manager.stream_events(job_id, offset),
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'Connection': 'keep-alive'},
    )


@app.route('/api/jobs/<job_id>/cancel', methods=['POST'])
@require_role('admin', 'operator')
def cancel_job(job_id):
    current_user = getattr(request, 'current_user', {}).get('username', 'unknown')
    job = _job_manager.cancel(job_id, current_user)
    if not job:
        return jsonify({'error': 'not found'}), 404
    return jsonify(job)


@app.route('/api/jobs/<job_id>', methods=['DELETE'])
@require_role('admin')
def delete_job(job_id):
    current_user = getattr(request, 'current_user', {}).get('username', 'unknown')
    job, error = _job_manager.delete(job_id, current_user)
    if error == 'not_found':
        return jsonify({'error': 'not found'}), 404
    if error == 'active':
        return jsonify({'error': 'Active jobs must be cancelled or completed before deletion', 'job': job}), 409
    return jsonify({'success': True, 'deleted': job})


@app.route('/api/audit-log')
@require_role('admin')
def get_audit_log():
    """Return the last N structured log entries from ztf-orchestrator.log."""
    limit, error = _bounded_int_arg('limit', 200, 1, 1000)
    if error:
        return error
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

@app.route('/api/appliance/artifacts')
@require_role('admin', 'operator', 'viewer')
def list_appliance_artifacts():
    artifacts = _load_appliance_artifacts()
    summary = {
        'total': len(artifacts),
        'verified': sum(1 for item in artifacts if item.get('status') == 'verified'),
        'archived': sum(1 for item in artifacts if item.get('status') == 'archived'),
        'expiring': sum(1 for item in artifacts if item.get('status') == 'expiring'),
        'expired': sum(1 for item in artifacts if item.get('status') == 'expired'),
        'pending': sum(1 for item in artifacts if item.get('status') == 'pending'),
    }
    return jsonify({'artifacts': artifacts, 'summary': summary})


@app.route('/api/appliance/artifacts', methods=['POST'])
@require_role('admin', 'operator')
def create_appliance_artifact():
    record, error = _clean_artifact_payload(request.json or {})
    if error:
        return jsonify({'error': error}), 400
    artifacts = _load_appliance_artifacts()
    artifacts.insert(0, record)
    _save_appliance_artifacts(artifacts)
    log.info('appliance_artifact_created', extra={
        'action': 'appliance_artifact_created',
        'user': request.current_user['username'],
        'profile': record['profile'],
        'version': record['version'],
        'status': record['status'],
    })
    return jsonify(record), 201


@app.route('/api/appliance/artifacts/<artifact_id>', methods=['PUT'])
@require_role('admin', 'operator')
def update_appliance_artifact(artifact_id):
    artifacts = _load_appliance_artifacts()
    existing = next((item for item in artifacts if item.get('id') == artifact_id), None)
    if not existing:
        return jsonify({'error': 'Artifact record not found'}), 404
    record, error = _clean_artifact_payload(request.json or {}, existing)
    if error:
        return jsonify({'error': error}), 400
    _save_appliance_artifacts([record if item.get('id') == artifact_id else item for item in artifacts])
    log.info('appliance_artifact_updated', extra={
        'action': 'appliance_artifact_updated',
        'user': request.current_user['username'],
        'profile': record['profile'],
        'version': record['version'],
        'status': record['status'],
    })
    return jsonify(record)


@app.route('/api/appliance/artifacts/<artifact_id>/verify', methods=['POST'])
@require_role('admin', 'operator')
def verify_appliance_artifact(artifact_id):
    artifacts = _load_appliance_artifacts()
    existing = next((item for item in artifacts if item.get('id') == artifact_id), None)
    if not existing:
        return jsonify({'error': 'Artifact record not found'}), 404
    data = {**existing, **(request.json or {}), 'verifiedAt': _now_iso()}
    record, error = _clean_artifact_payload(data, existing)
    if error:
        return jsonify({'error': error}), 400
    _save_appliance_artifacts([record if item.get('id') == artifact_id else item for item in artifacts])
    log.info('appliance_artifact_verified', extra={
        'action': 'appliance_artifact_verified',
        'user': request.current_user['username'],
        'profile': record['profile'],
        'version': record['version'],
        'status': record['status'],
    })
    return jsonify(record)


@app.route('/api/appliance/artifacts/<artifact_id>', methods=['DELETE'])
@require_role('admin')
def delete_appliance_artifact(artifact_id):
    artifacts = _load_appliance_artifacts()
    target = next((item for item in artifacts if item.get('id') == artifact_id), None)
    if not target:
        return jsonify({'error': 'Artifact record not found'}), 404
    _save_appliance_artifacts([item for item in artifacts if item.get('id') != artifact_id])
    log.info('appliance_artifact_deleted', extra={
        'action': 'appliance_artifact_deleted',
        'user': request.current_user['username'],
        'profile': target.get('profile'),
        'version': target.get('version'),
    })
    return jsonify({'success': True, 'deleted': target})


@app.route('/api/appliance/updates')
@require_role('admin', 'operator', 'viewer')
def list_appliance_updates():
    updates = _load_appliance_updates()
    current = {
        'version': APP_VERSION,
        'containerImage': os.environ.get('ZTF_ORCHESTRATOR_IMAGE', ''),
        'requestPath': str(APPLIANCE_UPDATE_REQUEST_FILE),
    }
    staged = next((item for item in updates if item.get('status') == 'staged'), None)
    return jsonify({
        'current': current,
        'updates': updates,
        'staged': staged,
        'allowedRepositories': sorted(ALLOWED_UPDATE_REPOS),
        'targets': [
            {
                'id': key,
                'label': value['label'],
                'defaultRepo': value['defaultRepo'],
                'defaultPath': value['defaultPath'],
            }
            for key, value in UPDATE_TARGETS.items()
        ],
    })


@app.route('/api/appliance/updates/check', methods=['POST'])
@require_role('admin', 'operator')
@limiter.limit('10 per minute')
def check_appliance_update():
    payload = request.get_json(silent=True) or {}
    target = _clean_update_target(payload.get('target'))
    if not target:
        return jsonify({'error': 'target must be ztf-orchestrator, ztf-framework, or nkp-framework'}), 400
    repository, error = _normalize_release_repo(payload.get('repository') or UPDATE_TARGETS[target]['defaultRepo'])
    if error:
        return jsonify({'error': error}), 400
    try:
        release = _latest_github_release(repository, bool(payload.get('includePrerelease')), target)
        if payload.get('targetPath'):
            release['targetPath'] = payload.get('targetPath')
        record, error = _clean_update_manifest(release)
        if error:
            return jsonify({'error': error}), 400
        updates = _load_appliance_updates()
        existing = next((item for item in updates if item.get('target') == record['target'] and item.get('repository') == record['repository'] and item.get('version') == record['version']), None)
        if existing:
            record = {**existing, **record, 'id': existing['id'], 'createdAt': existing.get('createdAt', record.get('createdAt'))}
        _save_appliance_updates([record] + [item for item in updates if item.get('id') != record['id']])
        log.info('appliance_update_checked', extra={
            'action': 'appliance_update_checked',
            'user': request.current_user['username'],
            'repository': record['repository'],
            'version': record['version'],
            'target': record['target'],
        })
        return jsonify(record)
    except Exception as exc:
        log.warning('appliance_update_check_failed', extra={
            'action': 'appliance_update_check_failed',
            'user': request.current_user['username'],
            'repository': repository,
            'error': str(exc),
        })
        return jsonify({'error': 'Could not fetch GitHub release metadata'}), 502


@app.route('/api/appliance/updates/import', methods=['POST'])
@require_role('admin', 'operator')
def import_appliance_update():
    data = request.get_json(silent=True) or {}
    manifest = data.get('manifest', data)
    if isinstance(manifest, str):
        try:
            manifest = json.loads(manifest)
        except json.JSONDecodeError:
            return jsonify({'error': 'manifest must be valid JSON'}), 400
    if not isinstance(manifest, dict):
        return jsonify({'error': 'manifest must be a JSON object'}), 400
    manifest = {**manifest, 'source': manifest.get('source') or 'offline'}
    canonical = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode('utf-8')
    manifest.setdefault('manifestSha256', hashlib.sha256(canonical).hexdigest())
    record, error = _clean_update_manifest(manifest)
    if error:
        return jsonify({'error': error}), 400
    updates = _load_appliance_updates()
    _save_appliance_updates([record] + [item for item in updates if item.get('id') != record['id']])
    log.info('appliance_update_imported', extra={
        'action': 'appliance_update_imported',
        'user': request.current_user['username'],
        'version': record['version'],
        'target': record['target'],
        'source': record['source'],
    })
    return jsonify(record), 201


@app.route('/api/appliance/updates/<update_id>/verify', methods=['POST'])
@require_role('admin', 'operator')
def verify_appliance_update(update_id):
    updates = _load_appliance_updates()
    existing = next((item for item in updates if item.get('id') == update_id), None)
    if not existing:
        return jsonify({'error': 'Update record not found'}), 404
    data = {**existing, **(request.get_json(silent=True) or {}), 'verifiedAt': _now_iso(), 'verifiedBy': request.current_user['username']}
    record, error = _clean_update_manifest(data, existing)
    if error:
        return jsonify({'error': error}), 400
    _save_appliance_updates([record if item.get('id') == update_id else item for item in updates])
    log.info('appliance_update_verified', extra={
        'action': 'appliance_update_verified',
        'user': request.current_user['username'],
        'version': record['version'],
        'target': record['target'],
    })
    return jsonify(record)


@app.route('/api/appliance/updates/<update_id>/stage', methods=['POST'])
@require_role('admin')
def stage_appliance_update(update_id):
    updates = _load_appliance_updates()
    existing = next((item for item in updates if item.get('id') == update_id), None)
    if not existing:
        return jsonify({'error': 'Update record not found'}), 404
    if not existing.get('verifiedAt'):
        return jsonify({'error': 'Update must be verified before staging'}), 400
    now = _now_iso()
    target = existing.get('target') or 'ztf-orchestrator'
    target_info = UPDATE_TARGETS.get(target, UPDATE_TARGETS['ztf-orchestrator'])
    instructions = [
        'Create or confirm a current PostgreSQL backup.',
        'Run appliance/scripts/apply-update-request.sh on the appliance host.',
        'Confirm /health and the relevant framework status after restart or source update.',
    ]
    if target != 'ztf-orchestrator':
        instructions.insert(1, 'Confirm the target path is an approved git checkout or stage a reviewed checkout at that path.')
    request_doc = {
        'id': str(uuid.uuid4()),
        'type': target_info['requestType'],
        'target': target,
        'targetLabel': target_info['label'],
        'requestedAt': now,
        'requestedBy': request.current_user['username'],
        'version': existing['version'],
        'containerImage': existing['containerImage'],
        'repository': existing.get('repository', ''),
        'targetPath': existing.get('targetPath', ''),
        'sourceRef': existing.get('sourceRef') or existing['version'],
        'releaseUrl': existing.get('releaseUrl', ''),
        'manifestSha256': existing.get('manifestSha256', ''),
        'instructions': instructions,
    }
    write_json(APPLIANCE_UPDATE_REQUEST_FILE, request_doc)
    record = {
        **existing,
        'stagedAt': now,
        'stagedBy': request.current_user['username'],
        'requestId': request_doc['id'],
        'requestPath': str(APPLIANCE_UPDATE_REQUEST_FILE),
        'updatedAt': now,
    }
    record['status'] = _update_status(record)
    _save_appliance_updates([record if item.get('id') == update_id else item for item in updates])
    log.warning('appliance_update_staged', extra={
        'action': 'appliance_update_staged',
        'user': request.current_user['username'],
        'version': record['version'],
        'target': record.get('target'),
        'requestPath': str(APPLIANCE_UPDATE_REQUEST_FILE),
    })
    return jsonify({'update': record, 'request': request_doc})


@app.route('/api/appliance/updates/<update_id>/applied', methods=['POST'])
@require_role('admin')
def mark_appliance_update_applied(update_id):
    updates = _load_appliance_updates()
    existing = next((item for item in updates if item.get('id') == update_id), None)
    if not existing:
        return jsonify({'error': 'Update record not found'}), 404
    data = {**existing, 'appliedAt': _now_iso(), 'appliedBy': request.current_user['username']}
    record, error = _clean_update_manifest(data, existing)
    if error:
        return jsonify({'error': error}), 400
    _save_appliance_updates([record if item.get('id') == update_id else item for item in updates])
    log.warning('appliance_update_marked_applied', extra={
        'action': 'appliance_update_marked_applied',
        'user': request.current_user['username'],
        'version': record['version'],
        'target': record.get('target'),
    })
    return jsonify(record)


@app.route('/api/appliance/updates/<update_id>', methods=['DELETE'])
@require_role('admin')
def delete_appliance_update(update_id):
    updates = _load_appliance_updates()
    target = next((item for item in updates if item.get('id') == update_id), None)
    if not target:
        return jsonify({'error': 'Update record not found'}), 404
    _save_appliance_updates([item for item in updates if item.get('id') != update_id])
    log.info('appliance_update_deleted', extra={
        'action': 'appliance_update_deleted',
        'user': request.current_user['username'],
        'version': target.get('version'),
        'target': target.get('target'),
    })
    return jsonify({'success': True, 'deleted': target})


@app.route('/api/appliance/status')
@require_role('admin', 'operator', 'viewer')
def get_appliance_status():
    return jsonify(_appliance_status())


@app.route('/api/ztf/compatibility')
@require_role('admin', 'operator', 'viewer')
def get_ztf_compatibility():
    settings = get_settings()
    info = _ztf_detect(settings['ztfPath'])
    return jsonify({
        **info,
        'supportedModes': [
            {
                'id': 'legacy-workflows',
                'label': 'ZTF 1.x legacy workflows',
                'available': bool(info.get('compatible')),
                'description': 'Runs python main.py workflow and script commands through the existing catalog.',
            },
            {
                'id': 'ztf2-iac',
                'label': 'ZTF 2.x plan/apply mode',
                'available': False,
                'description': 'Planned separate mode for ztf plan/apply/refresh/destroy projects.',
            },
        ],
    })


@app.route('/api/maintenance/database-backups')
@require_role('admin')
def list_database_backups():
    """List PostgreSQL logical backups created by this appliance."""
    return jsonify({
        'enabled': _storage.name == 'postgres',
        'storage': _storage.name,
        'backups': _list_postgres_backups(),
    })


@app.route('/api/maintenance/database-backups', methods=['POST'])
@require_role('admin')
@limiter.limit('2 per hour')
def create_database_backup():
    """Create an on-demand PostgreSQL logical backup with pg_dump."""
    current_user = getattr(request, 'current_user', {}).get('username', 'unknown')
    try:
        metadata = _create_postgres_backup(current_user)
        return jsonify({'success': True, 'backup': metadata}), 201
    except RuntimeError as exc:
        log.warning('postgres_backup_failed', extra={
            'action': 'postgres_backup_failed',
            'user': current_user,
            'error': str(exc),
        })
        return jsonify({'error': str(exc)}), 400


@app.route('/api/maintenance/database-backups/<filename>')
@require_role('admin')
def download_database_backup(filename):
    """Download a previously created PostgreSQL backup."""
    path = _postgres_backup_path(filename)
    if not path:
        return jsonify({'error': 'Invalid backup filename'}), 400
    if not path.exists() or not path.is_file():
        return jsonify({'error': 'Backup not found'}), 404
    return send_file(
        path,
        mimetype='application/octet-stream',
        as_attachment=True,
        download_name=path.name,
    )


@app.route('/api/maintenance/database-backups/<filename>/restore', methods=['POST'])
@app.route('/api/maintenance/database-backups/<path:filename>/restore', methods=['POST'])
@require_role('admin')
@limiter.limit('1 per hour')
def restore_database_backup(filename):
    """Restore a PostgreSQL logical backup after explicit admin confirmation."""
    current_user = getattr(request, 'current_user', {}).get('username', 'unknown')
    data = request.json or {}
    if data.get('confirmation') != 'RESTORE':
        return jsonify({'error': 'Type RESTORE to confirm database restore'}), 400
    if not _enter_maintenance('database restore', current_user):
        body, status_code = _maintenance_error()
        return jsonify(body), status_code
    try:
        if _job_manager.active_count():
            return jsonify({
                'error': 'Cannot restore while execution jobs are running or cancelling',
                'maintenance': _maintenance_state(),
            }), 409
        result = _restore_postgres_backup(filename, current_user)
        return jsonify({
            'success': True,
            'restored': result['restored'],
            'safetyBackup': result['safetyBackup'],
            'restartRecommended': True,
            'message': 'Database restore completed. Restart the application service so in-memory sessions and workers reload restored state.',
        })
    except FileNotFoundError:
        return jsonify({'error': 'Backup not found'}), 404
    except RuntimeError as exc:
        log.warning('postgres_restore_failed', extra={
            'action': 'postgres_restore_failed',
            'user': current_user,
            'backupFile': filename,
            'error': str(exc),
        })
        return jsonify({'error': str(exc)}), 400
    finally:
        _exit_maintenance()


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
    incompatible = _ztf_incompatible_error(settings['ztfPath'])
    if incompatible:
        body, status_code = incompatible
        return jsonify(body), status_code

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
    if not workflow or not _is_allowed_approval_workflow(workflow):
        return jsonify({'error': 'Unknown workflow'}), 400
    metadata = data.get('metadata') if isinstance(data.get('metadata'), dict) else {}
    current_user = getattr(request, 'current_user', {}).get('username', 'unknown')
    approval = _approval_manager.create_request(
        workflow       = workflow,
        config_file    = data.get('configFile', ''),
        config_content = data.get('configContent', ''),
        requested_by   = current_user,
        notes          = data.get('notes', ''),
        pipeline_id    = data.get('pipelineId'),
        metadata       = metadata,
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
    approval = _approval_manager.get_approval(aid)
    if not approval:
        return jsonify({'error': 'not found'}), 404
    if approval.get('status') == 'pending' and approval.get('requestedBy') == current_user:
        return jsonify({'error': 'Self-approval is not allowed'}), 403
    result = _approval_manager.decide(aid, 'approved', current_user, notes)
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
    print(f'  ZeroTouch Enterprise Orchestrator  v{APP_VERSION}')
    print('=' * 60)
    display_host = 'localhost' if BIND_HOST in {'127.0.0.1', '0.0.0.0', '::'} else BIND_HOST  # nosec B104
    print(f'  URL:  http://{display_host}:{PORT}')
    print(f'  Logs: {LOG_FILE}')
    print('=' * 60, flush=True)
    app.run(host=BIND_HOST, port=PORT, debug=False, threaded=True)
