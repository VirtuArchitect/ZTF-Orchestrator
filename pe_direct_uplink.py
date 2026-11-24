"""Sequential cluster-local OVS migration using PE identity and pinned CVM SSH."""
import copy
import re

import pe_direct
import pe_direct_uplink_ssh as ssh


class Controller:
    def __init__(self, config, resolver):
        self.config = pe_direct.connection(config)
        self.resolver = resolver
        ref = config.get('cvm_credential')
        pins = config.get('cvm_host_keys')
        if not isinstance(ref, str) or not pe_direct.REF.fullmatch(ref) or not isinstance(pins, dict) or not 3 <= len(pins) <= 16:
            raise pe_direct.DirectError('Provide a CVM credential reference and verified SSH host keys for every CVM.')
        for ip, pin in pins.items():
            if pe_direct.host_ip(ip) != ip or not isinstance(pin, str) or not ssh.PIN.fullmatch(pin):
                raise pe_direct.DirectError('Use CVM IPv4 addresses mapped to verified SHA256 SSH host keys.')
        self.saved = pe_direct.credential(config, resolver, 'cvm_credential')
        if self.saved[0] != 'nutanix':
            raise pe_direct.DirectError('The CVM credential must identify the nutanix user.')

    def node(self, host):
        ip = pe_direct.host_ip(host['cvmIp'])
        if ip not in self.config['cvm_host_keys']:
            raise pe_direct.DirectError('A discovered CVM has no reviewed SSH host-key fingerprint.')
        return {'address': ip, 'ssh_host_key_sha256': self.config['cvm_host_keys'][ip]}

    def observe(self, pe, cancelled=lambda: False):
        # Aggregate PE health includes bootstrap/licensing alerts unrelated to OVS
        # readiness. Identity, pinned SSH and the observed network remain mandatory.
        cluster, hosts = pe_direct.inventory(self.config, pe, require_good_health=False)
        if {pe_direct.host_ip(h['cvmIp']) for h in hosts} != set(self.config['cvm_host_keys']):
            raise pe_direct.DirectError('The SSH host-key inventory must exactly match discovered CVMs.')
        for host in hosts:
            host['hostIp'] = pe_direct.host_ip(host['hostIp'])
            observed = ssh.run(self.node(host), self.saved, 'inspect', cancelled=cancelled)['inventory']
            if observed['serial'] != host['serial'] or host['hostIp'] not in observed['addresses']:
                raise pe_direct.DirectError('The CVM-local AHV serial or management address does not match PE.')
            host['observed'] = observed
            host['nics'] = observed['nics']
        return cluster, hosts

    @staticmethod
    def bridge(target):
        name = target['name']
        if not re.fullmatch(r'(?:vs|br)[1-9][0-9]{0,2}', name):
            raise pe_direct.DirectError('PE-direct destinations use vs1/br1 through vs999/br999. vs1 maps to local OVS br1.')
        return re.sub(r'^vs', 'br', name)

    def collect(self, pe, target=None):
        cluster, hosts = self.observe(pe)
        source_hosts = []
        for host in hosts:
            source = host['observed']['switches'].get('br0')
            if not source or source['bondMode'] != 'active-backup' or len(source['ports']) < 2:
                raise pe_direct.DirectError('Every host needs an identifiable active-backup br0 uplink bond.')
            source_hosts.append({'extId': host['id'], 'hostNics': source['ports']})
        common = set.intersection(*(set(h['observed']['switches']) for h in hosts)) - {'br0'}
        switches = [{'name': 'vs' + b[2:], 'bondMode': 'ACTIVE_BACKUP', 'mtu': hosts[0]['observed']['switches'][b]['mtu']}
                    for b in sorted(common)]
        destination = None
        if target:
            bridge = self.bridge(target)
            present = [bridge in h['observed']['switches'] for h in hosts]
            if any(present) and not all(present):
                raise pe_direct.DirectError('The destination exists on only some hosts. Reconcile the partial operation before a new plan.')
            if all(present):
                destination = {'config': {'name': target['name']}}
        return {'clusterName': cluster['name'], 'cluster': cluster,
                'source': {'config': {'name': 'vs0', 'clusters': [{'hosts': source_hosts}]}},
                'destination': destination, 'switches': switches, 'hosts': hosts}

    def preflight(self, intent, pe):
        inventory = self.collect(pe, intent['target'])
        bridge = self.bridge(intent['target'])
        if (intent['target']['mode'] == 'create') == bool(inventory['destination']):
            raise pe_direct.DirectError('Destination already exists or is missing. Review its mode and name.')
        if set(intent['move']) != {h['id'] for h in inventory['hosts']} or not any(intent['move'].values()):
            raise pe_direct.DirectError('Review every host and select at least one uplink to move.')
        assignments = []
        for host in inventory['hosts']:
            observed = host['observed']
            source = observed['switches']['br0']
            dest = observed['switches'].get(bridge)
            moved = intent['move'][host['id']]
            kept = sorted(set(source['ports']) - set(moved))
            existing = dest['ports'] if dest else []
            if not set(moved).issubset(source['ports']) or len(kept) < 2 or len(existing) + len(moved) < 2:
                raise pe_direct.DirectError('Each host needs two retained br0 uplinks and two destination uplinks.')
            if dest and ((dest['ports'] and dest['bondMode'] != 'active-backup')
                         or (not dest['ports'] and (dest['bond'] is not None or dest['bondMode'] is not None))
                         or (dest['ports'] and dest['mtu'] != intent['target']['mtu'])):
                raise pe_direct.DirectError('Existing destination bond mode or MTU differs from the plan.')
            by_name = {n['name']: n for n in host['nics']}
            if any(not by_name[n]['up'] for n in kept + moved + existing):
                raise pe_direct.DirectError('Every retained and destination uplink must report an operational link.')
            assignments.append({'hostId': host['id'], 'host': host['name'], 'keep': kept,
                                'move': moved, 'destination': sorted(existing + moved)})
        inventory.pop('switches')
        return {'intent': intent, 'inventory': inventory, 'assignments': assignments}

    def execute(self, plan, pe, emit, authorize, cancelled, report):
        if cancelled():
            raise pe_direct.DirectError('Cancelled before uplink changes.')
        if self.preflight(plan['intent'], pe) != plan:
            raise pe_direct.DirectError('PE or OVS inventory differs from the approved plan. Review a new plan.')
        bridge = self.bridge(plan['intent']['target'])
        results = []
        previous = {h['id']: h for h in plan['inventory']['hosts']}
        verified = {}
        for assignment in plan['assignments']:
            host = previous[assignment['hostId']]
            if cancelled():
                raise pe_direct.DirectError('Cancelled between hosts. Completed work is retained; reconcile before retrying.')
            current_cluster, current_hosts = self.observe(pe, cancelled)
            current = next(h for h in current_hosts if h['id'] == host['id'])
            if (current_cluster != plan['inventory']['cluster'] or current != host
                    or any(h['observed'] != verified[h['id']] for h in current_hosts if h['id'] in verified)):
                raise pe_direct.DirectError('The next host or cluster changed after approval. Reconcile before retrying.')
            if not assignment['move']:
                verified[host['id']] = current['observed']
                results.append({**assignment, 'kept': assignment['keep'], 'moved': [], 'stage': 'verified'})
                report(results)
                continue
            node = self.node(host)
            source = host['observed']['switches']['br0']
            destination = host['observed']['switches'].get(bridge)
            authorize()
            emit(f'{host["name"]}: retaining approved br0 uplinks through the pinned CVM SSH connection.')
            ssh.run(node, self.saved, 'uplinks', {'bridge': 'br0', 'ports': assignment['keep'],
                    'bond': source['bond'], 'mtu': source['mtu']}, cancelled)
            retained = ssh.run(node, self.saved, 'inspect', cancelled=cancelled)['inventory']
            expected = copy.deepcopy(host['observed'])
            expected['switches']['br0']['ports'] = assignment['keep']
            for nic in expected['nics']:
                if nic['name'] in assignment['move']:
                    nic['switch'] = None
            if retained != expected:
                raise pe_direct.DirectError('Retained br0 identity, management address or uplinks did not verify. No later host was changed.')
            retained_cluster, _ = pe_direct.inventory(self.config, pe, require_good_health=False)
            if retained_cluster != plan['inventory']['cluster']:
                raise pe_direct.DirectError('PE membership changed after retaining br0. Reconcile before continuing.')
            results.append({**assignment, 'kept': assignment['keep'], 'moved': assignment['move'], 'stage': 'retained_uplinks_verified'})
            report(results)
            if not destination:
                authorize()
                ssh.run(node, self.saved, 'create', {'bridge': bridge}, cancelled)
            authorize()
            ssh.run(node, self.saved, 'uplinks', {'bridge': bridge, 'ports': assignment['destination'],
                    'bond': destination['bond'] if destination and destination['bond'] else bridge + '-up', 'mtu': plan['intent']['target']['mtu']}, cancelled)
            final = ssh.run(node, self.saved, 'inspect', cancelled=cancelled)['inventory']
            final_source, final_dest = final['switches'].get('br0'), final['switches'].get(bridge)
            nics = {n['name']: n for n in final['nics']}
            old_nics = {n['name']: n for n in host['nics']}
            if (final['serial'] != host['serial'] or final['addresses'] != host['observed']['addresses']
                    or final_source != expected['switches']['br0'] or not final_dest
                    or (destination and final_dest['uuid'] != destination['uuid'])
                    or final_dest['ports'] != assignment['destination'] or final_dest['bondMode'] != 'active-backup'
                    or final_dest['mtu'] != plan['intent']['target']['mtu']
                    or any(n not in nics or nics[n]['mac'] != old_nics[n]['mac'] or not nics[n]['up']
                           or nics[n]['switch'] != ('br0' if n in assignment['keep'] else bridge)
                           for n in assignment['keep'] + assignment['destination'])):
                raise pe_direct.DirectError('Host uplink verification failed. Completed work is retained; no later host was changed.')
            untouched = set(host['observed']['switches']) - {'br0', bridge}
            if (set(final['switches']) != set(host['observed']['switches']) | {bridge}
                    or any(final['switches'][b] != host['observed']['switches'][b] for b in untouched)):
                raise pe_direct.DirectError('An unrelated bridge changed. Reconcile before continuing.')
            actual, _ = pe_direct.inventory(self.config, pe, require_good_health=False)
            if actual != plan['inventory']['cluster']:
                raise pe_direct.DirectError('PE identity or membership changed during verification.')
            results[-1]['stage'] = 'verified'
            verified[host['id']] = final
            report(results)
            emit(f'{host["name"]}: retained management connectivity and both uplink assignments verified.')
        final_cluster, final_hosts = self.observe(pe, cancelled)
        if (final_cluster != plan['inventory']['cluster']
                or any(h['observed'] != verified[h['id']] for h in final_hosts)):
            raise pe_direct.DirectError('Final cluster-wide uplink readback changed. Reconcile before retrying.')
        return results
