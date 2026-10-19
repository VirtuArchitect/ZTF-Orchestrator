import io
import errno
import json
import socket
import ssl
import urllib.error

import pytest

import prism_drift


def config():
    return {'clusters': {'192.0.2.10': {
        'pe_credential': 'pe_monitor', 'name_servers_list': ['192.0.2.53'],
        'ntp_servers_list': ['NTP.example.com.'], 'enable_pulse': False,
        'new_pe_admin_credential': 'DO-NOT-RETAIN',
    }}}


def install_reader(monkeypatch):
    calls = []

    def read(url, ref, key, lookup):
        calls.append((url, ref, key))
        return {'name_servers_list': ['192.0.2.53'], 'ntp_servers_list': ['ntp.example.com'], 'enable_pulse': False}[key]

    monkeypatch.setattr(prism_drift, 'read_setting', read)
    return calls


def test_scoped_settings_and_normalization(monkeypatch):
    calls = install_reader(monkeypatch)
    result = prism_drift.collect(config(), None)
    assert result['status'] == 'matched'
    assert result['summary']['matched'] == 3
    assert len(calls) == 3
    assert 'DO-NOT-RETAIN' not in json.dumps(result)
    assert 'pe_monitor' not in json.dumps(result)
    assert prism_drift.normalize_servers(['B.example.', 'a.example', 'b.example']) == ['a.example', 'b.example']


@pytest.mark.parametrize('target', ['http://192.0.2.10', 'https://user:secret@pe.example', 'https://pe.example/path',
                                   'https://pe.example?url=evil', 'https://pe.example#x', 'https://pe.example:99999', ''])
def test_target_validation(target):
    with pytest.raises(ValueError):
        prism_drift.endpoint(target)


@pytest.mark.parametrize('change', [{'enable_pulse': 'false'}, {'ntp_servers_list': 'ntp.example'},
                                  {'name_servers_list': [None]}, {'pe_credential': ''}])
def test_desired_settings_rejected(change):
    cfg = config()
    cfg['clusters']['192.0.2.10'].update(change)
    with pytest.raises(ValueError):
        prism_drift.targets(cfg)


def test_missing_settings_and_targets_rejected():
    for cfg in ({}, {'clusters': {}}, {'clusters': {'pe.example': {'pe_credential': 'ref'}}}):
        with pytest.raises(ValueError):
            prism_drift.targets(cfg)


def test_partial_failure_preserves_drift_and_unknown(monkeypatch):
    def read(url, ref, key, lookup):
        if key == 'ntp_servers_list':
            raise ValueError('PE returned HTTP 403')
        return True if key == 'enable_pulse' else ['192.0.2.53']
    monkeypatch.setattr(prism_drift, 'read_setting', read)
    result = prism_drift.collect(config(), None)
    assert result['status'] == 'drifted'
    assert result['summary']['unknown'] == result['summary']['changed'] == 1
    assert result['collections'][0]['errors'] == {'ntp_servers_list': 'PE returned HTTP 403'}


def test_all_collection_failures_are_unknown(monkeypatch):
    monkeypatch.setattr(prism_drift, 'read_setting', lambda *args: (_ for _ in ()).throw(ValueError('PE connection or TLS verification failed')))
    result = prism_drift.collect(config(), None)
    assert result['status'] == 'unknown'
    assert result['summary']['unknown'] == 3
    assert result['summary']['matched'] == 0


@pytest.mark.parametrize('body,key,expected', [(b'["192.0.2.53"]', 'name_servers_list', ['192.0.2.53']),
                                             (b'{"enable":false,"secret":"hidden"}', 'enable_pulse', False)])
