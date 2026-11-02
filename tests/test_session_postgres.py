"""Real PostgreSQL migration, persistence and revocation checks in a unique schema."""
import datetime as dt
import os
import uuid

import pytest

from storage_backend import PostgresStorage


@pytest.mark.skipif(not os.environ.get('ZTF_TEST_DATABASE_URL'), reason='Requires disposable PostgreSQL')
def test_existing_sessions_migrate_without_relogin_and_revocation_is_shared(client, monkeypatch, caplog):
    import psycopg
    from psycopg import sql
    from psycopg.conninfo import make_conninfo
    import server

    base = os.environ['ZTF_TEST_DATABASE_URL']
    schema = 'session_test_' + uuid.uuid4().hex
    with psycopg.connect(base) as conn:
        conn.execute(sql.SQL('create schema {}').format(sql.Identifier(schema)))
    url = make_conninfo(base, options=f'-csearch_path={schema}')
    try:
        expires = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1)
        with psycopg.connect(url) as conn:
            conn.execute('create table ztf_sessions (token text primary key, username text not null, role text not null, expires_at timestamptz not null, created_at timestamptz not null default now())')
            conn.execute('insert into ztf_sessions (token, username, role, expires_at) values (%s, %s, %s, %s)', ('legacy-token', 'legacy-user', 'viewer', expires))
        users = server._load_users()
        storage = PostgresStorage(url)
        legacy = storage.get_session('legacy-token')
        assert legacy['expires'] == expires and legacy['lastActivityAt'] is None
        assert str(uuid.UUID(legacy['id'])) == legacy['id']
        monkeypatch.setattr(server, '_storage', storage)
        server._save_users(users)
        admin = server._create_session('admin', 'admin')
        auth = {'Authorization': f'Bearer {admin}'}
        body = client.get('/api/auth/sessions', headers=auth).get_json()
        assert body['summary']['totalSessions'] == 2
        assert body['summary']['recentlyActiveUsers'] == 1
        assert 'legacy-token' not in str(body) and admin not in str(body)
        assert client.post('/api/auth/activity', headers={'Authorization': 'Bearer legacy-token'}).status_code == 200
        assert storage.get_session('legacy-token')['expires'] == expires
        assert storage.get_session('legacy-token')['lastActivityAt'] is not None
        # The additive migration is idempotent across a fresh application/storage instance.
        second = PostgresStorage(url)
        assert second.get_session('legacy-token')['id'] == legacy['id']
        other = 'other-sign-in'
        second.create_session(other, 'legacy-user', 'viewer', expires)
        assert client.delete('/api/auth/sessions/' + legacy['id'], headers=auth).status_code == 200
        assert second.get_session('legacy-token') is None
        assert second.touch_session('legacy-token') is False
        assert second.get_session(other)
        assert client.get('/api/auth/me', headers={'Authorization': 'Bearer legacy-token'}).status_code == 401
        assert any(r.msg == 'session_revoked' and r.targetSessionId == legacy['id'] for r in caplog.records)
        # An older image can still insert sessions: the next upgrade backfills IDs,
        # preserving expiry and leaving unknown activity explicitly untracked.
        with psycopg.connect(url) as conn:
            conn.execute('insert into ztf_sessions (token, username, role, expires_at) values (%s, %s, %s, %s)', ('rollback-created', 'legacy-user', 'viewer', expires))
        after_rollback = PostgresStorage(url).get_session('rollback-created')
        assert after_rollback['id'] and after_rollback['lastActivityAt'] is None
        assert after_rollback['expires'] == expires
    finally:
        with psycopg.connect(base) as conn:
            conn.execute(sql.SQL('drop schema {} cascade').format(sql.Identifier(schema)))
