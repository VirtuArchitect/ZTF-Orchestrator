import datetime
import os
import threading
from pathlib import Path

import pytest

from storage_backend import FileStorage, PostgresStorage


def test_file_storage_round_trip(tmp_path):
    storage = FileStorage(tmp_path)
    path = tmp_path / 'settings.json'

    storage.write_json(path, {'activeProfileId': 'default'})

    assert storage.read_json(path, {}) == {'activeProfileId': 'default'}


def test_file_storage_retries_permission_error_on_replace(tmp_path, monkeypatch):
    storage = FileStorage(tmp_path)
    path = tmp_path / 'jobs.json'
    original_replace = os.replace
    attempts = {'count': 0}

    def flaky_replace(src, dst):
        attempts['count'] += 1
        if attempts['count'] == 1:
            raise PermissionError('file is temporarily locked')
        return original_replace(src, dst)

    monkeypatch.setattr(os, 'replace', flaky_replace)

    storage.write_json(path, {'status': 'queued'})

    assert attempts['count'] == 2
    assert storage.read_json(path, {}) == {'status': 'queued'}
    assert not list(tmp_path.glob('.jobs.json.*.tmp'))


def test_file_storage_concurrent_writes_leave_valid_json(tmp_path):
    storage = FileStorage(tmp_path)
    path = tmp_path / 'jobs.json'

    def write_job(index: int) -> None:
        storage.write_json(path, {'job': index, 'status': 'done'})

    threads = [threading.Thread(target=write_job, args=(index,)) for index in range(20)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    data = storage.read_json(path, {})
    assert data['status'] == 'done'
    assert isinstance(data['job'], int)
    assert not list(tmp_path.glob('.jobs.json.*.tmp'))


@pytest.mark.skipif(
    not os.environ.get('ZTF_TEST_DATABASE_URL'),
    reason='ZTF_TEST_DATABASE_URL not set',
)
def test_postgres_storage_documents_sessions_and_audit():
    storage = PostgresStorage(os.environ['ZTF_TEST_DATABASE_URL'])
    document = Path('pytest-storage.json')

    storage.write_json(document, {'ok': True})
    assert storage.read_json(document, {}) == {'ok': True}

    token = 'pytest-token'
    expires = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=5)
    storage.create_session(token, 'pytest-user', 'admin', expires)
    session = storage.get_session(token)
    assert session
    assert session['username'] == 'pytest-user'
    assert session['role'] == 'admin'

    storage.append_audit_event({
        'level': 'INFO',
        'msg': 'pytest audit',
        'user': 'pytest-user',
        'action': 'pytest',
        'ip': '127.0.0.1',
    })
    events = storage.read_audit_events(limit=10, user='pytest-user', action='pytest')
    assert any(e.get('msg') == 'pytest audit' for e in events)

    storage.invalidate_session(token)
    assert storage.get_session(token) is None
