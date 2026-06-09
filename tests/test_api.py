"""Tests for API endpoint availability, RBAC, and config CRUD."""

import json
import socket
from pathlib import Path
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


def test_settings_persist_connection_profiles(client, auth_headers):
    profile = {
        'id': 'prod',
        'name': 'Production',
        'environment': 'production',
        'prismCentral': {
            'endpoint': 'pc.prod.example.com',
            'credentialRef': 'pc_user',
            'remoteCredentialRef': 'remote_pc_credentials',
            'defaultPcVersion': 'pc.2024.1',
            'enableObjects': True,
            'enableNke': False,
            'enableFlow': True,
            'enableNetworkController': True,
        },
        'foundationCentral': {
            'endpoint': 'pc.prod.example.com',
            'credentialRef': 'pc_user',
            'apiKeyRef': 'foundation_api_key',
            'aosUrl': 'https://repo/aos.tar.gz',
            'hypervisorType': 'kvm',
            'hypervisorUrl': 'https://repo/ahv.iso',
            'foundationVersion': '5.6.0.1',
        },
        'prismElement': {
            'defaultClusterVip': '10.0.0.10',
            'peCredentialRef': 'pe_user',
            'cvmCredentialRef': 'cvm_credential',
            'storageContainer': 'SelfServiceContainer',
            'networkName': 'MGMTVLAN0',
        },
        'ncm': {
            'endpoint': 'pc.prod.example.com',
            'credentialRef': 'ncm_user',
            'projectName': 'Production',
            'accountName': 'NTNX_LOCAL_AZ',
        },
        'directory': {
            'domain': 'prod.example.com',
            'ldapUrl': 'ldap://10.0.0.20:389',
            'serviceAccountCredentialRef': 'service_account_credential',
            'defaultGroups': 'Nutanix Admins',
        },
        'ipam': {
            'method': 'infoblox',
            'infobloxHost': 'infoblox.prod.example.com',
            'credentialRef': 'infoblox_user',
            'dnsView': 'Internal',
            'networkView': 'default',
        },
        'defaults': {
            'dnsServers': '10.0.0.20, 10.0.0.21',
            'ntpServers': '10.0.0.30',
            'timezone': 'Europe/London',
            'siteCode': 'prod-uk',
        },
    }
    resp = client.post('/api/settings',
                       json={'activeProfileId': 'prod', 'connectionProfiles': [profile]},
                       headers=auth_headers)
    assert resp.status_code == 200

    resp = client.get('/api/settings', headers=auth_headers)
    body = resp.get_json()
    assert body['activeProfileId'] == 'prod'
    assert body['connectionProfiles'][0]['prismCentral']['endpoint'] == 'pc.prod.example.com'
    assert body['connectionProfiles'][0]['ipam']['method'] == 'infoblox'


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


# ── Drift detection ──────────────────────────────────────────────────────────

def test_drift_check_matches_last_applied_config(client, auth_headers):
    import server

    client.post('/api/configs/drift.yml',
                json={'content': 'pc_ip: 10.0.0.1\nntp:\n  - 1.1.1.1\n'},
                headers=auth_headers)
    server._record_execution_history(
        execution_id='exec-drift-match',
        workflow_or_script='config-pc',
        execution_type='workflow',
        status='success',
        user='admin',
        config_file='drift.yml',
        config_content='pc_ip: 10.0.0.1\nntp:\n  - 1.1.1.1\n',
    )

    resp = client.post('/api/drift/check',
                       json={'configFile': 'drift.yml', 'workflow': 'config-pc'},
                       headers=auth_headers)

    assert resp.status_code == 200
    body = resp.get_json()
    assert body['status'] == 'matched'
    assert body['summary']['changed'] == 0
    assert body['appliedExecutionId'] == 'exec-drift-match'


def test_drift_check_detects_changed_missing_and_unexpected_fields(client, auth_headers):
    resp = client.post('/api/configs/drift_state.yml',
                       json={'content': 'pc_ip: 10.0.0.1\ndns: 8.8.8.8\nntp: 1.1.1.1\n'},
                       headers=auth_headers)
    assert resp.status_code == 200

    resp = client.post('/api/drift/check',
                       json={
                           'configFile': 'drift_state.yml',
                           'baseline': 'current_state',
                           'currentStateContent': 'pc_ip: 10.0.0.2\nntp: 1.1.1.1\nextra: true\n',
                       },
                       headers=auth_headers)

    assert resp.status_code == 200
    body = resp.get_json()
    statuses = {finding['path']: finding['status'] for finding in body['findings']}
    assert body['status'] == 'drifted'
    assert statuses['pc_ip'] == 'changed'
    assert statuses['dns'] == 'missing'
    assert statuses['extra'] == 'unexpected'


