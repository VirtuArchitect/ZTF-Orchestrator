"""Offline adapter + actual Flask pipeline SSE integration, never live targets."""
import copy
import datetime as dt
import hashlib
import json
from pathlib import Path
import threading
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
import yaml

import initial_password_pipeline as adapter
import initial_password_routes as routes
import initial_password_setup as core


PE = 'ChangeDefaultAdminPasswordPe'
SECRET = 'memory-only-password-sentinel'


def intent():
    return {'cluster_name': 'example', 'host_key_evidence': 'independent console evidence',
            'cvms': [{'address': '192.0.2.10', 'ssh_host_key_sha256': 'SHA256:' + 'A' * 43,
                      'current_credential_ref': 'co', 'replacement_credential_ref': 'cn'}],
            'hosts': [{'address': '192.0.2.20', 'ssh_host_key_sha256': 'SHA256:' + 'B' * 43,
                       'access_credential_ref': 'access', 'accounts': [
                           {'username': 'root', 'current_credential_ref': 'ho', 'replacement_credential_ref': 'hn'}]}]}


@pytest.fixture
def harness(tmp_path, monkeypatch, isolated_data_dir):
    import server

    monkeypatch.setenv('ZTF_ALLOW_INITIAL_PASSWORD_SETUP', 'true')
    configs = tmp_path / 'pipeline-configs'
    configs.mkdir()
    texts = {
        'pe.yml': yaml.safe_dump({'clusters': {'192.0.2.30': {
            'name': 'example', 'pe_credential': 'pe_old', 'new_pe_admin_credential': 'pe_new'}}}),
        'initial.yml': yaml.safe_dump(intent()),
        'later.yml': yaml.safe_dump({'clusters': [{'cvm_credential': 'co', 'host_credential_ref': 'ho',
                                                  'pe_credential': 'co', 'new_pe_admin_credential': 'ho',
                                                  'pc_credential': 'co', 'credential_ref': 'ho',
                                                  'nested': {'ahv_credential': 'ho'}}]}),
    }
    for name, content in texts.items():
        (configs / name).write_bytes(content.encode('utf-8'))
    pipeline = {'id': 'pipeline-1', 'name': 'Initial setup', 'steps': [
        {'workflow': PE, 'configFile': 'pe.yml'},
        {'workflow': core.WORKFLOW, 'configFile': 'initial.yml'},
        {'workflow': 'pod-config', 'configFile': 'later.yml'}]}
    approval = {'id': 'approval-1', 'status': 'approved', 'workflow': core.WORKFLOW,
                'configContent': texts['initial.yml'], 'configFile': 'initial.yml',
                'requestedBy': 'alice', 'decidedBy': 'bob', 'jobId': '',
                'expiresAt': (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1)).isoformat()}
    data = {'riskAcknowledged': True, 'destructiveConfirmation': 'RUN ' + PE,
            'passwordSetupApprovalId': approval['id'], 'passwordSetupConfirmation': core.CONFIRMATION}
    store, saves, timeline, launches, contexts = {}, [], [], [], []
    def write(path, value):
        store[str(path)] = copy.deepcopy(value)
        saves.append(copy.deepcopy(value))
        return True
    def link(aid, binding):
        assert aid == approval['id']
        timeline.append('reserve')
        approval['jobId'] = binding
        return copy.deepcopy(approval)
    users = {'alice': {'role': 'admin'}, 'bob': {'role': 'admin'}}
    facade = SimpleNamespace(
        CONFIG_DIR=tmp_path, EXEC_TIMEOUT=30,
        read_json=lambda path, default: copy.deepcopy(store.get(str(path), default)),
        write_json=write, _find_user=lambda actor: users.get(actor),
        _approval_manager=SimpleNamespace(get_approval=lambda aid: copy.deepcopy(approval) if aid == approval['id'] else None,
                                          link_job=Mock(side_effect=link)),
        _workflow_approval_error=lambda *args: None,
        _parse_iso_datetime=lambda value: dt.datetime.fromisoformat(value) if value else None,
        _lookup_credential_ref=Mock(side_effect=AssertionError('Live vault lookup prohibited')),
        get_settings=lambda: {'pythonPath': 'mock-legacy-python'},
        get_configs_dir=lambda: configs, safe_config_path=server.safe_config_path,
    )
    service = routes.PasswordSetupService(facade)
    facade._initial_password_service = lambda: service
    validate = service.validate_approval
    def validate_approval(*args, **kwargs):
        timeline.append('validate')
        return validate(*args, **kwargs)
    monkeypatch.setattr(service, 'validate_approval', validate_approval)
    session = {'username': 'alice', 'role': 'admin'}
    monkeypatch.setattr(server, '_current_session', lambda: session)
    monkeypatch.setattr(server, '_load_pipelines', lambda: [copy.deepcopy(pipeline)])
    monkeypatch.setattr(server, '_initial_password_service', lambda: service)
    monkeypatch.setattr(server, 'get_configs_dir', lambda: configs)
    legacy = tmp_path / 'mock-legacy'
    legacy.mkdir()
    (legacy / 'main.py').write_text('# mocked executor only\n', encoding='utf-8')
    monkeypatch.setattr(server, 'get_settings', lambda: {
        'ztfPath': str(legacy), 'pythonPath': 'mock-legacy-python', 'webhookUrl': ''})
    monkeypatch.setattr(server, '_ztf_incompatible_error', lambda _: None)
    sync = Mock()
    monkeypatch.setattr(server, '_sync_global_config_to_legacy', sync)
    monkeypatch.setattr(core, 'resolve_credentials', Mock(return_value={'in-memory': ('nutanix', SECRET)}))
    monkeypatch.setattr(core, 'ssh_request', Mock(side_effect=AssertionError('Live SSH prohibited')))
    h = SimpleNamespace(server=server, facade=facade, service=service, pipeline=pipeline,
                        configs=configs, texts=texts, approval=approval, data=data, store=store,
                        saves=saves, timeline=timeline, launches=launches, contexts=contexts,
                        session=session, sync=sync, uncertain=False, fail_workflow=None)

    def execute(config, credentials, python_path, emit, cancelled, dry_run, state, checkpoint):
        timeline.append('core')
        assert credentials['in-memory'][1] == SECRET
        assert python_path == 'mock-legacy-python' and not dry_run
        if cancelled():
            return False, state
        assert 0 in service.list_runs()[-1]['completedSteps']
        if state is not None and all(t['status'] == 'verified' for t in state['targets']):
            checkpoint(state)  # simulated fresh replacement authentication, no write
            emit('[TEST] Fresh replacement authentication verified')
            return True, state
        state = {'workflow': core.WORKFLOW, 'config': config,
                 'targets': [{'key': 'cvm:192.0.2.10:nutanix', 'status': 'pending'}]}
        checkpoint(copy.deepcopy(state))
        state['targets'][0]['status'] = 'change_attempted'
        checkpoint(copy.deepcopy(state))
        timeline.append('password-write')
        if h.uncertain:
            emit('[TEST] Password state uncertain')
            return False, state
        state['targets'][0]['status'] = 'verified'
        checkpoint(copy.deepcopy(state))
        emit('[TEST] Replacement authentication verified')
        return True, state
    h.core = Mock(side_effect=execute)
    monkeypatch.setattr(core, 'execute', h.core)

    class Process:
        def __init__(self, workflow):
            self.returncode = 1 if h.fail_workflow == workflow else 0
            self.stdout, self.stderr = iter(['[TEST] Legacy step completed']), iter([])
        def wait(self):
            return self.returncode
        def poll(self):
            return self.returncode
        def kill(self):
            self.returncode = -1
    def popen(command, **kwargs):
        workflow = command[command.index('--script' if '--script' in command else '--workflow') + 1]
        assert workflow != core.WORKFLOW  # core branch MUST NOT launch ZTF
        timeline.append('legacy:' + workflow)
        path = Path(command[command.index('-f') + 1]) if '-f' in command else None
        if core.WORKFLOW in [s['workflow'] for s in pipeline['steps']]:
            assert 'reserve' in timeline
            index = next(i for i, s in enumerate(pipeline['steps']) if s['workflow'] == workflow)
            run = service.list_runs()[-1]
            assert run['pipelineAttempts'][str(index)] == 'change_attempted'
        launches.append({'workflow': workflow, 'command': list(command), 'path': path,
                         'text': path.read_text(encoding='utf-8') if path else None})
        return Process(workflow)
    monkeypatch.setattr(server.subprocess, 'Popen', popen)
    original_prepare = adapter.prepare
    def prepare(*args, **kwargs):
        context = original_prepare(*args, **kwargs)
        if context:
            contexts.append(context)
        return context
    monkeypatch.setattr(adapter, 'prepare', prepare)
    server.app.config['TESTING'] = True
    with server.app.test_client() as client:
        h.client = client
        yield h
    for context in contexts:
        adapter.release(context)
        worker = context.get('worker')
        if worker:
            worker.join(timeout=2)
            assert not worker.is_alive()
    assert not adapter.ACTIVE


