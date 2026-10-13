import json
import sys
import types
from unittest.mock import Mock

import pytest
import yaml

import credential_rotation as r


def intent():
    return {'aos_version': '7.5.1.8', 'cvms': [
        {'address': '192.0.2.10', 'current_credential_ref': 'cvm_old',
         'replacement_credential_ref': 'cvm_new', 'ssh_host_key_sha256': 'SHA256:' + 'a' * 43}],
        'idracs': [{'address': '192.0.2.20', 'current_credential_ref': 'bmc_old',
                    'replacement_credential_ref': 'bmc_new'}], 'idrac_followup_acknowledged': True}


CREDS = {'cvm_old': ('nutanix', 'Old!123'), 'cvm_new': ('nutanix', 'New!123'),
         'bmc_old': ('root', 'Old!456'), 'bmc_new': ('root', 'New!456')}


def fake_ssh(*args):
    return {'ok': True, 'addresses': ['192.0.2.10']}


@pytest.mark.parametrize('alter', [
    lambda c: c.update(password='secret'),
    lambda c: c.update(aos_version='6.10'),
    lambda c: c['cvms'][0].update(ssh_host_key_sha256=''),
    lambda c: c['idracs'][0].update(address='https://evil.invalid/path'),
    lambda c: c.update(idrac_followup_acknowledged=False),
    lambda c: c['cvms'][0].update(current_credential_ref=[]),
    lambda c: c['cvms'].append(c['cvms'][0].copy()),
    lambda c: c.update(cvms=[], idracs=[]),
])
def test_invalid_intents(alter):
    config = intent()
    alter(config)
    assert r.validate_intent(config)


def test_reference_only_intent_and_credential_validation():
    config = intent()
    assert r.validate_intent(config) == []
    assert r.resolve_credentials(config, lambda ref: (*CREDS[ref], '')) == CREDS
    for bad in ('bad\nvalue', 'bad\x03value', 'bad\x7fvalue'):
        with pytest.raises(ValueError):
            r.resolve_credentials(config, lambda ref: (CREDS[ref][0], bad, ''))
    with pytest.raises(ValueError):
        r.resolve_credentials(config, lambda ref: ('admin', CREDS[ref][1], ''))


def test_success_single_cvm_mutation_and_sequential_idrac_verification(monkeypatch):
    monkeypatch.setattr(r.time, 'sleep', lambda _: None)
    ssh = Mock(side_effect=fake_ssh)
    rf = Mock(return_value={'UserName': 'root'})
    lines = []
    ok, results = r.execute(intent(), CREDS, 'python', lines.append, ssh=ssh, rf=rf,
                            account_lookup=lambda *args: '/redfish/v1/AccountService/Accounts/7')
    assert ok
    assert [x['status'] for x in results] == ['verified', 'verified']
    assert sum(call.args[3] == 'change' for call in ssh.call_args_list) == 1
    assert rf.call_args_list[0].args[3:] == ('PATCH', {'Password': CREDS['bmc_new'][1]})
    assert rf.call_args_list[1].args[1] == CREDS['bmc_new']
    assert 'ACTION REQUIRED' in '\n'.join(lines)
    assert all(password not in '\n'.join(lines) for _, password in CREDS.values())


def test_preflight_failure_prevents_all_mutations():
    ssh = Mock(side_effect=fake_ssh)
    rf = Mock()
    lookup = Mock(side_effect=RuntimeError('secret-in-error'))
    lines = []
    ok, results = r.execute(intent(), CREDS, 'python', lines.append, ssh=ssh, rf=rf, account_lookup=lookup)
    assert not ok and not results
    assert not any(call.args[3] == 'change' for call in ssh.call_args_list)
    rf.assert_not_called()
    assert 'secret-in-error' not in '\n'.join(lines)


def test_partial_rotation_stops_and_preserves_uncertain_state(monkeypatch):
    monkeypatch.setattr(r.time, 'sleep', lambda _: None)
    config = intent()
    config['idracs'].append({**config['idracs'][0], 'address': '192.0.2.21'})
    rf = Mock(side_effect=RuntimeError('Password=secret'))
    lines = []
    ok, results = r.execute(config, CREDS, 'python', lines.append, ssh=fake_ssh, rf=rf,
                            account_lookup=lambda *args: '/redfish/v1/AccountService/Accounts/7')
    assert not ok
    assert [x['status'] for x in results] == ['verified', 'change_attempted']
    assert rf.call_count == 1
    assert 'Password=secret' not in '\n'.join(lines)


