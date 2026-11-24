"""Pipeline labels reuse the non-secret catalogue without altering execution intent."""
import json
import pytest


def catalogue():
    import server
    value = {'version': 1, 'revision': 0, 'groups': [
        {'id': 'cluster-a', 'kind': 'cluster', 'datacenter': 'DC-A', 'name': 'Cluster A'},
        {'id': 'cluster-b', 'kind': 'cluster', 'datacenter': 'DC-B', 'name': 'Cluster B'}], 'assignments': {}}
    server.write_json(server.CONFIG_DIR / 'credential_organization.json', value)


def create(client, headers, **extra):
    return client.post('/api/pipelines', headers=headers, json={
        'name': 'Post-configuration', 'steps': [{'workflow': 'pod-config', 'configFile': ''}], **extra})


def test_group_survives_reload_and_step_edit(client, auth_headers):
    catalogue()
    original = create(client, auth_headers, groupId='cluster-a').get_json()
    assert original['groupId'] == 'cluster-a'
    response = client.put('/api/pipelines/' + original['id'], headers=auth_headers, json={'name': 'Renamed'})
    assert response.status_code == 200
    current = client.get('/api/pipelines/' + original['id'], headers=auth_headers).get_json()
    assert current['groupId'] == 'cluster-a'
    assert current['steps'] == original['steps']
    assert current['createdAt'] == original['createdAt']
    assert current.get('executor', 'legacy') == 'legacy'
    current = client.put('/api/pipelines/' + original['id'], headers=auth_headers, json={'groupId': 'cluster-b'}).get_json()
    assert current['groupId'] == 'cluster-b'
    assert current['steps'] == original['steps']
    assert client.put('/api/pipelines/' + original['id'], headers=auth_headers, json={'groupId': ''}).get_json()['groupId'] == ''


def test_old_pipeline_and_removed_group_remain_editable(client, auth_headers):
    original = create(client, auth_headers).get_json()
    assert 'groupId' not in original
    catalogue()
    pid = create(client, auth_headers, groupId='cluster-a').get_json()['id']
    import server
    server.write_json(server.CONFIG_DIR / 'credential_organization.json', {'version': 1, 'revision': 1, 'groups': [], 'assignments': {}})
    assert client.put('/api/pipelines/' + pid, headers=auth_headers, json={'name': 'Retained', 'groupId': 'cluster-a'}).status_code == 200
    assert client.put('/api/pipelines/' + pid, headers=auth_headers, json={'groupId': ''}).status_code == 200


@pytest.mark.parametrize('group', [None, {}, [], 1, '../escape', 'x' * 81, '<script>'])
def test_invalid_group_never_saves(client, auth_headers, group):
    before = client.get('/api/pipelines', headers=auth_headers).get_json()
    assert create(client, auth_headers, groupId=group).status_code == 400
    pid = create(client, auth_headers).get_json()['id']
    assert client.put('/api/pipelines/' + pid, headers=auth_headers, json={'groupId': group}).status_code == 400
    assert 'groupId' not in client.get('/api/pipelines/' + pid, headers=auth_headers).get_json()
    assert len(client.get('/api/pipelines', headers=auth_headers).get_json()) == len(before) + 1


def test_stale_group_and_unreadable_catalogue_fail_closed(client, auth_headers):
    assert create(client, auth_headers, groupId='missing').status_code == 409
    import server
    (server.CONFIG_DIR / 'credential_organization.json').write_text('{broken', encoding='utf-8')
    result = create(client, auth_headers, groupId='cluster-a')
    assert result.status_code == 503
    assert 'broken' not in result.get_json()['error']
    assert create(client, auth_headers).status_code == 201


def test_viewer_cannot_reassign_pipeline(client, auth_headers):
    from tests.test_api import _create_user, _login
    pid = create(client, auth_headers).get_json()['id']
    _create_user(client, auth_headers, 'group_viewer', 'viewer')
    headers = _login(client, 'group_viewer')
    assert client.put('/api/pipelines/' + pid, headers=headers, json={'groupId': ''}).status_code == 403


def test_reassign_preserves_approvals_recovery_and_completed_work(client, auth_headers, isolated_data_dir):
    catalogue()
    pid = create(client, auth_headers).get_json()['id']
    import server
    before = {}
    for name in ('approvals.json', 'recovery_runs.json', 'execution_history.json'):
        path = isolated_data_dir / name
        if not path.exists():
            path.write_text('[]', encoding='utf-8')
        before[path] = path.read_bytes()
    original = client.get('/api/pipelines/' + pid, headers=auth_headers).get_json()
    result = client.put('/api/pipelines/' + pid, headers=auth_headers, json={'groupId': 'cluster-a'})
    assert result.status_code == 200
    assert result.get_json()['steps'] == original['steps']
    assert result.get_json()['id'] == original['id']
    assert all(path.read_bytes() == value for path, value in before.items())
