"""Isolated protocol, authorization and host-worker tests; no live cutovers."""
import io
import gzip
import json
import shutil
import tarfile
import time
import uuid
import zipfile
from pathlib import Path
from types import SimpleNamespace

import pytest

import appliance_updates as client_control
from appliance.update_service import Service, UpdateError, digest, safe_child, tree_size


OLD = 'ghcr.io/virtuarchitect/ztf-orchestrator:v1.8.5-rc1-old'
NEW = 'ghcr.io/virtuarchitect/ztf-orchestrator:v1.8.5-rc1-new'


class FakeHost(Service):
    """Docker responses are test doubles; archive/file operations are real."""
    def __init__(self, config, source):
        self.source = source
        self.current_image = OLD
        self.current_id = 'sha256:old'
        self.calls = []
        self.active = False
        self.fail_backup = False
        self.fail_verify = False
        super().__init__(config)

    def inspect(self):
        return {'Image': self.current_id, 'Config': {'Image': self.current_image},
                'State': {'Health': {'Status': 'healthy'}}}, self.source

    def output(self, args, timeout=120):
        self.calls.append(args)
        if 'pg_database_size(current_database())' in ' '.join(args):
            return '100'
        if 'coalesce(jsonb_agg' in ' '.join(args):
            return json.dumps([[{'status': 'running'}]] if self.active else [])
        if 'image' in args and 'inspect' in args:
            return json.dumps([{'Id': 'sha256:new' if args[-1] == NEW else 'sha256:old'}])
        if '--format' in args:
            version = next(v.split('=', 1)[1] for v in (self.app / '.env').read_text().splitlines() if v.startswith('ZTF_ORCHESTRATOR_VERSION='))
            return json.dumps({'services': {'ztf-orchestrator': {'image': 'ghcr.io/virtuarchitect/ztf-orchestrator:' + version}}})
        if 'python' in args:
            return json.dumps({'status': 'healthy', 'storageBackend': 'postgres', 'localMaintenance': False, 'activeStreams': 0, 'installed': {'versionTag': self.current_image.split(':')[-1]}})
        return ''

    def run(self, args, timeout=120, **kwargs):
        self.calls.append(args)
        if 'pg_dump' in args:
            if self.fail_backup:
                raise UpdateError('Backup failed')
            kwargs['stdout'].write(b'fixture-pg-dump')
        if 'pg_restore' in args:
            assert kwargs['stdin'].read() == b'fixture-pg-dump'
        if 'up' in args:
            version = next(v.split('=', 1)[1] for v in (self.app / '.env').read_text().splitlines() if v.startswith('ZTF_ORCHESTRATOR_VERSION='))
            self.current_image = 'ghcr.io/virtuarchitect/ztf-orchestrator:' + version
            self.current_id = 'sha256:new' if self.current_image == NEW else 'sha256:old'
        return SimpleNamespace(returncode=0, stdout='')

    def verify(self, image_id):
        if self.fail_verify:
            raise UpdateError('Readiness timed out')
        return super().verify(image_id)


@pytest.fixture
def host(tmp_path, monkeypatch):
    app = tmp_path / 'app'
    source = tmp_path / 'volume'
    app.mkdir()
    source.mkdir()
    (app / '.env').write_text('ZTF_ORCHESTRATOR_VERSION=v1.8.5-rc1-old\nSECRET=fixture-only\n')
    (app / 'appliance').mkdir()
    (app / 'appliance/docker-compose.appliance.yml').write_text('services: {}')
    (source / 'configs').mkdir()
    (source / 'configs/baseline.yml').write_text('fixture: true')
    for name in ['appliance-update-packages', 'bundles']:
        (source / name).mkdir()
    (source / 'bundles/preloaded.iso').write_bytes(b'cache-not-backed-up')
    monkeypatch.setattr('appliance.update_service.shutil.disk_usage', lambda _: shutil._ntuple_diskusage(10**13, 0, 10**13))
    monkeypatch.setattr('appliance.update_service.time.sleep', lambda _: None)
    return FakeHost({'appDir': str(app), 'controlDir': str(tmp_path / 'control')}, source)


