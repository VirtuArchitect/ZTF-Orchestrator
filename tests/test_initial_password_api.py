"""Offline facade/API boundary checks; never use real SSH or vault secrets."""

from tests.conftest import create_account_session
import copy
from contextlib import nullcontext
import datetime as dt
import json
import threading
from types import SimpleNamespace
from unittest.mock import Mock

from flask import Flask
import pytest
import yaml

import initial_password_routes as routes
from storage_backend import FileStorage, PostgresStorage


@pytest.fixture(autouse=True)
def isolated_data_dir(tmp_path, monkeypatch):
    # Pure facade tests do not initialize the application's unrelated engines.
    monkeypatch.delenv('ZTF_ALLOW_INITIAL_PASSWORD_SETUP', raising=False)
    yield tmp_path


def intent():
    return {'cluster_name': 'example', 'host_key_evidence': 'console inventory',
            'cvms': [{'address': '192.0.2.10', 'ssh_host_key_sha256': 'SHA256:' + 'A' * 43,
                      'current_credential_ref': 'co', 'replacement_credential_ref': 'cn'}],
            'hosts': [{'address': '192.0.2.20', 'ssh_host_key_sha256': 'SHA256:' + 'B' * 43,
                       'access_credential_ref': 'access', 'accounts': [
                           {'username': 'root', 'current_credential_ref': 'ho', 'replacement_credential_ref': 'hn'}]}]}


@pytest.fixture
def facade(tmp_path, monkeypatch):
    store = {}
    users = {'alice': {'role': 'admin'}, 'bob': {'role': 'admin'}}
    approval = {'id': 'approval-1', 'status': 'approved', 'workflow': routes.core.WORKFLOW,
                'configContent': yaml.safe_dump(intent()), 'configFile': 'initial.yml',
                'requestedBy': 'alice', 'decidedBy': 'bob',
                'expiresAt': (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1)).isoformat(), 'jobId': ''}
    jobs = {}
    def submit(payload, actor):
        job = {'id': str(len(jobs) + 1), 'status': 'queued', 'payload': copy.deepcopy(payload)}
        jobs[job['id']] = job
        return copy.deepcopy(job)
    manager = SimpleNamespace(_lock=threading.RLock(), submit=Mock(side_effect=submit), get_job=lambda jid: jobs.get(jid),
                              _stop=False, _emit=Mock(), _set_diagnostics=Mock(), _complete=Mock())
    def link(aid, jid):
        approval['jobId'] = jid
        return copy.deepcopy(approval)
    server = SimpleNamespace(CONFIG_DIR=tmp_path, read_json=lambda p, default: copy.deepcopy(store.get(str(p), default)),
                             write_json=lambda p, value: store.__setitem__(str(p), copy.deepcopy(value)),
                             _find_user=lambda name: users.get(name),
                             _approval_manager=SimpleNamespace(get_approval=lambda aid: copy.deepcopy(approval) if aid == approval['id'] else None,
                                                               link_job=Mock(side_effect=link)),
                             _workflow_approval_error=lambda *args: None,
                             _parse_iso_datetime=lambda value: dt.datetime.fromisoformat(value) if value else None,
                             _lookup_credential_ref=Mock(), _job_manager=manager,
                             _record_execution_history=Mock(), EXEC_TIMEOUT=60,
                             get_settings=lambda: {'pythonPath': 'python'})
    service = routes.PasswordSetupService(server)
    payload = {'workflow': routes.core.WORKFLOW, 'configContent': approval['configContent'], 'configFile': 'initial.yml',
               'approvalId': approval['id'], 'destructiveConfirmation': routes.core.CONFIRMATION}
    monkeypatch.setattr(routes.core, 'resolve_credentials', Mock(return_value={'memory-only': ('root', 'secret-marker')}))
    return SimpleNamespace(service=service, server=server, payload=payload, approval=approval,
                           manager=manager, jobs=jobs, users=users, store=store)


@pytest.mark.parametrize('content', ['', ' ', 'password: secret-marker', 'x: [', 'a: &a [*a]', 'a: 1\na: 2',
                                     'x: ' + 'é' * 33000], ids=['empty', 'blank', 'plaintext', 'malformed', 'alias', 'duplicate', 'oversize'])
def test_parse_fails_safely(facade, content):
    with pytest.raises(ValueError) as exc:
        facade.service.parse({**facade.payload, 'configContent': content})
    assert str(exc.value) == routes.ERROR
    assert 'secret-marker' not in str(exc.value)


def test_parse_reference_only(facade):
    assert facade.service.parse(facade.payload) == intent()
    config = intent()
    config['hosts'][0]['accounts'][0]['password'] = 'secret-marker'
    with pytest.raises(ValueError):
        facade.service.parse({**facade.payload, 'configContent': yaml.safe_dump(config)})


