"""Empty-switch creation and handoff use fake PE/CVM endpoints exclusively."""

from tests.conftest import create_account_session
from copy import deepcopy
import pytest
import pe_direct as direct
import pe_direct_uplink_ssh as ssh
import ahv_uplink_migration as uplink
import virtual_switch_create as create
from tests.pe_direct_lab import Lab, UPLINK, DESIRED, PINS, resolver

@pytest.fixture
def lab(monkeypatch):
    value = Lab()
    monkeypatch.setattr(direct, 'Client', lambda *args: value)
    monkeypatch.setattr(ssh, 'run', value.ssh)
    return value


def config():
    return {'connection': deepcopy(UPLINK), 'switchName': 'vs1', 'reviewed': True}


def prepared(lab):
    controller, pe = uplink.clients(UPLINK, resolver)
    return controller, pe, create.preflight(config(), controller, pe)


def test_create_only_inventory_allows_bootstrap_alerts_without_moving_nics(lab):
    lab.health = 'Critical'
    for node in lab.nodes: node['health_summary']['health_status'] = 'Warning'
    _, _, plan = prepared(lab)
    assert plan['changeRequired'] is True
    assert not lab.writes
    result, _ = execute(lab, plan)
    assert all(row['stage'] == 'verified' for row in result)
    assert all(state['switches']['br0']['ports'] == ['eth0', 'eth1', 'eth2', 'eth3'] for state in lab.ovs.values())


def execute(lab, plan=None, authorize=lambda: None, cancelled=lambda: False):
    controller, pe, generated = prepared(lab)
    reports = []
    result = create.execute(plan or generated, controller, pe, lambda _: None, authorize, cancelled,
                            lambda rows: reports.append(deepcopy(rows)))
    return result, reports


def test_read_only_preflight_then_exact_create_only_commands(lab):
    before = deepcopy(lab.ovs)
    controller, pe, plan = prepared(lab)
    assert not lab.writes
    assert plan['bridge'] == 'br1' and plan['changeRequired']
    assert create.load_plan(uplink.canonical(plan)) == plan
    approved = []
    result, reports = execute(lab, plan, lambda: approved.append(True))
    assert len(result) == len(approved) == 3
    assert [w[2] for w in lab.writes] == ['create'] * 3
    assert all(w[3] == {'bridge': 'br1'} for w in lab.writes)
    for ip, value in lab.ovs.items():
        assert value['switches']['br1']['ports'] == []
        observed = deepcopy(value)
        observed['switches'].pop('br1')
        assert observed == before[ip]
    assert len(reports[-1]) == 3 and all(r['stage'] == 'verified' for r in reports[-1])
    assert not create.preflight(config(), controller, pe)['changeRequired']


@pytest.mark.parametrize('name', ['vs0', 'br0', 'vs01', 'vs1000', 'vs1;reboot', '$(id)', '', None])
def test_bad_names_never_reach_a_command(name, lab):
    with pytest.raises(ValueError): create.intent({**config(), 'switchName': name})
    assert not lab.writes


@pytest.mark.parametrize('failure', ['unreviewed', 'pc-mode', 'stale', 'revoked', 'cancelled', 'wrong-uuid', 'missing-pin'])
def test_gates_stop_before_creating_any_bridge(lab, failure):
    controller, pe, plan = prepared(lab)
    if failure == 'unreviewed': plan['intent']['reviewed'] = False
    if failure == 'pc-mode': plan['intent']['connection']['mode'] = 'pc'
    if failure == 'stale': lab.ovs[next(iter(PINS))]['switches']['br0']['mtu'] = 9000
    if failure == 'wrong-uuid': lab.uuid = '12345678-0000-4000-8000-000000000099'
    if failure == 'missing-pin': controller.config['cvm_host_keys'] = {}
    def authorize():
        if failure == 'revoked': raise direct.DirectError('Approval revoked')
    with pytest.raises(ValueError): create.execute(plan, controller, pe, lambda _: None, authorize,
                                                  lambda: failure == 'cancelled', lambda _: None)
    assert not lab.writes


def test_partial_failure_stops_then_new_plan_preserves_completed_empty_bridge(lab):
    controller, pe, plan = prepared(lab)
    lab.fail_host = list(PINS)[1]
    reports = []
    with pytest.raises(ValueError): create.execute(plan, controller, pe, lambda _: None, lambda: None,
                                                  lambda: False, lambda rows: reports.append(deepcopy(rows)))
    assert [w[1] for w in lab.writes] == list(PINS)[:2]
    assert len(reports[-1]) == 1
    lab.fail_host = None
    retry = create.preflight(config(), controller, pe)
    lab.writes.clear()
    result, _ = execute(lab, retry)
    assert [w[1] for w in lab.writes] == list(PINS)[1:]
    assert result[0]['action'] == 'already_present'


