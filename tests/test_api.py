"""Tests for API endpoint availability, RBAC, and config CRUD."""

import json
import pytest


# ── RBAC ─────────────────────────────────────────────────────────────────────

def _create_user(client, auth_headers, username, role):
    resp = client.post('/api/users',
                       json={'username': username, 'password': 'Pass123!', 'role': role},
                       headers=auth_headers)
    assert resp.status_code == 201


def _login(client, username):
    resp = client.post('/api/auth/login',
                       json={'username': username, 'password': 'Pass123!'})
    assert resp.status_code == 200
    return {'Authorization': 'Bearer ' + resp.get_json()['token']}


def test_viewer_cannot_execute(client, auth_headers):
    _create_user(client, auth_headers, 'viewer1', 'viewer')
    viewer_headers = _login(client, 'viewer1')
    resp = client.post('/api/execute',
                       json={'workflow': 'cluster-create'},
                       headers=viewer_headers)
    assert resp.status_code == 403


def test_viewer_can_read_configs(client, auth_headers):
    _create_user(client, auth_headers, 'viewer2', 'viewer')
    viewer_headers = _login(client, 'viewer2')
    resp = client.get('/api/configs', headers=viewer_headers)
    assert resp.status_code == 200


def test_viewer_cannot_write_config(client, auth_headers):
    _create_user(client, auth_headers, 'viewer3', 'viewer')
    viewer_headers = _login(client, 'viewer3')
    resp = client.post('/api/configs/test.yml',
                       json={'content': 'key: val'},
                       headers=viewer_headers)
    assert resp.status_code == 403


def test_operator_can_write_config(client, auth_headers):
    _create_user(client, auth_headers, 'op1', 'operator')
    op_headers = _login(client, 'op1')
    resp = client.post('/api/configs/test.yml',
                       json={'content': 'key: val\n'},
                       headers=op_headers)
    assert resp.status_code == 200


def test_operator_cannot_change_settings(client, auth_headers):
    _create_user(client, auth_headers, 'op2', 'operator')
    op_headers = _login(client, 'op2')
    resp = client.post('/api/settings',
                       json={'ztfPath': '/tmp/evil'},
                       headers=op_headers)
    assert resp.status_code == 403


def test_only_admin_can_create_users(client, auth_headers):
    _create_user(client, auth_headers, 'op3', 'operator')
    op_headers = _login(client, 'op3')
    resp = client.post('/api/users',
                       json={'username': 'new', 'password': 'x', 'role': 'viewer'},
                       headers=op_headers)
    assert resp.status_code == 403


# ── Config CRUD ───────────────────────────────────────────────────────────────