@pytest.mark.parametrize('field,value', [('configContent', ''), ('configFile', ''), ('workflow', 'other'),
                                       ('status', 'pending'), ('requestedBy', 'bob'), ('decidedBy', 'ALICE'),
                                       ('expiresAt', None), ('expiresAt', 'bad'),
                                       ('expiresAt', '2000-01-01T00:00:00+00:00'), ('jobId', 'other-job')])
def test_approval_exact_binding(facade, monkeypatch, field, value):
    monkeypatch.setenv('ZTF_ALLOW_INITIAL_PASSWORD_SETUP', 'true')
    facade.approval[field] = value
    with pytest.raises(ValueError, match=routes.ERROR):
        facade.service.validate_approval(facade.payload, 'alice')


@pytest.mark.parametrize('actor', ['alice', 'bob'])
def test_disabled_admin_rejected(facade, monkeypatch, actor):
    monkeypatch.setenv('ZTF_ALLOW_INITIAL_PASSWORD_SETUP', 'true')
    facade.users[actor]['disabled'] = True
    with pytest.raises(ValueError):
        facade.service.validate_approval(facade.payload, 'alice')


def test_gate_confirmation_and_reservation(facade, monkeypatch):
    with pytest.raises(ValueError):
        facade.service.validate_approval(facade.payload, 'alice')
    monkeypatch.setenv('ZTF_ALLOW_INITIAL_PASSWORD_SETUP', 'true')
    with pytest.raises(ValueError):
        facade.service.validate_approval({**facade.payload, 'destructiveConfirmation': ''}, 'alice')
    facade.service.reserve_approval(facade.payload, 'alice', 'pipeline-run')
    assert facade.service.validate_approval(facade.payload, 'alice', 'pipeline-run')['jobId'] == 'pipeline-run'
    with pytest.raises(ValueError):
        facade.service.reserve_approval(facade.payload, 'alice', 'different-run')


def state(status='pending'):
    return {'targets': [{'key': 'host:192.0.2.20:root', 'status': status}]}


def uncertain_run(facade, legacy=False):
    run = facade.service.new_run(facade.payload, 'alice')
    if legacy:
        run.update(pipelineId='old-pipeline', pipelineAttempts={'0': 'change_attempted'})
    else:
        run['state'] = state('change_attempted')
    return facade.service.save_run(run)


@pytest.mark.parametrize('legacy', [False, True])
def test_fresh_run_cannot_bypass_uncertain_history(facade, legacy):
    old = uncertain_run(facade, legacy)
    # Neither a new approval nor reference/cluster labels establish new identity.
    config = intent()
    config['cluster_name'] = 'different-label'
    config['hosts'][0]['accounts'][0].update(current_credential_ref='different-old', replacement_credential_ref='different-new')
    payload = {**facade.payload, 'approvalId': 'fresh-approval', 'configContent': yaml.safe_dump(config)}
    with pytest.raises(ValueError, match='Reconcile overlapping uncertain'):
        facade.service.new_run(payload, 'alice')
    assert len(facade.service.list_runs()) == 1
    assert facade.service.get_run(old['id']) == old


@pytest.mark.parametrize('legacy', [False, True])
def test_guard_canonicalizes_ipv4_mapped_addresses(facade, legacy):
    uncertain_run(facade, legacy)
    config = intent()
    for group in ('cvms', 'hosts'):
        config[group][0]['address'] = '::ffff:' + config[group][0]['address']
    with pytest.raises(ValueError, match='Reconcile overlapping uncertain'):
        facade.service.validate_new_targets(config)


@pytest.mark.parametrize('legacy', [False, True])
def test_guard_allows_separately_verified_rebuild_pins(facade, legacy):
    uncertain_run(facade, legacy)
    config = intent()
    for group in ('cvms', 'hosts'):
        config[group][0]['ssh_host_key_sha256'] = 'SHA256:' + 'C' * 43
    run = facade.service.new_run({**facade.payload, 'configContent': yaml.safe_dump(config)}, 'alice',
                                 resource_addresses=['192.0.2.10', '192.0.2.20'])
    assert run['id'] and len(facade.service.list_runs()) == 2


def test_one_changed_pin_does_not_erase_other_target_uncertainty(facade):
    uncertain_run(facade)
    config = intent()
    config['hosts'][0]['ssh_host_key_sha256'] = 'SHA256:' + 'C' * 43
    with pytest.raises(ValueError):
        facade.service.validate_new_targets(config)


@pytest.mark.parametrize('status', ['preflight', 'pending', 'verified'])
@pytest.mark.parametrize('legacy_status', ['pending', 'completed'])
def test_successful_or_reconciled_history_does_not_block_fresh_run(facade, status, legacy_status):
    old = facade.service.new_run(facade.payload, 'alice')
    old.update(status='reconciled' if status == 'pending' else 'success',
               state=state(status), pipelineAttempts={'0': legacy_status})
    facade.service.save_run(old)
    assert facade.service.new_run(facade.payload, 'alice')['id'] != old['id']


