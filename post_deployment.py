"""Reviewed post-deployment actions and read-only cluster acceptance checks."""
import datetime
import hashlib
import http.client
import ipaddress
import json
import os
import re
import socket
import ssl
import time
from urllib.parse import urlsplit

from ahv_uplink_migration import canonical, clients, connection, fingerprint, member, wait_task
from dare_workflow import cluster_details
from pc_unregistration import cluster_uuid

FQDN = 'set-cluster-fqdn'
LCM = 'managed-cluster-lcm-inventory'
WORKFLOWS = frozenset({FQDN, LCM})
CLUSTERS = '/api/clustermgmt/v4.2/config/clusters/'
LCM_CONFIG = '/api/lifecycle/v4.3/resources/config'
LCM_STATUS = '/api/lifecycle/v4.3/resources/status'
LCM_INVENTORY = '/api/lifecycle/v4.3/operations/$actions/inventory'
MAX_PLAN = 16384
CLUSTER_TYPE = 'clustermgmt.v4.config.Cluster'
NETWORK_TYPE = 'clustermgmt.v4.config.ClusterNetworkReference'
NETWORK_FIELDS = {
    'externalAddress', 'externalDataServiceIp', 'externalSubnet', 'internalSubnet',
    'nfsSubnetWhitelist', 'nameServerIpList', 'ntpServerIpList', 'smtpServer',
    'masqueradingIp', 'masqueradingPort', 'managementServer', 'fqdn',
    'keyManagementServerType', 'backplane', 'httpProxyList', 'httpProxyWhiteList',
    'ntpServerConfigList', '$objectType', '$reserved', '$unknownFields',
}


class PostDeploymentError(ValueError):
    pass


def filename(workflow):
    return workflow + '.json'


def writes_enabled(workflow):
    key = {FQDN: 'ZTF_CLUSTER_FQDN_ENABLE_MUTATION', LCM: 'ZTF_LCM_INVENTORY_ENABLE_SUBMISSION'}[workflow]
    return os.environ.get(key, '').lower() == 'true'


def fqdn(value):
    label = r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
    if (not isinstance(value, str) or len(value) > 253
            or not re.fullmatch(rf'(?:{label}\.)+{label}', value)
            or not re.search(r'[a-z]', value.rsplit('.', 1)[-1])):
        raise PostDeploymentError('Use a canonical lowercase DNS name, without a port, path or trailing dot.')
    return value


def repository(value):
    if (not isinstance(value, str) or len(value) > 300
            or not re.fullmatch(r'https?://[a-zA-Z0-9.\-:\[\]]+(?:/[A-Za-z0-9._~/-]*)?', value)):
        raise PostDeploymentError('Use the approved HTTP(S) repository URL without credentials, query or fragment.')
    try:
        url = urlsplit(value)
        if not url.hostname or url.username is not None or url.port == 0:
            raise ValueError()
    except ValueError:
        raise PostDeploymentError('The repository URL is invalid.') from None
    return value


def intent(workflow, value):
    field, validate = (('fqdn', fqdn) if workflow == FQDN else ('repository', repository))
    if workflow not in WORKFLOWS or not isinstance(value, dict) or set(value) != {'connection', field}:
        raise PostDeploymentError('Provide only the reviewed PE/PC connections and the operation value.')
    return {'connection': connection(value['connection']), field: validate(value[field])}


def _clients(config, resolve):
    pc, pe = clients(config, resolve)
    identity = config['cluster_uuid']
    pc_id = pc.pc_uuid()
    local = pe.request('GET', '/api/nutanix/v2.0/cluster/')
    if (pc_id == identity or cluster_uuid(local.get('uuid')) != identity
            or pc.pe(identity)['name'] != local.get('name')):
        raise PostDeploymentError('PE and PC must identify the same managed cluster, distinct from PC itself.')
    return pc, pe, pc_id