def test_dry_run_is_read_only_and_inventory_mismatch_blocks_change():
    ssh = Mock(side_effect=fake_ssh)
    rf = Mock()
    ok, results = r.execute(intent(), CREDS, 'python', lambda _: None, ssh=ssh, rf=rf,
                            account_lookup=lambda *args: 'account', dry_run=True)
    assert ok and not results
    rf.assert_not_called()
    assert not any(call.args[3] == 'change' for call in ssh.call_args_list)
    ssh = Mock(return_value={'ok': True, 'addresses': ['192.0.2.99']})
    ok, _ = r.execute(intent(), CREDS, 'python', lambda _: None, ssh=ssh)
    assert not ok
    assert not any(call.args[3] == 'change' for call in ssh.call_args_list)


@pytest.mark.parametrize('path', ['https://evil.invalid/redfish/v1/', '//evil.invalid/redfish/v1/',
                                  '/redfish/v1/../secrets', '/redfish/v1/Accounts?redirect=x'])
def test_redfish_rejects_foreign_links(path):
    with pytest.raises(ValueError):
        r.redfish('192.0.2.20', CREDS['bmc_old'], path)


def test_ssh_secrets_use_stdin_only_and_child_errors_are_suppressed(monkeypatch):
    run = Mock(return_value=Mock(returncode=0, stdout='{"ok":true}'))
    monkeypatch.setattr(r.subprocess, 'run', run)
    r.ssh_request('existing-python', intent()['cvms'][0], CREDS['cvm_old'], 'change', 'new-secret')
    args, kwargs = run.call_args
    assert args[0][0] == 'existing-python'
    assert 'new-secret' not in json.dumps(args)
    assert json.loads(kwargs['input'])['replacement'] == 'new-secret'
    run.return_value = Mock(returncode=1, stdout='secret', stderr='new-secret')
    with pytest.raises(RuntimeError, match='CVM SSH operation failed') as caught:
        r.ssh_request('python', intent()['cvms'][0], CREDS['cvm_old'], 'verify')
    assert 'new-secret' not in str(caught.value)


def test_ssh_worker_enforces_pin_and_interactive_password_exchange(monkeypatch):
    class Channel:
        def __init__(self):
            self.output = [b'[sudo] password for nutanix:', b'New password:',
                           b'Retype new password:', b'passwd: all authentication tokens updated successfully.']
            self.sent = []
        def get_pty(self):
            pass
        def exec_command(self, command):
            assert command == 'LC_ALL=C sudo passwd nutanix'
            assert 'New!123' not in command
        def recv_ready(self):
            return bool(self.output)
        def recv(self, size):
            return self.output.pop(0)
        def sendall(self, value):
            self.sent.append(value)
        def exit_status_ready(self):
            return not self.output
        def recv_exit_status(self):
            return 0
    channel = Channel()
    client = Mock()
    client.get_transport.return_value.open_session.return_value = channel
    module = types.SimpleNamespace(SSHClient=lambda: client, MissingHostKeyPolicy=object)
    monkeypatch.setitem(sys.modules, 'paramiko', module)
    monkeypatch.setattr(r.time, 'sleep', lambda _: None)
    data = {'node': intent()['cvms'][0], 'credential': CREDS['cvm_old'],
            'action': 'change', 'replacement': CREDS['cvm_new'][1]}
    assert r.ssh_worker(data) == {'ok': True}
    assert channel.sent == ['Old!123\n', 'New!123\n', 'New!123\n']
    assert client.connect.call_args.kwargs['allow_agent'] is False
    assert client.connect.call_args.kwargs['look_for_keys'] is False
    client.close.assert_called_once()
    policy = client.set_missing_host_key_policy.call_args.args[0]
    key = Mock()
    key.asbytes.return_value = b'untrusted-key'
    with pytest.raises(RuntimeError, match='host key mismatch'):
        policy.missing_host_key(client, '192.0.2.10', key)
    import base64
    import hashlib
    data['node']['ssh_host_key_sha256'] = 'SHA256:' + base64.b64encode(hashlib.sha256(b'untrusted-key').digest()).decode().rstrip('=')
    policy.missing_host_key(client, '192.0.2.10', key)


