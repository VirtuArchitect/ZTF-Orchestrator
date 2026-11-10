from copy import deepcopy
import datetime
from hashlib import sha256
import socket
import time
from unittest.mock import MagicMock

import pytest

import post_deployment as post
from ahv_uplink_migration import MigrationError, canonical


CLUSTER = '12345678-0000-4000-8000-000000000001'
PC = '12345678-0000-4000-8000-000000000002'
PE = 'https://pe.example.com:9440'
FQDN = 'new-pe.example.com'
REPOSITORY = 'https://lcm.example.com/release'
SERIALS = ['S1', 'S2', 'S3']
CONNECTION = {'pe_endpoint': PE, 'pe_credential': 'pe_ref', 'pc_endpoint': 'https://pc.example.com:9440',
              'pc_credential': 'pc_ref', 'cluster_uuid': CLUSTER}
FQDN_INTENT = {'connection': CONNECTION, 'fqdn': FQDN}
LCM_INTENT = {'connection': CONNECTION, 'repository': REPOSITORY}
ACCEPTANCE = {**FQDN_INTENT, 'repository': REPOSITORY, 'hostSerials': SERIALS, 'containers': ['data']}


class Prism:
    def __init__(self):
        self.headers = {}
        self.identity = CLUSTER
        self.network = {'$objectType': post.NETWORK_TYPE, 'fqdn': 'old-pe.example.com',
                        'externalAddress': {'ipv4': {'value': '192.0.2.1'}}}
        self.etag = '"first"'
        self.writes = []
        self.status = 'SUCCEEDED'
        self.in_progress = None
        self.repository = REPOSITORY
        self.container_names = ['data']

    def pc_uuid(self):
        return PC

    def pe(self, identity):
        assert identity == CLUSTER
        return {'uuid': identity, 'name': 'LAB'}

    def request(self, method, path):
        assert method == 'GET'
        if path.endswith('/cluster/'):
            return {'uuid': self.identity, 'name': 'LAB', 'version': '7.5.1.8',
                    'cluster_external_ipaddress': '192.0.2.1', 'health_summary': {'health_status': 'Good'}}
        assert path.endswith('/hosts/')
        return {'metadata': {'grand_total_entities': 3}, 'entities': [
            {'serial': serial, 'service_vmexternal_ip': f'192.0.2.{i + 10}',
             'health_summary': {'health_status': 'Good'}} for i, serial in enumerate(SERIALS)]}

    def rows(self, path):
        assert path.endswith(f'/{CLUSTER}/hosts')
        return [{'nodeSerial': serial, 'hypervisor': {'type': 'AHV'}} for serial in SERIALS]

    def containers(self):
        return [{'name': name} for name in self.container_names]

    def exchange(self, method, path, body=None, etag=None):
        if path in {post.LCM_CONFIG, post.LCM_STATUS, post.LCM_INVENTORY}:
            assert self.headers.get('X-Cluster-Id') == CLUSTER
        else:
            assert 'X-Cluster-Id' not in self.headers
        if method == 'GET':
            if path == post.LCM_CONFIG:
                return {'$objectType': 'lifecycle.v4.resources.Config', 'url': self.repository,
                        'connectivityType': 'DARKSITE_WEB_SERVER', 'hasModuleAutoUpgradeEnabled': False}, None, {}
            if path == post.LCM_STATUS:
                return {'$objectType': 'lifecycle.v4.resources.StatusInfo', 'isUrlAccessible': True,
                        'connectivityType': 'DARKSITE_WEB_SERVER', 'isRestrictedMode': False,
                        'isCancelIntentSet': False, 'inProgressOperation': self.in_progress}, None, {}
            assert path.endswith(f'/clusters/{CLUSTER}')
            return {'$objectType': post.CLUSTER_TYPE, 'extId': CLUSTER, 'name': 'LAB',
                    'network': deepcopy(self.network)}, self.etag, {}
        self.writes.append((method, path, body, etag, self.headers.copy()))
        if method == 'PUT':
            assert path == post.CLUSTERS + CLUSTER and etag == self.etag
            self.network = deepcopy(body['network'])
        else:
            assert method == 'POST' and path == post.LCM_INVENTORY and body is None
        return {'extId': 'test-task'}, None, {}

    def task(self, identity):
        assert identity == 'test-task' and not self.headers
        return {'status': self.status}