def package(host, image=NEW):
    package_id = str(uuid.uuid4())
    root = host.source / 'appliance-update-packages' / package_id
    (root / 'images').mkdir(parents=True)
    path = root / 'images/image.tar'
    with tarfile.open(path, 'w') as tar:
        content = json.dumps([{'RepoTags': [image], 'Config': 'config.json', 'Layers': ['layer.tar']}]).encode()
        info = tarfile.TarInfo('manifest.json')
        info.size = len(content)
        tar.addfile(info, io.BytesIO(content))
        content = json.dumps({'config': {'Labels': {'io.ztf.appliance-update-protocol': '1'}}}).encode()
        info = tarfile.TarInfo('config.json'); info.size = len(content)
        tar.addfile(info, io.BytesIO(content))
        content = b'isolated layer fixture'; info = tarfile.TarInfo('layer.tar'); info.size = len(content)
        tar.addfile(info, io.BytesIO(content))
    (root / 'manifest.json').write_text(json.dumps({'target': 'ztf-orchestrator', 'version': image.split(':')[-1], 'containerImage': image}))
    return {'packageId': package_id, 'artifact': 'images/image.tar', 'image': image, 'version': image.split(':')[-1], 'checksum': digest(path)}


def operation(host, action, payload, request_id=None):
    host.process({'id': request_id or str(uuid.uuid4()), 'action': action, 'payload': payload, 'requestedBy': 'fixture-operator'})
    return host.state['operation']


def test_preflight_rechecks_archive_and_space_without_mutation(host, monkeypatch):
    payload = package(host)
    op = operation(host, 'preflight', payload)
    assert op['status'] == 'succeeded' and op['plan']['ready']
    assert not any('stop' in call or 'load' in call for call in host.calls)
    monkeypatch.setattr('appliance.update_service.shutil.disk_usage', lambda _: shutil._ntuple_diskusage(100, 99, 1))
    assert not operation(host, 'preflight', payload)['plan']['ready']


@pytest.mark.parametrize('change', ['checksum', 'tag', 'traversal', 'missing', 'symlink'])
def test_invalid_or_changed_artifacts_rejected(host, change):
    payload = package(host)
    if change == 'checksum': payload['checksum'] = '0' * 64
    if change == 'tag': payload['image'] = OLD; payload['version'] = OLD.split(':')[-1]
    if change == 'traversal': payload['artifact'] = '../../outside.tar'
    if change == 'missing': payload['artifact'] = 'missing.tar'
    if change == 'symlink':
        link = host.source / 'appliance-update-packages' / payload['packageId'] / 'link.tar'
        try: link.symlink_to('images/image.tar')
        except OSError: pytest.skip('Symlinks unavailable on this Windows account')
        payload['artifact'] = 'link.tar'
    assert operation(host, 'preflight', payload)['status'] == 'failed'


def test_active_jobs_block_readiness_and_install(host):
    payload = package(host)
    plan = operation(host, 'preflight', payload)['plan']
    host.active = True
    result = operation(host, 'install', {'planId': plan['id'], 'confirmation': 'INSTALL ' + payload['version']})
    assert result['status'] == 'failed' and not host.state['maintenance']
    assert not any('stop' in call for call in host.calls)


