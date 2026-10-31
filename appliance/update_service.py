#!/usr/bin/env python3
"""Appliance update worker: fixed commands, private plans and durable reports.

Run only from a root-owned installation with a root-owned config. No TCP server,
arbitrary shell, user-provided host path, remote download or database restore.
"""
import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import tarfile
import threading
import time
import uuid
import zipfile
from pathlib import Path


TERMINAL = {'succeeded', 'failed', 'interrupted', 'rejected'}
EXCLUDED = {'appliance-update-packages', 'bundles'}
IMAGE = re.compile(r'ghcr\.io/virtuarchitect/ztf-orchestrator:(v[0-9][A-Za-z0-9_.-]{0,63})\Z')
PACKAGE = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z')


class UpdateError(Exception):
    pass


def atomic(path, value):
    tmp = path.with_suffix('.tmp')
    with tmp.open('w', encoding='utf-8') as stream:
        json.dump(value, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(tmp, 0o640 if path.parent.name == 'results' else 0o600)
    os.replace(tmp, path)


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(part)
    return h.hexdigest()


def safe_child(root, relative):
    if root.is_symlink():
        raise UpdateError('Symlink storage roots are not supported')
    value = Path(relative)
    if value.is_absolute() or not value.parts or any(p in {'..', '.'} for p in value.parts):
        raise UpdateError('Unsafe artifact path')
    path = root
    for part in value.parts:
        path = path / part
        if path.is_symlink():
            raise UpdateError('Symlink artifacts are not supported')
    if not path.resolve().is_relative_to(root.resolve()):
        raise UpdateError('Artifact is outside its approved directory')
    return path


def tree_size(path, exclusions=()):
    total = 0
    for directory, dirs, files in os.walk(path, followlinks=False):
        dirs[:] = [name for name in dirs if not (Path(directory) / name).is_symlink()
                   and not (Path(directory) == path and name in exclusions)]
        for name in files:
            file = Path(directory) / name
            if not file.is_symlink():
                total += file.stat().st_size
    return total


class Service:
    def __init__(self, config):
        self.app = Path(config['appDir'])
        self.root = Path(config['controlDir'])
        self.private = self.root / 'private'
        self.results = self.root / 'results'
        for directory in (self.private, self.results, self.root / 'requests'):
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.backups = safe_child(self.app, 'update-artifacts/pre-update-backups')
        self.backups.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.state_path = self.private / 'state.json'
        self.state = json.loads(self.state_path.read_text()) if self.state_path.exists() else {'operation': None, 'maintenance': False}
        self.guard = threading.RLock()
        self.compose = ['docker', 'compose', '--env-file', str(self.app / '.env'), '-f', str(self.app / 'appliance/docker-compose.appliance.yml')]
        if self.state.get('operation') and self.state['operation']['status'] not in TERMINAL:
            previous = self.state.get('rollback')
            if self.state.get('maintenance') and not self.state.get('targetStarted') and previous:
                # A stopped old application can be restarted safely only when no
                # new-version process has been started. Never replay installation.
                try:
                    self.restore_image(previous)
                    self.verify(previous['imageId'])
                    self.state['applicationMayBeStopped'] = False
                    self.state['maintenance'] = False
                except Exception:
                    pass  # Remain locked; operator reconciliation is required.
            self.event('interrupted', 'The host service restarted. Inspect the retained report before rollback; installation was not replayed.', status='interrupted')

    def run(self, args, timeout=120, **kwargs):
        result = subprocess.run(args, check=False, timeout=timeout, **kwargs)
        if result.returncode:
            # Never expose command output: Compose/env or SQL errors can contain secrets.
            raise UpdateError('A host operation failed. Consult the root-only service journal and retained operation report.')
        return result

    def output(self, args, timeout=120):
        return self.run(args, timeout, capture_output=True, text=True).stdout

    def save(self):
        with self.guard:
            atomic(self.state_path, self.state)
            atomic(self.results / 'status.json', {**self.state, 'heartbeat': time.time()})
            op = self.state.get('operation')
            if op:
                atomic(self.results / f"{op['id']}.json", op)

    def event(self, stage, message, status='running', **extra):
        with self.guard:
            op = self.state['operation']
            op.update(stage=stage, message=message, status=status, updatedAt=time.time(), **extra)
            op.setdefault('events', []).append({'stage': stage, 'message': message, 'at': time.time()})
            self.save()

    def inspect(self):
        app = json.loads(self.output(['docker', 'inspect', 'ztf-orchestrator']))[0]
        mounts = [m for m in app['Mounts'] if m['Destination'] == '/var/lib/ztf-orchestrator' and m['Type'] == 'volume']
        if len(mounts) != 1:
            raise UpdateError('Guided updates require the appliance named data volume. Custom layouts use the existing CLI procedure.')
        source = Path(mounts[0]['Source'])
        if not source.is_absolute() or source.is_symlink():
            raise UpdateError('Invalid appliance data volume')
        return app, source

    def active_jobs(self):
        sql = "SELECT coalesce(jsonb_agg(data), '[]'::jsonb) FROM ztf_documents WHERE name IN ('jobs.json','parallel_runs.json','pipelines.json')"
        docs = json.loads(self.output(['docker', 'exec', 'ztf-orchestrator-postgres', 'psql', '-U', 'ztf', '-d', 'ztf_orchestrator', '-tA', '-c', sql]))
        if not isinstance(docs, list):
            raise UpdateError('Automation state cannot be confirmed')
        # Only execution records count; arbitrary configuration payloads can also
        # contain a desired "status: running" and must not be treated as jobs.
        return any(isinstance(record, dict) and record.get('status') in {'queued', 'running', 'cancelling'}
                   for collection in docs if isinstance(collection, list) for record in collection)

    def artifact(self, payload, source):
        package_id = payload.get('packageId', '')
        if not isinstance(package_id, str) or not PACKAGE.fullmatch(package_id):
            raise UpdateError('Select a complete imported appliance package')
        image = payload.get('image', '')
        match = IMAGE.fullmatch(image) if isinstance(image, str) else None
        if not match or match[1] != payload.get('version'):
            raise UpdateError('The approved image tag must exactly match the version')
        checksum = payload.get('checksum', '')
        if not isinstance(checksum, str) or not re.fullmatch('[a-f0-9]{64}', checksum):
            raise UpdateError('An image SHA-256 checksum is required')
        package_root = safe_child(source, 'appliance-update-packages/' + package_id)
        path = safe_child(package_root, payload.get('artifact', ''))
        if not path.is_file() or digest(path) != checksum:
            raise UpdateError('The imported image checksum could not be verified')
        expanded = 0
        with tarfile.open(path, 'r:*') as tar:
            members = []
            for member in tar:
                members.append(member)
                if len(members) > 100000:
                    raise UpdateError('Image archive exceeds the member limit')
            manifests = [m for m in members if m.name == 'manifest.json' and m.isfile() and m.size < 1024 * 1024]
            if len(manifests) != 1:
                raise UpdateError('Expected a Docker image archive with one manifest')
            entries = json.load(tar.extractfile(manifests[0]))
            if not isinstance(entries, list) or len(entries) != 1 or not isinstance(entries[0], dict):
                raise UpdateError('One appliance image per package is required')
            tags = [tag for entry in entries for tag in entry.get('RepoTags', [])]
            if tags != [image]:
                raise UpdateError('The Docker archive tag does not match the selected update')
            config_name = entries[0].get('Config')
            config_member = tar.getmember(config_name) if isinstance(config_name, str) else None
            if not config_member or not config_member.isfile() or config_member.size > 8 * 1024**2:
                raise UpdateError('The image configuration cannot be verified')
            image_config = json.load(tar.extractfile(config_member))
            if image_config.get('config', {}).get('Labels', {}).get('io.ztf.appliance-update-protocol') != '1':
                raise UpdateError('This image predates guided updates. Use the documented legacy procedure for this version.')
            expanded = sum(m.size for m in members if m.isfile())
            layers = entries[0].get('Layers')
            if not isinstance(layers, list) or not layers or any(not isinstance(name, str) for name in layers):
                raise UpdateError('Image layer inventory is missing')
            for name in layers:
                layer = tar.getmember(name)
                if not layer.isfile():
                    raise UpdateError('Image layers must be regular archive members')
                with tar.extractfile(layer) as stream:
                    magic = stream.read(4)
                    stream.seek(0)
                    if magic.startswith(b'\x28\xb5\x2f\xfd'):
                        raise UpdateError('Use a gzip or uncompressed Docker archive; zstd layer capacity cannot be verified by this service')
                    if magic.startswith(b'\x1f\x8b'):
                        expanded -= layer.size
                        with gzip.GzipFile(fileobj=stream) as decompressed:
                            for chunk in iter(lambda: decompressed.read(1024 * 1024), b''):
                                expanded += len(chunk)
                                if expanded > 64 * 1024**3:
                                    raise UpdateError('Image expansion exceeds the guided update limit')
                if expanded > 64 * 1024**3:
                    raise UpdateError('Image expansion exceeds the guided update limit')
        return path, expanded

    def backup_pairs(self):
        pairs = []
        for receipt in self.backups.glob('guided-*.json'):
            if receipt.is_symlink():
                continue
            try:
                record = json.loads(receipt.read_text())
                files = [safe_child(self.backups, record[k]['name']) for k in ('data', 'database')]
                if all(p.is_file() and p.stat().st_size == record[k]['size'] and digest(p) == record[k]['sha256'] for p, k in zip(files, ('data', 'database'))):
                    pairs.append((receipt, record))
            except (OSError, ValueError, KeyError, TypeError, UpdateError):
                continue
        return sorted(pairs, key=lambda p: p[1]['createdAt'], reverse=True)

    def ensure_idle(self, require_healthy=True):
        if self.active_jobs():
            raise UpdateError('Queued or running automation must finish or be reconciled before updating')
        script = "import urllib.request,urllib.error\ntry:\n r=urllib.request.urlopen('http://127.0.0.1:5001/health', timeout=5)\nexcept urllib.error.HTTPError as e:\n r=e\nprint(r.read().decode())"
        health = json.loads(self.output(['docker', 'exec', 'ztf-orchestrator', 'python', '-c', script]))
        if health.get('storageBackend') != 'postgres':
            raise UpdateError('Guided updates require the PostgreSQL appliance storage backend')
        if health.get('localMaintenance') is not False or (require_healthy and health.get('status') != 'healthy'):
            raise UpdateError('Application health and absence of other maintenance must be confirmed before updating')
        if health.get('activeStreams') != 0:
            raise UpdateError('Wait for active streamed pipelines or installation tasks to complete')

    def preflight(self, payload, storage_only=False):
        app, source = self.inspect()
        self.ensure_idle()
        self.output(self.compose + ['config', '--quiet'])
        self.output(['docker', 'exec', 'ztf-orchestrator-postgres', 'pg_isready', '-U', 'ztf', '-d', 'ztf_orchestrator'])
        if storage_only:
            payload = {'packageId': '', 'version': '', 'image': ''}
            expanded = 0
        else:
            _path, expanded = self.artifact(payload, source)
        # Conservative uncompressed data + DB + image expansion + safety margin.
        database_size = int(self.output(['docker', 'exec', 'ztf-orchestrator-postgres', 'psql', '-U', 'ztf', '-d', 'ztf_orchestrator', '-tA', '-c', 'SELECT pg_database_size(current_database())']).strip())
        backup_bytes = tree_size(source, EXCLUDED) + database_size * 2
        required = backup_bytes + expanded * 3 + 2 * 1024**3
        roots = {str(self.app), str(source), '/var/lib/docker', '/var/lib/containerd'}
        disks = []
        for root in sorted(roots):
            if Path(root).exists():
                usage = shutil.disk_usage(root)
                disks.append({'location': root, 'freeBytes': usage.free, 'requiredBytes': required, 'ok': usage.free >= required})
        plan_id = str(uuid.uuid4())
        plan = {'id': plan_id, 'purpose': 'storage' if storage_only else 'update', 'version': payload['version'], 'packageId': payload['packageId'], 'createdAt': time.time(), 'payload': payload, 'imageId': app['Image'],
                'dataSource': str(source), 'backupBytes': backup_bytes, 'disks': disks,
                'ready': all(d['ok'] for d in disks), 'cleanup': self.cleanup_candidates(payload, source, app)}
        atomic(self.private / f'plan-{plan_id}.json', plan)
        return {k: v for k, v in plan.items() if k not in {'payload', 'dataSource'}}

    def cleanup_candidates(self, payload, source, app):
        protected_images = {app['Config']['Image']}
        if self.state.get('rollback'):
            protected_images.add(self.state['rollback']['image'])
        candidates = []
        packages = safe_child(source, 'appliance-update-packages')
        if packages.exists():
            for folder in packages.iterdir():
                if folder.is_dir() and not folder.is_symlink() and PACKAGE.fullmatch(folder.name) and folder.name != payload['packageId']:
                    # Unknown or malformed packages are preserved; only known old packages qualify.
                    manifest = folder / 'manifest.json'
                    try:
                        if manifest.is_file() and not manifest.is_symlink():
                            meta = json.loads(manifest.read_text())
                        else:
                            archives = [p for p in folder.glob('*.zip') if not p.is_symlink()]
                            if len(archives) != 1:
                                continue
                            with zipfile.ZipFile(archives[0]) as package:
                                item = package.getinfo('manifest.json')
                                if item.file_size > 1024 * 1024:
                                    continue
                                meta = json.loads(package.read(item))
                        if not isinstance(meta, dict) or meta.get('target') != 'ztf-orchestrator' or meta.get('containerImage') in protected_images | {payload['image']}:
                            continue
                        candidates.append({'id': 'package:' + folder.name, 'label': 'Imported package ' + str(meta.get('version', folder.name)), 'sizeBytes': tree_size(folder)})
                    except (OSError, ValueError, KeyError, zipfile.BadZipFile):
                        continue
        # Only service-verified backup sets qualify. Legacy backups remain untouched.
        for receipt, record in self.backup_pairs()[1:]:
            if self.state.get('rollback', {}).get('receipt') == receipt.name:
                continue
            candidates.append({'id': 'backup:' + receipt.stem, 'label': 'Verified backup ' + record['version'],
                               'sizeBytes': record['data']['size'] + record['database']['size']})
        return candidates

    def plan(self, plan_id):
        if not isinstance(plan_id, str) or not PACKAGE.fullmatch(plan_id):
            raise UpdateError('A current readiness plan is required')
        path = self.private / f'plan-{plan_id}.json'
        plan = json.loads(path.read_text())
        if plan.get('consumed') or time.time() - plan['createdAt'] > 900:
            raise UpdateError('Readiness plan expired or was already used. Run checks again.')
        return plan, path

    def cleanup(self, payload):
        plan, _ = self.plan(payload.get('planId'))
        selected = payload.get('selected')
        if not isinstance(selected, list) or not selected or len(selected) > 100 or any(not isinstance(v, str) for v in selected):
            raise UpdateError('Select the exact cleanup entries to remove')
        app, source = self.inspect()
        if app['Image'] != plan['imageId'] or str(source) != plan['dataSource']:
            raise UpdateError('Appliance changed since review; run checks again')
        before = {v['id']: v for v in plan['cleanup']}
        current = {v['id']: v for v in self.cleanup_candidates(plan['payload'], source, app)}
        if any(key not in before or key not in current or before[key] != current[key] for key in selected):
            raise UpdateError('Cleanup selection changed or is protected. Run checks again.')
        self.ensure_idle()
        for key in selected:
            kind, name = key.split(':', 1)
            if kind == 'package':
                folder = safe_child(source, 'appliance-update-packages/' + name)
                shutil.rmtree(folder)
            else:
                receipt = safe_child(self.backups, name + '.json')
                record = json.loads(receipt.read_text())
                for field in ('data', 'database'):
                    safe_child(self.backups, record[field]['name']).unlink()
                receipt.unlink()
        self.event('cleanup', 'Selected obsolete artifacts removed. Run readiness checks again.', status='succeeded')

    def backup(self, source, version):
        stamp = time.strftime('%Y%m%d%H%M%S', time.gmtime()) + '-' + uuid.uuid4().hex[:8]
        base = 'guided-' + stamp
        try:
            return self._write_backup(source, version, base)
        except Exception:
            # Remove only this operation's own failed outputs; retained backups
            # are never removed implicitly or mistaken for complete pairs.
            for suffix in ('.dump', '.tar.gz', '.json', '.tmp'):
                (self.backups / (base + suffix)).unlink(missing_ok=True)
            raise

    def _write_backup(self, source, version, base):
        db = self.backups / (base + '.dump')
        data = self.backups / (base + '.tar.gz')
        record = {'version': version, 'createdAt': time.time()}
        with db.open('wb') as stream:
            self.run(['docker', 'exec', 'ztf-orchestrator-postgres', 'pg_dump', '-U', 'ztf', '-d', 'ztf_orchestrator', '-Fc', '--no-owner', '--no-privileges'], timeout=1800, stdout=stream, stderr=subprocess.DEVNULL)
        with db.open('rb') as stream:
            self.run(['docker', 'exec', '-i', 'ztf-orchestrator-postgres', 'pg_restore', '--list'], stdin=stream, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        with tarfile.open(data, 'w:gz') as tar:
            for entry in source.iterdir():
                if entry.name not in EXCLUDED:
                    tar.add(entry, arcname=entry.name, recursive=True)
            # Host-only material stays inside the root-readable recovery archive.
            tar.add(self.app / '.env', arcname='__appliance_host_backup__/.env')
            tar.add(self.app / 'appliance/docker-compose.appliance.yml', arcname='__appliance_host_backup__/docker-compose.appliance.yml')
        with gzip.open(data, 'rb') as stream:
            while stream.read(1024 * 1024):
                pass
        with tarfile.open(data) as tar:
            for _ in tar:
                pass
        for key, path in [('database', db), ('data', data)]:
            os.chmod(path, 0o600)
            record[key] = {'name': path.name, 'sha256': digest(path), 'size': path.stat().st_size}
        receipt = self.backups / (base + '.json')
        atomic(receipt, record)
        return receipt.name

    def set_version(self, version):
        env = self.app / '.env'
        lines = env.read_text().splitlines()
        lines = [line for line in lines if not line.startswith('ZTF_ORCHESTRATOR_VERSION=')]
        lines.append('ZTF_ORCHESTRATOR_VERSION=' + version)
        tmp = env.with_suffix('.update-tmp')
        tmp.write_text('\n'.join(lines) + '\n')
        os.chmod(tmp, 0o600)
        os.replace(tmp, env)

    def verify(self, image_id):
        for _ in range(60):
            app, _source = self.inspect()
            if app['Image'] != image_id:
                raise UpdateError('The running image does not match the approved image')
            if app['State'].get('Health', {}).get('Status') == 'healthy':
                self.output(['docker', 'exec', 'ztf-orchestrator-postgres', 'pg_isready', '-U', 'ztf', '-d', 'ztf_orchestrator'])
                health = json.loads(self.output(['docker', 'exec', 'ztf-orchestrator', 'python', '-c', "import json,urllib.request; print(urllib.request.urlopen('http://127.0.0.1:5001/health', timeout=5).read().decode())"]))
                if health.get('status') != 'healthy' or health.get('installed', {}).get('versionTag') != app['Config']['Image'].split(':')[-1]:
                    raise UpdateError('Application health or installed version does not match the running image')
                return {'imageId': app['Image'], 'image': app['Config']['Image'], 'health': health, 'database': 'accepting connections'}
            time.sleep(5)
        raise UpdateError('Application readiness timed out; inspect the update report before rollback')

    def restore_image(self, previous):
        self.set_version(previous['version'])
        rendered = json.loads(self.output(self.compose + ['config', '--format', 'json']))
        if rendered['services']['ztf-orchestrator']['image'] != previous['image']:
            raise UpdateError('Compose no longer matches the retained rollback image; reconcile host configuration first')
        self.run(self.compose + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'ztf-orchestrator'], timeout=180, capture_output=True)

    def install(self, payload):
        plan, plan_path = self.plan(payload.get('planId'))
        if plan.get('purpose') != 'update':
            raise UpdateError('Storage review cannot approve installation. Select a package and run readiness checks.')
        if payload.get('confirmation') != 'INSTALL ' + plan['payload']['version']:
            raise UpdateError('Exact version approval is required')
        self.state['maintenance'] = True
        self.event('readiness', 'Blocking new automation and rechecking readiness')
        # Let in-flight web submissions settle, then recheck authoritative records.
        time.sleep(3)
        fresh = self.preflight(plan['payload'])
        if not fresh['ready']:
            raise UpdateError('Insufficient disk space. Review cleanup and repeat readiness checks.')
        app, source = self.inspect()
        if app['Image'] != plan['imageId']:
            raise UpdateError('The installed image changed after approval')
        plan['consumed'] = True
        atomic(plan_path, plan)
        path, _ = self.artifact(plan['payload'], source)
        private_image = self.private / 'approved-image.tar'
        shutil.copyfile(path, private_image)
        if digest(private_image) != plan['payload']['checksum']:
            raise UpdateError('Image changed while staging it for installation')
        # Root-owned immutable copy survives cache cleanup or app-container restart.
        old_version = None
        for line in (self.app / '.env').read_text().splitlines():
            if line.startswith('ZTF_ORCHESTRATOR_VERSION='):
                old_version = line.split('=', 1)[1]
        if not old_version or not IMAGE.fullmatch(app['Config']['Image']) or not re.fullmatch(r'v[0-9][A-Za-z0-9_.-]{0,63}', old_version):
            raise UpdateError('The existing image/version is not eligible for guided rollback')
        old_image = json.loads(self.output(['docker', 'image', 'inspect', app['Config']['Image']]))[0]
        if old_image['Id'] != app['Image']:
            raise UpdateError('The rollback image tag changed. Reconcile images before updating.')
        self.state['rollback'] = {'image': app['Config']['Image'], 'imageId': app['Image'], 'version': old_version, 'receipt': None}
        self.state['applicationMayBeStopped'] = True
        self.event('backup', 'Stopping application writes; PostgreSQL remains running')
        try:
            self.run(self.compose + ['stop', 'ztf-orchestrator'], capture_output=True)
            receipt = self.backup(source, old_version)
            self.state['rollback'] = {'image': app['Config']['Image'], 'imageId': app['Image'], 'version': old_version, 'receipt': receipt}
            self.save()
            self.event('load', 'Backup pair verified. Loading approved image')
            self.run(['docker', 'load', '-i', str(private_image)], timeout=1800, capture_output=True)
            expected = json.loads(self.output(['docker', 'image', 'inspect', plan['payload']['image']]))[0]['Id']
            self.set_version(plan['payload']['version'])
            rendered = json.loads(self.output(self.compose + ['config', '--format', 'json']))
            if rendered['services']['ztf-orchestrator']['image'] != plan['payload']['image']:
                raise UpdateError('Compose image does not match the approved update')
            self.state['targetStarted'] = True
            self.event('restart', 'Starting the approved application image')
            self.run(self.compose + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'ztf-orchestrator'], timeout=180, capture_output=True)
            self.event('verify', 'Checking exact image, application health and database connectivity')
            result = self.verify(expected)
            self.state['applicationMayBeStopped'] = False
            self.state['maintenance'] = False
            self.event('complete', 'Update verified. Review the report before resuming automation.', status='succeeded', verification=result)
        except Exception:
            # Preserve durable maintenance when a new application may have migrated data.
            if not self.state.get('targetStarted'):
                self.restore_image(self.state['rollback'])
                self.verify(self.state['rollback']['imageId'])
                self.state['applicationMayBeStopped'] = False
                self.state['maintenance'] = False
            raise
        finally:
            private_image.unlink(missing_ok=True)

    def rollback(self, payload):
        record = self.state.get('rollback')
        if not record or payload.get('confirmation') != 'ROLLBACK ' + record['version'] or payload.get('databaseCompatible') is not True:
            raise UpdateError('Rollback requires exact approval and independent database compatibility confirmation. Database restoration is separate.')
        self.state['maintenance'] = True
        self.event('rollback', 'Blocking new automation before restoring the retained application image')
        time.sleep(3)
        self.ensure_idle(require_healthy=False)
        image = json.loads(self.output(['docker', 'image', 'inspect', record['image']]))[0]
        if image['Id'] != record['imageId']:
            raise UpdateError('Rollback image is missing or changed; reconcile with the retained backup')
        self.event('rollback', 'Restoring the retained application image only; database is not restored')
        self.restore_image(record)
        verification = self.verify(record['imageId'])
        self.state['applicationMayBeStopped'] = False
        self.state['maintenance'] = False
        self.event('complete', 'Previous image restored and checked', status='succeeded', verification=verification)

    def process(self, command):
        if not isinstance(command, dict):
            raise UpdateError('Invalid request document')
        request_id = command.get('id')
        if not isinstance(request_id, str) or not PACKAGE.fullmatch(request_id):
            raise UpdateError('Invalid operation identifier')
        history = self.results / f'{request_id}.json'
        if history.exists():
            return  # Durable idempotency: never replay an accepted operation.
        action = command.get('action')
        if action not in {'storage', 'preflight', 'cleanup', 'install', 'rollback'}:
            raise UpdateError('Unsupported update operation')
        if self.state.get('maintenance') and action != 'rollback':
            raise UpdateError('Interrupted cutover requires reconciliation before continuing')
        self.state['operation'] = {'id': request_id, 'action': action, 'status': 'running', 'events': [], 'requestedBy': str(command.get('requestedBy', ''))[:100]}
        if not self.state.get('maintenance'):
            self.state['targetStarted'] = False
        self.event('accepted', 'Appliance operation accepted')
        try:
            payload = command.get('payload')
            if not isinstance(payload, dict):
                raise UpdateError('Invalid operation payload')
            if action in {'preflight', 'storage'}:
                plan = self.preflight(payload, storage_only=action == 'storage')
                self.event('readiness', 'Readiness checks complete. Review disk space, cleanup and approval.', status='succeeded', plan=plan)
            elif action == 'cleanup':
                self.cleanup(payload)
            elif action == 'install':
                self.install(payload)
            else:
                self.rollback(payload)
        except Exception as exc:
            if not self.state.get('targetStarted') and not self.state.get('applicationMayBeStopped') and action != 'rollback':
                self.state['maintenance'] = False
            message = str(exc) if isinstance(exc, UpdateError) else 'Host operation could not complete. Review the service journal; no automatic retry was performed.'
            self.event('failed', message, status='failed')