def test_drift_check_unknown_without_successful_execution(client, auth_headers):
    client.post('/api/configs/no_baseline.yml',
                json={'content': 'pc_ip: 10.0.0.1\n'},
                headers=auth_headers)

    resp = client.post('/api/drift/check',
                       json={'configFile': 'no_baseline.yml'},
                       headers=auth_headers)

    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'unknown'


def test_drift_history_can_be_listed_and_cleared(client, auth_headers):
    client.post('/api/configs/drift_clear.yml',
                json={'content': 'pc_ip: 10.0.0.1\n'},
                headers=auth_headers)
    client.post('/api/drift/check',
                json={'configFile': 'drift_clear.yml'},
                headers=auth_headers)

    resp = client.get('/api/drift', headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.get_json()) == 1

    resp = client.delete('/api/drift', headers=auth_headers)
    assert resp.status_code == 200
    assert client.get('/api/drift', headers=auth_headers).get_json() == []


def test_drift_check_viewer_forbidden(client, auth_headers):
    _create_user(client, auth_headers, 'viewer_drift', 'viewer')
    vh = _login(client, 'viewer_drift')

    resp = client.post('/api/drift/check',
                       json={'configFile': 'any.yml'},
                       headers=vh)

    assert resp.status_code == 403


# ── v1.2.7 feature endpoints ─────────────────────────────────────────────────

def test_schedule_rejects_unknown_script(client, auth_headers):
    resp = client.post('/api/schedules',
                       json={'name': 'bad script',
                             'script': '../../etc/passwd',
                             'cronExpr': '0 * * * *'},
                       headers=auth_headers)

    assert resp.status_code == 400
    assert 'Unknown script' in resp.get_json()['error']


def test_schedule_runner_uses_configured_config_dir(client, auth_headers, tmp_path, monkeypatch):
    import server

    config_dir = tmp_path / 'custom-configs'
    config_dir.mkdir()
    config_file = config_dir / 'scheduled.yml'
    config_file.write_text('pc_ip: 10.0.0.1\n')
    ztf_dir = tmp_path / 'ztf'
    ztf_dir.mkdir()

    client.post('/api/settings',
                json={'configDir': str(config_dir),
                      'ztfPath': str(ztf_dir),
                      'pythonPath': 'python'},
                headers=auth_headers)

    calls = []

    class FakeRun:
        returncode = 0

    def fake_run(cmd, **kwargs):
        calls.append((cmd, kwargs))
        return FakeRun()

    monkeypatch.setattr(server.subprocess, 'run', fake_run)
    monkeypatch.setattr(server, '_fire_configured_webhook', lambda *args, **kwargs: None)
    server._require_engines()

    status = server._schedule_engine._run_cb({
        'workflow': 'config-pc',
        'configFile': 'scheduled.yml',
    })

    assert status == 'success'
    assert calls
    assert str(config_file) in calls[0][0]


def test_configured_webhook_payload_uses_settings_url(client, auth_headers, monkeypatch):
    import server

    captured = {}
    client.post('/api/settings',
                json={'webhookUrl': 'http://example.com/hook'},
                headers=auth_headers)

    def fake_fire(url, payload):
        captured['url'] = url
        captured['payload'] = payload

    monkeypatch.setattr(server, '_fire_webhook', fake_fire)

    server._fire_configured_webhook('config-pc', 'success', 0, 'scheduler', 'exec-1', 'schedule')

    assert captured['url'] == 'http://example.com/hook'
    assert captured['payload']['workflow'] == 'config-pc'
    assert captured['payload']['status'] == 'success'
    assert captured['payload']['executionId'] == 'exec-1'
    assert captured['payload']['type'] == 'schedule'


def test_approval_create_and_decide_fire_configured_webhook(client, auth_headers, monkeypatch):
    import server

    events = []
    client.post('/api/settings',
                json={'webhookUrl': 'http://example.com/hook'},
                headers=auth_headers)

    monkeypatch.setattr(server, '_fire_webhook',
                        lambda url, payload: events.append((url, payload)))

    create_resp = client.post('/api/approvals',
                              json={'workflow': 'config-pc',
                                    'configContent': 'pc_ip: 10.0.0.1\n'},
                              headers=auth_headers)
    assert create_resp.status_code == 201
    approval_id = create_resp.get_json()['id']

    approve_resp = client.post(f'/api/approvals/{approval_id}/approve',
                               json={'notes': 'approved'},
                               headers=auth_headers)
    assert approve_resp.status_code == 200
    assert [event[1]['status'] for event in events] == ['pending', 'approved']
    assert all(event[0] == 'http://example.com/hook' for event in events)