def test_install_verified_backup_cache_exclusions_and_replay(host):
    payload = package(host)
    plan = operation(host, 'preflight', payload)['plan']
    request_id = str(uuid.uuid4())
    result = operation(host, 'install', {'planId': plan['id'], 'confirmation': 'INSTALL ' + payload['version']}, request_id)
    assert result['status'] == 'succeeded'
    assert result['verification']['image'] == NEW
    assert not host.state['maintenance']
    receipt = json.loads((host.backups / host.state['rollback']['receipt']).read_text())
    with tarfile.open(host.backups / receipt['data']['name']) as archive:
        assert 'configs/baseline.yml' in archive.getnames()
        assert not any(name.startswith(('bundles', 'appliance-update-packages')) for name in archive.getnames())
    assert digest(host.backups / receipt['database']['name']) == receipt['database']['sha256']
    count = len(host.calls)
    operation(host, 'install', {'planId': plan['id'], 'confirmation': 'INSTALL ' + payload['version']}, request_id)
    assert len(host.calls) == count
    assert operation(host, 'install', {'planId': plan['id'], 'confirmation': 'INSTALL ' + payload['version']})['status'] == 'failed'


def test_failed_backup_restarts_original_without_loading_new_image(host):
    payload = package(host)
    plan = operation(host, 'preflight', payload)['plan']
    host.fail_backup = True
    assert operation(host, 'install', {'planId': plan['id'], 'confirmation': 'INSTALL ' + payload['version']})['status'] == 'failed'
    assert host.current_image == OLD and not host.state['maintenance']
    assert not any('load' in call for call in host.calls)


def test_post_cutover_failure_requires_explicit_compatible_rollback(host):
    payload = package(host)
    plan = operation(host, 'preflight', payload)['plan']
    host.fail_verify = True
    assert operation(host, 'install', {'planId': plan['id'], 'confirmation': 'INSTALL ' + payload['version']})['status'] == 'failed'
    assert host.state['maintenance']
    assert operation(host, 'rollback', {'confirmation': 'ROLLBACK v1.8.5-rc1-old'})['status'] == 'failed'
    assert host.state['maintenance']
    host.fail_verify = False
    result = operation(host, 'rollback', {'confirmation': 'ROLLBACK v1.8.5-rc1-old', 'databaseCompatible': True})
    assert result['status'] == 'succeeded' and host.current_image == OLD
    assert not host.state['maintenance']


def test_cleanup_protects_selected_running_unknown_and_latest_backup(host):
    payload = package(host)
    running = package(host, OLD)
    old = package(host, 'ghcr.io/virtuarchitect/ztf-orchestrator:v1.8.4-obsolete')
    unknown = host.source / 'appliance-update-packages' / str(uuid.uuid4())
    unknown.mkdir()
    first = host.backup(host.source, 'v1.8.4')
    time.sleep(.01)
    second = host.backup(host.source, 'v1.8.5-rc1')
    entries = host.cleanup_candidates(payload, host.source, host.inspect()[0])
    ids = {entry['id'] for entry in entries}
    assert 'package:' + old['packageId'] in ids
    assert all('package:' + pid not in ids for pid in (payload['packageId'], running['packageId'], unknown.name))
    assert 'backup:' + Path(second).stem not in ids
    plan = operation(host, 'preflight', payload)['plan']
    result = operation(host, 'cleanup', {'planId': plan['id'], 'selected': ['package:' + old['packageId']]})
    assert result['status'] == 'succeeded'
    assert not (host.source / 'appliance-update-packages' / old['packageId']).exists()
    assert (host.backups / first).exists()


def test_cleanup_rejects_protected_selection_and_changed_plan(host):
    payload = package(host)
    plan = operation(host, 'preflight', payload)['plan']
    assert operation(host, 'cleanup', {'planId': plan['id'], 'selected': ['package:' + payload['packageId']]})['status'] == 'failed'
    host.current_id = 'sha256:changed'
    assert operation(host, 'install', {'planId': plan['id'], 'confirmation': 'INSTALL ' + payload['version']})['status'] == 'failed'


def test_expired_plan_and_wrong_approval_block(host):
    payload = package(host)
    plan = operation(host, 'preflight', payload)['plan']
    assert operation(host, 'install', {'planId': plan['id'], 'confirmation': 'INSTALL other'})['status'] == 'failed'
    path = host.private / ('plan-' + plan['id'] + '.json')
    private = json.loads(path.read_text()); private['createdAt'] -= 901; path.write_text(json.dumps(private))
    assert operation(host, 'install', {'planId': plan['id'], 'confirmation': 'INSTALL ' + payload['version']})['status'] == 'failed'