def _verify_pe_name(hostname, identity, pe):
    cluster = pe.request('GET', '/api/nutanix/v2.0/cluster/')
    hosts = pe.request('GET', '/api/nutanix/v2.0/hosts/')
    rows = hosts.get('entities')
    if (cluster_uuid(cluster.get('uuid')) != identity or not isinstance(rows, list)
            or not 1 <= len(rows) <= 16 or type(member(hosts.get('metadata')).get('grand_total_entities')) is not int
            or member(hosts.get('metadata')).get('grand_total_entities') != len(rows)):
        raise PostDeploymentError('Complete authenticated PE endpoint inventory is required before using the new DNS name.')
    try:
        allowed = {ipaddress.ip_address(cluster['cluster_external_ipaddress'])}
        allowed.update(ipaddress.ip_address(row['service_vmexternal_ip']) for row in rows)
        answers = {ipaddress.ip_address(entry[4][0]) for entry in socket.getaddrinfo(
            hostname, 9440, type=socket.SOCK_STREAM)}
        if not answers or not answers <= allowed:
            raise ValueError()
    except (OSError, ValueError, KeyError, TypeError):
        raise PostDeploymentError('DNS must resolve exclusively to verified PE VIP or CVM addresses.') from None

    context = ssl.create_default_context()
    observations = []
    for address in sorted(answers, key=str):
        # Connect to the already checked address, while validating TLS for the new name.
        # Do not resolve DNS again or follow a redirect with the PE credential.
        client = http.client.HTTPConnection(hostname, 9440, timeout=5)
        try:
            with socket.create_connection((str(address), 9440), timeout=5) as raw:
                with context.wrap_socket(raw, server_hostname=hostname) as secure:
                    digest = hashlib.sha256(secure.getpeercert(binary_form=True)).hexdigest()
                    client.sock = secure
                    client.request('GET', '/api/nutanix/v2.0/cluster/', headers=pe.headers)
                    response = client.getresponse()
                    body = response.read(1024 * 1024 + 1)
                    if (response.status != 200 or len(body) > 1024 * 1024
                            or cluster_uuid(member(json.loads(body)).get('uuid')) != identity):
                        raise ValueError()
                    observations.append({'address': str(address), 'leafSha256': digest})
        except (OSError, ValueError, http.client.HTTPException):
            raise PostDeploymentError('The new FQDN did not verify trusted HTTPS and authenticated PE identity on every DNS address.') from None
        finally:
            client.close()
    return observations


def certificate_check(value, resolve):
    if not isinstance(value, dict) or set(value) != {'connection', 'fqdn'}:
        raise PostDeploymentError('Provide the registered cluster and intended certificate DNS name.')
    config = connection(value['connection'])
    name = fqdn(value['fqdn'])
    _, pe, _ = _clients(config, resolve)
    return {'clusterUuid': config['cluster_uuid'], 'fqdn': name,
            'endpoints': _verify_pe_name(name, config['cluster_uuid'], pe)}