def prepare(h, **kwargs):
    return adapter.prepare(h.facade, h.pipeline, kwargs.get('data', h.data), 'alice', kwargs.get('role', 'admin'), 'binding-1')


def events(response):
    return [json.loads(line[6:]) for line in response.get_data(as_text=True).splitlines() if line.startswith('data: ')]


def post(h, **kwargs):
    return h.client.post('/api/pipelines/pipeline-1/run', json=kwargs.pop('data', h.data), **kwargs)


def fresh_approval(h):
    h.approval['jobId'] = ''


@pytest.mark.parametrize('workflow', [PE, 'config-cluster'])
def test_prepare_after_initial_pe_bootstrap_snapshots_and_reserves(harness, workflow):
    h = harness
    h.pipeline['steps'][0]['workflow'] = workflow
    context = prepare(h)
    run = h.service.get_run(context['runId'])
    assert context['index'] == 1 and context['payload']['bindingId'] == 'binding-1'
    assert h.approval['jobId'] == 'binding-1'
    assert run['pipelineSnapshot']['configHashes'] == {
        name: hashlib.sha256((h.configs / name).read_bytes()).hexdigest() for name in h.texts}
    assert 'pe_old' not in json.dumps(run)  # other files are hashes, not persisted contents
    h.pipeline['steps'][0]['workflow'] = 'pod-config'
    assert run['pipelineSnapshot']['steps'][0]['workflow'] == workflow


