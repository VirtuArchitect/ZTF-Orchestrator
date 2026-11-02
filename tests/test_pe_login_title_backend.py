"""Backend boundaries for PE login titles; all target access is mocked."""
import ast
import importlib.util
import json
import logging
from pathlib import Path
import sys
import types

import pytest
import yaml

import pe_login_title as core

ROOT = Path(__file__).resolve().parents[1]
SID = 'SetPrismLoginTitlePe'
HOST = '192.0.2.10'


def intent():
    return {'pe_credential': 'admin_ref', 'clusters': {HOST: {
        'name': 'fixture', 'prism_login_title': 'Operations'}}}


def vault():
    return {'vault_to_use': 'local', 'vaults': {'local': {'credentials': {
        'admin_ref': {'username': 'admin', 'password': 'fixture-secret'}}}}}


def events(response):
    return [json.loads(line[6:]) for line in response.get_data(as_text=True).splitlines()
            if line.startswith('data: ')]


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize('action', [SID, 'config-cluster'])
@pytest.mark.parametrize('mode', ['valid', 'missing', 'wrong-vault', 'mixed', 'root-typo', 'tls-false'])
def test_api_preflight_no_target_requests(client, auth_headers, monkeypatch, action, mode):
    import server
    config, global_config = intent(), vault()
    if mode == 'missing':
        global_config['vaults']['local']['credentials'] = {}
    elif mode == 'wrong-vault':
        global_config['vault_to_use'] = 'cyberark'
    elif mode == 'mixed':
        config['clusters'][HOST]['ntp_servers'] = ['192.0.2.20']
    elif mode == 'root-typo':
        config = {'prism_login_title': 'wrong-location'}
    elif mode == 'tls-false':
        config['prism_login_title_verify_tls'] = False
    monkeypatch.setattr(server, '_load_global_config_data', lambda: global_config)
    monkeypatch.setattr(core.PeLoginTitleClient, '__init__', lambda *a, **k: pytest.fail('PE request'))
    monkeypatch.setattr(server.socket, 'create_connection', lambda *a, **k: pytest.fail('socket request'))
    payload = {'dryRun': True, 'configContent': yaml.safe_dump(config)}
    payload['workflow' if action == 'config-cluster' else 'script'] = action
    response = client.post('/api/execute', headers=auth_headers, json=payload)
    if mode in {'mixed', 'root-typo'}:
        assert response.status_code == 400
    else:
        assert response.status_code == 200
        assert events(response)[-1]['data']['status'] == ('success' if mode in {'valid', 'tls-false'} else 'failed')
        if mode == 'tls-false':
            assert '[WARN]' in response.get_data(as_text=True)
    assert 'fixture-secret' not in response.get_data(as_text=True)


def test_selected_vault_and_inline_override(client, monkeypatch):
    import server
    monkeypatch.setattr(server, '_load_global_config_data', vault)
    monkeypatch.setattr(server, '_lookup_credential_ref', lambda ref: ('wrong', 'fallback-secret', ''))
    config = dict(intent(), **vault())
    assert server._pe_login_title_resolver(config)('admin_ref') == ('admin', 'fixture-secret')
    config['vault_to_use'] = 'cyberark'
    with pytest.raises(ValueError):
        server._pe_login_title_resolver(config)('admin_ref')


@pytest.mark.parametrize('endpoint', ['/api/execute', '/api/jobs'])
@pytest.mark.parametrize('action', [SID, 'config-cluster'])
def test_admin_script_needs_no_new_confirmation(client, auth_headers, monkeypatch, endpoint, action):
    import server
    assert SID in server.ALLOWED_SCRIPTS and SID not in server.DESTRUCTIVE_SCRIPT_IDS
    assert SID in server.PIPELINE_SCRIPT_IDS
    assert server._normalize_script_ids([SID, 'AcceptEulaPe'])[1]
    calls = []
    def submit(payload, user):
        calls.append(payload)
        return {'id': 'fixture-job'}
    monkeypatch.setattr(server._job_manager, 'submit', submit)
    monkeypatch.setattr(server._job_manager, 'stream_events', lambda job: iter([]))
    approval_calls = []
    def approval(data, settings):
        approval_calls.append(data)
        return None, None
    monkeypatch.setattr(server, '_validate_workflow_approval', approval)
    payload = {'configContent': yaml.safe_dump(intent())}
    payload['workflow' if action == 'config-cluster' else 'script'] = action
    response = client.post(endpoint, headers=auth_headers, json=payload)
    assert response.status_code in {200, 202}
    assert len(calls) == 1
    assert calls[0]['workflow' if action == 'config-cluster' else 'script'] == action
    assert len(approval_calls) == 1


