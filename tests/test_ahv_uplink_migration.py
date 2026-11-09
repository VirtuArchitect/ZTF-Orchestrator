from copy import deepcopy

import pytest

import ahv_uplink_migration as uplink


def uid(num):
    return f'12345678-0000-4000-8000-{num:012d}'


CLUSTER = uid(1)
SOURCE = uid(2)
DESTINATION = uid(3)
HOSTS = [uid(num) for num in (11, 12, 13)]
PORTS = ['eth0', 'eth1', 'eth2', 'eth3']


def intent(mode='create'):
    return {'connection': {'pc_endpoint': 'https://pc.example.com:9440', 'pc_credential': 'pc_admin',
                           'pe_endpoint': 'https://pe.example.com:9440', 'pe_credential': 'pe_admin',
                           'cluster_uuid': CLUSTER},
            'target': {'name': 'vs1', 'mode': mode, 'bondMode': 'ACTIVE_BACKUP', 'mtu': 1500},
            'move': {host: ['eth2', 'eth3'] for host in HOSTS}, 'fabricReviewed': True}


class Lab:
    def __init__(self, existing=False):
        self.writes = []
        self.health = 'Good'
        self.task_status = 'SUCCEEDED'
        self.fail_source_readback = False
        self.source = self.switch('vs0', SOURCE, PORTS, default=True)
        self.destination = self.switch('vs1', DESTINATION, ['eth4', 'eth5']) if existing else None

    def switch(self, name, identity, ports, default=False):
        return {'name': name, 'extId': identity, 'bondMode': 'ACTIVE_BACKUP', 'isDefault': default, 'mtu': 1500,
                'hasDeploymentError': False, 'hasUpdateInProgress': False, 'hasDeleteInProgress': False,
                'clusters': [{'extId': CLUSTER, 'hosts': [{'extId': host, 'internalBridgeName': 'br0' if default else 'br1',
                    'hostNics': list(ports)} for host in HOSTS]}]}

    def request(self, method, path):
        assert method == 'GET'
        if path.endswith('/cluster/'):
            return {'uuid': CLUSTER, 'name': 'AHV Lab', 'health_summary': {'health_status': self.health}}
        return {'metadata': {'grand_total_entities': len(HOSTS)}, 'entities': [
            {'serial': f'host-{idx}', 'hypervisor_address': f'192.0.2.{10 + idx}',
             'service_vmexternal_ip': f'192.0.2.{20 + idx}', 'health_summary': {'health_status': 'Good'}}
            for idx in range(len(HOSTS))]}

    def rows(self, path, cluster_header=None):
        if path == uplink.SWITCHES:
            assert cluster_header == CLUSTER
            return [deepcopy(item) for item in (self.source, self.destination) if item]
        if path.endswith('/hosts'):
            return [{'extId': host, 'hostName': f'AHV-{idx}', 'nodeSerial': f'host-{idx}', 'hypervisor': {'type': 'AHV'}}
                    for idx, host in enumerate(HOSTS)]
        host = path.split('/')[-2]
        membership = {port: SOURCE for port in uplink.host_ports(self.source)[host]}
        if self.destination:
            membership.update({port: DESTINATION for port in uplink.host_ports(self.destination)[host]})
        return [{'name': port, 'interfaceStatus': 'up', 'macAddress': f'02:01:01:01:{HOSTS.index(host):02x}:{idx:02x}',
                 'virtualSwitchExtId': membership.get(port)} for idx, port in enumerate(PORTS + ['eth4', 'eth5'])]

    def exchange(self, method, path, body=None, etag=None):
        if method == 'GET':
            if path.startswith(uplink.CLUSTERS):
                return {'extId': CLUSTER, 'name': 'AHV Lab'}, None, {}
            return deepcopy(self.source if path.endswith(SOURCE) else self.destination), '"revision"', {}
        self.writes.append((method, path, body, etag))
        if path.endswith(SOURCE):
            self.source['clusters'][0]['hosts'] = deepcopy(body['clusters'][0]['hosts'])
            for host in self.source['clusters'][0]['hosts']:
                host['internalBridgeName'] = 'br0'
            if self.fail_source_readback:
                self.health = 'Warning'
        else:
            self.destination = self.switch('vs1', DESTINATION, [])
            self.destination['clusters'][0]['hosts'] = deepcopy(body['clusters'][0]['hosts'])
        return {'extId': 'task-1'}, None, {}

    def task(self, identity):
        assert identity == 'task-1'
        return {'status': self.task_status}


