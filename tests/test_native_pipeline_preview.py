from copy import deepcopy
import yaml

import server


def test_native_compatibility_blocks_legacy_action(client, auth_headers):
    reply = client.post('/api/pipelines/compatibility', headers=auth_headers, json={
        'steps': [{'workflow': 'config-cluster', 'configFile': 'legacy.yml'}],
    })
    assert reply.status_code == 200
    assert reply.json['compatible'] is False
    assert reply.json['steps'][0]['step'] == 1


def test_native_preflight_validates_yaml_without_contacting_pe(monkeypatch, tmp_path):
    path = tmp_path / 'title.yml'
    config = {'clusters': {'192.0.2.20': {
        'name': 'test', 'pe_credential': 'ref', 'prism_login_title': 'Test',
    }}}
    monkeypatch.setattr(server, 'get_configs_dir', lambda: tmp_path)
    monkeypatch.setattr(server, '_pe_login_title_resolver', lambda _: lambda ref: ('test', 'fixture'))
    steps = [{'workflow': 'SetPrismLoginTitlePe', 'configFile': path.name}]
    path.write_text(yaml.safe_dump(config))
    assert server._native_pipeline_plan(steps) == ([config], [
        {'step': 1, 'compatible': True, 'reason': None},
    ])
    insecure = deepcopy(config)
    insecure['prism_login_title_verify_tls'] = False
    path.write_text(yaml.safe_dump(insecure))
    assert not server._native_pipeline_plan(steps)[1][0]['compatible']
