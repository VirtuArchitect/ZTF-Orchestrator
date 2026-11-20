"""Offline safety/contract tests. No live SSH or vendor certification implied."""
import base64
import copy
import hashlib
import json
import sys
import types
from unittest.mock import Mock

import pytest

import initial_password_setup as m


@pytest.fixture(autouse=True)
def isolated_data_dir(monkeypatch):
    # This pure module suite does not need conftest's unrelated server runtime.
    monkeypatch.setattr(m.time, 'sleep', lambda _: None)
    yield


PIN = 'SHA256:' + 'A' * 43
CREDS = {'co': ('nutanix', 'CvmOld!7'), 'cn': ('nutanix', 'CvmNew!8'),
         'access': ('admin', 'AccessOld!4'), 'ao': ('admin', 'AccessOld!4'),
         'an': ('admin', 'AccessNew!5'), 'ro': ('root', 'RootOld!1'),
         'rn': ('root', 'RootNew!2')}


def intent():
    return {'cluster_name': 'example', 'host_key_evidence': 'Independent console verification',
            'cvms': [{'address': address, 'ssh_host_key_sha256': PIN,
                      'current_credential_ref': 'co', 'replacement_credential_ref': 'cn'}
                     for address in ('192.0.2.10', '192.0.2.11')],
            'hosts': [{'address': '192.0.2.20', 'ssh_host_key_sha256': PIN,
                       'access_credential_ref': 'access', 'accounts': [
                           {'username': 'root', 'current_credential_ref': 'ro', 'replacement_credential_ref': 'rn'},
                           {'username': 'admin', 'current_credential_ref': 'ao', 'replacement_credential_ref': 'an'}]}]}


class Lab:
    def __init__(self, config=None):
        self.config = config or intent()
        self.calls = []
        self.changed = set()
        self.fail = None
        self.mutate = lambda node, action, result: None
        self.restrict_root = False
        self.deny_admin_ssh = False

    def __call__(self, python, node, credential, action, replacement=None):
        self.calls.append((copy.deepcopy(node), credential, action, replacement))
        if node['role'] == 'host':
            if (self.restrict_root and credential[0] == 'root'
                    and ('host', node['address'], 'root') in self.changed):
                raise RuntimeError('Root SSH restricted after initial password setup')
            if self.deny_admin_ssh and credential == CREDS['an']:
                raise RuntimeError('Admin replacement SSH denied')
        if self.fail and self.fail(node, action):
            raise RuntimeError('CvmOld!7 secret transport output')
        result = {'ok': True, 'identity': 'a' * 32 + ':' + PIN,
                  'version': '7.5.1.8' if node['role'] == 'cvm' else '11.0.1.3-23',
                  'cvms': [n['address'] for n in self.config['cvms']],
                  'hosts': [n['address'] for n in self.config['hosts']]}
        key = (node['role'], node['address'], node['account'])
        selected = credential if node['role'] == 'cvm' else node['account_credential']
        new = CREDS['cn' if node['role'] == 'cvm' else 'an' if node['account'] == 'admin' else 'rn']
        old = CREDS['co' if node['role'] == 'cvm' else 'ao' if node['account'] == 'admin' else 'ro']
        if action == 'change':
            assert selected == old
            if node['role'] == 'cvm':
                self.changed.update(('cvm', n['address'], 'nutanix') for n in self.config['cvms'])
            else:
                self.changed.add(key)
        elif action == 'probe':
            result['authenticated'] = selected == (new if key in self.changed else old)
        else:
            assert selected == (new if key in self.changed else old)
        self.mutate(node, action, result)
        return result

    def writes(self):
        return [call for call in self.calls if call[2] == 'change']


def run(lab, **kwargs):
    return m.execute(lab.config, CREDS, 'legacy-python', kwargs.pop('emit', lambda _: None), ssh=lab, **kwargs)