@pytest.mark.parametrize('existing', [False, True])
def test_preflight_and_approved_application_are_scoped(existing):
    lab = Lab(existing)
    plan = uplink.preflight(intent('existing' if existing else 'create'), lab, lab)
    assert not lab.writes
    approval_checks, progress = [], []
    result = uplink.execute(plan, lab, lab, lambda line: None, lambda: approval_checks.append(True),
                            lambda: False, report=lambda rows: progress.append(deepcopy(rows)))
    assert len(approval_checks) == 2
    assert [item[0] for item in lab.writes] == ['PUT', 'PUT' if existing else 'POST']
    assert lab.writes[0][2]['isDefault'] is True
    assert lab.writes[0][3] == '"revision"'
    assert all(write[2]['isQuickMode'] is False for write in lab.writes)
    assert all(row['stage'] == 'verified' and row['kept'] == PORTS[:2] and row['moved'] == PORTS[2:] for row in result)
    assert progress[0][0]['stage'] == 'retained_uplinks_verified'


@pytest.mark.parametrize('failure', ['too-few-kept', 'unknown-port', 'unconfirmed-fabric', 'destination-conflict', 'cluster-health'])
def test_preflight_rejects_unsafe_plans(failure):
    lab = Lab(existing=failure == 'destination-conflict')
    value = intent()
    if failure == 'too-few-kept':
        value['move'][HOSTS[0]] = PORTS[1:]
    elif failure == 'unknown-port':
        value['move'][HOSTS[0]] = ['eth5', 'eth6']
    elif failure == 'unconfirmed-fabric':
        value['fabricReviewed'] = False
    elif failure == 'cluster-health':
        lab.health = 'Warning'
    with pytest.raises(uplink.MigrationError):
        uplink.preflight(value, lab, lab)
    assert not lab.writes


@pytest.mark.parametrize('failure', ['source-readback', 'task', 'stale', 'cancelled'])
def test_execute_stops_before_destination_after_failed_gate(failure):
    lab = Lab()
    plan = uplink.preflight(intent(), lab, lab)
    if failure == 'source-readback':
        lab.fail_source_readback = True
    elif failure == 'task':
        lab.task_status = 'FAILED'
    elif failure == 'stale':
        lab.source['mtu'] = 9000
    with pytest.raises(uplink.MigrationError):
        uplink.execute(plan, lab, lab, lambda line: None, lambda: None, lambda: failure == 'cancelled')
    assert len(lab.writes) == (0 if failure in {'stale', 'cancelled'} else 1)


def test_apply_requires_different_admin_and_one_job_per_approval(client, auth_headers, monkeypatch):
    import server

    monkeypatch.setattr(server.limiter, "enabled", False)
    lab = Lab()
    plan = uplink.preflight(intent(), lab, lab)
    content = uplink.canonical(plan)
    monkeypatch.setattr(server, '_fresh_ahv_uplink_plan', lambda intent: plan)
    approval_url = '/api/ahv-uplink-migration/approval'
    apply_url = '/api/ahv-uplink-migration/apply'
    assert client.get('/api/ahv-uplink-migration').status_code == 401
    assert client.post('/api/approvals', json={'workflow': uplink.WORKFLOW}, headers=auth_headers).status_code == 400
    operator = server._create_session('example-operator', 'operator')
    assert client.post(approval_url, json={'content': content}, headers={'Authorization': f'Bearer {operator}'}).status_code == 403
    response = client.post(approval_url, json={'content': content}, headers=auth_headers)
    assert response.status_code == 201
    approval_id = response.get_json()['id']
    payload = {'content': content, 'approvalId': approval_id, 'confirmation': f'APPLY UPLINKS {CLUSTER}'}
    assert client.post(apply_url, json=payload, headers=auth_headers).status_code == 403
    monkeypatch.setenv('ZTF_AHV_UPLINK_MIGRATION_ENABLED', 'true')
    assert client.post(apply_url, json=payload, headers=auth_headers).status_code == 403
    assert client.post(f'/api/approvals/{approval_id}/approve', json={}, headers=auth_headers).status_code == 403
    second_admin = server._create_session('another-admin', 'admin')
    headers = {'Authorization': f'Bearer {second_admin}'}
    assert client.post(f'/api/approvals/{approval_id}/approve', json={}, headers=headers).status_code == 200
    calls = []
    monkeypatch.setattr(server._job_manager, 'submit', lambda data, user: calls.append(data) or {'id': 'test-job'})
    tampered = deepcopy(plan)
    tampered['inventory']['source']['etag'] = '"modified"'
    assert client.post(apply_url, json={**payload, 'content': uplink.canonical(tampered)}, headers=auth_headers).status_code == 403
    assert client.post(apply_url, json=payload, headers=headers).status_code == 403
    for _ in range(2):
        result = client.post(apply_url, json=payload, headers=auth_headers)
        assert result.status_code == 202
        assert result.get_json()['id'] == 'test-job'
    assert len(calls) == 1 and calls[0]['configContent'] == content