@pytest.fixture
def prism(monkeypatch):
    target = Prism()
    monkeypatch.setattr(post, 'clients', lambda *_: (target, target))
    monkeypatch.setattr(post, '_verify_pe_name', lambda name, identity, pe: None)
    return target


@pytest.mark.parametrize('value', ['pe', '192.0.2.1', 'pe.example.com.', 'pe.example.com:9440',
                                   'https://pe.example.com', '-pe.example.com'])
def test_fqdn_rejects_noncanonical_targets(value):
    with pytest.raises(post.PostDeploymentError):
        post.fqdn(value)


def test_new_dns_name_cannot_send_pe_credentials_to_an_unapproved_address(monkeypatch):
    pe = Prism()
    monkeypatch.setattr(socket, 'getaddrinfo', lambda *args, **kw: [(0, 0, 0, '', ('192.0.2.99', 9440))])
    monkeypatch.setattr(socket, 'create_connection', lambda *args, **kw: pytest.fail('unexpected connection'))
    with pytest.raises(post.PostDeploymentError, match='DNS must resolve'):
        post._verify_pe_name(FQDN, CLUSTER, pe)


def test_certificate_check_pins_address_and_verifies_pe_before_reporting_fingerprint(monkeypatch):
    target = Prism()
    monkeypatch.setattr(post, 'clients', lambda *_: (target, target))
    monkeypatch.setattr(socket, 'getaddrinfo', lambda *args, **kw: [(0, 0, 0, '', ('192.0.2.1', 9440))])
    raw, context, client = MagicMock(), MagicMock(), MagicMock()
    connect = MagicMock(return_value=raw)
    monkeypatch.setattr(socket, 'create_connection', connect)
    monkeypatch.setattr(post.ssl, 'create_default_context', lambda: context)
    monkeypatch.setattr(post.http.client, 'HTTPConnection', lambda *args, **kw: client)
    secure = context.wrap_socket.return_value.__enter__.return_value
    secure.getpeercert.return_value = b'test-certificate'
    response = client.getresponse.return_value
    response.status = 200
    response.read.return_value = f'{{"uuid":"{CLUSTER}"}}'.encode()
    assert post.certificate_check(FQDN_INTENT, None)['endpoints'] == [
        {'address': '192.0.2.1', 'leafSha256': sha256(b'test-certificate').hexdigest()}]
    connect.assert_called_once_with(('192.0.2.1', 9440), timeout=5)
    context.wrap_socket.assert_called_once_with(raw.__enter__.return_value, server_hostname=FQDN)
    client.request.assert_called_once_with('GET', '/api/nutanix/v2.0/cluster/', headers=target.headers)
    response.read.return_value = f'{{"uuid":"{PC}"}}'.encode()
    with pytest.raises(post.PostDeploymentError, match='authenticated PE identity'):
        post.certificate_check(FQDN_INTENT, None)


def test_rename_plan_uses_operator_order_and_blocks_unexpected_members(prism):
    result = post.cvm_rename_plan({'connection': CONNECTION, 'hostSerials': ['S3', 'S1', 'S2']}, None)
    assert result == {'clusterUuid': CLUSTER, 'nodes': [
        {'serial': 'S3', 'cvmAddress': '192.0.2.12', 'displayName': 'NTNX-LAB-N01-CVM'},
        {'serial': 'S1', 'cvmAddress': '192.0.2.10', 'displayName': 'NTNX-LAB-N02-CVM'},
        {'serial': 'S2', 'cvmAddress': '192.0.2.11', 'displayName': 'NTNX-LAB-N03-CVM'},
    ]}
    with pytest.raises(post.PostDeploymentError, match='match healthy AHV'):
        post.cvm_rename_plan({'connection': CONNECTION, 'hostSerials': ['S3', 'S1', 'S4']}, None)
    assert not prism.writes


def run(plan, authorize=lambda: None):
    return post.execute(plan, None, authorize, lambda: False, lambda line: None)


def test_fqdn_uses_one_conditional_put_and_preserves_network(prism):
    plan = post.preflight(post.FQDN, FQDN_INTENT, None)
    assert post.parse_plan(canonical(plan)) == plan
    assert prism.writes == []
    assert run(plan) == {'status': 'verified', 'taskId': 'test-task'}
    assert prism.writes == [('PUT', post.CLUSTERS + CLUSTER, {
        '$objectType': post.CLUSTER_TYPE,
        'network': {'$objectType': post.NETWORK_TYPE, 'fqdn': FQDN,
                    'externalAddress': {'ipv4': {'value': '192.0.2.1'}}},
    }, '"first"', {})]
    with pytest.raises(post.PostDeploymentError, match='changed since review'):
        run(plan, lambda: pytest.fail('stale plan must not be authorized'))
    assert run(post.preflight(post.FQDN, FQDN_INTENT, None)) == {'status': 'already_configured'}
    assert len(prism.writes) == 1