def test_transport_is_verified_get_only(monkeypatch, body, key, expected):
    class Opener:
        def open(self, req, timeout):
            assert req.get_method() == 'GET'
            assert req.full_url == 'https://pe.example:9440/PrismGateway/services/rest/v1' + prism_drift.SETTINGS[key]
            assert req.get_header('Authorization').startswith('Basic ')
            assert timeout == 10
            return io.BytesIO(body)

    def build(*handlers):
        tls = next(h for h in handlers if isinstance(h, prism_drift.urllib.request.HTTPSHandler))
        assert tls._context.verify_mode == ssl.CERT_REQUIRED
        assert tls._context.check_hostname
        assert any(isinstance(h, prism_drift.NoRedirect) for h in handlers)
        assert next(h for h in handlers if isinstance(h, prism_drift.urllib.request.ProxyHandler)).proxies == {}
        return Opener()
    monkeypatch.setattr(prism_drift.urllib.request, 'build_opener', build)
    assert prism_drift.read_setting('https://pe.example:9440', 'ref', key, lambda ref: ('reader', 'private', '')) == expected


@pytest.mark.parametrize('body', [b'{}', b'{"enable":"false"}', b'null', b'not-json', b'x' * (1024 * 1024 + 1)],
                         ids=['missing', 'wrong-type', 'null', 'invalid-json', 'oversized'])
def test_bad_pulse_response_is_not_matched(monkeypatch, body):
    class Opener:
        def open(self, *args, **kwargs):
            return io.BytesIO(body)
    monkeypatch.setattr(prism_drift.urllib.request, 'build_opener', lambda *args: Opener())
    with pytest.raises(ValueError):
        prism_drift.read_setting('https://pe.example:9440', 'ref', 'enable_pulse', lambda ref: ('reader', 'private', ''))


def test_transport_errors_do_not_expose_response_or_credentials(monkeypatch):
    class Opener:
        def open(self, *args, **kwargs):
            raise urllib.error.HTTPError('url', 401, 'private', {}, io.BytesIO(b'private'))
    monkeypatch.setattr(prism_drift.urllib.request, 'build_opener', lambda *args: Opener())
    with pytest.raises(ValueError, match='^PE returned HTTP 401$'):
        prism_drift.read_setting('https://pe.example:9440', 'ref', 'enable_pulse', lambda ref: ('reader', 'private', ''))
    assert prism_drift.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://evil.example') is None


@pytest.mark.parametrize('wrapped', [False, True], ids=['direct', 'urllib-wrapped'])
@pytest.mark.parametrize('kind,code,prefix', [
    ('certificate', 18, 'PE TLS certificate trust failed'),
    ('certificate', 20, 'PE TLS certificate trust failed'),
    ('certificate', 21, 'PE TLS certificate trust failed'),
    ('certificate', 62, 'PE TLS hostname/IP mismatch'),
    ('certificate', 64, 'PE TLS hostname/IP mismatch'),
    ('certificate', 9, 'PE TLS certificate validity failed'),
    ('certificate', 10, 'PE TLS certificate validity failed'),
    ('certificate', 23, 'PE TLS certificate verification failed'),
    ('handshake', None, 'PE TLS handshake failed'),
    ('dns', None, 'PE DNS resolution failed'),
    ('timeout', None, 'PE network timeout'),
    ('refused', None, 'PE connection refused'),
    ('unreachable', None, 'PE network unreachable'),
    ('reset', None, 'PE network connection failed'),
])
def test_transport_failure_categories_are_sanitized_and_unknown(monkeypatch, wrapped, kind, code, prefix):
    private = 'private reader password /secret/ca.pem Authorization: Basic confidential'
    if kind == 'certificate':
        error = ssl.SSLCertVerificationError(1, private)
        error.verify_code = code
        error.verify_message = private
    else:
        error = {
            'handshake': ssl.SSLError(1, private),
            'dns': socket.gaierror(socket.EAI_NONAME, private),
            'timeout': TimeoutError(private),
            'refused': ConnectionRefusedError(errno.ECONNREFUSED, private),
            'unreachable': OSError(errno.ENETUNREACH, private),
            'reset': ConnectionResetError(errno.ECONNRESET, private),
        }[kind]
    if wrapped:
        error = urllib.error.URLError(error)

    class Opener:
        def open(self, *args, **kwargs):
            raise error

    monkeypatch.setattr(prism_drift.urllib.request, 'build_opener', lambda *args: Opener())
    result = prism_drift.collect(config(), lambda ref: ('reader', 'private', ''))
    assert result['status'] == 'unknown'
    assert result['summary']['unknown'] == 3
    assert result['summary']['matched'] == 0
    assert all(value.startswith(prefix) for value in result['collections'][0]['errors'].values())
    serialized = json.dumps(result)
    for secret in ('private', 'password', '/secret/ca.pem', 'Authorization', 'confidential'):
        assert secret not in serialized


