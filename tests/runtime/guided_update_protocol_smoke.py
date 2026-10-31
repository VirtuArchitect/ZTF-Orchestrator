"""Linux-only isolated service smoke. Docker is simulated; no live update occurs.

Run as root in a disposable container with the repository mounted read-only.
Exercises the actual daemon, non-root spool permissions, restart and archive path.
"""
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid


ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('update_host', ROOT / 'appliance/update_service.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


with tempfile.TemporaryDirectory(prefix='guided-update-smoke-') as temporary:
    base = Path(temporary)
    os.chmod(base, 0o755)
    app = base / 'app'; app.mkdir(); (app / 'appliance').mkdir()
    (app / '.env').write_text('ZTF_ORCHESTRATOR_VERSION=v1.8.5-rc1-before\n')
    (app / 'appliance/docker-compose.appliance.yml').write_text('services: {}')
    source = base / 'volume'; source.mkdir()
    (source / 'configs').mkdir(); (source / 'configs/example.yml').write_text('fixture: true')
    (source / 'bundles').mkdir(); (source / 'bundles/excluded.iso').write_bytes(b'excluded cache')
    control = base / 'control'; control.mkdir(mode=0o755)
    for name, mode in [('private', 0o700), ('requests', 0o2770), ('results', 0o2750)]:
        path = control / name; path.mkdir(); os.chown(path, 0, 1500); os.chmod(path, mode)
    image = 'ghcr.io/virtuarchitect/ztf-orchestrator:v1.8.5-rc1-after'
    package_id = str(uuid.uuid4())
    package = source / 'appliance-update-packages' / package_id
    package.mkdir(parents=True)
    artifact = package / 'image.tar'
    with tarfile.open(artifact, 'w') as archive:
        for name, content in [('manifest.json', [{'RepoTags': [image], 'Config': 'config.json', 'Layers': ['layer.tar']}]), ('config.json', {'config': {'Labels': {'io.ztf.appliance-update-protocol': '1'}}}), ('layer.tar', 'isolated layer fixture')]:
            data = json.dumps(content).encode(); member = tarfile.TarInfo(name); member.size = len(data)
            archive.addfile(member, io.BytesIO(data))
    payload = {'packageId': package_id, 'artifact': 'image.tar', 'image': image, 'version': image.split(':')[-1], 'checksum': module.digest(artifact)}
    bin_dir = base / 'bin'; bin_dir.mkdir()
    fake = bin_dir / 'docker'
    fake.write_text('''#!/usr/local/bin/python
import json, os, pathlib, sys
a=sys.argv[1:]; base=pathlib.Path(os.environ['SMOKE_ROOT']); app=base/'app'
version=next(v.split('=',1)[1] for v in (app/'.env').read_text().splitlines() if v.startswith('ZTF_ORCHESTRATOR_VERSION='))
image='ghcr.io/virtuarchitect/ztf-orchestrator:'+version
image_id='sha256:after' if version.endswith('after') else 'sha256:before'
if a[0]=='inspect': print(json.dumps([{'Image': image_id, 'Config': {'Image': image}, 'State': {'Health': {'Status': 'healthy'}}, 'Mounts': [{'Destination':'/var/lib/ztf-orchestrator','Type':'volume','Source': str(base/'volume')}]}]))
elif a[:2]==['image','inspect']: print(json.dumps([{'Id': 'sha256:after' if a[-1].endswith('after') else 'sha256:before'}]))
elif 'psql' in a: print('1000' if 'pg_database_size' in a[-1] else '[]')
elif 'pg_dump' in a: sys.stdout.buffer.write(b'fixture-only-database-archive')
elif 'pg_restore' in a:
 assert sys.stdin.buffer.read()==b'fixture-only-database-archive'
elif '--format' in a: print(json.dumps({'services': {'ztf-orchestrator': {'image': image}}}))
elif 'python' in a: print(json.dumps({'status':'healthy','storageBackend':'postgres','localMaintenance':False,'activeStreams':0,'installed':{'versionTag': version}}))
with (base/'calls.jsonl').open('a') as f: f.write(json.dumps(a)+'\\n')
''')
    fake.chmod(0o755)
    config = base / 'config.json'
    config.write_text(json.dumps({'appDir': str(app), 'controlDir': str(control)})); config.chmod(0o600)
    env = {**os.environ, 'PATH': str(bin_dir) + ':' + os.environ['PATH'], 'SMOKE_ROOT': str(base)}
    daemon = None

    def start():
        return subprocess.Popen([sys.executable, str(ROOT / 'appliance/update_service.py'), '--config', str(config)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

    def wait_for(predicate):
        for _ in range(150):
            if daemon.poll() is not None:
                raise AssertionError(daemon.stderr.read().decode())
            try:
                result = json.loads((control / 'results/status.json').read_text())
                if predicate(result): return result
            except (FileNotFoundError, ValueError): pass
            time.sleep(.1)
        raise AssertionError('Host protocol timed out')

    def submit(action, body):
        request_id = str(uuid.uuid4())
        code = '''import json,os,sys; sys.path.insert(0,sys.argv[1]); import appliance_updates as c; os.environ['ZTF_UPDATE_CONTROL_DIR']=sys.argv[2]; print(json.dumps(c.submit(sys.argv[3],json.loads(sys.argv[4]),'fixture-admin',sys.argv[5])))'''
        def unprivileged():
            os.setgroups([1500]); os.setgid(1500); os.setuid(1000)
        result = subprocess.run([sys.executable, '-c', code, str(ROOT), str(control), action, json.dumps(body), request_id], preexec_fn=unprivileged, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        state = wait_for(lambda v: (v.get('operation') or {}).get('id') == request_id and v['operation']['status'] in {'succeeded', 'failed'})
        assert state['operation']['status'] == 'succeeded', state
        return state

    try:
        daemon = start()
        wait_for(lambda v: v.get('heartbeat'))
        def unprivileged():
            os.setgroups([1500]); os.setgid(1500); os.setuid(1000)
        for protected in [control / 'results/status.json', control / 'private/state.json']:
            attempt = subprocess.run([sys.executable, '-c', 'import sys; open(sys.argv[1], "w").write("forbidden")', str(protected)], preexec_fn=unprivileged, capture_output=True)
            assert attempt.returncode != 0, 'Application principal can modify host-controlled state'
        state = submit('preflight', payload)
        assert state['operation']['plan']['ready']
        plan_id = state['operation']['plan']['id']
        state = submit('install', {'planId': plan_id, 'confirmation': 'INSTALL ' + payload['version']})
        assert state['operation']['verification']['image'] == image
        assert not state['maintenance']
        receipt = json.loads((app / 'update-artifacts/pre-update-backups' / state['rollback']['receipt']).read_text())
        with tarfile.open(app / 'update-artifacts/pre-update-backups' / receipt['data']['name']) as archive:
            assert 'configs/example.yml' in archive.getnames()
            assert '__appliance_host_backup__/.env' in archive.getnames()
            assert not any(n.startswith('bundles') for n in archive.getnames())
        # The daemon survives app requests and preserves completed reports on restart.
        daemon.terminate(); daemon.wait(timeout=10)
        calls = (base / 'calls.jsonl').read_text()
        daemon = start()
        wait_for(lambda v: v.get('operation', {}).get('id') == state['operation']['id'])
        time.sleep(.3)
        assert calls == (base / 'calls.jsonl').read_text(), 'Completed installation was replayed'
        link = source / 'symlink'; link.symlink_to('/etc/shadow')
        try: module.safe_child(source, 'symlink')
        except module.UpdateError: pass
        else: raise AssertionError('Symlink accepted')
        print('PASS: real Linux daemon, non-root request/results permissions, private state, simulated install, actual archives, restart/no replay and symlink rejection')
        print('Docker, pg_dump and pg_restore responses were simulated; no live appliance cutover or database restore was performed.')
    finally:
        if daemon and daemon.poll() is None:
            daemon.terminate(); daemon.wait(timeout=10)
