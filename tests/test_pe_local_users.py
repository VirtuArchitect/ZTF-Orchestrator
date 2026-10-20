import importlib.util
import json
from pathlib import Path
import ssl
import urllib.error

import pytest

import pe_local_users as pe


def intent(count=8):
    return {'clusters': {'192.0.2.10': {'name': 'test', 'pe_credential': 'pe_user',
            'local_users': [{'username': f'ops.admin{i}', 'credential_ref': f'ops{i}'} for i in range(count)]}}}


def resolve(ref):
    if ref == 'pe_user':
        return 'admin', 'test-admin-secret'
    return 'ops.admin' + ref[3:], 'test-password-' + ref


class Client:
    instances = []

    def __init__(self, *args):
        self.accounts = {}
        self.created = []
        self.__class__.instances.append(self)

    def users(self):
        return {name: {'profile': {'username': name}} for name in self.accounts}

    def roles(self, name):
        return set(self.accounts[name])

    def create(self, user, password):
        self.created.append(user['username'])
        self.accounts[user['username']] = list(pe.ADMIN_ROLES)


def test_eight_users_and_idempotent_rerun():
    client = Client()
    messages = []
    run = lambda: pe.provision(intent(), resolve, messages.append, lambda *args: client)
    result = run()
    assert len(result['192.0.2.10']) == 8
    assert len(client.created) == 8
    assert run() == result
    assert len(client.created) == 8
    assert 'password-' not in str(messages)
    assert 'password unchanged' in messages[-1]


@pytest.mark.parametrize('value', [None, [], {}, {'clusters': []}, {'clusters': {'bad': {}}}])
def test_invalid_top_level(value):
    with pytest.raises(ValueError):
        pe.validate_intent(value)


@pytest.mark.parametrize('change', [
    lambda c: c.pop('pe_credential'),
    lambda c: c.update(local_users=[]),
    lambda c: c['local_users'][0].update(password='do-not-allow'),
    lambda c: c['local_users'][0].update(username='admin'),
    lambda c: c['local_users'][0].update(username='../escape'),
    lambda c: c['local_users'][0].update(username='name\nlog'),
    lambda c: c['local_users'][0].update(credential_ref='pe_user'),
    lambda c: c['local_users'][1].update(credential_ref='ops0'),
    lambda c: c['local_users'][1].update(username='OPS.ADMIN0'),
    lambda c: c['local_users'][0].update(first_name=[]),
])
def test_invalid_users_before_any_network(change):
    config = intent()
    change(config['clusters']['192.0.2.10'])
    with pytest.raises(ValueError):
        pe.provision(config, resolve, print, lambda *args: pytest.fail('network must not start'))


@pytest.mark.parametrize('mode', ['missing', 'mismatch', 'shared', 'empty'])
def test_all_credentials_validated_before_mutation(mode):
    def lookup(ref):
        if ref == 'ops7':
            if mode == 'missing':
                raise RuntimeError('contains-secret')
            if mode == 'mismatch':
                return 'wrong', 'contains-secret'
            if mode == 'shared':
                return 'ops.admin7', resolve('ops0')[1]
            return 'ops.admin7', ''
        return resolve(ref)
    with pytest.raises(ValueError, match='Credential resolution failed') as exc:
        pe.provision(intent(), lookup, print, lambda *args: pytest.fail('network must not start'))
    assert 'contains-secret' not in str(exc.value)


def test_existing_non_admin_is_not_elevated_or_reset():
    client = Client()
    client.accounts['ops.admin7'] = ['ROLE_CLUSTER_VIEWER']
    with pytest.raises(RuntimeError, match='no existing account will be elevated'):
        pe.provision(intent(), resolve, print, lambda *args: client)
    assert not client.created


def test_verification_failure_stops_remaining_users():
    client = Client()
    def create(user, password):
        client.created.append(user['username'])
        client.accounts[user['username']] = []
    client.create = create
    with pytest.raises(RuntimeError, match='verification failed'):
        pe.provision(intent(), resolve, print, lambda *args: client)
    assert len(client.created) == 1