def main():
    import fcntl  # Linux host only; pure validation helpers are portable for tests.
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default='/etc/ztf-update-service.json')
    args = parser.parse_args()
    config_path = Path(args.config)
    info = config_path.stat()
    if os.geteuid() != 0 or info.st_uid != 0 or info.st_mode & (stat.S_IWGRP | stat.S_IWOTH) or config_path.is_symlink():
        raise SystemExit('Service and configuration must be root controlled')
    os.umask(0o077)
    config = json.loads(config_path.read_text())
    private = Path(config['controlDir']) / 'private'
    private.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (private / 'worker.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        service = Service(config)
        def heartbeat():
            while True:
                service.save()
                time.sleep(2)
        threading.Thread(target=heartbeat, daemon=True).start()
        request = service.root / 'requests/request.json'
        while True:
            if request.exists():
                # Wait for the web writer to finish. Reject symlinks and oversized requests.
                time.sleep(0.25)
                try:
                    descriptor = os.open(request, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
                    with os.fdopen(descriptor, 'rb') as stream:
                        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                            raise UpdateError('Unsafe request')
                        content = stream.read(32769)
                    if len(content) > 32768:
                        raise UpdateError('Unsafe request')
                    command = json.loads(content)
                    claimed = service.private / 'claimed.json'
                    os.replace(request, claimed)
                    service.process(command)
                except (OSError, ValueError, UpdateError) as exc:
                    print('Update request rejected:', type(exc).__name__, flush=True)
                    request.unlink(missing_ok=True)
                finally:
                    (service.root / 'requests/pending.lock').unlink(missing_ok=True)
            else:
                pending = service.root / 'requests/pending.lock'
                if pending.exists() and time.time() - pending.stat().st_mtime > 60:
                    pending.unlink(missing_ok=True)  # Unpublished requests are never executed.
            time.sleep(1)


if __name__ == '__main__':
    main()
