"""Operational records and read-only PE evidence; no live systems contacted."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
import threading

import pytest

import cluster_operations as ops


def record():
    return {'name': 'HCI-01', 'datacenter': 'DC01', 'owner': 'Infrastructure',
            'peEndpoint': 'https://pe.example.com:9440', 'peCredential': 'pe_monitor',
            'expectedUuid': '00000000-0000-4000-8000-000000000001',
            'expectedNodes': [{'serial': 'NODE1', 'hostIp': '192.0.2.22', 'cvmIp': '192.0.2.23'}],
            'configFiles': ['post.yml'], 'pipelineId': 'pipe1', 'recoveryProfileId': ''}


@pytest.fixture
def harness():
    state = ops.empty()
    jobs, audits = [], []
    def write(value):
        state.clear(); state.update(deepcopy(value))
    service = ops.OperationsService({'read': lambda: deepcopy(state), 'write': write,
        'jobs': lambda: deepcopy(jobs), 'recovery': lambda: {'profiles': [], 'runs': []},
        'pipelines': lambda: [{'id': 'pipe1', 'name': 'Post configuration'}],
        'pipeline': lambda identity: identity == 'pipe1', 'config_exists': lambda name: name == 'post.yml',
        'collect': lambda row: {'status': 'good', 'collectedAt': ops.now(), 'checks': [], 'message': 'fixture'},
        'audit': lambda *args: audits.append(args)}, threading.RLock())
    return service, state, jobs, audits


def create(h):
    value, code = h[0].record({**record(), 'revision': h[1]['revision']}, 'admin')
    assert code == 200
    return value['id']


def test_registration_links_only_and_revision_protection(harness):
    service, state, _, audits = harness
    identity = create(harness)
    assert len(state['clusters']) == 1 and not state['clusters'][0].get('observation')
    assert audits[-1] == ('cluster_record_saved', 'admin', identity)
    _, code = service.record({**record(), 'revision': 0}, 'admin', identity)
    assert code == 409
    with pytest.raises(ValueError, match='already has'):
        service.record({**record(), 'revision': state['revision']}, 'admin')
    assert service.summary()['pipelines'][0]['id'] == 'pipe1'


@pytest.mark.parametrize('field,value', [('password', 'must-not-be-stored'), ('peEndpoint', 'http://pe.example.com'),
    ('peEndpoint', 'https://user:password@pe.example.com'), ('peEndpoint', 'https://pe.example.com/path'),
    ('expectedUuid', 'not-a-uuid'), ('configFiles', ['../post.yml']), ('configFiles', ['post.yml', 'post.yml']),
    ('expectedNodes', [{'serial': 'NODE1'}]), ('expectedNodes', [{'serial': 'NODE1', 'hostIp': 'host.example.com', 'cvmIp': '192.0.2.23'}])])
def test_invalid_cluster_inputs_rejected(field, value):
    with pytest.raises(ValueError):
        ops.validate_cluster({**record(), field: value})


def test_links_checked_and_duplicate_membership_rejected(harness):
    for key, value in [('configFiles', ['missing.yml']), ('pipelineId', 'missing'), ('recoveryProfileId', 'missing')]:
        with pytest.raises(ValueError):
            harness[0].record({**record(), key: value, 'revision': 0}, 'admin')
    value = record(); value['expectedNodes'] *= 2
    with pytest.raises(ValueError, match='unique'):
        ops.validate_cluster(value)


def test_failed_jobs_survive_recent_activity_and_queue_deletion(harness):
    service, state, jobs, _ = harness
    jobs.extend([{'id': 'old-failure', 'workflow': 'config-cluster', 'status': 'failed'}] +
                [{'id': str(i), 'workflow': 'config-cluster', 'status': 'success'} for i in range(20)])
    view = service.summary()
    assert view['attention']['job-old-failure']['status'] == 'open'
    jobs.clear()
    assert service.summary()['attention']['job-old-failure']['status'] == 'open'
    _, code = service.attention('job-old-failure', {'revision': state['revision'], 'status': 'acknowledged', 'owner': 'Team', 'notes': 'Investigating'}, 'operator')
    assert code == 200
    view = service.summary()
    assert view['attention']['job-old-failure']['status'] == 'acknowledged'
    with pytest.raises(ValueError):
        service.attention('job-old-failure', {'revision': state['revision'], 'status': 'resolved', 'owner': 'Team', 'notes': ''}, 'operator')
    service.attention('job-old-failure', {'revision': state['revision'], 'status': 'resolved', 'owner': 'Team', 'notes': 'Target reconciled; no retry'}, 'operator')
    assert service.summary()['attention']['job-old-failure']['status'] == 'resolved'
    assert len(state['attention']['job-old-failure']['reviews']) == 2


def test_read_only_maintenance_view_does_not_write_attention_state(harness):
    service, state, jobs, _ = harness
    jobs.append({'id': 'failed1', 'workflow': 'config-cluster', 'status': 'failed'})
    service.s['can_write'] = lambda: False
    assert service.summary()['attention']['job-failed1']['status'] == 'open'
    assert state['attention'] == {} and state['revision'] == 0


def test_attention_survives_service_recreation_and_conflicting_reviews(harness):
    service, state, jobs, _ = harness
    jobs.append({'id': 'failed1', 'workflow': 'config-cluster', 'status': 'failed'})
    service.summary()
    revision = state['revision']
    update = {'revision': revision, 'status': 'acknowledged', 'owner': 'Team', 'notes': 'Investigating'}
    assert service.attention('job-failed1', update, 'admin')[1] == 200
    assert service.attention('job-failed1', update, 'other')[1] == 409
    restored = ops.OperationsService(service.s, threading.RLock())
    assert restored.summary()['attention']['job-failed1']['status'] == 'acknowledged'


def test_health_staleness_invalidation_and_failed_collection(harness):
    service, state, _, _ = harness
    identity = create(harness)
    observation, code = service.observe(identity, 'operator')
    assert code == 200 and observation['status'] == 'good'
    assert service.summary()['clusters'][0]['observationFresh'] is True
    state['clusters'][0]['observation']['collectedAt'] = (datetime.now(timezone.utc) - timedelta(minutes=16)).isoformat()
    assert service.summary()['clusters'][0]['observationFresh'] is False
    assert 'health-' + identity in state['attention']
    service.record({**record(), 'owner': 'Other team', 'revision': state['revision']}, 'admin', identity)
    assert state['clusters'][0].get('observation')
    service.record({**record(), 'name': 'HCI-02', 'revision': state['revision']}, 'admin', identity)
    assert 'observation' not in state['clusters'][0]


def test_new_failed_readback_reopens_resolved_item_but_success_does_not_resolve(harness):
    service, state, _, _ = harness
    identity = create(harness)
    service.s['collect'] = lambda row: {'status': 'unknown', 'collectedAt': ops.now(), 'checks': [], 'message': 'fixture'}
    service.observe(identity, 'operator'); service.summary()
    item = 'health-' + identity
    service.attention(item, {'revision': state['revision'], 'status': 'resolved', 'owner': 'Team', 'notes': 'Cause reviewed'}, 'operator')
    service.observe(identity, 'operator'); service.summary()
    assert state['attention'][item]['status'] == 'open'
    service.s['collect'] = lambda row: {'status': 'good', 'collectedAt': ops.now(), 'checks': [], 'message': 'fixture'}
    service.observe(identity, 'operator'); service.summary()
    assert state['attention'][item]['status'] == 'open'


def test_collection_races_and_duplicate_request_do_not_store_old_evidence(harness):
    service, state, _, _ = harness
    identity = create(harness)
    def collect(row):
        _, code = service.observe(identity, 'other')
        assert code == 409
        service.record({**record(), 'owner': 'Changed while collecting', 'revision': state['revision']}, 'admin', identity)
        return {'status': 'good', 'collectedAt': ops.now()}
    service.s['collect'] = collect
    _, code = service.observe(identity, 'operator')
    assert code == 409 and 'observation' not in state['clusters'][0]
    assert not service.collecting


def pe_responses():
    return {'uuid': record()['expectedUuid'], 'name': 'HCI-01', 'health_summary': {'health_status': 'Good'}}, {
        'metadata': {'grand_total_entities': 1, 'total_entities': 1},
        'entities': [{'serial': 'NODE1', 'hypervisor_address': '192.0.2.22', 'service_vmexternal_ip': '192.0.2.23', 'health_summary': {'health_status': 'Good'}}]}


def test_pe_health_reads_are_fixed_verified_get_paths(monkeypatch):
    cluster, hosts = pe_responses(); calls = []
    def read(url, ref, path, lookup, **kwargs):
        assert kwargs == {}  # Defaults enforce verified TLS; no bypass accepted.
        calls.append((url, ref, path))
        return cluster if '/cluster/' in path else hosts
    monkeypatch.setattr(ops, 'read', read)
    result = ops.collect_health(record(), None)
    assert result['status'] == 'good' and len(calls) == 2
    assert {x[2] for x in calls} == {'/PrismGateway/services/rest/v2.0/cluster/?include_health_summary=true', '/PrismGateway/services/rest/v2.0/hosts/?include_health_summary=true'}
    assert all(c['status'] == 'passed' for c in result['checks'])


@pytest.mark.parametrize('failure', ['uuid', 'name', 'serial', 'address', 'pagination', 'health_missing', 'critical'])
def test_missing_or_mismatched_evidence_never_passes(monkeypatch, failure):
    cluster, hosts = pe_responses()
    if failure == 'uuid': cluster['uuid'] = 'different'
    if failure == 'name': cluster['name'] = 'different'
    if failure == 'serial': hosts['entities'][0]['serial'] = 'different'
    if failure == 'address': hosts['entities'][0]['service_vmexternal_ip'] = '192.0.2.99'
    if failure == 'pagination': hosts['metadata']['grand_total_entities'] = 2
    if failure == 'health_missing': del cluster['health_summary']
    if failure == 'critical': cluster['health_summary']['health_status'] = 'Critical'
    monkeypatch.setattr(ops, 'read', lambda u, r, p, l: cluster if '/cluster/' in p else hosts)
    result = ops.collect_health(record(), None)
    assert result['status'] == ('not_good' if failure == 'critical' else 'unknown')


def test_incomplete_baseline_never_contacts_pe_and_errors_are_sanitized(monkeypatch):
    def read(*args):
        raise ValueError('private-password raw exception')
    monkeypatch.setattr(ops, 'read', read)
    result = ops.collect_health({**record(), 'expectedUuid': ''}, None)
    assert result['status'] == 'unknown' and not result['checks']
    result = ops.collect_health(record(), None)
    assert result['status'] == 'unknown' and 'private-password' not in json.dumps(result)


def test_operations_api_permissions_storage_and_no_automatic_collection(client, auth_headers, monkeypatch, isolated_data_dir):
    import server
    calls = []
    monkeypatch.setitem(server._operations_service.s, 'collect', lambda row: calls.append(row) or {'status': 'unknown', 'collectedAt': ops.now()})
    assert client.get('/api/operations').status_code == 401
    response = client.post('/api/operations/clusters', headers=auth_headers, json={**record(), 'configFiles': [], 'pipelineId': '', 'revision': 0})
    assert response.status_code == 200
    identity = response.get_json()['id']
    assert client.post(f'/api/operations/clusters/{identity}/health', headers=auth_headers, json={'verifyTls': False}).status_code == 400
    assert client.get('/api/operations', headers=auth_headers).status_code == 200 and calls == []
    for role in ('viewer', 'operator'):
        client.post('/api/users', headers=auth_headers, json={'username': role, 'password': 'FixtureOnly123!', 'role': role})
        token = client.post('/api/auth/login', json={'username': role, 'password': 'FixtureOnly123!'}).get_json()['token']
        headers = {'Authorization': 'Bearer ' + token}
        assert client.get('/api/operations', headers=headers).status_code == 200
        assert client.post('/api/operations/clusters', headers=headers, json={}).status_code == 403
        status = client.post(f'/api/operations/clusters/{identity}/health', headers=headers, json={}).status_code
        assert status == (403 if role == 'viewer' else 200)
        assert client.put('/api/operations/attention/missing', headers=headers, json={}).status_code == (403 if role == 'viewer' else 400)
    assert len(calls) == 1
    path = isolated_data_dir / 'cluster_operations.json'; path.write_text('{broken', encoding='utf-8')
    assert client.get('/api/operations', headers=auth_headers).status_code != 200
    assert client.post('/api/operations/clusters', headers=auth_headers, json={**record(), 'configFiles': [], 'pipelineId': '', 'revision': 0}).status_code != 200
    assert path.read_text() == '{broken'


@pytest.mark.parametrize('timestamp,expected', [
    ('2026-11-05T08:12:01+00:00', 'fresh'),
    ('2026-11-05T08:00:00+00:00', 'fresh'),
    ('2026-11-05T07:59:59+00:00', 'expired'),
    ('2026-11-05T08:16:00+00:00', 'clock_mismatch'),
    ('2026-11-05T08:12:01', 'invalid_timestamp'),
    ('invalid', 'invalid_timestamp'),
])
def test_evidence_state_uses_appliance_reference_time(timestamp, expected):
    value = ops.observation_diagnostics({'status': 'good', 'collectedAt': timestamp}, '2026-11-05T08:15:00+00:00')
    assert value['state'] == expected and value['ttlSeconds'] == 900


def test_recent_failure_and_completed_unknown_are_distinct(monkeypatch):
    def fail(*args): raise ValueError('private-password and raw API payload')
    monkeypatch.setattr(ops, 'read', fail)
    failed = ops.collect_health(record(), None)
    assert failed['collectionStatus'] == 'failed' and failed['status'] == 'unknown'
    assert 'private-password' not in json.dumps(failed)
    assert ops.observation_diagnostics(failed, failed['completedAt'])['state'] == 'collection_failed'
    cluster, hosts = pe_responses(); cluster.pop('health_summary')
    monkeypatch.setattr(ops, 'read', lambda u, r, p, l: cluster if '/cluster/' in p else hosts)
    completed = ops.collect_health(record(), None)
    assert completed['collectionStatus'] == 'completed' and completed['status'] == 'unknown'
    assert ops.observation_diagnostics(completed, completed['completedAt'])['state'] == 'fresh'
    not_attempted = ops.collect_health({**record(), 'expectedUuid': ''}, None)
    assert not_attempted['collectionStatus'] == 'not_attempted'


@pytest.mark.parametrize('kind,title', [('expired','PE evidence expired'),('clock','PE evidence clock mismatch'),('invalid','PE evidence timestamp invalid'),('failed','PE collection failed')])
def test_summary_explains_unusable_health_without_collecting(harness, kind, title):
    service, state, _, _ = harness; identity = create(harness)
    stamp = datetime.now(timezone.utc)
    if kind == 'expired': stamp -= timedelta(minutes=16)
    if kind == 'clock': stamp += timedelta(minutes=2)
    observation = {'status':'unknown' if kind == 'failed' else 'good', 'collectedAt':'invalid' if kind == 'invalid' else stamp.isoformat(), 'checks':[]}
    if kind == 'failed': observation['collectionStatus'] = 'failed'
    state['clusters'][0]['observation'] = observation
    service.s['collect'] = lambda row: pytest.fail('Summary must never collect PE')
    summary = service.summary()
    assert summary['clusters'][0]['observationFresh'] is False
    assert summary['attention']['health-'+identity]['title'] == title
    assert ops.age_seconds(observation['collectedAt'], summary['collectedAt']) == summary['clusters'][0]['observationDiagnostics']['ageSeconds']


def test_title_refinement_preserves_acknowledgement_and_old_metadata(harness):
    service, state, _, _ = harness; identity = create(harness)
    observation = {'status':'unknown','collectedAt':ops.now(),'checks':[],'collectionStatus':'failed'}
    state['clusters'][0]['observation'] = observation
    service.summary(); key = 'health-'+identity
    service.attention(key,{'revision':state['revision'],'status':'acknowledged','owner':'Operations','notes':'Investigating trust'},'operator')
    state['attention'][key]['title'] = 'PE observation needs review'
    before = deepcopy(state['attention'][key]['reviews'])
    view = service.summary()
    assert view['attention'][key]['title'] == 'PE collection failed'
    assert view['attention'][key]['status'] == 'acknowledged' and view['attention'][key]['reviews'] == before
    assert 'observationDiagnostics' not in state['clusters'][0]
    state['clusters'][0]['observation'] = {'status':'unknown','collectedAt':ops.now(),'checks':[]}
    assert service.summary()['clusters'][0]['observationDiagnostics']['state'] == 'fresh'


def test_old_naive_and_offset_timestamps_do_not_crash_age_parsing():
    assert ops.age_seconds('2026-11-05T08:12:01') is None
    assert ops.age_seconds(None) is None
    assert ops.age_seconds('2026-11-05T09:12:01+01:00','2026-11-05T08:13:59Z') == 118


def test_unknown_collection_outcome_cannot_masquerade_as_completed_evidence(harness):
    service,state,*_ = harness;create(harness)
    state['clusters'][0]['observation']={'status':'good','collectedAt':ops.now(),'collectionStatus':'unexpected'}
    with pytest.raises(ValueError,match='outcome is unreadable'): service.summary()
