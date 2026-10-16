"""Operational advisor contracts, persistence and security boundaries."""
import json
import io
import ssl
import urllib.error
from unittest.mock import MagicMock

import pytest
import upgrade_inventory as inventory
from upgrade_advisor import assess_upgrade_risk


def sample():
    return dict(inventory=dict(clusterName='Example', components={'aos': '7.3.0'}),
                targets={'aos': '7.3.1'}, evidence={}, context={})


def test_collector_preserves_partial_errors(monkeypatch):
    def read(url, ref, path, lookup, product_header=False):
        if product_header:
            return 'pc.2024.3.1'
        if path.endswith('/cluster/'):
            return {'name': 'Example', 'version': '7.3.0'}
        raise ValueError('Inventory returned HTTP 403')
    monkeypatch.setattr(inventory, 'read', read)
    result = inventory.collect(dict(peEndpoint='pe.example.com', peCredential='pe_ref',
                                    pcEndpoint='pc.example.com', pcCredential='pc_ref'), None)
    assert result['components'] == {'aos': '7.3.0', 'prismCentral': 'pc.2024.3.1'}
    assert 'ahv' in result['unknownComponents']
    assert result['errors'][0]['component'] == 'ahv'
    assert 'pe_ref' not in json.dumps(result)


@pytest.mark.parametrize('hosts', [[], [{'hypervisor_full_name': 'Nutanix 1'}, {'hypervisor_full_name': 'Nutanix 2'}],
                                  [{'hypervisor_full_name': 'ESXi 8'}], [{'hypervisor_full_name': 'Nutanix 1'}, {}]])
def test_incomplete_mixed_and_non_ahv_hosts_are_unknown(monkeypatch, hosts):
    monkeypatch.setattr(inventory, 'read', lambda *a, **k: {'entities': hosts, 'metadata': {'grand_total_entities': len(hosts)}})
    result = inventory.collect({'peEndpoint': 'pe.example.com', 'peCredential': 'ref'}, None)
    assert 'ahv' not in result['components']
    assert 'ahv' in result['unknownComponents']


def test_paginated_hosts_not_claimed_complete(monkeypatch):
    monkeypatch.setattr(inventory, 'read', lambda *a, **k: {'entities': [{'hypervisor_full_name': 'Nutanix 1'}], 'metadata': {'total_entities': 2}})
    result = inventory.collect({'peEndpoint': 'pe.example.com', 'peCredential': 'ref'}, None)
    assert 'ahv' not in result['components']


@pytest.mark.parametrize('metadata', [{}, {'total_entities': 1, 'grand_total_entities': 2}])
def test_missing_or_partial_overall_host_count_is_unknown(monkeypatch, metadata):
    monkeypatch.setattr(inventory, 'read', lambda *a, **k: {'entities': [{'hypervisor_full_name': 'Nutanix 10.3.0'}], 'metadata': metadata})
    result = inventory.collect({'peEndpoint': 'pe.example.com', 'peCredential': 'ref'}, None)
    assert 'ahv' not in result['components']


def test_complete_pe_inventory_collects_versions(monkeypatch):
    def read(*args, **kwargs):
        if args[2].endswith('/cluster/'):
            return {'name': 'Example', 'version': '7.3.0'}
        return {'entities': [{'hypervisor_full_name': 'Nutanix 10.3.0'}] * 2,
                'metadata': {'total_entities': 2, 'grand_total_entities': 2}}
    monkeypatch.setattr(inventory, 'read', read)
    result = inventory.collect({'peEndpoint': 'pe.example.com', 'peCredential': 'ref'}, None)
    assert result['components'] == {'aos': '7.3.0', 'ahv': 'Nutanix 10.3.0'}
    assert not result['errors']


@pytest.mark.parametrize('address', ['http://pe.example.com', 'https://user:password@pe.example.com',
                                     'https://pe.example.com/private', 'https://pe.example.com?x=1'])