def cvm_rename_plan(value, resolve):
    if not isinstance(value, dict) or set(value) != {'connection', 'hostSerials'}:
        raise PostDeploymentError('Provide the registered cluster and host serials in the intended node order.')
    config = connection(value['connection'])
    serials = value['hostSerials']
    if (not isinstance(serials, list) or not 3 <= len(serials) <= 16
            or any(not isinstance(s, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', s) for s in serials)
            or len(set(serials)) != len(serials)):
        raise PostDeploymentError('Provide distinct expected host serials in node order.')
    pc, pe, _ = _clients(config, resolve)
    details = cluster_details(config, pc, pe)
    if details['hostSerials'] != sorted(serials) or not re.fullmatch(r'[A-Za-z0-9-]{1,49}', details['name']):
        raise PostDeploymentError('The reviewed serials must match healthy AHV inventory and the cluster name must be safe for CVM naming.')
    hosts = pe.request('GET', '/api/nutanix/v2.0/hosts/')
    rows = hosts.get('entities')
    if (not isinstance(rows, list) or len(rows) != len(serials)
            or member(hosts.get('metadata')).get('grand_total_entities') != len(rows)
            or any(not isinstance(row, dict) or member(row.get('health_summary')).get('health_status') != 'Good' for row in rows)
            or {row.get('serial') for row in rows} != set(serials)):
        raise PostDeploymentError('PE membership or health changed during planning.')
    try:
        addresses = {row['serial']: str(ipaddress.IPv4Address(row['service_vmexternal_ip'])) for row in rows}
    except (KeyError, ValueError, TypeError):
        raise PostDeploymentError('A complete IPv4 CVM address mapping is required.') from None
    if len(set(addresses.values())) != len(serials):
        raise PostDeploymentError('CVM addresses are ambiguous.')
    return {'clusterUuid': details['uuid'], 'nodes': [
        {'serial': serial, 'cvmAddress': addresses[serial], 'displayName': f"NTNX-{details['name']}-N{index + 1:02d}-CVM"}
        for index, serial in enumerate(serials)]}


def _fqdn_state(desired, pc, pe):
    config = desired['connection']
    path = CLUSTERS + config['cluster_uuid']
    cluster, revision, _ = pc.exchange('GET', path)
    network = member(member(cluster).get('network'))
    if (member(cluster).get('$objectType') != CLUSTER_TYPE or cluster.get('extId') != config['cluster_uuid']
            or cluster.get('$unknownFields') or network.get('$objectType') != NETWORK_TYPE
            or network.get('$unknownFields') or set(network) - NETWORK_FIELDS
            or not isinstance(revision, str) or not re.fullmatch(r'"[!#-~]{1,254}"', revision)):
        raise PostDeploymentError('The v4.2 cluster network schema or revision could not be verified.')
    current = network.get('fqdn')
    if current not in (None, ''):
        fqdn(current)
    # A trusted, authenticated response through the new name is required before switching anything.
    new_endpoint = 'https://' + desired['fqdn'] + ':9440'
    if new_endpoint == config['pc_endpoint']:
        raise PostDeploymentError('The new name identifies the configured PC endpoint.')
    _verify_pe_name(desired['fqdn'], config['cluster_uuid'], pe)
    preserved = {key: value for key, value in network.items() if key not in {'fqdn', '$reserved', '$unknownFields'}}
    return {'current': current or '', 'revision': revision, 'networkSha256': fingerprint(preserved)}, preserved


def _scoped_exchange(pc, identity, method, path):
    # One per-operation client; the cluster selector must never leak into unrelated calls.
    pc.headers['X-Cluster-Id'] = identity
    try:
        return pc.exchange(method, path)[0]
    finally:
        pc.headers.pop('X-Cluster-Id', None)


def _lcm_state(desired, pc):
    identity = desired['connection']['cluster_uuid']
    config = _scoped_exchange(pc, identity, 'GET', LCM_CONFIG)
    status = _scoped_exchange(pc, identity, 'GET', LCM_STATUS)
    if (member(config).get('$objectType') != 'lifecycle.v4.resources.Config'
            or member(status).get('$objectType') != 'lifecycle.v4.resources.StatusInfo'
            or config.get('$unknownFields') or status.get('$unknownFields')
            or config.get('connectivityType') != 'DARKSITE_WEB_SERVER'
            or status.get('connectivityType') != 'DARKSITE_WEB_SERVER'
            or config.get('url') != desired['repository']):
        raise PostDeploymentError('The reviewed web-server Dark Site source was not verified for the managed cluster.')
    if (config.get('hasModuleAutoUpgradeEnabled') is not False
            or status.get('isUrlAccessible') is not True or status.get('isRestrictedMode') is not False
            or status.get('isCancelIntentSet') is not False or status.get('inProgressOperation') is not None
            or status.get('uploadTaskUuid')):
        raise PostDeploymentError('Verify LCM repository access, idle status and disabled module auto-upgrade before continuing.')
    return {'source': 'DARKSITE_WEB_SERVER', 'configSha256': fingerprint(config)}


def _snapshot(workflow, desired, pc, pe, pc_id):
    if workflow == FQDN:
        state, network = _fqdn_state(desired, pc, pe)
    else:
        state, network = _lcm_state(desired, pc), None
    return {'workflow': workflow, 'intent': desired, 'pcUuid': pc_id, 'observed': state}, network


def preflight(workflow, value, resolve):
    desired = intent(workflow, value)
    pc, pe, pc_id = _clients(desired['connection'], resolve)
    return _snapshot(workflow, desired, pc, pe, pc_id)[0]


def parse_plan(content):
    if not isinstance(content, str) or len(content) > MAX_PLAN:
        raise PostDeploymentError('Provide the bounded preflight plan.')
    try:
        plan = json.loads(content)
    except ValueError:
        raise PostDeploymentError('Provide the exact preflight JSON.') from None
    if (not isinstance(plan, dict) or set(plan) != {'workflow', 'intent', 'pcUuid', 'observed'}
            or not isinstance(plan['workflow'], str) or plan['workflow'] not in WORKFLOWS
            or not isinstance(plan['observed'], dict) or canonical(plan) != content):
        raise PostDeploymentError('Provide the exact canonical preflight plan.')
    if intent(plan['workflow'], plan['intent']) != plan['intent'] or cluster_uuid(plan['pcUuid']) != plan['pcUuid']:
        raise PostDeploymentError('The plan target is not canonical.')
    return plan


def confirmation(plan):
    action = 'SET FQDN' if plan['workflow'] == FQDN else 'RUN LCM INVENTORY'
    return action + ' ' + plan['intent']['connection']['cluster_uuid']


def execute(plan, resolve, authorize, cancelled, emit, sleep=time.sleep):
    workflow, desired = plan['workflow'], plan['intent']
    config = desired['connection']
    pc, pe, pc_id = _clients(config, resolve)
    observed, network = _snapshot(workflow, desired, pc, pe, pc_id)
    if observed != plan:
        raise PostDeploymentError('Target state changed since review. Run a new preflight.')
    if workflow == FQDN and observed['observed']['current'] == desired['fqdn']:
        return {'status': 'already_configured'}
    authorize()
    if workflow == FQDN:
        task, _, _ = pc.exchange('PUT', CLUSTERS + config['cluster_uuid'],
                                 {'$objectType': CLUSTER_TYPE, 'network': {**network, 'fqdn': desired['fqdn']}},
                                 observed['observed']['revision'])
    else:
        task = _scoped_exchange(pc, config['cluster_uuid'], 'POST', LCM_INVENTORY)
    wait_task(pc, task, emit, cancelled, sleep)
    if cancelled():
        raise PostDeploymentError('Verification interrupted; reconcile Prism state before retrying.')
    pc, pe, pc_id = _clients(config, resolve)
    if pc_id != observed['pcUuid']:
        raise PostDeploymentError('Prism Central identity changed during verification.')
    verified, _ = _snapshot(workflow, desired, pc, pe, pc_id)
    current = verified['observed']
    if workflow == FQDN:
        if current['current'] != desired['fqdn'] or current['networkSha256'] != observed['observed']['networkSha256']:
            raise PostDeploymentError('The desired FQDN or unchanged network fields did not verify.')
    elif current != observed['observed']:
        raise PostDeploymentError('LCM source settings changed while the inventory ran.')
    return {'status': 'verified', 'taskId': task['extId']}


def acceptance_intent(value):
    keys = {'connection', 'fqdn', 'repository', 'hostSerials', 'containers'}
    if not isinstance(value, dict) or set(value) != keys:
        raise PostDeploymentError('Provide cluster, repository, expected host serials and container names.')
    config = connection(value['connection'])
    name, repo = fqdn(value['fqdn']), repository(value['repository'])
    serials, containers = value['hostSerials'], value['containers']
    for values, minimum, maximum in ((serials, 3, 16), (containers, 1, 16)):
        if (not isinstance(values, list) or not minimum <= len(values) <= maximum
                or any(not isinstance(item, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', item) for item in values)
                or len(values) != len(set(values))):
            raise PostDeploymentError('Provide distinct expected host serials and container names.')
    return {'connection': config, 'fqdn': name, 'repository': repo, 'hostSerials': serials, 'containers': containers}


def acceptance(value, resolve):
    desired = acceptance_intent(value)
    config, name, repo = (desired[key] for key in ('connection', 'fqdn', 'repository'))
    serials, containers = desired['hostSerials'], desired['containers']
    pc, pe, _ = _clients(config, resolve)
    details = cluster_details(config, pc, pe)
    observed, _ = _fqdn_state({'connection': config, 'fqdn': name}, pc, pe)
    _lcm_state({'connection': config, 'repository': repo}, pc)
    inventory = pe.containers()
    actual_names = [row.get('name') for row in inventory]
    checks = [
        {'label': 'Healthy PE/PC AHV inventory matches expected hosts', 'passed': details['hostSerials'] == sorted(serials)},
        {'label': 'Cluster FQDN is configured; trusted HTTPS authenticates to the same PE', 'passed': observed['current'] == name},
        {'label': 'Managed cluster Dark Site repository matches and reports reachable', 'passed': True},
        {'label': 'All expected containers are present exactly once', 'passed': all(actual_names.count(n) == 1 for n in containers)},
    ]
    return {'clusterUuid': config['cluster_uuid'], 'checks': checks,
            'status': 'operator_review_required' if all(c['passed'] for c in checks) else 'blocked',
            'collectedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