def test_worker_restart_keeps_interrupted_cutover_locked(host):
    host.state.update(maintenance=True, operation={'id': str(uuid.uuid4()), 'status': 'running', 'action': 'install'})
    host.save()
    restarted = FakeHost({'appDir': str(host.app), 'controlDir': str(host.root)}, host.source)
    assert restarted.state['operation']['status'] == 'interrupted'
    assert restarted.state['maintenance']


def prepare_control(tmp_path, monkeypatch):
    root = tmp_path / 'spool'
    (root / 'results').mkdir(parents=True)
    (root / 'requests').mkdir()
    monkeypatch.setenv('ZTF_UPDATE_CONTROL_DIR', str(root))
    (root / 'results/status.json').write_text(json.dumps({'heartbeat': time.time(), 'operation': None, 'maintenance': False}))
    return root


def test_client_single_slot_atomic_publish_and_pending_status(tmp_path, monkeypatch):
    root = prepare_control(tmp_path, monkeypatch)
    request_id = str(uuid.uuid4())
    assert client_control.submit('preflight', {}, 'fixture', request_id)['status'] == 'queued'
    assert client_control.status()['operation']['id'] == request_id
    with pytest.raises(ValueError):
        client_control.submit('preflight', {}, 'fixture', str(uuid.uuid4()))
    assert json.loads((root / 'requests/request.json').read_text())['id'] == request_id


def test_offline_host_does_not_unlock_interrupted_update(tmp_path, monkeypatch):
    root = prepare_control(tmp_path, monkeypatch)
    (root / 'results/status.json').write_text(json.dumps({'heartbeat': 1, 'maintenance': True}))
    assert not client_control.status()['available']
    assert client_control.maintenance()
    with pytest.raises(ValueError): client_control.submit('install', {}, 'fixture', str(uuid.uuid4()))


def test_control_api_admin_only_and_maintenance_gate(client, auth_headers, tmp_path, monkeypatch):
    root = prepare_control(tmp_path, monkeypatch)
    assert client.get('/api/appliance/updates/control').status_code == 401
    assert client.get('/api/appliance/updates/control', headers=auth_headers).status_code == 200
    assert client.post('/api/appliance/updates/control', headers=auth_headers, json={'action': 'arbitrary-shell'}).status_code == 400
    client.post('/api/users', headers=auth_headers, json={'username': 'fixture-viewer', 'password': 'FixtureViewer!1234', 'role': 'viewer'})
    token = client.post('/api/auth/login', json={'username': 'fixture-viewer', 'password': 'FixtureViewer!1234'}).get_json()['token']
    assert client.get('/api/appliance/updates/control', headers={'Authorization': 'Bearer ' + token}).status_code == 403
    (root / 'results/status.json').write_text(json.dumps({'heartbeat': time.time(), 'maintenance': True}))
    assert client.post('/api/appliance/updates/import', headers=auth_headers, json={}).status_code == 503
    assert client.get('/api/appliance/updates', headers=auth_headers).status_code == 200


def test_control_api_uses_server_record_not_client_host_paths(client, auth_headers, tmp_path, monkeypatch):
    import server
    root = prepare_control(tmp_path, monkeypatch)
    package_id = str(uuid.uuid4())
    server._save_appliance_updates([{'id': 'fixture-update', 'packageId': package_id, 'target': 'ztf-orchestrator', 'version': 'v1.8.5-rc1-new', 'containerImage': NEW, 'checksum': 'a' * 64, 'imageTarPath': str(server.APPLIANCE_UPDATE_PACKAGES_DIR / package_id / 'images/image.tar')}])
    result = client.post('/api/appliance/updates/control', headers=auth_headers, json={'action': 'preflight', 'requestId': str(uuid.uuid4()), 'updateId': 'fixture-update', 'artifact': '/etc/shadow', 'image': 'evil:latest'})
    assert result.status_code == 202
    payload = json.loads((root / 'requests/request.json').read_text())['payload']
    assert payload['artifact'] == 'images/image.tar' and payload['image'] == NEW


