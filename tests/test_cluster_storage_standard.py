"""No real PE requests: lifecycle and dependency evidence comes from fakes."""
import copy
import json
import time
import urllib.error

import pytest
import yaml

import cluster_storage_standard as core

CLUSTER = '00000000-0000-4000-8000-000000000001'
DEFAULT = '00000000-0000-4000-8000-000000000002'


def intent(reviewed=True):
    config = {'pe_endpoint': 'https://pe.example.com:9440', 'pe_credential': 'pe_admin',
              'containers': [{'name': name, 'replication_factor': 2, 'compression_enabled': True} for name in ('SITE-A-DATA', 'SITE-A-INFRA', 'SITE-A-SERVICE')]}
    if reviewed:
        config.update(expected_cluster_uuid=CLUSTER, expected_default={'name': 'default-container-12345', 'uuid': DEFAULT}, dependencies_reviewed=True)
    return config


class Fake:
    def __init__(self):
        self.rows = [{'name': 'default-container-12345', 'containerUuid': DEFAULT, 'id': 12345},
                     {'name': 'NutanixManagementShare'}, {'name': 'SelfServiceContainer'}]
        self.writes = []
        self.blocked = False
        self.uuid = CLUSTER
        self.retain_default = False

    def cluster_uuid(self): return self.uuid
    def containers(self): return copy.deepcopy(self.rows)
    def create(self, desired):
        self.writes.append(('create', desired['name']))
        self.rows.append({'name': desired['name'], **{field: value for field, (value, _) in core.container_expectations(desired).items()}})
    def check_dependencies(self, target):
        if self.blocked: raise core.CleanupBlocked('Default cleanup blocked: VDisks remain.')
    def delete(self, row):
        self.writes.append(('delete', row['name']))
        if not self.retain_default: self.rows = [r for r in self.rows if r['name'] != row['name']]


def run(config=None, fake=None, **kwargs):
    return core.execute(config or intent(), ('admin', 'private-fixture'), lambda _: None,
                        client_factory=lambda *a: fake, sleep=lambda _: None, **kwargs)


def test_review_is_read_only_and_records_exact_default():
    fake = Fake()
    result = core.review(intent(False), ('admin', 'secret'), lambda *a: fake)
    assert result['expected_default'] == intent()['expected_default']
    assert result['expected_cluster_uuid'] == CLUSTER
    assert result['dependencies_reviewed'] is False
    assert not fake.writes


def test_full_standard_verifies_replacements_before_single_default_deletion():
    fake = Fake()
    result = run(fake=fake)
    assert result == {'replacementContainersVerified': True, 'defaultCleanup': 'deleted', 'defaultRemovalVerified': True}
    assert [kind for kind, _ in fake.writes] == ['create', 'create', 'create', 'delete']
    assert {'NutanixManagementShare', 'SelfServiceContainer'} <= {r['name'] for r in fake.rows}


def test_names_are_cluster_specific_not_hardcoded():
    config = intent(); fake = Fake()
    for index, row in enumerate(config['containers']): row['name'] = 'OTHER-SITE-'+str(index)
    run(config, fake)
    assert [name for kind, name in fake.writes if kind == 'create'] == ['OTHER-SITE-0', 'OTHER-SITE-1', 'OTHER-SITE-2']


@pytest.mark.parametrize('mutation', ['too-few', 'duplicate', 'system', 'default', 'unknown', 'password', 'rf', 'bool-rf', 'http', 'capacity'])
def test_invalid_yaml_never_writes(mutation):
    config = intent(); fake = Fake()
    if mutation == 'too-few': config['containers'].pop()
    if mutation == 'duplicate': config['containers'][1]['name'] = config['containers'][0]['name'].lower()
    if mutation == 'system': config['containers'][0]['name'] = 'SelfServiceContainer'
    if mutation == 'default': config['containers'][0]['name'] = 'default-container-12345'
    if mutation == 'unknown': config['containers'][0]['force'] = True
    if mutation == 'password': config['password'] = 'secret'
    if mutation == 'rf': config['containers'][0]['replication_factor'] = 4
    if mutation == 'bool-rf': config['containers'][0]['replication_factor'] = True
    if mutation == 'http': config['pe_endpoint'] = 'http://pe.example.com'
    if mutation == 'capacity': config['containers'][0]['reserved_in_gb'] = -1
    with pytest.raises(core.StorageError): run(config, fake)
    assert not fake.writes


def test_existing_mismatch_stops_all_mutations():
    fake = Fake()
    fake.rows.append({'name': 'SITE-A-INFRA', 'replicationFactor': 1, 'compressionEnabled': True})
    with pytest.raises(core.StorageError, match='settings differ'): run(fake=fake)
    assert not fake.writes


def test_dependency_block_preserves_replacements_and_default():
    fake = Fake(); fake.blocked = True
    with pytest.raises(core.StorageError, match='VDisks'): run(fake=fake)
    assert len(fake.writes) == 3 and all(kind == 'create' for kind, _ in fake.writes)
    assert core.discover(fake.rows) == intent()['expected_default']


