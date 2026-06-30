"""Tests for API endpoint availability, RBAC, and config CRUD."""

import io
import hashlib
import json
import socket
import zipfile
from pathlib import Path
import pytest


# ── RBAC ─────────────────────────────────────────────────────────────────────

def _create_user(client, auth_headers, username, role):
    resp = client.post('/api/users',
                       json={'username': username, 'password': 'Pass123!', 'role': role},
                       headers=auth_headers)
    assert resp.status_code == 201


def _login(client, username):
    resp = client.post('/api/auth/login',
                       json={'username': username, 'password': 'Pass123!'})
    assert resp.status_code == 200
    return {'Authorization': 'Bearer ' + resp.get_json()['token']}


def _wait_for_job(client, auth_headers, job_id, terminal_statuses=None, attempts=60, delay=0.1):
    import time

    terminal_statuses = terminal_statuses or {'success', 'failed', 'cancelled', 'interrupted'}
    job = None
    for _ in range(attempts):
        job = client.get(f'/api/jobs/{job_id}', headers=auth_headers).get_json()
        if job['status'] in terminal_statuses:
            return job
        time.sleep(delay)
    return job


def _build_update_package(manifest, files):
    package = io.BytesIO()
    with zipfile.ZipFile(package, 'w') as archive:
        archive.writestr('manifest.json', json.dumps(manifest))
        for name, content in files.items():
            archive.writestr(name, content)
    package.seek(0)
    return package


def test_viewer_cannot_execute(client, auth_headers):
    _create_user(client, auth_headers, 'viewer1', 'viewer')
    viewer_headers = _login(client, 'viewer1')
    resp = client.post('/api/execute',
                       json={'workflow': 'cluster-create'},
                       headers=viewer_headers)
    assert resp.status_code == 403


def test_viewer_can_read_configs(client, auth_headers):
    _create_user(client, auth_headers, 'viewer2', 'viewer')
    viewer_headers = _login(client, 'viewer2')
    resp = client.get('/api/configs', headers=viewer_headers)
    assert resp.status_code == 200


