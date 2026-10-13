"""Tests for Pipeline CRUD and execution endpoints."""
import json
import pytest


# ── CRUD ──────────────────────────────────────────────────────────────────────

def _create(client, auth_headers, name='Test Pipeline', steps=None):
    if steps is None:
        steps = [{'workflow': 'pod-config', 'configFile': ''}]
    return client.post('/api/pipelines',
                       json={'name': name, 'steps': steps},
                       headers=auth_headers)


def test_pipeline_create(client, auth_headers):
    resp = _create(client, auth_headers)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data['name'] == 'Test Pipeline'
    assert data['id']
    assert len(data['steps']) == 1


def test_pipeline_list(client, auth_headers):
    _create(client, auth_headers, 'Pipeline A')
    _create(client, auth_headers, 'Pipeline B')
    resp = client.get('/api/pipelines', headers=auth_headers)
    assert resp.status_code == 200
    names = [p['name'] for p in resp.get_json()]
    assert 'Pipeline A' in names
    assert 'Pipeline B' in names


def test_pipeline_get(client, auth_headers):
    pid = _create(client, auth_headers).get_json()['id']
    resp = client.get(f'/api/pipelines/{pid}', headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()['id'] == pid


def test_pipeline_get_not_found(client, auth_headers):
    resp = client.get('/api/pipelines/nonexistent', headers=auth_headers)
    assert resp.status_code == 404


def test_pipeline_update(client, auth_headers):
    pid = _create(client, auth_headers).get_json()['id']
    resp = client.put(f'/api/pipelines/{pid}',
                      json={'name': 'Updated Name',
                            'steps': [{'workflow': 'pod-config', 'configFile': ''}]},
                      headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['name'] == 'Updated Name'
    assert data['steps'][0]['workflow'] == 'pod-config'


def test_pipeline_delete(client, auth_headers):
    pid = _create(client, auth_headers).get_json()['id']
    resp = client.delete(f'/api/pipelines/{pid}', headers=auth_headers)
    assert resp.status_code == 200
    assert client.get(f'/api/pipelines/{pid}', headers=auth_headers).status_code == 404


def test_pipeline_create_empty_name_rejected(client, auth_headers):
    resp = client.post('/api/pipelines',
                       json={'name': '', 'steps': []},
                       headers=auth_headers)
    assert resp.status_code == 400


def test_pipeline_create_unknown_workflow_rejected(client, auth_headers):
    resp = client.post('/api/pipelines',
                       json={'name': 'Bad', 'steps': [{'workflow': 'rm -rf /', 'configFile': ''}]},
                       headers=auth_headers)
    assert resp.status_code == 400


def test_pipeline_viewer_cannot_create(client, auth_headers):
    from tests.test_api import _create_user, _login
    _create_user(client, auth_headers, 'viewer_pl', 'viewer')
    vh = _login(client, 'viewer_pl')
    resp = client.post('/api/pipelines',
                       json={'name': 'X', 'steps': []},
                       headers=vh)
    assert resp.status_code == 403


def test_pipeline_viewer_can_list(client, auth_headers):
    from tests.test_api import _create_user, _login
    _create(client, auth_headers)
    _create_user(client, auth_headers, 'viewer_pl2', 'viewer')
    vh = _login(client, 'viewer_pl2')
    resp = client.get('/api/pipelines', headers=vh)
    assert resp.status_code == 200


# ── Execution ─────────────────────────────────────────────────────────────────

def test_pipeline_run_not_found(client, auth_headers):
    resp = client.post('/api/pipelines/nonexistent/run', headers=auth_headers)
    assert resp.status_code == 404


def test_pipeline_run_streams(client, auth_headers, monkeypatch):
    """Pipeline /run returns an SSE stream."""
    import subprocess, server

    class FakeProc:
        returncode = 0
        stdout = iter([])
        stderr = iter([])
        def wait(self): pass
        def kill(self): pass
        def poll(self): return 0

    monkeypatch.setattr(subprocess, 'Popen', lambda *a, **kw: FakeProc())

    pid = _create(client, auth_headers).get_json()['id']
    resp = client.post(f'/api/pipelines/{pid}/run', headers=auth_headers)
    assert resp.status_code == 200
    assert 'text/event-stream' in resp.content_type
    body = resp.data.decode()
    assert 'pipeline_start' in body
    assert 'pipeline_done' in body


def test_pipeline_run_empty_steps_rejected(client, auth_headers):
    resp = client.post('/api/pipelines',
                       json={'name': 'Empty', 'steps': []},
                       headers=auth_headers)
    # name validation passes but step list is empty
    # API creates it; run should fail
    if resp.status_code == 201:
        pid = resp.get_json()['id']
        run_resp = client.post(f'/api/pipelines/{pid}/run', headers=auth_headers)
        assert run_resp.status_code == 400


PASSWORD_SCRIPT = 'ChangeDefaultAdminPasswordPe'
PASSWORD_ACK = {'riskAcknowledged': True, 'destructiveConfirmation': f'RUN {PASSWORD_SCRIPT}'}


def _password_pipeline(client, auth_headers):
    return _create(client, auth_headers, steps=[
        {'workflow': PASSWORD_SCRIPT, 'configFile': 'password.yml'},
        {'workflow': 'pod-config', 'configFile': 'baseline.yml'},
    ])


@pytest.mark.parametrize('ack', [{}, {'riskAcknowledged': True, 'destructiveConfirmation': 'wrong'}])
def test_password_pipeline_requires_confirmation(client, auth_headers, ack):
    pid = _password_pipeline(client, auth_headers).get_json()['id']
    resp = client.post(f'/api/pipelines/{pid}/run', json=ack, headers=auth_headers)
    assert resp.status_code == 400
    assert 'script' in resp.get_json()['error'].lower()


def test_password_pipeline_requires_existing_config(client, auth_headers):
    pid = _password_pipeline(client, auth_headers).get_json()['id']
    resp = client.post(f'/api/pipelines/{pid}/run', json=PASSWORD_ACK, headers=auth_headers)
    assert resp.status_code == 400
    assert 'configuration' in resp.get_json()['error']


@pytest.mark.parametrize('output, expected', [('', 'success'), ('[ERROR] password change failed', 'failed')])
def test_password_pipeline_uses_script_and_failure_gate(client, auth_headers, monkeypatch, output, expected):
    import server
    commands = []
    server.get_configs_dir().mkdir(parents=True, exist_ok=True)
    (server.get_configs_dir() / 'password.yml').write_text(
        'clusters:\n  192.0.2.10:\n    name: test\n    pe_credential: pe_old\n    new_pe_admin_credential: pe_new\n')

    class FakeProc:
        returncode = 0
        stderr = iter([])

        def __init__(self):
            self.stdout = iter([output] if output else [])

        def wait(self): pass
        def kill(self): pass
        def poll(self): return 0

    def popen(command, **kwargs):
        commands.append(command)
        return FakeProc()

    monkeypatch.setattr(server.subprocess, 'Popen', popen)
    pid = _password_pipeline(client, auth_headers).get_json()['id']
    resp = client.post(f'/api/pipelines/{pid}/run', json=PASSWORD_ACK, headers=auth_headers)
    assert resp.status_code == 200
    events = [json.loads(line[6:]) for line in resp.data.decode().splitlines() if line.startswith('data: ')]
    assert '--script' in commands[0]
    assert PASSWORD_SCRIPT in commands[0]
    assert '-f' in commands[0]
    assert events[-1]['data']['status'] == expected
    assert len(commands) == (2 if expected == 'success' else 1)
    if expected == 'success':
        assert '--workflow' in commands[1]
    else:
        assert any(event['type'] == 'step_skipped' for event in events)


@pytest.mark.parametrize('step', [None, {'workflow': []}, {'workflow': 'DeleteVmPe'},
                                   {'workflow': PASSWORD_SCRIPT, 'configFile': ''},
                                   {'workflow': PASSWORD_SCRIPT, 'configFile': 42}])
def test_pipeline_rejects_invalid_or_unintegrated_scripts(client, auth_headers, step):
    assert _create(client, auth_headers, steps=[step]).status_code == 400


def test_password_script_direct_execution_still_requires_ack(client, auth_headers):
    for endpoint in ('/api/execute', '/api/jobs'):
        response = client.post(endpoint, json={'script': PASSWORD_SCRIPT}, headers=auth_headers)
        assert response.status_code == 403
        assert response.get_json()['destructiveAction'] is True


@pytest.mark.parametrize('content', ['clusters: {}', 'clusters: [bad]', 'clusters: {192.0.2.10: {name: test}}', '[invalid'])
def test_password_pipeline_rejects_malformed_config(client, auth_headers, content):
    import server
    server.get_configs_dir().mkdir(parents=True, exist_ok=True)
    (server.get_configs_dir() / 'password.yml').write_text(content)
    pid = _password_pipeline(client, auth_headers).get_json()['id']
    assert client.post(f'/api/pipelines/{pid}/run', json=PASSWORD_ACK, headers=auth_headers).status_code == 400


def test_password_pipeline_rejects_config_path_escape(client, auth_headers):
    pid = _create(client, auth_headers, steps=[
        {'workflow': PASSWORD_SCRIPT, 'configFile': '../password.yml'},
    ]).get_json()['id']
    assert client.post(f'/api/pipelines/{pid}/run', json=PASSWORD_ACK, headers=auth_headers).status_code == 400
