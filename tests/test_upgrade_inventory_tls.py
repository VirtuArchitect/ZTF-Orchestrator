"""TLS exceptions are explicit, per-endpoint, audited and never global."""
import io
import json
import ssl
import urllib.error
from unittest.mock import MagicMock

import pytest
import upgrade_inventory as inventory


def payload(**extra):
    return dict(peEndpoint='https://pe.example.com:9440', peCredential='pe_ref',
                pcEndpoint='https://pc.example.com:9440', pcCredential='pc_ref', **extra)


def fake_read(url, ref, path, lookup, **kwargs):
    if kwargs.get('product_header'):
        return 'pc.2024.3.1'
    if path.endswith('/cluster/'):
        return {'name': 'Example', 'version': '7.3.0'}
    return {'entities': [{'hypervisor_full_name': 'Nutanix 10.3.0'}],
            'metadata': {'grand_total_entities': 1, 'total_entities': 1}}


@pytest.mark.parametrize('kind', ['pe', 'pc'])
@pytest.mark.parametrize('value', ['false', None, 0, 1, {}, []])
def test_flags_require_actual_booleans(kind, value):
    with pytest.raises(ValueError, match='booleans'):
        inventory.collect(payload(**{kind + 'VerifyTls': value}), None)


def test_exception_requires_matching_endpoint():
    with pytest.raises(ValueError, match='requires'):
        inventory.collect({'pcVerifyTls': False}, None)


@pytest.mark.parametrize('pe,pc', [(True, True), (False, True), (True, False), (False, False)])
def test_each_endpoint_is_independent_and_defaults_restore(monkeypatch, pe, pc):
    read = MagicMock(side_effect=fake_read)
    monkeypatch.setattr(inventory, 'read', read)
    result = inventory.collect(payload(peVerifyTls=pe, pcVerifyTls=pc), None)
    assert result['tlsVerification'] == {'pe': pe, 'pc': pc}
    assert len(result['securityWarnings']) == int(not pe) + int(not pc)
    for call in read.call_args_list:
        expected = pc if call.kwargs.get('product_header') else pe
        assert call.kwargs['verify_tls'] is expected
    read.reset_mock()
    result = inventory.collect(payload(), None)
    assert not result['securityWarnings'] and all(result['tlsVerification'].values())
    assert all(call.kwargs['verify_tls'] is True for call in read.call_args_list)


def test_unverified_context_remains_get_only_bounded_no_redirect_or_proxy(monkeypatch):
    response = MagicMock(); response.__enter__.return_value = response
    response.read.return_value = b'{"version":"7.3.0"}'
    opener = MagicMock(); opener.open.return_value = response
    build = MagicMock(return_value=opener)
    monkeypatch.setattr(inventory.urllib.request, 'build_opener', build)
    before = ssl.create_default_context()
    inventory.read('https://pe.example.com:9440', 'ref', '/fixed', lambda _: ('admin', 'secret', ''), verify_tls=False)
    proxy, redirect, https = build.call_args.args
    assert https._context.verify_mode == ssl.CERT_NONE
    assert not https._context.check_hostname
    assert proxy.proxies == {} and isinstance(redirect, inventory.NoRedirect)
    assert opener.open.call_args.args[0].method == 'GET'
    assert opener.open.call_args.kwargs['timeout'] == 10
    response.read.assert_called_once_with(1024 * 1024 + 1)
    after = ssl.create_default_context()
    assert before.verify_mode == after.verify_mode == ssl.CERT_REQUIRED
    assert after.check_hostname


def test_exception_does_not_suppress_http_authentication_failure(monkeypatch):
    opener = MagicMock(); opener.open.side_effect = urllib.error.HTTPError(
        'https://pe.example.com', 401, 'secret', {}, io.BytesIO(b'secret'))
    monkeypatch.setattr(inventory.urllib.request, 'build_opener', lambda *args: opener)
    with pytest.raises(ValueError, match='HTTP 401') as error:
        inventory.read('https://pe.example.com', 'ref', '/', lambda _: ('u', 'secret', ''), verify_tls=False)
    assert 'secret' not in str(error.value)