@pytest.mark.parametrize('change', ['uuid', 'default-name', 'default-uuid', 'multiple', 'disappeared'])
def test_changed_or_ambiguous_identity_blocks_all_writes(change):
    fake = Fake()
    if change == 'uuid': fake.uuid = DEFAULT
    if change == 'default-name': fake.rows[0]['name'] = 'default-container-999'
    if change == 'default-uuid': fake.rows[0]['containerUuid'] = CLUSTER
    if change == 'multiple': fake.rows.append({'name': 'default-container-999', 'containerUuid': CLUSTER})
    if change == 'disappeared': fake.rows.pop(0)
    with pytest.raises(core.StorageError): run(fake=fake)
    assert not fake.writes


def test_already_absent_is_distinct_from_deleted_and_new_appearance_blocks():
    fake = Fake(); fake.rows.pop(0)
    config = intent(); config['expected_default'] = None
    assert run(config, fake)['defaultCleanup'] == 'already_absent'
    assert len(fake.writes) == 3
    with pytest.raises(core.StorageError): run(config, Fake())


def test_no_automatic_delete_retry_and_verification_is_required():
    fake = Fake(); fake.retain_default = True
    with pytest.raises(core.StorageError, match='could not be verified'): run(fake=fake)
    assert sum(kind == 'delete' for kind, _ in fake.writes) == 1


def test_creation_failure_or_cancellation_never_deletes():
    fake = Fake()
    def fail(_): raise core.StorageError('Creation failed')
    fake.create = fail
    with pytest.raises(core.StorageError): run(fake=fake)
    assert not fake.writes
    with pytest.raises(core.StorageError): run(fake=Fake(), cancelled=lambda: True)


def test_authorization_rechecked_before_every_write():
    fake = Fake()
    def authorize():
        if len(fake.writes) == 3: raise core.StorageError('Approval expired')
    with pytest.raises(core.StorageError, match='expired'): run(fake=fake, authorize=authorize)
    assert len(fake.writes) == 3


def test_transport_contract_no_force_or_raw_error_leak():
    api = core.Client(intent(), ('admin', 'fixture-secret'))
    calls = []
    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self, count): return b'{"value": true}'
    class Opener:
        def open(self, req, **kwargs): calls.append(req); return Response()
    api.opener = Opener()
    api.delete({'id': 123})
    assert calls[0].full_url.endswith('/api/nutanix/v1/containers/123')
    assert calls[0].method == 'DELETE' and '?' not in calls[0].full_url
    class Broken:
        def open(self, *a, **k): raise urllib.error.HTTPError('url', 500, 'fixture-secret', {}, None)
    api.opener = Broken()
    with pytest.raises(core.StorageError, match='blocked') as error: api.delete({'id': 123})
    assert 'fixture-secret' not in str(error.value)


@pytest.mark.parametrize('body', [{}, {'entities': []}, {'entities': [], 'metadata': {'total_entities': 1}}])
def test_partial_inventory_is_never_treated_as_empty(body):
    api = core.Client(intent(), ('admin', 'secret'))
    api.request = lambda *a: body
    with pytest.raises(core.StorageError): api.containers()


def test_dependency_scan_requires_complete_disk_ownership():
    api = core.Client(intent(), ('admin', 'secret'))
    for rows in [[{'storage_container_uuid': DEFAULT}], [{}]]:
        api.rows = lambda *a: rows
        with pytest.raises(core.StorageError): api.check_dependencies(intent()['expected_default'])
    api.rows = lambda *a: []
    api.check_dependencies(intent()['expected_default'])


@pytest.mark.parametrize('path', ['/api/jobs', '/api/execute'])
def test_unapproved_requests_block_without_network(client, auth_headers, monkeypatch, path):
    monkeypatch.setattr(core, 'Client', lambda *a: pytest.fail('No network allowed'))
    response = client.post(path, headers=auth_headers, json={'workflow': core.WORKFLOW,
        'configContent': yaml.safe_dump(intent()), 'configFile': 'storage.yml',
        'riskAcknowledged': True, 'destructiveConfirmation': 'APPLY STORAGE '+CLUSTER})
    assert response.status_code == 403 and 'approved' in response.json['error'].lower()