@pytest.mark.parametrize("pipeline_action", [SID, "config-cluster"])
def test_operator_blocked_for_scripts_config_cluster_and_pipeline(client, auth_headers, monkeypatch, pipeline_action):
    import server
    monkeypatch.setattr(server, "_approval_automation_error", lambda workflow: None)
    response = client.post('/api/users', headers=auth_headers, json={
        'username': 'title-operator', 'password': 'FixtureOnly123!', 'role': 'operator'})
    assert response.status_code == 201
    login = client.post('/api/auth/login', json={'username': 'title-operator', 'password': 'FixtureOnly123!'})
    headers = {'Authorization': 'Bearer ' + login.get_json()['token']}
    ack = {'riskAcknowledged': True, 'destructiveConfirmation': 'RUN ' + SID}
    for endpoint in ['/api/execute', '/api/jobs']:
        for action in [{'script': SID}, {'workflow': 'config-cluster'}]:
            for dry in [True, False]:
                response = client.post(endpoint, headers=headers, json={
                    **ack, **action, 'dryRun': dry, 'configContent': yaml.safe_dump(intent())})
                assert response.status_code == 403
    folder = server.get_configs_dir()
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'title.yml').write_text(yaml.safe_dump(intent()))
    pipeline = client.post('/api/pipelines', headers=headers, json={'name': 'title', 'steps': [
        {'workflow': pipeline_action, 'configFile': 'title.yml'}]}).get_json()
    response = client.post('/api/pipelines/' + pipeline['id'] + '/run', headers=headers, json=ack)
    assert response.status_code == 400
    assert 'Only an Orchestrator administrator' in response.get_json()['error']


@pytest.mark.parametrize('output,status', [('', 'success'), ('[ERROR] title failed', 'failed')])
@pytest.mark.parametrize('action', [SID, 'config-cluster'])
def test_pipeline_snapshot_script_and_stop(client, auth_headers, monkeypatch, output, status, action):
    import server
    config = intent()
    folder = server.get_configs_dir()
    folder.mkdir(parents=True, exist_ok=True)
    original = folder / 'title.yml'
    original.write_text(yaml.safe_dump(config))
    commands = []
    class Process:
        returncode = 0
        def __init__(self):
            self.stdout, self.stderr = iter([output]), iter([])
        def wait(self): pass
        def kill(self): pass
        def poll(self): return 0
    def popen(command, **kwargs):
        if action in command:
            snapshot = Path(command[-1])
            assert snapshot != original
            assert yaml.safe_load(snapshot.read_text()) == config
        commands.append(command)
        return Process()
    monkeypatch.setattr(server.subprocess, 'Popen', popen)
    monkeypatch.setattr(server, '_approval_automation_error', lambda workflow: None)
    pipeline = client.post('/api/pipelines', headers=auth_headers, json={'name': 'title', 'steps': [
        {'workflow': action, 'configFile': 'title.yml'}, {'workflow': 'pod-config', 'configFile': ''}]}).get_json()
    response = client.post('/api/pipelines/' + pipeline['id'] + '/run', headers=auth_headers, json={'riskAcknowledged': True})
    assert response.status_code == 200
    streamed = events(response)
    assert commands[0][2:4] == ['--workflow' if action == 'config-cluster' else '--script', action]
    assert next(e for e in streamed if e['type'] == 'pipeline_done')['data']['status'] == status
    assert len(commands) == (1 if status == 'failed' else 2)
    assert not Path(commands[0][-1]).exists()


def test_schedule_and_invalid_pipeline_intent(client, auth_headers):
    import server
    assert 'cannot be scheduled' in server._schedule_validation_error({'script': SID})
    folder = server.get_configs_dir()
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'title.yml').write_text('clusters: {}')
    pipeline = client.post('/api/pipelines', headers=auth_headers, json={'name': 'title', 'steps': [
        {'workflow': SID, 'configFile': 'title.yml'}]}).get_json()
    url = '/api/pipelines/' + pipeline['id'] + '/run'
    assert client.post(url, headers=auth_headers, json={'dryRun': True}).status_code == 400
    assert client.post(url, headers=auth_headers, json={
        'riskAcknowledged': True, 'destructiveConfirmation': 'RUN ' + SID}).status_code == 400


