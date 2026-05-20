"""Tests for authentication and session management."""


def test_login_no_credentials(client):
    resp = client.post('/api/auth/login', json={})
    assert resp.status_code == 400


def test_login_wrong_password(client):
    resp = client.post('/api/auth/login',
                       json={'username': 'admin', 'password': 'wrong'})
    assert resp.status_code == 401


def test_login_success(client, admin_token):
    assert len(admin_token) == 64  # secrets.token_hex(32)


def test_protected_endpoint_no_token(client):
    resp = client.get('/api/settings')
    assert resp.status_code == 401


def test_protected_endpoint_bad_token(client):
    resp = client.get('/api/settings',
                      headers={'Authorization': 'Bearer deadbeef'})
    assert resp.status_code == 401


def test_protected_endpoint_valid_token(client, auth_headers):
    resp = client.get('/api/settings', headers=auth_headers)
    assert resp.status_code == 200


def test_me_endpoint(client, auth_headers):
    resp = client.get('/api/auth/me', headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['username'] == 'admin'
    assert data['role'] == 'admin'


def test_logout(client, admin_token, auth_headers):
    # Logout
    resp = client.post('/api/auth/logout', headers=auth_headers)
    assert resp.status_code == 200
    # Token should now be invalid
    resp2 = client.get('/api/settings',
                       headers={'Authorization': f'Bearer {admin_token}'})
    assert resp2.status_code == 401


def test_health_no_auth_required(client):
    """Health endpoint must be publicly accessible."""
    resp = client.get('/health')
    assert resp.status_code in (200, 503)  # depends on ZTF being installed
    data = resp.get_json()
    assert 'status' in data