@pytest.mark.parametrize('alter', [
    lambda c: c.update(password='forbidden'), lambda c: c.update(cvms=[]),
    lambda c: c.update(hosts=[]), lambda c: c.update(host_key_evidence=' '),
    lambda c: c['hosts'][0].update(ssh_host_key_sha256=''),
    lambda c: c['cvms'][0].update(address='host.invalid'),
    lambda c: c['hosts'][0].update(address='::ffff:192.0.2.10'),
    lambda c: c['cvms'][1].update(replacement_credential_ref='other'),
    lambda c: c['cvms'][0].update(current_credential_ref=[]),
    lambda c: c['hosts'][0]['accounts'][0].update(username='evil;id'),
    lambda c: c['hosts'][0]['accounts'].append(c['hosts'][0]['accounts'][0].copy()),
    lambda c: c['hosts'][0]['accounts'][0].update(replacement_credential_ref='ro'),
    lambda c: c['hosts'][0].update(accounts=None),
    lambda c: c.update(cvms=c['cvms'] * 33),
    lambda c: c.update(datacenter=3), lambda c: c.update(cluster_name='x\nsecret'),
])
def test_schema_fail_closed(alter):
    config = intent()
    alter(config)
    assert m.validate_intent(config)
    lab = Lab(config)
    assert not run(lab)[0]
    assert not lab.calls


def test_credential_resolution():
    assert m.validate_intent(intent()) == []
    assert m.resolve_credentials(intent(), lambda ref: (*CREDS[ref], None)) == CREDS
    for ref, bad in [('co', ('root', 'secret')), ('access', ('nutanix', 'secret')),
                     ('rn', ('root', CREDS['ro'][1])), ('cn', ('nutanix', 'bad\x03')),
                     ('ao', ('admin', 'different'))]:
        creds = dict(CREDS, **{ref: bad})
        with pytest.raises(ValueError):
            m.resolve_credentials(intent(), lambda r: (*creds[r], None))
    with pytest.raises(ValueError, match='Required credential'):
        m.resolve_credentials(intent(), lambda _: (_ for _ in ()).throw(RuntimeError('secret')))


def test_complete_flow_checkpoints_resume_and_no_leaks():
    lab, snapshots, lines = Lab(), [], []
    def save(state):
        assert all(s['status'] in m.STATUSES for s in state['targets'])
        snapshots.append(copy.deepcopy(state))
    ok, state = run(lab, checkpoint=save, emit=lines.append)
    assert ok and all(t['status'] == 'verified' for t in state['targets'])
    assert [c[0]['role'] for c in lab.writes()] == ['cvm', 'host', 'host']
    first_write = next(i for i, c in enumerate(lab.calls) if c[2] == 'change')
    assert len([c for c in lab.calls[:first_write] if c[2] == 'inspect']) == 4
    assert all(t['status'] == 'change_attempted' for t in snapshots[1]['targets'][:2])
    # Admin is changed first by canonical order; later root access uses new admin.
    assert lab.writes()[-1][1] == CREDS['an']
    writes = len(lab.writes())
    assert run(lab, state=state)[0]
    assert len(lab.writes()) == writes
    serialized = json.dumps([state, snapshots, lines])
    assert all(password not in serialized for _, password in CREDS.values())
    for target in state['targets']:
        assert f"[CHECK] preflight {target['key']}" in lines
        assert f"[PASS] preflight {target['key']} version={target['version']}" in lines
        assert f"[VERIFY] replacement {target['key']}" in lines


@pytest.mark.parametrize('failure,phase,key', [
    ('preflight', 'preflight', 'host:192.0.2.20:root'),
    ('change', 'password change', 'cvm:192.0.2.10:nutanix'),
    ('replacement', 'replacement verification', 'cvm:192.0.2.10:nutanix'),
    ('checkpoint', 'change checkpoint', 'cvm:192.0.2.10:nutanix'),
])
def test_failure_progress_identifies_only_safe_phase_and_canonical_target(failure, phase, key):
    lab, lines = Lab(), []
    lab.fail = lambda node, action: (
        failure == 'preflight' and node['account'] == 'root' and action == 'inspect'
        or failure == 'change' and action == 'change'
        or failure == 'replacement' and action == 'verify' and bool(lab.changed))
    def save(state):
        if failure == 'checkpoint' and state['targets'][0]['status'] == 'change_attempted':
            raise OSError('secret checkpoint output ' + CREDS['co'][1])
    assert not run(lab, emit=lines.append, checkpoint=save)[0]
    assert f'[FAIL] phase={phase} target={key};' in lines[-1]
    assert all(password not in str(lines) for _, password in CREDS.values())
    assert 'secret checkpoint output' not in str(lines) and 'secret transport output' not in str(lines)