def test_observed_management_change_blocks_later_hosts(lab, monkeypatch):
    controller, pe, plan = prepared(lab)
    original = ssh.run
    def changed(*args, **kwargs):
        result = original(*args, **kwargs)
        if args[2] == 'create': lab.ovs[args[0]['address']]['switches']['br0']['mtu'] = 9000
        return result
    monkeypatch.setattr(ssh, 'run', changed)
    with pytest.raises(ValueError, match='did not verify'):
        create.execute(plan, controller, pe, lambda _: None, lambda: None, lambda: False, lambda _: None)
    assert len(lab.writes) == 1


def test_empty_switch_handoff_to_existing_uplink_migration(lab):
    controller, pe, plan = prepared(lab)
    execute(lab, plan)
    lab.writes.clear()
    desired = deepcopy(DESIRED)
    desired['target']['mode'] = 'existing'
    migration = uplink.preflight(desired, controller, pe)
    result = uplink.execute(migration, controller, pe, lambda _: None, lambda: None, lambda: False, lambda _: None)
    assert len(result) == 3
    assert all(w[2] == 'uplinks' for w in lab.writes)
    assert all(v['switches']['br0']['ports'] == ['eth0', 'eth1'] for v in lab.ovs.values())
    assert all(v['switches']['br1']['ports'] == ['eth2', 'eth3'] for v in lab.ovs.values())


def test_api_roles_independent_approval_and_exact_durable_job(client, auth_headers, monkeypatch, lab):
    import server
    import json
    import time
    monkeypatch.setattr(server.limiter, 'enabled', False)
    monkeypatch.setattr(server, '_pe_login_title_resolver', lambda _: resolver)
    base = '/api/create-virtual-switch'
    assert client.get(base).status_code == 401
    operator = {'Authorization': 'Bearer ' + create_account_session(server, 'operator', 'operator')}
    assert client.post(base + '/preflight', json=config(), headers=operator).status_code == 403
    assert client.post(base + '/apply', json={}, headers=auth_headers).status_code == 403
    response = client.post(base + '/preflight', json=config(), headers=auth_headers)
    assert response.status_code == 200, response.get_json()
    data = response.get_json()
    assert data['sha256'] == uplink.fingerprint(data['plan'])
    assert not lab.writes
    approval = client.post(base + '/approval', json={'content': data['content']}, headers=auth_headers)
    assert approval.status_code == 201, approval.get_json()
    aid = approval.get_json()['id']
    assert client.post('/api/approvals/' + aid + '/approve', json={}, headers=auth_headers).status_code == 403
    monkeypatch.setenv('ZTF_CREATE_VIRTUAL_SWITCH_ENABLE_MUTATION', 'true')
    payload = {'content': data['content'], 'approvalId': aid,
               'confirmation': 'CREATE SWITCH ' + UPLINK['cluster_uuid'] + ' vs1'}
    assert client.post(base + '/apply', json=payload, headers=auth_headers).status_code == 403
    server._save_users([*server._load_users(), {'username': 'reviewer', 'role': 'admin'}])
    reviewer = {'Authorization': 'Bearer ' + create_account_session(server, 'reviewer', 'admin')}
    assert client.post('/api/approvals/' + aid + '/approve', json={}, headers=reviewer).status_code == 200
    changed = json.loads(data['content'])
    changed['intent']['switchName'] = 'vs2'
    assert client.post(base + '/apply', json={**payload, 'content': uplink.canonical(changed)}, headers=auth_headers).status_code == 403
    assert client.post(base + '/apply', json=payload, headers=reviewer).status_code == 403
    submitted = client.post(base + '/apply', json=payload, headers=auth_headers)
    assert submitted.status_code == 202, submitted.get_json()
    jid = submitted.get_json()['id']
    assert client.post(base + '/apply', json=payload, headers=auth_headers).get_json()['id'] == jid
    for _ in range(200):
        job = server._job_manager.get_job(jid)
        if job['status'] in {'success', 'failed', 'cancelled', 'interrupted'}: break
        time.sleep(.01)
    assert job['status'] == 'success', job
    assert len(job['diagnostics']['verifiedHosts']) == 3
    assert [w[2] for w in lab.writes] == ['create'] * 3
    assert 'fixture-secret' not in json.dumps(job)


def test_response_loss_after_accepted_create_never_retries_or_changes_later_hosts(lab, monkeypatch):
    controller, pe, plan = prepared(lab)
    original = ssh.run
    def lost(*args, **kwargs):
        result = original(*args, **kwargs)
        if args[2] == 'create': raise direct.DirectError('Response lost after command acceptance; reconcile')
        return result
    monkeypatch.setattr(ssh, 'run', lost)
    with pytest.raises(ValueError, match='reconcile'):
        create.execute(plan, controller, pe, lambda _: None, lambda: None, lambda: False, lambda _: None)
    assert len(lab.writes) == 1
    assert 'br1' in lab.ovs[next(iter(PINS))]['switches']
    assert all('br1' not in lab.ovs[ip]['switches'] for ip in list(PINS)[1:])