def test_appliance_artifact_archive_crud(client, auth_headers):
    payload = {
        'profile': 'airgap',
        'version': 'v1.3.1',
        'artifactName': 'ztf-orchestrator-ahv-qcow2-airgap-v1.3.1.zip',
        'archiveLocation': 'Nutanix Files release share',
        'checksum': 'a' * 64,
        'checksumFile': 'SHA256SUMS-airgap-v1.3.1.txt',
        'expiresAt': '2026-09-18T14:22:19Z',
        'sizeBytes': 1523522046,
    }
    resp = client.post('/api/appliance/artifacts', json=payload, headers=auth_headers)
    assert resp.status_code == 201
    record = resp.get_json()
    assert record['profile'] == 'airgap'
    assert record['status'] in {'archived', 'expiring'}

    resp = client.post(f"/api/appliance/artifacts/{record['id']}/verify",
                       json={}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'verified'

    resp = client.get('/api/appliance/artifacts', headers=auth_headers)
    body = resp.get_json()
    assert body['summary']['total'] == 1
    assert body['summary']['verified'] == 1

    resp = client.delete(f"/api/appliance/artifacts/{record['id']}", headers=auth_headers)
    assert resp.status_code == 200


def test_appliance_artifact_verify_accepts_empty_post_body(client, auth_headers):
    resp = client.post('/api/appliance/artifacts',
                       json={'profile': 'airgap', 'version': 'v1.5.0'},
                       headers=auth_headers)
    assert resp.status_code == 201
    record = resp.get_json()

    resp = client.post(f"/api/appliance/artifacts/{record['id']}/verify",
                       headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'verified'


def test_appliance_artifact_rejects_bad_checksum(client, auth_headers):
    resp = client.post('/api/appliance/artifacts',
                       json={'profile': 'standard', 'version': 'v1.3.1', 'checksum': 'not-a-sha'},
                       headers=auth_headers)
    assert resp.status_code == 400


def test_appliance_status_and_ztf_compatibility(client, auth_headers):
    resp = client.get('/api/appliance/status', headers=auth_headers)
    assert resp.status_code == 200
    assert 'checks' in resp.get_json()

    resp = client.get('/api/ztf/compatibility', headers=auth_headers)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['layout'] == 'legacy-1.x'
    assert any(mode['id'] == 'ztf2-iac' for mode in body['supportedModes'])


def test_appliance_update_import_verify_stage_and_delete(client, auth_headers):
    import server

    manifest = {
        'target': 'ztf-orchestrator',
        'version': 'v1.4.1',
        'repository': 'VirtuArchitect/ZTF-Orchestrator',
        'containerImage': 'ghcr.io/virtuarchitect/ztf-orchestrator:v1.4.1',
        'sourceRef': 'v1.4.1',
        'releaseUrl': 'https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/tag/v1.4.1',
        'checksum': 'b' * 64,
    }
    resp = client.post('/api/appliance/updates/import',
                       json={'manifest': manifest},
                       headers=auth_headers)
    assert resp.status_code == 201
    record = resp.get_json()
    assert record['version'] == 'v1.4.1'
    assert record['status'] == 'imported'
    assert len(record['manifestSha256']) == 64

    resp = client.post(f"/api/appliance/updates/{record['id']}/stage",
                       headers=auth_headers)
    assert resp.status_code == 400

    resp = client.post(f"/api/appliance/updates/{record['id']}/verify",
                       headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'verified'

    resp = client.post(f"/api/appliance/updates/{record['id']}/stage",
                       headers=auth_headers)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['update']['status'] == 'staged'
    assert body['request']['type'] == 'ztf-orchestrator-container-update'
    assert body['request']['target'] == 'ztf-orchestrator'
    assert body['request']['version'] == 'v1.4.1'
    assert server.APPLIANCE_UPDATE_REQUEST_FILE.exists()

    resp = client.post(f"/api/appliance/updates/{record['id']}/applied",
                       headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'applied'

    resp = client.get('/api/appliance/updates', headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()['updates'][0]['version'] == 'v1.4.1'
    assert any(target['id'] == 'ztf-framework' for target in resp.get_json()['targets'])

    resp = client.delete(f"/api/appliance/updates/{record['id']}", headers=auth_headers)
    assert resp.status_code == 200


def test_appliance_update_package_import_verify_and_stage(client, auth_headers):
    import server

    image_bytes = b'fake docker image tar bytes'
    image_sha = hashlib.sha256(image_bytes).hexdigest()
    manifest = {
        'target': 'ztf-orchestrator',
        'version': 'v1.5.0',
        'repository': 'VirtuArchitect/ZTF-Orchestrator',
        'containerImage': 'ghcr.io/virtuarchitect/ztf-orchestrator:v1.5.0',
        'sourceRef': 'v1.5.0',
        'artifacts': [{
            'type': 'container-image',
            'name': 'ztf-orchestrator image',
            'path': 'images/ztf-orchestrator-v1.5.0.tar',
            'sha256': image_sha,
        }],
    }
    package = _build_update_package(manifest, {'images/ztf-orchestrator-v1.5.0.tar': image_bytes})

    resp = client.post('/api/appliance/updates/import-package',
                       data={'package': (package, 'ztf-update-v1.5.0.zip')},
                       content_type='multipart/form-data',
                       headers=auth_headers)
    assert resp.status_code == 201
    record = resp.get_json()
    assert record['status'] == 'imported'
    assert record['version'] == 'v1.5.0'
    assert record['checksum'] == image_sha
    assert Path(record['imageTarPath']).is_file()
    assert record['packageArtifacts'][0]['relativePath'] == 'images/ztf-orchestrator-v1.5.0.tar'

    resp = client.post(f"/api/appliance/updates/{record['id']}/verify",
                       headers=auth_headers)
    assert resp.status_code == 200
    resp = client.post(f"/api/appliance/updates/{record['id']}/stage",
                       headers=auth_headers)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['request']['imageTarPath'] == record['imageTarPath']
    assert body['request']['checksum'] == image_sha
    assert body['request']['packageArtifacts'][0]['sha256'] == image_sha
    assert server.APPLIANCE_UPDATE_REQUEST_FILE.exists()


def test_appliance_update_package_rejects_bad_checksum(client, auth_headers):
    manifest = {
        'target': 'ztf-orchestrator',
        'version': 'v1.5.0',
        'repository': 'VirtuArchitect/ZTF-Orchestrator',
        'containerImage': 'ghcr.io/virtuarchitect/ztf-orchestrator:v1.5.0',
        'sourceRef': 'v1.5.0',
        'artifacts': [{
            'type': 'container-image',
            'path': 'images/ztf-orchestrator-v1.5.0.tar',
            'sha256': '0' * 64,
        }],
    }
    package = _build_update_package(manifest, {'images/ztf-orchestrator-v1.5.0.tar': b'not matching'})
    resp = client.post('/api/appliance/updates/import-package',
                       data={'package': (package, 'ztf-update-v1.5.0.zip')},
                       content_type='multipart/form-data',
                       headers=auth_headers)
    assert resp.status_code == 400
    assert 'checksum mismatch' in resp.get_json()['error']


def test_appliance_update_package_rejects_traversal_artifact(client, auth_headers):
    payload = b'archive'
    manifest = {
        'target': 'ztf-framework',
        'version': 'v1.5.2',
        'repository': 'nutanixdev/zerotouch-framework',
        'targetPath': '/opt/zerotouch-framework',
        'sourceRef': 'v1.5.2',
        'artifacts': [{
            'type': 'framework-archive',
            'path': '../ztf-framework.tar.gz',
            'sha256': hashlib.sha256(payload).hexdigest(),
        }],
    }
    package = _build_update_package(manifest, {'ztf-framework.tar.gz': payload})
    resp = client.post('/api/appliance/updates/import-package',
                       data={'package': (package, 'ztf-update-v1.5.2.zip')},
                       content_type='multipart/form-data',
                       headers=auth_headers)
    assert resp.status_code == 400
    assert 'without traversal' in resp.get_json()['error']


def test_appliance_update_rejects_unapproved_container_image(client, auth_headers):
    resp = client.post('/api/appliance/updates/import',
                       json={'manifest': {
                           'version': 'v1.4.1',
                           'repository': 'VirtuArchitect/ZTF-Orchestrator',
                           'containerImage': 'example.com/evil/app:v1.4.1',
                       }},
                       headers=auth_headers)
    assert resp.status_code == 400
    assert 'approved ZTF-Orchestrator image namespace' in resp.get_json()['error']


def test_framework_update_import_verify_and_stage(client, auth_headers):
    manifest = {
        'target': 'ztf-framework',
        'version': 'v1.5.2',
        'repository': 'nutanixdev/zerotouch-framework',
        'targetPath': '/opt/zerotouch-framework',
        'sourceRef': 'v1.5.2',
        'releaseUrl': 'https://github.com/nutanixdev/zerotouch-framework/releases/tag/v1.5.2',
        'checksum': 'c' * 64,
    }
    resp = client.post('/api/appliance/updates/import',
                       json={'manifest': manifest},
                       headers=auth_headers)
    assert resp.status_code == 201
    record = resp.get_json()
    assert record['target'] == 'ztf-framework'
    assert record['containerImage'] == ''
    assert record['targetPath'] == '/opt/zerotouch-framework'

    resp = client.post(f"/api/appliance/updates/{record['id']}/verify",
                       headers=auth_headers)
    assert resp.status_code == 200
    resp = client.post(f"/api/appliance/updates/{record['id']}/stage",
                       headers=auth_headers)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['request']['type'] == 'ztf-framework-source-update'
    assert body['request']['targetPath'] == '/opt/zerotouch-framework'
    assert body['request']['sourceRef'] == 'v1.5.2'


def test_nkp_framework_update_accepts_safe_source_checkout_metadata(client, auth_headers):
    resp = client.post('/api/appliance/updates/import',
                       json={'manifest': {
                           'target': 'nkp-framework',
                           'version': 'v2.17.1',
                           'repository': 'VirtuArchitect/nkp-zerotouch-framework',
                           'targetPath': '/var/lib/ztf-orchestrator/nkp-zerotouch-framework',
                           'sourceRef': 'release/v2.17.1',
                       }},
                       headers=auth_headers)
    assert resp.status_code == 201
    record = resp.get_json()
    assert record['target'] == 'nkp-framework'
    assert record['targetLabel'] == 'NKP Framework'

    resp = client.post('/api/appliance/updates/import',
                       json={'manifest': {
                           'target': 'nkp-framework',
                           'version': 'v2.17.1',
                           'repository': 'VirtuArchitect/nkp-zerotouch-framework',
                           'targetPath': 'relative/nkp-zerotouch-framework',
                       }},
                       headers=auth_headers)
    assert resp.status_code == 400
    assert 'absolute appliance host path' in resp.get_json()['error']


def test_framework_update_rejects_container_image_and_unsafe_ref(client, auth_headers):
    resp = client.post('/api/appliance/updates/import',
                       json={'manifest': {
                           'target': 'ztf-framework',
                           'version': 'v1.5.2',
                           'repository': 'nutanixdev/zerotouch-framework',
                           'targetPath': '/opt/zerotouch-framework',
                           'containerImage': 'ghcr.io/virtuarchitect/ztf-orchestrator:v1.5.2',
                       }},
                       headers=auth_headers)
    assert resp.status_code == 400
    assert 'containerImage is only valid' in resp.get_json()['error']

    resp = client.post('/api/appliance/updates/import',
                       json={'manifest': {
                           'target': 'ztf-framework',
                           'version': 'v1.5.2',
                           'repository': 'nutanixdev/zerotouch-framework',
                           'targetPath': '/opt/zerotouch-framework',
                           'sourceRef': '../main',
                       }},
                       headers=auth_headers)
    assert resp.status_code == 400
    assert 'sourceRef must be a safe git ref' in resp.get_json()['error']


def test_operator_cannot_stage_appliance_update(client, auth_headers):
    _create_user(client, auth_headers, 'op_update', 'operator')
    operator_headers = _login(client, 'op_update')
    resp = client.post('/api/appliance/updates/import',
                       json={'manifest': {
                           'version': 'v1.4.1',
                           'repository': 'VirtuArchitect/ZTF-Orchestrator',
                           'containerImage': 'ghcr.io/virtuarchitect/ztf-orchestrator:v1.4.1',
                       }},
                       headers=operator_headers)
    assert resp.status_code == 201
    record = resp.get_json()
    resp = client.post(f"/api/appliance/updates/{record['id']}/verify",
                       headers=operator_headers)
    assert resp.status_code == 200
    resp = client.post(f"/api/appliance/updates/{record['id']}/stage",
                       headers=operator_headers)
    assert resp.status_code == 403


def test_viewer_cannot_write_config(client, auth_headers):
    _create_user(client, auth_headers, 'viewer3', 'viewer')
    viewer_headers = _login(client, 'viewer3')
    resp = client.post('/api/configs/test.yml',
                       json={'content': 'key: val'},
                       headers=viewer_headers)
    assert resp.status_code == 403


def test_operator_can_write_config(client, auth_headers):
    _create_user(client, auth_headers, 'op1', 'operator')
    op_headers = _login(client, 'op1')
    resp = client.post('/api/configs/test.yml',
                       json={'content': 'key: val\n'},
                       headers=op_headers)
    assert resp.status_code == 200


def test_operator_cannot_change_settings(client, auth_headers):
    _create_user(client, auth_headers, 'op2', 'operator')
    op_headers = _login(client, 'op2')
    resp = client.post('/api/settings',
                       json={'ztfPath': '/tmp/evil'},
                       headers=op_headers)
    assert resp.status_code == 403


def test_settings_persist_connection_profiles(client, auth_headers):
    profile = {
        'id': 'prod',
        'name': 'Production',
        'environment': 'production',
        'prismCentral': {
            'endpoint': 'pc.prod.example.com',
            'credentialRef': 'pc_user',
            'remoteCredentialRef': 'remote_pc_credentials',
            'defaultPcVersion': 'pc.2024.1',
            'enableObjects': True,
            'enableNke': False,
            'enableFlow': True,
            'enableNetworkController': True,
        },
        'foundationCentral': {
            'endpoint': 'pc.prod.example.com',
            'credentialRef': 'pc_user',
            'apiKeyRef': 'foundation_api_key',
            'aosUrl': 'https://repo/aos.tar.gz',
            'hypervisorType': 'kvm',
            'hypervisorUrl': 'https://repo/ahv.iso',
            'foundationVersion': '5.6.0.1',
        },
        'prismElement': {
            'defaultClusterVip': '10.0.0.10',
            'peCredentialRef': 'pe_user',
            'cvmCredentialRef': 'cvm_credential',
            'storageContainer': 'SelfServiceContainer',
            'networkName': 'MGMTVLAN0',
        },
        'ncm': {
            'endpoint': 'pc.prod.example.com',
            'credentialRef': 'ncm_user',
            'projectName': 'Production',
            'accountName': 'NTNX_LOCAL_AZ',
        },
        'directory': {
            'domain': 'prod.example.com',
            'ldapUrl': 'ldap://10.0.0.20:389',
            'serviceAccountCredentialRef': 'service_account_credential',
            'defaultGroups': 'Nutanix Admins',
        },
        'ipam': {
            'method': 'infoblox',
            'infobloxHost': 'infoblox.prod.example.com',
            'credentialRef': 'infoblox_user',
            'dnsView': 'Internal',
            'networkView': 'default',
        },
        'defaults': {
            'dnsServers': '10.0.0.20, 10.0.0.21',
            'ntpServers': '10.0.0.30',
            'timezone': 'Europe/London',
            'siteCode': 'prod-uk',
        },
    }
    resp = client.post('/api/settings',
                       json={'activeProfileId': 'prod', 'connectionProfiles': [profile]},
                       headers=auth_headers)
    assert resp.status_code == 200

    resp = client.get('/api/settings', headers=auth_headers)
    body = resp.get_json()
    assert body['activeProfileId'] == 'prod'
    assert body['connectionProfiles'][0]['prismCentral']['endpoint'] == 'pc.prod.example.com'
    assert body['connectionProfiles'][0]['ipam']['method'] == 'infoblox'


def test_connection_profile_test_reachable(client, auth_headers, monkeypatch):
    import server

    calls = []

    def fake_tcp_check(host, port, timeout=5.0):
        calls.append((host, port, timeout))
        return True, 12.34

    monkeypatch.setattr(server, '_tcp_check', fake_tcp_check)
    resp = client.post('/api/settings/test-connection',
                       json={
                           'target': 'ncm',
                           'profile': {'ncm': {'endpoint': 'https://pc.example.com:9441'}},
                       },
                       headers=auth_headers)
    body = resp.get_json()
    assert resp.status_code == 200
    assert body['ok'] is True
    assert body['host'] == 'pc.example.com'
    assert body['port'] == 9441
    assert body['latencyMs'] == 12.3
    assert calls == [('pc.example.com', 9441, 5.0)]


def test_connection_profile_prism_central_full_login(client, auth_headers, monkeypatch):
    import server

    resp = client.post('/api/global-config',
                       json={'content': (
                           'vault_to_use: local\n'
                           'ip_allocation_method: static\n'
                           'vaults:\n'
                           '  local:\n'
                           '    credentials:\n'
                           '      pc_user:\n'
                           '        username: admin\n'
                           '        password: secret\n'
                       )},
                       headers=auth_headers)
    assert resp.status_code == 200

    captured = {}

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    def fake_urlopen(req, timeout=0, context=None):
        captured['url'] = req.full_url
        captured['authorization'] = req.get_header('Authorization')
        captured['timeout'] = timeout
        captured['context'] = context
        return FakeResponse()

    monkeypatch.setattr(server.urllib.request, 'urlopen', fake_urlopen)
    resp = client.post('/api/settings/test-connection',
                       json={
                           'target': 'prismCentral',
                           'profile': {'prismCentral': {'endpoint': 'pc.example.com', 'credentialRef': 'pc_user'}},
                       },
                       headers=auth_headers)
    body = resp.get_json()
    assert resp.status_code == 200
    assert body['ok'] is True
    assert body['auth'] is True
    assert body['tlsVerified'] is False
    assert body['host'] == 'pc.example.com'
    assert body['port'] == 9440
    assert captured['url'] == 'https://pc.example.com:9440/api/nutanix/v3/users/me'
    assert captured['authorization'].startswith('Basic ')
    assert captured['timeout'] == 10
    assert captured['context'] is not None


def test_connection_profile_prism_central_loopback_http_simulator(client, auth_headers, monkeypatch):
    import server

    resp = client.post('/api/global-config',
                       json={'content': (
                           'vault_to_use: local\n'
                           'vaults:\n'
                           '  local:\n'
                           '    credentials:\n'
                           '      pc_user:\n'
                           '        username: admin\n'
                           '        password: nutanix/4u\n'
                       )},
                       headers=auth_headers)
    assert resp.status_code == 200

    captured = {}

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    def fake_urlopen(req, timeout=0, context=None):
        captured['url'] = req.full_url
        return FakeResponse()

    monkeypatch.setattr(server.urllib.request, 'urlopen', fake_urlopen)
    resp = client.post('/api/settings/test-connection',
                       json={
                           'target': 'prismCentral',
                           'profile': {'prismCentral': {'endpoint': 'http://127.0.0.1:9440', 'credentialRef': 'pc_user'}},
                       },
                       headers=auth_headers)
    body = resp.get_json()
    assert resp.status_code == 200
    assert body['ok'] is True
    assert body['scheme'] == 'http'
    assert captured['url'] == 'http://127.0.0.1:9440/api/nutanix/v3/users/me'


def test_connection_profile_prism_central_docker_host_http_simulator(client, auth_headers, monkeypatch):
    import server

    resp = client.post('/api/global-config',
                       json={'content': (
                           'vault_to_use: local\n'
                           'vaults:\n'
                           '  local:\n'
                           '    credentials:\n'
                           '      pc_user:\n'
                           '        username: admin\n'
                           '        password: nutanix/4u\n'
                       )},
                       headers=auth_headers)
    assert resp.status_code == 200

    captured = {}

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    def fake_urlopen(req, timeout=0, context=None):
        captured['url'] = req.full_url
        return FakeResponse()

    monkeypatch.setattr(server.urllib.request, 'urlopen', fake_urlopen)
    resp = client.post('/api/settings/test-connection',
                       json={
                           'target': 'prismCentral',
                           'profile': {'prismCentral': {'endpoint': 'http://host.docker.internal:9440', 'credentialRef': 'pc_user'}},
                       },
                       headers=auth_headers)
    body = resp.get_json()
    assert resp.status_code == 200
    assert body['ok'] is True
    assert body['scheme'] == 'http'
    assert captured['url'] == 'http://host.docker.internal:9440/api/nutanix/v3/users/me'


def test_connection_profile_prism_central_rejects_non_loopback_http(client, auth_headers, monkeypatch):
    import server

    monkeypatch.setattr(server.urllib.request, 'urlopen', lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError('should not send cleartext credentials')))
    resp = client.post('/api/settings/test-connection',
                       json={
                           'target': 'prismCentral',
                           'profile': {'prismCentral': {'endpoint': 'http://pc.example.com:9440', 'credentialRef': 'pc_user'}},
                       },
                       headers=auth_headers)
    body = resp.get_json()
    assert resp.status_code == 200
    assert body['ok'] is False
    assert body['scheme'] == 'http'
    assert 'local simulator endpoints' in body['message']


def test_connection_profile_prism_central_missing_credential(client, auth_headers, monkeypatch):
    import server

    monkeypatch.setattr(server.urllib.request, 'urlopen', lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError('should not authenticate')))
    resp = client.post('/api/settings/test-connection',
                       json={
                           'target': 'prismCentral',
                           'profile': {'prismCentral': {'endpoint': 'pc.example.com', 'credentialRef': 'missing'}},
                       },
                       headers=auth_headers)
    body = resp.get_json()
    assert resp.status_code == 200
    assert body['ok'] is False
    assert body['auth'] is True
    assert body['message'] == 'credential reference missing was not found in global.yml'


def test_connection_profile_test_reports_missing_endpoint(client, auth_headers, monkeypatch):
    import server

    monkeypatch.setattr(server, '_tcp_check', lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError('should not probe')))
    resp = client.post('/api/settings/test-connection',
                       json={'target': 'foundationCentral', 'profile': {'foundationCentral': {}}},
                       headers=auth_headers)
    body = resp.get_json()
    assert resp.status_code == 200
    assert body['ok'] is False
    assert body['message'] == 'endpoint is not configured'


def test_connection_profile_test_operator_allowed(client, auth_headers, monkeypatch):
    import server

    _create_user(client, auth_headers, 'op-settings', 'operator')
    op_headers = _login(client, 'op-settings')
    monkeypatch.setattr(server, '_tcp_check', lambda host, port, timeout=5.0: (False, 0.0))
    resp = client.post('/api/settings/test-connection',
                       json={'target': 'ipam', 'profile': {'ipam': {'method': 'infoblox', 'infobloxHost': 'infoblox.example.com'}}},
                       headers=op_headers)
    body = resp.get_json()
    assert resp.status_code == 200
    assert body['ok'] is False
    assert body['host'] == 'infoblox.example.com'
    assert body['port'] == 443


def test_connection_profile_test_rejects_unknown_target(client, auth_headers):
    resp = client.post('/api/settings/test-connection',
                       json={'target': 'unknown', 'profile': {}},
                       headers=auth_headers)
    assert resp.status_code == 400
    assert resp.get_json()['message'] == 'unknown connection target'


def test_only_admin_can_create_users(client, auth_headers):
    _create_user(client, auth_headers, 'op3', 'operator')
    op_headers = _login(client, 'op3')
    resp = client.post('/api/users',
                       json={'username': 'new', 'password': 'x', 'role': 'viewer'},
                       headers=op_headers)
    assert resp.status_code == 403


# ── Config CRUD ───────────────────────────────────────────────────────────────

def test_config_create_read_delete(client, auth_headers):
    content = 'cluster_name: test-cluster\n'

    # Create
    resp = client.post('/api/configs/mycluster.yml',
                       json={'content': content},
                       headers=auth_headers)
    assert resp.status_code == 200

    # List — should appear
    resp = client.get('/api/configs', headers=auth_headers)
    names = [f['name'] for f in resp.get_json()]
    assert 'mycluster.yml' in names

    # Read
    resp = client.get('/api/configs/mycluster.yml', headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()['content'] == content

    # Delete
    resp = client.delete('/api/configs/mycluster.yml', headers=auth_headers)
    assert resp.status_code == 200

    # Should be gone
    resp = client.get('/api/configs/mycluster.yml', headers=auth_headers)
    assert resp.status_code == 404


def test_config_backup_created_on_overwrite(client, auth_headers, isolated_data_dir):
    """Overwriting a config should create a .bak.1 backup."""
    client.post('/api/configs/cluster.yml',
                json={'content': 'original: true\n'}, headers=auth_headers)
    client.post('/api/configs/cluster.yml',
                json={'content': 'updated: true\n'}, headers=auth_headers)

    configs_dir = isolated_data_dir / 'configs'
    backup = configs_dir / 'cluster.yml.bak.1'
    assert backup.exists()
    assert 'original' in backup.read_text()


# ── User management ───────────────────────────────────────────────────────────

def test_create_list_delete_user(client, auth_headers):
    # Create
    resp = client.post('/api/users',
                       json={'username': 'bob', 'password': 'Pass123!', 'role': 'operator'},
                       headers=auth_headers)
    assert resp.status_code == 201

    # List
    resp = client.get('/api/users', headers=auth_headers)
    usernames = [u['username'] for u in resp.get_json()]
    assert 'bob' in usernames

    # Delete
    resp = client.delete('/api/users/bob', headers=auth_headers)
    assert resp.status_code == 200

    # Gone
    resp = client.get('/api/users', headers=auth_headers)
    usernames = [u['username'] for u in resp.get_json()]
    assert 'bob' not in usernames


def test_user_list_exposes_identity_posture_metadata(client, auth_headers):
    resp = client.post('/api/users',
                       json={'username': 'identity_meta', 'password': 'Pass123!', 'role': 'viewer'},
                       headers=auth_headers)
    assert resp.status_code == 201

    login_headers = _login(client, 'identity_meta')
    assert login_headers['Authorization'].startswith('Bearer ')

    resp = client.put('/api/users/identity_meta',
                      json={'password': 'Pass456!'},
                      headers=auth_headers)
    assert resp.status_code == 200

    resp = client.get('/api/users', headers=auth_headers)
    body = resp.get_json()
    user = next(item for item in body if item['username'] == 'identity_meta')
    assert user['last_login_at']
    assert user['password_changed_at']
    assert user['disabled'] is False
    assert user['mfa_supported'] is False
    assert user['sso_supported'] is False
    assert user['active_sessions_supported'] is False


def test_cannot_delete_own_account(client, auth_headers):
    resp = client.delete('/api/users/admin', headers=auth_headers)
    assert resp.status_code == 400


def test_duplicate_user_rejected(client, auth_headers):
    client.post('/api/users',
                json={'username': 'dup', 'password': 'x', 'role': 'viewer'},
                headers=auth_headers)
    resp = client.post('/api/users',
                       json={'username': 'dup', 'password': 'y', 'role': 'viewer'},
                       headers=auth_headers)
    assert resp.status_code == 409


# ── Backup list & restore ────────────────────────────────────────────────────

def test_backup_list_empty_initially(client, auth_headers):
    client.post('/api/configs/bak_test.yml',
                json={'content': 'v1: true\n'}, headers=auth_headers)
    resp = client.get('/api/configs/bak_test.yml/backups', headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_backup_list_populated_after_overwrite(client, auth_headers):
    client.post('/api/configs/bak2.yml',
                json={'content': 'v1: true\n'}, headers=auth_headers)
    client.post('/api/configs/bak2.yml',
                json={'content': 'v2: true\n'}, headers=auth_headers)
    resp = client.get('/api/configs/bak2.yml/backups', headers=auth_headers)
    assert resp.status_code == 200
    backups = resp.get_json()
    assert len(backups) == 1
    assert backups[0]['version'] == 1


def test_backup_restore_reverts_content(client, auth_headers):
    client.post('/api/configs/restore_me.yml',
                json={'content': 'original: true\n'}, headers=auth_headers)
    client.post('/api/configs/restore_me.yml',
                json={'content': 'updated: true\n'}, headers=auth_headers)
    resp = client.post('/api/configs/restore_me.yml/restore/1', headers=auth_headers)
    assert resp.status_code == 200
    resp = client.get('/api/configs/restore_me.yml', headers=auth_headers)
    assert 'original' in resp.get_json()['content']


def test_backup_restore_missing_version(client, auth_headers):
    client.post('/api/configs/no_bak.yml',
                json={'content': 'key: val\n'}, headers=auth_headers)
    resp = client.post('/api/configs/no_bak.yml/restore/1', headers=auth_headers)
    assert resp.status_code == 404


def test_backup_restore_invalid_version(client, auth_headers):
    resp = client.post('/api/configs/any.yml/restore/99', headers=auth_headers)
    assert resp.status_code == 400


# ── Executions ───────────────────────────────────────────────────────────────

def test_get_executions_empty(client, auth_headers):
    resp = client.get('/api/executions', headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_clear_executions(client, auth_headers):
    resp = client.delete('/api/executions', headers=auth_headers)
    assert resp.status_code == 200


# ── Global config ────────────────────────────────────────────────────────────

def test_get_global_config(client, auth_headers):
    resp = client.get('/api/global-config', headers=auth_headers)
    assert resp.status_code == 200
    assert 'content' in resp.get_json()


def test_save_global_config(client, auth_headers, isolated_data_dir):
    resp = client.post('/api/global-config',
                       json={'content': 'vault_to_use: local\n'},
                       headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert Path(data['path']).name == 'global.yml'
    assert Path(data['path']).parent.name == 'configs'
    global_yml = isolated_data_dir / 'configs' / 'global.yml'
    assert global_yml.read_text() == 'vault_to_use: local\n'


def test_get_global_config_falls_back_to_legacy_path(client, auth_headers, isolated_data_dir):
    legacy_global_yml = isolated_data_dir / 'default-legacy-ztf' / 'config' / 'global.yml'
    legacy_global_yml.parent.mkdir()
    legacy_global_yml.write_text('vault_to_use: local\n')

    resp = client.get('/api/global-config', headers=auth_headers)

    assert resp.status_code == 200
    data = resp.get_json()
    assert data['content'] == 'vault_to_use: local\n'
    assert data['legacy'] is True


# ── Drift detection ──────────────────────────────────────────────────────────

def test_drift_check_matches_last_applied_config(client, auth_headers):
    import server

    client.post('/api/configs/drift.yml',
                json={'content': 'pc_ip: 10.0.0.1\nntp:\n  - 1.1.1.1\n'},
                headers=auth_headers)
    server._record_execution_history(
        execution_id='exec-drift-match',
        workflow_or_script='config-pc',
        execution_type='workflow',
        status='success',
        user='admin',
        config_file='drift.yml',
        config_content='pc_ip: 10.0.0.1\nntp:\n  - 1.1.1.1\n',
    )

    resp = client.post('/api/drift/check',
                       json={'configFile': 'drift.yml', 'workflow': 'config-pc'},
                       headers=auth_headers)

    assert resp.status_code == 200
    body = resp.get_json()
    assert body['status'] == 'matched'
    assert body['summary']['changed'] == 0
    assert body['appliedExecutionId'] == 'exec-drift-match'


def test_drift_check_detects_changed_missing_and_unexpected_fields(client, auth_headers):
    resp = client.post('/api/configs/drift_state.yml',
                       json={'content': 'pc_ip: 10.0.0.1\ndns: 8.8.8.8\nntp: 1.1.1.1\n'},
                       headers=auth_headers)
    assert resp.status_code == 200

    resp = client.post('/api/drift/check',
                       json={
                           'configFile': 'drift_state.yml',
                           'baseline': 'current_state',
                           'currentStateContent': 'pc_ip: 10.0.0.2\nntp: 1.1.1.1\nextra: true\n',
                       },
                       headers=auth_headers)

    assert resp.status_code == 200
    body = resp.get_json()
    statuses = {finding['path']: finding['status'] for finding in body['findings']}
    assert body['status'] == 'drifted'
    assert statuses['pc_ip'] == 'changed'
    assert statuses['dns'] == 'missing'
    assert statuses['extra'] == 'unexpected'


def test_drift_check_unknown_without_successful_execution(client, auth_headers):
    client.post('/api/configs/no_baseline.yml',
                json={'content': 'pc_ip: 10.0.0.1\n'},
                headers=auth_headers)

    resp = client.post('/api/drift/check',
                       json={'configFile': 'no_baseline.yml'},
                       headers=auth_headers)

    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'unknown'


def test_drift_history_can_be_listed_and_cleared(client, auth_headers):
    client.post('/api/configs/drift_clear.yml',
                json={'content': 'pc_ip: 10.0.0.1\n'},
                headers=auth_headers)
    client.post('/api/drift/check',
                json={'configFile': 'drift_clear.yml'},
                headers=auth_headers)

    resp = client.get('/api/drift', headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.get_json()) == 1

    resp = client.delete('/api/drift', headers=auth_headers)
    assert resp.status_code == 200
    assert client.get('/api/drift', headers=auth_headers).get_json() == []


def test_drift_check_viewer_forbidden(client, auth_headers):
    _create_user(client, auth_headers, 'viewer_drift', 'viewer')
    vh = _login(client, 'viewer_drift')

    resp = client.post('/api/drift/check',
                       json={'configFile': 'any.yml'},
                       headers=vh)

    assert resp.status_code == 403


# ── v1.2.8 feature endpoints ─────────────────────────────────────────────────

def test_schedule_rejects_unknown_script(client, auth_headers):
    resp = client.post('/api/schedules',
                       json={'name': 'bad script',
                             'script': '../../etc/passwd',
                             'cronExpr': '0 * * * *'},
                       headers=auth_headers)

    assert resp.status_code == 400
    assert 'Unknown script' in resp.get_json()['error']


def test_schedule_runner_uses_configured_config_dir(client, auth_headers, tmp_path, monkeypatch):
    import server

    config_dir = tmp_path / 'custom-configs'
    config_dir.mkdir()
    config_file = config_dir / 'scheduled.yml'
    config_file.write_text('pc_ip: 10.0.0.1\n')
    ztf_dir = tmp_path / 'ztf'
    ztf_dir.mkdir()
    (ztf_dir / 'main.py').write_text('# legacy ztf entrypoint\n')

    client.post('/api/settings',
                json={'configDir': str(config_dir),
                      'ztfPath': str(ztf_dir),
                      'pythonPath': 'python'},
                headers=auth_headers)

    calls = []

    class FakeRun:
        returncode = 0

    def fake_run(cmd, **kwargs):
        calls.append((cmd, kwargs))
        return FakeRun()

    monkeypatch.setattr(server.subprocess, 'run', fake_run)
    monkeypatch.setattr(server, '_fire_configured_webhook', lambda *args, **kwargs: None)
    server._require_engines()

    status = server._schedule_engine._run_cb({
        'workflow': 'config-pc',
        'configFile': 'scheduled.yml',
    })

    assert status == 'success'
    assert calls
    assert str(config_file) in calls[0][0]


def test_configured_webhook_payload_uses_settings_url(client, auth_headers, monkeypatch):
    import server

    captured = {}
    client.post('/api/settings',
                json={'webhookUrl': 'http://example.com/hook'},
                headers=auth_headers)

    def fake_fire(url, payload):
        captured['url'] = url
        captured['payload'] = payload

    monkeypatch.setattr(server, '_fire_webhook', fake_fire)

    server._fire_configured_webhook('config-pc', 'success', 0, 'scheduler', 'exec-1', 'schedule')

    assert captured['url'] == 'http://example.com/hook'
    assert captured['payload']['workflow'] == 'config-pc'
    assert captured['payload']['status'] == 'success'
    assert captured['payload']['executionId'] == 'exec-1'
    assert captured['payload']['type'] == 'schedule'


def test_approval_create_and_decide_fire_configured_webhook(client, auth_headers, monkeypatch):
    import server

    events = []
    _create_user(client, auth_headers, 'approval-op', 'operator')
    op_headers = _login(client, 'approval-op')

    client.post('/api/settings',
                json={'webhookUrl': 'http://example.com/hook'},
                headers=auth_headers)

    monkeypatch.setattr(server, '_fire_webhook',
                        lambda url, payload: events.append((url, payload)))

    create_resp = client.post('/api/approvals',
                              json={'workflow': 'config-pc',
                                    'configContent': 'pc_ip: 10.0.0.1\n'},
                              headers=op_headers)
    assert create_resp.status_code == 201
    approval_id = create_resp.get_json()['id']

    approve_resp = client.post(f'/api/approvals/{approval_id}/approve',
                               json={'notes': 'approved'},
                               headers=auth_headers)
    assert approve_resp.status_code == 200
    assert [event[1]['status'] for event in events] == ['pending', 'approved']
    assert all(event[0] == 'http://example.com/hook' for event in events)


def test_approval_self_approval_is_rejected(client, auth_headers):
    create_resp = client.post('/api/approvals',
                              json={'workflow': 'config-pc',
                                    'configContent': 'pc_ip: 10.0.0.1\n'},
                              headers=auth_headers)
    assert create_resp.status_code == 201
    approval_id = create_resp.get_json()['id']

    approve_resp = client.post(f'/api/approvals/{approval_id}/approve',
                               json={'notes': 'approved'},
                               headers=auth_headers)
    assert approve_resp.status_code == 403
    assert 'Self-approval' in approve_resp.get_json()['error']


def test_parallel_submit_uses_configured_webhook_adapter(client, auth_headers, monkeypatch):
    import server

    server._require_engines()
    captured = {}

    def fake_submit(**kwargs):
        captured.update(kwargs)
        return {'id': 'parallel-1', 'workflow': kwargs['workflow'], 'status': 'running', 'sites': []}

    monkeypatch.setattr(server._parallel_engine, 'submit', fake_submit)

    resp = client.post('/api/parallel-runs',
                       json={'workflow': 'config-pc',
                             'sites': [
                                 {'label': 'A', 'configContent': 'pc_ip: 10.0.0.1\n'},
                                 {'label': 'B', 'configContent': 'pc_ip: 10.0.0.2\n'},
                             ]},
                       headers=auth_headers)

    assert resp.status_code == 202
    assert captured['on_webhook'] is server._fire_configured_webhook


# ── User role update ─────────────────────────────────────────────────────────

def test_update_user_role(client, auth_headers):
    _create_user(client, auth_headers, 'roleuser', 'viewer')
    resp = client.put('/api/users/roleuser',
                      json={'role': 'operator'},
                      headers=auth_headers)
    assert resp.status_code == 200


# ── Dry-run / preflight ───────────────────────────────────────────────────────

def test_dry_run_valid_yaml(client, auth_headers, monkeypatch):
    """Dry-run with valid YAML returns a streaming 200."""
    import server
    # Mock TCP checks so the test doesn't hit the network
    monkeypatch.setattr(server, '_tcp_check', lambda host, port, timeout=5.0: (True, 12.0))

    yaml_body = 'pc_ip: 192.168.1.1\npc_credential: pc_user\ncvm_credential: cvm_cred\nclusters:\n  - name: test\n'
    resp = client.post('/api/execute',
                       json={'workflow': 'cluster-create',
                             'configContent': yaml_body,
                             'configFile': 'test.yml',
                             'dryRun': True},
                       headers=auth_headers)
    assert resp.status_code == 200
    assert b'dry-run' in resp.data.lower() or b'preflight' in resp.data.lower() or b'PASS' in resp.data or b'pass' in resp.data.lower()


def test_dry_run_invalid_yaml(client, auth_headers):
    """Dry-run with broken YAML reports a YAML parse failure."""
    resp = client.post('/api/execute',
                       json={'workflow': 'cluster-create',
                             'configContent': 'key: [\nbroken',
                             'configFile': 'bad.yml',
                             'dryRun': True},
                       headers=auth_headers)
    assert resp.status_code == 200
    assert b'FAIL' in resp.data


def test_dry_run_unknown_workflow_rejected(client, auth_headers):
    """Dry-run with an unknown workflow name is rejected before preflight."""
    resp = client.post('/api/execute',
                       json={'workflow': 'rm -rf /',
                             'configContent': 'key: val',
                             'dryRun': True},
                       headers=auth_headers)
    assert resp.status_code == 400


def test_preflight_generator_pass(monkeypatch):
    """_run_preflight produces pass events for valid cluster-create YAML."""
    import server
    monkeypatch.setattr(server, '_tcp_check', lambda h, p, timeout=5.0: (True, 8.0))
    yaml_ok = (
        'pc_ip: 10.0.0.1\n'
        'pc_credential: pc_user\n'
        'cvm_credential: cvm_cred\n'
        'clusters:\n  - name: c1\n'
    )
    output = ''.join(server._run_preflight('cluster-create', yaml_ok, 'test-id'))
    assert '[PASS]' in output
    assert '[FAIL]' not in output


def test_preflight_accepts_legacy_fc_ip_alias(monkeypatch):
    """Legacy Orchestrator configs with fc_ip still preflight as pc_ip."""
    import server
    monkeypatch.setattr(server, '_tcp_check', lambda h, p, timeout=5.0: (True, 8.0))
    yaml_ok = (
        'fc_ip: 10.0.0.1\n'
        'pc_credential: pc_user\n'
        'cvm_credential: cvm_cred\n'
        'clusters:\n  - name: c1\n'
    )
    output = ''.join(server._run_preflight('cluster-create', yaml_ok, 'test-id'))
    assert 'Legacy fc_ip detected' in output
    assert '[FAIL]' not in output


def test_legacy_fc_ip_content_normalized_for_execution():
    """Execution writes upstream-compatible pc_ip when an old fc_ip file is supplied."""
    import server
    normalized, changed = server._normalize_ztf_config_content(
        'cluster-create',
        'fc_ip: 10.0.0.1\npc_credential: pc_user\n',
    )
    assert changed is True
    assert 'pc_ip: 10.0.0.1' in normalized
    assert 'fc_ip:' not in normalized


def test_preflight_generator_missing_field(monkeypatch):
    """_run_preflight flags missing required fields."""
    import server
    monkeypatch.setattr(server, '_tcp_check', lambda h, p, timeout=5.0: (False, 0.0))
    yaml_missing = 'pc_credential: pc_user\n'   # pc_ip missing
    output = ''.join(server._run_preflight('cluster-create', yaml_missing, 'test-id'))
    assert '[FAIL]' in output


def test_preflight_generator_unreachable(monkeypatch):
    """_run_preflight flags unreachable hosts."""
    import server
    monkeypatch.setattr(server, '_tcp_check', lambda h, p, timeout=5.0: (False, 0.0))
    yaml_body = (
        'pc_ip: 10.0.0.1\n'
        'pc_credential: pc_user\n'
        'cvm_credential: cvm_cred\n'
        'clusters:\n  - name: c1\n'
    )
    output = ''.join(server._run_preflight('cluster-create', yaml_body, 'test-id'))
    assert 'Unreachable' in output


def test_execution_start_exception_is_recorded_as_failed(client, auth_headers, monkeypatch):
    """Failures before ZTF starts should still create a failed execution history row."""
    import subprocess

    def fail_popen(*args, **kwargs):
        raise OSError('cannot start process')

    monkeypatch.setattr(subprocess, 'Popen', fail_popen)

    resp = client.post('/api/execute',
                       json={'workflow': 'config-management-pc',
                             'configContent': 'pc_ip: 10.0.0.51\npc_credential: pc_user\n',
                             'configFile': 'pod-management-config.yml'},
                       headers=auth_headers)

    body = resp.data.decode()
    assert resp.status_code == 200
    assert '"status": "failed"' in body

    history = client.get('/api/executions', headers=auth_headers).get_json()
    assert history[0]['workflow'] == 'config-management-pc'
    assert history[0]['status'] == 'failed'
    assert history[0]['configFile'] == 'pod-management-config.yml'


def test_tcp_check_success(monkeypatch):
    """_tcp_check returns True when connection succeeds."""
    import server, socket as _sock
    class FakeConn:
        def __enter__(self): return self
        def __exit__(self, *a): pass
    monkeypatch.setattr(_sock, 'create_connection', lambda addr, timeout: FakeConn())
    ok, ms = server._tcp_check('10.0.0.1', 9440)
    assert ok is True
    assert ms >= 0


def test_tcp_check_failure(monkeypatch):
    """_tcp_check returns False when connection is refused."""
    import server, socket as _sock
    monkeypatch.setattr(_sock, 'create_connection',
                        lambda addr, timeout: (_ for _ in ()).throw(OSError('refused')))
    ok, ms = server._tcp_check('10.0.0.1', 9440)
    assert ok is False
    assert ms == 0.0


# ── Multi-script composition ──────────────────────────────────────────────────

def test_multi_script_array_accepted(client, auth_headers, monkeypatch):
    """Array of valid scripts passes allowlist validation."""
    import subprocess
    class FakeProc:
        returncode = 0
        stdout = iter([]); stderr = iter([])
        def wait(self): pass
        def kill(self): pass
        def poll(self): return 0
    monkeypatch.setattr(subprocess, 'Popen', lambda *a, **kw: FakeProc())
    resp = client.post('/api/execute',
                       json={'script': ['AddAdServerPe', 'AddAdServerPc'],
                             'configFile': 'test.yml'},
                       headers=auth_headers)
    assert resp.status_code == 200


def test_multi_script_comma_string_accepted(client, auth_headers, monkeypatch):
    """Comma-separated string of valid scripts is accepted."""
    import subprocess
    class FakeProc:
        returncode = 0
        stdout = iter([]); stderr = iter([])
        def wait(self): pass
        def kill(self): pass
        def poll(self): return 0
    monkeypatch.setattr(subprocess, 'Popen', lambda *a, **kw: FakeProc())
    resp = client.post('/api/execute',
                       json={'script': 'AddAdServerPe,AddAdServerPc',
                             'configFile': 'test.yml'},
                       headers=auth_headers)
    assert resp.status_code == 200


def test_multi_script_unknown_in_array_rejected(client, auth_headers):
    """Array containing an unknown script is rejected."""
    resp = client.post('/api/execute',
                       json={'script': ['AddAdServerPe', 'evil; rm -rf /'],
                             'configFile': 'test.yml'},
                       headers=auth_headers)
    assert resp.status_code == 400
    assert 'Unknown script' in resp.get_json()['error']


# ── Audit log ────────────────────────────────────────────────────────────────

def test_job_submit_persists_status_logs_and_history(client, auth_headers, monkeypatch):
    """Submit-only jobs are executed by the background worker and persisted."""
    import subprocess
    import time

    class FakeProc:
        returncode = 0
        stdout = iter(['Connecting to Prism Central\n', 'ok\n'])
        stderr = iter([])
        def wait(self): pass
        def kill(self): pass
        def poll(self): return 0

    monkeypatch.setattr(subprocess, 'Popen', lambda *a, **kw: FakeProc())

    resp = client.post('/api/jobs',
                       json={'script': 'AddAdServerPe', 'configFile': 'test.yml'},
                       headers=auth_headers)
    assert resp.status_code == 202
    job_id = resp.get_json()['id']

    job = None
    for _ in range(30):
        job = client.get(f'/api/jobs/{job_id}', headers=auth_headers).get_json()
        if job['status'] == 'success':
            break
        time.sleep(0.05)

    assert job['status'] == 'success'
    assert job['progress']['phase'] == 'Completed'
    assert job['progress']['percent'] == 100
    assert job['progress']['estimated'] is True
    assert any(event['type'] == 'stdout' and event['data'] == 'ok' for event in job['logs'])

    jobs = client.get('/api/jobs', headers=auth_headers).get_json()
    assert jobs[0]['id'] == job_id

    history = client.get('/api/executions', headers=auth_headers).get_json()
    assert history[0]['id'] == job_id
    assert history[0]['status'] == 'success'


def test_cancel_queued_job(client, auth_headers):
    """Queued jobs can be cancelled before a worker starts them."""
    import server

    server._job_manager.stop()
    server._job_manager = server.ExecutionJobManager(1)

    resp = client.post('/api/jobs',
                       json={'script': 'AddAdServerPe', 'configFile': 'test.yml'},
                       headers=auth_headers)
    assert resp.status_code == 202
    job_id = resp.get_json()['id']
    assert resp.get_json()['progress']['phase'] == 'Queued'
    assert resp.get_json()['progress']['percent'] == 0

    cancel = client.post(f'/api/jobs/{job_id}/cancel', headers=auth_headers)
    assert cancel.status_code == 200
    assert cancel.get_json()['status'] == 'cancelled'
    assert cancel.get_json()['progress']['phase'] == 'Cancelled'
    assert cancel.get_json()['progress']['percent'] == 100


def test_job_progress_advances_from_ztf_output(client, auth_headers):
    """Estimated phase progress advances conservatively from workflow output."""
    import server

    server._job_manager.stop()
    server._job_manager = server.ExecutionJobManager(1)

    resp = client.post('/api/jobs',
                       json={'script': 'AddAdServerPe', 'configFile': 'test.yml'},
                       headers=auth_headers)
    assert resp.status_code == 202
    job_id = resp.get_json()['id']

    server._job_manager._emit(job_id, 'stdout', 'Connecting to Prism Central API')
    job = client.get(f'/api/jobs/{job_id}', headers=auth_headers).get_json()
    assert job['progress']['phase'] == 'Connecting to Nutanix services'
    assert job['progress']['percent'] == 45
    assert job['progress']['estimated'] is True


def test_job_captures_nutanix_task_ids_from_output(client, auth_headers):
    """Framework output task UUIDs are promoted onto the job for operator follow-up."""
    import server

    server._job_manager.stop()
    server._job_manager = server.ExecutionJobManager(1)

    resp = client.post('/api/jobs',
                       json={'script': 'AddAdServerPe', 'configFile': 'test.yml'},
                       headers=auth_headers)
    assert resp.status_code == 202
    job_id = resp.get_json()['id']

    task_id = '123e4567-e89b-12d3-a456-426614174000'
    server._job_manager._emit(job_id, 'stdout', f'Nutanix task id: {task_id}')
    server._job_manager._emit(job_id, 'stdout', f'task_uuid={task_id}')
    job = client.get(f'/api/jobs/{job_id}', headers=auth_headers).get_json()
    assert job['taskIds'] == [task_id]


def test_admin_can_delete_terminal_job_but_not_active_job(client, auth_headers):
    """Job queue records can be removed only after they are terminal."""
    import server

    server._job_manager.stop()
    server._job_manager = server.ExecutionJobManager(1)

    resp = client.post('/api/jobs',
                       json={'script': 'AddAdServerPe', 'configFile': 'test.yml'},
                       headers=auth_headers)
    assert resp.status_code == 202
    job_id = resp.get_json()['id']

    active_delete = client.delete(f'/api/jobs/{job_id}', headers=auth_headers)
    assert active_delete.status_code == 409

    cancel = client.post(f'/api/jobs/{job_id}/cancel', headers=auth_headers)
    assert cancel.status_code == 200
    assert cancel.get_json()['status'] == 'cancelled'

    delete = client.delete(f'/api/jobs/{job_id}', headers=auth_headers)
    assert delete.status_code == 200
    assert delete.get_json()['deleted']['id'] == job_id

    missing = client.get(f'/api/jobs/{job_id}', headers=auth_headers)
    assert missing.status_code == 404


def test_operator_cannot_delete_job_queue_record(client, auth_headers):
    import server

    server._job_manager.stop()
    server._job_manager = server.ExecutionJobManager(1)
    _create_user(client, auth_headers, 'job-delete-op', 'operator')
    op_headers = _login(client, 'job-delete-op')

    resp = client.post('/api/jobs',
                       json={'script': 'AddAdServerPe', 'configFile': 'test.yml'},
                       headers=auth_headers)
    job_id = resp.get_json()['id']
    client.post(f'/api/jobs/{job_id}/cancel', headers=auth_headers)

    delete = client.delete(f'/api/jobs/{job_id}', headers=op_headers)
    assert delete.status_code == 403


def test_nkp_status_reports_configured_framework(client, auth_headers, tmp_path):
    nkp_dir = tmp_path / 'nkp-zerotouch-framework'
    (nkp_dir / 'scripts').mkdir(parents=True)
    (nkp_dir / 'scripts' / 'zt.ps1').write_text('Write-Host nkp\n')
    (nkp_dir / 'configs' / 'environments').mkdir(parents=True)
    (nkp_dir / 'configs' / 'environments' / 'connected.example.yaml').write_text('environment:\n  name: lab\n')

    resp = client.post('/api/settings', json={'nkpPath': str(nkp_dir)}, headers=auth_headers)
    assert resp.status_code == 200

    status = client.get('/api/nkp/status', headers=auth_headers)
    assert status.status_code == 200
    data = status.get_json()
    assert data['installed'] is True
    assert data['script'].endswith('zt.ps1')
    assert 'connected.example.yaml' in data['configs']
    assert 'validate' in data['safePhases']


def test_nkp_job_rejects_apply_and_unknown_phase(client, auth_headers):
    apply_resp = client.post('/api/nkp/jobs',
                             json={'phase': 'deploy', 'configFile': 'nkp.yaml', 'apply': True},
                             headers=auth_headers)
    assert apply_resp.status_code == 400
    assert 'apply' in apply_resp.get_json()['error']

    phase_resp = client.post('/api/nkp/jobs',
                             json={'phase': 'destroy', 'configFile': 'nkp.yaml'},
                             headers=auth_headers)
    assert phase_resp.status_code == 400
    assert 'not allowed' in phase_resp.get_json()['error']


def test_nkp_job_submit_runs_safe_phase(client, auth_headers, tmp_path, monkeypatch):
    import server

    nkp_dir = tmp_path / 'nkp-zerotouch-framework'
    (nkp_dir / 'scripts').mkdir(parents=True)
    (nkp_dir / 'scripts' / 'zt.ps1').write_text('Write-Host nkp\n')

    resp = client.post('/api/settings', json={'nkpPath': str(nkp_dir)}, headers=auth_headers)
    assert resp.status_code == 200

    class FakeStream:
        def __iter__(self):
            return iter(['[PASS] validate\n'])

    class FakeProc:
        returncode = 0
        stdout = FakeStream()
        stderr = FakeStream()
        def poll(self): return 0
        def wait(self): return 0
        def kill(self): pass

    calls = []
    def fake_popen(args, **kwargs):
        calls.append({'args': args, 'kwargs': kwargs})
        return FakeProc()

    monkeypatch.setattr(server.subprocess, 'Popen', fake_popen)

    resp = client.post('/api/nkp/jobs',
                       json={
                           'phase': 'validate',
                           'configFile': 'nkp-test.yaml',
                           'configContent': 'environment:\n  name: lab\n',
                       },
                       headers=auth_headers)
    assert resp.status_code == 202
    job_id = resp.get_json()['id']

    job = _wait_for_job(client, auth_headers, job_id, {'success'})

    assert job['status'] == 'success'
    assert job['type'] == 'nkp'
    assert job['framework'] == 'nkp'
    assert calls[0]['args'][0] == 'powershell'
    assert 'validate' in calls[0]['args']


def test_nkp_job_records_trace_and_rejects_stale_profile_revision(client, auth_headers):
    import server

    server._job_manager.stop()
    server._job_manager = server.ExecutionJobManager(1)

    create = client.post('/api/nkp/profiles', json=_valid_nkp_profile(), headers=auth_headers)
    assert create.status_code == 201
    profile = create.get_json()

    update_body = {**profile, 'description': 'revision 2'}
    update = client.put(f"/api/nkp/profiles/{profile['id']}", json=update_body, headers=auth_headers)
    assert update.status_code == 200
    profile = update.get_json()
    assert profile['revision'] == 2

    stale = client.post('/api/nkp/jobs',
                        json={
                            'phase': 'validate',
                            'configFile': 'nkp-test.yaml',
                            'configContent': 'environment:\n  name: lab\n',
                            'profileId': profile['id'],
                            'profileRevision': 1,
                        },
                        headers=auth_headers)
    assert stale.status_code == 409
    assert stale.get_json()['currentRevision'] == 2

    submit = client.post('/api/nkp/jobs',
                         json={
                             'phase': 'validate',
                             'configFile': 'nkp-test.yaml',
                             'configContent': 'environment:\n  name: lab\n',
                             'profileId': profile['id'],
                             'profileRevision': 2,
                             'schemaValidation': {'status': 'pass', 'missing': [], 'warnings': []},
                         },
                         headers=auth_headers)
    assert submit.status_code == 202
    job = submit.get_json()
    assert job['trace']['profileId'] == profile['id']
    assert job['trace']['profileRevision'] == 2
    assert job['trace']['schemaStatus'] == 'fail'
    assert 'cluster' in job['trace']['schemaMissing']


def test_nkp_controlled_phase_requires_approval(client, auth_headers):
    resp = client.post('/api/nkp/jobs',
                       json={
                           'phase': 'deploy',
                           'configFile': 'nkp-test.yaml',
                           'configContent': 'environment:\n  name: lab\n',
                       },
                       headers=auth_headers)
    assert resp.status_code == 403
    data = resp.get_json()
    assert data['approvalRequired'] is True
    assert 'requires' in data['error']


def test_nkp_controlled_phase_accepts_approved_gate(client, auth_headers, tmp_path, monkeypatch):
    import server

    server._job_manager.stop()
    server._job_manager = server.ExecutionJobManager(1)
    server._job_manager.start()

    _create_user(client, auth_headers, 'nkp-op', 'operator')
    op_headers = _login(client, 'nkp-op')

    nkp_dir = tmp_path / 'nkp-zerotouch-framework'
    (nkp_dir / 'scripts').mkdir(parents=True)
    (nkp_dir / 'scripts' / 'zt.ps1').write_text('Write-Host nkp\n')
    resp = client.post('/api/settings', json={'nkpPath': str(nkp_dir)}, headers=auth_headers)
    assert resp.status_code == 200

    class FakeStream:
        def __iter__(self):
            return iter(['Nutanix task id: 123e4567-e89b-12d3-a456-426614174000\n'])

    class FakeProc:
        returncode = 0
        stdout = FakeStream()
        stderr = FakeStream()
        def poll(self): return 0
        def wait(self): return 0
        def kill(self): pass

    monkeypatch.setattr(server.subprocess, 'Popen', lambda *args, **kwargs: FakeProc())

    content = 'environment:\n  name: lab\n'
    create_resp = client.post('/api/approvals',
                              json={'workflow': 'nkp:deploy',
                                    'configFile': 'nkp-test.yaml',
                                    'configContent': content,
                                    'metadata': {'framework': 'nkp', 'phase': 'deploy'}},
                              headers=op_headers)
    assert create_resp.status_code == 201
    approval_id = create_resp.get_json()['id']

    approve_resp = client.post(f'/api/approvals/{approval_id}/approve',
                               json={'notes': 'approved'},
                               headers=auth_headers)
    assert approve_resp.status_code == 200

    submit_resp = client.post('/api/nkp/jobs',
                              json={
                                  'phase': 'deploy',
                                  'configFile': 'nkp-test.yaml',
                                  'configContent': content,
                                  'approvalId': approval_id,
                              },
                              headers=op_headers)
    assert submit_resp.status_code == 202
    job_id = submit_resp.get_json()['id']

    approval = client.get(f'/api/approvals/{approval_id}', headers=auth_headers).get_json()
    assert approval['jobId'] == job_id

    job = _wait_for_job(client, auth_headers, job_id, {'success'})
    assert job['status'] == 'success'
    assert job['taskIds'] == ['123e4567-e89b-12d3-a456-426614174000']


def test_nkp_binary_register_list_default_and_delete(client, auth_headers, tmp_path):
    staged = tmp_path / 'nkp'
    staged.write_text('binary placeholder')

    create = client.post('/api/nkp/binaries',
                         json={'name': 'NKP CLI', 'version': '2.15', 'path': str(staged)},
                         headers=auth_headers)
    assert create.status_code == 201
    binary = create.get_json()
    assert binary['exists'] is True
    assert binary['default'] is True

    second = tmp_path / 'nkp-new'
    second.write_text('new binary placeholder')
    create2 = client.post('/api/nkp/binaries',
                          json={'name': 'NKP CLI New', 'version': '2.16', 'path': str(second)},
                          headers=auth_headers)
    assert create2.status_code == 201
    second_id = create2.get_json()['id']

    set_default = client.post(f'/api/nkp/binaries/{second_id}/default', headers=auth_headers)
    assert set_default.status_code == 200
    assert set_default.get_json()['default'] is True

    listing = client.get('/api/nkp/binaries', headers=auth_headers)
    assert listing.status_code == 200
    binaries = listing.get_json()
    assert len(binaries) == 2
    assert sum(1 for item in binaries if item['default']) == 1

    delete = client.delete(f"/api/nkp/binaries/{binary['id']}", headers=auth_headers)
    assert delete.status_code == 200
    remaining = client.get('/api/nkp/binaries', headers=auth_headers).get_json()
    assert len(remaining) == 1


def test_nkp_binary_upload_stores_checksum_and_file(client, auth_headers, isolated_data_dir):
    resp = client.post('/api/nkp/binaries/upload',
                       data={
                           'name': 'NKP Bundle',
                           'version': '2.15',
                           'file': (io.BytesIO(b'nkp-binary-content'), 'nkp.tar.gz'),
                       },
                       content_type='multipart/form-data',
                       headers=auth_headers)
    assert resp.status_code == 201
    binary = resp.get_json()
    assert binary['source'] == 'uploaded'
    assert binary['checksum']
    assert binary['exists'] is True
    assert Path(binary['path']).exists()
    assert isolated_data_dir in Path(binary['path']).parents


def test_nkp_binary_viewer_can_list_but_not_write(client, auth_headers):
    _create_user(client, auth_headers, 'nkp-viewer', 'viewer')
    viewer_headers = _login(client, 'nkp-viewer')

    listing = client.get('/api/nkp/binaries', headers=viewer_headers)
    assert listing.status_code == 200

    create = client.post('/api/nkp/binaries',
                         json={'name': 'Denied', 'path': '/tmp/nkp'},
                         headers=viewer_headers)
    assert create.status_code == 403


def test_nkp_cli_compatibility_runs_registered_binary_checks(client, auth_headers, tmp_path, monkeypatch):
    import server

    nkp_cli = tmp_path / 'nkp'
    nkp_cli.write_text('fake nkp')

    def fake_run(cmd, **kwargs):
        class Result:
            returncode = 0
            stdout = 'create cluster nutanix endpoint control-plane worker create image nutanix cluster subnet push bundle image-bundle registry'
        assert cmd[0] == str(nkp_cli)
        return Result()

    monkeypatch.setattr(server.subprocess, 'run', fake_run)

    resp = client.post('/api/nkp/compatibility', json={'path': str(nkp_cli)}, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == 'compatible'
    assert data['cliPath'] == str(nkp_cli)
    assert data['summary']['failed'] == 0
    assert {item['id'] for item in data['checks']} >= {'nkp_version', 'nutanix_cluster_create_help'}


def test_nkp_cli_compatibility_blocks_missing_path(client, auth_headers):
    resp = client.post('/api/nkp/compatibility', json={'path': '/not/a/real/nkp'}, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == 'blocked'
    assert data['summary']['failed'] == 1


def test_nkp_cli_compatibility_viewer_forbidden(client, auth_headers):
    _create_user(client, auth_headers, 'nkp-compat-viewer', 'viewer')
    viewer_headers = _login(client, 'nkp-compat-viewer')

    resp = client.post('/api/nkp/compatibility',
                       json={'path': '/bin/echo'},
                       headers=viewer_headers)

    assert resp.status_code == 403


def _valid_nkp_profile():
    return {
        'name': 'Lab NKP Management',
        'description': 'Lab management cluster profile',
        'environment': 'lab',
        'nkp': {
            'version': '2.15',
            'binaryPath': '/opt/nkp',
            'registry': 'registry.lab.local',
            'sshKeyRef': 'admin_cred',
        },
        'prismCentral': {
            'endpoint': '10.42.1.10',
            'credentialRef': 'pc_user',
        },
        'cluster': {
            'name': 'nkp-mgmt-lab',
            'type': 'management',
            'kubernetesVersion': '1.30',
            'vip': '10.42.10.50',
        },
        'network': {
            'subnet': '10.42.10.0/24',
            'gateway': '10.42.10.1',
            'dnsServers': ['10.42.1.20', '10.42.1.21'],
            'ntpServers': ['10.42.1.30'],
            'domain': 'lab.local',
            'vlanId': '120',
        },
        'proxy': {
            'httpProxy': '',
            'httpsProxy': '',
            'noProxy': [],
        },
        'registry': {
            'endpoint': 'registry.lab.local',
            'namespace': 'nkp',
            'credentialRef': 'registry_cred',
            'caCert': '',
            'insecure': False,
        },
        'imageBuilder': {
            'enabled': False,
            'prismElementCluster': '',
            'subnet': '',
            'sourceImage': '',
            'artifactBundle': '',
            'imageName': 'nkp-node-image',
            'bastionHost': '',
            'gpuProfile': '',
            'fips': False,
            'insecure': False,
        },
        'nodes': [
            {
                'name': 'node-1',
                'serial': 'ABC123',
                'hostIp': '10.42.10.11',
                'cvmIp': '10.42.10.21',
                'ipmiIp': '10.42.10.31',
                'rack': 'rack-a',
            },
        ],
    }


def test_nkp_template_packs_list_and_apply(client, auth_headers):
    listing = client.get('/api/nkp/templates', headers=auth_headers)
    assert listing.status_code == 200
    templates = listing.get_json()
    ids = {item['id'] for item in templates}
    assert {'management-cluster', 'workload-cluster', 'airgapped-local-registry'} <= ids
    management = next(item for item in templates if item['id'] == 'management-cluster')
    assert management['requiredFields']
    assert management['preflightChecklist']

    resp = client.post('/api/nkp/templates/management-cluster/apply',
                       json={'overrides': _valid_nkp_profile()},
                       headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['template']['id'] == 'management-cluster'
    assert data['profile']['template']['id'] == 'management-cluster'
    assert data['profile']['template']['name'] == 'Management Cluster'
    assert data['profile']['cluster']['type'] == 'management'
    assert data['profile']['prismCentral']['endpoint'] == '10.42.1.10'
    assert data['readiness']['score'] >= 80


def test_nkp_template_specific_readiness_and_preview(client, auth_headers):
    profile = _valid_nkp_profile()
    profile['template'] = {
        'id': 'workload-cluster',
        'name': 'Workload Cluster',
        'category': 'Connected',
        'managementClusterRef': '',
    }
    profile['cluster']['type'] = 'workload'

    preview = client.post('/api/nkp/profiles/preview', json=profile, headers=auth_headers)
    assert preview.status_code == 200
    data = preview.get_json()
    assert 'environment:' in data['content']
    assert 'nutanix:' in data['content']
    assert 'managementCluster:' in data['content']
    assert data['schemaValidation']['status'] in {'pass', 'warn'}
    assert data['template']['id'] == 'workload-cluster'
    failed = {item['id'] for item in data['readiness']['checks'] if item['status'] == 'fail'}
    assert 'template_workload_management_ref' in failed

    profile['template']['managementClusterRef'] = 'nkp-mgmt'
    preview = client.post('/api/nkp/profiles/preview', json=profile, headers=auth_headers)
    checks = {item['id']: item for item in preview.get_json()['readiness']['checks']}
    assert checks['template_workload_management_ref']['status'] == 'pass'


def test_nkp_airgapped_template_requires_registry_and_binary(client, auth_headers):
    profile = _valid_nkp_profile()
    profile['template'] = {
        'id': 'airgapped-local-registry',
        'name': 'Air-Gapped / Local Registry',
        'category': 'Restricted',
        'managementClusterRef': '',
    }
    profile['nkp']['registry'] = ''
    profile['nkp']['binaryPath'] = ''
    profile['registry']['endpoint'] = ''

    resp = client.post('/api/nkp/profiles/preview', json=profile, headers=auth_headers)
    assert resp.status_code == 200
    failed = {item['id'] for item in resp.get_json()['readiness']['checks'] if item['status'] == 'fail'}
    assert 'template_airgap_registry' in failed
    assert 'template_airgap_local_binary' in failed
    assert 'registry:' in resp.get_json()['content']


def test_nkp_profile_preview_includes_proxy_registry_and_image_builder(client, auth_headers):
    profile = _valid_nkp_profile()
    profile['template'] = {
        'id': 'airgapped-local-registry',
        'name': 'Air-Gapped / Local Registry',
        'category': 'Restricted',
        'managementClusterRef': '',
    }
    profile['proxy'] = {
        'httpProxy': 'http://proxy.lab.local:8080',
        'httpsProxy': 'http://proxy.lab.local:8080',
        'noProxy': ['10.42.0.0/16', 'registry.lab.local'],
    }
    profile['registry'] = {
        'endpoint': 'registry.lab.local:5000',
        'namespace': 'nkp',
        'credentialRef': 'registry_cred',
        'caCert': '/etc/pki/registry-ca.pem',
        'insecure': False,
    }
    profile['imageBuilder'] = {
        'enabled': True,
        'prismElementCluster': 'pe-cluster-a',
        'subnet': 'vlan-k8s',
        'sourceImage': 'ubuntu-22.04',
        'artifactBundle': '/opt/nkp/artifacts',
        'imageName': 'nkp-node-image-v217',
        'bastionHost': 'bastion.lab.local',
        'gpuProfile': '',
        'fips': True,
        'insecure': False,
    }

    resp = client.post('/api/nkp/profiles/preview', json=profile, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'proxy:' in data['content']
    assert 'imageBuilder:' in data['content']
    assert 'registry.lab.local:5000' in data['content']
    checks = {item['id']: item for item in data['readiness']['checks']}
    assert checks['proxy_no_proxy']['status'] == 'pass'
    assert checks['image_builder_inputs']['status'] == 'pass'
    assert checks['template_airgap_registry_ca']['status'] == 'pass'


def test_nkp_examples_list_schema_validate_and_import(client, auth_headers, tmp_path):
    nkp_dir = tmp_path / 'nkp-zerotouch-framework'
    examples = nkp_dir / 'configs' / 'environments'
    examples.mkdir(parents=True)
    example_content = '''environment:
  name: lab-connected
  type: connected
  provider: nutanix-ahv
nkp:
  version: v2.17.1
  bundleType: standard
  bundlePath: /opt/nkp-v2.17.1
  cliPath: /opt/nkp-v2.17.1/cli/nkp
nutanix:
  prismCentralEndpoint: https://prism-central.example.com:9440
  clusterName: nutanix-cluster
  subnetName: vlan-k8s
  imageName: nkp-node-image
  storageContainer: default-container
  project: default
cluster:
  name: nkp-mgmt-connected
  kubernetesVersion: 1.34.3
  controlPlaneEndpointIp: 10.10.10.50
  controlPlaneEndpointPort: 6443
  controlPlaneReplicas: 3
  workerReplicas: 3
  podCidr: 192.168.0.0/16
  serviceCidr: 10.96.0.0/12
  loadBalancerIpRange: 10.10.10.100-10.10.10.120
  ntpServers:
    - 0.pool.ntp.org
  sshPublicKeyFile: /home/nkp/.ssh/id_rsa.pub
  sshUsername: nutanix
'''
    (examples / 'connected.example.yaml').write_text(example_content)
    resp = client.post('/api/settings', json={'nkpPath': str(nkp_dir)}, headers=auth_headers)
    assert resp.status_code == 200

    listing = client.get('/api/nkp/examples', headers=auth_headers)
    assert listing.status_code == 200
    data = listing.get_json()
    assert data['schema']['source'] == 'installed_examples'
    assert data['examples'][0]['path'] == 'connected.example.yaml'
    assert 'environment' in data['schema']['requiredTopLevel']

    validation = client.post('/api/nkp/schema/validate',
                             json={'content': example_content},
                             headers=auth_headers)
    assert validation.status_code == 200
    assert validation.get_json()['status'] == 'pass'

    imported = client.post('/api/nkp/examples/import',
                           json={'path': 'connected.example.yaml'},
                           headers=auth_headers)
    assert imported.status_code == 200
    payload = imported.get_json()
    assert payload['profile']['cluster']['name'] == 'nkp-mgmt-connected'
    assert payload['profile']['nkp']['binaryPath'] == '/opt/nkp-v2.17.1'
    assert payload['generatedSchemaValidation']['status'] in {'pass', 'warn'}


def test_nkp_template_apply_restricted_for_viewer(client, auth_headers):
    _create_user(client, auth_headers, 'template-viewer', 'viewer')
    viewer_headers = _login(client, 'template-viewer')

    listing = client.get('/api/nkp/templates', headers=viewer_headers)
    assert listing.status_code == 200

    apply_resp = client.post('/api/nkp/templates/workload-cluster/apply',
                             json={'overrides': {}},
                             headers=viewer_headers)
    assert apply_resp.status_code == 403


def test_nkp_profile_create_validate_and_generate_config(client, auth_headers, isolated_data_dir):
    create = client.post('/api/nkp/profiles', json=_valid_nkp_profile(), headers=auth_headers)
    assert create.status_code == 201
    profile = create.get_json()
    assert profile['name'] == 'Lab NKP Management'
    assert profile['revision'] == 1

    listing = client.get('/api/nkp/profiles', headers=auth_headers)
    assert listing.status_code == 200
    assert listing.get_json()[0]['id'] == profile['id']

    updated_profile = {**profile, 'description': 'Updated for revision test'}
    update = client.put(f"/api/nkp/profiles/{profile['id']}", json=updated_profile, headers=auth_headers)
    assert update.status_code == 200
    profile = update.get_json()
    assert profile['revision'] == 2

    revisions = client.get(f"/api/nkp/profiles/{profile['id']}/revisions", headers=auth_headers)
    assert revisions.status_code == 200
    revision_body = revisions.get_json()
    assert [item['revision'] for item in revision_body[:2]] == [2, 1]
    assert revision_body[0]['profile']['description'] == 'Updated for revision test'

    restore = client.post(f"/api/nkp/profiles/{profile['id']}/revisions/1/restore", headers=auth_headers)
    assert restore.status_code == 200
    profile = restore.get_json()
    assert profile['revision'] == 3
    assert profile['description'] == _valid_nkp_profile()['description']

    generated = client.post(f"/api/nkp/profiles/{profile['id']}/generate",
                            json={'filename': 'nkp-lab-management.yaml'},
                            headers=auth_headers)
    assert generated.status_code == 200
    payload = generated.get_json()
    assert payload['filename'] == 'nkp-lab-management.yaml'
    assert 'nutanix:' in payload['content']
    assert 'environment:' in payload['content']
    assert 'nkp-mgmt-lab' in payload['content']
    assert payload['schemaValidation']['status'] in {'pass', 'warn'}
    assert payload['readiness']['score'] >= 80
    assert payload['trace']['profileId'] == profile['id']
    assert payload['trace']['profileRevision'] == 3
    assert (isolated_data_dir / 'configs' / 'nkp-lab-management.yaml').exists()


def test_nkp_profile_rejects_missing_required_fields(client, auth_headers):
    resp = client.post('/api/nkp/profiles', json={'name': 'Incomplete'}, headers=auth_headers)
    assert resp.status_code == 400
    data = resp.get_json()
    assert data['validation']
    assert any('Cluster name' in item for item in data['validation'])


def test_nkp_profile_generate_rejects_path_traversal(client, auth_headers):
    create = client.post('/api/nkp/profiles', json=_valid_nkp_profile(), headers=auth_headers)
    profile = create.get_json()
    resp = client.post(f"/api/nkp/profiles/{profile['id']}/generate",
                       json={'filename': '../evil.yaml'},
                       headers=auth_headers)
    assert resp.status_code == 400


def test_nkp_profile_readiness_reports_ready_with_warnings(client, auth_headers):
    create = client.post('/api/nkp/profiles', json=_valid_nkp_profile(), headers=auth_headers)
    profile = create.get_json()
    resp = client.get(f"/api/nkp/profiles/{profile['id']}/readiness", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] in ('ready', 'needs_attention')
    assert data['score'] >= 80
    check_ids = {item['id'] for item in data['checks']}
    assert 'unique_ips' in check_ids
    assert 'generated_yaml' in check_ids


def test_nkp_profile_readiness_blocks_duplicate_and_outside_ips(client, auth_headers):
    profile = _valid_nkp_profile()
    profile['network']['subnet'] = '10.42.10.0/24'
    profile['cluster']['vip'] = '10.99.10.50'
    profile['nodes'][0]['hostIp'] = '10.42.10.21'
    profile['nodes'][0]['cvmIp'] = '10.42.10.21'
    resp = client.post('/api/nkp/profiles/readiness', json=profile, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == 'blocked'
    failed = {item['id'] for item in data['checks'] if item['status'] == 'fail'}
    assert 'subnet_membership' in failed
    assert 'unique_ips' in failed


def test_validation_evidence_create_list_download_delete(client, auth_headers):
    create = client.post('/api/nkp/profiles', json=_valid_nkp_profile(), headers=auth_headers)
    assert create.status_code == 201
    profile = create.get_json()

    evidence = client.post('/api/validation-evidence',
                           json={'profileId': profile['id'], 'notes': 'lab validation checkpoint'},
                           headers=auth_headers)
    assert evidence.status_code == 201
    record = evidence.get_json()
    assert record['profileId'] == profile['id']
    assert record['profileName'] == profile['name']
    assert record['generatedYaml']
    assert record['readiness']['score'] >= 80
    assert record['schemaValidation']['status'] in {'pass', 'warn'}

    listing = client.get('/api/validation-evidence', headers=auth_headers)
    assert listing.status_code == 200
    assert listing.get_json()[0]['id'] == record['id']

    download = client.get(f"/api/validation-evidence/{record['id']}/download", headers=auth_headers)
    assert download.status_code == 200
    with zipfile.ZipFile(io.BytesIO(download.data)) as zf:
        names = set(zf.namelist())
        assert any(name.endswith('/evidence.json') for name in names)
        assert any(name.endswith('/summary.md') for name in names)
        assert any(name.endswith('/generated.yaml') for name in names)

    delete = client.delete(f"/api/validation-evidence/{record['id']}", headers=auth_headers)
    assert delete.status_code == 200
    assert client.get(f"/api/validation-evidence/{record['id']}", headers=auth_headers).status_code == 404


def test_validation_evidence_recomputes_client_supplied_attestations(client, auth_headers):
    create = client.post('/api/nkp/profiles', json=_valid_nkp_profile(), headers=auth_headers)
    assert create.status_code == 201
    profile = create.get_json()

    evidence = client.post('/api/validation-evidence',
                           json={
                               'profileId': profile['id'],
                               'generatedYaml': 'forged: true\n',
                               'readiness': {'status': 'blocked', 'score': 0, 'checks': []},
                               'schemaValidation': {'status': 'fail', 'missing': ['everything']},
                               'compatibility': {'status': 'compatible', 'checks': []},
                           },
                           headers=auth_headers)

    assert evidence.status_code == 201
    record = evidence.get_json()
    assert 'forged: true' not in record['generatedYaml']
    assert 'nkp-mgmt-lab' in record['generatedYaml']
    assert record['readiness']['score'] >= 80
    assert record['schemaValidation']['status'] in {'pass', 'warn'}
    assert record['compatibility'] is None
    assert record['status'] in {'ready', 'needs_review'}


def test_validation_evidence_viewer_can_read_not_create_or_delete(client, auth_headers):
    create = client.post('/api/nkp/profiles', json=_valid_nkp_profile(), headers=auth_headers)
    profile = create.get_json()
    evidence = client.post('/api/validation-evidence',
                           json={'profileId': profile['id']},
                           headers=auth_headers).get_json()

    _create_user(client, auth_headers, 'evidence-viewer', 'viewer')
    viewer_headers = _login(client, 'evidence-viewer')

    assert client.get('/api/validation-evidence', headers=viewer_headers).status_code == 200
    assert client.get(f"/api/validation-evidence/{evidence['id']}/download", headers=viewer_headers).status_code == 200
    assert client.post('/api/validation-evidence', json={'profileId': profile['id']}, headers=viewer_headers).status_code == 403
    assert client.delete(f"/api/validation-evidence/{evidence['id']}", headers=viewer_headers).status_code == 403


def test_nkp_job_rejects_invalid_yaml_before_queue(client, auth_headers):
    resp = client.post('/api/nkp/jobs',
                       json={'phase': 'validate', 'configFile': 'bad.yaml', 'configContent': 'not: [valid'},
                       headers=auth_headers)
    assert resp.status_code == 400
    assert 'Invalid NKP YAML' in resp.get_json()['error']


def test_audit_log_returns_list(client, auth_headers):
    """Audit log endpoint returns a list (may be empty if log file absent)."""
    resp = client.get('/api/audit-log', headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_audit_log_passes_filters_to_storage(client, auth_headers, monkeypatch):
    """Audit log endpoint forwards operator-facing filters to storage."""
    import server

    captured = {}

    class AuditStorage:
        def read_audit_events(self, limit=200, level='', user='', action='', include_http=True):
            captured.update({
                'limit': limit,
                'level': level,
                'user': user,
                'action': action,
                'include_http': include_http,
            })
            return [{'msg': 'login_success', 'event': 'auth'}]

    monkeypatch.setattr(server, '_storage', AuditStorage())
    resp = client.get(
        '/api/audit-log?level=info&user=admin&action=login&include_http=false&limit=25',
        headers=auth_headers,
    )

    assert resp.status_code == 200
    assert resp.get_json() == [{'msg': 'login_success', 'event': 'auth'}]
    assert captured == {
        'limit': 25,
        'level': 'INFO',
        'user': 'admin',
        'action': 'login',
        'include_http': False,
    }


def test_audit_log_viewer_forbidden(client, auth_headers):
    """Audit log is admin-only."""
    _create_user(client, auth_headers, 'viewer_audit', 'viewer')
    vh = _login(client, 'viewer_audit')
    resp = client.get('/api/audit-log', headers=vh)
    assert resp.status_code == 403


def test_audit_log_operator_forbidden(client, auth_headers):
    """Audit log is restricted to admin role only."""
    _create_user(client, auth_headers, 'op_audit', 'operator')
    oh = _login(client, 'op_audit')
    resp = client.get('/api/audit-log', headers=oh)
    assert resp.status_code == 403


# ── Webhook helper ───────────────────────────────────────────────────────────

def test_database_backup_list_file_backend(client, auth_headers):
    """Database backup list is admin-only and reports disabled outside PostgreSQL mode."""
    resp = client.get('/api/maintenance/database-backups', headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['enabled'] is False
    assert data['storage'] == 'file'
    assert data['backups'] == []


def test_database_backup_create_requires_postgres(client, auth_headers):
    resp = client.post('/api/maintenance/database-backups', headers=auth_headers)
    assert resp.status_code == 400
    assert 'PostgreSQL storage' in resp.get_json()['error']


def test_database_backup_operator_forbidden(client, auth_headers):
    _create_user(client, auth_headers, 'op_backup', 'operator')
    oh = _login(client, 'op_backup')
    resp = client.get('/api/maintenance/database-backups', headers=oh)
    assert resp.status_code == 403


def test_database_backup_create_and_download(client, auth_headers, monkeypatch):
    """Admin can create and download a pg_dump backup when PostgreSQL mode is active."""
    import server

    calls = []

    class FakeResult:
        returncode = 0
        stdout = ''
        stderr = ''

    def fake_run(cmd, env=None, **kwargs):
        calls.append({'cmd': cmd, 'env': env, 'kwargs': kwargs})
        Path(cmd[cmd.index('--file') + 1]).write_bytes(b'PGDMP-test')
        return FakeResult()

    monkeypatch.setattr(server._storage, 'name', 'postgres')
    monkeypatch.setenv('ZTF_DATABASE_URL', 'postgresql://ztf:secret@postgres:5432/ztf_orchestrator')
    monkeypatch.setattr(server.subprocess, 'run', fake_run)

    resp = client.post('/api/maintenance/database-backups', headers=auth_headers)
    assert resp.status_code == 201
    backup = resp.get_json()['backup']
    assert backup['filename'].startswith('ztf-orchestrator-')
    assert backup['filename'].endswith('.dump')
    assert backup['size'] == len(b'PGDMP-test')
    assert calls[0]['env']['PGPASSWORD'] == 'secret'
    assert 'secret' not in calls[0]['cmd']

    listing = client.get('/api/maintenance/database-backups', headers=auth_headers)
    assert listing.status_code == 200
    assert listing.get_json()['backups'][0]['filename'] == backup['filename']

    download = client.get(f"/api/maintenance/database-backups/{backup['filename']}", headers=auth_headers)
    assert download.status_code == 200
    assert download.data == b'PGDMP-test'


def test_database_backup_restore_requires_confirmation(client, auth_headers, monkeypatch):
    import server

    monkeypatch.setattr(server._storage, 'name', 'postgres')
    backup_dir = server.POSTGRES_BACKUP_DIR
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup = backup_dir / 'ztf-orchestrator-20260614-120000-000001.dump'
    backup.write_bytes(b'PGDMP-test')

    resp = client.post(f"/api/maintenance/database-backups/{backup.name}/restore",
                       json={'confirmation': 'restore'},
                       headers=auth_headers)

    assert resp.status_code == 400
    assert 'RESTORE' in resp.get_json()['error']


def test_database_backup_restore_creates_safety_backup_and_runs_pg_restore(client, auth_headers, monkeypatch):
    """Admin restore creates a safety pg_dump before running pg_restore."""
    import server

    calls = []

    class FakeResult:
        returncode = 0
        stdout = ''
        stderr = ''

    def fake_run(cmd, env=None, **kwargs):
        calls.append({'cmd': cmd, 'env': env, 'kwargs': kwargs})
        if cmd[0] == 'pg_dump':
            Path(cmd[cmd.index('--file') + 1]).write_bytes(b'PGDMP-safety')
        return FakeResult()

    monkeypatch.setattr(server._storage, 'name', 'postgres')
    monkeypatch.setenv('ZTF_DATABASE_URL', 'postgresql://ztf:secret@postgres:5432/ztf_orchestrator')
    monkeypatch.setattr(server.subprocess, 'run', fake_run)

    backup_dir = server.POSTGRES_BACKUP_DIR
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup = backup_dir / 'ztf-orchestrator-20260614-120000-000001.dump'
    backup.write_bytes(b'PGDMP-target')

    resp = client.post(f"/api/maintenance/database-backups/{backup.name}/restore",
                       json={'confirmation': 'RESTORE'},
                       headers=auth_headers)

    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
    assert data['restored']['filename'] == backup.name
    assert data['safetyBackup']['filename'].startswith('ztf-orchestrator-')
    assert data['safetyBackup']['filename'] != backup.name
    assert data['restartRecommended'] is True

    assert calls[0]['cmd'][0] == 'pg_dump'
    assert calls[1]['cmd'][0] == 'pg_restore'
    assert '--clean' in calls[1]['cmd']
    assert '--single-transaction' in calls[1]['cmd']
    assert str(backup) in calls[1]['cmd']
    assert calls[1]['env']['PGPASSWORD'] == 'secret'
    assert 'secret' not in calls[1]['cmd']


def test_maintenance_lock_blocks_execution_submissions(client, auth_headers):
    import server

    assert server._enter_maintenance('database restore', 'test') is True
    try:
        job_resp = client.post('/api/jobs',
                               json={'script': 'AddAdServerPe', 'configFile': 'test.yml'},
                               headers=auth_headers)
        execute_resp = client.post('/api/execute',
                                   json={'script': 'AddAdServerPe', 'configFile': 'test.yml'},
                                   headers=auth_headers)
        nkp_resp = client.post('/api/nkp/jobs',
                               json={'phase': 'validate', 'configContent': 'cluster: test\n'},
                               headers=auth_headers)
    finally:
        server._exit_maintenance()

    for resp in (job_resp, execute_resp, nkp_resp):
        assert resp.status_code == 503
        body = resp.get_json()
        assert body['maintenance']['active'] is True
        assert 'database restore' in body['error']


def test_database_restore_rejects_running_jobs_and_releases_lock(client, auth_headers, monkeypatch):
    import server

    monkeypatch.setattr(server._storage, 'name', 'postgres')
    monkeypatch.setattr(server._job_manager, 'active_count', lambda: 1)

    resp = client.post('/api/maintenance/database-backups/ztf-orchestrator-20260614-120000-000001.dump/restore',
                       json={'confirmation': 'RESTORE'},
                       headers=auth_headers)

    assert resp.status_code == 409
    assert 'running or cancelling' in resp.get_json()['error']
    assert server._maintenance_active() is False


def test_database_restore_maintenance_lock_blocks_jobs_during_restore(client, auth_headers, monkeypatch):
    import server

    monkeypatch.setattr(server._storage, 'name', 'postgres')
    monkeypatch.setattr(server._job_manager, 'active_count', lambda: 0)

    def fake_restore(filename, requested_by):
        assert server._maintenance_active() is True
        with pytest.raises(RuntimeError, match='maintenance'):
            server._job_manager.submit({'script': 'AddAdServerPe', 'configFile': 'test.yml'}, requested_by)
        return {
            'restored': {'filename': filename, 'size': 1, 'createdAt': '2026-06-14T00:00:00.000000Z'},
            'safetyBackup': {'filename': 'ztf-orchestrator-safety.dump', 'size': 1, 'createdAt': '2026-06-14T00:00:01.000000Z'},
        }

    monkeypatch.setattr(server, '_restore_postgres_backup', fake_restore)

    resp = client.post('/api/maintenance/database-backups/ztf-orchestrator-20260614-120000-000001.dump/restore',
                       json={'confirmation': 'RESTORE'},
                       headers=auth_headers)

    assert resp.status_code == 200
    assert server._maintenance_active() is False


def test_database_backup_restore_operator_forbidden(client, auth_headers):
    _create_user(client, auth_headers, 'op_restore', 'operator')
    oh = _login(client, 'op_restore')
    resp = client.post('/api/maintenance/database-backups/ztf-orchestrator-20260614-120000-000001.dump/restore',
                       json={'confirmation': 'RESTORE'},
                       headers=oh)
    assert resp.status_code == 403


def test_database_backup_download_rejects_traversal(client, auth_headers):
    resp = client.get('/api/maintenance/database-backups/..%2Fsecret.dump', headers=auth_headers)
    assert resp.status_code in (400, 404)


def test_database_backup_restore_rejects_traversal(client, auth_headers):
    resp = client.post('/api/maintenance/database-backups/..%2Fsecret.dump/restore',
                       json={'confirmation': 'RESTORE'},
                       headers=auth_headers)
    assert resp.status_code in (400, 404)


def test_fire_webhook_success(monkeypatch):
    """_fire_webhook POSTs JSON and silently succeeds."""
    import server
    calls = []

    class FakeResp:
        def __enter__(self): return self
        def __exit__(self, *a): pass

    def fake_urlopen(req, timeout=None):
        calls.append({'url': req.full_url, 'data': req.data})
        return FakeResp()

    monkeypatch.setattr('socket.getaddrinfo',
                        lambda *a, **kw: [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('93.184.216.34', 443))])
    monkeypatch.setattr('urllib.request.urlopen', fake_urlopen)
    server._fire_webhook('https://example.com/hook', {'status': 'success', 'workflow': 'test'})
    assert len(calls) == 1
    assert b'success' in calls[0]['data']


def test_fire_webhook_failure_silent(monkeypatch):
    """_fire_webhook swallows exceptions — never raises."""
    import server

    def fake_urlopen(req, timeout=None):
        raise OSError('connection refused')

    monkeypatch.setattr('socket.getaddrinfo',
                        lambda *a, **kw: [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('93.184.216.34', 443))])
    monkeypatch.setattr('urllib.request.urlopen', fake_urlopen)
    server._fire_webhook('https://unreachable.example/hook', {'status': 'failed'})


def test_fire_webhook_rejects_insecure_scheme(monkeypatch):
    """Webhook delivery rejects plain HTTP by default."""
    import server
    calls = []

    monkeypatch.setattr('urllib.request.urlopen', lambda *a, **kw: calls.append(a))
    server._fire_webhook('http://example.com/hook', {'status': 'success'})
    assert calls == []


def test_fire_webhook_rejects_private_resolution(monkeypatch):
    """Webhook delivery blocks localhost/private destinations."""
    import server
    calls = []

    monkeypatch.setattr('socket.getaddrinfo',
                        lambda *a, **kw: [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 443))])
    monkeypatch.setattr('urllib.request.urlopen', lambda *a, **kw: calls.append(a))
    server._fire_webhook('https://internal.example/hook', {'status': 'success'})
    assert calls == []


# ── Security headers ─────────────────────────────────────────────────────────

def test_security_headers_present(client, auth_headers):
    resp = client.get('/api/settings', headers=auth_headers)
    assert resp.headers.get('X-Content-Type-Options') == 'nosniff'
    assert resp.headers.get('X-Frame-Options') == 'DENY'
    assert 'Cache-Control' in resp.headers


# ── Health ───────────────────────────────────────────────────────────────────

def test_health_returns_json(client):
    resp = client.get('/health')
    assert resp.content_type == 'application/json'
    data = resp.get_json()
    assert 'status' in data
    assert 'version' in data
    assert 'dataDir' not in data
    assert 'database' not in data
    assert 'jobs' not in data


def test_health_accepts_legacy_ztf_layout(client, auth_headers, tmp_path):
    ztf_dir = tmp_path / 'zerotouch-framework'
    ztf_dir.mkdir()
    (ztf_dir / 'main.py').write_text('print("ztf 1.x")\n')

    resp = client.post('/api/settings', json={'ztfPath': str(ztf_dir)}, headers=auth_headers)
    assert resp.status_code == 200

    resp = client.get('/health')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == 'healthy'
    assert data['ztf']['compatible'] is True
    assert data['ztf']['layout'] == 'legacy-1.x'


def test_health_flags_ztf_v2_layout_as_incompatible(client, auth_headers, tmp_path):
    ztf_dir = tmp_path / 'zerotouch-framework'
    (ztf_dir / 'ztf').mkdir(parents=True)
    (ztf_dir / 'ztf' / 'main.py').write_text('print("ztf 2.x")\n')
    (ztf_dir / 'pyproject.toml').write_text('[project]\nname = "nutanix-ztf"\nversion = "2.0.0"\n')

    resp = client.post('/api/settings', json={'ztfPath': str(ztf_dir)}, headers=auth_headers)
    assert resp.status_code == 200

    resp = client.get('/health')
    assert resp.status_code == 503
    data = resp.get_json()
    assert data['status'] == 'degraded'
    assert data['ztf']['compatible'] is False
    assert data['ztf']['layout'] == 'ztf-2.x'
    assert 'ZTF 2.x detected' in data['ztf']['message']


def test_system_check_reports_ztf_v2_incompatible(client, auth_headers, tmp_path):
    ztf_dir = tmp_path / 'zerotouch-framework'
    (ztf_dir / 'ztf').mkdir(parents=True)
    (ztf_dir / 'ztf' / 'main.py').write_text('print("ztf 2.x")\n')

    resp = client.post('/api/settings', json={'ztfPath': str(ztf_dir)}, headers=auth_headers)
    assert resp.status_code == 200

    resp = client.get('/api/system/check', headers=auth_headers)
    assert resp.status_code == 200
    payload = resp.get_json()
    checks = {item['name']: item for item in payload['checks']}

    assert payload['ztfInstalled'] is False
    assert payload['ztf']['layout'] == 'ztf-2.x'
    assert payload['ztf']['compatible'] is False
    assert checks['ZTF Installed']['ok'] is False
    assert 'ZTF 2.x detected' in checks['ZTF Installed']['value']
    assert 'nkpInstalled' in payload
    assert payload['nkpBinaries'] == {'total': 0, 'available': 0}
    assert checks['NKP Framework']['ok'] is True
    assert checks['NKP Framework']['value'] == 'not installed (optional)'
    assert checks['NKP Binaries']['ok'] is True
    assert checks['NKP Binaries']['value'] == 'none registered (optional)'


def test_ztf_v2_layout_blocks_legacy_job_submission(client, auth_headers, tmp_path):
    ztf_dir = tmp_path / 'zerotouch-framework'
    (ztf_dir / 'ztf').mkdir(parents=True)
    (ztf_dir / 'ztf' / 'main.py').write_text('print("ztf 2.x")\n')

    resp = client.post('/api/settings', json={'ztfPath': str(ztf_dir)}, headers=auth_headers)
    assert resp.status_code == 200

    resp = client.post('/api/jobs',
                       json={'workflow': 'cluster-create', 'configFile': 'cluster.yml'},
                       headers=auth_headers)
    assert resp.status_code == 409
    data = resp.get_json()
    assert data['ztf']['layout'] == 'ztf-2.x'
    assert 'legacy workflows require' in data['error']


def test_health_details_requires_admin(client):
    resp = client.get('/api/health/details')
    assert resp.status_code == 401


def test_health_details_returns_operational_data_for_admin(client, auth_headers):
    resp = client.get('/api/health/details', headers=auth_headers)
    assert resp.status_code in (200, 503)
    data = resp.get_json()
    assert 'status' in data
    assert 'version' in data
    assert 'dataDir' in data
    assert 'database' in data
    assert 'jobs' in data
    assert 'nkp_installed' in data


def test_operational_visibility_summary_returns_dashboard_counts(client, auth_headers, isolated_data_dir):
    import server

    now = server._now_iso()
    old = '2026-01-01T00:00:00.000000Z'
    server.write_json(server.JOBS_FILE, [
        {'id': 'job-running', 'status': 'running', 'createdAt': old, 'startedAt': old, 'workflow': 'nkp:validate'},
        {'id': 'job-queued', 'status': 'queued', 'createdAt': now, 'workflow': 'cluster-create'},
        {'id': 'job-failed', 'status': 'failed', 'createdAt': now, 'workflow': 'deploy-pc'},
    ])
    server.write_json(server.APPROVALS_FILE, [
        {'id': 'approval-1', 'status': 'pending', 'workflow': 'deploy-pc'},
        {'id': 'approval-2', 'status': 'approved', 'workflow': 'config-pc'},
    ])
    server.write_json(server.SCHEDULES_FILE, [
        {'id': 'schedule-1', 'name': 'Nightly Drift', 'enabled': True, 'nextRun': '2026-12-01T01:00:00.000000Z', 'lastStatus': None},
        {'id': 'schedule-2', 'name': 'Failed Backup', 'enabled': True, 'nextRun': None, 'lastRun': now, 'lastStatus': 'failed'},
    ])
    server._save_drift_runs([
        {'id': 'drift-1', 'status': 'drifted', 'configFile': 'a.yaml', 'summary': {'changed': 1, 'missing': 0, 'unexpected': 0}},
        {'id': 'drift-2', 'status': 'unknown', 'configFile': 'b.yaml', 'summary': {'changed': 0, 'missing': 0, 'unexpected': 0}},
    ])
    server._save_nkp_profiles([_valid_nkp_profile()])
    configs_dir = isolated_data_dir / 'configs'
    configs_dir.mkdir(exist_ok=True)
    (configs_dir / 'nkp-lab.yaml').write_text('metadata:\n  name: lab\n')

    resp = client.get('/api/visibility/summary', headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['operations']['queued'] == 1
    assert data['operations']['running'] == 1
    assert data['operations']['failed'] == 1
    assert data['operations']['longRunning'] == 1
    assert data['governance']['pendingApprovals'] == 1
    assert data['governance']['driftedChecks'] == 1
    assert data['governance']['unknownBaselines'] == 1
    assert data['schedules']['enabled'] == 2
    assert data['schedules']['lastFailed'] == 'Failed Backup'
    assert data['storage']['backend'] == 'file'
    assert data['deployment']['nkpProfiles'] == 1
    assert data['deployment']['generatedNkpConfigs'] == 1


def test_jobs_limit_must_be_integer(client, auth_headers):
    resp = client.get('/api/jobs?limit=abc', headers=auth_headers)
    assert resp.status_code == 400
    assert 'limit' in resp.get_json()['error']


def test_jobs_stream_offset_must_be_integer(client, auth_headers):
    resp = client.get('/api/jobs/example/stream?offset=abc', headers=auth_headers)
    assert resp.status_code == 400
    assert 'offset' in resp.get_json()['error']


def test_audit_log_limit_must_be_integer(client, auth_headers):
    resp = client.get('/api/audit-log?limit=abc', headers=auth_headers)
    assert resp.status_code == 400
    assert 'limit' in resp.get_json()['error']


def test_spa_deep_link_serves_react_app(client):
    """Direct browser loads of React routes should not be treated as missing static files."""
    resp = client.get('/setup')
    assert resp.status_code == 200
    assert b'<div id="root">' in resp.data


def test_legacy_favicon_serves_veridian_mark(client):
    resp = client.get('/favicon.ico')
    assert resp.status_code == 200
    assert resp.mimetype == 'image/x-icon'
    assert resp.data[:4] == b'\x00\x00\x01\x00'
