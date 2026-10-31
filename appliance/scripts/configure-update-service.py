#!/usr/bin/env python3
"""Preserve resolved appliance settings while adding the update spool mounts.

Uses Docker Compose's JSON output, not a new host-side YAML dependency. Generated
Compose is sensitive (resolved environment values) and is written root-only.
"""
import argparse
import copy
import json
import os
from pathlib import Path
import subprocess


def configuration(resolved, group_id):
    value = copy.deepcopy(resolved)
    service = value['services']['ztf-orchestrator']
    if service.get('privileged') or any(m.get('target') == '/var/run/docker.sock' for m in service.get('volumes', []) if isinstance(m, dict)):
        raise ValueError('Remove unexpected privileged/Docker-socket access before enabling the update service')
    mounts = service.setdefault('volumes', [])
    for kind, read_only in [('requests', False), ('results', True)]:
        source = '/var/lib/ztf-update-service/' + kind
        target = '/run/ztf-update-control/' + kind
        existing = [m for m in mounts if isinstance(m, dict) and m.get('target') == target]
        if existing and (len(existing) != 1 or existing[0].get('type') != 'bind' or existing[0].get('source') != source):
            raise ValueError('An existing mount conflicts with the update service; reconcile it first')
        if existing:
            existing[0]['read_only'] = read_only
        else:
            mounts.append({'type': 'bind', 'source': source, 'target': target, 'read_only': read_only})
    groups = [str(v) for v in service.get('group_add', [])]
    if str(group_id) not in groups:
        groups.append(str(group_id))
    service['group_add'] = groups

    # Escape existing literal dollars before restoring just the intended template.
    def literal(item):
        if isinstance(item, str): return item.replace('$', '$$')
        if isinstance(item, list): return [literal(v) for v in item]
        if isinstance(item, dict): return {key: literal(v) for key, v in item.items()}
        return item
    value = literal(value)
    service = value['services']['ztf-orchestrator']
    service['image'] = 'ghcr.io/virtuarchitect/ztf-orchestrator:${ZTF_ORCHESTRATOR_VERSION}'
    environment = service.setdefault('environment', {})
    if environment.get('ZTF_UPDATE_CONTROL_DIR') not in (None, '', '/run/ztf-update-control'):
        raise ValueError('A custom update-control path requires manual reconciliation')
    environment['ZTF_ORCHESTRATOR_VERSION'] = '${ZTF_ORCHESTRATOR_VERSION}'
    environment['ZTF_ORCHESTRATOR_IMAGE'] = service['image']
    # These values belong to the selected image, not an older Compose override.
    for name in ('ZTF_BUILD_COMMIT', 'ZTF_BUILD_DATE', 'ZTF_SOURCE_REF', 'ZTF_UPDATE_PACKAGE_ID'):
        environment.pop(name, None)
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--group-id', type=int, required=True)
    args = parser.parse_args()
    if os.geteuid() != 0 or args.group_id <= 0:
        raise SystemExit('Run as root with the allocated update-service group ID')
    app = Path('/opt/ztf-orchestrator')
    path = app / 'appliance/docker-compose.appliance.yml'
    if path.is_symlink():
        raise SystemExit('Symlink Compose files require manual reconciliation')
    cmd = ['docker', 'compose', '--env-file', str(app / '.env'), '-f', str(path)]
    result = subprocess.run(cmd + ['config', '--format', 'json'], capture_output=True, check=True)
    resolved = configuration(json.loads(result.stdout), args.group_id)
    temporary = path.with_suffix('.guided-update.tmp')
    original = path.read_bytes()
    try:
        with temporary.open('w', encoding='utf-8') as stream:
            os.chmod(temporary, 0o600)
            json.dump(resolved, stream, indent=2)
            stream.flush(); os.fsync(stream.fileno())
        subprocess.run(['docker', 'compose', '--env-file', str(app / '.env'), '-f', str(temporary), 'config', '--quiet'], check=True, capture_output=True)
        os.replace(temporary, path)
    except Exception:
        temporary.unlink(missing_ok=True)
        assert path.read_bytes() == original, 'Original Compose must remain unchanged on failure'
        raise SystemExit('Compose preparation failed. Original settings retained; inspect the root-only backup.') from None
    print('Compose prepared: existing services, ports, TLS mounts and named volumes retained. Application has not been restarted.')


if __name__ == '__main__':
    main()
