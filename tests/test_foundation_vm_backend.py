"""Focused coverage for the controlled classic Foundation VM backend."""

import io
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import yaml

import foundation_vm_backend as backend


def _config(*, configure_ipmi=False):
    nodes = []
    for index, position in enumerate(('A', 'B', 'C'), start=1):
        nodes.append({
            'block_serial': 'BLOCK-01',
            'node_serial': f'NODE-{position}',
            'node_position': position,
            'node_role': 'hyperconverged',
            'ipmi_credential_ref': f'idrac-{index}',
            'ipmi_ip': f'10.0.0.{30 + index}',
            'ipmi_mac': f'00:11:22:33:44:{index:02d}',
            'ipmi_configure_now': configure_ipmi and index == 1,
            'host_ip': f'10.0.0.{20 + index}',
            'hypervisor_hostname': f'ahv-{index:02d}',
            'cvm_ip': f'10.0.0.{10 + index}',
            'cvm_ram_gb': 20,
        })
    return {
        'foundation_vm_ip': '192.0.2.10',
        'foundation_vm_options': {
            'hardware_platform': 'dell_xc',
            'lag_type': 'dynamic',
            'lacp_rate': 'fast',
            'rdma_passthrough': False,
        },
        'aos_hypervisor_images': {
            'hypervisor_type': 'AHV',
            'aos_package': 'aos.tar.gz',
            'hypervisor_iso': 'ahv.iso',
        },
        'hypervisor_credential': 'hypervisor-admin',
        'cluster_credential': 'cluster-admin',
        'common_network_settings': {
            'dns_servers': ['10.0.0.2'],
            'ntp_servers': ['10.0.0.3'],
        },
        'create_clusters': [{
            'cluster_name': 'LAB-CLUSTER',
            'cluster_vip': '10.0.0.10',
            'redundancy_factor': 2,
            'timezone': 'Europe/Berlin',
            'host_netmask': '255.255.255.0',
            'host_gateway': '10.0.0.1',
            'cvm_netmask': '255.255.255.0',
            'cvm_gateway': '10.0.0.1',
            'ipmi_netmask': '255.255.255.0',
            'ipmi_gateway': '10.0.0.1',
            'nodes_list': nodes,
        }],
    }


def _resolver(reference):
    return f'{reference}-user', f'{reference}-password', ''


def _yaml(*, configure_ipmi=False):
    return yaml.safe_dump(_config(configure_ipmi=configure_ipmi), sort_keys=False)


def test_native_payload_matches_foundation_shape_and_redacts_secrets():
    payload = backend.build_native_payload(_config(configure_ipmi=True), _resolver)

    assert payload['ui_platform'] == 'dell_xc'
    assert payload['bond_mode'] == 'dynamic'
    assert payload['ui_is_installing_cvm'] is True
    assert payload['ui_is_installing_hypervisor'] is True
    assert payload['hypervisor_password'] == 'hypervisor-admin-password'
    assert 'cvm_password' not in payload
    assert payload['blocks'][0]['nodes'][0]['node_position'] == 'A'
    assert payload['blocks'][0]['nodes'][0]['ipmi_configure_now'] is True
    assert payload['blocks'][0]['nodes'][0]['hypervisor'] == 'kvm'
    assert payload['clusters'][0]['cluster_members'] == ['10.0.0.11', '10.0.0.12', '10.0.0.13']

    redacted = backend.redact_payload(payload)
    rendered = json.dumps(redacted)
    assert 'hypervisor-admin-password' not in rendered
    assert 'idrac-root-password' not in rendered
    assert 'cluster-admin-password' not in rendered
    assert redacted['hypervisor_password'] == '***'
    assert redacted['blocks'][0]['nodes'][0]['ipmi_password'] == '***'
    assert redacted['clusters'][0]['cluster_password'] == '***'


def test_intent_validation_enforces_memory_positions_roles_and_networks():
    config = _config()
    config['create_clusters'][0]['nodes_list'][0]['cvm_ram_gb'] = 12
    config['create_clusters'][0]['nodes_list'][1]['node_position'] = 'A'
    config['create_clusters'][0]['nodes_list'][2]['node_role'] = 'invalid'
    config['create_clusters'][0]['nodes_list'][2]['host_ip'] = '192.168.1.20'

    errors = backend.validate_intent(config, _resolver)

    assert any('at least 20' in error for error in errors)
    assert any('duplicates a position' in error for error in errors)
    assert any('node_role is invalid' in error for error in errors)
    assert any('outside the host_gateway subnet' in error for error in errors)