def test_progress_rejects_untrusted_target_and_version_without_echoing_them():
    config = intent()
    config['cvms'][0]['address'] = CREDS['co'][1]
    lines = []
    assert not run(Lab(config), emit=lines.append)[0]
    assert 'phase=intent validation target=-;' in lines[-1]
    assert CREDS['co'][1] not in str(lines)
    lab = Lab()
    lab.mutate = lambda n, a, r: r.update(version='untrusted ' + CREDS['cn'][1])
    lines = []
    assert not run(lab, emit=lines.append)[0]
    assert 'phase=preflight target=cvm:192.0.2.10:nutanix;' in lines[-1]
    assert 'untrusted' not in str(lines) and CREDS['cn'][1] not in str(lines)


@pytest.mark.parametrize('role,version', [('cvm', '7.5.1.7'), ('host', '11.0.1.3-22'),
                                         ('cvm', 'unknown 7.5.1.8'), ('host', '11.0.1.3-23-dev'),
                                         ('host', None), ('cvm', '7.5')])
def test_versions_block_all_writes(role, version):
    lab = Lab()
    def alter(node, action, result):
        if node['role'] == role:
            result['version'] = version
    lab.mutate = alter
    assert not run(lab)[0]
    assert not lab.writes()


@pytest.mark.parametrize('role,value', [('cvm', 'el8.5-release-7.5.1.8-stable'),
                                      ('cvm', '7.5.1.10'), ('host', 'Nutanix AHV 11.0.1.3-23'),
                                      ('host', '11.0.1.3-100')])
def test_numeric_version_acceptance(role, value):
    assert m._version(value, role)


@pytest.mark.parametrize('field', ['cvms', 'hosts'])
def test_membership_exact_match(field):
    lab = Lab()
    lab.mutate = lambda node, action, result: result.update({field: ['192.0.2.99']})
    assert not run(lab)[0]
    assert not lab.writes()


def test_preflight_failure_cancel_and_dry_run():
    lab = Lab()
    lab.fail = lambda node, action: node['account'] == 'root'
    lines = []
    assert not run(lab, emit=lines.append)[0]
    assert not lab.writes() and 'CvmOld!7' not in str(lines)
    assert not run(Lab(), cancelled=lambda: True)[0]
    lab = Lab()
    ok, state = run(lab, dry_run=True)
    assert ok and not lab.writes()
    assert all(t['status'] == 'pending' for t in state['targets'])


@pytest.mark.parametrize('failure', ['raise', 'false'])
def test_checkpoint_failure_before_write(failure):
    lab = Lab()
    def save(state):
        if any(t['status'] == 'change_attempted' for t in state['targets']):
            if failure == 'raise':
                raise OSError('secret')
            return False
    ok, state = run(lab, checkpoint=save)
    assert not ok and not lab.writes()
    assert state['targets'][0]['status'] == 'change_attempted'


def test_partial_recovery_reconcile_and_no_blind_retry():
    lab = Lab()
    lab.fail = lambda node, action: action == 'verify' and ('host', node['address'], node['account']) in lab.changed
    ok, state = run(lab)
    assert not ok and len(lab.writes()) == 2
    assert [t['status'] for t in state['targets']] == ['verified', 'verified', 'change_attempted', 'pending']
    before = len(lab.calls)
    assert not run(lab, state=state)[0] and len(lab.calls) == before
    lab.fail = None
    keys = [t['key'] for t in state['targets'] if t['status'] == 'change_attempted']
    ok, state = m.reconcile(intent(), CREDS, 'python', state, keys, 'replacement', lambda _: None, lambda _: None, ssh=lab)
    assert ok
    assert run(lab, state=state)[0] and len(lab.writes()) == 3


