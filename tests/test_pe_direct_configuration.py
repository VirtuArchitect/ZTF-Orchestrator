"""Cluster-local rehearsal. All PE and SSH endpoints are test doubles."""

from tests.conftest import create_account_session
from copy import deepcopy
import json
import ssl
import time
import urllib.error

import pytest

import ahv_uplink_migration as uplink
import dare_workflow as dare
import pe_direct as direct
import pe_direct_dare as encryption
import pe_direct_uplink_ssh as ssh

from tests.pe_direct_lab import CLUSTER, HOSTS, PINS, CONNECTION, UPLINK, DESIRED, DARE, resolver, Lab

@pytest.fixture
def lab(monkeypatch):
    value = Lab()
    monkeypatch.setattr(direct, 'Client', lambda config, saved: value)
    monkeypatch.setattr(encryption, 'Client', lambda config, saved: value)
    monkeypatch.setattr(ssh, 'run', value.ssh)
    monkeypatch.setattr(direct.urllib.request.OpenerDirector, 'open', lambda *a, **k: pytest.fail('Unexpected live HTTP request'))
    return value


def test_direct_dare_preflight_and_verified_single_submission(lab):
    plan = dare.preflight(DARE, resolver)
    assert plan['intent']['connection']['verify_tls'] is False
    assert plan['intent']['connection']['tls_bypass_reason'] == CONNECTION['tls_bypass_reason']
    assert not lab.writes
    authorized = []
    result = dare.execute(plan, resolver, lambda: authorized.append(True), lambda: False, lambda _: None)
    assert result['encryptionState'] == 'enabled'
    assert result['backgroundStatus'] == 'unreported'
    assert result['containerReadback'] == 'incomplete_or_unreported'
    assert len(authorized) == len(lab.writes) == 1
    assert dare.execute(plan, resolver, lambda: pytest.fail('Unexpected write'), lambda: False, lambda _: None)['encryptionState'] == 'already_configured'
    assert len(lab.writes) == 1


@pytest.mark.parametrize('failure', ['kms', 'identity', 'health', 'host-health', 'host-type', 'membership', 'missing-ready', 'missing-status', 'scope', 'drive-encryption'])
def test_dare_preflight_rejects_unsupported_or_incomplete_evidence(lab, failure):
    if failure == 'kms': lab.kms = 'EKM'
    if failure == 'identity': lab.uuid = HOSTS[0]
    if failure == 'health': lab.health = 'Unknown'
    if failure == 'host-health': lab.nodes[0]['health_summary']['health_status'] = 'Warning'
    if failure == 'host-type': lab.nodes[0]['hypervisor_type'] = 'kVMware'
    if failure == 'membership': lab.nodes.pop()
    if failure == 'missing-ready': lab.encryption.pop('is_ready_for_software_encryption')
    if failure == 'missing-status': lab.encryption.pop('storage_container_encryption_status')
    if failure == 'scope': lab.encryption['software_encryption_scope'] = 'STORAGE_CONTAINER'
    if failure == 'drive-encryption': lab.encryption['desired_password_protection'] = True
    with pytest.raises(ValueError): dare.preflight(DARE, resolver)
    assert not lab.writes


def test_dare_ambiguous_post_is_not_retried(lab):
    plan = dare.preflight(DARE, resolver)
    lab.ambiguous = True
    with pytest.raises(direct.DirectError, match='reconcile'):
        dare.execute(plan, resolver, lambda: None, lambda: False, lambda _: None)
    assert len(lab.writes) == 1


@pytest.mark.parametrize('failure', ['stale', 'cancelled', 'approval'])
def test_dare_gates_stop_before_writes(lab, failure):
    plan = dare.preflight(DARE, resolver)
    if failure == 'stale': lab.encryption['storage_container_encryption_status']['new'] = False
    def authorize():
        if failure == 'approval': raise direct.DirectError('Approval revoked')
    with pytest.raises(ValueError):
        dare.execute(plan, resolver, authorize, lambda: failure == 'cancelled', lambda _: None)
    assert not lab.writes