def test_resumable_sequence_gates_checkpoints_and_never_replays_uncertain_jobs(client, auth_headers, monkeypatch, prism):
    import server
    import post_deployment_ncc as ncc
    from post_deployment_sequence import STAGES

    base = '/api/post-deployment/runs'
    monkeypatch.setattr(server.limiter, 'enabled', False)
    monkeypatch.setenv('ZTF_CLUSTER_FQDN_ENABLE_MUTATION', 'true')
    monkeypatch.setenv('ZTF_LCM_INVENTORY_ENABLE_SUBMISSION', 'true')
    monkeypatch.delenv('ZTF_POST_DEPLOYMENT_NCC_ENABLED', raising=False)
    fingerprint = 'a' * 64
    monkeypatch.setattr(post, '_verify_pe_name', lambda *_: [{'address': '192.0.2.1', 'leafSha256': fingerprint}])
    monkeypatch.setattr(server, '_pe_login_title_resolver', lambda _: lambda ref: ('nutanix', 'fixture-only'))
    config = {**ACCEPTANCE, 'ncc': {'hostSerial': 'S2', 'credential': 'cvm_ref', 'hostKey': 'SHA256:' + 'A' * 43}}
    response = client.post(base, json=config, headers=auth_headers)
    assert response.status_code == 201, response.get_json()
    run = response.get_json()
    url = f"{base}/{run['id']}"
    users = server._load_users()
    server._save_users([*users, {'username': 'reviewer', 'role': 'admin'}])
    reviewer = {'Authorization': 'Bearer ' + server._create_session('reviewer', 'admin')}
    operator = {'Authorization': 'Bearer ' + server._create_session('operator', 'operator')}
    assert client.get(base, headers=operator).status_code == 403
    assert client.get(base, headers=reviewer).get_json() == []
    assert client.post(url, json={'revision': 0, 'action': 'continue'}, headers=reviewer).status_code == 404
    assert client.post(base, json=config, headers=auth_headers).status_code == 409
    assert client.post('/api/jobs', json={'workflow': ncc.WORKFLOW}, headers=auth_headers).status_code == 400

    def update(action='continue', expected=200, **fields):
        nonlocal run
        result = client.post(url, headers=auth_headers, json={
            'revision': run['revision'], 'action': action, **fields,
        })
        assert result.status_code == expected, result.get_json()
        if expected == 200:
            run = result.get_json()
        return result

    def reload():
        nonlocal run
        run = client.get(base, headers=auth_headers).get_json()[0]

    def settle(status):
        for _ in range(80):
            reload()
            if run['job'] and run['job']['status'] == status:
                return
            time.sleep(.05)
        pytest.fail(f"Expected {status}: {run['job']}")

    def approve():
        update()
        approval_id = run['approvalId']
        assert client.post(f'/api/approvals/{approval_id}/approve', json={}, headers=auth_headers).status_code == 403
        assert client.post(f'/api/approvals/{approval_id}/approve', json={}, headers=reviewer).status_code == 200
        approval = server._approval_manager.get_approval(approval_id)
        assert client.post('/api/post-deployment/apply', json={
            'content': approval['configContent'], 'approvalId': approval_id, 'confirmation': run['confirmation'],
        }, headers=auth_headers).status_code == 403
        return approval_id

    update(reference='CHG-1', fingerprint='b' * 64, expected=409)
    assert not prism.writes
    update(reference='CHG-1', fingerprint=fingerprint)
    update(revision=0, expected=409)
    reload()
    assert run['stage'] == post.FQDN
    approve()
    update(confirmation=run['confirmation'])
    settle('success')
    update()
    assert run['stage'] == 'cvm-renames'
    update(expected=400)
    update(reference='CHG-2')
    update(reference='CHG-3')
    assert run['stage'] == post.LCM

    first_approval = approve()
    # Simulate a process loss between the persisted fence and job insertion.
    with monkeypatch.context() as crash:
        crash.setattr(server._job_manager, 'submit', MagicMock(side_effect=RuntimeError('interrupted')))
        update(confirmation=run['confirmation'], expected=409)
    reload()
    assert run['attempt'] and not run['job']
    update(confirmation=run['confirmation'], expected=409)
    assert len(prism.writes) == 1
    update('reconcile', reference='CHG-4')
    assert approve() != first_approval
    update(confirmation=run['confirmation'])
    settle('success')
    update()
    assert run['stage'] == ncc.WORKFLOW
    update(expected=409)
    monkeypatch.setenv('ZTF_POST_DEPLOYMENT_NCC_ENABLED', 'true')
    ssh = MagicMock(side_effect=[
        {'status': 'findings', 'counts': {'pass': 8, 'warn': 1}, 'total': 9},
        {'status': 'passed', 'counts': {'pass': 9}, 'total': 9},
        {'status': 'passed', 'counts': {'pass': 10}, 'total': 10},
    ])
    monkeypatch.setattr(ncc, 'run', ssh)
    update()
    settle('failed')
    update(expected=409)
    assert ssh.call_count == 1
    update('reconcile', reference='CHG-5')
    update()
    settle('success')
    update()
    update()
    persisted = server._post_runs()
    persisted[0]['completed'][-2]['evidence']['finishedAt'] = (
        datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=25)).isoformat()
    server.write_json(server.POST_DEPLOYMENT_RUNS_FILE, persisted)
    update(reference='CHG-6')
    assert run['stage'] == ncc.WORKFLOW
    update()
    settle('success')
    update()
    update()
    update(reference='CHG-7')
    assert run['stage'] == 'complete'
    assert tuple(item['stage'] for item in run['completed']) == (*STAGES[:-1], ncc.WORKFLOW, 'acceptance', 'signoff')
    assert len(prism.writes) == 2
    assert ssh.call_args.args[1] == {'address': '192.0.2.11', 'ssh_host_key_sha256': config['ncc']['hostKey']}
    assert 'fixture-only' not in server.POST_DEPLOYMENT_RUNS_FILE.read_text()


