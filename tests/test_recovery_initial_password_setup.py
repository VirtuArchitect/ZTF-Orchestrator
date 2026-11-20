"""DR integration with simulated jobs only; no password or target access."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
import threading

import pytest
import yaml

from disaster_recovery import (
    PASSWORD_SETUP, PASSWORD_SETUP_CONFIRMATION, RecoveryError, bootstrap_count,
)
from tests.test_disaster_recovery import (
    harness, bootstrap_harness, deploy, profile, wait_status,
)


AUTH = 'Bearer private-test-session'
HEALTH = {'clusterIdentity': 'HCI-01', 'membershipVerified': True, 'servicesHealthy': True,
          'notes': 'Simulated membership and PE health readback', 'evidenceRef': 'mock/health'}
ADVANCE = {'passwordSetupApprovalId': 'independent-password-approval',
           'passwordSetupConfirmation': PASSWORD_SETUP_CONFIRMATION}


@pytest.fixture
def password_harness(bootstrap_harness, monkeypatch):
    original_wait = threading.Event.wait
    monkeypatch.setattr(threading.Event, 'wait',
                        lambda self, timeout=None: original_wait(self, .001 if timeout == 1 else timeout))
    h = bootstrap_harness
    nodes = yaml.safe_load(h[2]['deploy.yml'])['create_clusters'][0]['nodes_list']
    intent = {'cluster_name': 'HCI-01', 'datacenter': 'DC-A',
              'host_key_evidence': 'mock/independent-console-key-readback',
              'cvms': [{'address': n['cvm_ip'], 'ssh_host_key_sha256': 'SHA256:' + 'A' * 43,
                        'current_credential_ref': 'cvm_current', 'replacement_credential_ref': 'cvm_new'}
                       for n in nodes],
              'hosts': [{'address': n['host_ip'], 'ssh_host_key_sha256': 'SHA256:' + 'B' * 43,
                         'access_credential_ref': 'host_access',
                         'accounts': [{'username': 'root', 'current_credential_ref': 'host_root_current',
                                       'replacement_credential_ref': 'host_root_new'}]} for n in nodes]}
    h[2]['initial-passwords.yml'] = yaml.safe_dump(intent)
    h[3]['steps'].insert(1, {'workflow': PASSWORD_SETUP, 'configFile': 'initial-passwords.yml'})
    return h


def ready(h):
    run = deploy(h)
    h[0].start_bootstrap(run['id'], 'admin', {'riskAcknowledged': True,
                         'confirmation': 'BOOTSTRAP HCI-01'}, AUTH)
    wait_status(h[0], run['id'], 'awaiting_health_verification')
    return h[0].attest_health(run['id'], 'admin', HEALTH)


def test_snapshot_accepts_reference_only_password_action_after_pe_bootstrap(password_harness):
    h = password_harness
    revision = profile(h)['revisions'][-1]
    assert revision['steps'][1]['workflow'] == PASSWORD_SETUP
    assert revision['steps'][1]['configContent'] == h[2]['initial-passwords.yml']
    assert bootstrap_count(revision) == 1  # SSH writes never precede PE health.
    assert [s['configFile'] for s in revision['steps']] == [
        'password.yml', 'initial-passwords.yml', 'eula.yml', 'post.yml']


@pytest.mark.parametrize('group,mutation', [
    ('cvms', 'missing'), ('hosts', 'missing'), ('cvms', 'extra'), ('hosts', 'extra'),
    ('cvms', 'foreign'), ('hosts', 'foreign'), ('cvms', 'duplicate'), ('hosts', 'duplicate'),
    ('cvms', 'swapped'),
])
def test_snapshot_rejects_target_membership_mismatch(password_harness, group, mutation):
    h = password_harness
    intent = yaml.safe_load(h[2]['initial-passwords.yml'])
    if mutation == 'missing':
        intent[group].pop()
    elif mutation == 'extra':
        row = deepcopy(intent[group][0])
        row['address'] = '198.51.100.99'
        intent[group].append(row)
    elif mutation == 'foreign':
        intent[group][0]['address'] = '198.51.100.99'
    elif mutation == 'duplicate':
        intent[group][1]['address'] = intent[group][0]['address']
    else:
        intent['cvms'][0]['address'], intent['hosts'][0]['address'] = (
            intent['hosts'][0]['address'], intent['cvms'][0]['address'])
    h[2]['initial-passwords.yml'] = yaml.safe_dump(intent)
    with pytest.raises(RecoveryError, match='Password setup'):
        profile(h)
    assert not h[5]


@pytest.mark.parametrize('field,value', [('cluster_name', 'OTHER'), ('host_key_evidence', ''),
                                        ('password', 'literal-secret'), ('unknown', 'unreviewed')])
def test_snapshot_rejects_wrong_identity_or_unsafe_schema(password_harness, field, value):
    h = password_harness
    intent = yaml.safe_load(h[2]['initial-passwords.yml'])
    intent[field] = value
    h[2]['initial-passwords.yml'] = yaml.safe_dump(intent)
    with pytest.raises(RecoveryError):
        profile(h)


@pytest.mark.parametrize('placement', ['first', 'after-eula', 'duplicate'])
def test_password_action_requires_single_immediate_pe_bootstrap_predecessor(password_harness, placement):
    h = password_harness
    steps = h[3]['steps']
    action = steps.pop(1)
    if placement == 'first':
        steps.insert(0, action)
    elif placement == 'after-eula':
        steps.insert(2, action)
    else:
        steps.insert(1, action)
        steps.insert(2, action)
    with pytest.raises(RecoveryError, match='once, immediately after'):
        profile(h)


@pytest.mark.parametrize('changes', [
    {'passwordSetupApprovalId': None}, {'passwordSetupApprovalId': 'approval'},
    {'passwordSetupConfirmation': None}, {'passwordSetupConfirmation': 'RUN ' + PASSWORD_SETUP},
    {'passwordSetupConfirmation': PASSWORD_SETUP_CONFIRMATION + ' '},
])
def test_independent_approval_and_exact_confirmation_required_even_without_policy(password_harness, changes):
    h = password_harness
    run = ready(h)
    assert h[0].s['step_error'](run['snapshot']['steps'][1]) is None
    before = deepcopy(h[5])
    with pytest.raises(RecoveryError):
        h[0].start_configuration(run['id'], 'admin', {**ADVANCE, **changes}, AUTH)
    assert h[5] == before
    assert h[0].detail_run(run['id'])['status'] == 'ready_for_configuration'


def test_exact_saved_yaml_approval_is_checked_before_start_and_at_submission(password_harness):
    h = password_harness
    run = ready(h)
    checked = []
    def verify(approval, step, filename):
        assert approval == ADVANCE['passwordSetupApprovalId']
        assert step['workflow'] == PASSWORD_SETUP
        assert filename == 'initial-passwords.yml'
        assert step['configContent'] == h[2][filename]
        checked.append(approval)
    h[0].s['verify_step_approval'] = verify
    h[0].s['step_error'] = lambda step: 'Independent approval required' if step['workflow'] == PASSWORD_SETUP else None
    h[0].start_configuration(run['id'], 'admin', ADVANCE, AUTH)
    final = wait_status(h[0], run['id'], 'awaiting_acceptance')
    assert len(checked) == 2
    payload = h[5][2]
    assert payload == {'workflow': PASSWORD_SETUP, 'configFile': 'initial-passwords.yml',
                       'configContent': run['snapshot']['steps'][1]['configContent'],
                       'approvalId': ADVANCE['passwordSetupApprovalId'],
                       'destructiveConfirmation': PASSWORD_SETUP_CONFIRMATION}
    assert not any('script' in p for p in h[5])
    assert len(final['steps']) == 4
    assert ADVANCE['passwordSetupApprovalId'] not in json.dumps(h[1])
    assert 'private-test-session' not in json.dumps(h[1])


def test_rejected_or_expired_approval_cannot_submit(password_harness):
    h = password_harness
    run = ready(h)
    before = deepcopy(h[5])
    def reject(*args):
        raise RecoveryError('Exact approval expired or mismatched', 403)
    h[0].s['verify_step_approval'] = reject
    with pytest.raises(RecoveryError, match='expired or mismatched'):
        h[0].start_configuration(run['id'], 'admin', ADVANCE, AUTH)
    assert h[5] == before


def test_pe_bootstrap_approval_cannot_authorize_host_passwords(password_harness):
    h = password_harness
    run = ready(h)
    h[1]['runs'][0]['bootstrapApprovalIds'] = {'0': 'pe-password-approval'}
    with pytest.raises(RecoveryError, match='independent approval'):
        h[0].start_configuration(run['id'], 'admin', {
            **ADVANCE, 'passwordSetupApprovalId': 'pe-password-approval'}, AUTH)
    assert len(h[5]) == 2


def test_approval_revoked_between_start_and_dispatch_stops_without_write(password_harness):
    h = password_harness
    run = ready(h)
    before = deepcopy(h[5])
    checked = []
    def verify(*args):
        checked.append(args)
        if len(checked) == 2:
            raise RecoveryError('Approval revoked', 403)
    h[0].s['verify_step_approval'] = verify
    h[0].start_configuration(run['id'], 'admin', ADVANCE, AUTH)
    wait_status(h[0], run['id'], 'needs_reconciliation')
    assert h[5] == before


@pytest.mark.parametrize('health_state', ['failed', 'stale'])
def test_password_approval_cannot_bypass_health_gate(password_harness, health_state):
    h = password_harness
    run = ready(h)
    if health_state == 'failed':
        h[0].collect_health(run['id'], 'admin')
    else:
        h[1]['runs'][0]['healthEvidence']['at'] = (
            datetime.now(timezone.utc) - timedelta(minutes=16)).isoformat()
    before = deepcopy(h[5])
    with pytest.raises(RecoveryError):
        h[0].start_configuration(run['id'], 'admin', ADVANCE, AUTH)
    assert h[5] == before


def test_failed_password_job_requires_separate_reconciliation_without_dr_replay(password_harness):
    h = password_harness
    run = ready(h)
    submit = h[0].s['submit']
    def fail(payload, *args):
        job = submit(payload, *args)
        h[4][job['id']]['status'] = 'failed'
        return job
    h[0].s['submit'] = fail
    h[0].start_configuration(run['id'], 'admin', ADVANCE, AUTH)
    failed = wait_status(h[0], run['id'], 'needs_reconciliation')
    assert len(failed['steps']) == 1
    assert not failed['canRetryRegistration']
    with pytest.raises(RecoveryError, match='cannot be replayed'):
        h[0].attest(run['id'], 'admin', {'foundationSessionEnded': True, 'targetReconciled': True,
                    'resumeConfiguration': True, 'notes': 'Mock uncertain write', 'evidenceRef': 'mock/reconcile'})
    assert len(h[5]) == 3


@pytest.mark.parametrize('overrides', [
    {'approvalId': None}, {'approvalId': 'approval'},
    {'destructiveConfirmation': 'RUN ' + PASSWORD_SETUP},
    {'workflow': None, 'script': PASSWORD_SETUP},
    {'configFile': 'different-saved-intent.yml'},
])
def test_direct_job_link_cannot_bypass_password_gates(password_harness, overrides):
    h = password_harness
    run = ready(h)
    payload = {'workflow': PASSWORD_SETUP, 'configFile': 'initial-passwords.yml',
               'configContent': run['snapshot']['steps'][1]['configContent'],
               'approvalId': ADVANCE['passwordSetupApprovalId'],
               'destructiveConfirmation': PASSWORD_SETUP_CONFIRMATION, **overrides}
    job = h[0].s['submit'](payload, AUTH, run['id'])
    # A matching workflow label alone does not prove dedicated, approved dispatch.
    h[4][job['id']]['workflow'] = PASSWORD_SETUP
    with pytest.raises(RecoveryError, match='independently approved dedicated'):
        h[0].link_configuration_job(run['id'], 'admin', {'jobId': job['id']})
    assert len(h[0].detail_run(run['id'])['steps']) == 1


def test_password_success_is_preserved_when_later_settings_fail(password_harness):
    h = password_harness
    run = ready(h)
    submit = h[0].s['submit']
    def fail_settings(payload, *args):
        job = submit(payload, *args)
        if payload['configContent'] == h[2]['eula.yml']:
            h[4][job['id']]['status'] = 'failed'
        return job
    h[0].s['submit'] = fail_settings
    h[0].start_configuration(run['id'], 'admin', ADVANCE, AUTH)
    failed = wait_status(h[0], run['id'], 'needs_reconciliation')
    completed = deepcopy(failed['steps'])
    assert len(completed) == 2
    h[0].attest(run['id'], 'admin', {'foundationSessionEnded': True, 'targetReconciled': True,
                'resumeConfiguration': True, 'notes': 'Mock settings failure reconciled',
                'evidenceRef': 'mock/settings'})
    h[0].attest_health(run['id'], 'admin', HEALTH)
    h[0].s['submit'] = submit
    # No password permission is required or retained for already completed work.
    h[0].start_configuration(run['id'], 'admin', {}, AUTH)
    final = wait_status(h[0], run['id'], 'awaiting_acceptance')
    assert final['steps'][:2] == completed
    assert len([p for p in h[5] if p.get('workflow') == PASSWORD_SETUP]) == 1


def test_configure_api_smoke_forwards_approval_and_confirmation(client, auth_headers, password_harness, monkeypatch):
    import server
    h = password_harness
    run = ready(h)
    submit = h[0].s['submit']
    monkeypatch.setattr(server._recovery_service, 's', {
        **h[0].s, 'submit': lambda payload, auth, owner: submit(payload, AUTH, owner)})
    path = f'/api/recovery/runs/{run["id"]}/configure'
    assert client.post(path, json=ADVANCE).status_code == 401
    assert client.post(path, headers=auth_headers, json={}).status_code == 400
    response = client.post(path, headers=auth_headers, json=ADVANCE)
    assert response.status_code == 200, response.get_json()
    wait_status(server._recovery_service, run['id'], 'awaiting_acceptance')
    assert h[5][2]['workflow'] == PASSWORD_SETUP
    assert h[5][2]['approvalId'] == ADVANCE['passwordSetupApprovalId']
    assert h[5][2]['destructiveConfirmation'] == PASSWORD_SETUP_CONFIRMATION
