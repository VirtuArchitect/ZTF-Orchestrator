"""Safe PE collection failures through real transport handling; no live requests."""
import errno
import io
import json
import socket
import ssl
import urllib.error
from unittest.mock import MagicMock

import pytest
import cluster_operations as ops
import upgrade_inventory as inventory

SECRET = 'fixture-secret-must-never-appear'


def record():
    return {'name': 'HCI-01', 'peEndpoint': 'https://pe.example.com:9440',
            'peCredential': 'pe_monitor', 'expectedUuid': '00000000-0000-4000-8000-000000000001',
            'expectedNodes': [{'serial': 'NODE1', 'hostIp': '192.0.2.22', 'cvmIp': '192.0.2.23'}]}


def certificate(code):
    error = ssl.SSLCertVerificationError(1, SECRET)
    error.verify_code = code
    return urllib.error.URLError(error)


def http(code):
    return urllib.error.HTTPError('https://pe.example.com/' + SECRET, code, SECRET,
                                  {'X-Private': SECRET}, io.BytesIO(SECRET.encode()))


FAILURES = [
    (certificate(18), 'certificate trust failed'),
    (certificate(20), 'certificate trust failed'),
    (certificate(62), 'hostname/IP mismatch'),
    (certificate(64), 'hostname/IP mismatch'),
    (certificate(10), 'certificate validity failed'),
    (certificate(99), 'certificate verification failed'),
    (urllib.error.URLError(ssl.SSLError(SECRET)), 'TLS handshake failed'),
    (urllib.error.URLError(socket.gaierror(-2, SECRET)), 'DNS resolution failed'),
    (urllib.error.URLError(TimeoutError(SECRET)), 'network timeout'),
    (TimeoutError(SECRET), 'network timeout'),
    (urllib.error.URLError(ConnectionRefusedError(errno.ECONNREFUSED, SECRET)), 'connection refused'),
    (urllib.error.URLError(OSError(errno.EHOSTUNREACH, SECRET)), 'network unreachable'),
    (urllib.error.URLError(SECRET), 'network connection failed'),
    (http(401), 'authentication rejected (HTTP 401)'),
    (http(403), 'access denied (HTTP 403)'),
    (http(500), 'API returned HTTP 500'),
    (http(302), 'redirects are not followed'),
]


def transport(monkeypatch, failure):
    opener = MagicMock()
    opener.open.side_effect = failure
    build = MagicMock(return_value=opener)
    monkeypatch.setattr(inventory.urllib.request, 'build_opener', build)
    return opener, build


@pytest.mark.parametrize('failure,expected', FAILURES)
def test_collection_classifies_typed_failures_without_leaking_remote_text(monkeypatch, failure, expected, caplog):
    opener, build = transport(monkeypatch, failure)
    result = ops.collect_health(record(), lambda _: ('admin', SECRET, ''))
    assert result['collectionStatus'] == 'failed' and result['status'] == 'unknown'
    assert expected in result['message'] and 'during cluster identity/health' in result['message']
    assert SECRET not in json.dumps(result) + caplog.text
    assert result['completedAt'] and result['checks'] == []
    opener.open.assert_called_once()
    request = opener.open.call_args.args[0]
    assert request.method == 'GET' and request.full_url.endswith('/cluster/?include_health_summary=true')
    assert opener.open.call_args.kwargs == {'timeout': 10}
    proxy, redirect, https = build.call_args.args
    assert proxy.proxies == {} and isinstance(redirect, inventory.NoRedirect)
    assert https._context.verify_mode == ssl.CERT_REQUIRED and https._context.check_hostname


@pytest.mark.parametrize('lookup', [lambda _: ('', '', SECRET),
    lambda _: (_ for _ in ()).throw(ValueError(SECRET)),
    lambda _: (_ for _ in ()).throw(OSError(SECRET))])
def test_unresolved_credentials_never_contact_pe(monkeypatch, lookup):
    build = MagicMock(side_effect=AssertionError('No PE request is permitted'))
    monkeypatch.setattr(inventory.urllib.request, 'build_opener', build)
    result = ops.collect_health(record(), lookup)
    assert result['collectionStatus'] == 'failed'
    assert 'credential reference could not be resolved' in result['message']
    assert SECRET not in json.dumps(result)
    build.assert_not_called()


