"""Disposable PostgreSQL 16 backup/restore rehearsal; never uses appliance data."""
import json
from pathlib import Path
import subprocess
import tempfile
import time
import uuid

from appliance.update_service import Service


name = 'ztf-update-backup-smoke-' + uuid.uuid4().hex[:12]


def docker(*args, **kwargs):
    return subprocess.run(['docker', *args], check=True, capture_output=True, **kwargs)


class BackupOnly(Service):
    def run(self, args, timeout=120, **kwargs):
        args = [name if part == 'ztf-orchestrator-postgres' else part for part in args]
        return super().run(args, timeout=timeout, **kwargs)


try:
    docker('run', '--rm', '-d', '--name', name, '--network', 'none', '--tmpfs', '/var/lib/postgresql/data:rw,size=256m',
           '-e', 'POSTGRES_DB=ztf_orchestrator', '-e', 'POSTGRES_USER=ztf', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine')
    for _ in range(60):
        ready = subprocess.run(['docker', 'exec', name, 'pg_isready', '-U', 'ztf', '-d', 'ztf_orchestrator'], capture_output=True)
        if ready.returncode == 0:
            break
        time.sleep(.5)
    else:
        raise AssertionError('Disposable PostgreSQL did not become ready')
    docker('exec', name, 'psql', '-U', 'ztf', '-d', 'ztf_orchestrator', '-c', "CREATE TABLE recovery_fixture (id integer PRIMARY KEY, label text); INSERT INTO recovery_fixture VALUES (1, 'isolated fixture');")
    with tempfile.TemporaryDirectory(prefix='ztf-backup-smoke-') as temporary:
        root = Path(temporary).resolve()
        assert root.parent == Path(tempfile.gettempdir()).resolve()
        app = root / 'app'; app.mkdir(); (app / 'appliance').mkdir()
        (app / '.env').write_text('ZTF_ORCHESTRATOR_VERSION=v1.8.5-rc1-fixture\n')
        (app / 'appliance/docker-compose.appliance.yml').write_text('services: {}')
        source = root / 'source'; source.mkdir(); (source / 'fixture.yml').write_text('fixture: true')
        service = BackupOnly({'appDir': str(app), 'controlDir': str(root / 'control')})
        receipt = json.loads((service.backups / service.backup(source, 'v1.8.5-rc1-fixture')).read_text())
        docker('exec', name, 'createdb', '-U', 'ztf', 'restore_fixture')
        with (service.backups / receipt['database']['name']).open('rb') as stream:
            restored = subprocess.run(['docker', 'exec', '-i', name, 'pg_restore', '-U', 'ztf', '-d', 'restore_fixture', '--exit-on-error'], stdin=stream, capture_output=True)
        assert restored.returncode == 0, 'Disposable database restore failed'
        count = docker('exec', name, 'psql', '-U', 'ztf', '-d', 'restore_fixture', '-tA', '-c', 'SELECT count(*) FROM recovery_fixture').stdout.strip()
        assert count == b'1'
        print('PASS: real PostgreSQL 16 dump, archive listing, service backup hashes/data archive and disposable database restore/readback')
        print('No existing appliance container, volume, image tag, data or database was modified.')
finally:
    subprocess.run(['docker', 'rm', '-f', name], capture_output=True)
