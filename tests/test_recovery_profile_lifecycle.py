"""Profile management is metadata-only; test irreversible deletion boundaries."""
from copy import deepcopy
import threading

import pytest

from disaster_recovery import RecoveryError, PROFILE_BLOCKING
from tests.test_disaster_recovery import harness, profile


def action_data(p, action, **overrides):
    return {'expectedRevision': len(p['revisions']), 'expectedUpdatedAt': p['updatedAt'],
            'confirmation': f'{action.upper()} {p["name"]}', 'notes': 'Operator reviewed profile usage.', **overrides}


def test_archive_restore_retains_immutable_baselines_and_audit(harness):
    s, state, configs, pipeline, _, calls, _, _ = harness
    p = profile(harness); original = deepcopy(p['revisions'])
    audit = []; s.s['audit'] = lambda *args: audit.append(args)
    archived = s.profile_action(p['id'], 'administrator', action_data(p, 'archive'), 'archive')
    assert archived['archivedBy'] == 'administrator'
    assert archived['revisions'] == original and not archived['lifecycle']['canEdit']
    assert s.overview()['profiles'][0]['archivedAt']
    with pytest.raises(RecoveryError, match='Restore'):
        s.approve(p['id'], 'admin', {'sha256': original[0]['sha256'], 'notes': 'review'})
    with pytest.raises(RecoveryError, match='Restore'):
        s.prepare({'profileId': p['id'], 'sha256': original[0]['sha256'], 'mode': 'recovery'}, 'admin')
    with pytest.raises(RecoveryError, match='Restore'):
        s.profile({'name': 'Edited', 'datacenterId': p['datacenterId']}, 'admin', p['id'])
    restored = s.profile_action(p['id'], 'administrator', action_data(archived, 'restore'), 'restore')
    assert 'archivedAt' not in restored and restored['revisions'] == original
    assert restored['lifecycle']['canEdit']
    assert [e['action'] for e in s.detail_profile(p['id'])['lifecycleEvents']] == ['archive', 'restore']
    assert [a[0] for a in audit] == ['profile_archive', 'profile_restore']
    assert state['runs'] == [] and calls == [] and configs and pipeline


@pytest.mark.parametrize('status', sorted(PROFILE_BLOCKING | {'future_unknown_state'}))
def test_open_runs_block_edit_and_archive_with_exact_run_identity(harness, status):
    s, state, _, _, _, calls, dc, _ = harness
    p = profile(harness)
    state['runs'].append({'id': 'blocking-run', 'profileId': p['id'], 'status': status})
    lifecycle = s.detail_profile(p['id'])['lifecycle']
    assert lifecycle['blockers'] == [{'id': 'blocking-run', 'status': status}]
    assert not any(lifecycle[k] for k in ('canEdit', 'canArchive', 'canDelete'))
    for action in ('archive', 'delete'):
        with pytest.raises(RecoveryError) as error:
            s.profile_action(p['id'], 'admin', action_data(p, action), action)
        assert error.value.status == 409
    with pytest.raises(RecoveryError, match='blocking-run'):
        s.profile({'name': 'Edited', 'datacenterId': dc['id']}, 'admin', p['id'])
    assert calls == []


@pytest.mark.parametrize('status', ['accepted', 'closed_reconciled'])
def test_even_terminal_run_history_prevents_deletion(harness, status):
    s, state, *_ = harness; p = profile(harness)
    state['runs'].append({'id': 'historical-run', 'profileId': p['id'], 'status': status})
    assert s.detail_profile(p['id'])['lifecycle']['canArchive']
    with pytest.raises(RecoveryError, match='history'):
        s.profile_action(p['id'], 'admin', action_data(p, 'delete'), 'delete')
    assert state['runs'][0]['id'] == 'historical-run'


def test_unused_delete_requires_exact_confirmation_and_retains_files_and_audit(harness):
    s, state, configs, pipeline, _, calls, _, _ = harness; p = profile(harness)
    original_files, original_pipeline = deepcopy(configs), deepcopy(pipeline)
    for changed in ({'confirmation': 'DELETE other'}, {'notes': ''}, {'expectedRevision': True}, {'notes': 'x\x00y'}):
        with pytest.raises(RecoveryError):
            s.profile_action(p['id'], 'admin', action_data(p, 'delete', **changed), 'delete')
    result = s.profile_action(p['id'], 'admin', action_data(p, 'delete'), 'delete')
    assert result == {'deleted': True, 'id': p['id']} and state['profiles'] == []
    assert state['profileEvents'][-1]['profileName'] == p['name']
    assert configs == original_files and pipeline == original_pipeline and not calls