def test_guard_requires_current_uncertain_markers_not_historical_label(facade):
    old = uncertain_run(facade)
    old.update(status='needs_reconciliation', state=state('pending'))
    facade.service.save_run(old)
    assert facade.service.new_run(facade.payload, 'alice')['id'] != old['id']


def test_guard_allows_disjoint_targets(facade):
    uncertain_run(facade)
    config = intent()
    config['cvms'][0]['address'] = '198.51.100.10'
    config['hosts'][0]['address'] = '198.51.100.20'
    facade.service.validate_new_targets(config)


def test_legacy_resource_overlap_blocks_disjoint_ssh_targets(facade):
    old = uncertain_run(facade, legacy=True)
    old['resourceAddresses'] = ['192.0.2.10', '192.0.2.20', '192.0.2.1']
    facade.service.save_run(old)
    config = intent()
    config['cvms'][0]['address'] = '198.51.100.10'
    config['hosts'][0]['address'] = '198.51.100.20'
    with pytest.raises(ValueError, match='Reconcile overlapping uncertain'):
        facade.service.validate_new_targets(config, resource_addresses=['::ffff:192.0.2.1'])
    facade.service.validate_new_targets(config, resource_addresses=['198.51.100.1'])


def test_guard_excludes_only_requested_run(facade):
    old = uncertain_run(facade)
    facade.service.validate_new_targets(intent(), exclude_run_id=old['id'])
    with pytest.raises(ValueError):
        facade.service.validate_new_targets(intent(), exclude_run_id='different-run')


def test_readonly_dry_run_allowed_with_uncertain_history(facade):
    uncertain_run(facade)
    with Flask(__name__).app_context():
        response, code = facade.service.submit({**facade.payload, 'dryRun': True}, 'alice', 'admin')
    assert code == 202 and response.get_json()['initialPasswordRunId']
    facade.server._approval_manager.link_job.assert_not_called()


def test_live_submission_rejects_fresh_bypass_before_queueing(facade, monkeypatch):
    monkeypatch.setenv('ZTF_ALLOW_INITIAL_PASSWORD_SETUP', 'true')
    uncertain_run(facade)
    before = copy.deepcopy(facade.store)
    with Flask(__name__).app_context():
        response, code = facade.service.submit(facade.payload, 'alice', 'admin')
    assert code == 403 and response.get_json() == {'error': routes.ERROR}
    assert facade.store == before
    facade.manager.submit.assert_not_called()


def test_worker_rechecks_history_for_already_queued_fresh_job(facade, monkeypatch):
    monkeypatch.setenv('ZTF_ALLOW_INITIAL_PASSWORD_SETUP', 'true')
    old = facade.service.new_run(facade.payload, 'alice')
    with Flask(__name__).app_context():
        facade.service.submit(facade.payload, 'alice', 'admin')
    old['state'] = state('change_attempted')
    facade.service.save_run(old)
    execute = Mock()
    monkeypatch.setattr(routes.core, 'execute', execute)
    facade.service.run_job(facade.manager, '1', facade.jobs['1']['payload'], 'alice')
    execute.assert_not_called()
    routes.core.resolve_credentials.assert_not_called()
    facade.manager._complete.assert_called_once_with('1', 'failed', -1)


def test_new_pipeline_run_persists_canonical_resource_addresses(facade):
    run = facade.service.new_run(facade.payload, 'alice', 'pipeline-1', {'steps': []},
                                 resource_addresses=['::ffff:192.0.2.1', '192.0.2.1'])
    assert facade.service.get_run(run['id'])['resourceAddresses'] == ['192.0.2.1']


def test_guard_fails_closed_on_unidentifiable_uncertain_journal(facade):
    run = uncertain_run(facade)
    run['configContent'] = 'password: secret-marker'
    facade.service.save_run(run)
    with pytest.raises(ValueError) as exc:
        facade.service.validate_new_targets(intent())
    assert 'secret-marker' not in str(exc.value)


def test_new_rebuild_does_not_override_uncertain_pe_resource(facade):
    old = uncertain_run(facade, legacy=True)
    old['resourceAddresses'] = ['192.0.2.1']
    facade.service.save_run(old)
    config = intent()
    for group in ('cvms', 'hosts'):
        config[group][0]['ssh_host_key_sha256'] = 'SHA256:' + 'C' * 43
    with pytest.raises(ValueError, match='Reconcile overlapping uncertain'):
        facade.service.validate_new_targets(config, resource_addresses=['192.0.2.1'])


def test_invalid_resource_errors_are_sanitized(facade):
    with pytest.raises(ValueError) as exc:
        facade.service.new_run(facade.payload, 'alice', resource_addresses=['secret-marker'])
    assert 'secret-marker' not in str(exc.value)