def test_parallel_submit_uses_configured_webhook_adapter(client, auth_headers, monkeypatch):
    import server

    server._require_engines()
    captured = {}

    def fake_submit(**kwargs):
        captured.update(kwargs)
        return {'id': 'parallel-1', 'workflow': kwargs['workflow'], 'status': 'running', 'sites': []}

    monkeypatch.setattr(server._parallel_engine, 'submit', fake_submit)

    resp = client.post('/api/parallel-runs',
                       json={'workflow': 'config-pc',
                             'sites': [
                                 {'label': 'A', 'configContent': 'pc_ip: 10.0.0.1\n'},
                                 {'label': 'B', 'configContent': 'pc_ip: 10.0.0.2\n'},
                             ]},
                       headers=auth_headers)

    assert resp.status_code == 202
    assert captured['on_webhook'] is server._fire_configured_webhook


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

    yaml_body = 'pc_ip: 192.168.1.1\npc_credential: pc_user\ncvm_credential: cvm_cred\nclusters:\n  - name: test\n'
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
        'pc_ip: 10.0.0.1\n'
        'pc_credential: pc_user\n'
        'cvm_credential: cvm_cred\n'
        'clusters:\n  - name: c1\n'
    )
    output = ''.join(server._run_preflight('cluster-create', yaml_ok, 'test-id'))
    assert '[PASS]' in output
    assert '[FAIL]' not in output


def test_preflight_accepts_legacy_fc_ip_alias(monkeypatch):
    """Legacy Orchestrator configs with fc_ip still preflight as pc_ip."""
    import server
    monkeypatch.setattr(server, '_tcp_check', lambda h, p, timeout=5.0: (True, 8.0))
    yaml_ok = (
        'fc_ip: 10.0.0.1\n'
        'pc_credential: pc_user\n'
        'cvm_credential: cvm_cred\n'
        'clusters:\n  - name: c1\n'
    )
    output = ''.join(server._run_preflight('cluster-create', yaml_ok, 'test-id'))
    assert 'Legacy fc_ip detected' in output
    assert '[FAIL]' not in output


def test_legacy_fc_ip_content_normalized_for_execution():
    """Execution writes upstream-compatible pc_ip when an old fc_ip file is supplied."""
    import server
    normalized, changed = server._normalize_ztf_config_content(
        'cluster-create',
        'fc_ip: 10.0.0.1\npc_credential: pc_user\n',
    )
    assert changed is True
    assert 'pc_ip: 10.0.0.1' in normalized
    assert 'fc_ip:' not in normalized


def test_preflight_generator_missing_field(monkeypatch):
    """_run_preflight flags missing required fields."""
    import server
    monkeypatch.setattr(server, '_tcp_check', lambda h, p, timeout=5.0: (False, 0.0))
    yaml_missing = 'pc_credential: pc_user\n'   # pc_ip missing
    output = ''.join(server._run_preflight('cluster-create', yaml_missing, 'test-id'))
    assert '[FAIL]' in output


def test_preflight_generator_unreachable(monkeypatch):
    """_run_preflight flags unreachable hosts."""
    import server
    monkeypatch.setattr(server, '_tcp_check', lambda h, p, timeout=5.0: (False, 0.0))
    yaml_body = (
        'pc_ip: 10.0.0.1\n'
        'pc_credential: pc_user\n'
        'cvm_credential: cvm_cred\n'
        'clusters:\n  - name: c1\n'
    )
    output = ''.join(server._run_preflight('cluster-create', yaml_body, 'test-id'))
    assert 'Unreachable' in output


def test_execution_start_exception_is_recorded_as_failed(client, auth_headers, monkeypatch):
    """Failures before ZTF starts should still create a failed execution history row."""
    import subprocess

    def fail_popen(*args, **kwargs):
        raise OSError('cannot start process')

    monkeypatch.setattr(subprocess, 'Popen', fail_popen)

    resp = client.post('/api/execute',
                       json={'workflow': 'config-management-pc',
                             'configContent': 'pc_ip: 10.0.0.51\npc_credential: pc_user\n',
                             'configFile': 'pod-management-config.yml'},
                       headers=auth_headers)

    body = resp.data.decode()
    assert resp.status_code == 200
    assert '"status": "failed"' in body

    history = client.get('/api/executions', headers=auth_headers).get_json()
    assert history[0]['workflow'] == 'config-management-pc'
    assert history[0]['status'] == 'failed'
    assert history[0]['configFile'] == 'pod-management-config.yml'


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

