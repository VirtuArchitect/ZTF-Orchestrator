from copy import deepcopy
import time

import pytest

import dare_workflow as dare
from ahv_uplink_migration import MigrationError, canonical

CLUSTER = '12345678-0000-4000-8000-000000000001'
SERIALS = ['serial-1', 'serial-2', 'serial-3']
CONNECTION = {'pc_endpoint': 'https://pc.example.com:9440', 'pc_credential': 'pc_admin',
              'pe_endpoint': 'https://pe.example.com:9440', 'pe_credential': 'pe_admin',
              'cluster_uuid': CLUSTER}
INTENT = {'connection': CONNECTION, 'recoveryReference': 'CHG-123',
          'review': dict.fromkeys(('license', 'keyManager', 'backup', 'irreversible', 'prismState'), True)}
PATH = f'{dare.CLUSTERS}/{CLUSTER}/encryption-config'
EXPECTED = {'$objectType': dare.CONFIG_TYPE, 'type': 'SOFTWARE', 'scope': 'CLUSTER',
            'kmsSpec': {'$objectType': 'clustermgmt.v4.config.KmsSpec', 'kmsType': 'NATIVE_LOCAL'}}


class Prism:
    def __init__(self):
        self.state = {'$objectType': dare.CONFIG_TYPE}
        self.etag = '"revision-1"'
        self.task_status = 'SUCCEEDED'
        self.pc_serials = SERIALS.copy()
        self.health = 'Good'
        self.writes = []

    def exchange(self, method, path, body=None, etag=None):
        if method == 'GET':
            if path == PATH:
                return deepcopy(self.state), self.etag, {}
            assert path == f'{dare.CLUSTERS}/{CLUSTER}'
            return {'extId': CLUSTER, 'name': 'LAB-AHV-01'}, None, {}
        self.writes.append((method, path, body, etag))
        assert (method, path, body, etag) == ('PUT', PATH, EXPECTED, self.etag)
        self.state = deepcopy(body)
        return {'extId': 'task-1'}, None, {}

    def task(self, identity):
        assert identity == 'task-1'
        return {'status': self.task_status}

    def rows(self, path):
        assert path == f'{dare.CLUSTERS}/{CLUSTER}/hosts'
        return [{'nodeSerial': serial, 'hypervisor': {'type': 'AHV'}} for serial in self.pc_serials]

    def request(self, method, path):
        assert method == 'GET'
        if path.endswith('/cluster/'):
            return {'name': 'LAB-AHV-01', 'uuid': CLUSTER, 'version': '7.5.1.8',
                    'health_summary': {'health_status': self.health}}
        assert path.endswith('/hosts/')
        return {'metadata': {'grand_total_entities': len(SERIALS)},
                'entities': [{'serial': serial, 'health_summary': {'health_status': 'Good'}} for serial in SERIALS]}


@pytest.fixture
def prism(monkeypatch):
    target = Prism()
    monkeypatch.setattr(dare, 'clients', lambda connection, resolver: (target, target))
    return target


def test_preflight_and_verify_never_repeat_put(prism):
    assert dare.inspect(CONNECTION, None)['state'] == 'unconfigured'
    plan = dare.preflight(INTENT, None)
    assert not prism.writes
    progress = []
    result = dare.execute(plan, None, lambda: None, lambda: False, progress.append)
    assert result == {'encryptionState': 'enabled', 'backgroundStatus': 'unreported', 'lastKeyBackupAt': None}
    assert 'Prism task task-1' in progress
    assert dare.execute(plan, None, lambda: pytest.fail('authorization for unexpected write'),
                        lambda: False, progress.append)['encryptionState'] == 'already_configured'
    assert len(prism.writes) == 1


@pytest.mark.parametrize('state,etag', [
    ({}, '"valid"'), ({'$objectType': dare.CONFIG_TYPE}, 'W/"weak"'),
    ({'$objectType': dare.CONFIG_TYPE, 'type': 'SOFTWARE'}, '"valid"'),
    ({'$objectType': dare.CONFIG_TYPE, 'type': '$UNKNOWN'}, '"valid"'),
    ({'$objectType': dare.CONFIG_TYPE, 'kmsSpec': {'kmsType': 'EXTERNAL'}}, '"valid"'),
])
def test_missing_or_partial_state_is_never_interpreted_as_disabled(prism, state, etag):
    prism.state, prism.etag = state, etag
    with pytest.raises(dare.DareError):
        dare.preflight(INTENT, None)
    assert not prism.writes


