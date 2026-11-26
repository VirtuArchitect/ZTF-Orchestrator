"""Bulk administration and runtime authorization using synthetic local records."""
import copy
import pytest
import bulk_access
from tests.test_scoped_access import access, authorise


def catalogue(h):
    response = h.client.get('/api/access/admin/bulk', headers=h.admin)
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def groups(h, extra=False):
    value = {'version': 1, 'revision': 0, 'groups': [
        {'id': 'a', 'name': 'Cluster A', 'datacenter': 'DC A', 'kind': 'cluster'},
        {'id': 'b', 'name': 'Cluster B', 'datacenter': 'DC B', 'kind': 'cluster'},
    ], 'assignments': {}}
    if extra:
        value['groups'].append({'id': 'c', 'name': 'Cluster C', 'datacenter': 'DC A', 'kind': 'cluster'})
    h.server.write_json(h.server.CONFIG_DIR / 'credential_organization.json', value)


def assignment(h, role='operator', inherit=False):
    c = catalogue(h)
    row = next(r for r in c['clusters'] if r['name'] == 'Cluster A')
    c['document']['assignments'][h.users[role]['id']] = {
        'profileId': role, 'clusterIds': [] if inherit else [row['id']],
        'datacenterIds': [row['datacenterId']] if inherit else [],
    }
    return c


def save(h, c):
    body = {'document': c['document'], 'catalogueFingerprint': c['catalogueFingerprint']}
    preview = h.client.post('/api/access/admin/bulk/preview', json=body, headers=h.admin)
    assert preview.status_code == 200, preview.get_json()
    body['fingerprint'] = preview.get_json()['fingerprint']
    saved = h.client.put('/api/access/admin/bulk', json=body, headers=h.admin)
    assert saved.status_code == 200, saved.get_json()
    return saved


def workspace(h, role):
    result = h.client.get('/api/access/workspace', headers=h.headers[role])
    assert result.status_code == 200, result.get_json()
    return result.get_json()


def test_bulk_same_profile_many_accounts_and_clusters_without_technical_fields(access):
    h = access
    groups(h)
    c = assignment(h)
    c['document']['assignments'][h.users['other']['id']] = copy.deepcopy(c['document']['assignments'][h.users['operator']['id']])
    before = h.server._load_pipelines()
    save(h, c)
    for role in ('operator', 'other'):
        result = workspace(h, role)
        assert [r['name'] for r in result['scopes']] == ['Cluster A']
        assert 'pipeline.execute' in result['capabilities']
    assert h.server._load_pipelines() == before
    assert h.service.raw_policy()['assignments'] == h.policy['assignments']
    assert all('connection' not in r and 'peEndpoint' not in r and 'clusterUuid' not in r for r in catalogue(h)['clusters'])


def test_future_inheritance_is_explicit_snapshot_is_fixed(access):
    h = access
    groups(h)
    c = assignment(h, 'viewer')
    row = next(r for r in c['clusters'] if r['name'] == 'Cluster A')
    c['document']['assignments'][h.users['other']['id']] = {
        'profileId': 'operator', 'clusterIds': [], 'datacenterIds': [row['datacenterId']]}
    save(h, c)
    groups(h, extra=True)
    assert [r['name'] for r in workspace(h, 'viewer')['scopes']] == ['Cluster A']
    assert {r['name'] for r in workspace(h, 'other')['scopes']} == {'Cluster A', 'Cluster C'}
    assert 'Cluster B' not in str(workspace(h, 'other'))


def test_profile_edit_updates_all_assigned_accounts_and_no_viewer_writes(access):
    h = access
    groups(h)
    c = assignment(h)
    c['document']['assignments'][h.users['other']['id']] = copy.deepcopy(c['document']['assignments'][h.users['operator']['id']])
    save(h, c)
    c = catalogue(h)
    next(p for p in c['document']['profiles'] if p['id'] == 'operator')['capabilities'] = ['clusters.view']
    save(h, c)
    for role in ('operator', 'other'):
        assert workspace(h, role)['capabilities'] == ['clusters.view']
        assert h.client.post('/api/access/requests', headers=h.headers[role], json={'kind': 'recovery', 'scopeIds': []}).status_code == 403


@pytest.mark.parametrize('role', ['viewer', 'operator'])
@pytest.mark.parametrize('path,method', [('/admin/bulk', 'GET'), ('/admin/bulk', 'PUT'), ('/admin/bulk/preview', 'POST')])
def test_bulk_admin_only(access, role, path, method):
    assert access.client.open('/api/access' + path, method=method, headers=access.headers[role], json={}).status_code == 403