def test_malformed_existing_status_fails_closed(tmp_path, monkeypatch):
    root = prepare_control(tmp_path, monkeypatch)
    (root / 'results/status.json').write_text('broken')
    assert client_control.maintenance()
    assert not client_control.status()['available']


def test_install_rechecks_disk_space_and_artifact_after_approval(host, monkeypatch):
    payload = package(host)
    plan = operation(host, 'preflight', payload)['plan']
    (host.source / 'appliance-update-packages' / payload['packageId'] / payload['artifact']).write_bytes(b'changed')
    assert operation(host, 'install', {'planId': plan['id'], 'confirmation': 'INSTALL ' + payload['version']})['status'] == 'failed'
    assert not any('stop' in call for call in host.calls)


def test_legacy_and_protected_rollback_packages_are_not_deleted(host):
    payload = package(host)
    old = package(host, 'ghcr.io/virtuarchitect/ztf-orchestrator:v1.8.4')
    root = host.source / 'appliance-update-packages' / old['packageId']
    content = (root / 'manifest.json').read_text()
    (root / 'manifest.json').unlink()
    with zipfile.ZipFile(root / 'imported.zip', 'w') as archive:
        archive.writestr('manifest.json', content)
    ids = {item['id'] for item in host.cleanup_candidates(payload, host.source, host.inspect()[0])}
    assert 'package:' + old['packageId'] in ids
    host.state['rollback'] = {'image': old['image']}
    assert not host.cleanup_candidates(payload, host.source, host.inspect()[0])


def test_backup_verification_detects_same_size_corruption(host):
    name = host.backup(host.source, 'v1.8.4')
    receipt = json.loads((host.backups / name).read_text())
    data = host.backups / receipt['data']['name']
    content = data.read_bytes()
    data.write_bytes(bytes([content[0] ^ 1]) + content[1:])
    assert host.backup_pairs() == []


def test_restart_before_new_image_starts_restores_old_application(host):
    host.state.update(maintenance=True, targetStarted=False, rollback={'image': OLD, 'imageId': 'sha256:old', 'version': 'v1.8.5-rc1-old'}, operation={'id': str(uuid.uuid4()), 'status': 'running', 'action': 'install'})
    host.save()
    restarted = FakeHost({'appDir': str(host.app), 'controlDir': str(host.root)}, host.source)
    assert restarted.state['operation']['status'] == 'interrupted'
    assert not restarted.state['maintenance']
    assert any('up' in args for args in restarted.calls)


def test_storage_review_allows_cleanup_before_upload_but_cannot_install(host):
    old = package(host, 'ghcr.io/virtuarchitect/ztf-orchestrator:v1.8.4-obsolete')
    plan = operation(host, 'storage', {})['plan']
    assert plan['purpose'] == 'storage'
    assert any(item['id'] == 'package:' + old['packageId'] for item in plan['cleanup'])
    assert operation(host, 'install', {'planId': plan['id'], 'confirmation': 'INSTALL '})['status'] == 'failed'
    assert operation(host, 'cleanup', {'planId': plan['id'], 'selected': ['package:' + old['packageId']]})['status'] == 'succeeded'


def test_old_image_without_protocol_label_is_rejected(host):
    payload = package(host)
    path = host.source / 'appliance-update-packages' / payload['packageId'] / payload['artifact']
    with tarfile.open(path, 'w') as archive:
        for name, content in [('manifest.json', [{'RepoTags': [NEW], 'Config': 'config.json'}]), ('config.json', {'config': {'Labels': {}}})]:
            body = json.dumps(content).encode(); info = tarfile.TarInfo(name); info.size = len(body); archive.addfile(info, io.BytesIO(body))
    payload['checksum'] = digest(path)
    result = operation(host, 'preflight', payload)
    assert result['status'] == 'failed' and 'predates guided updates' in result['message']