@pytest.mark.parametrize('content', [b'{', b'null', b'{}', b'[{}]', b'\xff'])
@pytest.mark.parametrize('operation', ['admission', 'save'])
def test_existing_corrupt_file_journal_blocks_admission_and_save(facade, content, operation):
    run = facade.service.new_run(facade.payload, 'alice')
    backend = FileStorage(facade.server.CONFIG_DIR)
    facade.server._storage = backend
    facade.server.read_json = backend.read_json
    facade.server.write_json = Mock(wraps=backend.write_json)
    path = facade.service._path
    path.write_bytes(content)
    with pytest.raises(ValueError):
        if operation == 'admission':
            facade.service.new_run(facade.payload, 'alice')
        else:
            facade.service.save_run(run)
    assert path.read_bytes() == content
    facade.server.write_json.assert_not_called()


def test_missing_file_journal_can_initialize_and_retain_history(facade):
    backend = FileStorage(facade.server.CONFIG_DIR)
    facade.server._storage = backend
    facade.server.read_json = backend.read_json
    facade.server.write_json = backend.write_json
    first = facade.service.new_run(facade.payload, 'alice')
    second = facade.service.new_run(facade.payload, 'alice')
    assert [run['id'] for run in facade.service.list_runs()] == [first['id'], second['id']]


def test_unreadable_file_journal_blocks_reads_without_leaking_error(facade, monkeypatch):
    from pathlib import Path
    backend = FileStorage(facade.server.CONFIG_DIR)
    facade.server._storage = backend
    facade.server.read_json = backend.read_json
    facade.server.write_json = Mock()
    path = facade.service._path
    path.write_text('[]', encoding='utf-8')
    read = Path.read_text
    def deny(journal, *args, **kwargs):
        if journal == path:
            raise PermissionError('secret-marker')
        return read(journal, *args, **kwargs)
    monkeypatch.setattr(Path, 'read_text', deny)
    for operation in (facade.service.list_runs, lambda: facade.service.get_run('missing'),
                      lambda: facade.service.new_run(facade.payload, 'alice')):
        with pytest.raises(ValueError) as exc:
            operation()
        assert 'secret-marker' not in str(exc.value)
    facade.server.write_json.assert_not_called()


@pytest.mark.parametrize('stored', [None, {}, [{}], {'targets': []}])
def test_existing_invalid_postgres_document_is_not_missing(facade, stored):
    run = facade.service.new_run(facade.payload, 'alice')
    # Use the real Postgres document reader against a fake connection; no DB I/O.
    backend = object.__new__(PostgresStorage)
    connection = SimpleNamespace(execute=Mock(return_value=SimpleNamespace(fetchone=lambda: {'data': stored})))
    backend._connect = lambda: nullcontext(connection)
    facade.server._storage = backend
    facade.server.read_json = backend.read_json
    facade.server.write_json = Mock()
    with pytest.raises(ValueError):
        facade.service.validate_new_targets(intent())
    with pytest.raises(ValueError, match='journal is unreadable'):
        facade.service.save_run(run)
    facade.server.write_json.assert_not_called()


@pytest.mark.parametrize('exists', [False, True])
def test_postgres_missing_or_valid_empty_document_allows_admission(facade, exists):
    backend = object.__new__(PostgresStorage)
    connection = SimpleNamespace(execute=Mock(return_value=SimpleNamespace(
        fetchone=lambda: {'data': []} if exists else None)))
    backend._connect = lambda: nullcontext(connection)
    facade.server._storage = backend
    facade.server.read_json = backend.read_json
    facade.service.validate_new_targets(intent())


