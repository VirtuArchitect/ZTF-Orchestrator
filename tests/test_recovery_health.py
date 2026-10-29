"""Read-only PE recovery health evidence; never contacts real targets."""
from copy import deepcopy
import pytest
import yaml
import recovery_health
from tests.test_disaster_recovery import foundation_config


def snapshot():
    return {'deploymentContent': yaml.safe_dump(foundation_config()), 'clusterName': 'HCI-01', 'clusterVip': '192.0.2.20',
            'steps': [{'workflow': 'config-cluster', 'configContent': yaml.safe_dump({'clusters': {'192.0.2.20': {
                'name': 'HCI-01', 'pe_credential': 'old-admin', 'new_pe_admin_credential': 'new-admin'}}})}]}


def responses():
    nodes = foundation_config()['create_clusters'][0]['nodes_list']
    return ({'uuid': 'cluster-uuid', 'name': 'HCI-01', 'cluster_external_ipaddress': '192.0.2.20', 'health_summary': {'health_status': 'Good'}},
            {'metadata': {'grand_total_entities': len(nodes)}, 'entities': [{'serial': n['node_serial'], 'hypervisor_address': n['host_ip'],
              'service_vmexternal_ip': n['cvm_ip'], 'health_summary': {'health_status': 'Good'}} for n in nodes]})


def test_fresh_replacement_credentials_and_complete_identity_are_required(monkeypatch):
    cluster, hosts = responses()
    calls = []
    def read(url, ref, path, lookup):
        calls.append((url, ref, path))
        return deepcopy(hosts if '/hosts/' in path else cluster)
    monkeypatch.setattr(recovery_health, 'read', read)
    result = recovery_health.collect(snapshot(), lambda ref: None)
    assert result['status'] == 'passed'
    assert len(calls) == 2 and all(ref == 'new-admin' for _, ref, _ in calls)
    assert all(url == 'https://192.0.2.20:9440' for url, _, _ in calls)


@pytest.mark.parametrize('change', ['name', 'vip', 'missing_health', 'warning', 'serial', 'host_ip', 'cvm_ip', 'pagination', 'uuid_type', 'total_type'])
def test_missing_or_mismatched_evidence_never_passes(monkeypatch, change):
    cluster, hosts = responses()
    if change == 'uuid_type': cluster['uuid'] = {'untrusted': 'value'}
    if change == 'total_type': hosts['metadata']['grand_total_entities'] = True
    if change == 'name': cluster['name'] = 'different'
    if change == 'vip': cluster['cluster_external_ipaddress'] = '192.0.2.99'
    if change == 'missing_health': cluster.pop('health_summary')
    if change == 'warning': hosts['entities'][0]['health_summary']['health_status'] = 'Warning'
    if change == 'serial': hosts['entities'][0]['serial'] = 'UNEXPECTED'
    if change == 'host_ip': hosts['entities'][0]['hypervisor_address'] = '192.0.2.99'
    if change == 'cvm_ip': hosts['entities'][0]['service_vmexternal_ip'] = '192.0.2.99'
    if change == 'pagination': hosts['metadata']['grand_total_entities'] += 1
    monkeypatch.setattr(recovery_health, 'read', lambda url, ref, path, lookup: hosts if '/hosts/' in path else cluster)
    assert recovery_health.collect(snapshot(), lambda ref: None)['status'] == 'unknown'


def test_raw_transport_errors_and_secrets_are_not_returned(monkeypatch):
    def fail(*args): raise ValueError('sensitive-password raw server body')
    monkeypatch.setattr(recovery_health, 'read', fail)
    result = recovery_health.collect(snapshot(), lambda ref: None)
    assert result['status'] == 'unknown' and 'sensitive-password' not in str(result)