@pytest.mark.parametrize('alter', ['first', 'not-adjacent', 'duplicate', 'no-new-pe', 'invalid-yaml', 'missing', 'clusters-list', 'non-string-new-pe'])
def test_prepare_requires_saved_adjacent_pe_bootstrap(harness, alter):
    h = harness
    if alter == 'first':
        h.pipeline['steps'].pop(0)
    elif alter == 'not-adjacent':
        h.pipeline['steps'][0]['workflow'] = 'pod-config'
    elif alter == 'duplicate':
        h.pipeline['steps'].append(copy.deepcopy(h.pipeline['steps'][1]))
    elif alter in ('no-new-pe', 'invalid-yaml'):
        (h.configs / 'pe.yml').write_text('clusters: {}' if alter == 'no-new-pe' else 'clusters: [', encoding='utf-8')
    elif alter == 'clusters-list':
        (h.configs / 'pe.yml').write_bytes(b'clusters: [unexpected]\n')
    elif alter == 'non-string-new-pe':
        (h.configs / 'pe.yml').write_bytes(b'clusters: {example: {new_pe_admin_credential: [unexpected]}}\n')
    else:
        h.pipeline['steps'][2]['configFile'] = 'absent.yml'
    with pytest.raises(ValueError):
        prepare(h)
    assert not h.launches and not h.core.called and not h.store


@pytest.mark.parametrize('role', ['operator', 'viewer', ''])
def test_prepare_requires_admin(harness, role):
    with pytest.raises(ValueError, match='administrator'):
        prepare(harness, role=role)
    assert not harness.store


@pytest.mark.parametrize('denial', ['disabled', 'no-approval', 'wrong-confirmation', 'expired', 'changed-intent', 'already-bound'])
def test_flask_flags_and_approval_checked_before_pe_write(harness, monkeypatch, denial):
    h = harness
    if denial == 'disabled':
        monkeypatch.delenv('ZTF_ALLOW_INITIAL_PASSWORD_SETUP')
    elif denial == 'no-approval':
        h.data['passwordSetupApprovalId'] = 'missing'
    elif denial == 'wrong-confirmation':
        h.data['passwordSetupConfirmation'] = 'wrong'
    elif denial == 'expired':
        h.approval['expiresAt'] = '2000-01-01T00:00:00+00:00'
    elif denial == 'changed-intent':
        (h.configs / 'initial.yml').write_text(h.texts['initial.yml'] + '# unreviewed\n', encoding='utf-8')
    else:
        h.approval['jobId'] = 'other-binding'
    response = post(h)
    assert response.status_code == 403
    assert not h.launches and not h.core.called and not h.sync.called