@pytest.mark.parametrize('operation', ['submit', 'resume', 'reconcile'])
def test_dr_dispatch_and_standalone_use_bounded_consistent_lock_order(facade, monkeypatch, operation):
    monkeypatch.setenv('ZTF_ALLOW_INITIAL_PASSWORD_SETUP', 'true')
    run = facade.service.new_run(facade.payload, 'alice')
    dr_ready, contender_waiting = threading.Event(), threading.Event()
    failures, results = [], []
    real_lock = threading.RLock()
    class QueueLock:
        def __enter__(self):
            if threading.current_thread().name == 'password-contender':
                contender_waiting.set()
            real_lock.acquire()
            return self
        def __exit__(self, *args):
            real_lock.release()
    facade.manager._lock = QueueLock()
    submit = facade.manager.submit.side_effect
    get_job = facade.manager.get_job
    def queue_submit(*args):
        with facade.manager._lock:
            return submit(*args)
    def queue_get_job(*args):
        with facade.manager._lock:
            return get_job(*args)
    facade.manager.submit.side_effect = queue_submit
    facade.manager.get_job = queue_get_job
    monkeypatch.setattr(routes.core, 'reconcile', Mock(return_value=(False, None)))
    app = Flask(__name__)
    def dr_dispatch():
        try:
            with facade.manager._lock:
                dr_ready.set()
                assert contender_waiting.wait(2), 'Standalone request did not reach queue admission'
                # A bounded probe makes the old inversion fail without leaving
                # deadlocked threads or global locks behind in the test process.
                available = routes.LOCK.acquire(timeout=.5)
                assert available, 'Helper lock held while waiting for DR job-manager lock'
                routes.LOCK.release()
                with app.app_context():
                    _, code = facade.service.submit({**facade.payload, 'dryRun': True}, 'alice', 'admin')
                    assert code == 202
                results.append('dr-complete')
        except Exception as exc:
            failures.append(str(exc))
    def contender():
        try:
            assert dr_ready.wait(2)
            with app.app_context():
                if operation == 'submit':
                    _, code = facade.service.submit({**facade.payload, 'dryRun': True}, 'alice', 'admin')
                    assert code == 202
                elif operation == 'resume':
                    _, code = facade.service.resume(run['id'], facade.payload, 'alice')
                    assert code == 202
                else:
                    with pytest.raises(ValueError):
                        facade.service.reconcile_run(run['id'], {
                            'selection': 'current', 'targetKeys': ['host:192.0.2.20:root'],
                            'notes': 'Checked', 'evidence': 'ticket-1'}, 'alice')
            results.append('standalone-complete')
        except Exception as exc:
            failures.append(str(exc))
    workers = [threading.Thread(target=dr_dispatch, daemon=True),
               threading.Thread(target=contender, name='password-contender', daemon=True)]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join(3)
    assert not any(worker.is_alive() for worker in workers), 'Lock-order regression left a blocked request'
    assert not failures
    assert sorted(results) == ['dr-complete', 'standalone-complete']


def test_reconciliation_releases_queue_lock_before_readonly_core_checks(facade, monkeypatch):
    run = facade.service.new_run(facade.payload, 'alice')
    acquired = []
    def reconcile(*args):
        def probe():
            available = facade.manager._lock.acquire(timeout=.5)
            acquired.append(available)
            if available:
                facade.manager._lock.release()
        worker = threading.Thread(target=probe, daemon=True)
        worker.start()
        worker.join(1)
        assert acquired == [True], 'Queue locked during SSH reconciliation'
        return False, None
    monkeypatch.setattr(routes.core, 'reconcile', reconcile)
    with pytest.raises(ValueError):
        facade.service.reconcile_run(run['id'], {'selection': 'current', 'targetKeys': ['x'],
                                                'notes': 'Checked', 'evidence': 'ticket-1'}, 'alice')
    assert acquired == [True]


def test_worker_cancellation_callbacks_run_outside_journal_lock(facade, monkeypatch):
    run = facade.service.new_run(facade.payload, 'alice')
    monkeypatch.setattr(routes.core, 'execute', Mock(return_value=(True, state('pending'))))
    def cancelled():
        acquired = []
        def probe():
            available = routes.LOCK.acquire(timeout=.5)
            acquired.append(available)
            if available:
                routes.LOCK.release()
        worker = threading.Thread(target=probe, daemon=True)
        worker.start()
        worker.join(1)
        assert acquired == [True], 'Cancellation callback invoked under helper lock'
        with facade.manager._lock:
            return False
    assert facade.service.execute_run(run, {**facade.payload, 'dryRun': True}, 'alice', Mock(), cancelled)


def test_submit_dry_run_durable_and_safe(facade):
    app = Flask(__name__)
    with app.app_context():
        response, code = facade.service.submit({**facade.payload, 'dryRun': True, 'password': 'secret-marker'}, 'alice', 'admin')
    assert code == 202
    run = facade.service.get_run(response.get_json()['initialPasswordRunId'])
    assert run['jobId'] == '1'
    facade.server._approval_manager.link_job.assert_not_called()
    assert 'secret-marker' not in json.dumps(facade.store)
    assert 'password' not in facade.manager.submit.call_args.args[0]


def test_worker_uncertain_state_history(facade, monkeypatch):
    monkeypatch.setenv('ZTF_ALLOW_INITIAL_PASSWORD_SETUP', 'true')
    def execute(config, creds, python, emit, **kwargs):
        kwargs['checkpoint'](state('change_attempted'))
        return False, state('change_attempted')
    monkeypatch.setattr(routes.core, 'execute', execute)
    with Flask(__name__).app_context():
        response, code = facade.service.submit(facade.payload, 'alice', 'admin')
    assert code == 202
    facade.service.run_job(facade.manager, '1', facade.jobs['1']['payload'], 'alice')
    facade.manager._complete.assert_called_once_with('1', 'failed', -1)
    diagnostics = facade.manager._set_diagnostics.call_args.args[1]
    assert diagnostics['initialPasswordRunId'] == response.get_json()['initialPasswordRunId']
    assert diagnostics['journalStatus'] == 'needs_reconciliation'
    assert diagnostics['state'] == state('change_attempted')
    assert 'secret-marker' not in json.dumps(facade.store)
    assert facade.server._record_execution_history.call_args.kwargs['status'] == 'failed'


