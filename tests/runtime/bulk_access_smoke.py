"""Disposable file/PostgreSQL smoke only; no PE or cluster mutations."""
import json
import uuid
import server

assert server._storage.name in ('file', 'postgres')
users = [{'id': str(uuid.uuid4()), 'username': name, 'role': role, 'password_hash': 'synthetic-no-login'}
         for name, role in [('admin', 'admin'), ('operator-one', 'operator'), ('operator-two', 'operator'), ('viewer', 'viewer')]]
server._save_users(users)
headers = {u['username']: {'Authorization': 'Bearer ' + server._create_session(u['username'], u['role'])} for u in users}
server._load_global_config_data = lambda: {}
def no_remote(*args, **kwargs):
    raise AssertionError('No remote cluster requests are permitted')
server.pe_direct.Client.request = no_remote
organization = {'version': 1, 'revision': 0, 'groups': [], 'assignments': {}}
for index in range(40):
    organization['groups'].append({'id': 'cluster-' + str(index), 'name': 'Cluster ' + str(index),
                                  'datacenter': 'DC North' if index < 20 else 'DC South', 'kind': 'cluster'})
server.write_json(server.CONFIG_DIR / 'credential_organization.json', organization)
server._save_pipelines([{'id': 'retained', 'name': 'Retained baseline', 'executor': 'legacy', 'steps': []}])
server.write_json(server.CONFIG_DIR / 'approvals.json', [{'id': 'approval', 'status': 'approved'}])
with server.app.test_client() as client:
    admin = headers['admin']
    c = client.get('/api/access/admin/bulk', headers=admin).get_json()
    north = [r for r in c['clusters'] if r['datacenter'] == 'DC North']
    doc = c['document']
    for user in users[1:3]:
        doc['assignments'][user['id']] = {'profileId': 'operator', 'clusterIds': [r['id'] for r in north], 'datacenterIds': []}
    doc['assignments'][users[3]['id']] = {'profileId': 'viewer', 'clusterIds': [], 'datacenterIds': [north[0]['datacenterId']]}
    body = {'document': doc, 'catalogueFingerprint': c['catalogueFingerprint']}
    review = client.post('/api/access/admin/bulk/preview', headers=admin, json=body)
    assert review.status_code == 200, review.get_json()
    saved = client.put('/api/access/admin/bulk', headers=admin, json={**body, 'fingerprint': review.get_json()['fingerprint']})
    assert saved.status_code == 200, saved.get_json()
    for name in ('operator-one', 'operator-two', 'viewer'):
        result = client.get('/api/access/workspace', headers=headers[name])
        assert result.status_code == 200, result.get_json()
        assert len(result.get_json()['scopes']) == 20
    assert client.get('/api/access/admin/bulk', headers=headers['operator-one']).status_code == 403
    assert client.post('/api/access/requests', headers=headers['viewer'], json={'scopeIds': [north[0]['id']], 'kind': 'recovery'}).status_code == 403
    organization['groups'].append({'id': 'future', 'name': 'Future cluster', 'datacenter': 'DC North', 'kind': 'cluster'})
    server.write_json(server.CONFIG_DIR / 'credential_organization.json', organization)
    assert len(client.get('/api/access/workspace', headers=headers['operator-one']).get_json()['scopes']) == 20
    assert len(client.get('/api/access/workspace', headers=headers['viewer']).get_json()['scopes']) == 21
    assert server._load_pipelines()[0]['id'] == 'retained'
    assert server.read_json(server.CONFIG_DIR / 'approvals.json', [])[0]['status'] == 'approved'
    assert server._access_service.raw_policy()['scopes'] == []
print(json.dumps({'backend': server._storage.name, 'clusters': 40, 'bulkAccounts': 3,
                  'viewerWritesDenied': True, 'fixedAndInheritedAccessVerified': True,
                  'pipelinesAndApprovalsRetained': True, 'remoteRequests': 0}))
server._recovery_service.shutdown()
server._job_manager.stop()