def test_verified_transport_exact_paths_and_no_redirect(monkeypatch):
    captured = []
    def opener(*handlers):
        captured.extend(handlers)
        return object()
    monkeypatch.setattr(pe.urllib.request, 'build_opener', opener)
    client = pe.PeUsersClient('192.0.2.10', 'admin', 'fixture-only')
    tls = next(h for h in captured if isinstance(h, pe.urllib.request.HTTPSHandler))
    assert tls._context.verify_mode == ssl.CERT_REQUIRED
    assert tls._context.check_hostname
    assert next(h for h in captured if isinstance(h, pe.urllib.request.ProxyHandler)).proxies == {}
    redirect = next(h for h in captured if isinstance(h, pe.urllib.request.HTTPRedirectHandler))
    assert redirect.redirect_request(None, None, 302, '', {}, 'https://example.test') is None
    calls = []
    client.request = lambda *args, **kwargs: calls.append((args, kwargs))
    client.create({'username': 'ops.one'}, 'fixture-only')
    assert calls[0][0] == ('POST',)
    assert calls[0][1]['payload']['profile']['username'] == 'ops.one'
    assert calls[1] == (('POST', '/ops.one/roles', pe.ADMIN_ROLES), {})


@pytest.mark.parametrize('error', [urllib.error.HTTPError('https://example.test', 403, 'secret', {}, None),
                                 urllib.error.URLError('secret'), ssl.SSLError('secret')])
def test_transport_errors_do_not_disclose_secrets(error):
    client = pe.PeUsersClient('192.0.2.10', 'admin', 'fixture-only')
    class Opener:
        def open(self, *args, **kwargs):
            raise error
    client.opener = Opener()
    with pytest.raises(RuntimeError) as exc:
        client.request('GET')
    assert 'secret' not in str(exc.value)


@pytest.mark.parametrize('response', [{}, {'entities': [{}]}, ['bad'], None])
def test_unknown_users_response_fails_closed(response):
    client = pe.PeUsersClient('192.0.2.10', 'admin', 'fixture-only')
    client.request = lambda *args: response
    with pytest.raises(RuntimeError, match='unsupported shape'):
        client.users()