@pytest.mark.parametrize('journal_status,ok,job_status,expected', [
    ('needs_reconciliation', False, 'running', 'failed'),
    ('interrupted', False, 'running', 'failed'),
    ('reconciled', False, 'running', 'failed'),
    ('cancelled', False, 'running', 'failed'),
    ('needs_reconciliation', False, 'cancelling', 'cancelled'),
    ('success', True, 'running', 'success'),
])
def test_worker_maps_journal_to_supported_terminal_job_status(facade, monkeypatch, journal_status, ok, job_status, expected):
    with Flask(__name__).app_context():
        response, code = facade.service.submit({**facade.payload, 'dryRun': True}, 'alice', 'admin')
    assert code == 202
    run_id = response.get_json()['initialPasswordRunId']
    facade.jobs['1']['status'] = job_status
    def execute_run(run, *args):
        run.update(status=journal_status, state=state('change_attempted' if journal_status == 'needs_reconciliation' else 'pending'))
        facade.service.save_run(run)
        return ok
    monkeypatch.setattr(facade.service, 'execute_run', execute_run)
    facade.service.run_job(facade.manager, '1', facade.jobs['1']['payload'], 'alice')
    facade.manager._complete.assert_called_once_with('1', expected, 0 if ok else -1)
    assert facade.service.get_run(run_id)['status'] == journal_status
    diagnostics = facade.manager._set_diagnostics.call_args.args[1]
    assert diagnostics['journalStatus'] == journal_status
    assert diagnostics['state'] == facade.service.get_run(run_id)['state']
    assert facade.server._record_execution_history.call_args.kwargs['status'] == expected


def test_worker_exception_with_uncertainty_is_terminal_failure(facade, monkeypatch):
    with Flask(__name__).app_context():
        facade.service.submit({**facade.payload, 'dryRun': True}, 'alice', 'admin')
    def execute_run(run, *args):
        run.update(status='needs_reconciliation', state=state('change_attempted'))
        facade.service.save_run(run)
        raise ValueError('Safe execution failure')
    monkeypatch.setattr(facade.service, 'execute_run', execute_run)
    facade.service.run_job(facade.manager, '1', facade.jobs['1']['payload'], 'alice')
    facade.manager._complete.assert_called_once_with('1', 'failed', -1)
    assert facade.manager._set_diagnostics.call_args.args[1]['journalStatus'] == 'needs_reconciliation'


def test_worker_rechecks_revoked_approval_before_credentials(facade, monkeypatch):
    monkeypatch.setenv('ZTF_ALLOW_INITIAL_PASSWORD_SETUP', 'true')
    execute = Mock()
    monkeypatch.setattr(routes.core, 'execute', execute)
    with Flask(__name__).app_context():
        facade.service.submit(facade.payload, 'alice', 'admin')
    facade.approval['status'] = 'rejected'
    facade.service.run_job(facade.manager, '1', facade.jobs['1']['payload'], 'alice')
    execute.assert_not_called()
    routes.core.resolve_credentials.assert_not_called()


def test_worker_completes_when_history_storage_fails(facade, monkeypatch):
    monkeypatch.setattr(routes.core, 'execute', Mock(return_value=(True, state('pending'))))
    facade.server._record_execution_history.side_effect = OSError('secret-marker')
    with Flask(__name__).app_context():
        facade.service.submit({**facade.payload, 'dryRun': True}, 'alice', 'admin')
    facade.service.run_job(facade.manager, '1', facade.jobs['1']['payload'], 'alice')
    facade.manager._complete.assert_called_once_with('1', 'success', 0)
    assert 'secret-marker' not in str(facade.manager._emit.call_args_list)


def test_pipeline_binding_and_checkpoint_preserves_context(facade, monkeypatch):
    monkeypatch.setenv('ZTF_ALLOW_INITIAL_PASSWORD_SETUP', 'true')
    run = facade.service.new_run(facade.payload, 'alice', 'pipeline-1', {'steps': [], 'configHashes': {}})
    facade.service.reserve_approval(facade.payload, 'alice', 'pipeline-run')
    def execute(config, creds, python, emit, **kwargs):
        fresh = facade.service.get_run(run['id'])
        fresh['completedSteps'] = [0]
        facade.service.save_run(fresh)
        kwargs['checkpoint'](state('verified'))
        return True, state('verified')
    monkeypatch.setattr(routes.core, 'execute', execute)
    assert facade.service.execute_run(run, {**facade.payload, 'bindingId': 'pipeline-run'}, 'alice', Mock(), lambda: False)
    assert facade.service.get_run(run['id'])['completedSteps'] == [0]


