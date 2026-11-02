import copy
import json

import pytest

from credential_organization import empty_organization, validate_organization


def organization():
    return {**empty_organization(), 'groups': [
        {'id': 'cluster01', 'name': 'AHV-Cluster-01', 'datacenter': 'DC1', 'kind': 'cluster'},
        {'id': 'shared_pc', 'name': 'Prism Central', 'datacenter': '', 'kind': 'shared'},
    ], 'assignments': {'cluster01_admin': {'groupId': 'cluster01', 'purpose': 'PE Administrator'}}}


@pytest.mark.parametrize('mutate', [
    lambda value: value.update(password='fixture-do-not-store'),
    lambda value: value.update(version=True),
    lambda value: value.update(revision=-1),
    lambda value: value['groups'][0].update(datacenter=''),
    lambda value: value['groups'][0].update(id='../secret'),
    lambda value: value['groups'].append(copy.deepcopy(value['groups'][0])),
    lambda value: value['groups'][0].update(name='a\nname'),
    lambda value: value['groups'][0].update(password='fixture-do-not-store'),
    lambda value: value['assignments']['cluster01_admin'].update(groupId='missing'),
    lambda value: value['assignments']['cluster01_admin'].update(groupId=[]),
    lambda value: value['assignments']['cluster01_admin'].update(password='fixture-do-not-store'),
    lambda value: value['assignments']['cluster01_admin'].update(purpose='a' * 121),
])
def test_invalid_metadata_is_rejected(mutate):
    value = organization()
    mutate(value)
    with pytest.raises(ValueError):
        validate_organization(value)


def test_grouping_round_trip_never_changes_global_or_resolution(client, auth_headers, isolated_data_dir):
    import server
    config = server.get_global_config_path()
    config.parent.mkdir(exist_ok=True)
    content = ('vault_to_use: local\nvaults:\n  local:\n    credentials:\n'
               '      cluster01_admin:\n        username: admin\n        password: fixture-only\n')
    config.write_text(content)
    assert client.get('/api/credential-organization', headers=auth_headers).get_json() == empty_organization()
    response = client.put('/api/credential-organization', headers=auth_headers, json=organization())
    assert response.status_code == 200
    saved = response.get_json()
    assert saved['revision'] == 1
    assert client.get('/api/credential-organization', headers=auth_headers).get_json() == saved
    assert config.read_text() == content
    assert server._lookup_credential_ref('cluster01_admin')[:2] == ('admin', 'fixture-only')
    # Group removal leaves the actual credential intact, only its label is unassigned.
    saved['groups'] = [saved['groups'][1]]
    saved['assignments']['cluster01_admin']['groupId'] = ''
    assert client.put('/api/credential-organization', headers=auth_headers, json=saved).status_code == 200
    assert config.read_text() == content
    assert server._lookup_credential_ref('cluster01_admin')[:2] == ('admin', 'fixture-only')
    stored = server.read_json(isolated_data_dir / 'credential_organization.json')
    assert 'fixture-only' not in json.dumps(stored)


def test_invalid_request_and_stale_revision_do_not_overwrite(client, auth_headers):
    assert client.put('/api/credential-organization', headers=auth_headers, json=organization()).status_code == 200
    original = client.get('/api/credential-organization', headers=auth_headers).get_json()
    assert client.put('/api/credential-organization', headers=auth_headers, json=organization()).status_code == 409
    invalid = {**original, 'password': 'fixture-hidden'}
    response = client.put('/api/credential-organization', headers=auth_headers, json=invalid)
    assert response.status_code == 400
    assert 'fixture-hidden' not in response.get_data(as_text=True)
    assert client.put('/api/credential-organization', headers=auth_headers, data='not JSON', content_type='application/json').status_code == 400
    assert client.get('/api/credential-organization', headers=auth_headers).get_json() == original


@pytest.mark.parametrize('role', ['operator', 'viewer'])
def test_grouping_is_admin_only(client, auth_headers, role):
    assert client.get('/api/credential-organization').status_code == 401
    assert client.post('/api/users', headers=auth_headers, json={'username': 'group-' + role, 'password': 'FixtureOnly123!', 'role': role}).status_code == 201
    token = client.post('/api/auth/login', json={'username': 'group-' + role, 'password': 'FixtureOnly123!'}).get_json()['token']
    headers = {'Authorization': 'Bearer ' + token}
    assert client.get('/api/credential-organization', headers=headers).status_code == 403
    assert client.put('/api/credential-organization', headers=headers, json=organization()).status_code == 403


def test_corrupt_organisation_cannot_be_silently_reset(client, auth_headers, isolated_data_dir):
    import server
    server.write_json(isolated_data_dir / 'credential_organization.json', {'version': 99})
    assert client.get('/api/credential-organization', headers=auth_headers).status_code == 500
    assert client.put('/api/credential-organization', headers=auth_headers, json=organization()).status_code == 500


def test_malformed_json_file_is_not_treated_as_missing(client, auth_headers, isolated_data_dir):
    path = isolated_data_dir / 'credential_organization.json'
    path.write_text('{invalid JSON', encoding='utf-8')
    assert client.get('/api/credential-organization', headers=auth_headers).status_code == 500
    assert client.put('/api/credential-organization', headers=auth_headers, json=organization()).status_code == 500
    assert path.read_text(encoding='utf-8') == '{invalid JSON'
