"""Conservative, approval-bound AHV physical uplink migration via Prism APIs."""
import copy
import hashlib
import json
import os
import re
import ssl
import threading
import time
import urllib.error
import urllib.request
import uuid

import pc_unregistration as prism
from cluster_storage_standard import Client as PeClient

WORKFLOW = 'ahv-uplink-migration'
FILENAME = 'ahv-uplink-migration.yml'
LOCK = threading.Lock()
SWITCHES = '/api/networking/v4.2/config/virtual-switches'
CLUSTERS = '/api/clustermgmt/v4.2/config/clusters'
MAX_HOSTS = 16
MAX_CONTENT = 65536
NIC_NAME = re.compile(r'eth[0-9]+')
SWITCH_NAME = re.compile(r'[A-Za-z][A-Za-z0-9_.-]{0,63}')


class MigrationError(ValueError):
    pass


def writes_enabled():
    return os.environ.get('ZTF_AHV_UPLINK_MIGRATION_ENABLED', '').lower() == 'true'


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True)


def fingerprint(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def connection(value):
    fields = {'pc_endpoint', 'pc_credential', 'pe_endpoint', 'pe_credential', 'cluster_uuid'}
    if not isinstance(value, dict) or set(value) != fields:
        raise MigrationError('Provide Prism Central and Prism Element connections and the AHV cluster UUID.')
    result = dict(value)
    for prefix in ('pc', 'pe'):
        try:
            result[prefix + '_endpoint'] = prism.endpoint(result[prefix + '_endpoint'])
        except ValueError:
            raise MigrationError(f'Provide a trusted {prefix.upper()} HTTPS endpoint on port 9440.') from None
        ref = result[prefix + '_credential']
        if not isinstance(ref, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', ref):
            raise MigrationError('Use saved credential references.')
    if result['pc_endpoint'] == result['pe_endpoint']:
        raise MigrationError('Select distinct PC and PE endpoints.')
    result['cluster_uuid'] = prism.cluster_uuid(result['cluster_uuid'])
    return result


def target(value):
    if not isinstance(value, dict) or set(value) != {'mode', 'name', 'bondMode', 'mtu'}:
        raise MigrationError('Select a destination switch and its settings.')
    name, mtu = value['name'], value['mtu']
    if (value['mode'] not in ('create', 'existing') or not isinstance(name, str)
            or not SWITCH_NAME.fullmatch(name) or name.lower() in {'vs0', 'br0'}):
        raise MigrationError('Use a destination name different from vs0 and br0.')
    if value['bondMode'] != 'ACTIVE_BACKUP' or type(mtu) is not int or mtu not in (1500, 9000):
        raise MigrationError('This workflow supports active-backup and an MTU of 1500 or 9000.')
    return value


def draft(value):
    if not isinstance(value, dict) or set(value) != {'connection', 'target', 'move', 'fabricReviewed'}:
        raise MigrationError('Provide a complete uplink migration plan.')
    config = connection(value['connection'])
    destination = target(value['target'])
    move = value['move']
    if not isinstance(move, dict) or not 3 <= len(move) <= MAX_HOSTS:
        raise MigrationError('Select uplink assignments for every host on a 3–16 host AHV cluster.')
    for host_id, ports in move.items():
        if prism.cluster_uuid(host_id) != host_id or not isinstance(ports, list) or len(ports) > 32:
            raise MigrationError('Invalid per-host uplink assignment.')
        if any(not isinstance(port, str) or not NIC_NAME.fullmatch(port) for port in ports) or len(set(ports)) != len(ports):
            raise MigrationError('Use distinct physical NIC names per host.')
    if value['fabricReviewed'] is not True:
        raise MigrationError('Confirm switch-port VLANs, MTU, cabling, maintenance capacity and out-of-band access.')
    return {'connection': config, 'target': destination,
            'move': {key: sorted(ports) for key, ports in move.items()}, 'fabricReviewed': True}


def load_plan(content):
    if not isinstance(content, str) or not content or len(content) > MAX_CONTENT:
        raise MigrationError('Invalid reviewed plan size.')
    value = json.loads(content)
    if not isinstance(value, dict) or set(value) != {'intent', 'inventory', 'assignments'}:
        raise MigrationError('Use the complete server-generated preflight plan.')
    if draft(value['intent']) != value['intent'] or canonical(value) != content:
        raise MigrationError('Plan differs from the canonical preflight output.')
    if not isinstance(value['inventory'], dict) or not isinstance(value['assignments'], list):
        raise MigrationError('Preflight evidence is incomplete.')
    return value


class PcClient(prism.Client):
    def exchange(self, method, path, body=None, etag=None):
        headers = dict(self.headers)
        if method != 'GET':
            headers['Ntnx-Request-Id'] = str(uuid.uuid4())
        if etag:
            headers['If-Match'] = etag
        req = urllib.request.Request(self.base + path, method=method, headers=headers,
                                     data=canonical(body).encode() if body is not None else None)
        try:
            with self.opener.open(req, timeout=12) as response:
                raw = response.read(prism.MAX_BYTES + 1)
                if len(raw) > prism.MAX_BYTES:
                    raise ValueError()
                envelope = json.loads(raw)
                data = envelope['data']
                if isinstance(data, dict) and 'ErrorResponse' in str(data.get('$objectType', '')):
                    raise ValueError()
                return data, response.headers.get('ETag'), envelope.get('metadata', {})
        except urllib.error.HTTPError as error:
            raise MigrationError(f'Prism Central returned HTTP {error.code}. Check permissions and v4.2 API support.') from None
        except urllib.error.URLError as error:
            if isinstance(error.reason, ssl.SSLCertVerificationError):
                raise MigrationError('Prism Central certificate trust or hostname verification failed.') from None
            raise MigrationError('Could not reach Prism Central over trusted HTTPS.') from None
        except (OSError, KeyError, TypeError, ValueError):
            raise MigrationError('Could not verify the Prism Central response.') from None

    def rows(self, path, cluster_header=None):
        # The optional cluster filter is sent only on switch list. The full returned
        # switch object is still checked for cross-cluster ownership before writes.
        if cluster_header:
            self.headers['X-Cluster-Id'] = cluster_header
        try:
            rows, _, meta = self.exchange('GET', path + '?$limit=100')
        finally:
            self.headers.pop('X-Cluster-Id', None)
        if (not isinstance(rows, list) or not isinstance(meta, dict)
                or type(meta.get('totalAvailableResults')) is not int
                or meta['totalAvailableResults'] != len(rows)
                or any(not isinstance(row, dict) for row in rows)):
            raise MigrationError('Prism Central returned incomplete inventory; no targets were inferred.')
        return rows


def clients(config, resolver):
    def credential(prefix):
        try:
            username, password = resolver(config[prefix + '_credential'])
            if not username or ':' in username or not password:
                raise ValueError()
            return username, password
        except Exception:
            raise MigrationError(f'The {prefix.upper()} credential reference could not be resolved.') from None
    return PcClient(config, credential('pc')), PeClient(config, credential('pe'))


def member(value):
    return value if isinstance(value, dict) else {}


def host_ports(switch):
    return {host['extId']: sorted(host['hostNics']) for host in switch['clusters'][0]['hosts']}


def switch_config(value, cluster_id, expected_hosts):
    fields = {'extId', 'name', 'description', 'isDefault', 'mtu', 'bondMode', 'ownerType', 'igmpSpec'}
    if not isinstance(value, dict) or any(value.get(key) is not False for key in
            ('hasDeploymentError', 'hasUpdateInProgress', 'hasDeleteInProgress')):
        raise MigrationError('Switch status is incomplete, busy or degraded.')
    groups = value.get('clusters')
    if not isinstance(groups, list) or len(groups) != 1 or member(groups[0]).get('extId') != cluster_id:
        raise MigrationError('Only switches scoped to the selected cluster are supported.')
    group = groups[0]
    hosts = group.get('hosts')
    if not isinstance(hosts, list) or len(hosts) != len(expected_hosts):
        raise MigrationError('Switch does not include every expected host.')
    cleaned = []
    for item in hosts:
        ports = item.get('hostNics')
        if (not isinstance(ports, list) or any(not isinstance(port, str) or not NIC_NAME.fullmatch(port)
                for port in ports) or len(set(ports)) != len(ports)):
            raise MigrationError('Switch uplink names are incomplete or unsupported.')
        entry = {key: item[key] for key in ('extId', 'internalBridgeName', 'ipAddress', 'routeTable') if key in item}
        entry['hostNics'] = sorted(ports)
        cleaned.append(entry)
    if {item['extId'] for item in cleaned} != expected_hosts:
        raise MigrationError('Switch host identities do not match the cluster.')
    result = {key: value[key] for key in fields if key in value}
    result['clusters'] = [{**{key: group[key] for key in ('extId', 'gatewayIpAddress', 'vlanIdentifier') if key in group},
                           'hosts': sorted(cleaned, key=lambda item: item['extId'])}]
    return result


def collect(config, pc, pe, destination=None):
    cluster_id = config['cluster_uuid']
    path = CLUSTERS + '/' + cluster_id
    cluster, _, _ = pc.exchange('GET', path)
    pe_cluster = pe.request('GET', '/api/nutanix/v2.0/cluster/')
    if (cluster.get('extId') != cluster_id or pe_cluster.get('uuid') != cluster_id
            or not cluster.get('name') or cluster['name'] != pe_cluster.get('name')):
        raise MigrationError('PC and PE do not agree on the expected cluster identity.')
    if member(pe_cluster.get('health_summary')).get('health_status') != 'Good':
        raise MigrationError('Prism Element does not report Good cluster health.')
    pe_hosts = pe.request('GET', '/api/nutanix/v2.0/hosts/')
    nodes = pe_hosts.get('entities')
    if (not isinstance(nodes, list) or member(pe_hosts.get('metadata')).get('grand_total_entities') != len(nodes)
            or not 3 <= len(nodes) <= MAX_HOSTS):
        raise MigrationError('Complete PE inventory is required for a 3–16 host AHV cluster.')
    if any(member(node.get('health_summary')).get('health_status') != 'Good' for node in nodes):
        raise MigrationError('Prism Element does not report Good health for every host.')
    by_serial = {node.get('serial'): node for node in nodes}
    pc_hosts = pc.rows(path + '/hosts')
    if (len(by_serial) != len(nodes) or len(pc_hosts) != len(nodes) or None in by_serial
            or {host.get('nodeSerial') for host in pc_hosts} != by_serial.keys()):
        raise MigrationError('PC and PE host membership could not be matched by serial.')
    ids = {prism.cluster_uuid(host['extId']) for host in pc_hosts}
    if len(ids) != len(nodes):
        raise MigrationError('Duplicate host identity.')
    switches = pc.rows(SWITCHES, cluster_id)
    related = [row for row in switches if any(member(group).get('extId') == cluster_id for group in row.get('clusters') or [])]
    sources = [row for row in related if row.get('isDefault') is True and row.get('name') == 'vs0']
    if len(sources) != 1:
        raise MigrationError('A unique default vs0 must be visible for the selected cluster.')

    def detail(row):
        identity = prism.cluster_uuid(row['extId'])
        data, etag, _ = pc.exchange('GET', SWITCHES + '/' + identity)
        if not etag or data.get('extId') != identity:
            raise MigrationError('The switch identity or concurrency token could not be verified.')
        return {'config': switch_config(data, cluster_id, ids), 'etag': etag}

    source = detail(sources[0])
    if (source['config']['bondMode'] != 'ACTIVE_BACKUP' or
            any(row.get('internalBridgeName') != 'br0' for row in source['config']['clusters'][0]['hosts'])):
        raise MigrationError('This workflow requires the default vs0/br0 with an active-backup bond.')
    options = [{'name': row['name'], 'mtu': row.get('mtu'), 'bondMode': row.get('bondMode')}
               for row in related if row.get('isDefault') is False]
    dest = None
    if destination:
        candidates = [row for row in related if str(row.get('name')).casefold() == destination['name'].casefold()]
        if len(candidates) > 1:
            raise MigrationError('Destination switch name is ambiguous.')
        if candidates:
            dest = detail(candidates[0])
    source_ports = host_ports(source['config'])
    dest_ports = host_ports(dest['config']) if dest else {}
    hosts = []
    for row in sorted(pc_hosts, key=lambda row: row['extId']):
        identity = row['extId']
        peer = by_serial[row['nodeSerial']]
        if (member(row.get('hypervisor')).get('type') != 'AHV' or not row.get('hostName')
                or not peer.get('hypervisor_address') or not peer.get('service_vmexternal_ip')):
            raise MigrationError('Only identifiable AHV hosts with recorded AHV and CVM addresses are supported.')
        nics = pc.rows(path + '/hosts/' + identity + '/host-nics')
        ports = {}
        for nic in nics:
            name = nic.get('name')
            if not isinstance(name, str) or not NIC_NAME.fullmatch(name):
                continue
            if name in ports:
                raise MigrationError('Duplicate physical NIC identity.')
            ports[name] = {'name': name, 'up': str(nic.get('interfaceStatus')).lower() == 'up',
                           'switchId': nic.get('virtualSwitchExtId') or None, 'mac': nic.get('macAddress'),
                           'switchPort': nic.get('switchPortId') or '', 'switchDevice': nic.get('switchDeviceId') or '',
                           'restricted': bool(nic.get('nicProfileExtId') or nic.get('virtualNicExtIds'))}
        if not set(source_ports[identity] + dest_ports.get(identity, [])).issubset(ports):
            raise MigrationError('Switch uplink membership does not match the physical NIC inventory.')
        hosts.append({'id': identity, 'name': row['hostName'], 'serial': row['nodeSerial'],
                      'hostIp': peer['hypervisor_address'], 'cvmIp': peer['service_vmexternal_ip'],
                      'nics': sorted(ports.values(), key=lambda nic: nic['name'])})
    return {'clusterName': cluster['name'], 'source': source, 'destination': dest,
            'switches': options, 'hosts': hosts}


def preflight(value, pc, pe):
    intent = draft(value)
    destination = intent['target']
    observed = collect(intent['connection'], pc, pe, destination)
    source = observed['source']['config']
    dest = observed['destination']
    if (destination['mode'] == 'create') == bool(dest):
        raise MigrationError('Destination already exists or is missing. Review the destination mode and name.')
    if dest and (dest['config'].get('isDefault') is not False or any(dest['config'].get(key) != destination[key]
                                                                  for key in ('name', 'mtu', 'bondMode'))):
        raise MigrationError('Existing destination settings differ from the reviewed target.')
    current = host_ports(source)
    current_dest = host_ports(dest['config']) if dest else {}
    if set(intent['move']) != set(current) or not any(intent['move'].values()):
        raise MigrationError('Review every discovered host and choose at least one uplink to move.')
    assignments = []
    for host in observed['hosts']:
        identity = host['id']
        moved = intent['move'][identity]
        kept = sorted(set(current[identity]) - set(moved))
        existing = current_dest.get(identity, [])
        if not set(moved).issubset(current[identity]) or len(kept) < 2 or len(existing) + len(moved) < 2:
            raise MigrationError('Each host needs two retained br0 uplinks and two resulting destination uplinks.')
        nics = {nic['name']: nic for nic in host['nics']}
        for port in kept + moved + existing:
            nic = nics[port]
            expected = dest['config']['extId'] if port in existing else source['extId']
            if not nic['up'] or nic['switchId'] != expected or (port in moved and (nic['restricted'] or not nic['mac'])):
                raise MigrationError(f'{host["name"]} {port} is down, restricted, or has an unexpected switch assignment.')
        assignments.append({'hostId': identity, 'host': host['name'], 'keep': kept, 'move': moved,
                            'destination': sorted(existing + moved)})
    # Keep exact physical identity and switch versions in the approval snapshot.
    observed.pop('switches')
    plan = {'intent': intent, 'inventory': observed, 'assignments': assignments}
    if len(canonical(plan)) > MAX_CONTENT:
        raise MigrationError('Preflight inventory exceeds the supported plan size.')
    return plan


def switch_body(config, assignments):
    body = copy.deepcopy(config)
    for key in ('extId', 'ownerType'):
        body.pop(key, None)
    body['$objectType'] = 'networking.v4.config.VirtualSwitch'
    body['isQuickMode'] = False
    for cluster in body['clusters']:
        for host in cluster['hosts']:
            host.pop('internalBridgeName', None)
            host['hostNics'] = assignments[host['extId']]
    return body


def wait_task(pc, reference, emit, cancelled, sleep):
    identity = member(reference).get('extId')
    if not identity or not isinstance(identity, str) or not re.fullmatch(r'[A-Za-z0-9_+=:/.-]{1,256}', identity):
        raise MigrationError('Prism returned no usable task ID. Reconcile target state before retrying.')
    emit(f'Prism task {identity}')
    for _ in range(300):
        if cancelled():
            raise MigrationError('Verification interrupted. The Prism task may still be running.')
        status = member(pc.task(identity)).get('status')
        if status == 'SUCCEEDED':
            return
        if status not in ('QUEUED', 'RUNNING'):
            raise MigrationError('Prism task did not succeed. Reconcile target state before retrying.')
        sleep(3)
    raise MigrationError('Prism task timed out. Reconcile target state before retrying.')


def verify(snapshot, observed, final, emit, report):
    if snapshot['inventory']['clusterName'] != observed['clusterName']:
        raise MigrationError('Cluster name changed during execution.')
    source = observed['source']['config']
    previous_source = snapshot['inventory']['source']['config']
    dest = observed['destination']
    previous_dest = snapshot['inventory']['destination']
    target_settings = snapshot['intent']['target']
    if source['extId'] != previous_source['extId'] or source['mtu'] != previous_source['mtu']:
        raise MigrationError('The original switch identity or MTU changed.')
    if not final and dest != previous_dest:
        raise MigrationError('Destination changed while source uplinks were being released.')
    if final and (not dest or (previous_dest and dest['config']['extId'] != previous_dest['config']['extId'])
                  or any(dest['config'].get(key) != target_settings[key] for key in ('name', 'mtu', 'bondMode'))):
        raise MigrationError('Destination switch identity or settings did not verify.')
    source_ports = host_ports(source)
    target_ports = host_ports(dest['config']) if dest else {}
    previous_hosts = {host['id']: host for host in snapshot['inventory']['hosts']}
    current_hosts = {host['id']: host for host in observed['hosts']}
    if previous_hosts.keys() != current_hosts.keys():
        raise MigrationError('Cluster host membership changed.')
    results = []
    for assignment in snapshot['assignments']:
        identity = assignment['hostId']
        host = current_hosts[identity]
        previous = previous_hosts[identity]
        if any(host[key] != previous[key] for key in ('serial', 'hostIp', 'cvmIp')):
            raise MigrationError('AHV/CVM host identity changed during the migration.')
        if source_ports[identity] != assignment['keep'] or (final and target_ports[identity] != assignment['destination']):
            raise MigrationError(f'{host["name"]} uplink membership did not verify.')
        nics = {nic['name']: nic for nic in host['nics']}
        old_nics = {nic['name']: nic for nic in previous['nics']}
        expected = {port: source['extId'] for port in assignment['keep']}
        if final:
            expected.update({port: dest['config']['extId'] for port in assignment['destination']})
        else:
            expected.update({port: None for port in assignment['move']})
        if any(port not in nics or nics[port]['mac'] != old_nics[port]['mac']
               or nics[port]['switchId'] != switch_id or (switch_id and not nics[port]['up'])
               for port, switch_id in expected.items()):
            raise MigrationError(f'{host["name"]} physical NIC assignment or link did not verify.')
        emit(f'{host["name"]}: PE reports Good and {"both switch assignments verified" if final else "retained uplinks verified"}.')
        results.append({'hostId': identity, 'host': host['name'], 'kept': assignment['keep'], 'moved': assignment['move'],
                        'stage': 'verified' if final else 'retained_uplinks_verified'})
        report(results)
    return results


def execute(snapshot, pc, pe, emit, authorize, cancelled, report=lambda rows: None, sleep=time.sleep):
    if cancelled():
        raise MigrationError('Cancelled before applying the plan.')
    intent = snapshot['intent']
    if canonical(preflight(intent, pc, pe)) != canonical(snapshot):
        raise MigrationError('Live inventory differs from the approved preflight. Review a new plan.')
    source = snapshot['inventory']['source']
    target_settings = intent['target']
    destination = snapshot['inventory']['destination']
    keep = {row['hostId']: row['keep'] for row in snapshot['assignments']}
    add = {row['hostId']: row['destination'] for row in snapshot['assignments']}
    authorize()
    emit('Releasing selected uplinks from vs0 using the standard Prism task.')
    reference, _, _ = pc.exchange('PUT', SWITCHES + '/' + source['config']['extId'],
                                  switch_body(source['config'], keep), source['etag'])
    wait_task(pc, reference, emit, cancelled, sleep)
    observed = collect(intent['connection'], pc, pe, target_settings)
    verify(snapshot, observed, False, emit, report)
    authorize()
    if destination:
        emit('Adding the released uplinks to the approved existing switch.')
        reference, _, _ = pc.exchange('PUT', SWITCHES + '/' + destination['config']['extId'],
                                      switch_body(destination['config'], add), destination['etag'])
    else:
        emit('Creating the approved destination switch with the released uplinks.')
        config = {'name': target_settings['name'], 'mtu': target_settings['mtu'], 'bondMode': target_settings['bondMode'],
                  'clusters': [{'extId': intent['connection']['cluster_uuid'],
                                'hosts': [{'extId': identity} for identity in add]}]}
        reference, _, _ = pc.exchange('POST', SWITCHES, switch_body(config, add))
    wait_task(pc, reference, emit, cancelled, sleep)
    return verify(snapshot, collect(intent['connection'], pc, pe, target_settings), True, emit, report)