def test_managed_references_and_unavailable_usage_checks_fail_closed(harness):
    s = harness[0]; p = profile(harness)
    s.s['profile_references'] = lambda identity: ['managed-cluster']
    assert not s.detail_profile(p['id'])['lifecycle']['canDelete']
    with pytest.raises(RecoveryError, match='Managed-cluster records'):
        s.profile_action(p['id'], 'admin', action_data(p, 'delete'), 'delete')
    def unavailable(identity):
        raise ValueError('private raw storage detail')
    s.s['profile_references'] = unavailable
    value = s.detail_profile(p['id'])['lifecycle']
    assert value['canArchive'] and not value['canDelete'] and value['linkedClusterCount'] is None
    assert 'private raw' not in value['deleteReason']
    with pytest.raises(RecoveryError, match='unavailable'):
        s.profile_action(p['id'], 'admin', action_data(p, 'delete'), 'delete')


def test_stale_edit_and_lifecycle_submissions_cannot_replace_newer_revision(harness):
    s, _, _, _, _, _, dc, _ = harness; p = profile(harness)
    edit = {'name': 'Edited', 'datacenterId': dc['id'], 'deploymentConfigFile': 'deploy.yml', 'pipelineId': 'pipe',
            'expectedRevision': 1, 'expectedUpdatedAt': p['updatedAt']}
    changed = s.profile(edit, 'admin', p['id'])
    assert len(changed['revisions']) == 2 and changed['revisions'][0] == p['revisions'][0]
    assert not changed['revisions'][-1].get('approvedBy')
    for operation in (lambda: s.profile(edit, 'admin', p['id']),
                      lambda: s.profile_action(p['id'], 'admin', action_data(p, 'archive'), 'archive')):
        with pytest.raises(RecoveryError, match='changed'):
            operation()


def test_concurrent_prepare_and_delete_cannot_create_orphaned_run(harness):
    s, state, *_ = harness; p = profile(harness)
    s.approve(p['id'], 'reviewer', {'sha256': p['revisions'][0]['sha256'], 'notes': 'Reviewed'})
    barrier = threading.Barrier(2); results = []
    def attempt(delete):
        barrier.wait()
        try:
            if delete: s.profile_action(p['id'], 'admin', action_data(p, 'delete'), 'delete')
            else: s.prepare({'profileId': p['id'], 'sha256': p['revisions'][0]['sha256'], 'mode': 'recovery'}, 'admin')
            results.append('delete' if delete else 'prepare')
        except RecoveryError:
            results.append('blocked')
    threads = [threading.Thread(target=attempt, args=(v,)) for v in (True, False)]
    for t in threads: t.start()
    for t in threads: t.join(timeout=5); assert not t.is_alive()
    assert results.count('blocked') == 1
    assert not state['runs'] or any(p['id'] == state['runs'][0]['profileId'] for p in state['profiles'])


def test_lifecycle_api_is_administrator_only_and_validates_persisted_references(client, auth_headers, harness, monkeypatch):
    import server
    s, state, *_ = harness
    p = profile(harness)
    monkeypatch.setattr(server._recovery_service, 's', s.s)
    for role in ('viewer', 'operator'):
        client.post('/api/users', headers=auth_headers, json={'username': role, 'password': 'FixtureOnly123!', 'role': role})
        token = client.post('/api/auth/login', json={'username': role, 'password': 'FixtureOnly123!'}).get_json()['token']
        headers = {'Authorization': 'Bearer ' + token}
        assert client.get('/api/recovery', headers=headers).status_code == 200
        for action in ('archive', 'restore', 'delete'):
            url = f'/api/recovery/profiles/{p["id"]}' + ('' if action == 'delete' else '/' + action)
            response = client.open(url, method='DELETE' if action == 'delete' else 'POST', headers=headers, json=action_data(p, action))
            assert response.status_code == 403
    url = f'/api/recovery/profiles/{p["id"]}'
    assert client.post(url + '/archive', json=action_data(p, 'archive')).status_code == 401
    response = client.post(url + '/archive', headers=auth_headers, json=action_data(p, 'archive'))
    assert response.status_code == 200 and state['profiles'][0]['archivedAt']
    assert client.post('/api/recovery/runs', headers=auth_headers, json={'profileId': p['id']}).status_code == 409
    assert client.delete(url, headers=auth_headers, json=action_data(response.get_json(), 'delete')).status_code == 200
    assert client.get(url, headers=auth_headers).status_code == 404