@pytest.mark.parametrize('mutation', ['viewer_write', 'wrong_role', 'unknown_cluster', 'unknown_dc'])
def test_invalid_grants_rejected_atomically(access, mutation):
    h = access
    groups(h)
    c = assignment(h)
    if mutation == 'viewer_write':
        c['document']['profiles'][0]['capabilities'].append('pipeline.execute')
    elif mutation == 'wrong_role':
        c['document']['assignments'][h.users['viewer']['id']] = c['document']['assignments'].pop(h.users['operator']['id'])
    else:
        c['document']['assignments'][h.users['operator']['id']]['clusterIds' if mutation == 'unknown_cluster' else 'datacenterIds'] = ['unknown']
    response = h.client.post('/api/access/admin/bulk/preview', headers=h.admin,
        json={'document': c['document'], 'catalogueFingerprint': c['catalogueFingerprint']})
    assert response.status_code == 400
    assert bulk_access.load(h.server)['revision'] == 0


@pytest.mark.parametrize('change', ['inventory', 'role', 'document', 'concurrent'])
def test_review_staleness_or_tampering_rejected(access, change):
    h = access
    groups(h)
    c = assignment(h)
    body = {'document': c['document'], 'catalogueFingerprint': c['catalogueFingerprint']}
    response = h.client.post('/api/access/admin/bulk/preview', headers=h.admin, json=body)
    body['fingerprint'] = response.get_json()['fingerprint']
    if change == 'inventory':
        groups(h, extra=True)
    elif change == 'role':
        users = h.server._load_users()
        next(u for u in users if u['id'] == h.users['operator']['id'])['role'] = 'viewer'
        h.server._save_users(users)
    elif change == 'document':
        body['document']['assignments'][h.users['operator']['id']]['clusterIds'] = []
    else:
        save(h, c)
    assert h.client.put('/api/access/admin/bulk', headers=h.admin, json=body).status_code in (400, 409)


def test_revoke_and_role_change_apply_immediately(access):
    h = access
    groups(h)
    save(h, assignment(h))
    c = catalogue(h)
    c['document']['assignments'][h.users['operator']['id']]['clusterIds'] = []
    save(h, c)
    assert workspace(h, 'operator')['scopes'] == []
    save(h, assignment(h))
    users = h.server._load_users()
    next(u for u in users if u['id'] == h.users['operator']['id'])['role'] = 'viewer'
    h.server._save_users(users)
    assert h.service.access('operator')[2] == {'scopeIds': [], 'capabilities': []}


def test_unresolved_identity_blocks_delegation_but_not_visibility(access):
    h = access
    groups(h)
    save(h, assignment(h))
    scope_id = workspace(h, 'operator')['scopes'][0]['id']
    response = h.client.post('/api/access/admin/review', headers=h.admin,
        json={'accountId': h.users['operator']['id'], 'pipelineId': h.pipeline['id'], 'scopeIds': [scope_id]})
    assert response.status_code == 409 and 'identity' in response.get_json()['error']


def test_existing_binding_approvals_and_records_retained(access):
    h = access
    binding = authorise(h)
    c = catalogue(h)
    c['document']['assignments'][h.users['operator']['id']] = {
        'profileId': 'operator', 'clusterIds': ['one'], 'datacenterIds': []}
    marker = {'completed': [1, 2, 3], 'approval': 'retained'}
    h.server.write_json(h.server.CONFIG_DIR / 'untouched.json', marker)
    save(h, c)
    assert h.service.policy()['bindings'] == [binding]
    assert h.service.binding_context('operator', binding['id'])['pipeline']['id'] == 'pipeline-one'
    h.service.write_policy(h.service.policy())
    assert h.service.raw_policy()['scopes'] == h.policy['scopes']
    assert h.server.read_json(h.server.CONFIG_DIR / 'untouched.json', {}) == marker


def test_inventory_corruption_fails_closed(access):
    h = access
    groups(h)
    save(h, assignment(h))
    h.server.write_json(h.server.CONFIG_DIR / 'credential_organization.json', {'bad': 'data'})
    assert h.client.get('/api/access/workspace', headers=h.headers['operator']).status_code == 503