def test_cvm_partial_sync_remains_atomic_and_bounded(monkeypatch):
    wait = Mock()
    monkeypatch.setattr(m.time, 'sleep', wait)
    lab = Lab()
    lab.fail = lambda node, action: action == 'verify' and node['address'] == '192.0.2.11' and bool(lab.changed)
    ok, state = run(lab)
    assert not ok and len(lab.writes()) == 1
    assert all(t['status'] == 'change_attempted' for t in state['targets'][:2])
    assert sum(c[2] == 'verify' and c[0]['address'] == '192.0.2.11' for c in lab.calls) == 1
    wait.assert_called_once_with(10)
    lab.fail = None
    keys = [t['key'] for t in state['targets'][:2]]
    assert not m.reconcile(intent(), CREDS, 'python', state, keys[:1], 'replacement', lambda _: None, lambda _: None, ssh=lab)[0]
    assert m.reconcile(intent(), CREDS, 'python', state, keys, 'replacement', lambda _: None, lambda _: None, ssh=lab)[0]


def test_root_initial_access_hands_off_to_admin_before_root_restriction():
    config = intent()
    config['hosts'][0]['access_credential_ref'] = 'ro'
    config['hosts'][0]['accounts'].reverse()  # Incoming order must not put root first.
    lab = Lab(config)
    lab.restrict_root = True
    snapshots = []
    ok, state = run(lab, checkpoint=lambda s: snapshots.append(copy.deepcopy(s)))
    assert ok
    assert [c[0]['account'] for c in lab.writes()] == ['nutanix', 'admin', 'root']
    admin_new_ssh = next(i for i, call in enumerate(lab.calls)
                         if call[1] == CREDS['an'] and call[2] == 'verify')
    root_write = next(i for i, call in enumerate(lab.calls)
                      if call[0]['role'] == 'host' and call[0]['account'] == 'root' and call[2] == 'change')
    assert admin_new_ssh < root_write
    assert lab.calls[root_write][1] == CREDS['an']
    assert all(call[1] == CREDS['an'] for call in lab.calls[root_write:])
    assert all(t['status'] == 'verified' for t in state['targets'])
    assert run(lab, state=state)[0]  # Resume never authenticates restricted root.


def test_admin_new_ssh_denied_stops_before_root_write_even_when_pam_would_pass():
    config = intent()
    config['hosts'][0]['access_credential_ref'] = 'ro'
    lab = Lab(config)
    lab.deny_admin_ssh = True
    ok, state = run(lab)
    assert not ok
    assert [c[0]['account'] for c in lab.writes()] == ['nutanix', 'admin']
    assert state['targets'][2]['status'] == 'change_attempted'
    assert state['targets'][3]['status'] == 'pending'
    assert sum(c[1] == CREDS['an'] for c in lab.calls) == 1


def test_root_initial_access_without_admin_handoff_fails_before_writes():
    config = intent()
    config['hosts'][0]['access_credential_ref'] = 'ro'
    config['hosts'][0]['accounts'] = [config['hosts'][0]['accounts'][0]]
    lab = Lab(config)
    assert not run(lab)[0] and not lab.writes()


def test_admin_handoff_with_unsupported_root_policy_stops_before_root_attempt():
    config = intent()
    config['hosts'][0]['access_credential_ref'] = 'ro'
    lab = Lab(config)
    lab.fail = lambda node, action: node['role'] == 'host' and node['account'] == 'root' and action == 'verify'
    ok, state = run(lab)
    assert not ok
    assert [c[0]['account'] for c in lab.writes()] == ['nutanix', 'admin']
    assert state['targets'][2]['status'] == 'verified' and state['targets'][3]['status'] == 'pending'


def test_uncertain_root_reconciles_via_verified_admin_after_root_ssh_restriction():
    config = intent()
    config['hosts'][0]['access_credential_ref'] = 'ro'
    lab = Lab(config)
    lab.restrict_root = True
    lab.fail = lambda node, action: action == 'verify' and ('host', node['address'], 'root') in lab.changed
    ok, state = run(lab)
    assert not ok and state['targets'][3]['status'] == 'change_attempted'
    lab.fail = None
    ok, state = m.reconcile(config, CREDS, 'python', state, [state['targets'][3]['key']],
                            'replacement', lambda _: None, lambda _: None, ssh=lab)
    assert ok and state['targets'][3]['status'] == 'verified'