def test_durable_checkpoint_failure_blocks_write(facade, monkeypatch):
    monkeypatch.setenv('ZTF_ALLOW_INITIAL_PASSWORD_SETUP', 'true')
    run = facade.service.new_run(facade.payload, 'alice')
    run['jobId'] = '1'
    facade.service.save_run(run)
    facade.service.reserve_approval(facade.payload, 'alice', '1')
    writes = Mock()
    def execute(config, creds, python, emit, **kwargs):
        facade.server.write_json = Mock(side_effect=OSError('secret-marker'))
        kwargs['checkpoint'](state('change_attempted'))
        writes()
    monkeypatch.setattr(routes.core, 'execute', execute)
    with pytest.raises(ValueError):
        facade.service.execute_run(run, facade.payload, 'alice', Mock(), lambda: False)
    writes.assert_not_called()


def test_rotation_lock_blocks_new_work(facade):
    run = facade.service.new_run(facade.payload, 'alice')
    assert routes.rotation.ROTATION_LOCK.acquire(blocking=False)
    try:
        with pytest.raises(ValueError, match='Another password operation'):
            facade.service.execute_run(run, facade.payload, 'alice', Mock(), lambda: False)
    finally:
        routes.rotation.ROTATION_LOCK.release()


def test_gate_revoked_at_checkpoint_blocks_write(facade, monkeypatch):
    monkeypatch.setenv('ZTF_ALLOW_INITIAL_PASSWORD_SETUP', 'true')
    run = facade.service.new_run(facade.payload, 'alice')
    run['jobId'] = '1'
    facade.service.save_run(run)
    facade.service.reserve_approval(facade.payload, 'alice', '1')
    writes = Mock()
    def execute(config, creds, python, emit, **kwargs):
        monkeypatch.delenv('ZTF_ALLOW_INITIAL_PASSWORD_SETUP')
        kwargs['checkpoint'](state('change_attempted'))
        writes()
    monkeypatch.setattr(routes.core, 'execute', execute)
    with pytest.raises(ValueError):
        facade.service.execute_run(run, facade.payload, 'alice', Mock(), lambda: False)
    writes.assert_not_called()


@pytest.mark.parametrize('timed_out', [True, False])
def test_cancellation_and_deadline_are_bounded(facade, monkeypatch, timed_out):
    run = facade.service.new_run(facade.payload, 'alice')
    if timed_out:
        facade.server.EXEC_TIMEOUT = -1
    def execute(config, creds, python, emit, **kwargs):
        assert kwargs['cancelled']() is True
        return False, state('pending')
    monkeypatch.setattr(routes.core, 'execute', execute)
    assert not facade.service.execute_run(run, {**facade.payload, 'dryRun': True}, 'alice', Mock(), lambda: not timed_out)
    assert facade.service.get_run(run['id'])['status'] == 'cancelled'


def test_reconcile_readonly_and_resume_fresh_approval(facade, monkeypatch):
    run = facade.service.new_run(facade.payload, 'alice')
    run['state'] = state('change_attempted')
    facade.service.save_run(run)
    def reconcile(config, creds, python, current, keys, selection, emit, checkpoint):
        assert keys == ['host:192.0.2.20:root'] and selection == 'replacement'
        checkpoint(state('verified'))
        return True, state('verified')
    monkeypatch.setattr(routes.core, 'reconcile', reconcile)
    result = facade.service.reconcile_run(run['id'], {'selection': 'replacement', 'targetKeys': ['host:192.0.2.20:root'],
                                                     'notes': 'Checked console', 'evidence': 'ticket-1'}, 'alice')
    assert result['targets'][0]['status'] == 'verified'
    assert result['reconciliations'][0]['actor'] == 'alice'
    with Flask(__name__).app_context():
        _, code = facade.service.resume(run['id'], facade.payload, 'alice')
    assert code == 409  # live gate remains disabled
    monkeypatch.setenv('ZTF_ALLOW_INITIAL_PASSWORD_SETUP', 'true')
    with Flask(__name__).app_context():
        _, code = facade.service.resume(run['id'], facade.payload, 'alice')
    assert code == 202
    assert facade.service.get_run(run['id'])['jobId'] == '1'


def test_reconcile_active_or_identity_failure_does_not_save(facade, monkeypatch):
    run = facade.service.new_run(facade.payload, 'alice')
    run['jobId'] = '1'
    facade.service.save_run(run)
    facade.jobs['1'] = {'status': 'running'}
    check = Mock(return_value=(False, state('pending')))
    monkeypatch.setattr(routes.core, 'reconcile', check)
    data = {'selection': 'current', 'targetKeys': ['x'], 'notes': 'Checked', 'evidence': 'ticket-1'}
    with pytest.raises(ValueError):
        facade.service.reconcile_run(run['id'], data, 'alice')
    check.assert_not_called()
    facade.jobs['1']['status'] = 'failed'
    before = copy.deepcopy(facade.store)
    with pytest.raises(ValueError):
        facade.service.reconcile_run(run['id'], data, 'alice')
    assert facade.store == before