def test_direct_uplinks_sequentially_create_and_verify_all_hosts(lab):
    pc, pe = uplink.clients(UPLINK, resolver)
    plan = uplink.preflight(DESIRED, pc, pe)
    assert not lab.writes
    reports = []
    authorized = []
    result = uplink.execute(plan, pc, pe, lambda _: None, lambda: authorized.append(True), lambda: False,
                            lambda rows: reports.append(deepcopy(rows)))
    assert len(authorized) == len(lab.writes) == 9
    assert [w[1] for w in lab.writes] == [ip for ip in PINS for _ in range(3)]
    assert [w[2] for w in lab.writes] == ['uplinks', 'create', 'uplinks'] * 3
    assert len(result) == 3 and all(row['stage'] == 'verified' for row in result)
    assert reports[0][0]['stage'] == 'retained_uplinks_verified'
    for value in lab.ovs.values():
        assert value['switches']['br0']['ports'] == ['eth0', 'eth1']
        assert value['switches']['br1']['ports'] == ['eth2', 'eth3']


@pytest.mark.parametrize('health', ['Warning', 'Critical', 'Unknown', None, 'missing'])
def test_bootstrap_alerts_do_not_gate_direct_network_discovery_or_approved_execution(lab, health):
    pc, pe = uplink.clients(UPLINK, resolver)
    baseline = uplink.preflight(DESIRED, pc, pe)
    lab.health = health
    for node in lab.nodes:
        node['health_summary'] = {'health_status': health}
    if health == 'missing':
        original_request = lab.request
        def request(method, path, body=None):
            value = original_request(method, path, body)
            if path == '/cluster/': value.pop('health_summary', None)
            if path == '/hosts/':
                for node in value['entities']: node.pop('health_summary', None)
            return value
        lab.request = request
    discovered = uplink.collect(UPLINK, pc, pe)
    assert len(discovered['hosts']) == 3
    assert uplink.preflight(DESIRED, pc, pe) == baseline
    assert not lab.writes
    result = uplink.execute(baseline, pc, pe, lambda _: None, lambda: None, lambda: False)
    assert len(result) == 3 and all(row['stage'] == 'verified' for row in result)


def test_discovery_api_accepts_bootstrap_alerts_but_still_rejects_wrong_identity(client, auth_headers, monkeypatch, lab):
    import server
    monkeypatch.setattr(server.limiter, 'enabled', False)
    monkeypatch.setattr(server, '_pe_login_title_resolver', lambda _: resolver)
    lab.health = 'Critical'
    for node in lab.nodes: node['health_summary']['health_status'] = 'Warning'
    response = client.post('/api/ahv-uplink-migration/discover', json=UPLINK, headers=auth_headers)
    assert response.status_code == 200, response.get_json()
    assert len(response.get_json()['hosts']) == 3
    response = client.post('/api/ahv-uplink-migration/preflight', json=DESIRED, headers=auth_headers)
    assert response.status_code == 200, response.get_json()
    lab.uuid = HOSTS[0]
    response = client.post('/api/ahv-uplink-migration/discover', json=UPLINK, headers=auth_headers)
    assert response.status_code == 400 and 'UUID' in response.get_json()['error']
    assert not lab.writes