def test_current_reconciliation_after_checkpoint_no_write_and_ambiguity():
    lab = Lab()
    def save(state):
        if state['targets'][0]['status'] == 'change_attempted':
            raise OSError()
    _, state = run(lab, checkpoint=save)
    keys = [t['key'] for t in state['targets'][:2]]
    ok, fresh = m.reconcile(intent(), CREDS, 'python', state, keys, 'current', lambda _: None, lambda _: None, ssh=lab)
    assert ok and fresh['targets'][0]['status'] == 'pending' and not lab.writes()
    def ambiguous(node, action, result):
        if action == 'probe':
            result['authenticated'] = True
    lab.mutate = ambiguous
    assert not m.reconcile(intent(), CREDS, 'python', state, keys, 'current', lambda _: None, lambda _: None, ssh=lab)[0]


@pytest.mark.parametrize('change', ['machine', 'key', 'config', 'state'])
def test_resume_identity_config_and_state_fail_closed(change):
    lab = Lab()
    _, state = run(lab, dry_run=True)
    if change == 'machine':
        lab.mutate = lambda n, a, r: r.update(identity='b' * 32 + ':' + PIN)
    elif change == 'key':
        lab.config['cvms'][0]['ssh_host_key_sha256'] = 'SHA256:' + 'B' * 43
    elif change == 'config':
        lab.config['cluster_name'] = 'different'
    else:
        state['targets'][0]['password'] = 'secret'
    assert not run(lab, state=state)[0] and not lab.writes()


def test_cancel_after_checkpoint_prevents_write():
    lab = Lab()
    cancel = [False]
    def save(state):
        cancel[0] = state['targets'][0]['status'] == 'change_attempted'
    ok, state = run(lab, checkpoint=save, cancelled=lambda: cancel[0])
    assert not ok and not lab.writes() and state['targets'][0]['status'] == 'change_attempted'


def test_cancel_after_write_and_failed_completion_checkpoint(monkeypatch):
    lab = Lab()
    ok, state = run(lab, cancelled=lambda: bool(lab.changed))
    assert not ok and len(lab.writes()) == 1
    assert all(t['status'] == 'change_attempted' for t in state['targets'][:2])
    lab = Lab()
    def save(state):
        if state['targets'][0]['status'] == 'verified':
            raise OSError('secret checkpoint error')
    ok, state = run(lab, checkpoint=save)
    assert not ok and all(t['status'] == 'change_attempted' for t in state['targets'][:2])
    keys = [t['key'] for t in state['targets'][:2]]
    ok, reconciled = m.reconcile(intent(), CREDS, 'python', state, keys, 'replacement',
                                 lambda _: None, save, ssh=lab)
    assert not ok and reconciled['targets'][0]['status'] == 'change_attempted'


def test_reconciliation_machine_change_stops_before_candidate_probes():
    lab = Lab()
    def save(state):
        if state['targets'][0]['status'] == 'change_attempted':
            raise OSError()
    _, state = run(lab, checkpoint=save)
    lab.mutate = lambda n, a, r: r.update(identity='b' * 32 + ':' + PIN)
    before = len(lab.calls)
    assert not m.reconcile(intent(), CREDS, 'python', state, [t['key'] for t in state['targets'][:2]],
                           'current', lambda _: None, lambda _: None, ssh=lab)[0]
    assert [c[2] for c in lab.calls[before:]] == ['verify']


def test_canonical_order_and_ipv6_resume():
    config = intent()
    config['cvms'][0]['address'] = '2001:db8:0:0::1'
    lab = Lab(config)
    ok, state = run(lab, dry_run=True)
    assert ok
    lab.config['cvms'][0]['address'] = '2001:db8::1'
    lab.config['cvms'].reverse()
    lab.config['hosts'][0]['accounts'].reverse()
    assert run(lab, state=state, dry_run=True)[0]


def test_subprocess_secrets_stdin_only_and_suppressed_errors(monkeypatch):
    process = Mock(return_value=Mock(returncode=0, stdout='{"ok":true}'))
    monkeypatch.setattr(m.subprocess, 'run', process)
    m.ssh_request('legacy-python', {}, CREDS['co'], 'change', CREDS['cn'][1])
    args, kwargs = process.call_args
    assert args[0][0] == 'legacy-python' and not kwargs['shell']
    assert 'env' not in kwargs
    assert all(p not in json.dumps(args) for _, p in CREDS.values())
    assert json.loads(kwargs['input'])['replacement'] == CREDS['cn'][1]
    process.return_value = Mock(returncode=1, stdout=CREDS['co'][1])
    with pytest.raises(RuntimeError) as error:
        m.ssh_request('python', {}, CREDS['co'], 'verify')
    assert CREDS['co'][1] not in str(error.value)


