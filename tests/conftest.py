"""Shared pytest fixtures for ZTF-Orchestrator tests."""

import os
import tempfile
import pytest

# Point all file I/O at a temp directory so tests never touch ~/.ztf-ui
@pytest.fixture(autouse=True)
def isolated_data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv('ZTF_DATA_DIR', str(tmp_path))
    # Re-import server with the new env var
    import importlib
    import server
    importlib.reload(server)
    server._ensure_default_admin()
    yield tmp_path


@pytest.fixture()
def client(isolated_data_dir):
    import server
    server.app.config['TESTING'] = True
    with server.app.test_client() as c:
        yield c


@pytest.fixture()
def admin_token(client, isolated_data_dir):
    """Log in as the default admin and return a bearer token."""
    import server
    # Read the generated password from users.json
    import json
    users = json.loads((isolated_data_dir / 'users.json').read_text())  # type: ignore[name-defined]
    # We need the plaintext password — only available on first creation.
    # Re-create a known admin for tests.
    import bcrypt
    pw = 'TestAdmin123!'
    for u in users:
        if u['username'] == 'admin':
            u['password_hash'] = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
    (isolated_data_dir / 'users.json').write_text(json.dumps(users))  # type: ignore[name-defined]

    resp = client.post('/api/auth/login',
                       json={'username': 'admin', 'password': pw})
    assert resp.status_code == 200
    return resp.get_json()['token']


@pytest.fixture()
def auth_headers(admin_token):
    return {'Authorization': f'Bearer {admin_token}'}
