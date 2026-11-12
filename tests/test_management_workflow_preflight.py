import json

import pytest
import yaml


def events(workflow, config):
    import server
    return [json.loads(line[6:]) for line in ''.join(
        server._run_preflight(workflow, yaml.safe_dump(config), 'preflight-test')
    ).splitlines() if line.startswith('data: ')]


def test_management_preflight_uses_runtime_pod_mapping(monkeypatch):
    import server
    targets = []
    monkeypatch.setattr(server, '_tcp_check', lambda host, port: (targets.append((host, port)) or (True, 1)))
    monkeypatch.setattr(server, '_lookup_credential_ref', lambda ref: ('test-user', 'test-secret', None))
    config = {'pod': {
        'pc_ip': '192.0.2.10', 'pc_credential': 'pc_user',
        'clusters': {'192.0.2.20': {
            'pe_credential': 'pe_user', 'cvm_credential': 'cvm_credential',
            'deploy_pc_config': {'pc_version': 'test-version'},
        }},
    }}
    result = events('deploy-management-pc', config)
    assert result[-1]['data']['status'] == 'success'
    assert set(targets) == {('192.0.2.10', 9440), ('192.0.2.20', 9440)}
    assert 'test-secret' not in json.dumps(result)


@pytest.mark.parametrize('config', [
    {'management_pc': {'pc_ip': '192.0.2.10'}},
    {'pod': []}, {'pod': {}},
    {'pod': {'pc_ip': '192.0.2.10', 'pc_credential': 'pc_user', 'clusters': {}}},
])
def test_management_preflight_rejects_legacy_or_incomplete_shape(monkeypatch, config):
    import server
    monkeypatch.setattr(server, '_tcp_check', lambda host, port: (True, 1))
    monkeypatch.setattr(server, '_lookup_credential_ref', lambda ref: ('test-user', 'test-secret', None))
    assert events('deploy-management-pc', config)[-1]['data']['status'] == 'failed'


def test_site_preflight_rejects_missing_sites_and_empty_nodes(monkeypatch):
    import server
    monkeypatch.setattr(server, '_tcp_check', lambda host, port: (True, 1))
    monkeypatch.setattr(server, '_lookup_credential_ref', lambda ref: ('test-user', 'test-secret', None))
    config = {'pc_ip': '192.0.2.10', 'pc_credential': 'pc_user', 'cvm_credential': 'cvm_credential'}
    assert events('site-deploy', config)[-1]['data']['status'] == 'failed'
    config['sites'] = [{'site_name': 'site-a', 'clusters': [
        {'cluster_name': 'cluster-a', 'cluster_vip': '192.0.2.20', 'node_details': []},
    ]}]
    result = events('site-deploy', config)
    assert result[-1]['data']['status'] == 'failed'
    assert any('node_details' in str(event['data']) for event in result)