def test_streamed_automation_blocks_updates_until_closed(client, auth_headers, tmp_path, monkeypatch):
    import server
    root = prepare_control(tmp_path, monkeypatch)
    def work():
        yield 'fixture event'
        yield 'fixture next event'
    stream = server._tracked_update_stream(work(), 'fixture-pipeline')
    assert next(stream) == 'fixture event'
    assert client.get('/health').get_json()['activeStreams'] == 1
    response = client.post('/api/appliance/updates/control', headers=auth_headers, json={'action': 'preflight', 'requestId': str(uuid.uuid4())})
    assert response.status_code == 409
    assert not (root / 'requests/request.json').exists()
    stream.close()
    assert client.get('/health').get_json()['activeStreams'] == 0


def test_stream_cannot_start_after_update_maintenance(client, tmp_path, monkeypatch):
    import server
    root = prepare_control(tmp_path, monkeypatch)
    (root / 'results/status.json').write_text(json.dumps({'heartbeat': time.time(), 'maintenance': True}))
    called = []
    def work():
        called.append(True)
        yield 'should not start'
    result = list(server._tracked_update_stream(work(), 'late-pipeline'))
    assert not called and 'no automation was started' in result[0]


def test_payload_status_is_not_a_running_job(host, monkeypatch):
    original = host.output
    def output(args, timeout=120):
        if 'coalesce(jsonb_agg' in ' '.join(args):
            return json.dumps([[{'status': 'success', 'payload': {'status': 'running'}}]])
        return original(args, timeout)
    monkeypatch.setattr(host, 'output', output)
    assert not host.active_jobs()


def test_failed_old_image_restart_keeps_maintenance_locked(host, monkeypatch):
    payload = package(host)
    plan = operation(host, 'preflight', payload)['plan']
    host.fail_backup = True
    def cannot_restore(_previous):
        raise UpdateError('Old image could not be started')
    monkeypatch.setattr(host, 'restore_image', cannot_restore)
    result = operation(host, 'install', {'planId': plan['id'], 'confirmation': 'INSTALL ' + payload['version']})
    assert result['status'] == 'failed' and host.state['maintenance']
    assert not list(host.backups.glob('*.dump'))


def test_real_pipeline_route_is_visible_to_update_readiness(client, auth_headers, tmp_path, monkeypatch):
    import server
    prepare_control(tmp_path, monkeypatch)
    monkeypatch.setattr(server, '_ztf_incompatible_error', lambda _path: None)
    monkeypatch.setattr(server, '_approval_automation_error', lambda _action: None)
    server._save_pipelines([{'id': 'fixture-inline', 'name': 'Isolated fixture', 'steps': [{'workflow': 'config-cluster', 'configFile': ''}]}])
    response = client.post('/api/pipelines/fixture-inline/run', headers=auth_headers, json={}, buffered=False)
    assert response.status_code == 200
    assert server._update_stream_count() == 1
    blocked = client.post('/api/appliance/updates/control', headers=auth_headers, json={'action': 'preflight', 'requestId': str(uuid.uuid4())})
    assert blocked.status_code == 409
    response.close()  # Close before the fixture can launch a subprocess.
    assert server._update_stream_count() == 0


def test_compressed_layer_expansion_is_measured_before_disk_approval(host):
    payload = package(host)
    path = host.source / 'appliance-update-packages' / payload['packageId'] / payload['artifact']
    entries = [('manifest.json', json.dumps([{'RepoTags': [NEW], 'Config': 'config.json', 'Layers': ['layer.gz']}]).encode()),
               ('config.json', json.dumps({'config': {'Labels': {'io.ztf.appliance-update-protocol': '1'}}}).encode()),
               ('layer.gz', gzip.compress(b'0' * 1024**2))]
    with tarfile.open(path, 'w') as archive:
        for name, content in entries:
            member = tarfile.TarInfo(name); member.size = len(content); archive.addfile(member, io.BytesIO(content))
    payload['checksum'] = digest(path)
    _path, expanded = host.artifact(payload, host.source)
    assert expanded > 1024**2 and expanded > path.stat().st_size * 10