def test_job_submit_persists_status_logs_and_history(client, auth_headers, monkeypatch):
    """Submit-only jobs are executed by the background worker and persisted."""
    import subprocess
    import time

    class FakeProc:
        returncode = 0
        stdout = iter(['Connecting to Prism Central\n', 'ok\n'])
        stderr = iter([])
        def wait(self): pass
        def kill(self): pass
        def poll(self): return 0

    monkeypatch.setattr(subprocess, 'Popen', lambda *a, **kw: FakeProc())

    resp = client.post('/api/jobs',
                       json={'script': 'AddAdServerPe', 'configFile': 'test.yml'},
                       headers=auth_headers)
    assert resp.status_code == 202
    job_id = resp.get_json()['id']

    job = None
    for _ in range(30):
        job = client.get(f'/api/jobs/{job_id}', headers=auth_headers).get_json()
        if job['status'] == 'success':
            break
        time.sleep(0.05)

    assert job['status'] == 'success'
    assert job['progress']['phase'] == 'Completed'
    assert job['progress']['percent'] == 100
    assert job['progress']['estimated'] is True
    assert any(event['type'] == 'stdout' and event['data'] == 'ok' for event in job['logs'])

    jobs = client.get('/api/jobs', headers=auth_headers).get_json()
    assert jobs[0]['id'] == job_id

    history = client.get('/api/executions', headers=auth_headers).get_json()
    assert history[0]['id'] == job_id
    assert history[0]['status'] == 'success'


def test_cancel_queued_job(client, auth_headers):
    """Queued jobs can be cancelled before a worker starts them."""
    import server

    server._job_manager.stop()
    server._job_manager = server.ExecutionJobManager(1)

    resp = client.post('/api/jobs',
                       json={'script': 'AddAdServerPe', 'configFile': 'test.yml'},
                       headers=auth_headers)
    assert resp.status_code == 202
    job_id = resp.get_json()['id']
    assert resp.get_json()['progress']['phase'] == 'Queued'
    assert resp.get_json()['progress']['percent'] == 0

    cancel = client.post(f'/api/jobs/{job_id}/cancel', headers=auth_headers)
    assert cancel.status_code == 200
    assert cancel.get_json()['status'] == 'cancelled'
    assert cancel.get_json()['progress']['phase'] == 'Cancelled'
    assert cancel.get_json()['progress']['percent'] == 100


def test_job_progress_advances_from_ztf_output(client, auth_headers):
    """Estimated phase progress advances conservatively from workflow output."""
    import server

    server._job_manager.stop()
    server._job_manager = server.ExecutionJobManager(1)

    resp = client.post('/api/jobs',
                       json={'script': 'AddAdServerPe', 'configFile': 'test.yml'},
                       headers=auth_headers)
    assert resp.status_code == 202
    job_id = resp.get_json()['id']

    server._job_manager._emit(job_id, 'stdout', 'Connecting to Prism Central API')
    job = client.get(f'/api/jobs/{job_id}', headers=auth_headers).get_json()
    assert job['progress']['phase'] == 'Connecting to Nutanix services'
    assert job['progress']['percent'] == 45
    assert job['progress']['estimated'] is True


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