@pytest.mark.parametrize('role', ['operator', 'viewer'])
def test_flask_role_blocks_before_any_write(harness, role):
    harness.session['role'] = role
    assert post(harness).status_code == 403
    assert not harness.launches and not harness.core.called


def test_ambiguous_reference_handoff_blocks_before_pe_write(harness):
    h = harness
    config = intent()
    config['hosts'][0]['accounts'].append({'username': 'admin', 'current_credential_ref': 'ho', 'replacement_credential_ref': 'other'})
    text = yaml.safe_dump(config)
    (h.configs / 'initial.yml').write_bytes(text.encode())
    h.approval['configContent'] = text
    response = post(h)
    assert response.status_code == 403 and 'unambiguous' in response.get_json()['error']
    assert not h.launches and not h.core.called


@pytest.mark.parametrize('name', ['pe.yml', 'initial.yml', 'later.yml'])
def test_resume_rejects_changed_immutable_file_hashes(harness, name):
    h = harness
    context = prepare(h)
    adapter.release(context)
    fresh_approval(h)
    (h.configs / name).write_bytes((h.texts[name] + '# edited\n').encode())
    h.data['passwordSetupResumeRunId'] = context['runId']
    with pytest.raises(ValueError, match='unchanged configuration files'):
        prepare(h)


def test_resume_hash_binds_exact_file_bytes_including_line_endings(harness):
    h = harness
    context = prepare(h)
    adapter.release(context)
    fresh_approval(h)
    path = h.configs / 'later.yml'
    original = path.read_bytes()
    path.write_bytes(original.replace(b'\n', b'\r\n'))
    h.data['passwordSetupResumeRunId'] = context['runId']
    with pytest.raises(ValueError, match='unchanged configuration files'):
        prepare(h)


def test_attempted_legacy_stage_blocks_resume(harness):
    h = harness
    context = prepare(h)
    adapter.attempted(context, 0)
    adapter.release(context)
    fresh_approval(h)
    h.data['passwordSetupResumeRunId'] = context['runId']
    with pytest.raises(ValueError, match='uncertain legacy pipeline stage'):
        prepare(h)
    assert h.service.get_run(context['runId'])['pipelineAttempts'] == {'0': 'change_attempted'}


def test_flask_complete_sse_checkpoints_and_private_reference_handoff(harness):
    h = harness
    before = {name: (h.configs / name).read_bytes() for name in h.texts}
    response = post(h)
    assert response.status_code == 200 and response.mimetype == 'text/event-stream'
    stream = events(response)
    assert stream[0]['type'] == 'pipeline_start'
    assert stream[-1]['type'] == 'pipeline_done' and stream[-1]['data']['status'] == 'success'
    assert [call['workflow'] for call in h.launches] == [PE, 'pod-config']
    assert h.timeline.index('reserve') < h.timeline.index('legacy:' + PE) < h.timeline.index('core') < h.timeline.index('legacy:pod-config')
    run = h.service.get_run(h.contexts[0]['runId'])
    assert run['completedSteps'] == [0, 1, 2] and run['pipelineStatus'] == 'success'
    assert run['pipelineAttempts'] == {'0': 'completed', '2': 'completed'}
    seen = [saved[0]['state']['targets'][0]['status'] for saved in h.saves if saved and saved[0].get('state')]
    assert seen.index('pending') < seen.index('change_attempted') < seen.index('verified')
    later = yaml.safe_load(h.launches[-1]['text'])['clusters'][0]
    assert later['cvm_credential'] == 'cn' and later['host_credential_ref'] == 'hn'
    assert later['nested']['ahv_credential'] == 'hn'
    assert later['pe_credential'] == 'co' and later['new_pe_admin_credential'] == 'ho'
    assert later['pc_credential'] == 'co' and later['credential_ref'] == 'ho'
    assert before == {name: (h.configs / name).read_bytes() for name in h.texts}
    assert all(not call['path'].exists() for call in h.launches)
    assert SECRET not in json.dumps([stream, h.store, h.launches], default=str)
    assert h.core.call_args.kwargs['cancelled']()  # closing the finished response cancels its context