def test_invalid_trust_bundle_is_not_reported_as_network_failure(monkeypatch):
    def fail():
        raise FileNotFoundError('/secret/private.pem')
    monkeypatch.setattr(prism_drift.ssl, 'create_default_context', fail)
    with pytest.raises(ValueError, match='^PE TLS trust configuration could not be loaded') as error:
        prism_drift.read_setting('https://pe.example:9440', 'ref', 'enable_pulse', lambda ref: ('reader', 'private', ''))
    assert '/secret/' not in str(error.value)


def test_unstructured_transport_reason_is_not_echoed():
    assert prism_drift.connection_error(urllib.error.URLError('secret details')) == (
        'PE network connection failed: check target reachability, routing, firewall rules and the PE service.')


def test_live_api_and_schedule_fetch_fresh_settings_and_edit(client, auth_headers, monkeypatch):
    import server
    import yaml
    calls = install_reader(monkeypatch)
    client.post('/api/configs/live-pe.yml', json={'content': yaml.safe_dump(config())}, headers=auth_headers)
    resp = client.post('/api/drift/check', json={'configFile': 'live-pe.yml', 'baseline': 'live_pe'}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json['status'] == 'matched'
    assert resp.json['collectedAt']
    resp = client.post('/api/drift/policies', json={'name': 'PE live', 'configFile': 'live-pe.yml',
                       'baseline': 'live_pe', 'cronExpr': '0 * * * *', 'enabled': False}, headers=auth_headers)
    assert resp.status_code == 201
    sid = resp.json['id']
    edited = client.put('/api/drift/policies/' + sid, json={'name': 'PE edited', 'cronExpr': '15 * * * *',
                        'notifyOn': 'every_run'}, headers=auth_headers)
    assert edited.status_code == 200
    assert edited.json['baseline'] == 'live_pe'
    assert edited.json['cronExpr'] == '15 * * * *'
    # Exercise the real scheduler callback, not merely a manual API check.
    policy = server._drift_policy_engine.get_schedule(sid)
    server._drift_policy_engine._fire(policy)
    assert len(calls) == 6
    assert server._drift_policy_engine.get_schedule(sid)['lastStatus'] == 'matched'
    monkeypatch.setattr(prism_drift, 'read_setting', lambda *args: (_ for _ in ()).throw(ValueError('PE returned HTTP 401')))
    server._drift_policy_engine._fire(policy)
    assert server._drift_policy_engine.get_schedule(sid)['lastStatus'] == 'unknown'
    runs = client.get('/api/drift', headers=auth_headers).json
    assert runs[0]['trigger'] == 'scheduled'
    assert runs[0]['status'] == 'unknown'
    assert runs[1]['id'] != runs[2]['id']
    # Reload persisted policies into a fresh engine and check the live baseline survives.
    from scheduler import ScheduleEngine
    restored = ScheduleEngine(server.DRIFT_POLICIES_FILE, lambda p: 'matched',
                              load_callback=lambda: server.read_json(server.DRIFT_POLICIES_FILE, []))
    assert restored.get_schedule(sid)['baseline'] == 'live_pe'
    assert restored.get_schedule(sid)['cronExpr'] == '15 * * * *'
    client.delete('/api/configs/live-pe.yml', headers=auth_headers)
    paused = client.put('/api/drift/policies/' + sid, json={'enabled': False}, headers=auth_headers)
    assert paused.status_code == 200
    assert paused.json['enabled'] is False


def test_live_policy_invalid_config_rejected(client, auth_headers):
    resp = client.post('/api/drift/policies', json={'name': 'invalid', 'configFile': '../secret.yml',
                       'baseline': 'live_pe', 'cronExpr': '0 * * * *'}, headers=auth_headers)
    assert resp.status_code == 400


def test_viewer_cannot_collect_or_edit_live_policy(client, auth_headers):
    client.post('/api/users', json={'username': 'drift-viewer', 'password': 'ViewerPassword123!', 'role': 'viewer'}, headers=auth_headers)
    token = client.post('/api/auth/login', json={'username': 'drift-viewer', 'password': 'ViewerPassword123!'}).json['token']
    headers = {'Authorization': 'Bearer ' + token}
    assert client.post('/api/drift/check', json={'baseline': 'live_pe'}, headers=headers).status_code == 403
    assert client.put('/api/drift/policies/fake', json={'baseline': 'live_pe'}, headers=headers).status_code == 403


def test_verified_https_collection_reads_changes_and_rejects_untrusted_tls(client, auth_headers, tmp_path, monkeypatch):
    import base64
    import http.server
    import shutil
    import subprocess
    import threading
    import server
    import yaml

    openssl = shutil.which('openssl')
    if not openssl:
        pytest.skip('OpenSSL executable required for real TLS fixture')
    cert, key = tmp_path / 'cert.pem', tmp_path / 'key.pem'
    subprocess.run([openssl, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(key),
                    '-out', str(cert), '-days', '1', '-subj', '/CN=localhost',
                    '-addext', 'subjectAltName=DNS:localhost'], check=True, capture_output=True)
    state = {'pulse': False, 'deny': False, 'reads': 0}

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            assert self.headers['Authorization'] == 'Basic ' + base64.b64encode(b'reader:test-only').decode()
            state['reads'] += 1
            if self.path.endswith('/pulse') and state['deny']:
                self.send_response(401)
                self.end_headers()
                return
            data = {'enable': state['pulse']} if self.path.endswith('/pulse') else (
                ['192.0.2.53'] if self.path.endswith('/name_servers') else ['ntp.example.com'])
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())

    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert, key)
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        monkeypatch.setenv('SSL_CERT_FILE', str(cert))
        monkeypatch.setattr(server, '_load_global_config_data', lambda: {
            'vaults': {'local': {'credentials': {'pe_monitor': {'username': 'reader', 'password': 'test-only'}}}}})
        cfg = config()
        cfg['clusters'] = {f'https://localhost:{httpd.server_port}': cfg['clusters']['192.0.2.10']}
        client.post('/api/configs/tls-pe.yml', json={'content': yaml.safe_dump(cfg)}, headers=auth_headers)

        def run():
            response = client.post('/api/drift/check', json={'configFile': 'tls-pe.yml', 'baseline': 'live_pe'}, headers=auth_headers)
            assert response.status_code == 200
            assert 'test-only' not in response.get_data(as_text=True)
            return response.json

        assert run()['status'] == 'matched'
        state['pulse'] = True
        assert run()['status'] == 'drifted'
        state['pulse'], state['deny'] = False, True
        assert run()['status'] == 'unknown'
        assert state['reads'] == 9
        monkeypatch.delenv('SSL_CERT_FILE')
        # An explicit empty CA location avoids platform-specific trust stores.
        empty_ca = tmp_path / 'empty-ca'
        empty_ca.mkdir()
        monkeypatch.setenv('SSL_CERT_DIR', str(empty_ca))
        untrusted = run()
        assert untrusted['summary']['unknown'] == 3
        assert all(error.startswith('PE TLS certificate trust failed') for error in untrusted['collections'][0]['errors'].values())
        # Trusting the issuer does not authorize a different IP absent from SAN.
        monkeypatch.setenv('SSL_CERT_FILE', str(cert))
        cfg['clusters'] = {f'https://127.0.0.1:{httpd.server_port}': cfg['clusters'][f'https://localhost:{httpd.server_port}']}
        client.post('/api/configs/tls-pe.yml', json={'content': yaml.safe_dump(cfg)}, headers=auth_headers)
        mismatch = run()
        assert mismatch['summary']['unknown'] == 3
        assert all(error.startswith('PE TLS hostname/IP mismatch') for error in mismatch['collections'][0]['errors'].values())
        assert state['reads'] == 9  # Neither rejected TLS case sends HTTP credentials.
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=5)