def test_corrupt_run_store_cannot_be_replaced_by_a_new_run(client, auth_headers, prism):
    import server

    base = '/api/post-deployment/runs'
    server.POST_DEPLOYMENT_RUNS_FILE.write_text('{', encoding='utf-8')
    assert client.get(base, headers=auth_headers).status_code == 409
    assert client.post(base, headers=auth_headers, json={**ACCEPTANCE, 'ncc': {
        'hostSerial': 'S2', 'credential': 'cvm_ref', 'hostKey': 'SHA256:' + 'A' * 43,
    }}).status_code == 409
    assert server.POST_DEPLOYMENT_RUNS_FILE.read_text(encoding='utf-8') == '{'
    assert not prism.writes


def test_job_manager_restart_keeps_interrupted_ncc_fenced(client, auth_headers, monkeypatch, prism):
    import server
    import post_deployment_ncc as ncc

    base = '/api/post-deployment/runs'
    config = {**ACCEPTANCE, 'ncc': {'hostSerial': 'S2', 'credential': 'cvm_ref', 'hostKey': 'SHA256:' + 'A' * 43}}
    run = client.post(base, json=config, headers=auth_headers).get_json()
    run['stage'] = ncc.WORKFLOW
    server.write_json(server.POST_DEPLOYMENT_RUNS_FILE, [run])
    server._job_manager.stop()
    monkeypatch.setattr(server, '_job_manager', server.ExecutionJobManager(1))
    monkeypatch.setenv('ZTF_POST_DEPLOYMENT_NCC_ENABLED', 'true')
    runner = MagicMock()
    monkeypatch.setattr(ncc, 'run', runner)
    url = f"{base}/{run['id']}"
    response = client.post(url, json={'revision': 0, 'action': 'continue'}, headers=auth_headers)
    assert response.status_code == 200, response.get_json()
    assert response.get_json()['job']['status'] == 'queued'
    monkeypatch.setattr(server, '_job_manager', server.ExecutionJobManager(1))
    resumed = client.get(base, headers=auth_headers).get_json()[0]
    assert resumed['job']['status'] == 'interrupted'
    assert resumed['attempt'] == response.get_json()['attempt']
    assert client.post(url, json={'revision': resumed['revision'], 'action': 'continue'}, headers=auth_headers).status_code == 409
    runner.assert_not_called()


