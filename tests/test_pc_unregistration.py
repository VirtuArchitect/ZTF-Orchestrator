"""All PC access is faked; never execute removal against a target."""
import copy
import datetime
import json
import urllib.error

import pytest
import yaml
import pc_unregistration as core

PC = '00000000-0000-4000-8000-000000000001'
PE = '00000000-0000-4000-8000-000000000002'


def intent(reviewed=True):
    result = {'pc_endpoint': 'https://pc.example.com:9440', 'pc_credential': 'pc_admin', 'pe_cluster_uuid': PE}
    if reviewed:
        result.update(expected_pc_uuid=PC, expected_pe_name='HCI-01', dependencies_reviewed=True)
    return result


class Fake:
    def __init__(self):
        self.writes = []; self.removed = False; self.status = 'SUCCEEDED'; self.pc = PC; self.name = 'HCI-01'

    def pc_uuid(self): return self.pc

    def pe(self, identity, absent=False):
        return None if absent and self.removed else {'uuid': PE, 'name': self.name}

    def unregister(self, pc, pe, dry_run=False):
        self.writes.append((pc, pe, dry_run))
        if not dry_run: self.removed = True
        return {'extId': 'task:fixture'}

    def task(self, identity): return {'status': self.status}


@pytest.mark.parametrize('patch', [
    {'pc_endpoint': 'http://pc.example.com'}, {'pc_endpoint': 'https://u:p@pc.example.com'},
    {'pc_endpoint': 'https://pc.example.com/a'}, {'pc_endpoint': 'https://pc.example.com?x=y'},
    {'pc_endpoint': 'https://127.0.0.1'}, {'pc_endpoint': 'https://169.254.169.254'},
    {'pc_endpoint': 'https://0.0.0.0'}, {'pc_endpoint': 'https://[::1]'},
    {'pc_endpoint': 'https://[::ffff:127.0.0.1]'},
    {'pc_endpoint': 'https://pc.example.com:443'}, {'pe_cluster_uuid': '../x'},
    {'pe_cluster_uuid': '00000000-0000-0000-0000-000000000000'},
    {'pc_credential': 'password:secret'}, {'password': 'not-allowed'}, {'dependencies_reviewed': 'true'},
])
def test_reject_invalid_intent(patch):
    with pytest.raises(core.UnregistrationError): core.validate_intent({**intent(), **patch})


def test_review_and_single_submission_then_verified_absence():
    fake = Fake(); factory = lambda *a: fake
    reviewed = core.review(intent(False), ('admin', 'secret'), factory)
    assert reviewed['expected_pc_uuid'] == PC and reviewed['expected_pe_name'] == 'HCI-01'
    assert fake.writes == []
    reviewed['dependencies_reviewed'] = True
    result = core.execute(reviewed, ('admin', 'secret'), lambda s: None, client_factory=factory, sleep=lambda _: None)
    assert fake.writes == [(PC, PE, True), (PC, PE, False)]
    assert result['pcInventoryRemovalVerified'] is True
    assert result['peSideCleanupVerified'] is False and result['followupRequired'] is True


@pytest.mark.parametrize('status', ['FAILED', 'CANCELLED', None, 'UNKNOWN'])
def test_vendor_preflight_blocks_write(status):
    fake = Fake(); fake.status = status
    with pytest.raises(core.UnregistrationError):
        core.execute(intent(), ('admin', 'secret'), lambda s: None, client_factory=lambda *a: fake, sleep=lambda _: None)
    assert fake.writes == [(PC, PE, True)]


def test_approval_is_rechecked_after_vendor_preflight_before_mutation():
    fake = Fake()
    def expired(): raise core.UnregistrationError('Approval expired during preflight')
    with pytest.raises(core.UnregistrationError, match='expired'):
        core.execute(intent(), ('admin', 'secret'), lambda s: None, client_factory=lambda *a: fake,
                     authorize=expired)
    assert fake.writes == [(PC, PE, True)]


@pytest.mark.parametrize('change', ['pc', 'name', 'dependencies'])
def test_changed_identity_or_missing_ack_never_submits(change):
    fake = Fake(); config = intent()
    if change == 'pc': fake.pc = PE
    if change == 'name': fake.name = 'another-cluster'
    if change == 'dependencies': config['dependencies_reviewed'] = False
    with pytest.raises(core.UnregistrationError):
        core.execute(config, ('admin', 'secret'), lambda s: None, client_factory=lambda *a: fake)
    assert not fake.writes


def test_uncertain_post_write_failure_never_retries():
    fake = Fake()
    def task(identity):
        if len(fake.writes) == 2: raise core.UnregistrationError('Transport failed')
        return {'status': 'SUCCEEDED'}
    fake.task = task
    with pytest.raises(core.UnregistrationError):
        core.execute(intent(), ('admin', 'secret'), lambda s: None, client_factory=lambda *a: fake)
    assert len(fake.writes) == 2


