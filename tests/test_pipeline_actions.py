"""Read-only catalogue mirrors the server policy without changing approval enforcement."""
import pytest


def configure(required):
    import server
    settings = server.get_settings()
    settings['approvalRequiredWorkflows'] = ['config-cluster'] if required else []
    server.write_json(server.SETTINGS_FILE, settings)


@pytest.mark.parametrize('required', [False, True])
def test_current_policy_controls_catalogue_and_save(client, auth_headers, required):
    configure(required)
    response = client.get('/api/pipelines/actions', headers=auth_headers)
    assert response.status_code == 200
    assert response.headers['Cache-Control'] == 'no-store'
    actions = {item['id']: item for item in response.get_json()['actions']}
    assert actions['config-cluster']['available'] is not required
    assert bool(actions['config-cluster']['reason']) is required
    assert not any(action.startswith('ztf2-') for action in actions)
    assert not actions['cluster-storage-standard']['available']
    assert actions['initial-host-cvm-password-setup']['available']
    saved = client.post('/api/pipelines', headers=auth_headers, json={
        'name': 'Cluster configuration', 'steps': [{'workflow': 'config-cluster', 'configFile': 'reviewed.yml'}]})
    assert saved.status_code == (400 if required else 201)
    configure(not required)
    updated = client.get('/api/pipelines/actions', headers=auth_headers).get_json()['actions']
    assert next(row for row in updated if row['id'] == 'config-cluster')['available'] is required


def test_catalogue_does_not_change_records_or_expose_settings(client, auth_headers, isolated_data_dir):
    import server
    configure(False)
    server._save_pipelines([{'id': 'saved', 'executor': 'native', 'name': 'Retained',
        'steps': [{'workflow': 'RegisterToPc', 'configFile': '08.yml'}]}])
    before = {path: path.read_bytes() for path in isolated_data_dir.rglob('*.json') if 'session' not in path.name}
    response = client.get('/api/pipelines/actions', headers=auth_headers)
    assert response.status_code == 200
    assert set(response.get_json()) == {'actions'}
    assert all(set(row) == {'id', 'available', 'reason'} for row in response.get_json()['actions'])
    assert all(path.read_bytes() == content for path, content in before.items())


def test_catalogue_requires_auth_and_allows_viewers(client, auth_headers):
    assert client.get('/api/pipelines/actions').status_code == 401
    from tests.test_api import _create_user, _login
    _create_user(client, auth_headers, 'catalogue_viewer', 'viewer')
    assert client.get('/api/pipelines/actions', headers=_login(client, 'catalogue_viewer')).status_code == 200