@pytest.fixture
def adapter(monkeypatch):
    class Script:
        def __init__(self, **kwargs):
            self.logger, self.results, self.exceptions = None, {}, []
        def run(self, **kwargs):
            try:
                self.execute()
                self.verify()
            except Exception as exc:
                self.exceptions.append(str(exc))
            return self.results
    def read_creds(*, data, credential):
        assert credential == 'admin_ref'
        return 'admin', 'fixture-secret'
    modules = {
        'framework.helpers.helper_functions': {'read_creds': read_creds},
        'framework.helpers.pe_login_title': dict(vars(core)),
        'framework.scripts.python.script': {'Script': Script},
        'framework.helpers.log_utils': {'get_logger': lambda name: logging.getLogger(name)},
    }
    for name, attributes in modules.items():
        module = types.ModuleType(name)
        module.__dict__.update(attributes)
        monkeypatch.setitem(sys.modules, name, module)
    return load(ROOT / 'scripts/ztf_set_prism_login_title_pe.py', 'title_adapter')


def test_adapter_safe_results_and_errors(adapter, monkeypatch, caplog):
    expected = {HOST: {'Prism_Login_Title': 'PASS', 'changed': True, 'previous_title': None,
                       'requested_title': 'Operations', 'verified_title': 'Operations'}}
    def configure(data, resolve, emit):
        assert resolve('admin_ref') == ('admin', 'fixture-secret')
        return expected
    monkeypatch.setattr(adapter, 'configure', configure)
    assert adapter.SetPrismLoginTitlePe(intent()).run() == {'clusters': expected}
    for error in [RuntimeError('fixture-secret'), core.LoginTitleError('failure', '[PE-TITLE] stage=verification category=failure')]:
        def fail(*args):
            raise error
        monkeypatch.setattr(adapter, 'configure', fail)
        script = adapter.SetPrismLoginTitlePe(intent())
        with caplog.at_level(logging.ERROR), pytest.raises(SystemExit) as exc:
            script.run()
        assert exc.value.code == 1
        assert script.results['Prism_Login_Title'] == 'FAIL'
        assert 'fixture-secret' not in caplog.text + str(script.exceptions)
        if isinstance(error, core.LoginTitleError):
            assert 'stage=verification category=failure' in caplog.text


