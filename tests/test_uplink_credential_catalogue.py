"""Uplink selectors read declarations, never passwords or remote secret providers."""
import pytest
import yaml

URL = '/api/ahv-uplink-migration/credentials'


def test_reference_usernames_match_resolution_precedence_without_secrets(client, auth_headers, monkeypatch):
    import server
    config = {'vault_to_use': 'selected', 'vaults': {
        'selected': {'credentials': {'pe_ref': {'username': 'administrator', 'password': 'ACTIVE_SECRET'}}},
        'local': {'credentials': {'pe_ref': {'username': 'wrong-fallback', 'password': 'FALLBACK_SECRET'},
                                  'cvm_ref': {'username': 'nutanix', 'password': 'CVM_SECRET'}}},
        'cyberark': {'credentials': {'external_ref': {'path': 'PRIVATE_PATH', 'token': 'TOKEN_SECRET'}}},
    }}
    path = server.get_global_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(config))
    before = path.read_bytes()
    def forbidden(*args, **kwargs):
        raise AssertionError('Catalogue must not resolve a secret or submit execution')
    monkeypatch.setattr(server, '_lookup_credential_ref', forbidden)
    monkeypatch.setattr(server._job_manager, 'submit', forbidden)
    response = client.get(URL, headers=auth_headers)
    assert response.status_code == 200
    assert response.headers['Cache-Control'] == 'no-store'
    assert response.get_json() == {'check': 'declaration_only', 'references': [
        {'reference': 'cvm_ref', 'username': 'nutanix'},
        {'reference': 'external_ref', 'username': ''},
        {'reference': 'pe_ref', 'username': 'administrator'},
    ]}
    assert all(word not in response.text for word in ['SECRET', 'password', 'PRIVATE_PATH', 'token'])
    assert path.read_bytes() == before


@pytest.mark.parametrize('role', ['operator', 'viewer'])
def test_catalogue_is_admin_only(client, auth_headers, monkeypatch, role):
    import server
    original = server._current_session
    monkeypatch.setattr(server, '_current_session', lambda: {**original(), 'role': role})
    assert client.get(URL, headers=auth_headers).status_code == 403


def test_catalogue_requires_authentication(client):
    assert client.get(URL).status_code == 401


@pytest.mark.parametrize('content', ['vaults: [invalid]', 'vaults: [SECRET_SYNTAX', '[invalid-root]'])
def test_invalid_catalogue_fails_without_parser_or_secret_details(client, auth_headers, content):
    import server
    path = server.get_global_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    response = client.get(URL, headers=auth_headers)
    assert response.status_code == 500
    assert response.get_json() == {'error': 'Credential catalogue unavailable. Review saved Global Config and refresh.'}


def test_empty_catalogue_and_legacy_fallback(client, auth_headers, monkeypatch, tmp_path):
    import server
    monkeypatch.setattr(server, 'get_global_config_path', lambda: tmp_path / 'missing.yml')
    legacy = tmp_path / 'legacy.yml'
    monkeypatch.setattr(server, 'get_legacy_global_config_path', lambda: legacy)
    assert client.get(URL, headers=auth_headers).get_json()['references'] == []
    legacy.write_text('vaults:\n  local:\n    credentials:\n      cvm_ref:\n        username: nutanix\n        password: LEGACY_SECRET\n')
    assert client.get(URL, headers=auth_headers).get_json()['references'] == [{'reference': 'cvm_ref', 'username': 'nutanix'}]
