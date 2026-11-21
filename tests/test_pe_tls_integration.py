"""Scoped exceptions through authenticated routes and recovery coordination; mocks only."""
from copy import deepcopy
import pytest
import pe_tls
from tests.test_post_deployment import prism, ACCEPTANCE
from tests.test_disaster_recovery import harness, bootstrap_harness, profile, wait_status

EXCEPTION = {'pe_verify_tls': False, 'pe_tls_bypass_reason': pe_tls.REASON}


def test_post_sequence_exception_needs_no_certificate_installation(client, auth_headers, monkeypatch, prism):
    import server
    import post_deployment as post
    monkeypatch.setattr(server.limiter, 'enabled', False)
    monkeypatch.setattr(server, '_pe_login_title_resolver', lambda _: lambda ref: ('admin', 'fixture-only'))
    monkeypatch.setattr(post, 'certificate_check', lambda *_: pytest.fail('TLS exception required certificate installation'))
    config = deepcopy(ACCEPTANCE)
    config['connection'].update(EXCEPTION)
    config['ncc'] = {'hostSerial': 'S2', 'credential': 'cvm_ref', 'hostKey': 'SHA256:' + 'A' * 43}
    created = client.post('/api/post-deployment/runs', json=config, headers=auth_headers)
    assert created.status_code == 201, created.get_json()
    run = created.get_json()
    response = client.post('/api/post-deployment/runs/' + run['id'], headers=auth_headers,
                           json={'action': 'continue', 'revision': run['revision'], 'reference': 'CHG-TLS-1'})
    assert response.status_code == 200, response.get_json()
    updated = response.get_json()
    assert updated['completed'][0]['evidence']['peTlsException'] == EXCEPTION
    assert 'certificate' not in updated['completed'][0]['evidence']
    assert not prism.writes


def test_bootstrap_uses_explicit_new_run_health_policy_without_replaying_configuration(bootstrap_harness):
    h = bootstrap_harness
    service = h[0]
    p = profile(h)
    rev = p['revisions'][-1]
    service.approve(p['id'], 'reviewer', {'sha256': rev['sha256'], 'notes': 'Reviewed fixture baseline'})
    run = service.prepare({'profileId': p['id'], 'sha256': rev['sha256'], 'mode': 'recovery',
                           'healthTlsPolicy': EXCEPTION}, 'admin')
    assert run['healthTlsPolicy'] == EXCEPTION
    assert 'healthTlsPolicy' not in run['snapshot']
    collected = []
    def collect(snapshot):
        collected.append(snapshot['pe_tls'])
        return {'status': 'passed', 'checks': [{'name': 'fixture PE identity and health', 'status': 'passed'}]}
    service.s['collect_health'] = collect
    service.deploy(run['id'], 'admin', {'approvalId': 'approval', 'riskAcknowledged': True,
        'targetConfirmation': 'REFOUNDATION HCI-01', 'destructiveConfirmation': 'DEPLOY FOUNDATION VM'}, 'Bearer private-test-session')
    service.start_bootstrap(run['id'], 'admin', {'riskAcknowledged': True, 'confirmation': 'BOOTSTRAP HCI-01'}, 'Bearer private-test-session')
    updated = wait_status(service, run['id'], 'ready_for_configuration')
    assert collected == [EXCEPTION]
    assert updated['healthEvidence']['source'] == 'tls-exception-pe-readback'
    assert updated['healthEvidence']['pe_tls_bypass_reason'] == pe_tls.REASON
    assert len(updated['steps']) == 2 and len(h[5]) == 3