def test_runtime_patch_registers_script_and_is_idempotent(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location('patcher', Path(__file__).parents[1] / 'scripts/patch_ztf_runtime.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, 'RUNTIME_ROOT', tmp_path)
    for folder in ['framework/helpers', 'framework/scripts/python/pe/create']:
        (tmp_path / folder).mkdir(parents=True)
    (tmp_path / 'framework/scripts/python/__init__.py').write_text('__all__ = []\n')
    (tmp_path / 'main.py').write_text('            pre_run_actions += [create_pe_objects, create_pc_objects, create_ipam_object]\n')
    module.patch_pe_local_users()
    first = (tmp_path / 'framework/scripts/python/__init__.py').read_text()
    module.patch_pe_local_users()
    assert (tmp_path / 'framework/scripts/python/__init__.py').read_text() == first
    assert 'CreateLocalUsersPe' in first
    assert (tmp_path / 'framework/helpers/pe_local_users.py').read_text() == Path(pe.__file__).read_text()


@pytest.mark.parametrize('endpoint', ['/api/jobs', '/api/execute'])
def test_direct_creation_requires_exact_confirmation(client, auth_headers, endpoint):
    response = client.post(endpoint, headers=auth_headers, json={'script': pe.SCRIPT_ID})
    assert response.status_code == 403


def test_pipeline_accepts_script_and_rejects_bad_configuration(client, auth_headers):
    import server
    response = client.post('/api/pipelines', headers=auth_headers, json={'name': 'PE users', 'steps': [
        {'workflow': pe.SCRIPT_ID, 'configFile': 'pe-users.yml'}]})
    assert response.status_code == 201
    pid = response.get_json()['id']
    ack = {'riskAcknowledged': True, 'destructiveConfirmation': 'RUN ' + pe.SCRIPT_ID}
    assert client.post(f'/api/pipelines/{pid}/run', headers=auth_headers).status_code == 400
    server.get_configs_dir().mkdir(parents=True, exist_ok=True)
    (server.get_configs_dir() / 'pe-users.yml').write_text('clusters: {}')
    assert client.post(f'/api/pipelines/{pid}/run', headers=auth_headers, json=ack).status_code == 400


def test_admin_only_gate_and_mixed_scripts(client):
    import server
    with server.app.test_request_context():
        server.request.current_user = {'role': 'operator'}
        assert 'Only an Orchestrator administrator' in server._validate_destructive_script_ack([pe.SCRIPT_ID], {})
    assert server._normalize_script_ids([pe.SCRIPT_ID, 'AcceptEulaPe'])[1]


@pytest.mark.parametrize('output,expected', [('', 'success'), ('[ERROR] CreateLocalUsersPe failed', 'failed')])
def test_pipeline_uses_script_and_stops_on_failure(client, auth_headers, monkeypatch, output, expected):
    import server
    commands = []
    server.get_configs_dir().mkdir(parents=True, exist_ok=True)
    (server.get_configs_dir() / 'pe-users.yml').write_text(json.dumps(intent()))
    class Process:
        returncode = 0
        def __init__(self):
            self.stdout, self.stderr = iter([output]), iter([])
        def wait(self): pass
        def kill(self): pass
        def poll(self): return 0
    def popen(command, **kwargs):
        if pe.SCRIPT_ID in command:
            snapshot = Path(command[-1])
            assert snapshot != server.get_configs_dir() / 'pe-users.yml'
            assert json.loads(snapshot.read_text()) == intent()
        commands.append(command)
        return Process()
    monkeypatch.setattr(server.subprocess, 'Popen', popen)
    response = client.post('/api/pipelines', headers=auth_headers, json={'name': 'PE users', 'steps': [
        {'workflow': pe.SCRIPT_ID, 'configFile': 'pe-users.yml'},
        {'workflow': 'pod-config', 'configFile': ''}]})
    pid = response.get_json()['id']
    response = client.post(f'/api/pipelines/{pid}/run', headers=auth_headers, json={
        'riskAcknowledged': True, 'destructiveConfirmation': 'RUN ' + pe.SCRIPT_ID})
    events = [json.loads(line[6:]) for line in response.get_data(as_text=True).splitlines() if line.startswith('data: ')]
    assert commands[0][2:4] == ['--script', pe.SCRIPT_ID]
    assert next(event for event in events if event['type'] == 'pipeline_done')['data']['status'] == expected
    assert len(commands) == (1 if expected == 'failed' else 2)
    assert not Path(commands[0][-1]).exists()


@pytest.mark.parametrize('valid', [True, False])
def test_dry_run_checks_references_without_contacting_pe(client, auth_headers, monkeypatch, valid):
    import server
    import yaml
    monkeypatch.setattr(server, '_lookup_credential_ref', lambda ref: (*resolve(ref), '') if valid else (None, None, 'missing'))
    monkeypatch.setattr(pe.PeUsersClient, '__init__', lambda *args: pytest.fail('dry run contacted PE'))
    response = client.post('/api/execute', headers=auth_headers, json={
        'script': pe.SCRIPT_ID, 'dryRun': True, 'configContent': yaml.safe_dump(intent()),
        'riskAcknowledged': True, 'destructiveConfirmation': 'RUN ' + pe.SCRIPT_ID})
    events = [json.loads(line[6:]) for line in response.get_data(as_text=True).splitlines() if line.startswith('data: ')]
    assert events[-1]['data']['status'] == ('success' if valid else 'failed')
    assert 'test-password-' not in response.get_data(as_text=True)


def test_operator_cannot_create_pe_admins_directly_or_in_pipeline(client, auth_headers):
    response = client.post('/api/users', headers=auth_headers, json={
        'username': 'fixture-operator', 'password': 'FixtureOnly123!', 'role': 'operator'})
    assert response.status_code == 201
    login = client.post('/api/auth/login', json={'username': 'fixture-operator', 'password': 'FixtureOnly123!'})
    headers = {'Authorization': 'Bearer ' + login.get_json()['token']}
    body = {'script': pe.SCRIPT_ID, 'riskAcknowledged': True, 'destructiveConfirmation': 'RUN ' + pe.SCRIPT_ID}
    for endpoint in ['/api/jobs', '/api/execute']:
        assert client.post(endpoint, headers=headers, json=body).status_code == 403
    pipeline = client.post('/api/pipelines', headers=headers, json={'name': 'users', 'steps': [
        {'workflow': pe.SCRIPT_ID, 'configFile': 'pe-users.yml'}]}).get_json()
    response = client.post(f'/api/pipelines/{pipeline["id"]}/run', headers=headers, json=body)
    assert response.status_code == 400
    assert 'Only an Orchestrator administrator' in response.get_json()['error']