def test_resolve_managed_identity_and_reject_duplicate_endpoint(access):
    h = access
    groups(h)
    row = {'id': 'record-a', 'name': 'Cluster A', 'datacenter': 'DC A',
        'peEndpoint': 'https://192.0.2.25:9440', 'expectedUuid': '00000000-0000-0000-0000-000000000025',
        'peCredential': 'pe_ref', 'expectedNodes': [], 'configFiles': [],
        'pipelineId': '', 'recoveryProfileId': '', 'owner': ''}
    h.server.write_json(h.server.CONFIG_DIR / 'cluster_operations.json', {
        'version': 1, 'revision': 0, 'clusters': [row], 'attention': {}})
    c = assignment(h)
    assert next(r for r in c['clusters'] if r['name'] == 'Cluster A')['executionReady']
    save(h, c)
    resolved = next(s for s in h.service.policy()['scopes'] if s['name'] == 'Cluster A')
    assert resolved['connection']['cluster_uuid'] == row['expectedUuid']
    assert resolved['connection']['verify_tls'] is True
    assert resolved['credentialRefs'] == ['pe_ref']
    second = {**row, 'id': 'record-b', 'name': 'Cluster B', 'datacenter': 'DC B'}
    h.server.write_json(h.server.CONFIG_DIR / 'cluster_operations.json', {
        'version': 1, 'revision': 1, 'clusters': [row, second], 'attention': {}})
    assert all(not r['executionReady'] for r in catalogue(h)['clusters'] if r['name'].startswith('Cluster '))


def test_history_permission_filters_existing_run_receipts(access):
    h = access
    c = catalogue(h)
    c['document']['assignments'][h.users['viewer']['id']] = {
        'profileId': 'viewer', 'clusterIds': ['one'], 'datacenterIds': []}
    h.service.save_record('operational_runs.json', {'id': 'receipt', 'scopeIds': ['one'],
        'ownerId': h.users['operator']['id'], 'status': 'success', 'pipelineId': 'pipeline-one'})
    save(h, c)
    assert len(workspace(h, 'viewer')['runs']) == 1
    c = catalogue(h)
    c['document']['profiles'][0]['capabilities'] = ['clusters.view']
    save(h, c)
    assert workspace(h, 'viewer')['runs'] == []
    assert len(h.service.records('operational_runs.json')) == 1


def test_reducing_bulk_grant_stops_existing_binding_without_deleting_it(access):
    h = access
    binding = authorise(h)
    c = catalogue(h)
    c['document']['assignments'][h.users['operator']['id']] = {
        'profileId': 'operator', 'clusterIds': [], 'datacenterIds': []}
    save(h, c)
    with pytest.raises(Exception, match='not authorised'):
        h.service.binding_context('operator', binding['id'])
    assert h.service.raw_policy()['bindings'] == [binding]


def test_delegation_for_resolved_catalogue_scope_survives_policy_reload(access):
    h = access
    import scoped_access
    h.service.write_policy(scoped_access.empty_policy())
    h.server.write_json(h.server.CONFIG_DIR / 'credential_organization.json', {
        'version': 1, 'revision': 0, 'assignments': {}, 'groups': [
            {'id': 'group', 'name': 'Example cluster', 'datacenter': 'Example DC', 'kind': 'cluster'}]})
    h.server.write_json(h.server.CONFIG_DIR / 'cluster_operations.json', {
        'version': 1, 'revision': 0, 'attention': {}, 'clusters': [{
            'id': 'managed', 'name': 'Example cluster', 'datacenter': 'Example DC',
            'peEndpoint': 'https://192.0.2.20:9440', 'expectedUuid': '00000000-0000-0000-0000-000000000001',
            'peCredential': 'pe_ref', 'expectedNodes': [], 'configFiles': [],
            'pipelineId': '', 'recoveryProfileId': '', 'owner': ''}]})
    c = catalogue(h)
    identity = c['clusters'][0]['id']
    c['document']['assignments'][h.users['operator']['id']] = {
        'profileId': 'operator', 'clusterIds': [identity], 'datacenterIds': []}
    save(h, c)
    body = {'accountId': h.users['operator']['id'], 'pipelineId': 'pipeline-one', 'scopeIds': [identity]}
    review = h.client.post('/api/access/admin/review', headers=h.admin, json=body)
    assert review.status_code == 200, review.get_json()
    authorised = h.client.post('/api/access/admin/authorise', headers=h.admin,
        json={**body, **review.get_json(), 'confirmation': 'AUTHORISE pipeline-one FOR operator'})
    assert authorised.status_code == 201, authorised.get_json()
    assert h.service.raw_policy()['scopes'] == []
    assert h.service.binding_context('operator', authorised.get_json()['id'])['scopes'][0]['id'] == identity
