from copy import deepcopy

import pytest

import virtual_switch_mtu as mtu
from tests.test_ahv_uplink_migration import Lab, intent


class MtuLab(Lab):
    def __init__(self):
        super().__init__()
        self.uplink_mtu = 1500
        self.verify_mtu = True

    def rows(self, path, cluster_header=None):
        result = super().rows(path, cluster_header)
        if path.endswith('/host-nics'):
            for nic in result:
                nic['mtuInBytes'] = self.uplink_mtu
        return result

    def exchange(self, method, path, body=None, etag=None):
        result = super().exchange(method, path, body, etag)
        if method == 'PUT':
            self.source['mtu'] = body['mtu']
            if self.verify_mtu:
                self.uplink_mtu = body['mtu']
        return result


def draft(rollback=''):
    return {'connection': intent()['connection'], 'fabricReviewed': True, 'rollbackJobId': rollback}


def execute(lab, plan, original=None):
    reports = []
    mtu.execute(plan, lab, lab, lambda _: None, lambda: None, lambda: False,
                reports.extend, original, sleep=lambda _: None)
    return reports


def test_read_only_apply_and_approved_rollback():
    lab = MtuLab()
    original = mtu.preflight(draft(), lab, lab)
    assert not lab.writes
    assert original['targetMtu'] == 9000
    hosts = deepcopy(lab.source['clusters'])
    result = execute(lab, original)
    assert len(result) == 3 and all(row['verified'] for row in result)
    assert lab.source['clusters'] == hosts
    assert lab.writes[0][2]['isQuickMode'] is False
    assert lab.writes[0][3] == '"revision"'
    assert not mtu.needs_change(mtu.preflight(draft(), lab, lab))

    rollback = mtu.preflight(draft('job-1'), lab, lab, original)
    assert rollback['targetMtu'] == 1500
    assert all(row['verified'] for row in execute(lab, rollback, original))
    assert [write[2]['mtu'] for write in lab.writes] == [9000, 1500]


def test_reject_stale_plan_and_missing_telemetry():
    lab = MtuLab()
    plan = mtu.preflight(draft(), lab, lab)
    lab.source['description'] = 'changed'
    with pytest.raises(mtu.uplink.MigrationError, match='reviewed MTU plan changed'):
        execute(lab, plan)
    lab.uplink_mtu = None
    with pytest.raises(mtu.uplink.MigrationError, match='telemetry'):
        mtu.preflight(draft(), lab, lab)
    assert not lab.writes


def test_host_mismatch_fails_and_rollback_requires_original():
    lab = MtuLab()
    plan = mtu.preflight(draft(), lab, lab)
    lab.verify_mtu = False
    with pytest.raises(mtu.uplink.MigrationError, match='did not report'):
        execute(lab, plan)
    assert len(lab.writes) == 1
    with pytest.raises(mtu.uplink.MigrationError, match='original change job'):
        mtu.preflight(draft('job-1'), lab, lab)
    rollback = mtu.preflight(draft('job-1'), lab, lab, plan)
    assert mtu.needs_change(rollback)


def test_mtu_api_requires_admin_and_disables_writes_by_default(client, auth_headers, monkeypatch):
    monkeypatch.delenv('ZTF_VS0_MTU_ENABLE_MUTATION', raising=False)
    assert client.get('/api/virtual-switch-mtu').status_code == 401
    assert client.get('/api/virtual-switch-mtu', headers=auth_headers).json == {'applyEnabled': False}
    assert client.post('/api/virtual-switch-mtu/preflight', headers=auth_headers, json={}).status_code == 400
    assert client.post('/api/virtual-switch-mtu/apply', headers=auth_headers, json={}).status_code == 403