def test_image_selection_accepts_nested_inventory_and_rejects_missing_image():
    inventory = {
        'aos': [{'name': '/home/nutanix/foundation/nos/aos.tar.gz'}],
        'hypervisors': {'kvm': ['/home/nutanix/foundation/isos/ahv.iso']},
    }
    assert backend.validate_image_selection(_config(), inventory) == []

    inventory['hypervisors'] = {'kvm': []}
    errors = backend.validate_image_selection(_config(), inventory)
    assert errors == ['aos_hypervisor_images.hypervisor_iso is not present in Foundation image inventory: ahv.iso']


def test_upload_streams_octet_body_with_native_query_parameters(tmp_path, monkeypatch):
    image = tmp_path / 'staged-image'
    image.write_bytes(b'foundation-image')
    captured = {'headers': {}, 'body': bytearray()}

    class Response:
        status = 200
        reason = 'OK'

        @staticmethod
        def read(_limit):
            return b'{"name":"/home/nutanix/foundation/nos/aos.tar.gz"}'

    class Connection:
        def __init__(self, host, port, **_kwargs):
            captured['host'] = host
            captured['port'] = port

        def putrequest(self, method, target):
            captured['method'] = method
            captured['target'] = target

        def putheader(self, key, value):
            captured['headers'][key] = value

        def endheaders(self):
            pass

        def send(self, data):
            captured['body'].extend(data)

        @staticmethod
        def getresponse():
            return Response()

        @staticmethod
        def close():
            pass

    monkeypatch.setattr(backend.http.client, 'HTTPConnection', Connection)

    ok, error, body, _latency = backend.upload_image(
        {'foundation_vm_ip': '192.0.2.10'}, image, 'nos', 'aos.tar.gz',
    )

    query = parse_qs(urlparse(captured['target']).query)
    assert ok is True
    assert error == ''
    assert body['name'].endswith('aos.tar.gz')
    assert query == {'installer_type': ['nos'], 'filename': ['aos.tar.gz']}
    assert captured['headers']['Content-Type'] == 'application/octet-stream'
    assert bytes(captured['body']) == b'foundation-image'


def test_api_validation_and_controlled_job_lifecycle(client, auth_headers, monkeypatch):
    import server

    client.post('/api/settings', json={'approvalRequiredWorkflows': []}, headers=auth_headers)
    monkeypatch.setattr(server, 'FOUNDATION_VM_MUTATION_ENABLED', True)
    monkeypatch.setattr(server, '_lookup_credential_ref', _resolver)
    monkeypatch.setattr(server, '_workflow_approval_error', lambda *_args, **_kwargs: '')
    monkeypatch.setattr(server, '_foundation_vm_image_inventory', lambda _config: ({
        'aos': ['aos.tar.gz'], 'hypervisors': {'kvm': ['ahv.iso']},
    }, []))
    monkeypatch.setattr(server, '_run_foundation_vm_preflight', lambda _config: (['[PASS] preflight'], 1, 0))
    requests = []

    def request_json(_config, resource, **kwargs):
        requests.append((resource, kwargs.get('method', 'GET')))
        if resource == 'progress':
            return True, '', {'aggregate_status': 'completed', 'aggregate_percent_complete': 100}, 1.0
        if resource == 'image_nodes':
            return True, '', {'accepted': True, 'ipmi_password': 'idrac-1-password'}, 1.0
        return True, '', {'accepted': True}, 1.0

    monkeypatch.setattr(server, '_foundation_vm_request_json', request_json)

    validation = client.post('/api/foundation-vm/validate', json={'configContent': _yaml()}, headers=auth_headers)
    assert validation.status_code == 200
    assert validation.get_json()['valid'] is True
    assert validation.get_json()['payload']['hypervisor_password'] == '***'

    response = client.post('/api/jobs', json={
        'workflow': 'cluster-create-foundation-vm',
        'configContent': _yaml(configure_ipmi=True),
        'configFile': 'create_foundation_vm_cluster.yml',
        'destructiveConfirmation': 'DEPLOY FOUNDATION VM',
    }, headers=auth_headers)
    assert response.status_code == 202
    job_id = response.get_json()['id']

    import time
    for _ in range(60):
        job = client.get(f'/api/jobs/{job_id}', headers=auth_headers).get_json()
        if job['status'] in {'success', 'failed'}:
            break
        time.sleep(0.05)

    assert job['status'] == 'success'
    assert ('ipmi_config', 'POST') in requests
    assert ('image_nodes', 'POST') in requests
    assert ('progress', 'GET') in requests
    log_text = json.dumps(job['logs'])
    assert 'idrac-1-password' not in log_text
    assert 'hypervisor-admin-password' not in log_text
    assert job['progress']['percent'] == 100

    restart = client.post(f'/api/jobs/{job_id}/restart', json={
        'confirmation': 'RESTART FOUNDATION VM',
    }, headers=auth_headers)
    assert restart.status_code == 409


