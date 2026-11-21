"""Packaged enablement is distinct from approval or target-side execution."""
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
CASES = [
    ('ZTF_AHV_UPLINK_MIGRATION_ENABLED', '/api/ahv-uplink-migration'),
    ('ZTF_CREATE_VIRTUAL_SWITCH_ENABLE_MUTATION', '/api/create-virtual-switch'),
    ('ZTF_DARE_ENABLE_MUTATION', '/api/dare'),
    ('ZTF_VS0_MTU_ENABLE_MUTATION', '/api/virtual-switch-mtu'),
]


@pytest.mark.parametrize('flag,endpoint', CASES)
def test_packaged_environment_and_compose_support_explicit_disable(flag, endpoint):
    assert f'ENV {flag}=true' in (ROOT / 'Dockerfile').read_text()
    for name in ['docker-compose.yml', 'appliance/docker-compose.appliance.yml']:
        data = yaml.safe_load((ROOT / name).read_text())
        assert data['services']['ztf-orchestrator']['environment'][flag] == '${' + flag + ':-true}'
    assert f'{flag}=true' in (ROOT / '.env.example').read_text()


@pytest.mark.parametrize('flag,endpoint', CASES)
@pytest.mark.parametrize('value,enabled', [('true', True), ('false', False)])
def test_capability_does_not_bypass_auth_or_plan_approval(client, auth_headers, monkeypatch, flag, endpoint, value, enabled):
    import server
    monkeypatch.setenv(flag, value)
    monkeypatch.setattr(server.limiter, 'enabled', False)
    assert client.get(endpoint).status_code == 401
    response = client.get(endpoint, headers=auth_headers)
    assert response.status_code == 200
    assert response.json == {'applyEnabled': enabled}
    response = client.post(endpoint + '/apply', json={}, headers=auth_headers)
    # Missing intent may fail shape validation (400) before approval checks (403).
    assert response.status_code in {400, 403}
    assert not server._job_manager.list_jobs(100)