def test_password_failure_skips_later_steps_and_keeps_completed_pe(harness):
    h = harness
    h.uncertain = True
    stream = events(post(h))
    assert stream[-1]['data']['status'] == 'failed'
    assert [call['workflow'] for call in h.launches] == [PE]
    assert any(e['type'] == 'step_skipped' and e['data']['step'] == 2 for e in stream)
    run = h.service.get_run(h.contexts[0]['runId'])
    assert run['status'] == 'needs_reconciliation' and run['completedSteps'] == [0]
    assert run['state']['targets'][0]['status'] == 'change_attempted'


def test_resume_preserves_pe_and_reverifies_password_step(harness):
    h = harness
    h.fail_workflow = 'pod-config'
    assert events(post(h))[-1]['data']['status'] == 'failed'
    context = h.contexts[0]
    assert h.service.get_run(context['runId'])['completedSteps'] == [0, 1]
    # An ambiguous legacy attempt needs an explicit operator reconciliation.
    run = h.service.get_run(context['runId'])
    run['pipelineAttempts']['2'] = 'pending'
    h.service.save_run(run)
    fresh_approval(h)
    h.data['passwordSetupResumeRunId'] = context['runId']
    h.fail_workflow = None
    stream = events(post(h))
    assert stream[-1]['data']['status'] == 'success'
    assert any(e['type'] == 'step_complete' and e['data'].get('preserved') and e['data']['step'] == 0 for e in stream)
    assert [call['workflow'] for call in h.launches].count(PE) == 1
    assert h.core.call_count == 2
    assert h.core.call_args.kwargs['state']['targets'][0]['status'] == 'verified'


def test_completion_checkpoint_failure_stops_later_steps(harness, monkeypatch):
    h = harness
    save = h.service.save_run
    def fail(run):
        if 0 in run.get('completedSteps', []):
            raise OSError('private journal detail ' + SECRET)
        return save(run)
    monkeypatch.setattr(h.service, 'save_run', fail)
    stream = events(post(h))
    assert stream[-1]['data']['status'] == 'failed'
    assert [call['workflow'] for call in h.launches] == [PE] and not h.core.called
    assert SECRET not in json.dumps(stream)
    assert h.service.get_run(h.contexts[0]['runId'])['pipelineAttempts']['0'] == 'change_attempted'


def test_attempt_checkpoint_failure_prevents_legacy_subprocess(harness, monkeypatch):
    h = harness
    save = h.service.save_run
    def fail(run):
        if run.get('pipelineAttempts', {}).get('0') == 'change_attempted':
            raise OSError('journal unavailable')
        return save(run)
    monkeypatch.setattr(h.service, 'save_run', fail)
    stream = events(post(h))
    assert stream[-1]['data']['status'] == 'failed' and not h.launches and not h.core.called


def test_password_checkpoint_failure_blocks_mock_password_write(harness, monkeypatch):
    h = harness
    save = h.service.save_run
    def fail(run):
        if any(t['status'] == 'change_attempted' for t in (run.get('state') or {}).get('targets', [])):
            raise OSError('durable state unavailable ' + SECRET)
        return save(run)
    monkeypatch.setattr(h.service, 'save_run', fail)
    stream = events(post(h))
    assert stream[-1]['data']['status'] == 'failed'
    assert 'password-write' not in h.timeline and [call['workflow'] for call in h.launches] == [PE]
    assert SECRET not in json.dumps(stream)


def test_password_worker_exception_is_redacted_and_later_steps_stop(harness):
    h = harness
    h.core.side_effect = RuntimeError('untrusted output ' + SECRET)
    stream = events(post(h))
    assert stream[-1]['data']['status'] == 'failed'
    assert SECRET not in json.dumps(stream)
    assert [call['workflow'] for call in h.launches] == [PE]


def test_snapshot_survives_saved_file_edit_during_pe_step(harness):
    h = harness
    original = h.server.subprocess.Popen
    def changed(command, **kwargs):
        result = original(command, **kwargs)
        if PE in command:
            (h.configs / 'later.yml').write_bytes(b'cvm_credential: unreviewed\n')
        return result
    # Avoid modifying any saved repository artifact: these are fixture-owned files.
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(h.server.subprocess, 'Popen', changed)
        stream = events(post(h))
    assert stream[-1]['data']['status'] == 'success'
    assert yaml.safe_load(h.launches[-1]['text'])['clusters'][0]['cvm_credential'] == 'cn'
    assert 'unreviewed' not in h.launches[-1]['text']


