"""Recovery intent, governance and lifecycle tests; no Nutanix targets contacted."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
import threading
import time

import pytest
import yaml

from disaster_recovery import RecoveryError, RecoveryService, reference_only, now, bootstrap_count


def foundation_config():
    return {
        'ztf_orchestrator': {'foundation_target': 'foundation_vm', 'executor': 'orchestrator_foundation_vm_v1', 'execution_status': 'controlled_mutation'},
        'foundation_vm_ip': 'foundation.example.com', 'foundation_vm_port': 8000, 'foundation_vm_scheme': 'http',
        'foundation_vm_options': {'hardware_platform': 'dell_xc', 'lag_type': 'none'},
        'foundation_vm_execution': {'live_submit_enabled': True},
        'aos_hypervisor_images': {'hypervisor_type': 'AHV', 'aos_package': 'aos.tar.gz', 'hypervisor_iso': 'ahv.iso', 'hypervisor_checksum': 'a' * 64},
        'hypervisor_credential': 'ahv_admin', 'cluster_credential': 'cluster_admin',
        'common_network_settings': {'dns_servers': ['192.0.2.53'], 'ntp_servers': ['time.example.com']},
        'create_clusters': [{'cluster_name': 'HCI-01', 'cluster_vip': '192.0.2.20', 'redundancy_factor': 2,
            'host_netmask': '255.255.255.0', 'host_gateway': '192.0.2.1',
            'cvm_netmask': '255.255.255.0', 'cvm_gateway': '192.0.2.1',
            'ipmi_netmask': '255.255.255.0', 'ipmi_gateway': '203.0.113.1',
            'nodes_list': [{'node_serial': f'NODE{i}', 'block_serial': f'BLOCK{i}', 'node_position': 'A',
                'node_role': 'hyperconverged', 'cvm_ram_gb': 48, 'hypervisor_hostname': f'host{i}',
                'host_ip': f'192.0.2.{20 + i * 2}', 'cvm_ip': f'192.0.2.{21 + i * 2}',
                'ipmi_ip': f'203.0.113.{10+i}', 'ipmi_credential_ref': 'bmc_admin'} for i in range(1, 4)]}],
    }


@pytest.fixture
def harness():
    import server
    state = {'datacenters': [], 'profiles': [], 'runs': []}
    configs = {'deploy.yml': yaml.safe_dump(foundation_config()),
               'post.yml': yaml.safe_dump({'clusters': {'192.0.2.20': {'name': 'HCI-01', 'pe_credential': 'pe_admin', 'dsip': '192.0.2.21'}}})}
    pipeline = {'id': 'pipe', 'name': 'Post deployment', 'steps': [{'workflow': 'config-cluster', 'configFile': 'post.yml'}]}
    jobs, payloads, calls = {}, {}, []
    def config(name):
        if name not in configs:
            raise RecoveryError('Configuration file not found')
        return configs[name]
    def submit(payload, authorization, owner):
        assert authorization == 'Bearer private-test-session'
        identity = str(len(jobs) + 1)
        calls.append(deepcopy(payload))
        payloads[identity] = deepcopy(payload)
        jobs[identity] = {'id': identity, 'workflow': payload.get('workflow') or payload.get('script'), 'status': 'success', 'createdAt': now()}
        return jobs[identity]
    def write(value):
        state.clear()
        state.update(deepcopy(value))
    service = RecoveryService({
        'read': lambda: deepcopy(state), 'write': write, 'config': config,
        'pipeline': lambda identity: deepcopy(pipeline) if identity == 'pipe' else None,
        'validate_foundation': server._validate_foundation_vm_intent,
        'endpoint_config': server._recovery_endpoint_config, 'endpoint_text': server._recovery_endpoint_text,
        'job': lambda identity: deepcopy(jobs.get(identity)), 'jobs': lambda: list(jobs.values()),
        'payload': lambda identity: deepcopy(payloads.get(identity)), 'submit': submit,
        'request_approval': lambda data, auth: {'id': 'approval'}, 'verify_approval': lambda *args: None,
        'link_approval': lambda *args: None,
        'verify_step_approval': lambda *args: None,
        'collect_health': lambda snapshot: {'status': 'unknown', 'checks': [], 'message': 'Independent health evidence required'},
        'step_error': lambda step: None, 'cancel': lambda *args: None, 'audit': lambda *args: None,
    }, threading.RLock())
    dc = service.datacenter({'name': 'DC-A', 'foundationEndpoint': 'http://foundation.example.com:8000',
        'notes': 'Approved recovery dependencies', 'prerequisites': {k: 'reviewed' for k in ['network', 'images', 'credentials', 'dnsNtp', 'backupAccess']}}, 'admin')
    yield service, state, configs, pipeline, jobs, calls, dc, payloads
    service.shutdown()


@pytest.fixture
def bootstrap_harness(harness):
    _, _, configs, pipeline, _, _, _, _ = harness
    for filename, settings in [('password.yml', {'pe_credential': 'new_admin', 'new_pe_admin_credential': 'new_admin'}),
                               ('eula.yml', {'pe_credential': 'new_admin', 'eula': {'username': 'Operator', 'company_name': 'Example'}, 'enable_pulse': False})]:
        configs[filename] = yaml.safe_dump({'clusters': {'192.0.2.20': {'name': 'HCI-01', **settings}}})
    pipeline['steps'] = [{'workflow': 'config-cluster', 'configFile': 'password.yml'},
                         {'workflow': 'config-cluster', 'configFile': 'eula.yml'}, *pipeline['steps']]
    return harness


def test_bootstrap_runs_only_initial_access_before_health(bootstrap_harness):
    h = bootstrap_harness
    s = h[0]
    r = deploy(h)
    assert s.detail_run(r['id'])['status'] == 'awaiting_bootstrap'
    assert bootstrap_count(r['snapshot']) == 2
    with pytest.raises(RecoveryError):
        s.attest_health(r['id'], 'admin', {'clusterIdentity': 'HCI-01'})
    with pytest.raises(RecoveryError):
        s.start_configuration(r['id'], 'admin', {}, 'Bearer private-test-session')
    r = s.start_bootstrap(r['id'], 'admin', {'riskAcknowledged': True, 'confirmation': 'BOOTSTRAP HCI-01'}, 'Bearer private-test-session')
    r = wait_status(s, r['id'], 'awaiting_health_verification')
    assert len(h[5]) == 3 and len(r['steps']) == 2
    assert [p['configContent'] for p in h[5][1:]] == [h[2]['password.yml'], h[2]['eula.yml']]
    assert not r.get('healthEvidence')
    with pytest.raises(RecoveryError):
        s.start_configuration(r['id'], 'admin', {}, 'Bearer private-test-session')
    assert 'private-test-session' not in json.dumps(h[1])


def test_bootstrap_automatic_readback_unlocks_only_after_verified_health(bootstrap_harness):
    h = bootstrap_harness
    h[0].s['collect_health'] = lambda snapshot: {'status': 'passed', 'checks': [{'name': 'PE readback', 'status': 'passed'}]}
    r = deploy(h)
    h[0].start_bootstrap(r['id'], 'admin', {'riskAcknowledged': True, 'confirmation': 'BOOTSTRAP HCI-01'}, 'Bearer private-test-session')
    r = wait_status(h[0], r['id'], 'ready_for_configuration')
    assert r['healthEvidence']['source'] == 'verified-https-pe-readback'
    assert len(h[5]) == 3  # Remaining configuration has not auto-started.
    h[0].start_configuration(r['id'], 'admin', {}, 'Bearer private-test-session')
    r = wait_status(h[0], r['id'], 'awaiting_acceptance')
    assert len(r['steps']) == 3 and len(h[5]) == 4


@pytest.mark.parametrize('settings', [{'containers': []}, {'networks': []}, {'local_users': []}, {'name_servers_list': []}, {'unknown': True}])
def test_broad_configuration_is_not_a_bootstrap_step(bootstrap_harness, settings):
    h = bootstrap_harness
    cfg = yaml.safe_load(h[2]['password.yml'])
    cfg['clusters']['192.0.2.20'].update(settings)
    h[2]['password.yml'] = yaml.safe_dump(cfg)
    r = deploy(h)
    assert bootstrap_count(r['snapshot']) == 0
    with pytest.raises(RecoveryError, match='absent'):
        h[0].start_bootstrap(r['id'], 'admin', {'riskAcknowledged': True, 'confirmation': 'BOOTSTRAP HCI-01'}, 'Bearer private-test-session')
    assert len(h[5]) == 1


def test_bootstrap_exact_approval_and_confirmation_remain_required(bootstrap_harness):
    h = bootstrap_harness
    r = deploy(h)
    with pytest.raises(RecoveryError, match='Confirm'):
        h[0].start_bootstrap(r['id'], 'admin', {}, 'Bearer private-test-session')
    h[0].s['step_error'] = lambda step: 'Approval required'
    with pytest.raises(RecoveryError, match='Approval for bootstrap step'):
        h[0].start_bootstrap(r['id'], 'admin', {'riskAcknowledged': True, 'confirmation': 'BOOTSTRAP HCI-01'}, 'Bearer private-test-session')
    checked = []
    h[0].s['verify_step_approval'] = lambda approval, step, file: checked.append((approval, file))
    approvals = {'0': 'approved-password', '1': 'approved-eula'}
    h[0].start_bootstrap(r['id'], 'admin', {'riskAcknowledged': True, 'confirmation': 'BOOTSTRAP HCI-01', 'approvalIds': approvals}, 'Bearer private-test-session')
    r = wait_status(h[0], r['id'], 'awaiting_health_verification')
    assert len(checked) == 4
    assert h[5][1]['approvalId'] == 'approved-password' and h[5][2]['approvalId'] == 'approved-eula'
    assert checked[0][1] == f'dr-{r["id"]}-step-1.yml'


def test_bootstrap_failure_and_restart_never_replay_password_change(bootstrap_harness):
    h = bootstrap_harness
    r = deploy(h)
    submit = h[0].s['submit']
    def fail(*args):
        job = submit(*args)
        h[4][job['id']]['status'] = 'failed'
        return job
    h[0].s['submit'] = fail
    h[0].start_bootstrap(r['id'], 'admin', {'riskAcknowledged': True, 'confirmation': 'BOOTSTRAP HCI-01'}, 'Bearer private-test-session')
    wait_status(h[0], r['id'], 'needs_reconciliation')
    with pytest.raises(RecoveryError):
        h[0].start_bootstrap(r['id'], 'admin', {'riskAcknowledged': True, 'confirmation': 'BOOTSTRAP HCI-01'}, 'Bearer private-test-session')
    assert len(h[5]) == 2
    h[1]['runs'][0]['status'] = 'bootstrapping'
    restarted = RecoveryService(h[0].s, threading.RLock())
    assert restarted.detail_run(r['id'])['status'] == 'needs_reconciliation'
    assert len(h[5]) == 2
    restarted.shutdown()


def test_failed_health_collection_invalidates_previous_health(harness):
    r = healthy(harness)
    r = harness[0].collect_health(r['id'], 'admin')
    assert r['status'] == 'awaiting_health_verification' and not r.get('healthEvidence')


def test_bootstrap_api_roles_and_valid_start(client, auth_headers, bootstrap_harness, monkeypatch):
    import server
    h = bootstrap_harness
    run = deploy(h)
    submit = h[0].s['submit']
    services = {**h[0].s, 'submit': lambda payload, auth, owner: submit(payload, 'Bearer private-test-session', owner)}
    monkeypatch.setattr(server._recovery_service, 's', services)
    path = f'/api/recovery/runs/{run["id"]}'
    assert client.post(path + '/bootstrap', json={}).status_code == 401
    client.post('/api/users', headers=auth_headers, json={'username': 'reader', 'password': 'TestReader123!', 'role': 'viewer'})
    token = client.post('/api/auth/login', json={'username': 'reader', 'password': 'TestReader123!'}).get_json()['token']
    for action in ('bootstrap', 'bootstrap/approval', 'health/collect'):
        assert client.post(path + '/' + action, headers={'Authorization': 'Bearer ' + token}, json={}).status_code == 403
    response = client.post(path + '/bootstrap', headers=auth_headers,
                           json={'riskAcknowledged': True, 'confirmation': 'BOOTSTRAP HCI-01'})
    assert response.status_code == 200, response.get_json()
    run = wait_status(server._recovery_service, run['id'], 'awaiting_health_verification')
    assert len(h[5]) == 3 and len(run['steps']) == 2
    response = client.post(path + '/health/collect', headers=auth_headers, json={})
    assert response.status_code == 200 and response.get_json()['healthCollection']['status'] == 'unknown'


def test_dedicated_bootstrap_script_requires_existing_exact_confirmation(bootstrap_harness):
    h = bootstrap_harness
    h[3]['steps'][0]['workflow'] = 'ChangeDefaultAdminPasswordPe'
    run = deploy(h)
    data = {'riskAcknowledged': True, 'confirmation': 'BOOTSTRAP HCI-01'}
    with pytest.raises(RecoveryError, match='RUN ChangeDefaultAdminPasswordPe'):
        h[0].start_bootstrap(run['id'], 'admin', data, 'Bearer private-test-session')
    h[0].start_bootstrap(run['id'], 'admin', {**data, 'destructiveConfirmation': 'RUN ChangeDefaultAdminPasswordPe'}, 'Bearer private-test-session')
    wait_status(h[0], run['id'], 'awaiting_health_verification')
    assert h[5][1]['script'] == 'ChangeDefaultAdminPasswordPe'
    assert h[5][1]['destructiveConfirmation'] == 'RUN ChangeDefaultAdminPasswordPe'


def test_missing_bootstrap_job_cannot_satisfy_health_gate(bootstrap_harness):
    h = bootstrap_harness
    run = deploy(h)
    h[0].start_bootstrap(run['id'], 'admin', {'riskAcknowledged': True, 'confirmation': 'BOOTSTRAP HCI-01'}, 'Bearer private-test-session')
    run = wait_status(h[0], run['id'], 'awaiting_health_verification')
    del h[4][run['steps'][0]['jobId']]
    with pytest.raises(RecoveryError, match='Retained successful bootstrap'):
        h[0].collect_health(run['id'], 'admin')


def profile(h):
    service, _, _, _, _, _, dc, _ = h
    return service.profile({'name': 'HCI recovery', 'datacenterId': dc['id'], 'deploymentConfigFile': 'deploy.yml', 'pipelineId': 'pipe'}, 'admin')


def prepare(h):
    s = h[0]
    p = profile(h)
    rev = p['revisions'][-1]
    s.approve(p['id'], 'reviewer', {'sha256': rev['sha256'], 'notes': 'Verified clean baseline'})
    return s.prepare({'profileId': p['id'], 'sha256': rev['sha256'], 'mode': 'rehearsal'}, 'admin')


def deploy(h):
    s = h[0]
    run = prepare(h)
    return s.deploy(run['id'], 'admin', {'approvalId': 'approval', 'riskAcknowledged': True,
        'targetConfirmation': 'REFOUNDATION HCI-01', 'destructiveConfirmation': 'DEPLOY FOUNDATION VM'}, 'Bearer private-test-session')


def healthy(h):
    s = h[0]
    run = deploy(h)
    return s.attest_health(run['id'], 'admin', {'clusterIdentity': 'HCI-01', 'membershipVerified': True, 'servicesHealthy': True,
        'notes': 'Fresh PE service and membership readback', 'evidenceRef': 'change/123/health'})


def wait_status(s, identity, expected):
    for _ in range(80):
        run = s.detail_run(identity)
        if run['status'] == expected:
            return run
        time.sleep(.05)
    pytest.fail(f'Run did not reach {expected}: {run["status"]}')


def test_versioned_baseline_separate_from_imported_observation(harness):
    s, _, files, _, _, _, dc, _ = harness
    p = s.profile({'name': 'Cluster', 'datacenterId': dc['id'], 'deploymentConfigFile': 'deploy.yml', 'pipelineId': 'pipe', 'observedConfigFile': 'post.yml'}, 'admin')
    rev = p['revisions'][0]
    assert rev['observation']['source'] == 'operator-import-not-live-discovery'
    assert not rev.get('approvedBy')
    s.approve(p['id'], 'reviewer', {'sha256': rev['sha256'], 'notes': 'Accepted'})
    files['post.yml'] += '\n# Changed intent\n'
    assert s.overview()['profiles'][0]['drifted']
    updated = s.profile({'name': 'Cluster', 'datacenterId': dc['id'], 'deploymentConfigFile': 'deploy.yml', 'pipelineId': 'pipe'}, 'admin', p['id'])
    assert len(updated['revisions']) == 2 and updated['revisions'][0]['approvedBy'] == 'reviewer'
    assert not updated['revisions'][1].get('approvedBy')


@pytest.mark.parametrize('content', ['password: secret', 'nested: {api_token: secret}', 'default_pe_password: secret', 'x: &x {again: *x}'])
def test_secrets_and_recursive_yaml_rejected(content):
    with pytest.raises(RecoveryError):
        reference_only(content)


def test_reference_only_allows_boolean_password_policy():
    assert reference_only('ssh_using_password: false\npe_credential: pe_admin')['ssh_using_password'] is False


@pytest.mark.parametrize('url', ['http://user:secret@foundation.example.com:8000', 'https://example.com/path', 'file:///tmp/config', 'http://example.com:99999'])
def test_invalid_endpoint_rejected(harness, url):
    with pytest.raises(RecoveryError):
        harness[0].datacenter({'name': 'Bad', 'notes': 'Recovery', 'foundationEndpoint': url}, 'admin')


def test_pipeline_target_scope_and_actions_are_enforced(harness):
    h = harness
    h[3]['steps'][0]['workflow'] = 'deploy-pc'
    with pytest.raises(RecoveryError, match='post-configuration supports'):
        profile(h)
    h[3]['steps'][0]['workflow'] = 'config-cluster'
    h[2]['post.yml'] = h[2]['post.yml'].replace('192.0.2.20', '192.0.2.99')
    with pytest.raises(RecoveryError, match='only the recovery cluster'):
        profile(h)


def test_changed_pipeline_cannot_use_prior_review(harness):
    s = harness[0]
    run = prepare(harness)
    harness[3]['steps'].append({'workflow': 'config-cluster', 'configFile': 'post.yml'})
    with pytest.raises(RecoveryError, match='Pipeline changed'):
        s.deploy(run['id'], 'admin', {'approvalId': 'a', 'riskAcknowledged': True,
            'targetConfirmation': 'REFOUNDATION HCI-01', 'destructiveConfirmation': 'DEPLOY FOUNDATION VM'}, 'Bearer private-test-session')
    assert not harness[5]


def test_prepare_requires_prerequisite_review_and_current_hash(harness):
    s = harness[0]
    p = profile(harness)
    rev = p['revisions'][0]
    with pytest.raises(RecoveryError):
        s.prepare({'profileId': p['id'], 'sha256': rev['sha256'], 'mode': 'recovery'}, 'admin')
    with pytest.raises(RecoveryError, match='hash'):
        s.approve(p['id'], 'admin', {'sha256': 'changed', 'notes': 'Approved'})
    s.approve(p['id'], 'reviewer', {'sha256': rev['sha256'], 'notes': 'Approved'})
    harness[1]['datacenters'][0]['prerequisites']['network'] = 'needs_review'
    with pytest.raises(RecoveryError, match='prerequisite'):
        s.prepare({'profileId': p['id'], 'sha256': rev['sha256'], 'mode': 'recovery'}, 'admin')


def test_exact_confirmation_and_duplicate_submission(harness):
    s = harness[0]
    r = prepare(harness)
    with pytest.raises(RecoveryError, match='acknowledgement'):
        s.deploy(r['id'], 'admin', {}, 'Bearer private-test-session')
    r = s.deploy(r['id'], 'admin', {'approvalId': 'a', 'riskAcknowledged': True, 'targetConfirmation': 'REFOUNDATION HCI-01', 'destructiveConfirmation': 'DEPLOY FOUNDATION VM'}, 'Bearer private-test-session')
    with pytest.raises(RecoveryError, match='already been submitted'):
        s.deploy(r['id'], 'admin', {}, 'Bearer private-test-session')
    assert len(harness[5]) == 1
    assert harness[5][0]['configContent'] == r['snapshot']['deploymentContent']
    assert harness[5][0]['configFile'].startswith('dr-')
    assert 'private-test-session' not in json.dumps(harness[1])


def test_foundation_endpoint_and_nodes_are_exclusively_owned(harness):
    r = deploy(harness)
    with pytest.raises(RecoveryError, match='owns'):
        harness[0].foundation_guard(foundation_config())
    other = foundation_config()
    other['foundation_vm_ip'] = 'other.example.com'
    with pytest.raises(RecoveryError, match='node set'):
        harness[0].foundation_guard(other)
    assert r['status'] == 'deploying'


def test_health_gate_requires_deployment_and_exact_identity(harness):
    r = deploy(harness)
    with pytest.raises(RecoveryError):
        harness[0].start_configuration(r['id'], 'admin', {}, 'Bearer private-test-session')
    with pytest.raises(RecoveryError, match='identity'):
        harness[0].attest_health(r['id'], 'admin', {'clusterIdentity': 'Wrong', 'membershipVerified': True, 'servicesHealthy': True})


def test_stale_health_cannot_start_configuration(harness):
    r = healthy(harness)
    harness[1]['runs'][0]['healthEvidence']['at'] = (datetime.now(timezone.utc) - timedelta(minutes=16)).isoformat()
    with pytest.raises(RecoveryError, match='older than'):
        harness[0].start_configuration(r['id'], 'admin', {}, 'Bearer private-test-session')


def test_pipeline_preserves_approval_policy(harness):
    r = healthy(harness)
    harness[0].s['step_error'] = lambda step: 'Workflow requires approval'
    with pytest.raises(RecoveryError, match='direct-job'):
        harness[0].start_configuration(r['id'], 'admin', {}, 'Bearer private-test-session')
    assert len(harness[5]) == 1


def test_actual_sequential_jobs_and_independent_acceptance(harness):
    s = harness[0]
    harness[3]['steps'].append({'workflow': 'config-cluster', 'configFile': 'post.yml'})
    r = healthy(harness)
    s.start_configuration(r['id'], 'admin', {}, 'Bearer private-test-session')
    r = wait_status(s, r['id'], 'awaiting_acceptance')
    assert len(r['steps']) == 2 and len(harness[5]) == 3
    assert all(x['status'] == 'success' for x in r['steps'])
    assert 'private-test-session' not in json.dumps(harness[1])
    with pytest.raises(RecoveryError):
        s.attest(r['id'], 'admin', {}, True)
    r = s.attest(r['id'], 'admin', {'configurationVerified': True, 'clusterHealthy': True, 'notes': 'Readbacks match approved intent', 'evidenceRef': 'change/123/acceptance'}, True)
    assert r['status'] == 'accepted'
    assert s.overview()['profiles'][0]['lastRehearsal']


def test_failure_stops_later_steps_and_requires_reconciliation(harness):
    s = harness[0]
    harness[3]['steps'].append({'workflow': 'config-cluster', 'configFile': 'post.yml'})
    r = healthy(harness)
    real = s.s['submit']
    def fail(payload, token, owner):
        job = real(payload, token, owner)
        harness[4][job['id']]['status'] = 'failed'
        return job
    s.s['submit'] = fail
    s.start_configuration(r['id'], 'admin', {}, 'Bearer private-test-session')
    r = wait_status(s, r['id'], 'needs_reconciliation')
    assert len(harness[5]) == 2 and not r['steps']
    with pytest.raises(RecoveryError):
        s.start_configuration(r['id'], 'admin', {}, 'Bearer private-test-session')
    closed = s.attest(r['id'], 'admin', {'foundationSessionEnded': True, 'targetReconciled': True, 'notes': 'Observed failed operation; retained findings', 'evidenceRef': 'incident/123'})
    assert closed['status'] == 'closed_reconciled'


def test_restart_never_replays_configuration(harness):
    r = healthy(harness)
    harness[1]['runs'][0]['status'] = 'configuring'
    new = RecoveryService(harness[0].s, threading.RLock())
    assert new.detail_run(r['id'])['status'] == 'needs_reconciliation'
    assert len(harness[5]) == 1
    new.shutdown()


def test_direct_job_must_match_snapshot_and_health_window(harness):
    r = healthy(harness)
    payload = {'workflow': 'config-cluster', 'configContent': 'wrong'}
    job = harness[0].s['submit'](payload, 'Bearer private-test-session', r['id'])
    with pytest.raises(RecoveryError, match='YAML'):
        harness[0].link_configuration_job(r['id'], 'admin', {'jobId': job['id']})
    harness[7][job['id']]['configContent'] = r['snapshot']['steps'][0]['configContent']
    result = harness[0].link_configuration_job(r['id'], 'admin', {'jobId': job['id']})
    assert result['status'] == 'awaiting_acceptance'


def test_one_job_cannot_satisfy_two_identical_steps(harness):
    harness[3]['steps'].append({'workflow': 'config-cluster', 'configFile': 'post.yml'})
    r = healthy(harness)
    job = harness[0].s['submit']({'workflow': 'config-cluster', 'configContent': r['snapshot']['steps'][0]['configContent']}, 'Bearer private-test-session', r['id'])
    harness[0].link_configuration_job(r['id'], 'admin', {'jobId': job['id']})
    with pytest.raises(RecoveryError, match='already linked'):
        harness[0].link_configuration_job(r['id'], 'admin', {'jobId': job['id']})


def test_active_ordinary_foundation_job_also_owns_endpoint(harness):
    s = harness[0]
    job = s.s['submit']({'workflow': 'cluster-create-foundation-vm', 'configContent': harness[2]['deploy.yml']}, 'Bearer private-test-session', '')
    harness[4][job['id']]['status'] = 'running'
    with pytest.raises(RecoveryError, match='active deployment'):
        s.foundation_guard(foundation_config())


@pytest.mark.parametrize('value', ['https://admin:example@example.com:8000', '//admin:example@example.com', '-----BEGIN OPENSSH PRIVATE KEY-----'])
def test_hidden_inline_secrets_are_not_captured(value):
    with pytest.raises(RecoveryError):
        reference_only(yaml.safe_dump({'otherwise_innocuous_key': value}))


def test_corrupt_recovery_storage_fails_closed(client, auth_headers):
    import server
    server.RECOVERY_FILE.write_text('{broken', encoding='utf-8')
    response = client.get('/api/recovery', headers=auth_headers)
    assert response.status_code == 503
    assert 'unreadable' in response.get_json()['error']
    assert server.RECOVERY_FILE.read_text(encoding='utf-8') == '{broken'


@pytest.mark.parametrize('patch', [{'prerequisites': {'network': []}}, {'foundationEndpoint': 'http://[invalid'}])
def test_malformed_datacenter_input_is_safe(client, auth_headers, patch):
    body = {'name': 'DC-A', 'foundationEndpoint': 'http://foundation.example.com:8000', 'notes': 'Reviewed dependencies', **patch}
    response = client.post('/api/recovery/datacenters', headers=auth_headers, json=body)
    assert response.status_code == 400
    assert 'error' in response.get_json()


def test_acceptance_requires_retained_successful_job_evidence(harness):
    r = healthy(harness)
    harness[0].start_configuration(r['id'], 'admin', {}, 'Bearer private-test-session')
    r = wait_status(harness[0], r['id'], 'awaiting_acceptance')
    del harness[4][r['steps'][0]['jobId']]
    with pytest.raises(RecoveryError, match='Retained successful'):
        harness[0].attest(r['id'], 'admin', {'configurationVerified': True, 'clusterHealthy': True, 'notes': 'Readback', 'evidenceRef': 'change/123'}, True)


@pytest.mark.parametrize('workflow', ['cluster-create-foundation-vm', 'config-cluster'])
def test_recovery_approval_cannot_be_reused_via_ordinary_submission(monkeypatch, workflow):
    import server
    server._job_manager.stop()
    monkeypatch.setattr(server, '_approval_manager', type('Approvals', (), {
        'get_approval': lambda self, identity: {'metadata': {'recoveryRunId': 'owned-run'}}})())
    with pytest.raises(RecoveryError, match='reviewed recovery run'):
        server._job_manager.submit({'workflow': workflow, 'approvalId': 'recovery-approval', 'configContent': yaml.safe_dump(foundation_config())}, 'admin')
    assert not server._job_manager.list_jobs()


def test_same_millisecond_jobs_have_distinct_ids(monkeypatch):
    import server
    server._job_manager.stop()
    monkeypatch.setattr(server.time, 'time', lambda: 1000.0)
    one = server._job_manager.submit({'workflow': 'config-cluster'}, 'admin')
    two = server._job_manager.submit({'workflow': 'config-cluster'}, 'admin')
    assert one['id'] != two['id']
    assert len(server._job_manager.list_jobs()) == 2


def test_recovery_api_roles_and_saved_records(client, auth_headers):
    assert client.get('/api/recovery').status_code == 401
    body = {'name': 'DC-A', 'foundationEndpoint': 'http://foundation.example.com:8000', 'notes': 'Reviewed dependencies'}
    response = client.post('/api/recovery/datacenters', headers=auth_headers, json=body)
    assert response.status_code == 200
    identity = response.get_json()['id']
    assert client.get('/api/recovery', headers=auth_headers).get_json()['datacenters'][0]['id'] == identity
    client.post('/api/users', headers=auth_headers, json={'username': 'reader', 'password': 'TestReader123!', 'role': 'viewer'})
    token = client.post('/api/auth/login', json={'username': 'reader', 'password': 'TestReader123!'}).get_json()['token']
    viewer = {'Authorization': f'Bearer {token}'}
    assert client.get('/api/recovery', headers=viewer).status_code == 200
    assert client.post('/api/recovery/datacenters', headers=viewer, json=body).status_code == 403
    assert client.post('/api/recovery/profiles', headers=auth_headers, json=[]).status_code == 400


@pytest.mark.parametrize('general_policy', [True, False])
def test_api_exact_approval_and_existing_foundation_submission(client, auth_headers, monkeypatch, general_policy):
    import server
    monkeypatch.setattr(server, '_lookup_credential_ref', lambda ref: ('admin', 'isolated-test-only', ''))
    if not general_policy:
        settings = server.get_settings()
        settings['approvalRequiredWorkflows'] = []
        server.write_json(server.SETTINGS_FILE, settings)
    server.limiter.enabled = False
    try:
        root = server.get_configs_dir()
        root.mkdir(parents=True, exist_ok=True)
        (root / 'deploy.yml').write_text(yaml.safe_dump(foundation_config()), encoding='utf-8')
        (root / 'post.yml').write_text(yaml.safe_dump({'clusters': {'192.0.2.20': {'name': 'HCI-01', 'pe_credential': 'pe_admin'}}}), encoding='utf-8')
        server._save_pipelines([{'id': 'pipe', 'name': 'Post config', 'steps': [{'workflow': 'config-cluster', 'configFile': 'post.yml'}]}])
        dc = client.post('/api/recovery/datacenters', headers=auth_headers, json={'name': 'DC-A', 'foundationEndpoint': 'http://foundation.example.com:8000', 'notes': 'All dependencies reviewed', 'prerequisites': {k: 'reviewed' for k in ['network','images','credentials','dnsNtp','backupAccess']}}).get_json()
        response = client.post('/api/recovery/profiles', headers=auth_headers, json={'name': 'HCI-01', 'datacenterId': dc['id'], 'deploymentConfigFile': 'deploy.yml', 'pipelineId': 'pipe'})
        assert response.status_code == 200, response.get_json()
        profile = response.get_json();sha = profile['revisions'][0]['sha256']
        assert client.post(f'/api/recovery/profiles/{profile["id"]}/approve', headers=auth_headers, json={'sha256': sha,'notes': 'Reviewed intent'}).status_code == 200
        run = client.post('/api/recovery/runs', headers=auth_headers, json={'profileId':profile['id'],'sha256':sha,'mode':'rehearsal'}).get_json()
        approval = client.post(f'/api/recovery/runs/{run["id"]}/approval', headers=auth_headers, json={}).get_json()
        assert client.post(f'/api/approvals/{approval["id"]}/approve', headers=auth_headers, json={}).status_code == 403
        server._approval_manager.decide(approval['id'], 'approved', 'independent-reviewer', 'Approved exact targets')
        captured=[]
        monkeypatch.setattr(server._job_manager, 'submit', lambda payload,user: captured.append(payload) or {'id':'mock-deployment','status':'queued'})
        response=client.post(f'/api/recovery/runs/{run["id"]}/deploy',headers=auth_headers,json={'approvalId':approval['id'],'riskAcknowledged':True,'targetConfirmation':'REFOUNDATION HCI-01','destructiveConfirmation':'DEPLOY FOUNDATION VM'})
        assert response.status_code==200,response.get_json()
        assert captured[0]['workflow']=='cluster-create-foundation-vm'
        assert captured[0]['configContent']==(root/'deploy.yml').read_text(encoding='utf-8')
        assert server._approval_manager.get_approval(approval['id'])['jobId']=='mock-deployment'
        assert client.post(f'/api/recovery/runs/{run["id"]}/deploy',headers=auth_headers,json={}).status_code==409
    finally:
        server.limiter.enabled = True


def test_reconciled_eula_failure_resumes_without_repeating_successful_password(bootstrap_harness):
    h = bootstrap_harness
    service = h[0]
    run = deploy(h)
    submit = service.s['submit']
    def fail_eula(payload, *args):
        job = submit(payload, *args)
        if payload.get('configContent') == h[2]['eula.yml']:
            h[4][job['id']]['status'] = 'failed'
        return job
    service.s['submit'] = fail_eula
    data = {'riskAcknowledged': True, 'confirmation': 'BOOTSTRAP HCI-01'}
    service.start_bootstrap(run['id'], 'admin', data, 'Bearer private-test-session')
    run = wait_status(service, run['id'], 'needs_reconciliation')
    assert len(run['steps']) == 1
    run = service.attest(run['id'], 'admin', {
        'foundationSessionEnded': True, 'targetReconciled': True, 'resumeConfiguration': True,
        'notes': 'Password success verified; EULA failure reconciled', 'evidenceRef': 'change/example'})
    assert run['status'] == 'awaiting_bootstrap'
    service.s['submit'] = submit
    service.start_bootstrap(run['id'], 'admin', data, 'Bearer private-test-session')
    run = wait_status(service, run['id'], 'awaiting_health_verification')
    assert len(run['steps']) == 2
    assert sum(p.get('configContent') == h[2]['password.yml'] for p in h[5]) == 1
    assert len(h[5]) == 4  # Deployment, password, failed EULA, resumed EULA only.


def test_uncertain_password_cannot_be_resumed_after_reconciliation(bootstrap_harness):
    h = bootstrap_harness
    service = h[0]
    run = deploy(h)
    submit = service.s['submit']
    def fail_password(*args):
        job = submit(*args)
        h[4][job['id']]['status'] = 'failed'
        return job
    service.s['submit'] = fail_password
    service.start_bootstrap(run['id'], 'admin', {'riskAcknowledged': True, 'confirmation': 'BOOTSTRAP HCI-01'}, 'Bearer private-test-session')
    wait_status(service, run['id'], 'needs_reconciliation')
    with pytest.raises(RecoveryError, match='uncertain password-change'):
        service.attest(run['id'], 'admin', {'foundationSessionEnded': True, 'targetReconciled': True,
            'resumeConfiguration': True, 'notes': 'Target reviewed', 'evidenceRef': 'change/example'})
    assert len(h[5]) == 2


@pytest.mark.parametrize('patch', [
    {'status': 'pending'}, {'workflow': 'other'}, {'jobId': 'already-used'},
    {'configContent': 'different'}, {'configFile': 'different.yml'},
    {'expiresAt': '2000-01-01T00:00:00+00:00'},
])
def test_bootstrap_approval_binding_rejects_invalid_requests(monkeypatch, patch):
    import server
    approval = {'status': 'approved', 'workflow': 'config-cluster', 'configContent': 'clusters: {}',
                'configFile': 'dr-example-step-1.yml', 'expiresAt': '2099-01-01T00:00:00+00:00', **patch}
    monkeypatch.setattr(server, '_require_engines', lambda: None)
    monkeypatch.setattr(server, '_approval_manager', type('Approvals', (), {
        'get_approval': lambda self, identity: approval})())
    with pytest.raises(RecoveryError, match='exact bootstrap'):
        server._recovery_verify_step_approval('approval', {'workflow': 'config-cluster', 'configContent': 'clusters: {}'}, 'dr-example-step-1.yml')


def test_existing_health_waiting_run_bootstraps_without_repeating_imaging(bootstrap_harness):
    h = bootstrap_harness
    service = h[0]
    run = deploy(h)
    stored = h[1]['runs'][0]
    stored['status'] = 'awaiting_health_verification'
    stored.pop('bootstrapStepCount', None)
    original_job = stored['deploymentJobId']
    original_content = stored['snapshot']['deploymentContent']
    detail = service.detail_run(run['id'])
    assert detail['bootstrapStepCount'] == 2
    service.start_bootstrap(run['id'], 'admin', {'riskAcknowledged': True, 'confirmation': 'BOOTSTRAP HCI-01'}, 'Bearer private-test-session')
    result = wait_status(service, run['id'], 'awaiting_health_verification')
    assert result['deploymentJobId'] == original_job
    assert result['snapshot']['deploymentContent'] == original_content
    assert len(result['steps']) == 2
    assert sum(p.get('workflow') == 'cluster-create-foundation-vm' for p in h[5]) == 1