class Channel:
    def __init__(self, prompts, status=0):
        self.prompts, self.status, self.sent = prompts, status, []
        self.command = None
        self.closed = False
    def get_pty(self):
        pass
    def exec_command(self, command):
        self.command = command
    def recv_ready(self):
        return bool(self.prompts)
    def recv(self, size):
        return self.prompts.pop(0)
    def sendall(self, value):
        self.sent.append(value)
    def exit_status_ready(self):
        return not self.prompts
    def recv_exit_status(self):
        return self.status
    def close(self):
        self.closed = True


def test_interactive_dialog_and_no_locale_override(monkeypatch):
    monkeypatch.setattr(m.time, 'sleep', lambda _: None)
    channel = Channel([b'[sudo] password for nutanix:', b'New password:', b'Retype new password:'])
    client = Mock()
    client.get_transport.return_value.open_session.return_value = channel
    assert m._dialog(client, 'sudo passwd nutanix', 'old', 'old', 'new')
    assert channel.command == 'sudo passwd nutanix' and 'LC_ALL' not in channel.command
    assert channel.sent == ['old\n', 'new\n', 'new\n'] and channel.closed
    channel = Channel([b'Password:', b'su: Authentication failure'], 1)
    client.get_transport.return_value.open_session.return_value = channel
    assert m._dialog(client, 'fixed', 'access', 'old') is False
    channel = Channel([b'Password:', b'su: Permission denied'], 1)
    client.get_transport.return_value.open_session.return_value = channel
    with pytest.raises(RuntimeError):
        m._dialog(client, 'fixed', 'access', 'old')


def test_worker_pinning_fixed_commands_locked_checks_and_machine_race(monkeypatch):
    client = Mock()
    module = types.SimpleNamespace(SSHClient=lambda: client, MissingHostKeyPolicy=object,
                                   AuthenticationException=type('AuthenticationException', (Exception,), {}))
    monkeypatch.setitem(sys.modules, 'paramiko', module)
    commands = []
    locked = [False]
    def read(connection, command):
        commands.append(command)
        return {'cat /etc/machine-id': 'a' * 32, 'cat /etc/nutanix/release_version': '7.5.1.8',
                'svmips': '192.0.2.10 192.0.2.11', 'hostips': '192.0.2.20'}[command]
    monkeypatch.setattr(m, '_read', read)
    status = Mock(side_effect=lambda c, account, password: 'nutanix L 1' if locked[0] else 'nutanix PS 1')
    monkeypatch.setattr(m, '_sudo_status', status)
    dialog = Mock(return_value=True)
    monkeypatch.setattr(m, '_dialog', dialog)
    node = dict(intent()['cvms'][0], role='cvm', account='nutanix')
    data = dict(node=node, credential=CREDS['co'], action='inspect', replacement=None)
    assert m.ssh_worker(data)['hosts'] == ['192.0.2.20']
    status.assert_called_once_with(client, 'nutanix', CREDS['co'][1])
    policy = client.set_missing_host_key_policy.call_args.args[0]
    with pytest.raises(RuntimeError, match='key changed'):
        policy.missing_host_key(client, 'ignored', Mock(asbytes=lambda: b'changed'))
    connect = client.connect.call_args.kwargs
    assert connect['allow_agent'] is False and connect['look_for_keys'] is False
    data.update(action='change', replacement=CREDS['cn'][1])
    locked[0] = True
    with pytest.raises(RuntimeError, match='locked'):
        m.ssh_worker(data)
    dialog.assert_not_called()
    locked[0] = False
    node['expected_identity'] = 'b' * 32 + ':' + PIN
    with pytest.raises(RuntimeError, match='identity changed'):
        m.ssh_worker(data)
    dialog.assert_not_called()
    node['expected_identity'] = 'a' * 32 + ':' + PIN
    m.ssh_worker(data)
    assert dialog.call_args.args[1] == 'sudo passwd nutanix'
    assert all(p not in str(commands) for _, p in CREDS.values())