def test_stream_cancellation_propagates_to_core_and_releases_run(harness):
    h = harness
    started, stopped = threading.Event(), threading.Event()
    def blocking(config, credentials, python_path, emit, cancelled, **kwargs):
        emit('[TEST] worker-started')
        started.set()
        for _ in range(100):
            if cancelled():
                stopped.set()
                return False, kwargs['state']
            stopped.wait(0.02)
        raise AssertionError('Cancellation did not reach core')
    h.core.side_effect = blocking
    response = post(h, buffered=False)
    for chunk in response.response:
        if b'worker-started' in chunk:
            break
    assert started.is_set()
    response.close()
    assert stopped.wait(2)
    h.contexts[0]['worker'].join(timeout=2)
    assert not adapter.ACTIVE
    assert [call['workflow'] for call in h.launches] == [PE]


def test_old_pipeline_without_opt_in_keeps_original_path(harness):
    h = harness
    h.pipeline['steps'] = [{'workflow': 'pod-config', 'configFile': 'later.yml'}]
    response = post(h, data={})
    assert events(response)[-1]['data']['status'] == 'success'
    assert not h.core.called and not h.store and not h.contexts
    assert h.launches[0]['path'] == h.configs / 'later.yml'
    assert h.launches[0]['text'] == h.texts['later.yml']
    h.sync.assert_called_once()


def test_config_snapshot_is_per_run_and_blocked_until_verified_completion(harness):
    h = harness
    first = prepare(h)
    with pytest.raises(ValueError, match='until password verification succeeds'):
        adapter.config_snapshot(first, h.pipeline['steps'][2], 2)
    adapter.completed(first, 1)
    first_text = adapter.config_snapshot(first, h.pipeline['steps'][2], 2)
    adapter.release(first)
    fresh_approval(h)
    config = intent()
    config['cvms'][0]['replacement_credential_ref'] = 'cn_second'
    new_text = yaml.safe_dump(config)
    (h.configs / 'initial.yml').write_bytes(new_text.encode())
    h.approval['configContent'] = new_text
    second = prepare(h)
    adapter.completed(second, 1)
    second_text = adapter.config_snapshot(second, h.pipeline['steps'][2], 2)
    assert yaml.safe_load(first_text)['clusters'][0]['cvm_credential'] == 'cn'
    assert yaml.safe_load(second_text)['clusters'][0]['cvm_credential'] == 'cn_second'
    assert adapter.config_snapshot(first, h.pipeline['steps'][2], 2) == first_text
    assert (h.configs / 'later.yml').read_bytes().decode() == h.texts['later.yml']


def concurrency_candidate(h, conflict, resume):
    """Keep only the selected collision; same-pipeline case has disjoint IPs."""
    config = intent()
    config['cvms'][0]['address'] = '192.0.2.110'
    config['hosts'][0]['address'] = '192.0.2.120'
    pe = '192.0.2.130'
    if conflict != 'same-pipeline':
        h.pipeline['id'] = 'pipeline-2'
    if conflict == 'cvm':
        config['cvms'][0]['address'] = '192.0.2.10'
    elif conflict == 'host':
        config['hosts'][0]['address'] = '192.0.2.20'
    elif conflict == 'pe':
        pe = '192.0.2.30'
    elif conflict == 'cross-role':
        config['cvms'][0]['address'] = '192.0.2.20'
    content = yaml.safe_dump(config)
    (h.configs / 'initial.yml').write_bytes(content.encode())
    (h.configs / 'pe.yml').write_bytes(yaml.safe_dump({'clusters': {pe: {
        'name': 'example', 'pe_credential': 'pe_old', 'new_pe_admin_credential': 'pe_new'}}}).encode())
    h.approval['configContent'] = content
    fresh_approval(h)
    if resume:
        payload = {'configContent': content, 'configFile': 'initial.yml'}
        snapshot = {'pipelineId': h.pipeline['id'], 'name': h.pipeline['name'],
                    'steps': copy.deepcopy(h.pipeline['steps']),
                    'configHashes': {name: hashlib.sha256((h.configs / name).read_bytes()).hexdigest() for name in h.texts}}
        run = h.service.new_run(payload, 'alice', pipelineId=h.pipeline['id'], pipelineSnapshot=snapshot)
        h.data['passwordSetupResumeRunId'] = run['id']


