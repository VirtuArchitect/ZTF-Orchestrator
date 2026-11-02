"""Session visibility, activity semantics and revocation without bearer disclosure."""
import datetime as dt
import json
import uuid

import pytest


def headers(token):
    return {'Authorization': f'Bearer {token}'}


@pytest.mark.parametrize('role', [None, 'viewer', 'operator'])
def test_session_management_requires_admin(client, role):
    import server
    auth = headers(server._create_session('other', role)) if role else {}
    assert client.get('/api/auth/sessions', headers=auth).status_code == (403 if role else 401)
    assert client.delete(f'/api/auth/sessions/{uuid.uuid4()}', headers=auth).status_code == (403 if role else 401)


def test_counts_distinct_users_sessions_and_recent_reported_activity(client, auth_headers, admin_token):
    import server
    now = dt.datetime.now(dt.timezone.utc)
    alice = [server._create_session('alice', 'operator') for _ in range(2)]
    bob = server._create_session('bob', 'viewer')
    second_admin = server._create_session('admin', 'admin')
    for token in [bob, second_admin, alice[1]]:
        server._SESSIONS[token]['lastActivityAt'] = now - dt.timedelta(minutes=20)
    response = client.get('/api/auth/sessions', headers=auth_headers)
    assert response.status_code == 200
    body = response.get_json()
    assert body['summary'] == {'uniqueUsers': 3, 'totalSessions': 5, 'recentlyActiveUsers': 2, 'recentlyActiveSessions': 2}
    assert sum(s['isCurrent'] for s in body['sessions']) == 1
    for session in body['sessions']:
        assert str(uuid.UUID(session['id'])) == session['id']
        assert session['signedInAt'] and session['expiresAt']
        assert set(session) == {'id', 'username', 'role', 'signedInAt', 'lastActivityAt', 'expiresAt', 'isCurrent', 'recentlyActive'}
    for token in [admin_token, *alice, bob, second_admin]:
        assert token not in response.get_data(as_text=True)


def test_expired_and_legacy_activity_stays_unknown(client, auth_headers):
    import server
    expired = server._create_session('expired', 'viewer')
    server._SESSIONS[expired]['expires'] = dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=1)
    legacy = server._create_session('legacy', 'operator')
    server._SESSIONS[legacy].pop('lastActivityAt')
    body = client.get('/api/auth/sessions', headers=auth_headers).get_json()
    assert not any(s['username'] == 'expired' for s in body['sessions'])
    item = next(s for s in body['sessions'] if s['username'] == 'legacy')
    assert item['lastActivityAt'] is None and item['recentlyActive'] is False


def test_passive_reads_do_not_mark_activity_but_explicit_report_does(client, auth_headers, admin_token):
    import server
    past = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=20)
    server._SESSIONS[admin_token]['lastActivityAt'] = past
    expires = server._SESSIONS[admin_token]['expires']
    for endpoint in ['/api/auth/me', '/api/auth/sessions', '/api/jobs', '/api/settings']:
        assert client.get(endpoint, headers=auth_headers).status_code == 200
    assert server._SESSIONS[admin_token]['lastActivityAt'] == past
    assert client.post('/api/auth/activity', json={'lastActivityAt': '2099-01-01'}, headers=auth_headers).status_code == 200
    activity = server._SESSIONS[admin_token]['lastActivityAt']
    assert activity > past and activity <= dt.datetime.now(dt.timezone.utc)
    assert server._SESSIONS[admin_token]['expires'] == expires
    assert client.post('/api/auth/activity').status_code == 401


def test_revoke_one_session_preserves_other_signin_and_audits_safe_identifier(client, auth_headers, caplog):
    import server
    first = server._create_session('alice', 'operator')
    second = server._create_session('alice', 'operator')
    session_id = server._SESSIONS[first]['id']
    response = client.delete(f'/api/auth/sessions/{session_id}', headers=auth_headers)
    assert response.get_json() == {'success': True, 'currentSession': False}
    assert client.get('/api/auth/me', headers=headers(first)).status_code == 401
    assert client.post('/api/auth/activity', headers=headers(first)).status_code == 401
    assert client.get('/api/auth/me', headers=headers(second)).status_code == 200
    events = [json.loads(server.JSONFormatter().format(r)) for r in caplog.records if r.msg == 'session_revoked']
    assert len(events) == 1
    assert events[0]['user'] == 'admin' and events[0]['targetUser'] == 'alice'
    assert events[0]['targetSessionId'] == session_id and events[0]['action'] == 'session.revoke'
    assert first not in json.dumps(events) and second not in json.dumps(events)
    assert client.delete(f'/api/auth/sessions/{session_id}', headers=auth_headers).status_code == 404
    assert server._touch_session(first) is False


def test_revoke_current_session_then_request_is_unauthorized(client, auth_headers, admin_token):
    import server
    session_id = server._SESSIONS[admin_token]['id']
    result = client.delete(f'/api/auth/sessions/{session_id}', headers=auth_headers)
    assert result.get_json()['currentSession'] is True
    assert client.get('/api/auth/me', headers=auth_headers).status_code == 401


@pytest.mark.parametrize('identifier', ['not-a-uuid', "'or1=1", 'a' * 64])
def test_invalid_management_ids_fail_without_revoking_any_session(client, auth_headers, identifier):
    import server
    before = len(server._SESSIONS)
    assert client.delete(f'/api/auth/sessions/{identifier}', headers=auth_headers).status_code == 404
    assert len(server._SESSIONS) == before


@pytest.mark.parametrize('disabled', [True, False])
def test_stale_admin_session_cannot_manage_after_account_disable_or_demotion(client, auth_headers, disabled):
    import server
    users = server._load_users()
    users[0]['disabled'] = disabled
    if not disabled:
        users[0]['role'] = 'viewer'
    server._save_users(users)
    assert client.get('/api/auth/sessions', headers=auth_headers).status_code == 403
    assert client.delete(f'/api/auth/sessions/{uuid.uuid4()}', headers=auth_headers).status_code == 403
