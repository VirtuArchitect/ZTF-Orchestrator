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


# ── Dry-run / preflight ───────────────────────────────────────────────────────

def test_dry_run_valid_yaml(client, auth_headers, monkeypatch):
    """Dry-run with valid YAML returns a streaming 200."""
    import server
    # Mock TCP checks so the test doesn't hit the network
    monkeypatch.setattr(server, '_tcp_check', lambda host, port, timeout=5.0: (True, 12.0))

    yaml_body = 'fc_ip: 192.168.1.1\npc_credential: pc_user\ncvm_credential: cvm_cred\nclusters:\n  - name: test\n'
    resp = client.post('/api/execute',
                       json={'workflow': 'cluster-create',
                             'configContent': yaml_body,
                             'configFile': 'test.yml',
                             'dryRun': True},
                       headers=auth_headers)
    assert resp.status_code == 200
    assert b'dry-run' in resp.data.lower() or b'preflight' in resp.data.lower() or b'PASS' in resp.data or b'pass' in resp.data.lower()


def test_dry_run_invalid_yaml(client, auth_headers):
    """Dry-run with broken YAML reports a YAML parse failure."""
    resp = client.post('/api/execute',
                       json={'workflow': 'cluster-create',
                             'configContent': 'key: [\nbroken',
                             'configFile': 'bad.yml',
                             'dryRun': True},
                       headers=auth_headers)
    assert resp.status_code == 200
    assert b'FAIL' in resp.data


def test_dry_run_unknown_workflow_rejected(client, auth_headers):
    """Dry-run with an unknown workflow name is rejected before preflight."""
    resp = client.post('/api/execute',
                       json={'workflow': 'rm -rf /',
                             'configContent': 'key: val',
                             'dryRun': True},
                       headers=auth_headers)
    assert resp.status_code == 400


def test_preflight_generator_pass(monkeypatch):
    """_run_preflight produces pass events for valid cluster-create YAML."""
    import server
    monkeypatch.setattr(server, '_tcp_check', lambda h, p, timeout=5.0: (True, 8.0))
    yaml_ok = (
        'fc_ip: 10.0.0.1\n'
        'pc_credential: pc_user\n'
        'cvm_credential: cvm_cred\n'
        'clusters:\n  - name: c1\n'
    )
    output = ''.join(server._run_preflight('cluster-create', yaml_ok, 'test-id'))
    assert '[PASS]' in output
    assert '[FAIL]' not in output


def test_preflight_generator_missing_field(monkeypatch):
    """_run_preflight flags missing required fields."""
    import server
    monkeypatch.setattr(server, '_tcp_check', lambda h, p, timeout=5.0: (False, 0.0))
    yaml_missing = 'pc_credential: pc_user\n'   # fc_ip missing
    output = ''.join(server._run_preflight('cluster-create', yaml_missing, 'test-id'))
    assert '[FAIL]' in output


def test_preflight_generator_unreachable(monkeypatch):
    """_run_preflight flags unreachable hosts."""
    import server
    monkeypatch.setattr(server, '_tcp_check', lambda h, p, timeout=5.0: (False, 0.0))
    yaml_body = (
        'fc_ip: 10.0.0.1\n'
        'pc_credential: pc_user\n'
        'cvm_credential: cvm_cred\n'
        'clusters:\n  - name: c1\n'
    )
    output = ''.join(server._run_preflight('cluster-create', yaml_body, 'test-id'))
    assert 'Unreachable' in output


def test_tcp_check_success(monkeypatch):
    """_tcp_check returns True when connection succeeds."""
    import server, socket as _sock
    class FakeConn:
        def __enter__(self): return self
        def __exit__(self, *a): pass
    monkeypatch.setattr(_sock, 'create_connection', lambda addr, timeout: FakeConn())
    ok, ms = server._tcp_check('10.0.0.1', 9440)
    assert ok is True
    assert ms >= 0


def test_tcp_check_failure(monkeypatch):
    """_tcp_check returns False when connection is refused."""
    import server, socket as _sock
    monkeypatch.setattr(_sock, 'create_connection',
                        lambda addr, timeout: (_ for _ in ()).throw(OSError('refused')))
    ok, ms = server._tcp_check('10.0.0.1', 9440)
    assert ok is False
    assert ms == 0.0


# ── Multi-script composition ──────────────────────────────────────────────────

def test_multi_script_array_accepted(client, auth_headers, monkeypatch):
    """Array of valid scripts passes allowlist validation."""
    import subprocess
    class FakeProc:
        returncode = 0
        stdout = iter([]); stderr = iter([])
        def wait(self): pass
        def kill(self): pass
        def poll(self): return 0
    monkeypatch.setattr(subprocess, 'Popen', lambda *a, **kw: FakeProc())
    resp = client.post('/api/execute',
                       json={'script': ['AddAdServerPe', 'AddAdServerPc'],
                             'configFile': 'test.yml'},
                       headers=auth_headers)
    assert resp.status_code == 200


def test_multi_script_comma_string_accepted(client, auth_headers, monkeypatch):
    """Comma-separated string of valid scripts is accepted."""
    import subprocess
    class FakeProc:
        returncode = 0
        stdout = iter([]); stderr = iter([])
        def wait(self): pass
        def kill(self): pass
        def poll(self): return 0
    monkeypatch.setattr(subprocess, 'Popen', lambda *a, **kw: FakeProc())
    resp = client.post('/api/execute',
                       json={'script': 'AddAdServerPe,AddAdServerPc',
                             'configFile': 'test.yml'},
                       headers=auth_headers)
    assert resp.status_code == 200


def test_multi_script_unknown_in_array_rejected(client, auth_headers):
    """Array containing an unknown script is rejected."""
    resp = client.post('/api/execute',
                       json={'script': ['AddAdServerPe', 'evil; rm -rf /'],
                             'configFile': 'test.yml'},
                       headers=auth_headers)
    assert resp.status_code == 400
    assert 'Unknown script' in resp.get_json()['error']


# ── Audit log ────────────────────────────────────────────────────────────────

def test_audit_log_returns_list(client, auth_headers):
    """Audit log endpoint returns a list (may be empty if log file absent)."""
    resp = client.get('/api/audit-log', headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_audit_log_viewer_forbidden(client, auth_headers):
    """Audit log is admin-only."""
    _create_user(client, auth_headers, 'viewer_audit', 'viewer')
    vh = _login(client, 'viewer_audit')
    resp = client.get('/api/audit-log', headers=vh)
    assert resp.status_code == 403


def test_audit_log_operator_forbidden(client, auth_headers):
    """Audit log is restricted to admin role only."""
    _create_user(client, auth_headers, 'op_audit', 'operator')
    oh = _login(client, 'op_audit')
    resp = client.get('/api/audit-log', headers=oh)
    assert resp.status_code == 403


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


def test_spa_deep_link_serves_react_app(client):
    """Direct browser loads of React routes should not be treated as missing static files."""
    resp = client.get('/setup')
    assert resp.status_code == 200
    assert b'<div id="root">' in resp.data