@pytest.mark.parametrize('failure', ['few-kept', 'missing-pin', 'bad-pin', 'wrong-serial', 'wrong-host-ip', 'down-link', 'stale', 'cancelled'])
def test_uplink_preflight_and_execution_fail_closed(lab, failure):
    config, intended = deepcopy(UPLINK), deepcopy(DESIRED)
    if failure == 'few-kept': intended['move'][HOSTS[0]] = ['eth1', 'eth2', 'eth3']
    if failure == 'missing-pin': config['cvm_host_keys'].pop('192.0.2.21')
    if failure == 'bad-pin': config['cvm_host_keys']['192.0.2.21'] = 'unverified'
    if failure == 'wrong-serial': lab.ovs['192.0.2.21']['serial'] = 'WRONG'
    if failure == 'wrong-host-ip': lab.ovs['192.0.2.21']['addresses'] = ['192.0.2.250']
    if failure == 'down-link': lab.ovs['192.0.2.21']['nics'][0]['up'] = False
    intended['connection'] = config
    with pytest.raises((ValueError, AssertionError)):
        pc, pe = uplink.clients(config, resolver)
        plan = uplink.preflight(intended, pc, pe)
        if failure == 'stale': lab.ovs['192.0.2.21']['switches']['br0']['mtu'] = 9000
        uplink.execute(plan, pc, pe, lambda _: None, lambda: None, lambda: failure == 'cancelled')
    assert not lab.writes


def test_uplink_stops_after_failed_host_preserving_previous_results(lab):
    pc, pe = uplink.clients(UPLINK, resolver)
    plan = uplink.preflight(DESIRED, pc, pe)
    lab.fail_host = '192.0.2.22'
    reports = []
    with pytest.raises(direct.DirectError, match='reconcile'):
        uplink.execute(plan, pc, pe, lambda _: None, lambda: None, lambda: False, lambda rows: reports.append(deepcopy(rows)))
    assert reports[-1][0]['stage'] == 'verified'
    assert lab.ovs['192.0.2.21']['switches']['br1']['ports'] == ['eth2', 'eth3']
    assert not any(w[1] == '192.0.2.23' for w in lab.writes)


@pytest.mark.parametrize('change', [{'verify_tls': 'false'}, {'verify_tls': False, 'tls_bypass_reason': ''},
    {'verify_tls': False, 'tls_bypass_reason': 'line\nbreak'}, {'pe_endpoint': 'http://pe.example.com:9440'},
    {'pe_endpoint': 'https://user:secret@pe.example.com:9440'}, {'unexpected': True}])
def test_connection_rejects_implicit_or_malformed_tls_exception(change):
    with pytest.raises(ValueError): direct.connection({**CONNECTION, **change})


def test_tls_context_is_per_client_and_defaults_remain_verified(monkeypatch):
    contexts = []
    def opener(*handlers):
        contexts.append(next(h._context for h in handlers if hasattr(h, '_context')))
        return object()
    monkeypatch.setattr(direct.urllib.request, 'build_opener', opener)
    direct.Client(CONNECTION, ('admin', 'not-logged'))
    direct.Client({**CONNECTION, 'verify_tls': True}, ('admin', 'not-logged'))
    assert contexts[0].verify_mode == ssl.CERT_NONE and contexts[0].check_hostname is False
    assert contexts[1].verify_mode == ssl.CERT_REQUIRED and contexts[1].check_hostname is True
    assert ssl.create_default_context().verify_mode == ssl.CERT_REQUIRED


@pytest.mark.parametrize('status', [301, 401, 403, 500])
def test_transport_reports_status_without_response_body_or_credentials(monkeypatch, status):
    client = direct.Client(CONNECTION, ('admin', 'fixture-secret-never-log'))
    def fail(*args, **kwargs):
        raise urllib.error.HTTPError('https://private', status, 'secret-response', {}, None)
    monkeypatch.setattr(client.opener, 'open', fail)
    with pytest.raises(direct.DirectError, match=f'HTTP {status}') as error:
        client.request('POST', encryption.STATE + '/enable', {'value': True})
    assert 'secret' not in str(error.value) and 'private' not in str(error.value)


@pytest.mark.parametrize('action,data', [('create', {'bridge': 'br0'}), ('create', {'bridge': 'br1;bad'}),
    ('uplinks', {'bridge': 'br0', 'ports': ['eth0;bad', 'eth1'], 'bond': 'br0-up', 'mtu': 1500})])
def test_ssh_command_construction_rejects_unreviewed_commands(action, data):
    with pytest.raises(ValueError): ssh.commands(action, data)


