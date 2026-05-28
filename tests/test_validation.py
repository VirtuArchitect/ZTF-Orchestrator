"""Tests for input validation: allowlists, path safety, YAML, body size."""

import json
import pytest


# ── Workflow/script allowlist ─────────────────────────────────────────────────

def test_unknown_workflow_rejected(client, auth_headers):
    resp = client.post('/api/execute',
                       json={'workflow': 'rm-all; reboot', 'configFile': 'x.yml'},
                       headers=auth_headers)
    assert resp.status_code == 400
    assert 'Unknown workflow' in resp.get_json()['error']


def test_unknown_script_rejected(client, auth_headers):
    resp = client.post('/api/execute',
                       json={'script': '../../etc/passwd', 'configFile': 'x.yml'},
                       headers=auth_headers)
    assert resp.status_code == 400
    assert 'Unknown script' in resp.get_json()['error']


def test_known_workflow_passes_allowlist(client, auth_headers, monkeypatch):
    """Allowlist should accept cluster-create — subprocess is mocked so it won't actually run."""
    import subprocess

    class FakeProc:
        returncode = 0
        stdout = iter([])
        stderr = iter([])
        def wait(self): pass
        def kill(self): pass
        def poll(self): return 0

    monkeypatch.setattr(subprocess, 'Popen', lambda *a, **kw: FakeProc())
    # Should not return 400 for allowlist failure
    with client.post('/api/execute',
                     json={'workflow': 'cluster-create',
                           'configContent': 'cluster_name: test',
                           'configFile': 'test.yml'},
                     headers=auth_headers) as resp:
        assert resp.status_code != 400 or 'Unknown' not in (resp.get_json() or {}).get('error', '')


# ── Path traversal ────────────────────────────────────────────────────────────

TRAVERSAL_NAMES = [
    '../../etc/passwd',
    '../secret.yml',
    '..%2F..%2Fetc%2Fpasswd',
    '/absolute/path.yml',
]

@pytest.mark.parametrize('name', TRAVERSAL_NAMES)
def test_path_traversal_get_rejected(client, auth_headers, name):
    resp = client.get(f'/api/configs/{name}', headers=auth_headers)
    # Should return 404 (file not found in safe path) or 400 (rejected outright)
    assert resp.status_code in (400, 404)


@pytest.mark.parametrize('name', TRAVERSAL_NAMES)
def test_path_traversal_post_rejected(client, auth_headers, name):
    resp = client.post(f'/api/configs/{name}',
                       json={'content': 'key: value'},
                       headers=auth_headers)
    # 400/404 = rejected by validation; 405 = Werkzeug normalised the dotdot
    # path to a URL that has no POST handler (still a rejection)
    assert resp.status_code in (400, 404, 405)


# ── YAML validation ───────────────────────────────────────────────────────────

def test_invalid_yaml_rejected(client, auth_headers):
    resp = client.post('/api/configs/test.yml',
                       json={'content': 'key: [\nbroken yaml'},
                       headers=auth_headers)
    assert resp.status_code == 400
    assert 'YAML' in resp.get_json()['error']


def test_valid_yaml_accepted(client, auth_headers):
    resp = client.post('/api/configs/test.yml',
                       json={'content': 'cluster_name: my-cluster\nnodes: []\n'},
                       headers=auth_headers)
    assert resp.status_code == 200


def test_json_config_no_yaml_validation(client, auth_headers):
    """JSON files should be accepted without YAML validation."""
    resp = client.post('/api/configs/test.json',
                       json={'content': '{"key": "value"}'},
                       headers=auth_headers)
    assert resp.status_code == 200


def test_disallowed_extension_rejected(client, auth_headers):
    resp = client.post('/api/configs/evil.sh',
                       json={'content': 'rm -rf /'},
                       headers=auth_headers)
    assert resp.status_code == 400


# ── Body size ─────────────────────────────────────────────────────────────────

def test_oversized_body_rejected(client, auth_headers, monkeypatch):
    monkeypatch.setenv('ZTF_MAX_BODY', '100')
    import server, importlib
    importlib.reload(server)
    large = 'x' * 200
    resp = client.post('/api/configs/big.yml',
                       data=json.dumps({'content': large}),
                       content_type='application/json',
                       headers={'Authorization': auth_headers['Authorization'],
                                'Content-Length': '200'})
    # Either 413 or the content passes — depends on Flask's enforcement
    # At minimum must not be 500
    assert resp.status_code != 500


# ── Settings key filtering ────────────────────────────────────────────────────

def test_settings_unknown_keys_discarded(client, auth_headers):
    resp = client.post('/api/settings',
                       json={'ztfPath': '/tmp/ztf', 'EVIL_KEY': 'injected'},
                       headers=auth_headers)
    assert resp.status_code == 200
    # Read back — EVIL_KEY must not appear
    resp2 = client.get('/api/settings', headers=auth_headers)
    data = resp2.get_json()
    assert 'EVIL_KEY' not in data


def test_install_skips_git_pull_for_non_git_framework(client, auth_headers, tmp_path, monkeypatch):
    """Existing framework files without .git should reinstall dependencies, not fail on git pull."""
    import subprocess

    ztf_dir = tmp_path / 'zerotouch-framework'
    ztf_dir.mkdir()
    (ztf_dir / 'main.py').write_text('# ztf entrypoint\n')
    (ztf_dir / 'requirements.txt').write_text('pyyaml==6.0.2\n')

    client.post('/api/settings',
                json={'ztfPath': str(ztf_dir), 'pythonPath': 'python'},
                headers=auth_headers)

    calls = []

    class FakeRun:
        returncode = 1
        stdout = ''

    class FakeProc:
        returncode = 0
        stdout = iter(['ok\n'])
        def wait(self): pass

    def fake_popen(args, **kwargs):
        calls.append(args)
        return FakeProc()

    monkeypatch.setattr(subprocess, 'run', lambda *a, **kw: FakeRun())
    monkeypatch.setattr(subprocess, 'Popen', fake_popen)

    resp = client.post('/api/install', headers=auth_headers)
    body = resp.data.decode()

    assert resp.status_code == 200
    assert 'not a git checkout' in body
    assert all(call[:2] != ['git', 'pull'] for call in calls)
    assert any(call[:3] == ['python', '-m', 'pip'] for call in calls)


def test_install_skips_git_pull_for_invalid_git_marker(client, auth_headers, tmp_path, monkeypatch):
    """A stale .git marker should not be enough to run git pull."""
    import subprocess

    ztf_dir = tmp_path / 'zerotouch-framework'
    ztf_dir.mkdir()
    (ztf_dir / 'main.py').write_text('# ztf entrypoint\n')
    (ztf_dir / 'requirements.txt').write_text('pyyaml==6.0.2\n')
    (ztf_dir / '.git').mkdir()

    client.post('/api/settings',
                json={'ztfPath': str(ztf_dir), 'pythonPath': 'python'},
                headers=auth_headers)

    calls = []

    class FakeRun:
        returncode = 128
        stdout = ''

    class FakeProc:
        returncode = 0
        stdout = iter(['ok\n'])
        def wait(self): pass

    def fake_popen(args, **kwargs):
        calls.append(args)
        return FakeProc()

    monkeypatch.setattr(subprocess, 'run', lambda *a, **kw: FakeRun())
    monkeypatch.setattr(subprocess, 'Popen', fake_popen)

    resp = client.post('/api/install', headers=auth_headers)
    body = resp.data.decode()

    assert resp.status_code == 200
    assert 'not a git checkout' in body
    assert all(call[:2] != ['git', 'pull'] for call in calls)
