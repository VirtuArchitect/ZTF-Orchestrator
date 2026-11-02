import copy
import io
import json
import ssl
import urllib.error

import pytest

import pe_login_title as pe


@pytest.fixture(autouse=True)
def isolated_locks(tmp_path, monkeypatch):
    monkeypatch.setenv('ZTF_DATA_DIR', str(tmp_path))


def intent(count=1):
    return {'pe_credential': 'pe_ref', 'clusters': {
        f'192.0.2.{i + 10}': {'name': f'CLUSTER-{i}', 'prism_login_title': f'CLUSTER-{i}'}
        for i in range(count)
    }}


def resolve(ref):
    assert ref == 'pe_ref'
    return 'admin', 'canary-password'


class Client:
    def __init__(self, title='Prism Element'):
        self.title = title
        self.writes = []
        self.reads = 0
        self.broken_write = False

    def read_title(self):
        self.reads += 1
        return self.title

    def write_title(self, title, exists):
        self.writes.append((title, exists))
        if not self.broken_write:
            self.title = title


def test_updates_only_title_and_verifies_and_is_idempotent():
    client = Client()
    messages = []
    result = pe.configure(intent(), resolve, messages.append, lambda *args: client)
    assert client.writes == [('CLUSTER-0', True)] and client.reads == 3
    assert result['192.0.2.10'] == {'Prism_Login_Title': 'PASS', 'changed': True, 'previous_title': 'Prism Element',
                                   'requested_title': 'CLUSTER-0', 'verified_title': 'CLUSTER-0'}
    assert pe.configure(intent(), resolve, messages.append, lambda *args: client)['192.0.2.10']['changed'] is False
    assert len(client.writes) == 1
    assert 'canary-password' not in str(messages)


def test_absent_title_creates_one_entry():
    client = Client(None)
    pe.configure(intent(), resolve, lambda _: None, lambda *args: client)
    assert client.writes == [('CLUSTER-0', False)]


@pytest.mark.parametrize('value', [None, '', ' ', 1, False, [], '<b>Example</b>', 'line\nbreak', '\x1b[31m',
                                  'x' * 129, 'hidden\u202evalue', 'zero\u200bwidth'])
def test_invalid_titles_make_no_requests(value):
    config = intent()
    config['clusters']['192.0.2.10']['prism_login_title'] = value
    with pytest.raises(pe.LoginTitleError):
        pe.configure(config, resolve, lambda _: None, lambda *args: pytest.fail('Unexpected connection'))


@pytest.mark.parametrize('host', ['https://192.0.2.10', '192.0.2.10:9440', 'bad-host', '0.0.0.0', '224.0.0.1', '::', 'fe80::1%zone'])
def test_target_validation(host):
    config = intent()
    config['clusters'] = {host: next(iter(config['clusters'].values()))}
    with pytest.raises(pe.LoginTitleError):
        pe.validate_intent(config)


def test_mixed_cluster_changes_are_rejected_before_contact():
    config = intent()
    config['clusters']['192.0.2.10']['enable_pulse'] = True
    with pytest.raises(pe.LoginTitleError, match='separate title-only step'):
        pe.validate_intent(config)


def test_vault_reference_and_tls_defaults_and_override():
    config = intent()
    assert pe.prepare_credentials(config, resolve)[0][-1] is True
    config['prism_login_title_verify_tls'] = False
    assert pe.prepare_credentials(config, resolve)[0][-1] is False
    config['clusters']['192.0.2.10']['prism_login_title_verify_tls'] = True
    assert pe.prepare_credentials(config, resolve)[0][-1] is True
    config['prism_login_title_verify_tls'] = 'false'
    with pytest.raises(pe.LoginTitleError):
        pe.validate_intent(config)


@pytest.mark.parametrize('value', [False, [], {}, '', None])
def test_invalid_per_cluster_reference_does_not_silently_use_root(value):
    config = intent()
    config['clusters']['192.0.2.10']['pe_credential'] = value
    with pytest.raises(pe.LoginTitleError):
        pe.validate_intent(config)


def test_every_credential_resolved_before_any_network_operation():
    config = intent(2)
    config['clusters']['192.0.2.11']['pe_credential'] = 'missing'
    def credentials(ref):
        if ref == 'missing':
            raise RuntimeError('canary-password raw provider response')
        return resolve(ref)
    with pytest.raises(pe.LoginTitleError) as exc:
        pe.configure(config, credentials, lambda _: None, lambda *args: pytest.fail('Unexpected connection'))
    assert 'credential_resolution_failed' in str(exc.value)
    assert 'canary' not in str(exc.value)


def test_every_target_read_succeeds_before_any_mutation():
    first = Client()
    second = Client()
    def fail():
        raise RuntimeError('canary-password')
    second.read_title = fail
    with pytest.raises(pe.LoginTitleError) as exc:
        pe.configure(intent(2), resolve, lambda _: None, lambda host, *args: first if host.endswith('.10') else second)
    assert first.writes == []
    assert 'current_title_read' in str(exc.value) and 'canary' not in str(exc.value)


def test_concurrent_change_stops_without_writing():
    client = Client()
    states = iter(['Prism Element', 'Updated elsewhere'])
    client.read_title = lambda: next(states)
    with pytest.raises(pe.LoginTitleError, match='concurrent_change'):
        pe.configure(intent(), resolve, lambda _: None, lambda *args: client)
    assert not client.writes


def test_write_acknowledgement_does_not_replace_readback():
    client = Client()
    client.broken_write = True
    with pytest.raises(pe.LoginTitleError, match='verification_failed'):
        pe.configure(intent(), resolve, lambda _: None, lambda *args: client)
    assert len(client.writes) == 1