def test_absence_requires_fresh_inventory_read():
    fake = Fake(); fake.pe = lambda *a, **k: {'uuid': PE, 'name': 'HCI-01'}
    with pytest.raises(core.UnregistrationError, match='remains'):
        core.execute(intent(), ('admin', 'secret'), lambda s: None, client_factory=lambda *a: fake, sleep=lambda _: None)
    assert len(fake.writes) == 2


def test_cancel_before_request():
    fake = Fake()
    with pytest.raises(core.UnregistrationError):
        core.execute(intent(), ('admin', 'secret'), lambda s: None, cancelled=lambda: True, client_factory=lambda *a: fake)
    assert not fake.writes


def test_transport_contract_and_redaction(monkeypatch):
    client = core.Client(intent(), ('admin', 'fixture-secret'))
    calls = []
    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self, count): return json.dumps({'data': {'extId': 'task:fixture'}}).encode()
    class Opener:
        def open(self, request, **kwargs): calls.append(request); return Response()
    client.opener = Opener()
    client.unregister(PC, PE, True); client.unregister(PC, PE)
    assert calls[0].full_url.endswith('/'+PC+'/$actions/unregister?$dryrun=true')
    assert json.loads(calls[1].data)['extId'] == PE
    assert calls[1].get_header('Ntnx-request-id') != calls[0].get_header('Ntnx-request-id')
    class Broken:
        def open(self, *a, **k): raise OSError('fixture-secret')
    client.opener = Broken()
    with pytest.raises(core.UnregistrationError) as error: client.pc_uuid()
    assert 'fixture-secret' not in str(error.value)


def test_only_verified_absence_accepts_404():
    client = core.Client(intent(), ('admin', 'secret'))
    class Missing:
        def open(self, *a, **k): raise urllib.error.HTTPError('url', 404, 'secret', {}, None)
    client.opener = Missing()
    assert client.pe(PE, absent=True) is None
    with pytest.raises(core.UnregistrationError): client.pe(PE)


def test_strict_tls_and_no_redirects():
    import ssl
    import urllib.request
    client = core.Client(intent(), ('admin', 'secret'))
    https = next(h for h in client.opener.handlers if isinstance(h, urllib.request.HTTPSHandler))
    assert https._context.verify_mode == ssl.CERT_REQUIRED
    assert https._context.check_hostname is True
    redirect = next(h for h in client.opener.handlers if isinstance(h, urllib.request.HTTPRedirectHandler))
    assert redirect.redirect_request(None, None, 302, '', {}, 'https://other.example.com') is None


def test_reference_resolution_never_exposes_raw_error():
    def broken(ref): raise RuntimeError('fixture-password-and-private-error')
    with pytest.raises(core.UnregistrationError) as error: core.credentials(intent(), broken)
    assert 'fixture-password' not in str(error.value)


@pytest.mark.parametrize('endpoint', ['/api/execute', '/api/jobs'])
def test_missing_approval_and_unreviewed_intent_block_without_target(client, auth_headers, monkeypatch, endpoint):
    import server
    monkeypatch.setattr(core.Client, '__init__', lambda *a: pytest.fail('No target access permitted'))
    payload = {'workflow': core.WORKFLOW, 'configContent': yaml.safe_dump(intent()), 'configFile': 'remove.yml',
               'riskAcknowledged': True, 'destructiveConfirmation': 'UNREGISTER '+PE}
    response = client.post(endpoint, headers=auth_headers, json=payload)
    assert response.status_code == 403 and 'approved' in response.json['error'].lower()
    payload['configContent'] = yaml.safe_dump(intent(False))
    assert client.post(endpoint, headers=auth_headers, json=payload).status_code == 403


def test_approval_binding_and_one_use(client, monkeypatch):
    import server
    server._require_engines()
    content = yaml.safe_dump(intent())
    approval = server._approval_manager.create_request(core.WORKFLOW, 'remove.yml', content, 'requester')
    server._approval_manager.decide(approval['id'], 'approved', 'reviewer')
    data = {'workflow': core.WORKFLOW, 'configFile': 'remove.yml', 'configContent': content,
            'approvalId': approval['id'], 'riskAcknowledged': True, 'destructiveConfirmation': 'UNREGISTER '+PE}
    assert server._unregistration_submission(data, 'admin')[0] is None
    assert server._unregistration_submission(data, 'operator')[0]
    assert server._unregistration_submission(dict(data, configContent=content+'\n'), 'admin')[0]
    assert server._unregistration_submission(dict(data, riskAcknowledged=False), 'admin')[0]
    server._approval_manager.link_job(approval['id'], 'job-one')
    assert server._unregistration_submission(data, 'admin')[0]
    assert server._unregistration_submission(data, 'admin', 'job-one')[0] is None
    assert server._unregistration_submission(data, 'admin', 'job-other')[0]