@pytest.mark.parametrize('change', ['revision', 'membership', 'health', 'attestations'])
def test_rejects_changes_and_missing_attestation(prism, change):
    plan = dare.preflight(INTENT, None)
    if change == 'revision':
        prism.etag = '"new-revision"'
    elif change == 'membership':
        prism.pc_serials[0] = 'different-host'
    elif change == 'health':
        prism.health = 'Warning'
    else:
        modified = deepcopy(INTENT)
        modified['review']['backup'] = False
        with pytest.raises(dare.DareError, match='backup plan'):
            dare.preflight(modified, None)
        return
    with pytest.raises(dare.DareError):
        dare.execute(plan, None, lambda: pytest.fail('unexpected write'), lambda: False, lambda line: None)
    assert not prism.writes


def test_failed_task_is_not_retried(prism):
    prism.task_status = 'FAILED'
    with pytest.raises(MigrationError, match='task did not succeed'):
        dare.execute(dare.preflight(INTENT, None), None, lambda: None, lambda: False, lambda line: None)
    assert len(prism.writes) == 1


def test_dare_is_admin_only_and_apply_is_bound_to_one_approved_job(client, auth_headers, monkeypatch, prism):
    import server

    monkeypatch.delenv('ZTF_DARE_ENABLE_MUTATION', raising=False)
    monkeypatch.setattr(server.limiter, 'enabled', False)
    assert client.get('/api/dare').status_code == 401
    operator = server._create_session('test-operator', 'operator')
    assert client.post('/api/dare/discover', json=CONNECTION,
                       headers={'Authorization': f'Bearer {operator}'}).status_code == 403
    assert client.post('/api/approvals', json={'workflow': dare.WORKFLOW}, headers=auth_headers).status_code == 400
    assert client.get('/api/dare', headers=auth_headers).get_json() == {'applyEnabled': False}
    response = client.post('/api/dare/preflight', json=INTENT, headers=auth_headers)
    assert response.status_code == 200
    content = response.get_json()['content']
    assert response.get_json()['state'] == 'unconfigured'
    assert not prism.writes
    approval = client.post('/api/dare/approval', json={'content': content}, headers=auth_headers)
    assert approval.status_code == 201
    approval_id = approval.get_json()['id']
    payload = {'content': content, 'approvalId': approval_id, 'confirmation': f'ENCRYPT {CLUSTER}'}
    assert client.post('/api/dare/apply', json=payload, headers=auth_headers).status_code == 403
    monkeypatch.setenv('ZTF_DARE_ENABLE_MUTATION', 'true')
    assert client.post('/api/dare/apply', json=payload, headers=auth_headers).status_code == 403
    url = f'/api/approvals/{approval_id}/approve'
    assert client.post(url, json={}, headers=auth_headers).status_code == 403
    approver = server._create_session('separate-admin', 'admin')
    approver_headers = {'Authorization': f'Bearer {approver}'}
    assert client.post(url, json={}, headers=approver_headers).status_code == 200
    changed = dare.parse_plan(content)
    changed['intent']['recoveryReference'] = 'OTHER-123'
    assert client.post('/api/dare/apply', json={**payload, 'content': canonical(changed)}, headers=auth_headers).status_code == 403
    assert client.post('/api/dare/apply', json={**payload, 'confirmation': 'wrong'}, headers=auth_headers).status_code == 403
    assert client.post('/api/dare/apply', json=payload, headers=approver_headers).status_code == 403
    accepted = client.post('/api/dare/apply', json=payload, headers=auth_headers)
    assert accepted.status_code == 202
    identity = accepted.get_json()['id']
    assert client.post('/api/dare/apply', json=payload, headers=auth_headers).get_json()['id'] == identity
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        job = client.get(f'/api/jobs/{identity}?logs=false', headers=auth_headers).get_json()
        if job['status'] in {'success', 'failed'}:
            break
        time.sleep(0.05)
    assert job['status'] == 'success', job.get('diagnostics')
    assert job['diagnostics']['encryptionState'] == 'enabled'
    assert len(prism.writes) == 1
