import json

import pytest

from config_organization import empty_config_organization, validate_config_organization


def document(name='baseline.yml'):
    return {**empty_config_organization(), 'assignments': {name: {'groupId': 'c01', 'purpose': 'Deployment'}}}


def catalogue(client, headers):
    value = {'version': 1, 'revision': 0, 'groups': [{'id': 'c01', 'name': 'Cluster 01', 'datacenter': 'DC1', 'kind': 'cluster'}], 'assignments': {'private_ref': {'groupId': 'c01', 'purpose': 'PE'}}}
    assert client.put('/api/credential-organization', headers=headers, json=value).status_code == 200


@pytest.mark.parametrize('name', ['../baseline.yml', 'a/b.yml', 'a\\b.yml', 'a.txt', 'a\nyml.yml', 'a'*256+'.yml'])
def test_invalid_filename(name):
    with pytest.raises(ValueError):
        validate_config_organization(document(name))


@pytest.mark.parametrize('change', [lambda v: v.update(password='hidden'), lambda v: v.update(revision=True), lambda v: v['assignments']['baseline.yml'].update(purpose='arbitrary'), lambda v: v['assignments']['baseline.yml'].update(password='hidden'), lambda v: v['assignments']['baseline.yml'].update(groupId='../group')])
def test_invalid_metadata(change):
    value = document()
    change(value)
    with pytest.raises(ValueError):
        validate_config_organization(value)


def test_labels_preserve_files_and_execution_documents(client, auth_headers, isolated_data_dir):
    import server
    catalogue(client, auth_headers)
    directory = server.get_configs_dir()
    path = directory / 'baseline.yml'
    path.write_bytes(b'clusters: {}\n# exact bytes\n')
    before = (path.read_bytes(), path.stat().st_mtime_ns)
    dependencies = {}
    for name in ['pipelines.json', 'schedules.json', 'approvals.json', 'recovery_runs.json']:
        item = isolated_data_dir / name
        if not item.exists(): item.write_text('[]', encoding='utf-8')
        dependencies[name] = item.read_bytes()
    response = client.put('/api/config-organization', headers=auth_headers, json=document())
    assert response.status_code == 200
    saved = response.get_json()
    assert saved['revision'] == 1
    assert 'private_ref' not in json.dumps(saved)
    assert (path.read_bytes(), path.stat().st_mtime_ns) == before
    assert all((isolated_data_dir / name).read_bytes() == contents for name, contents in dependencies.items())
    assert client.put('/api/config-organization', headers=auth_headers, json=document()).status_code == 409
    groups = client.get('/api/credential-organization', headers=auth_headers).get_json()
    groups['groups'] = []; groups['assignments'] = {}
    assert client.put('/api/credential-organization', headers=auth_headers, json=groups).status_code == 200
    result = client.get('/api/config-organization', headers=auth_headers).get_json()
    assert result['groups'] == []
    assert result['assignments']['baseline.yml']['groupId'] == 'c01'
    assert path.read_bytes() == before[0]
    result.pop('groups'); result['assignments']['baseline.yml']['groupId'] = ''
    assert client.put('/api/config-organization', headers=auth_headers, json=result).status_code == 200


def test_missing_files_unknown_groups_and_corruption(client, auth_headers, isolated_data_dir):
    import server
    catalogue(client, auth_headers)
    assert client.put('/api/config-organization', headers=auth_headers, json=document()).status_code == 400
    (server.get_configs_dir() / 'baseline.yml').write_text('clusters: {}')
    value = document(); value['assignments']['baseline.yml']['groupId'] = 'unknown'
    assert client.put('/api/config-organization', headers=auth_headers, json=value).status_code == 409
    assert client.put('/api/config-organization', headers=auth_headers, json={'version': 1}).status_code == 400
    path = isolated_data_dir / 'config_organization.json'; path.write_text('{broken')
    assert client.get('/api/config-organization', headers=auth_headers).status_code == 500
    assert client.put('/api/config-organization', headers=auth_headers, json=document()).status_code == 500
    assert path.read_text() == '{broken'


@pytest.mark.parametrize('role', ['viewer', 'operator'])
def test_role_boundaries(client, auth_headers, role):
    assert client.get('/api/config-organization').status_code == 401
    assert client.post('/api/users', headers=auth_headers, json={'username': role, 'password': 'FixtureOnly123!', 'role': role}).status_code == 201
    token = client.post('/api/auth/login', json={'username': role, 'password': 'FixtureOnly123!'}).get_json()['token']
    headers = {'Authorization': 'Bearer '+token}
    assert client.get('/api/config-organization', headers=headers).status_code == 200
    assert client.put('/api/config-organization', headers=headers, json=empty_config_organization()).status_code == (403 if role == 'viewer' else 200)