@pytest.mark.parametrize('access', ['root', 'admin'])
def test_worker_host_policy_verification_uses_access_not_selected_ssh(monkeypatch, access):
    client = Mock()
    module = types.SimpleNamespace(SSHClient=lambda: client, MissingHostKeyPolicy=object,
                                   AuthenticationException=type('AuthenticationException', (Exception,), {}))
    monkeypatch.setitem(sys.modules, 'paramiko', module)
    def read(connection, command):
        return {'cat /etc/machine-id': 'a' * 32, 'cat /etc/nutanix-release': 'Nutanix AHV 11.0.1.3-23',
                'passwd -S root': 'root PS 1'}[command]
    monkeypatch.setattr(m, '_read', read)
    stdin = Mock()
    def exec_status(*args, **kwargs):
        channel = StatusChannel('root PS 1')
        stdin.channel = channel
        return stdin, SimpleOutput(channel), Mock()
    client.exec_command.side_effect = exec_status
    dialog = Mock(return_value=True)
    monkeypatch.setattr(m, '_dialog', dialog)
    node = dict(intent()['hosts'][0], role='host', account='root', account_credential=CREDS['rn'])
    result = m.ssh_worker(dict(node=node, credential=(access, 'access-secret'), action='verify'))
    assert result['ok']
    if access == 'admin':
        stdin.write.assert_called_with('access-secret\n')
        assert client.exec_command.call_args.args == ("sudo -S -p '' passwd -S root",)
    else:
        client.exec_command.assert_not_called()
    assert client.connect.call_args.kwargs['username'] == access
    assert dialog.call_args.args[1].endswith('runuser -u nobody -- su - root -c /usr/bin/true')
    assert dialog.call_args.args[3] == CREDS['rn'][1]
    m.ssh_worker(dict(node=node, credential=(access, 'access-secret'), action='change', replacement=CREDS['rn'][1]))
    assert dialog.call_args.args[1] == ('' if access == 'root' else "sudo -S -p 'ZTF-SUDO:' ") + 'passwd root'
    policy = client.set_missing_host_key_policy.call_args.args[0]
    node['ssh_host_key_sha256'] = 'SHA256:' + base64.b64encode(hashlib.sha256(b'key').digest()).decode().rstrip('=')
    policy.missing_host_key(client, 'ignored', Mock(asbytes=lambda: b'key'))
    dialog.return_value = False
    with pytest.raises(RuntimeError, match='rejected'):
        m.ssh_worker(dict(node=node, credential=(access, 'access-secret'), action='verify'))


def test_worker_cvm_probe_rejected_secret_needs_authenticated_alternate(monkeypatch):
    auth_error = type('AuthenticationException', (Exception,), {})
    candidate, alternate = Mock(), Mock()
    candidate.connect.side_effect = auth_error()
    factory = Mock(side_effect=[candidate, alternate])
    monkeypatch.setitem(sys.modules, 'paramiko', types.SimpleNamespace(
        SSHClient=factory, MissingHostKeyPolicy=object, AuthenticationException=auth_error))
    monkeypatch.setattr(m, '_read', lambda client, command: {
        'cat /etc/machine-id': 'a' * 32, 'cat /etc/nutanix/release_version': '7.5.1.8'}[command])
    status = Mock(return_value='nutanix PS 1')
    monkeypatch.setattr(m, '_sudo_status', status)
    node = dict(intent()['cvms'][0], role='cvm', account='nutanix',
                expected_identity='a' * 32 + ':' + PIN, probe_alternate=CREDS['cn'])
    result = m.ssh_worker(dict(node=node, credential=CREDS['co'], action='probe'))
    assert result['authenticated'] is False
    assert alternate.connect.call_args.kwargs['password'] == CREDS['cn'][1]
    status.assert_called_once_with(alternate, 'nutanix', CREDS['cn'][1])
    alternate.close.assert_called_once()


@pytest.mark.parametrize('value', ['192.0.2.10', '192.0.2.10%eth0', None, 123])
def test_non_ip_machine_identity_prevents_write(value):
    lab = Lab()
    lab.mutate = lambda n, a, r: r.update(identity=value)
    assert not run(lab)[0] and not lab.writes()


