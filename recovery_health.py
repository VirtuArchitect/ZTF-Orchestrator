"""Strict, read-only PE recovery evidence; missing fields never imply health."""

from prism_drift import endpoint
from upgrade_inventory import read


def collect(snapshot, lookup):
    # Imported lazily to keep recovery intent validation independent of transport.
    from disaster_recovery import bootstrap_count, reference_only

    checks = []
    def check(name, passed):
        checks.append({'name': name, 'status': 'passed' if passed else 'unknown_or_failed'})

    try:
        deployment = reference_only(snapshot['deploymentContent'])['create_clusters'][0]
        steps = snapshot['steps']
        count = bootstrap_count(snapshot)
        credential = ''
        for step in steps[:count] or steps[:1]:
            target = next(iter(reference_only(step['configContent'])['clusters'].values()))
            credential = target.get('new_pe_admin_credential') or target.get('pe_credential') or credential
        if not isinstance(credential, str) or not credential.strip():
            return {'status': 'unknown', 'checks': checks, 'message': 'No reviewed PE credential reference is available.'}
        url = endpoint(snapshot['clusterVip'])
        cluster = read(url, credential, '/PrismGateway/services/rest/v2.0/cluster/?include_health_summary=true', lookup)
        hosts = read(url, credential, '/PrismGateway/services/rest/v2.0/hosts/?include_health_summary=true', lookup)
        if not isinstance(cluster, dict) or not isinstance(hosts, dict):
            raise ValueError('Unsupported PE readback')
        check('Fresh authenticated PE cluster identity', isinstance(cluster.get('uuid'), str) and bool(cluster['uuid'].strip()) and cluster.get('name') == snapshot['clusterName']
              and cluster.get('cluster_external_ipaddress') == snapshot['clusterVip'])
        entities = hosts.get('entities')
        metadata = hosts.get('metadata')
        expected = deployment['nodes_list']
        complete = (isinstance(entities, list) and bool(entities) and isinstance(metadata, dict)
                    and type(metadata.get('grand_total_entities')) is int
                    and metadata.get('grand_total_entities') == len(entities) == len(expected)
                    and metadata.get('total_entities', len(entities)) == len(entities)
                    and all(isinstance(h, dict) for h in entities))
        check('Complete expected physical host inventory', complete)
        matches = False
        if complete:
            actual = {h.get('serial'): h for h in entities if isinstance(h.get('serial'), str)}
            matches = len(actual) == len(expected) and set(actual) == {n['node_serial'] for n in expected}
            if matches:
                matches = all(actual[n['node_serial']].get('hypervisor_address') == n['host_ip']
                              and actual[n['node_serial']].get('service_vmexternal_ip') == n['cvm_ip'] for n in expected)
        check('Exact node serials and AHV and CVM addresses', matches)
        def good(value):
            summary = value.get('health_summary')
            return isinstance(summary, dict) and summary.get('health_status') == 'Good'
        check('PE reported cluster health Good', good(cluster))
        check('PE reported every host health Good', bool(complete) and all(good(h) for h in entities))
        passed = all(c['status'] == 'passed' for c in checks)
        return {'status': 'passed' if passed else 'unknown', 'checks': checks,
                'message': 'Verified PE API identity, membership and reported health.' if passed else
                'PE evidence is incomplete or does not match the baseline. Review the target or use independent health attestation.'}
    except (ValueError, KeyError, TypeError, IndexError):
        # Credential values, API bodies and transport exception text stay private.
        return {'status': 'unknown', 'checks': checks,
                'message': 'PE readback could not be verified. Check the reviewed credential reference, certificate trust, connectivity and API compatibility.'}