@pytest.mark.parametrize('revoked', [False, True])
@pytest.mark.parametrize('workflow,connection,intent', [('dare', CONNECTION, DARE), ('ahv-uplink-migration', UPLINK, DESIRED)])
def test_api_audits_exception_and_requires_exact_independent_approval(client, auth_headers, monkeypatch, lab, workflow, connection, intent, caplog, revoked):
    import server
    monkeypatch.setattr(server.limiter, 'enabled', False)
    monkeypatch.setattr(server, '_pe_login_title_resolver', lambda _: resolver)
    base = '/api/' + workflow
    operator = {'Authorization': 'Bearer ' + create_account_session(server, 'operator', 'operator')}
    assert client.post(base + '/discover', json=connection, headers=operator).status_code == 403
    assert not lab.calls
    response = client.post(base + '/discover', json=connection, headers=auth_headers)
    assert response.status_code == 200, response.get_json()
    audit = [r for r in caplog.records if getattr(r, 'action', None) == 'pe_tls_verification_bypassed']
    assert audit and audit[-1].verifyTls is False and audit[-1].reason == CONNECTION['tls_bypass_reason']
    assert 'fixture-secret' not in '\n'.join(r.getMessage() for r in caplog.records)
    preflight = client.post(base + '/preflight', json=intent, headers=auth_headers)
    assert preflight.status_code == 200, preflight.get_json()
    content = preflight.get_json()['content']
    assert not lab.writes
    approval = client.post(base + '/approval', json={'content': content}, headers=auth_headers)
    assert approval.status_code == 201, approval.get_json()
    identity = approval.get_json()['id']
    assert 'BYPASSED' in server._approval_manager.get_approval(identity)['notes']
    confirm = ('ENCRYPT ' if workflow == 'dare' else 'APPLY UPLINKS ') + CLUSTER
    payload = {'content': content, 'approvalId': identity, 'confirmation': confirm}
    assert client.post(base + '/apply', json=payload, headers=auth_headers).status_code == 403
    monkeypatch.setenv('ZTF_DARE_ENABLE_MUTATION' if workflow == 'dare' else 'ZTF_AHV_UPLINK_MIGRATION_ENABLED', 'true')
    assert client.post(base + '/apply', json=payload, headers=auth_headers).status_code == 403
    assert client.post('/api/approvals/' + identity + '/approve', json={}, headers=auth_headers).status_code == 403
    server._save_users([*server._load_users(), {'username': 'reviewer', 'role': 'admin'}])
    approver = {'Authorization': 'Bearer ' + create_account_session(server, 'reviewer', 'admin')}
    assert client.post('/api/approvals/' + identity + '/approve', json={}, headers=approver).status_code == 200
    tampered = json.loads(content)
    tampered['intent']['connection']['tls_bypass_reason'] = 'DIFFERENT'
    assert client.post(base + '/apply', json={**payload, 'content': uplink.canonical(tampered)}, headers=auth_headers).status_code == 403
    assert client.post(base + '/apply', json=payload, headers=approver).status_code == 403
    if revoked:
        server._save_users([{**u, 'role': 'operator'} if u['username'] == 'reviewer' else u for u in server._load_users()])
    response = client.post(base + '/apply', json=payload, headers=auth_headers)
    assert response.status_code == 202, response.get_json()
    job_id = response.get_json()['id']
    assert client.post(base + '/apply', json=payload, headers=auth_headers).get_json()['id'] == job_id
    for _ in range(100):
        job = server._job_manager.get_job(job_id)
        if job['status'] in ('success', 'failed'): break
        time.sleep(.05)
    if revoked:
        assert job['status'] == 'failed'
        assert 'remain administrators' in job['diagnostics']['evidence']
        assert not lab.writes
        return
    assert job['status'] == 'success', job.get('diagnostics')
    assert len(lab.writes) == (1 if workflow == 'dare' else 9)
    assert job['diagnostics']['connectionMode'] == 'pe-direct'
    assert job['diagnostics']['verifyTls'] is False
    assert job['diagnostics']['tlsBypassReason'] == connection['tls_bypass_reason']


