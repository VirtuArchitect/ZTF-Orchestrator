"""Non-routable simulated PE and SSH endpoints; no network clients."""
from copy import deepcopy
import pe_direct as direct
import pe_direct_dare as encryption

CLUSTER = '12345678-0000-4000-8000-000000000001'
HOSTS = [f'12345678-0000-4000-8000-00000000000{i}' for i in (2, 3, 4)]
PINS = {f'192.0.2.{i}': 'SHA256:' + 'A' * 43 for i in (21, 22, 23)}
CONNECTION = {'mode': 'pe-direct', 'pe_endpoint': 'https://pe.example.com:9440', 'pe_credential': 'pe_ref',
              'cluster_uuid': CLUSTER, 'verify_tls': False, 'tls_bypass_reason': 'CHG-123 fresh cluster'}
UPLINK = {**CONNECTION, 'cvm_credential': 'cvm_ref', 'cvm_host_keys': PINS}
DESIRED = {'connection': UPLINK, 'target': {'mode': 'create', 'name': 'vs1', 'bondMode': 'ACTIVE_BACKUP', 'mtu': 1500},
           'move': {h: ['eth2', 'eth3'] for h in HOSTS}, 'fabricReviewed': True}
DARE = {'connection': CONNECTION, 'recoveryReference': 'CHG-123',
        'review': dict.fromkeys(('license', 'keyManager', 'backup', 'irreversible', 'prismState'), True)}


def resolver(ref):
    assert ref in {'pe_ref', 'cvm_ref'}, 'PC or unexpected credential must never be resolved'
    return ('nutanix' if ref == 'cvm_ref' else 'admin', 'fixture-secret-never-log')


class Lab:
    def __init__(self):
        self.calls = []
        self.writes = []
        self.health = 'Good'
        self.kms = 'LKM'
        self.uuid = CLUSTER
        self.encryption = {'desired_password_protection': False, 'is_ready_for_software_encryption': True,
                           'software_encryption_scope': None, 'storage_container_encryption_status': {'container-1': False}}
        self.ambiguous = False
        self.fail_host = None
        self.nodes = []
        self.ovs = {}
        for i, identity in enumerate(HOSTS):
            cvm = f'192.0.2.{21+i}'
            host = f'192.0.2.{31+i}'
            serial = f'SERIAL-{i}'
            self.nodes.append({'uuid': identity, 'serial': serial, 'name': f'AHV-{i}', 'hypervisor_address': host,
                'service_vmexternal_ip': cvm, 'hypervisor_type': 'kKvm', 'health_summary': {'health_status': 'Good'}})
            self.ovs[cvm] = {'serial': serial, 'addresses': [host], 'switches': {
                'br0': {'uuid': identity, 'name': 'br0', 'ports': ['eth0', 'eth1', 'eth2', 'eth3'],
                        'bond': 'br0-up', 'bondMode': 'active-backup', 'mtu': 1500}},
                'nics': [{'name': f'eth{p}', 'mac': f'00:11:22:33:{i:02x}:{p:02x}', 'up': True, 'mtu': 1500,
                          'switch': 'br0', 'restricted': False, 'switchPort': '', 'switchDevice': ''} for p in range(4)]}

    def request(self, method, path, body=None):
        self.calls.append((method, path, deepcopy(body)))
        if method == 'GET':
            if path == '/cluster/':
                return {'uuid': self.uuid, 'name': 'LAB-CLUSTER', 'version': '7.5.1.8',
                        'health_summary': {'health_status': self.health}}
            if path == '/hosts/':
                return {'entities': deepcopy(self.nodes), 'metadata': {'grand_total_entities': len(self.nodes)}}
            if path == encryption.KMS:
                return {'kms_type': self.kms}
            assert path == encryption.STATE
            return deepcopy(self.encryption)
        assert (method, path, body) == ('POST', encryption.STATE + '/enable', {'software_encryption_scope': 'CLUSTER', 'value': True})
        self.writes.append(('PE', method, path))
        self.encryption['software_encryption_scope'] = 'CLUSTER'
        if self.ambiguous:
            raise direct.DirectError('PE submission response was lost; reconcile before retrying.')
        return {'value': True}

    def ssh(self, node, credential, action, command=None, cancelled=lambda: False):
        assert credential[0] == 'nutanix'
        assert node['ssh_host_key_sha256'] == PINS[node['address']]
        assert not cancelled()
        value = self.ovs[node['address']]
        if action == 'inspect':
            return {'ok': True, 'inventory': deepcopy(value)}
        self.writes.append(('SSH', node['address'], action, deepcopy(command)))
        if node['address'] == self.fail_host:
            raise direct.DirectError('Injected SSH response loss; reconcile before retrying.')
        if action == 'create':
            value['switches'][command['bridge']] = {'uuid': 'destination-' + node['address'], 'name': command['bridge'],
                'ports': [], 'bond': None, 'bondMode': None, 'mtu': 1500}
        else:
            assert action == 'uplinks'
            bridge = command['bridge']
            switch = value['switches'][bridge]
            for nic in value['nics']:
                if nic['switch'] == bridge and nic['name'] not in command['ports']:
                    nic['switch'] = None
                if nic['name'] in command['ports']:
                    nic['switch'] = bridge
                    nic['mtu'] = command['mtu']
            switch.update(ports=command['ports'], bond=command['bond'], bondMode='active-backup', mtu=command['mtu'])
        return {'ok': True}