def test_host_compose_migration_preserves_tls_volumes_ports_and_literal_values():
    import importlib.util
    script = Path(__file__).resolve().parents[1] / 'appliance/scripts/configure-update-service.py'
    spec = importlib.util.spec_from_file_location('host_compose_configuration', script)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    original = {'name': 'fixture-project', 'services': {
        'ztf-orchestrator': {'image': OLD, 'environment': {'CUSTOM_SETTING': 'fixture-$value', 'ZTF_BUILD_COMMIT': 'old-metadata'},
            'volumes': [{'type': 'volume', 'source': 'existing-data', 'target': '/var/lib/ztf-orchestrator'}, {'type': 'bind', 'source': '/trusted/fixture-ca.pem', 'target': '/certificates/ca.pem', 'read_only': True}],
            'ports': [{'target': 5001, 'published': '5001'}]}, 'postgres': {'image': 'postgres:16-alpine'}},
        'volumes': {'existing-data': {'name': 'existing-project-data'}}}
    result = module.configuration(original, 1500)
    app = result['services']['ztf-orchestrator']
    assert original['services']['ztf-orchestrator']['image'] == OLD
    assert app['volumes'][:2] == original['services']['ztf-orchestrator']['volumes']
    assert app['ports'] == original['services']['ztf-orchestrator']['ports']
    assert result['volumes'] == original['volumes'] and result['services']['postgres'] == original['services']['postgres']
    assert app['environment']['CUSTOM_SETTING'] == 'fixture-$$value'
    assert 'ZTF_BUILD_COMMIT' not in app['environment']
    assert '${ZTF_ORCHESTRATOR_VERSION}' in app['image']
    assert app['group_add'] == ['1500']
    assert next(v for v in app['volumes'] if v.get('target') == '/run/ztf-update-control/results')['read_only']


def test_host_compose_migration_rejects_conflicting_or_privileged_mounts():
    import importlib.util
    spec = importlib.util.spec_from_file_location('host_configuration', Path(__file__).resolve().parents[1] / 'appliance/scripts/configure-update-service.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    for options in ({'privileged': True}, {'volumes': [{'type': 'bind', 'source': '/unexpected', 'target': '/run/ztf-update-control/results'}]}):
        with pytest.raises(ValueError): module.configuration({'services': {'ztf-orchestrator': options}}, 1500)


def test_host_kit_import_extracts_verified_files_without_running_installer(client, auth_headers, tmp_path):
    import importlib.util
    script = Path(__file__).resolve().parents[1] / 'scripts/build_offline_update_package.py'
    spec = importlib.util.spec_from_file_location('host_package_builder', script)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    image = tmp_path / 'example-image.tar'; image.write_bytes(b'isolated fixture archive')
    output = tmp_path / 'with-host-kit.zip'
    module.create_package(image_tar=image, version='v1.8.5-rc1-fixture', output_zip=output, include_host_service=True)
    response = client.post('/api/appliance/updates/import-package', headers=auth_headers,
                           data={'package': (io.BytesIO(output.read_bytes()), output.name)}, content_type='multipart/form-data')
    assert response.status_code == 201
    record = response.get_json()
    assert record['checksum'] == digest(image)
    files = {item['relativePath']: item for item in record['packageArtifacts']}
    installer = files['host-service/bootstrap-guided-updates.sh']
    assert digest(Path(installer['path'])) == installer['sha256']
    # Importing artifacts records no host command or execution approval.
    import server
    assert server._job_manager._load_jobs() == []