def test_config_create_read_delete(client, auth_headers):
    content = 'cluster_name: test-cluster\n'

    # Create
    resp = client.post('/api/configs/mycluster.yml',
                       json={'content': content},
                       headers=auth_headers)
    assert resp.status_code == 200

    # List — should appear
    resp = client.get('/api/configs', headers=auth_headers)
    names = [f['name'] for f in resp.get_json()]
    assert 'mycluster.yml' in names

    # Read
    resp = client.get('/api/configs/mycluster.yml', headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()['content'] == content

    # Delete
    resp = client.delete('/api/configs/mycluster.yml', headers=auth_headers)
    assert resp.status_code == 200

    # Should be gone
    resp = client.get('/api/configs/mycluster.yml', headers=auth_headers)
    assert resp.status_code == 404


def test_config_backup_created_on_overwrite(client, auth_headers, isolated_data_dir):
    """Overwriting a config should create a .bak.1 backup."""
    client.post('/api/configs/cluster.yml',
                json={'content': 'original: true\n'}, headers=auth_headers)
    client.post('/api/configs/cluster.yml',
                json={'content': 'updated: true\n'}, headers=auth_headers)

    configs_dir = isolated_data_dir / 'configs'
    backup = configs_dir / 'cluster.yml.bak.1'
    assert backup.exists()
    assert 'original' in backup.read_text()


# ── User management ───────────────────────────────────────────────────────────

def test_create_list_delete_user(client, auth_headers):
    # Create
    resp = client.post('/api/users',
                       json={'username': 'bob', 'password': 'Pass123!', 'role': 'operator'},
                       headers=auth_headers)
    assert resp.status_code == 201

    # List
    resp = client.get('/api/users', headers=auth_headers)
    usernames = [u['username'] for u in resp.get_json()]
    assert 'bob' in usernames

    # Delete
    resp = client.delete('/api/users/bob', headers=auth_headers)
    assert resp.status_code == 200

    # Gone
    resp = client.get('/api/users', headers=auth_headers)
    usernames = [u['username'] for u in resp.get_json()]
    assert 'bob' not in usernames


def test_cannot_delete_own_account(client, auth_headers):
    resp = client.delete('/api/users/admin', headers=auth_headers)
    assert resp.status_code == 400


def test_duplicate_user_rejected(client, auth_headers):
    client.post('/api/users',
                json={'username': 'dup', 'password': 'x', 'role': 'viewer'},
                headers=auth_headers)
    resp = client.post('/api/users',
                       json={'username': 'dup', 'password': 'y', 'role': 'viewer'},
                       headers=auth_headers)
    assert resp.status_code == 409


# ── Backup list & restore ────────────────────────────────────────────────────

def test_backup_list_empty_initially(client, auth_headers):
    client.post('/api/configs/bak_test.yml',
                json={'content': 'v1: true\n'}, headers=auth_headers)
    resp = client.get('/api/configs/bak_test.yml/backups', headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_backup_list_populated_after_overwrite(client, auth_headers):
    client.post('/api/configs/bak2.yml',
                json={'content': 'v1: true\n'}, headers=auth_headers)
    client.post('/api/configs/bak2.yml',
                json={'content': 'v2: true\n'}, headers=auth_headers)
    resp = client.get('/api/configs/bak2.yml/backups', headers=auth_headers)
    assert resp.status_code == 200
    backups = resp.get_json()
    assert len(backups) == 1
    assert backups[0]['version'] == 1


def test_backup_restore_reverts_content(client, auth_headers):
    client.post('/api/configs/restore_me.yml',
                json={'content': 'original: true\n'}, headers=auth_headers)
    client.post('/api/configs/restore_me.yml',
                json={'content': 'updated: true\n'}, headers=auth_headers)
    resp = client.post('/api/configs/restore_me.yml/restore/1', headers=auth_headers)
    assert resp.status_code == 200
    resp = client.get('/api/configs/restore_me.yml', headers=auth_headers)
    assert 'original' in resp.get_json()['content']


def test_backup_restore_missing_version(client, auth_headers):
    client.post('/api/configs/no_bak.yml',
                json={'content': 'key: val\n'}, headers=auth_headers)
    resp = client.post('/api/configs/no_bak.yml/restore/1', headers=auth_headers)
    assert resp.status_code == 404


def test_backup_restore_invalid_version(client, auth_headers):
    resp = client.post('/api/configs/any.yml/restore/99', headers=auth_headers)
    assert resp.status_code == 400


# ── Executions ───────────────────────────────────────────────────────────────

def test_get_executions_empty(client, auth_headers):
    resp = client.get('/api/executions', headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_clear_executions(client, auth_headers):
    resp = client.delete('/api/executions', headers=auth_headers)
    assert resp.status_code == 200


# ── Global config ────────────────────────────────────────────────────────────

def test_get_global_config(client, auth_headers):
    resp = client.get('/api/global-config', headers=auth_headers)
    assert resp.status_code == 200
    assert 'content' in resp.get_json()


def test_save_global_config(client, auth_headers):
    resp = client.post('/api/global-config',
                       json={'content': 'vault_to_use: local\n'},
                       headers=auth_headers)
    assert resp.status_code == 200


# ── User role update ─────────────────────────────────────────────────────────

def test_update_user_role(client, auth_headers):
    _create_user(client, auth_headers, 'roleuser', 'viewer')
    resp = client.put('/api/users/roleuser',
                      json={'role': 'operator'},
                      headers=auth_headers)
    assert resp.status_code == 200


# ── Webhook helper ───────────────────────────────────────────────────────────

def test_fire_webhook_success(monkeypatch):
    """_fire_webhook POSTs JSON and silently succeeds."""
    import server
    calls = []

    class FakeResp:
        def __enter__(self): return self
        def __exit__(self, *a): pass

    def fake_urlopen(req, timeout=None):
        calls.append({'url': req.full_url, 'data': req.data})
        return FakeResp()

    monkeypatch.setattr('urllib.request.urlopen', fake_urlopen)
    server._fire_webhook('http://example.com/hook', {'status': 'success', 'workflow': 'test'})
    assert len(calls) == 1
    assert b'success' in calls[0]['data']


def test_fire_webhook_failure_silent(monkeypatch):
    """_fire_webhook swallows exceptions — never raises."""
    import server

    def fake_urlopen(req, timeout=None):
        raise OSError('connection refused')

    monkeypatch.setattr('urllib.request.urlopen', fake_urlopen)
    server._fire_webhook('http://unreachable/hook', {'status': 'failed'})


# ── Security headers ─────────────────────────────────────────────────────────

def test_security_headers_present(client, auth_headers):
    resp = client.get('/api/settings', headers=auth_headers)
    assert resp.headers.get('X-Content-Type-Options') == 'nosniff'
    assert resp.headers.get('X-Frame-Options') == 'DENY'
    assert 'Cache-Control' in resp.headers


# ── Health ───────────────────────────────────────────────────────────────────

def test_health_returns_json(client):
    resp = client.get('/health')
    assert resp.content_type == 'application/json'
    data = resp.get_json()
    assert 'status' in data
    assert 'version' in data