def test_invalid_endpoints_rejected(address):
    with pytest.raises(ValueError):
        inventory.collect({'peEndpoint': address, 'peCredential': 'ref'}, None)


def test_transport_is_bounded_verified_get(monkeypatch):
    response = MagicMock()
    response.__enter__.return_value = response
    response.read.return_value = b'{"version":"7.3.0"}'
    opener = MagicMock(); opener.open.return_value = response
    build = MagicMock(return_value=opener)
    monkeypatch.setattr(inventory.urllib.request, 'build_opener', build)
    assert inventory.read('https://pe.example.com:9440', 'ref', '/fixed', lambda _: ('admin', 'secret', '')) == {'version': '7.3.0'}
    req = opener.open.call_args.args[0]
    assert req.method == 'GET' and req.full_url.endswith('/fixed')
    assert opener.open.call_args.kwargs['timeout'] == 10
    response.read.assert_called_once_with(1024 * 1024 + 1)
    proxy, redirect, https = build.call_args.args
    assert proxy.proxies == {} and isinstance(redirect, inventory.NoRedirect)
    assert https._context.verify_mode == ssl.CERT_REQUIRED and https._context.check_hostname


@pytest.mark.parametrize('raw', [b'x' * (1024 * 1024 + 1), b'not-json'], ids=['oversized', 'invalid-json'])
def test_invalid_responses_not_retained(monkeypatch, raw):
    response = MagicMock(); response.__enter__.return_value = response; response.read.return_value = raw
    opener = MagicMock(); opener.open.return_value = response
    monkeypatch.setattr(inventory.urllib.request, 'build_opener', lambda *a: opener)
    with pytest.raises(ValueError):
        inventory.read('https://pe.example.com', 'ref', '/fixed', lambda _: ('u', 'secret', ''))


def test_transport_error_does_not_expose_secret(monkeypatch):
    opener = MagicMock(); opener.open.side_effect = urllib.error.URLError('secret-in-transport-error')
    monkeypatch.setattr(inventory.urllib.request, 'build_opener', lambda *a: opener)
    with pytest.raises(ValueError, match='TLS verification failed') as error:
        inventory.read('https://pe.example.com', 'ref', '/fixed', lambda _: ('u', 'secret', ''))
    assert 'secret' not in str(error.value)


def test_pc_version_reads_redirect_header_without_following(monkeypatch):
    response = urllib.error.HTTPError('https://pc.example.com/', 302, 'Redirect',
                                     {'x-ntnx-product': 'pc.2024.3.1', 'Location': 'https://other.example.com/'}, io.BytesIO())
    opener = MagicMock(); opener.open.side_effect = response
    monkeypatch.setattr(inventory.urllib.request, 'build_opener', lambda *a: opener)
    assert inventory.read('https://pc.example.com', 'ref', '/', lambda _: ('u', 'secret', ''), product_header=True) == 'pc.2024.3.1'
    assert opener.open.call_count == 1


def test_pc_missing_version_header_is_unknown(monkeypatch):
    response = MagicMock(); response.__enter__.return_value = response; response.headers = {}
    opener = MagicMock(); opener.open.return_value = response
    monkeypatch.setattr(inventory.urllib.request, 'build_opener', lambda *a: opener)
    result = inventory.collect({'pcEndpoint': 'pc.example.com', 'pcCredential': 'ref'}, lambda _: ('u', 'secret', ''))
    assert 'prismCentral' in result['unknownComponents']
    assert not result['components']


def test_http_error_does_not_retain_server_body(monkeypatch):
    opener = MagicMock(); opener.open.side_effect = urllib.error.HTTPError(
        'https://pe.example.com', 401, 'secret', {}, io.BytesIO(b'secret'))
    monkeypatch.setattr(inventory.urllib.request, 'build_opener', lambda *a: opener)
    with pytest.raises(ValueError, match='Inventory returned HTTP 401') as error:
        inventory.read('https://pe.example.com', 'ref', '/', lambda _: ('u', 'secret', ''))
    assert 'secret' not in str(error.value)


