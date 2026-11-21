"""Create an empty cluster-local AHV bridge; never detach or assign physical NICs."""
import copy
import json
import os

import ahv_uplink_migration as uplink
import pe_direct
import pe_direct_uplink_ssh as ssh

WORKFLOW = 'create-virtual-switch'
FILENAME = WORKFLOW + '.yml'


def writes_enabled():
    return os.environ.get('ZTF_CREATE_VIRTUAL_SWITCH_ENABLE_MUTATION', '').lower() == 'true'


def intent(value):
    if not isinstance(value, dict) or set(value) != {'connection', 'switchName', 'reviewed'} or value['reviewed'] is not True:
        raise uplink.MigrationError('Review the create-only switch intent and maintenance prerequisites.')
    if not isinstance(value['switchName'], str):
        raise uplink.MigrationError('Use a switch name from vs1 through vs999.')
    config = pe_direct.connection(value['connection'])
    # Reuse the fixed vsN -> brN mapping. br0/vs0 and shell syntax are excluded.
    from pe_direct_uplink import Controller
    bridge = Controller.bridge({'name': value['switchName']})
    return {'connection': config, 'switchName': 'vs' + bridge[2:], 'reviewed': True}


def preflight(value, controller, pe):
    selected = intent(value)
    cluster, hosts = controller.observe(pe)
    bridge = controller.bridge({'name': selected['switchName']})
    present = [bridge in h['observed']['switches'] for h in hosts]
    for host in hosts:
        source = host['observed']['switches'].get('br0')
        if not source or len(source['ports']) < 2 or any(not n['up'] for n in host['nics'] if n['name'] in source['ports']):
            raise uplink.MigrationError('Each host needs a verified br0 and at least two working management uplinks.')
        existing = host['observed']['switches'].get(bridge)
        if existing and (existing['ports'] or existing['bond'] is not None or existing['bondMode'] is not None):
            raise uplink.MigrationError('An existing switch has physical uplinks or a bond. This action never modifies an existing switch.')
    return {'intent': selected, 'clusterName': cluster['name'], 'cluster': cluster,
            'bridge': bridge, 'hosts': hosts, 'changeRequired': not all(present)}


def load_plan(content):
    if not isinstance(content, str) or len(content) > uplink.MAX_CONTENT:
        raise uplink.MigrationError('Provide a bounded, reviewed switch creation plan.')
    try:
        result = json.loads(content)
        if (set(result) != {'intent', 'clusterName', 'cluster', 'bridge', 'hosts', 'changeRequired'}
                or intent(result['intent']) != result['intent'] or uplink.canonical(result) != content):
            raise ValueError()
        return result
    except (ValueError, TypeError, KeyError):
        raise uplink.MigrationError('Use the exact server-generated switch creation plan.') from None


def execute(plan, controller, pe, emit, authorize, cancelled, report):
    if cancelled():
        raise uplink.MigrationError('Cancelled before switch creation.')
    if preflight(plan['intent'], controller, pe) != plan or not plan['changeRequired']:
        raise uplink.MigrationError('The plan changed or the empty switch already exists. Run a fresh preflight.')
    completed = {}
    results = []
    for baseline in plan['hosts']:
        if cancelled():
            raise uplink.MigrationError('Cancelled between hosts. Completed switches remain; reconcile before retrying.')
        cluster, current = controller.observe(pe, cancelled)
        by_id = {h['id']: h for h in current}
        expected_ids = {h['id'] for h in plan['hosts']}
        if cluster != plan['cluster'] or set(by_id) != expected_ids:
            raise uplink.MigrationError('PE identity or membership changed after approval.')
        for original in plan['hosts']:
            expected = completed.get(original['id'], original['observed'])
            actual = by_id[original['id']]
            if (actual['serial'] != original['serial'] or actual['hostIp'] != original['hostIp']
                    or actual['cvmIp'] != original['cvmIp'] or actual['observed'] != expected):
                raise uplink.MigrationError('Host or OVS state changed after approval. No later host was changed.')
        if plan['bridge'] in baseline['observed']['switches']:
            completed[baseline['id']] = baseline['observed']
            results.append({'hostId': baseline['id'], 'host': baseline['name'], 'bridge': plan['bridge'],
                            'mtu': baseline['observed']['switches'][plan['bridge']]['mtu'], 'stage': 'verified', 'action': 'already_present'})
            report(results)
            continue
        authorize()
        emit(f"{baseline['name']}: creating empty {plan['bridge']}; physical NIC assignments remain unchanged.")
        ssh.run(controller.node(baseline), controller.saved, 'create', {'bridge': plan['bridge']}, cancelled)
        observed = ssh.run(controller.node(baseline), controller.saved, 'inspect', cancelled=cancelled)['inventory']
        created = observed['switches'].get(plan['bridge'])
        previous = copy.deepcopy(observed)
        previous['switches'].pop(plan['bridge'], None)
        if (previous != baseline['observed'] or not created or not isinstance(created.get('uuid'), str)
                or not created['uuid'] or created.get('name') != plan['bridge']
                or created.get('ports') != [] or created.get('bond') is not None
                or created.get('bondMode') is not None or type(created.get('mtu')) is not int
                or not 1 <= created['mtu'] <= 65535):
            raise uplink.MigrationError('New empty bridge or unchanged management/NIC state did not verify. Reconcile before retrying.')
        completed[baseline['id']] = observed
        results.append({'hostId': baseline['id'], 'host': baseline['name'], 'bridge': plan['bridge'],
                        'mtu': created['mtu'], 'stage': 'verified', 'action': 'created'})
        report(results)
        emit(f"{baseline['name']}: empty bridge verified; management bridge and all NICs unchanged.")
    cluster, hosts = controller.observe(pe, cancelled)
    if cluster != plan['cluster'] or any(h['observed'] != completed[h['id']] for h in hosts):
        raise uplink.MigrationError('Final cluster-wide state changed. Preserve completed work and reconcile.')
    return results