def test_approval_binding_role_expiry_and_replay(client):
    import server
    server._require_engines()
    content = yaml.safe_dump(intent())
    approval = server._approval_manager.create_request(core.WORKFLOW, 'storage.yml', content, 'requester')
    server._approval_manager.decide(approval['id'], 'approved', 'reviewer')
    data = {'workflow': core.WORKFLOW, 'configContent': content, 'configFile': 'storage.yml',
            'approvalId': approval['id'], 'riskAcknowledged': True, 'destructiveConfirmation': 'APPLY STORAGE '+CLUSTER}
    assert server._storage_standard_submission(data, 'admin')[0] is None
    assert server._storage_standard_submission(data, 'operator')[0]
    assert server._storage_standard_submission(dict(data, configContent=content+'\n'), 'admin')[0]
    assert server._storage_standard_submission(dict(data, script='DeleteContainerPe'), 'admin')[0]
    assert server._storage_standard_submission(dict(data, riskAcknowledged=False), 'admin')[0]
    server._approval_manager.link_job(approval['id'], 'fixture-job')
    assert server._storage_standard_submission(data, 'admin')[0]
    assert server._storage_standard_submission(data, 'admin', 'fixture-job')[0] is None
    assert server._workflow_requires_approval(core.WORKFLOW, {'approvalRequiredWorkflows': []})
    assert server._schedule_validation_error({'workflow': core.WORKFLOW, 'cronExpr': '* * * * *'})


@pytest.mark.parametrize('role', ['operator', 'viewer'])
def test_non_admin_cannot_review_approve_or_submit(client, role):
    import server
    headers = {'Authorization': 'Bearer '+server._create_session('test-'+role, role)}
    for path in ['/api/cluster-storage-standard/review', '/api/jobs', '/api/execute', '/api/approvals']:
        response = client.post(path, headers=headers, json={'workflow': core.WORKFLOW, 'configContent': yaml.safe_dump(intent()), 'configFile': 'storage.yml'})
        assert response.status_code == 403


@pytest.mark.parametrize('dry_run,blocked', [(False, False), (True, False), (False, True)])
def test_durable_job_smoke_uses_fake_pe_only(client, auth_headers, monkeypatch, dry_run, blocked):
    import server
    server._require_engines()
    fake = Fake(); fake.blocked = blocked
    monkeypatch.setattr(server, '_pe_login_title_resolver', lambda _: lambda ref: ('admin', 'fixture-secret'))
    monkeypatch.setattr(core, 'Client', lambda *a: fake)
    content = yaml.safe_dump(intent())
    approval = server._approval_manager.create_request(core.WORKFLOW, 'storage.yml', content, 'requester')
    server._approval_manager.decide(approval['id'], 'approved', 'reviewer')
    data = {'workflow': core.WORKFLOW, 'configContent': content, 'configFile': 'storage.yml', 'approvalId': approval['id'],
            'riskAcknowledged': True, 'destructiveConfirmation': 'APPLY STORAGE '+CLUSTER, 'dryRun': dry_run}
    response = client.post('/api/jobs', headers=auth_headers, json=data)
    assert response.status_code == 202
    for _ in range(100):
        job = server._job_manager.get_job(response.json['id'])
        if job['status'] in ('success', 'failed'): break
        time.sleep(.02)
    assert job['status'] == ('failed' if blocked else 'success')
    assert len(fake.writes) == (0 if dry_run else 3 if blocked else 4)
    if blocked:
        assert job['diagnostics']['category'] == 'storage_cleanup_blocked'
        assert job['diagnostics']['defaultCleanup'] == 'blocked'
        assert job['diagnostics']['replacementContainersVerified'] is True
        assert job['returnCode'] != 0
    assert 'fixture-secret' not in json.dumps(job)
    if not dry_run: assert client.post('/api/jobs', headers=auth_headers, json=data).status_code == 403


def test_review_api_and_independent_approval_smoke(client, auth_headers, monkeypatch):
    import server
    fake = Fake()
    monkeypatch.setattr(core, 'Client', lambda *a: fake)
    monkeypatch.setattr(server, '_pe_login_title_resolver', lambda _: lambda ref: ('admin', 'fixture-secret'))
    response = client.post('/api/cluster-storage-standard/review', headers=auth_headers,
                           json={'configContent': yaml.safe_dump(intent(False))})
    assert response.status_code == 200
    assert response.json['config']['expected_default']['uuid'] == DEFAULT
    assert not fake.writes and 'fixture-secret' not in response.get_data(as_text=True)
    content = response.json['config']; content['dependencies_reviewed'] = True
    approval = client.post('/api/approvals', headers=auth_headers, json={'workflow': core.WORKFLOW,
        'configFile': 'storage.yml', 'configContent': yaml.safe_dump(content)})
    assert approval.status_code == 201
    assert client.post('/api/approvals/'+approval.json['id']+'/approve', headers=auth_headers, json={}).status_code == 403
    invalid = client.post('/api/cluster-storage-standard/review', headers=auth_headers,
                          json={'configContent': 'containers: []'})
    assert invalid.status_code == 400 and not fake.writes


def test_https_transport_has_no_tls_bypass_or_redirects():
    import ssl
    import urllib.request
    api = core.Client(intent(), ('admin', 'secret'))
    https = next(h for h in api.opener.handlers if isinstance(h, urllib.request.HTTPSHandler))
    assert https._context.verify_mode == ssl.CERT_REQUIRED and https._context.check_hostname
    redirect = next(h for h in api.opener.handlers if isinstance(h, urllib.request.HTTPRedirectHandler))
    assert redirect.redirect_request(None, None, 302, '', {}, 'https://other.example.com') is None