@pytest.mark.parametrize('resume', [False, True], ids=['fresh', 'resume'])
@pytest.mark.parametrize('conflict', ['same-pipeline', 'cvm', 'host', 'pe', 'cross-role'])
def test_concurrent_conflict_rejected_before_journal_approval_or_pe(harness, monkeypatch, resume, conflict):
    h = harness
    active = prepare(h)
    concurrency_candidate(h, conflict, resume)
    before_store, before_active = copy.deepcopy(h.store), copy.deepcopy(adapter.ACTIVE)
    create = Mock(wraps=h.service.new_run)
    reserve = Mock(wraps=h.service.reserve_approval)
    monkeypatch.setattr(h.service, 'new_run', create)
    monkeypatch.setattr(h.service, 'reserve_approval', reserve)
    response = h.client.post('/api/pipelines/' + h.pipeline['id'] + '/run', json=h.data)
    assert response.status_code == 403 and 'already active' in response.get_json()['error']
    create.assert_not_called()
    reserve.assert_not_called()
    assert h.store == before_store and adapter.ACTIVE == before_active
    assert active['runId'] in adapter.ACTIVE
    assert not h.launches and not h.core.called and not h.sync.called


@pytest.mark.parametrize('resume', [False, True], ids=['fresh', 'resume'])
def test_different_pipeline_disjoint_targets_allowed_while_first_active(harness, resume):
    h = harness
    first = prepare(h)
    concurrency_candidate(h, 'disjoint', resume)
    second = adapter.prepare(h.facade, h.pipeline, h.data, 'alice', 'admin', 'binding-2')
    assert second['runId'] != first['runId']
    assert set(adapter.ACTIVE) == {first['runId'], second['runId']}
    assert adapter.ACTIVE[second['runId']] == {
        'bindingId': 'binding-2', 'pipelineId': 'pipeline-2',
        'addresses': {'192.0.2.110', '192.0.2.120', '192.0.2.130'}}
    assert h.approval['jobId'] == 'binding-2'


def test_server_active_alias_and_service_journal_key_guard(harness, monkeypatch):
    h = harness
    assert h.server._INITIAL_PASSWORD_ACTIVE_PIPELINES is adapter.ACTIVE
    context = prepare(h)
    assert adapter.ACTIVE[context['runId']] == {
        'bindingId': 'binding-1', 'pipelineId': 'pipeline-1',
        'addresses': {'192.0.2.10', '192.0.2.20', '192.0.2.30'}}
    assert context['runId'] != h.pipeline['id']
    monkeypatch.setattr(h.facade, '_INITIAL_PASSWORD_ACTIVE_PIPELINES', h.server._INITIAL_PASSWORD_ACTIVE_PIPELINES, raising=False)
    monkeypatch.setattr(h.facade, '_job_manager', SimpleNamespace(get_job=lambda _: None), raising=False)
    run = h.service.get_run(context['runId'])
    with pytest.raises(ValueError, match='pipeline is still active'):
        h.service._inactive(run)
    adapter.release(context)
    h.service._inactive(run)


def test_simultaneous_fresh_admission_reserves_only_one_journal(harness, monkeypatch):
    h = harness
    barrier, outcomes = threading.Barrier(2), []
    create, reserve = Mock(wraps=h.service.new_run), Mock(wraps=h.service.reserve_approval)
    monkeypatch.setattr(h.service, 'new_run', create)
    monkeypatch.setattr(h.service, 'reserve_approval', reserve)
    def enter(binding):
        barrier.wait(timeout=2)
        try:
            context = adapter.prepare(h.facade, h.pipeline, h.data, 'alice', 'admin', binding)
            outcomes.append(('admitted', context['runId']))
        except ValueError as error:
            outcomes.append(('rejected', str(error)))
    threads = [threading.Thread(target=enter, args=(binding,)) for binding in ('binding-a', 'binding-b')]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=3)
        assert not thread.is_alive()
    assert sorted(outcome[0] for outcome in outcomes) == ['admitted', 'rejected']
    assert 'already active' in next(message for status, message in outcomes if status == 'rejected')
    create.assert_called_once()
    reserve.assert_called_once()
    assert len(adapter.ACTIVE) == 1 and not h.launches and not h.core.called