@pytest.mark.parametrize('stage', ['apply', 'verification'])
def test_failures_after_write_attempt_report_uncertain_state_without_secrets(stage):
    def fail():
        raise RuntimeError('canary-password Authorization: Basic secret-token')
    with pytest.raises(pe.LoginTitleError) as exc:
        pe._stage(stage, '192.0.2.10', fail)
    assert 'may have changed' in str(exc.value)
    assert 'canary' not in str(exc.value) and 'secret-token' not in str(exc.value)


def test_wire_contract_uses_only_fixed_setting_and_preserves_other_keys():
    client = pe.PeLoginTitleClient('192.0.2.10', 'admin', 'canary-password')
    rows = [{'type': pe.UI_TYPE, 'key': pe.UI_KEY, 'value': 'Prism Element'},
            {'type': pe.UI_TYPE, 'key': 'color_in', 'value': '#123456'},
            {'type': pe.UI_TYPE, 'key': 'title', 'value': 'Existing blurb'}]
    old = copy.deepcopy(rows)
    requests = []
    class Opener:
        def open(self, req, timeout):
            requests.append(req)
            assert req.full_url == 'https://192.0.2.10:9440' + pe.UI_PATH and timeout == 30
            if req.get_method() != 'GET':
                payload = json.loads(req.data)
                assert set(payload) == {'type', 'key', 'value'}
                assert payload['type'] == pe.UI_TYPE and payload['key'] == pe.UI_KEY
                rows[0]['value'] = payload['value']
                return io.BytesIO(b'')
            return io.BytesIO(json.dumps({'entities': rows}).encode())
    client.opener = Opener()
    pe.configure(intent(), resolve, lambda _: None, lambda *args: client)
    assert [req.get_method() for req in requests] == ['GET', 'GET', 'PUT', 'GET']
    assert rows[1:] == old[1:]


@pytest.mark.parametrize('response', [None, {}, {'entities': 'invalid'}, 'html', [None],
                                     [{'type': pe.UI_TYPE, 'key': pe.UI_KEY, 'value': 1}],
                                     [{'type': pe.UI_TYPE, 'key': pe.UI_KEY, 'value': 'one'}] * 2])
def test_unknown_or_ambiguous_read_shapes_fail_closed(response):
    client = pe.PeLoginTitleClient('192.0.2.10', 'admin', 'canary-password')
    client.request = lambda *args: response
    with pytest.raises(pe.LoginTitleError):
        client.read_title()


@pytest.mark.parametrize('old', ['x' * 129, 'legacy\x1b[31m', '<b>Legacy</b>'])
def test_legacy_string_titles_can_be_replaced(old):
    client = pe.PeLoginTitleClient('192.0.2.10', 'admin', 'canary-password')
    client.request = lambda *args: [{'type': pe.UI_TYPE, 'key': pe.UI_KEY, 'value': old}]
    assert client.read_title() == old
    fake = Client(old)
    assert pe.configure(intent(), resolve, lambda _: None, lambda *args: fake)['192.0.2.10']['verified_title'] == 'CLUSTER-0'


def test_same_target_reentry_fails_before_network_and_releases_after_failure():
    with pe._target_lock('192.0.2.10'):
        with pytest.raises(pe.LoginTitleError, match='target_busy'):
            pe.configure(intent(), resolve, lambda _: None, lambda *args: pytest.fail('network contacted'))
    client = Client()
    assert pe.configure(intent(), resolve, lambda _: None, lambda *args: client)['192.0.2.10']['Prism_Login_Title'] == 'PASS'


@pytest.mark.parametrize('code,category', [(401, 'authentication_failed'), (403, 'authorization_failed'),
                                        (404, 'api_incompatible'), (405, 'api_incompatible'),
                                        (409, 'concurrent_change'), (429, 'rate_limited'), (500, 'http_failed')])
def test_safe_http_errors(code, category):
    client = pe.PeLoginTitleClient('192.0.2.10', 'admin', 'canary-password')
    class Opener:
        def open(self, *args, **kwargs):
            raise urllib.error.HTTPError('https://user:canary-password@target/', code, 'raw-secret', {}, io.BytesIO(b'raw-secret'))
    client.opener = Opener()
    with pytest.raises(pe.LoginTitleError) as exc:
        client.read_title()
    assert exc.value.category == category
    assert 'secret' not in str(exc.value) and 'canary' not in str(exc.value)


def test_tls_default_and_explicit_opt_out_are_client_local():
    secure = pe.PeLoginTitleClient('192.0.2.10', 'admin', 'password')
    insecure = pe.PeLoginTitleClient('192.0.2.10', 'admin', 'password', False)
    def context(client):
        return next(handler for handler in client.opener.handlers if isinstance(handler, __import__('urllib.request', fromlist=['HTTPSHandler']).HTTPSHandler))._context
    assert context(secure).verify_mode == ssl.CERT_REQUIRED and context(secure).check_hostname
    assert context(insecure).verify_mode == ssl.CERT_NONE and not context(insecure).check_hostname
    assert ssl.create_default_context().verify_mode == ssl.CERT_REQUIRED
    assert not any(isinstance(h, __import__('urllib.request', fromlist=['ProxyHandler']).ProxyHandler) and h.proxies
                   for h in secure.opener.handlers)
    redirects = next(h for h in secure.opener.handlers if isinstance(h, __import__('urllib.request', fromlist=['HTTPRedirectHandler']).HTTPRedirectHandler))
    assert redirects.redirect_request(None, None, 302, None, {}, 'https://elsewhere.example/') is None