def test_trust_bundle_loading_failure_is_distinct(monkeypatch):
    monkeypatch.setattr(inventory.ssl, 'create_default_context', MagicMock(side_effect=OSError(SECRET)))
    result = ops.collect_health(record(), lambda _: ('admin', SECRET, ''))
    assert 'trust configuration could not be loaded' in result['message']
    assert SECRET not in json.dumps(result)


@pytest.mark.parametrize('raw,expected', [(b'not-json-' + SECRET.encode(), 'invalid JSON'),
                                        (b'x' * (1024 * 1024 + 1), '1 MiB collection limit'),
                                        (b'[]', 'response format is unsupported')], ids=['invalid-json', 'oversize-json', 'unsupported-shape'])
def test_response_failures_are_specific_and_bounded(monkeypatch, raw, expected):
    response = MagicMock(); response.__enter__.return_value = response; response.read.return_value = raw
    opener, _ = transport(monkeypatch, None); opener.open.side_effect = None; opener.open.return_value = response
    result = ops.collect_health(record(), lambda _: ('admin', SECRET, ''))
    assert result['collectionStatus'] == 'failed' and expected in result['message']
    assert SECRET not in json.dumps(result)
    assert all(c.args == (1024 * 1024 + 1,) for c in response.read.call_args_list)


def test_host_failure_identifies_stage_and_success_remains_unchanged(monkeypatch):
    cluster = {'uuid': record()['expectedUuid'], 'name': 'HCI-01', 'health_summary': {'health_status': 'Good'}}
    hosts = {'entities': [{'serial': 'NODE1', 'hypervisor_address': '192.0.2.22',
             'service_vmexternal_ip': '192.0.2.23', 'health_summary': {'health_status': 'Good'}}],
             'metadata': {'grand_total_entities': 1}}
    def response(value):
        item = MagicMock(); item.__enter__.return_value = item; item.read.return_value = json.dumps(value).encode(); return item
    opener, _ = transport(monkeypatch, None)
    opener.open.side_effect = [response(cluster), http(403)]
    result = ops.collect_health(record(), lambda _: ('admin', SECRET, ''))
    assert 'during host inventory/health' in result['message'] and 'HTTP 403' in result['message']
    opener.open.side_effect = [response(cluster), response(hosts)]
    result = ops.collect_health(record(), lambda _: ('admin', SECRET, ''))
    assert result['status'] == 'good' and result['collectionStatus'] == 'completed'
    assert all(c['status'] == 'passed' for c in result['checks'])


def test_legacy_inventory_call_retains_generic_error_contract(monkeypatch):
    transport(monkeypatch, certificate(18))
    with pytest.raises(ValueError, match='Inventory connection or TLS verification failed') as error:
        inventory.read('https://pe.example.com', 'ref', '/fixed', lambda _: ('admin', SECRET, ''))
    assert not isinstance(error.value, inventory.PEReadError)


def test_unknown_internal_errors_remain_sanitized(monkeypatch):
    monkeypatch.setattr(ops, 'read', MagicMock(side_effect=ValueError(SECRET)))
    result = ops.collect_health(record(), None)
    assert result['collectionStatus'] == 'failed' and 'API compatibility' in result['message']
    assert SECRET not in json.dumps(result)


def test_specific_failure_is_persisted_and_readable_in_authenticated_api(client, auth_headers, monkeypatch):
    import server
    transport(monkeypatch, certificate(64))
    monkeypatch.setattr(server, '_lookup_credential_ref', lambda _: ('admin', SECRET, ''))
    body = {**record(), 'datacenter':'DC01', 'owner':'Infrastructure', 'configFiles':[],
            'pipelineId':'', 'recoveryProfileId':'', 'revision':0}
    created = client.post('/api/operations/clusters', json=body, headers=auth_headers)
    assert created.status_code == 200
    identity = created.get_json()['id']
    response = client.post('/api/operations/clusters/' + identity + '/health', json={}, headers=auth_headers)
    assert response.status_code == 200 and 'hostname/IP mismatch' in response.get_json()['message']
    summary = client.get('/api/operations', headers=auth_headers).get_json()
    row = summary['clusters'][0]
    assert row['observationDiagnostics']['state'] == 'collection_failed' and not row['observationFresh']
    assert 'hostname/IP mismatch' in row['observation']['message']
    assert SECRET not in json.dumps(summary)