def test_unknown_current_version_is_not_clear():
    data = sample(); data['inventory']['components'] = {}
    result = assess_upgrade_risk(data, {'rules': []})
    assert result['status'] == 'unknown' and result['summary']['clear'] == 0


@pytest.mark.parametrize('payload', [[], {'targets': []}, {'targets': {'aos': 1}},
                                     {'targets': {'aos': '1'}, 'evidence': {'compatibilityReviewed': 'true'}}])
def test_save_rejects_invalid_inputs(client, auth_headers, payload):
    response = client.post('/api/upgrade-advisor/assessments', json=payload, headers=auth_headers)
    assert response.status_code == 400


def test_history_is_immutable_and_persistent(client, auth_headers, monkeypatch):
    import server
    data = sample(); data['password'] = 'must-not-be-stored'
    record = client.post('/api/upgrade-advisor/assessments', json=data, headers=auth_headers)
    assert record.status_code == 201
    saved = record.get_json(); id_ = saved['id']
    assert 'must-not-be-stored' not in json.dumps(saved)
    assert client.get('/api/upgrade-advisor/assessments', headers=auth_headers).get_json()['assessments'][0]['id'] == id_
    server._storage = type(server._storage)(server.CONFIG_DIR)
    assert client.get('/api/upgrade-advisor/assessments/' + id_, headers=auth_headers).get_json() == saved
    assert client.put('/api/upgrade-advisor/assessments/' + id_, json={}, headers=auth_headers).status_code == 405
    assert client.get('/api/upgrade-advisor/assessments/not-a-uuid', headers=auth_headers).status_code == 404


def test_inventory_provenance_and_manual_override(client, auth_headers, monkeypatch):
    import server
    monkeypatch.setattr(server, 'collect_upgrade_inventory', lambda *a: dict(components={'aos': '7.3.0'}, unknownComponents=['ahv'], errors=[], collectedAt='2026-10-16T00:00:00Z'))
    collected = client.post('/api/upgrade-advisor/inventory', json={}, headers=auth_headers).get_json()
    data = sample(); data['inventorySnapshotId'] = collected['id']; data['inventory']['components']['aos'] = '7.3.2'
    saved = client.post('/api/upgrade-advisor/assessments', json=data, headers=auth_headers).get_json()
    assert saved['manualOverrides'] == ['aos']
    assert saved['assessment']['inventoryCollection']['components']['aos'] == '7.3.0'
    data['inventorySnapshotId'] = '../secret'
    assert client.post('/api/upgrade-advisor/assessments', json=data, headers=auth_headers).status_code == 400


def test_viewer_cannot_collect_or_save(client, auth_headers):
    assert client.post('/api/users', json={'username': 'reviewer', 'password': 'Test12345!', 'role': 'viewer'}, headers=auth_headers).status_code == 201
    token = client.post('/api/auth/login', json={'username': 'reviewer', 'password': 'Test12345!'}).get_json()['token']
    headers = {'Authorization': 'Bearer ' + token}
    assert client.post('/api/upgrade-advisor/inventory', json={}, headers=headers).status_code == 403
    assert client.post('/api/upgrade-advisor/assessments', json=sample(), headers=headers).status_code == 403
    assert client.get('/api/upgrade-advisor/assessments', headers=headers).status_code == 200
    assert client.get('/api/upgrade-advisor/assessments').status_code == 401


def test_archive_limit_does_not_overwrite_saved_history(client, auth_headers):
    import server
    index = server.CONFIG_DIR / 'upgrade_assessment_history.json'
    records = [{'id': str(n)} for n in range(200)]
    server.write_json(index, records)
    assert client.post('/api/upgrade-advisor/assessments', json=sample(), headers=auth_headers).status_code == 409
    assert server.read_json(index, []) == records
