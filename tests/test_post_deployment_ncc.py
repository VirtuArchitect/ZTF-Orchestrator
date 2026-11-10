import json
import base64
import hashlib
import subprocess
import sys
import time
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

import post_deployment_ncc as ncc


def test_shared_ssh_helper_rejects_mismatched_host_key_before_authentication(monkeypatch):
    client, key, authenticated = MagicMock(), MagicMock(), MagicMock()
    key.asbytes.return_value = b'fixture-key'
    fingerprint = base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip('=')
    monkeypatch.setitem(sys.modules, 'paramiko', SimpleNamespace(SSHClient=lambda: client, MissingHostKeyPolicy=object))

    def connect(host, **kwargs):
        policy = client.set_missing_host_key_policy.call_args.args[0]
        policy.missing_host_key(client, host, key)
        authenticated(kwargs)

    client.connect.side_effect = connect
    node = {'address': '192.0.2.10', 'ssh_host_key_sha256': 'SHA256:' + 'a' * 43}
    with pytest.raises(RuntimeError, match='host key mismatch'):
        ncc.pinned_cvm_client(node, ('nutanix', 'fixture'))
    authenticated.assert_not_called()
    client.close.assert_called_once()
    assert ncc.pinned_cvm_client({**node, 'ssh_host_key_sha256': 'SHA256:' + fingerprint}, ('nutanix', 'fixture')) is client
    assert authenticated.call_args.args[0]['allow_agent'] is False


@pytest.mark.parametrize('output,code,status', [
    (b'| Pass | 12 |\n| Total Plugins | 12 |', 0, 'passed'),
    (b'| Pass | 11 |\n| Info | 1 |\n| Total Plugins | 12 |', 0, 'findings'),
    (b'| Pass | 10 |\n| Warn | 1 |\n| Fail | 1 |\n| Total Plugins | 12 |', 0, 'findings'),
    (b'| Pass | 12 |\n| Total Plugins | 12 |', 1, 'findings'),
    (b'| Pass | 12 |\n| Total Plugins | 13 |', 0, 'unverified'),
    (b'| Pass | 12 |', 0, 'unverified'),
    (b'| Pass | 0 |\n| Total Plugins | 0 |', 0, 'unverified'),
    (b'| Pass | 12 |\n| Total Plugins | 12 |\nHealth check aborted', 0, 'unverified'),
    (b'| Pass | 12 |\n| Total Plugins | 12 |\n| Pass | 12 |\n| Total Plugins | 12 |', 0, 'unverified'),
])
def test_ncc_requires_one_complete_all_pass_summary(output, code, status):
    assert ncc.summarize(output, code)['status'] == status


def test_ncc_worker_sends_only_fixed_command_and_closes_pinned_transport(monkeypatch):
    connection, channel = MagicMock(), MagicMock()
    connect = MagicMock(return_value=connection)
    monkeypatch.setattr(ncc, 'pinned_cvm_client', connect)
    connection.get_transport.return_value.open_session.return_value.__enter__.return_value = channel
    channel.recv_ready.side_effect = [True, False]
    channel.recv.return_value = b'| Pass | 12 |\n| Total Plugins | 12 |'
    channel.recv_exit_status.return_value = 0
    target = {'address': '192.0.2.10', 'ssh_host_key_sha256': 'SHA256:' + 'a' * 43}
    credential = ('nutanix', 'fixture-not-a-secret')
    assert ncc.worker({'node': target, 'credential': credential, 'command': 'ignored'}) == {
        'status': 'passed', 'counts': {'pass': 12}, 'total': 12,
    }
    connect.assert_called_once_with(target, credential)
    channel.exec_command.assert_called_once_with('LC_ALL=C ncc health_checks run_all')
    connection.close.assert_called_once()


def test_ncc_output_limit_and_timeout_fail_closed(monkeypatch):
    channel = MagicMock()
    monkeypatch.setattr(ncc, 'MAX_OUTPUT', 32)
    channel.recv.return_value = b'X' * 33
    assert ncc.collect(channel, time.monotonic() + 5) == {'status': 'unverified'}
    assert ncc.collect(channel, time.monotonic() - 1) == {'status': 'unverified'}
    channel.recv_exit_status.assert_not_called()


def test_ncc_cancellation_kills_child_and_passes_secret_only_in_stdin(monkeypatch):
    launch, proc = MagicMock(), MagicMock()
    launch.return_value.__enter__.return_value = proc
    proc.communicate.side_effect = [subprocess.TimeoutExpired('worker', .5), ('', '')]
    proc.poll.return_value = None
    monkeypatch.setattr(ncc.subprocess, 'Popen', launch)
    assert ncc.run('python', {}, ('nutanix', 'fixture-secret'), lambda: True) == {'status': 'unverified'}
    assert 'fixture-secret' not in str(launch.call_args)
    assert json.loads(proc.communicate.call_args_list[0].args[0])['credential'][1] == 'fixture-secret'
    proc.kill.assert_called_once()