@pytest.mark.parametrize('revision', [None, '*', 'W/"weak"', 'bad\r\nheader'])
def test_fqdn_fails_closed_without_a_strong_revision(prism, revision):
    prism.etag = revision
    with pytest.raises(post.PostDeploymentError, match='revision'):
        post.preflight(post.FQDN, FQDN_INTENT, None)
    assert not prism.writes


def test_lcm_only_starts_inventory_for_the_verified_managed_cluster(prism):
    plan = post.preflight(post.LCM, LCM_INTENT, None)
    assert not prism.headers and not prism.writes
    assert run(plan) == {'status': 'verified', 'taskId': 'test-task'}
    assert prism.writes == [('POST', post.LCM_INVENTORY, None, None, {'X-Cluster-Id': CLUSTER})]


@pytest.mark.parametrize('field,value', [('identity', PC), ('repository', 'https://other.example.com'),
                                       ('in_progress', {'taskUuid': 'busy'})])
def test_lcm_mismatch_or_busy_blocks_before_submission(prism, field, value):
    setattr(prism, field, value)
    with pytest.raises(post.PostDeploymentError):
        post.preflight(post.LCM, LCM_INTENT, None)
    assert not prism.writes and not prism.headers


def test_lcm_failure_does_not_retry(prism):
    prism.status = 'FAILED'
    with pytest.raises(MigrationError, match='did not succeed'):
        run(post.preflight(post.LCM, LCM_INTENT, None))
    assert len(prism.writes) == 1


def test_acceptance_distinguishes_observed_matches_from_final_signoff(prism):
    prism.network['fqdn'] = FQDN
    result = post.acceptance(ACCEPTANCE, None)
    assert result['status'] == 'operator_review_required'
    assert all(check['passed'] for check in result['checks'])
    prism.container_names = ['data', 'data']
    assert post.acceptance(ACCEPTANCE, None)['status'] == 'blocked'
    assert not prism.writes


def test_api_is_admin_only_flag_gated_and_binds_one_job_to_approval(client, auth_headers, monkeypatch, prism):
    import server

    base = '/api/post-deployment'
    monkeypatch.delenv('ZTF_LCM_INVENTORY_ENABLE_SUBMISSION', raising=False)
    monkeypatch.setattr(server.limiter, 'enabled', False)
    operator = server._create_session('test-operator', 'operator')
    assert client.get(base).status_code == 401
    assert client.post(base + '/acceptance', json=ACCEPTANCE,
                       headers={'Authorization': 'Bearer ' + operator}).status_code == 403
    assert client.post('/api/jobs', json={'workflow': post.LCM}, headers=auth_headers).status_code == 400
    response = client.post(base + '/preflight', json={'workflow': post.LCM, 'intent': LCM_INTENT}, headers=auth_headers)
    assert response.status_code == 200
    plan = response.get_json()
    content = plan['content']
    assert client.post(base + '/approval', json={'content': content}, headers=auth_headers).status_code == 403
    monkeypatch.setenv('ZTF_LCM_INVENTORY_ENABLE_SUBMISSION', 'true')
    response = client.post(base + '/approval', json={'content': content}, headers=auth_headers)
    assert response.status_code == 201
    approval_id = response.get_json()['id']
    body = {'content': content, 'approvalId': approval_id, 'confirmation': plan['confirmation']}
    assert client.post(base + '/apply', json=body, headers=auth_headers).status_code == 403
    assert client.post(f'/api/approvals/{approval_id}/approve', json={}, headers=auth_headers).status_code == 403
    users = server._load_users()
    server._save_users([*users, {'username': 'reviewer', 'role': 'admin'}])
    reviewer = {'Authorization': 'Bearer ' + server._create_session('reviewer', 'admin')}
    assert client.post(f'/api/approvals/{approval_id}/approve', json={}, headers=reviewer).status_code == 200
    assert client.post(base + '/apply', json=body, headers=reviewer).status_code == 403
    assert client.post(base + '/apply', json={**body, 'content': content + ' '}, headers=auth_headers).status_code == 400
    response = client.post(base + '/apply', json=body, headers=auth_headers)
    assert response.status_code == 202
    job_id = response.get_json()['id']
    assert client.post(base + '/apply', json=body, headers=auth_headers).get_json()['id'] == job_id
    for _ in range(40):
        job = server._job_manager.get_job(job_id)
        if job['status'] in {'success', 'failed'}:
            break
        time.sleep(.05)
    assert job['status'] == 'success', job
    assert len(prism.writes) == 1