@pytest.mark.parametrize('mode', ['expired', 'self-approved', 'rejected'])
def test_invalid_approval_state_blocks_execution(client, mode, monkeypatch):
    import server
    content = yaml.safe_dump(intent())
    approval = {'workflow': core.WORKFLOW, 'configFile': 'remove.yml', 'configContent': content,
                'status': 'approved', 'requestedBy': 'requester', 'decidedBy': 'reviewer',
                'expiresAt': (datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=1)).isoformat()}
    if mode == 'expired': approval['expiresAt'] = '2020-01-01T00:00:00+00:00'
    if mode == 'self-approved': approval['decidedBy'] = 'requester'
    if mode == 'rejected': approval['status'] = 'rejected'
    server._require_engines()
    monkeypatch.setattr(server._approval_manager, 'get_approval', lambda _: approval)
    payload = {'workflow': core.WORKFLOW, 'configFile': 'remove.yml', 'configContent': content,
               'approvalId': 'fixture', 'riskAcknowledged': True, 'destructiveConfirmation': 'UNREGISTER '+PE}
    assert server._unregistration_submission(payload, 'admin')[0]


def test_self_approval_blocked_and_dry_run_offline(client, auth_headers, monkeypatch):
    import server
    server._require_engines()
    monkeypatch.setattr(core.Client, '__init__', lambda *a: pytest.fail('No target access permitted'))
    request = client.post('/api/approvals', headers=auth_headers, json={
        'workflow': core.WORKFLOW, 'configFile': 'remove.yml', 'configContent': yaml.safe_dump(intent())})
    assert request.status_code == 201
    assert client.post('/api/approvals/'+request.json['id']+'/approve', headers=auth_headers, json={}).status_code == 403
    assert core.WORKFLOW in server.DEFAULT_APPROVAL_REQUIRED_WORKFLOWS
    assert server._workflow_requires_approval(core.WORKFLOW, {'approvalRequiredWorkflows': []})
    assert server._normalize_script_ids([core.SCRIPT, 'RegisterToPc'])[1]
    assert core.SCRIPT not in server.PIPELINE_SCRIPT_IDS
    assert server._scheduled_pe_user_error(core.SCRIPT)


def test_review_api_returns_reference_only_intent(client, auth_headers, monkeypatch):
    import server
    fake = Fake()
    monkeypatch.setattr(core, 'Client', lambda *a: pytest.fail('Use injected factory'))
    # review's default is deliberately replaced as well; no network client may run.
    original = core.review
    monkeypatch.setattr(core, 'review', lambda config, credential: original(config, credential, lambda *a: fake))
    monkeypatch.setattr(server, '_pe_login_title_resolver', lambda _: lambda ref: ('admin', 'fixture-secret'))
    response = client.post('/api/pc-unregistration/review', headers=auth_headers, json={'configContent': yaml.safe_dump(intent(False))})
    assert response.status_code == 200
    assert response.json['config']['expected_pc_uuid'] == PC
    assert 'fixture-secret' not in response.get_data(as_text=True)
    assert not fake.writes


@pytest.mark.parametrize('role', ['operator', 'viewer'])
def test_non_admin_cannot_review_or_submit(client, role):
    import server
    headers = {'Authorization': 'Bearer '+server._create_session('fixture-'+role, role)}
    for path in ['/api/pc-unregistration/review', '/api/jobs', '/api/execute', '/api/approvals']:
        response = client.post(path, headers=headers, json={'workflow': core.WORKFLOW,
            'configContent': yaml.safe_dump(intent()), 'configFile': 'remove.yml'})
        assert response.status_code == 403


@pytest.mark.parametrize('dry_run', [False, True])
def test_durable_job_api_smoke_uses_native_adapter_only(client, auth_headers, monkeypatch, dry_run):
    import server
    import time
    server._require_engines()
    monkeypatch.setattr(server, '_pe_login_title_resolver', lambda _: lambda ref: ('admin', 'fixture-secret'))
    monkeypatch.setattr(core.Client, '__init__', lambda *a: pytest.fail('No target requests'))
    calls = []
    def execute(config, credential, emit, **kwargs):
        calls.append(config)
        emit('Verified simulated PC task and inventory removal')
        return {'pcInventoryRemovalVerified': True, 'peSideCleanupVerified': False}
    monkeypatch.setattr(core, 'execute', execute)
    content = yaml.safe_dump(intent())
    approval = server._approval_manager.create_request(core.WORKFLOW, 'remove.yml', content, 'admin')
    server._approval_manager.decide(approval['id'], 'approved', 'different-admin')
    payload = {'workflow': core.WORKFLOW, 'configFile': 'remove.yml', 'configContent': content,
               'dryRun': dry_run, 'approvalId': approval['id'], 'riskAcknowledged': True,
               'destructiveConfirmation': 'UNREGISTER '+PE}
    response = client.post('/api/jobs', headers=auth_headers, json=payload)
    assert response.status_code == 202
    identity = response.json['id']
    for _ in range(100):
        job = server._job_manager.get_job(identity)
        if job['status'] in {'success', 'failed', 'cancelled'}: break
        time.sleep(.02)
    assert job['status'] == 'success'
    assert len(calls) == (0 if dry_run else 1)
    assert 'fixture-secret' not in json.dumps(job)
    if not dry_run:
        assert client.post('/api/jobs', headers=auth_headers, json=payload).status_code == 403