def test_redfish_account_discovery_never_assumes_user_id(monkeypatch):
    def read(address, credentials, path):
        return {
            '/redfish/v1/Managers': {'Members': [{'@odata.id': '/redfish/v1/Managers/iDRAC.Embedded.1'}]},
            '/redfish/v1/': {'AccountService': {'@odata.id': '/redfish/v1/AccountService'}},
            '/redfish/v1/AccountService': {'Accounts': {'@odata.id': '/redfish/v1/AccountService/Accounts'}},
            '/redfish/v1/AccountService/Accounts': {'Members': [{'@odata.id': '/redfish/v1/AccountService/Accounts/7'}]},
            '/redfish/v1/AccountService/Accounts/7': {'UserName': 'root', 'Enabled': True},
        }[path]
    monkeypatch.setattr(r, 'redfish', read)
    assert r.idrac_account(intent()['idracs'][0], CREDS['bmc_old']).endswith('/7')
    def require_action(*args):
        result = read(*args)
        return {**result, 'RequireChangePasswordAction': True} if args[2].endswith('AccountService') else result
    monkeypatch.setattr(r, 'redfish', require_action)
    with pytest.raises(RuntimeError, match='unsupported ChangePassword'):
        r.idrac_account(intent()['idracs'][0], CREDS['bmc_old'])


def approved(server, content):
    server._require_engines()
    approval = server._approval_manager.create_request(r.WORKFLOW, 'rotation.yml', content, 'requester')
    server._approval_manager.decide(approval['id'], 'approved', 'reviewer')
    return approval['id']


def test_api_requires_admin_exact_confirmation_and_exact_approval(client, auth_headers, monkeypatch):
    import server
    content = yaml.safe_dump(intent())
    body = {'workflow': r.WORKFLOW, 'configFile': 'rotation.yml', 'configContent': content}
    assert client.post('/api/jobs', json=body, headers=auth_headers).status_code == 403
    body['destructiveConfirmation'] = r.CONFIRMATION
    # General approval settings cannot disable this workflow's gate.
    monkeypatch.setattr(server, 'get_settings', lambda: {'approvalRequiredWorkflows': []})
    assert server._workflow_requires_approval(r.WORKFLOW)
    assert client.post('/api/jobs', json=body, headers=auth_headers).status_code == 403
    body['approvalId'] = approved(server, content)
    error, _, _ = server._rotation_submission(body, 'operator')
    assert 'administrator' in error
    changed = {**body, 'configContent': content + '\n# changed'}
    assert client.post('/api/jobs', json=changed, headers=auth_headers).status_code == 403
    submit = Mock(return_value={'id': 'rotation-job', 'status': 'queued'})
    monkeypatch.setattr(server._job_manager, 'submit', submit)
    response = client.post('/api/jobs', json=body, headers=auth_headers)
    assert response.status_code == 202
    assert submit.call_args.args[0]['configContent'] == content
    assert client.post('/api/jobs', json=body, headers=auth_headers).status_code == 403


def test_api_dry_run_valid_and_invalid_intents(client, auth_headers, monkeypatch):
    import server
    submit = Mock(return_value={'id': 'dry-job', 'status': 'queued'})
    monkeypatch.setattr(server._job_manager, 'submit', submit)
    body = {'workflow': r.WORKFLOW, 'configContent': yaml.safe_dump(intent()), 'dryRun': True}
    assert client.post('/api/jobs', json=body, headers=auth_headers).status_code == 202
    assert submit.call_args.args[0]['dryRun'] is True
    body['configContent'] = 'aos_version: invalid\npassword: forbidden'
    assert client.post('/api/jobs', json=body, headers=auth_headers).status_code == 403
    assert submit.call_count == 1


def test_worker_smoke_runs_guarded_job_and_persists_safe_results(client, auth_headers, monkeypatch):
    import server
    server._job_manager.stop()
    monkeypatch.setattr(server, '_job_manager', server.ExecutionJobManager(0))
    content = yaml.safe_dump(intent())
    body = {'workflow': r.WORKFLOW, 'configFile': 'rotation.yml', 'configContent': content,
            'destructiveConfirmation': r.CONFIRMATION, 'approvalId': approved(server, content)}
    monkeypatch.setattr(server, '_lookup_credential_ref', lambda ref: (*CREDS[ref], ''))
    monkeypatch.setattr(r, 'execute', lambda config, credentials, python_path, emit, **kwargs:
                        (True, [{'target': '192.0.2.10', 'status': 'verified'}]))
    response = client.post('/api/jobs', json=body, headers=auth_headers)
    assert response.status_code == 202
    job_id = response.get_json()['id']
    server._job_manager._run_job(job_id, server._job_manager.get_payload(job_id), 'admin')
    job = server._job_manager.get_job(job_id)
    assert job['status'] == 'success'
    assert job['diagnostics']['targets'][0]['status'] == 'verified'
    assert job['diagnostics']['nutanixIpmiMetadataUpdated'] is False
    assert all(password not in json.dumps(job) for _, password in CREDS.values())