def ovs_output():
    def table(headings, values):
        return json.dumps({'headings': headings, 'data': values})
    def identity(value):
        return ['uuid', value]
    interfaces = [[identity('i' + str(i)), 'eth' + str(i), '', 'up', '00:11:22:33:44:0' + str(i), 1500]
                  for i in range(4)]
    interfaces.append([identity('bridge-interface'), 'br0', 'internal', 'up', '00:11:22:33:44:ff', 1500])
    return ['SERIAL-0\n', '192.0.2.31 192.168.5.1\n',
            table(['_uuid', 'name', 'ports'], [[identity('bridge-0'), 'br0', ['set', [identity('bond'), identity('internal')]]]]),
            table(['_uuid', 'name', 'interfaces', 'bond_mode'], [
                [identity('bond'), 'br0-up', ['set', [identity('i' + str(i)) for i in range(4)]], 'active-backup'],
                [identity('internal'), 'br0', identity('bridge-interface'), ['set', []]]]),
            table(['_uuid', 'name', 'type', 'link_state', 'mac_in_use', 'mtu'], interfaces)]


def test_ovs_structured_inventory_and_duplicate_identity_rejection():
    output = ovs_output()
    observed = ssh.parse_inventory(output)
    assert observed['serial'] == 'SERIAL-0'
    assert observed['switches']['br0']['ports'] == ['eth0', 'eth1', 'eth2', 'eth3']
    assert all(n['switch'] == 'br0' and n['up'] for n in observed['nics'])
    for index in (2, 3, 4):
        invalid = list(output)
        table = json.loads(invalid[index])
        table['data'].append(table['data'][0])
        invalid[index] = json.dumps(table)
        with pytest.raises(direct.DirectError, match='Duplicate'):
            ssh.parse_inventory(invalid)


def test_ssh_worker_keeps_strict_inner_host_key_checking():
    commands = ssh.commands('inspect', {})
    assert len(commands) == 5
    assert all('StrictHostKeyChecking=yes' in command and 'BatchMode=yes' in command for command in commands)
    assert all('root@192.168.5.1' in command for command in commands)
    assert 'StrictHostKeyChecking=no' not in ' '.join(commands)


def test_ssh_subprocess_rejects_unverified_pin_without_exposing_credentials(monkeypatch):
    import sys
    monkeypatch.setenv('ZTF_PYTHON', sys.executable)
    with pytest.raises(direct.DirectError) as error:
        ssh.run({'address': '192.0.2.21', 'ssh_host_key_sha256': 'unverified'},
                ('nutanix', 'fixture-secret-never-log'), 'inspect')
    assert 'fixture-secret' not in str(error.value)


def test_pe_direct_does_not_extend_unrelated_mtu_transport():
    import virtual_switch_mtu
    with pytest.raises(ValueError, match='Prism Central'):
        virtual_switch_mtu.connection({'connection': CONNECTION, 'fabricReviewed': True, 'rollbackJobId': ''})


def test_final_uplink_readback_detects_drift_on_completed_host(lab, monkeypatch):
    pc, pe = uplink.clients(UPLINK, resolver)
    plan = uplink.preflight(DESIRED, pc, pe)
    original = lab.ssh
    def drift(node, saved, action, command=None, cancelled=lambda: False):
        result = original(node, saved, action, command, cancelled)
        if action == 'uplinks' and node['address'] == '192.0.2.23' and command['bridge'] == 'br1':
            lab.ovs['192.0.2.21']['switches']['br0']['mtu'] = 9000
        return result
    monkeypatch.setattr(ssh, 'run', drift)
    with pytest.raises(direct.DirectError, match='Final cluster-wide'):
        uplink.execute(plan, pc, pe, lambda _: None, lambda: None, lambda: False)
