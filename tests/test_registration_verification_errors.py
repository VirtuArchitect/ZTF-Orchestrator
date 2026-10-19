import importlib.util
import json
import logging
import sys
import time
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize('result,expected', [("CAN\'T VERIFY", 'failed'), ('FAIL', 'failed'), ('PASS', 'success')])
def test_registration_result_overrides_zero_exit(result, expected):
    import server
    output = f"[INFO] {{'clusters': {{'192.0.2.1': {{'Register_to_PC': {result!r}}}}}}}"
    assert server._ztf_process_status(0, output, '') == expected
    assert server._ztf_process_status(0, '', output) == expected
    assert server._ztf_process_status(0, output, '', cancelled=True) == 'cancelled'
    assert server._ztf_process_status(1, output, '') == 'failed'


def test_optional_verification_skip_does_not_fail_job():
    import server
    assert server._ztf_process_status(0, "{'HA_state': \"CAN'T VERIFY\"}", '') == 'success'


def test_runtime_patch_surfaces_exception_and_is_idempotent(tmp_path, monkeypatch, caplog):
    patcher = load_script('patch_ztf_runtime')
    monkeypatch.setattr(patcher, 'RUNTIME_ROOT', tmp_path)
    target = tmp_path / 'framework/scripts/python/pe/register_pe_to_pc.py'
    target.parent.mkdir(parents=True)
    (tmp_path / 'framework/helpers').mkdir(parents=True)
    target.write_text('''class RegisterToPc:
    def verify_single_cluster(self, cluster_ip, cluster_details):
        try:
            self.results['clusters'][cluster_ip] = {'Register_to_PC': "CAN'T VERIFY"}
            cluster_uuid = cluster_details['cluster_info']['uuid']
        except Exception as e:
            self.logger.debug(e)
            self.logger.info(f"Exception occurred during the verification of {type(self).__name__!r} "
                             f"for {cluster_ip}")
''')
    patcher.patch_register_to_pc_verification()
    first = target.read_text()
    patcher.patch_register_to_pc_verification()
    assert target.read_text() == first
    monkeypatch.setitem(sys.modules, 'framework.helpers.verification_errors', load_script('ztf_verification_errors'))
    namespace = {}
    exec(compile(first, str(target), 'exec'), namespace)
    instance = namespace['RegisterToPc']()
    instance.data = {}
    instance.pc_password = 'fixture-password'
    instance.results = {'clusters': {}}
    instance.logger = logging.getLogger('registration-test')
    with caplog.at_level(logging.ERROR):
        instance.verify_single_cluster('192.0.2.1', {'cluster_info': {}})
    assert "KeyError: 'uuid'" in caplog.text
    assert 'RegisterToPc verification failed' in caplog.text
    assert instance.results['clusters']['192.0.2.1']['Register_to_PC'] == "CAN'T VERIFY"


def test_exception_secrets_are_redacted():
    helper = load_script('ztf_verification_errors')
    error = RuntimeError('401 pc-pass pe-pass Authorization: Bearer abc123 '
                         'https://user:pass@example.test "password": "two words" token=xyz '
                         '"Authorization": "Basic hiddenbase64"')
    detail = helper.verification_error_detail(error, {'credentials': {'pe_user': {'password': 'pe-pass'}}}, ('pc-pass',))
    assert 'RuntimeError: 401' in detail
    for secret in ('pc-pass', 'pe-pass', 'abc123', 'user:pass', 'two words', 'xyz', 'hiddenbase64'):
        assert secret not in detail


@pytest.mark.parametrize('patched', [False, True])
def test_job_api_and_history_reject_unverified_registration(client, auth_headers, monkeypatch, patched):
    import server
    summary = "[INFO] {'clusters': {'192.0.2.1': {'Register_to_PC': \"CAN'T VERIFY\"}}}\n"
    detail = "[ERROR] RegisterToPc verification failed for 192.0.2.1: KeyError: 'uuid'\n"

    class Process:
        returncode = 0

        def __init__(self):
            self.stdout = iter([])
            self.stderr = iter(([detail] if patched else []) + [summary, '[INFO] Done!\n'])

        def wait(self):
            return 0

        def poll(self):
            return 0

    monkeypatch.setattr(server.subprocess, 'Popen', lambda *args, **kwargs: Process())
    response = client.post('/api/jobs', json={'script': 'RegisterToPc'}, headers=auth_headers)
    assert response.status_code == 202
    job_id = response.get_json()['id']
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        job = client.get(f'/api/jobs/{job_id}', headers=auth_headers).get_json()
        if job['status'] in server.ExecutionJobManager.TERMINAL:
            break
        time.sleep(.02)
    assert job['status'] == 'failed'
    assert job['returnCode'] == 0
    assert job['diagnostics']['category'] == 'verification_error'
    assert ("KeyError: 'uuid'" if patched else "CAN'T VERIFY") in job['diagnostics']['evidence']
    history = client.get('/api/executions', headers=auth_headers).get_json()
    entry = next(item for item in history if item['id'] == job_id)
    assert entry['status'] == 'failed'
    assert entry['diagnostics']['category'] == 'verification_error'


def test_pipeline_stops_after_unverified_registration(client, auth_headers, monkeypatch):
    import server
    calls = []

    class Process:
        returncode = 0

        def __init__(self):
            self.stdout = iter(["{'Register_to_PC': \"CAN'T VERIFY\"}\n"])
            self.stderr = iter([])

        def wait(self):
            return 0

        def poll(self):
            return 0

    def popen(*args, **kwargs):
        calls.append(args)
        return Process()

    monkeypatch.setattr(server.subprocess, 'Popen', popen)
    response = client.post('/api/pipelines', headers=auth_headers, json={
        'name': 'Registration verification regression',
        'steps': [{'workflow': 'pod-config'}, {'workflow': 'pod-config'}],
    })
    assert response.status_code == 201
    pipeline_id = response.get_json()['id']
    response = client.post(f'/api/pipelines/{pipeline_id}/run', headers=auth_headers)
    assert response.status_code == 200
    events = [json.loads(line[6:]) for line in response.data.decode().splitlines() if line.startswith('data: ')]
    step = next(event['data'] for event in events if event['type'] == 'step_complete')
    assert step['status'] == 'failed'
    assert step['returnCode'] == 0
    assert any(event['type'] == 'step_skipped' for event in events)
    assert len(calls) == 1