def test_reconcile_transport_failure_is_not_rejection():
    lab = Lab()
    def save(state):
        if state['targets'][0]['status'] == 'change_attempted':
            raise OSError()
    _, state = run(lab, checkpoint=save)
    lab.fail = lambda node, action: action == 'probe'
    ok, result = m.reconcile(intent(), CREDS, 'python', state, [t['key'] for t in state['targets'][:2]],
                             'current', lambda _: None, lambda _: None, ssh=lab)
    assert not ok and all(t['status'] == 'change_attempted' for t in result['targets'][:2])
    assert not lab.writes()


class SimpleOutput:
    def __init__(self, channel):
        self.channel = channel


class StatusChannel:
    def __init__(self, output, status=0, error=b'', password_required=False):
        self.output = [output.encode()] if output else []
        self.error = [error] if error else []
        self.status, self.closed = status, False
        self.password_required, self.password_received = password_required, False
    def recv_ready(self):
        return bool(self.output) and (not self.password_required or self.password_received)
    def recv(self, size):
        return self.output.pop(0)
    def recv_stderr_ready(self):
        return bool(self.error)
    def recv_stderr(self, size):
        return self.error.pop(0)
    def exit_status_ready(self):
        return (not self.password_required or self.password_received) and not self.output and not self.error
    def recv_exit_status(self):
        return self.status
    def shutdown_write(self):
        pass
    def close(self):
        self.closed = True


@pytest.mark.parametrize('account', ['root', 'admin', 'nutanix'])
@pytest.mark.parametrize('password_required', [False, True], ids=['NOPASSWD', 'password-sudo'])
def test_sudo_status_fixed_allowlist_password_only_in_ssh_stdin(account, password_required):
    password = CREDS['cn'][1]
    channel = StatusChannel(account + ' PS 1', password_required=password_required)
    stdin = Mock(channel=channel)
    def receive(value):
        assert value == password + '\n'
        channel.password_received = True
    stdin.write.side_effect = receive
    client = Mock()
    client.exec_command.return_value = (stdin, SimpleOutput(channel), Mock())
    assert m._sudo_status(client, account, password) == account + ' PS 1'
    expected = {'root': "sudo -S -p '' passwd -S root", 'admin': "sudo -S -p '' passwd -S admin",
                'nutanix': "sudo -S -p '' passwd -S nutanix"}
    client.exec_command.assert_called_once_with(expected[account], timeout=15, get_pty=False)
    assert password not in str(client.exec_command.call_args)
    stdin.write.assert_called_once_with(password + '\n')
    stdin.flush.assert_called_once()
    assert channel.closed


@pytest.mark.parametrize('failure', ['nonzero', 'oversize', 'timeout', 'transport', 'account'])
def test_sudo_status_failure_is_bounded_and_redacts_child_output(monkeypatch, failure):
    password = CREDS['co'][1]
    channel = StatusChannel('nutanix PS 1', status=1 if failure == 'nonzero' else 0,
                            error=('raw child output ' + password).encode())
    if failure == 'oversize':
        channel.output = [b'x' * 16385]
    if failure == 'timeout':
        monkeypatch.setattr(m.time, 'monotonic', Mock(side_effect=[0, 16]))
    stdin = Mock(channel=channel)
    client = Mock()
    client.exec_command.return_value = (stdin, SimpleOutput(channel), Mock())
    if failure == 'transport':
        client.exec_command.side_effect = RuntimeError('raw transport output ' + password)
    with pytest.raises(RuntimeError) as error:
        m._sudo_status(client, 'root;id' if failure == 'account' else 'nutanix', password)
    assert str(error.value) == 'Read-only sudo account status check failed'
    assert password not in str(error.value) and 'raw' not in str(error.value)
    if failure == 'account':
        client.exec_command.assert_not_called()
    elif failure != 'transport':
        assert channel.closed


def test_nopasswd_status_accepts_success_when_remote_stdin_already_closed():
    channel = StatusChannel('admin PS 1')
    # Exit is already available even while its final stdout remains buffered.
    channel.exit_status_ready = lambda: True
    stdin = Mock(channel=channel)
    stdin.write.side_effect = OSError('closed channel ' + CREDS['an'][1])
    client = Mock()
    client.exec_command.return_value = (stdin, SimpleOutput(channel), Mock())
    assert m._sudo_status(client, 'admin', CREDS['an'][1]) == 'admin PS 1'
    assert channel.closed