@pytest.mark.parametrize('kind', ['pe', 'pc'])
def test_operator_cannot_disable_tls_even_by_direct_api(client, auth_headers, monkeypatch, caplog, kind):
    import server
    assert client.post('/api/users', json={'username': 'ops', 'password': 'TestOps123!', 'role': 'operator'}, headers=auth_headers).status_code == 201
    token = client.post('/api/auth/login', json={'username': 'ops', 'password': 'TestOps123!'}).get_json()['token']
    collector = MagicMock(side_effect=AssertionError('Collector must not run'))
    monkeypatch.setattr(server, 'collect_upgrade_inventory', collector)
    resp = client.post('/api/upgrade-advisor/inventory', json=payload(**{kind + 'VerifyTls': False}), headers={'Authorization': 'Bearer ' + token})
    assert resp.status_code == 403
    collector.assert_not_called()
    event = next(r for r in caplog.records if getattr(r, 'action', '') == 'upgrade_inventory_tls_exception')
    assert event.outcome == 'denied' and event.user == 'ops'
    collector.side_effect = None
    collector.return_value = dict(components={}, unknownComponents=[], errors=[])
    verified = client.post('/api/upgrade-advisor/inventory', json=payload(), headers={'Authorization': 'Bearer ' + token})
    assert verified.status_code == 200
    collector.assert_called_once()


def test_admin_exception_is_audited_persisted_reopened_and_exported(client, auth_headers, monkeypatch, caplog):
    import server
    import zipfile
    monkeypatch.setattr(inventory, 'read', fake_read)
    resp = client.post('/api/upgrade-advisor/inventory', json=payload(peVerifyTls=False), headers=auth_headers)
    assert resp.status_code == 200
    collected = resp.get_json()
    assert collected['tlsVerification'] == {'pe': False, 'pc': True}
    assert len(collected['securityWarnings']) == 1
    assert 'pe_ref' not in json.dumps(collected)
    event = next(r for r in caplog.records if getattr(r, 'action', '') == 'upgrade_inventory_tls_exception')
    assert event.outcome == 'requested' and event.tlsVerification == {'pe': False, 'pc': True}
    assert event.user == 'admin'
    data = dict(inventory={'clusterName': 'Example', 'components': collected['components']}, targets={'aos': '7.3.1'}, inventorySnapshotId=collected['id'])
    preview = client.post('/api/upgrade-advisor/assess', json=data, headers=auth_headers).get_json()
    assert preview['inventoryCollection']['securityWarnings'] == collected['securityWarnings']
    saved = client.post('/api/upgrade-advisor/assessments', json=data, headers=auth_headers).get_json()
    reopened = client.get('/api/upgrade-advisor/assessments/' + saved['id'], headers=auth_headers).get_json()
    for record in [saved, reopened]:
        assert record['inventoryCollection']['tlsVerification']['pe'] is False
        assert record['assessment']['inventoryCollection']['securityWarnings'] == collected['securityWarnings']
    exported = client.post('/api/upgrade-advisor/export', json={'assessment': reopened['assessment']}, headers=auth_headers)
    with zipfile.ZipFile(io.BytesIO(exported.data)) as archive:
        assert any('Certificate verification disabled' in archive.read(name).decode('utf-8') for name in archive.namelist())
        report = next(name for name in archive.namelist() if name.endswith('.md'))
        assert 'DISABLED - server identity not verified' in archive.read(report).decode('utf-8')
    again = client.post('/api/upgrade-advisor/inventory', json=payload(), headers=auth_headers).get_json()
    assert all(again['tlsVerification'].values()) and not again['securityWarnings']


def test_failed_admin_collection_still_audits_exception(client, auth_headers, monkeypatch, caplog):
    import server
    monkeypatch.setattr(server, 'collect_upgrade_inventory', MagicMock(side_effect=ValueError('Credential reference could not be resolved')))
    response = client.post('/api/upgrade-advisor/inventory', json=payload(pcVerifyTls=False), headers=auth_headers)
    assert response.status_code == 400
    assert any(getattr(r, 'action', '') == 'upgrade_inventory_tls_exception' for r in caplog.records)


def test_non_boolean_api_flag_rejected_before_collection(client, auth_headers, monkeypatch):
    import server
    collector = MagicMock(); monkeypatch.setattr(server, 'collect_upgrade_inventory', collector)
    assert client.post('/api/upgrade-advisor/inventory', json=payload(peVerifyTls='false'), headers=auth_headers).status_code == 400
    collector.assert_not_called()