def test_runtime_patch_idempotence_and_early_branch(tmp_path, monkeypatch, adapter):
    patcher = load(ROOT / 'scripts/patch_ztf_runtime.py', 'title_patcher')
    monkeypatch.setattr(patcher, 'RUNTIME_ROOT', tmp_path)
    for folder in ['framework/helpers', 'framework/scripts/python/pe/create', 'framework/scripts/python/pe/other_ops']:
        (tmp_path / folder).mkdir(parents=True, exist_ok=True)
    registry = tmp_path / 'framework/scripts/python/__init__.py'
    registry.write_text('__all__ = []\n')
    main = tmp_path / 'main.py'
    main.write_text('def main(input_scripts, scripts):\n    pre_run_actions = []\n    try:\n        if input_scripts:\n            pre_run_actions += [create_pe_objects, create_pc_objects, create_ipam_object]\n        wf_handler.run_functions(pre_run_actions)\n    except Exception as e:\n        logger.error(e)\n    finally:\n        pass\n')
    cluster = tmp_path / 'framework/scripts/python/pe/configure_cluster.py'
    cluster.write_text('class ClusterConfig:\n    def execute(self):\n        create_pe_objects(self.data, global_data=self.global_data)\n        self.legacy_reached = True\n')
    patcher.patch_pe_local_users()
    patcher.patch_pe_login_title()
    first = [p.read_text() for p in (registry, main, cluster)]
    patcher.patch_pe_local_users()
    patcher.patch_pe_login_title()
    assert first == [p.read_text() for p in (registry, main, cluster)]
    for text in first:
        ast.parse(text)
    assert first[0].count('__all__.append("SetPrismLoginTitlePe")') == 1
    assert 'if input_scripts not in ([CreateLocalUsersPe], [SetPrismLoginTitlePe]):' in first[1]
    assert 'if CreateLocalUsersPe in scripts or SetPrismLoginTitlePe in scripts:' in first[1]
    assert (tmp_path / 'framework/helpers/pe_login_title.py').read_text() == (ROOT / 'pe_login_title.py').read_text()
    # Exercise the generated CLI dispatch itself: input must be loaded before
    # title intent is detected, with credentials and schema validation retained.
    tree = ast.parse(first[1])
    dispatch = next(node for node in ast.walk(tree) if isinstance(node, ast.If)
                    and ast.unparse(node.test) == "workflow_type == 'config-cluster'")
    for workflow_name, title_request in [('config-cluster', True), ('config-cluster', False), ('other', True)]:
        actions = []
        handler = types.SimpleNamespace(data={})
        def get_input_data(data):
            actions.append('input')
            data.update(intent() if title_request else {'clusters': {HOST: {'name': 'fixture'}}})
        def creds(data): actions.append('credentials')
        def validate(data): actions.append('schema')
        def pe(data): actions.append('pe')
        def pc(data): actions.append('pc')
        def ipam(data): actions.append('ipam')
        handler.run_functions = lambda functions: [function(handler.data) for function in functions]
        context = dict(workflow_type=workflow_name, wf_handler=handler, get_input_data=get_input_data,
                       create_pe_objects=pe, create_pc_objects=pc, create_ipam_object=ipam,
                       pre_run_actions=[get_input_data, creds, validate, pe, pc, ipam])
        exec(compile(ast.Module(body=[dispatch], type_ignores=[]), '<main-dispatch>', 'exec'), context)
        assert actions == (['input', 'credentials', 'schema'] if workflow_name == 'config-cluster' and title_request
                           else ['input', 'credentials', 'schema', 'pe', 'pc', 'ipam'])
    monkeypatch.setitem(sys.modules, 'framework.scripts.python.pe.other_ops.set_prism_login_title_pe', adapter)
    namespace = {'create_pe_objects': lambda *a, **k: pytest.fail('legacy preparation reached')}
    exec(compile(cluster.read_text(), str(cluster), 'exec'), namespace)
    cls = namespace['ClusterConfig']
    monkeypatch.setattr(adapter, 'configure', lambda data, resolve, emit: (
        core.prepare_credentials(data, resolve), {HOST: {'Prism_Login_Title': 'PASS'}})[1])
    obj = cls()
    obj.data, obj.global_data, obj.results = intent(), vault(), {}
    obj.execute()
    assert obj.results == obj.data['json_output'] == {'clusters': {HOST: {'Prism_Login_Title': 'PASS'}}}
    assert obj.data['vault_to_use'] == 'local' and not hasattr(obj, 'legacy_reached')
    for invalid in [dict(intent(), prism_login_title='root-typo'), {'clusters': {HOST: {
        'name': 'fixture', 'pe_credential': 'admin_ref', 'prism_login_title': 'Operations', 'pulse': True}}}]:
        obj = cls()
        obj.data, obj.global_data, obj.results = invalid, vault(), {}
        with pytest.raises(SystemExit) as exc:
            obj.execute()
        assert exc.value.code == 1 and not hasattr(obj, 'legacy_reached')


def test_docker_copies_before_runtime_patch():
    docker = (ROOT / 'Dockerfile').read_text()
    for source in ['pe_login_title.py', 'scripts/ztf_set_prism_login_title_pe.py']:
        assert docker.index('COPY ' + source) < docker.index('RUN python /tmp/patch_ztf_runtime.py')


@pytest.mark.parametrize('endpoint', ['/api/execute', '/api/jobs'])
@pytest.mark.parametrize('action', [SID, 'config-cluster'])
def test_invalid_mixed_mutation_returns_400(client, auth_headers, endpoint, action):
    config = intent()
    config['clusters'][HOST]['pulse'] = True
    payload = {'configContent': yaml.safe_dump(config)}
    payload['workflow' if action == 'config-cluster' else 'script'] = action
    assert client.post(endpoint, headers=auth_headers, json=payload).status_code == 400


def test_worker_rechecks_title_admin_before_launch(client, monkeypatch):
    import server
    calls = []
    monkeypatch.setattr(server, '_find_user', lambda user: {'role': 'operator'})
    monkeypatch.setattr(server._job_manager, '_emit', lambda *args: calls.append(args))
    monkeypatch.setattr(server._job_manager, '_set_diagnostics', lambda *a, **k: None)
    monkeypatch.setattr(server.subprocess, 'Popen', lambda *a, **k: pytest.fail('operator launched title runtime'))
    server._job_manager._run_job('fixture-job', {
        'workflow': 'config-cluster', 'configContent': yaml.safe_dump(intent())}, 'operator')
    assert any('require an administrator' in str(args) for args in calls)