def test_database_backup_list_file_backend(client, auth_headers):
    """Database backup list is admin-only and reports disabled outside PostgreSQL mode."""
    resp = client.get('/api/maintenance/database-backups', headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['enabled'] is False
    assert data['storage'] == 'file'
    assert data['backups'] == []


def test_database_backup_create_requires_postgres(client, auth_headers):
    resp = client.post('/api/maintenance/database-backups', headers=auth_headers)
    assert resp.status_code == 400
    assert 'PostgreSQL storage' in resp.get_json()['error']


def test_database_backup_operator_forbidden(client, auth_headers):
    _create_user(client, auth_headers, 'op_backup', 'operator')
    oh = _login(client, 'op_backup')
    resp = client.get('/api/maintenance/database-backups', headers=oh)
    assert resp.status_code == 403


def test_database_backup_create_and_download(client, auth_headers, monkeypatch):
    """Admin can create and download a pg_dump backup when PostgreSQL mode is active."""
    import server

    calls = []

    class FakeResult:
        returncode = 0
        stdout = ''
        stderr = ''

    def fake_run(cmd, env=None, **kwargs):
        calls.append({'cmd': cmd, 'env': env, 'kwargs': kwargs})
        Path(cmd[cmd.index('--file') + 1]).write_bytes(b'PGDMP-test')
        return FakeResult()

    monkeypatch.setattr(server._storage, 'name', 'postgres')
    monkeypatch.setenv('ZTF_DATABASE_URL', 'postgresql://ztf:secret@postgres:5432/ztf_orchestrator')
    monkeypatch.setattr(server.subprocess, 'run', fake_run)

    resp = client.post('/api/maintenance/database-backups', headers=auth_headers)
    assert resp.status_code == 201
    backup = resp.get_json()['backup']
    assert backup['filename'].startswith('ztf-orchestrator-')
    assert backup['filename'].endswith('.dump')
    assert backup['size'] == len(b'PGDMP-test')
    assert calls[0]['env']['PGPASSWORD'] == 'secret'
    assert 'secret' not in calls[0]['cmd']

    listing = client.get('/api/maintenance/database-backups', headers=auth_headers)
    assert listing.status_code == 200
    assert listing.get_json()['backups'][0]['filename'] == backup['filename']

    download = client.get(f"/api/maintenance/database-backups/{backup['filename']}", headers=auth_headers)
    assert download.status_code == 200
    assert download.data == b'PGDMP-test'


def test_database_backup_download_rejects_traversal(client, auth_headers):
    resp = client.get('/api/maintenance/database-backups/..%2Fsecret.dump', headers=auth_headers)
    assert resp.status_code in (400, 404)


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

    monkeypatch.setattr('socket.getaddrinfo',
                        lambda *a, **kw: [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('93.184.216.34', 443))])
    monkeypatch.setattr('urllib.request.urlopen', fake_urlopen)
    server._fire_webhook('https://example.com/hook', {'status': 'success', 'workflow': 'test'})
    assert len(calls) == 1
    assert b'success' in calls[0]['data']


def test_fire_webhook_failure_silent(monkeypatch):
    """_fire_webhook swallows exceptions — never raises."""
    import server

    def fake_urlopen(req, timeout=None):
        raise OSError('connection refused')

    monkeypatch.setattr('socket.getaddrinfo',
                        lambda *a, **kw: [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('93.184.216.34', 443))])
    monkeypatch.setattr('urllib.request.urlopen', fake_urlopen)
    server._fire_webhook('https://unreachable.example/hook', {'status': 'failed'})


def test_fire_webhook_rejects_insecure_scheme(monkeypatch):
    """Webhook delivery rejects plain HTTP by default."""
    import server
    calls = []

    monkeypatch.setattr('urllib.request.urlopen', lambda *a, **kw: calls.append(a))
    server._fire_webhook('http://example.com/hook', {'status': 'success'})
    assert calls == []


def test_fire_webhook_rejects_private_resolution(monkeypatch):
    """Webhook delivery blocks localhost/private destinations."""
    import server
    calls = []

    monkeypatch.setattr('socket.getaddrinfo',
                        lambda *a, **kw: [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 443))])
    monkeypatch.setattr('urllib.request.urlopen', lambda *a, **kw: calls.append(a))
    server._fire_webhook('https://internal.example/hook', {'status': 'success'})
    assert calls == []


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
    assert 'dataDir' not in data
    assert 'database' not in data
    assert 'jobs' not in data


def test_health_details_requires_admin(client):
    resp = client.get('/api/health/details')
    assert resp.status_code == 401


def test_health_details_returns_operational_data_for_admin(client, auth_headers):
    resp = client.get('/api/health/details', headers=auth_headers)
    assert resp.status_code in (200, 503)
    data = resp.get_json()
    assert 'status' in data
    assert 'version' in data
    assert 'dataDir' in data
    assert 'database' in data
    assert 'jobs' in data


def test_jobs_limit_must_be_integer(client, auth_headers):
    resp = client.get('/api/jobs?limit=abc', headers=auth_headers)
    assert resp.status_code == 400
    assert 'limit' in resp.get_json()['error']


def test_jobs_stream_offset_must_be_integer(client, auth_headers):
    resp = client.get('/api/jobs/example/stream?offset=abc', headers=auth_headers)
    assert resp.status_code == 400
    assert 'offset' in resp.get_json()['error']


def test_audit_log_limit_must_be_integer(client, auth_headers):
    resp = client.get('/api/audit-log?limit=abc', headers=auth_headers)
    assert resp.status_code == 400
    assert 'limit' in resp.get_json()['error']


def test_spa_deep_link_serves_react_app(client):
    """Direct browser loads of React routes should not be treated as missing static files."""
    resp = client.get('/setup')
    assert resp.status_code == 200
    assert b'<div id="root">' in resp.data


def test_legacy_favicon_serves_veridian_mark(client):
    resp = client.get('/favicon.ico')
    assert resp.status_code == 200
    assert resp.mimetype == 'image/x-icon'
    assert resp.data[:4] == b'\x00\x00\x01\x00'