def test_pipeline_cannot_resume_standalone(facade):
    run = facade.service.new_run(facade.payload, 'alice', 'pipeline')
    with Flask(__name__).app_context():
        _, code = facade.service.resume(run['id'], facade.payload, 'alice')
    assert code == 409
    facade.manager.submit.assert_not_called()


def test_list_normalizes_targets_and_stale_status(facade):
    run = facade.service.new_run(facade.payload, 'alice')
    run.update(jobId='missing', state=state('change_attempted'))
    facade.service.save_run(run)
    result = facade.service.list_runs()[0]
    assert result['targets'] == state('change_attempted')['targets']
    assert result['status'] == 'needs_reconciliation'


@pytest.mark.parametrize('selection,expected', [('completed', [0]), ('not_applied', [])])
def test_pipeline_operator_attestation(facade, selection, expected):
    run = facade.service.new_run(facade.payload, 'alice', 'pipeline-1', {'steps': [{'workflow': 'ChangePassword'}]})
    run['pipelineAttempts'] = {'0': 'change_attempted'}
    facade.service.save_run(run)
    result = facade.service.reconcile_run(run['id'], {
        'pipelineStep': 0, 'selection': selection, 'independentlyVerified': True,
        'notes': 'Independent console check', 'evidence': 'ticket-1', 'completedSteps': [999]}, 'alice')
    assert result['completedSteps'] == expected
    assert result['pipelineAttempts']['0'] == ('completed' if expected else 'pending')
    assert result['reconciliations'][0]['source'] == 'operator-attestation'
    assert result['reconciliations'][0]['actor'] == 'alice'
    routes.core.resolve_credentials.assert_not_called()


@pytest.mark.parametrize('change', [
    {'independentlyVerified': False}, {'pipelineStep': True}, {'pipelineStep': -1},
    {'pipelineStep': 5}, {'selection': 'replacement'}, {'notes': ''}, {'evidence': ''}])
def test_pipeline_attestation_strict(facade, change):
    run = facade.service.new_run(facade.payload, 'alice', 'pipeline-1', {'steps': [{}]})
    run['pipelineAttempts'] = {'0': 'change_attempted'}
    facade.service.save_run(run)
    before = copy.deepcopy(facade.store)
    data = {'pipelineStep': 0, 'selection': 'completed', 'independentlyVerified': True,
            'notes': 'Checked', 'evidence': 'ticket-1', **change}
    with pytest.raises(ValueError):
        facade.service.reconcile_run(run['id'], data, 'alice')
    assert facade.store == before


def test_pipeline_attestation_rejects_active_pipeline(facade):
    run = facade.service.new_run(facade.payload, 'alice', 'pipeline-1', {'steps': [{}]})
    run['pipelineAttempts'] = {'0': 'change_attempted'}
    facade.service.save_run(run)
    facade.server._INITIAL_PASSWORD_ACTIVE_PIPELINES = {'pipeline-1'}
    with pytest.raises(ValueError):
        facade.service.reconcile_run(run['id'], {
            'pipelineStep': 0, 'selection': 'completed', 'independentlyVerified': True,
            'notes': 'Checked', 'evidence': 'ticket-1'}, 'alice')


def test_api_wiring_admin_reads_and_safe_rejection(tmp_path, monkeypatch):
    # Real route smoke, with an isolated runtime and all target adapters mocked.
    monkeypatch.setenv('ZTF_DATA_DIR', str(tmp_path))
    monkeypatch.setenv('ZTF_PATH', str(tmp_path))
    import importlib
    import server
    server._job_manager.stop()
    server._recovery_service.shutdown()
    server = importlib.reload(server)
    try:
        server.app.config['TESTING'] = True
        server._save_users([{'username': 'alice', 'role': 'admin'}, {'username': 'reader', 'role': 'operator'}])
        admin = {'Authorization': 'Bearer ' + create_account_session(server, 'alice', 'admin')}
        reader = {'Authorization': 'Bearer ' + create_account_session(server, 'reader', 'operator')}
        with server.app.test_client() as client:
            assert client.get('/api/initial-password-setup').status_code == 401
            assert client.get('/api/initial-password-setup/runs', headers=reader).status_code == 403
            response = client.get('/api/initial-password-setup', headers=admin)
            assert response.status_code == 200 and response.get_json()['applyEnabled'] is False
            assert client.get('/api/initial-password-setup/runs', headers=admin).get_json() == []
            response = client.post('/api/initial-password-setup/runs/missing/reconcile', headers=admin,
                                   json={'notes': 'secret-marker'})
            assert response.status_code == 409 and 'secret-marker' not in response.get_data(as_text=True)
    finally:
        server._job_manager.stop()
        server._recovery_service.shutdown()