def test_server_reference_reader_rejects_corrupt_metadata_and_finds_link(client, auth_headers):
    import server
    server.write_json(server.CONFIG_DIR / 'cluster_operations.json', {'clusters': [{'id': 'cluster1', 'recoveryProfileId': 'profile1'}]})
    assert server._recovery_profile_references('profile1') == ['cluster1']
    assert server._recovery_profile_references('profile2') == []
    server.write_json(server.CONFIG_DIR / 'cluster_operations.json', {'clusters': 'broken'})
    with pytest.raises(RecoveryError): server._recovery_profile_references('profile1')


def test_missing_reference_provider_disables_irreversible_delete(harness):
    s = harness[0]; p = profile(harness)
    del s.s['profile_references']
    lifecycle = s.detail_profile(p['id'])['lifecycle']
    assert lifecycle['canArchive'] and not lifecycle['canDelete']
    with pytest.raises(RecoveryError, match='unavailable'):
        s.profile_action(p['id'], 'admin', action_data(p, 'delete'), 'delete')


@pytest.mark.parametrize('status', ['prepared', 'submitting', 'deploying', 'needs_reconciliation'])
def test_prepared_closure_never_hides_submitted_work(harness, status):
    s, state, _, _, _, calls, *_ = harness; p = profile(harness)
    s.approve(p['id'], 'reviewer', {'sha256': p['revisions'][0]['sha256'], 'notes': 'Reviewed'})
    r = s.prepare({'profileId': p['id'], 'sha256': p['revisions'][0]['sha256'], 'mode': 'rehearsal'}, 'admin')
    data = {'expectedUpdatedAt': r['updatedAt'], 'confirmation': 'CLOSE PREPARED ' + r['clusterName'], 'notes': 'Abandoned before any deployment.'}
    state['runs'][0]['status'] = status
    if status != 'prepared':
        with pytest.raises(RecoveryError): s.close_prepared(r['id'], 'admin', data)
    else:
        with pytest.raises(RecoveryError, match='changed'): s.close_prepared(r['id'], 'admin', {**data,'expectedUpdatedAt':'stale'})
        with pytest.raises(RecoveryError, match='confirmation'): s.close_prepared(r['id'], 'admin', {**data,'confirmation':'wrong'})
        state['runs'][0]['deploymentJobId'] = 'uncertain-job'
        with pytest.raises(RecoveryError, match='unsubmitted'): s.close_prepared(r['id'], 'admin', data)
        state['runs'][0].pop('deploymentJobId')
        closed = s.close_prepared(r['id'], 'admin', data)
        assert closed['status'] == 'closed_reconciled' and closed['snapshot'] == r['snapshot']
        assert closed['reconciliation']['source'] == 'unsubmitted_preparation'
        permissions = s.detail_profile(p['id'])['lifecycle']
        assert permissions['canEdit'] and permissions['canArchive'] and not permissions['canDelete']
        with pytest.raises(RecoveryError): s.deploy(r['id'], 'admin', {}, '')
    assert calls == []


def test_prepared_closure_api_is_admin_only_and_audited(client, auth_headers, harness, monkeypatch):
    import server
    s = harness[0]; p = profile(harness)
    audit = []; s.s['audit'] = lambda *args: audit.append(args)
    monkeypatch.setattr(server._recovery_service, 's', s.s)
    s.approve(p['id'], 'reviewer', {'sha256': p['revisions'][0]['sha256'], 'notes': 'Reviewed'})
    r = s.prepare({'profileId': p['id'], 'sha256': p['revisions'][0]['sha256'], 'mode': 'rehearsal'}, 'admin')
    url = '/api/recovery/runs/' + r['id'] + '/close-prepared'
    data = {'expectedUpdatedAt':r['updatedAt'],'confirmation':'CLOSE PREPARED '+r['clusterName'],'notes':'Abandoned before submission.'}
    assert client.post(url,json=data).status_code == 401
    for role in ('viewer','operator'):
        client.post('/api/users',headers=auth_headers,json={'username':role,'password':'FixtureOnly123!','role':role})
        token = client.post('/api/auth/login',json={'username':role,'password':'FixtureOnly123!'}).get_json()['token']
        assert client.post(url,headers={'Authorization':'Bearer '+token},json=data).status_code == 403
    response = client.post(url,headers=auth_headers,json=data)
    assert response.status_code == 200 and response.get_json()['status'] == 'closed_reconciled'
    assert audit[-1] == ('prepared_run_closed','admin',r['id'])
