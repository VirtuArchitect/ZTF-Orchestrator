import server


def test_retired_pipeline_requires_explicit_conversion(client, auth_headers):
    server._save_pipelines([{'id': 'preview', 'name': 'Saved preview',
                             'executor': 'native', 'steps': [{'workflow': 'config-cluster', 'configFile': 'saved.yml'}]}])
    path = '/api/pipelines/preview'
    assert client.post(path + '/run', headers=auth_headers).status_code == 409
    assert client.put(path, headers=auth_headers, json={'name': 'Renamed'}).json['executor'] == 'native'
    assert client.put(path, headers=auth_headers, json={'executor': 'legacy'}).json['executor'] == 'legacy'
    assert client.post('/api/pipelines', headers=auth_headers,
                       json={'name': 'New preview', 'executor': 'native'}).status_code == 410


def test_retirement_blocks_new_operations_and_preserves_reads(client, auth_headers):
    for path, payload in (
        ('/api/nkp/install', {}),
        ('/api/ztf2/install', {}),
        ('/api/jobs', {'framework': 'ztf2'}),
        ('/api/approvals', {'workflow': 'ztf2:apply'}),
        ('/api/validation-evidence', {'source': 'nkp'}),
        ('/api/appliance/updates/import', {'target': 'nkp-framework'}),
    ):
        assert client.post(path, headers=auth_headers, json=payload).status_code == 410
    assert client.get('/api/nkp/profiles', headers=auth_headers).status_code == 200
    assert client.get('/api/validation-evidence', headers=auth_headers).status_code == 200