def test_failed_foundation_job_can_be_restarted_with_lineage(client, auth_headers, monkeypatch):
    import server
    import time

    client.post('/api/settings', json={'approvalRequiredWorkflows': []}, headers=auth_headers)
    monkeypatch.setattr(server, 'FOUNDATION_VM_MUTATION_ENABLED', True)
    monkeypatch.setattr(server, '_lookup_credential_ref', _resolver)
    monkeypatch.setattr(server, '_workflow_approval_error', lambda *_args, **_kwargs: '')
    monkeypatch.setattr(server, '_run_foundation_vm_preflight', lambda _config: (['[PASS] preflight'], 1, 0))
    attempts = {'image_nodes': 0}

    def request_json(_config, resource, **_kwargs):
        if resource == 'image_nodes':
            attempts['image_nodes'] += 1
            if attempts['image_nodes'] == 1:
                return False, 'simulated handoff failure', {}, 1.0
        if resource == 'progress':
            return True, '', {'aggregate_status': 'completed', 'aggregate_percent_complete': 100}, 1.0
        return True, '', {'accepted': True}, 1.0

    monkeypatch.setattr(server, '_foundation_vm_request_json', request_json)
    response = client.post('/api/jobs', json={
        'workflow': 'cluster-create-foundation-vm',
        'configContent': _yaml(),
        'configFile': 'create_foundation_vm_cluster.yml',
        'destructiveConfirmation': 'DEPLOY FOUNDATION VM',
    }, headers=auth_headers)
    assert response.status_code == 202
    job_id = response.get_json()['id']

    for _ in range(60):
        failed = client.get(f'/api/jobs/{job_id}', headers=auth_headers).get_json()
        if failed['status'] in {'success', 'failed'}:
            break
        time.sleep(0.05)
    assert failed['status'] == 'failed'

    restart = client.post(f'/api/jobs/{job_id}/restart', json={
        'confirmation': 'RESTART FOUNDATION VM',
    }, headers=auth_headers)
    assert restart.status_code == 202
    restarted_id = restart.get_json()['id']
    assert restarted_id != job_id

    for _ in range(60):
        restarted = client.get(f'/api/jobs/{restarted_id}', headers=auth_headers).get_json()
        if restarted['status'] in {'success', 'failed'}:
            break
        time.sleep(0.05)

    assert restarted['status'] == 'success'
    assert restarted['restartedFromJobId'] == job_id


def test_abort_route_requires_confirmation_and_calls_foundation(client, auth_headers, monkeypatch):
    import server

    monkeypatch.setattr(server, 'FOUNDATION_VM_MUTATION_ENABLED', True)
    requests = []

    def request_json(_config, resource, **kwargs):
        requests.append((resource, kwargs.get('method', 'GET'), kwargs.get('payload')))
        return True, '', {'aborted': True}, 1.0

    monkeypatch.setattr(server, '_foundation_vm_request_json', request_json)
    rejected = client.post('/api/foundation-vm/abort', json={
        'configContent': _yaml(),
        'confirmation': 'abort',
    }, headers=auth_headers)
    assert rejected.status_code == 403

    response = client.post('/api/foundation-vm/abort', json={
        'configContent': _yaml(),
        'confirmation': 'ABORT FOUNDATION VM',
    }, headers=auth_headers)
    assert response.status_code == 200
    assert response.get_json()['status'] == 'abort_requested'
    assert requests == [('abort_session', 'POST', {})]


def test_upload_route_is_admin_gated_and_removes_staging_file(client, auth_headers, monkeypatch):
    import server

    monkeypatch.setattr(server, 'FOUNDATION_VM_IMAGE_UPLOAD_ENABLED', True)
    observed = {}

    def upload(_config, path, installer_type, filename):
        observed.update({'exists': path.exists(), 'installerType': installer_type, 'filename': filename, 'path': path})
        return True, '', {'name': filename}, 2.0

    monkeypatch.setattr(server, '_foundation_vm_upload_image', upload)
    response = client.post('/api/foundation-vm/images/upload', data={
        'installerType': 'nos',
        'configContent': _yaml(),
        'file': (io.BytesIO(b'image'), 'aos.tar.gz'),
    }, headers=auth_headers, content_type='multipart/form-data')

    assert response.status_code == 200
    assert response.get_json()['status'] == 'uploaded'
    assert observed['exists'] is True
    assert observed['filename'] == 'aos.tar.gz'
    assert observed['installerType'] == 'nos'
    assert not Path(observed['path']).exists()
