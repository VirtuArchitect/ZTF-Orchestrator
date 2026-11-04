"""Approved, single-cluster storage provisioning and conservative default cleanup.

Uses the same PE v1 container contract as the pinned framework. Never removes
VDisk data, forces cleanup, retries writes, or changes existing containers.
"""
import base64
import copy
import json
import re
import ssl
import threading
import time
import urllib.error
import urllib.request

import pc_unregistration as identity
from scripts.ztf_pe_postconfig import container_expectations

WORKFLOW = 'cluster-storage-standard'
LOCK = threading.Lock()
DEFAULT = re.compile(r'default-container-[0-9]+\Z')
FIELDS = {'name', 'replication_factor', 'compression_enabled', 'compression_delay_in_secs',
          'erasure_code', 'finger_print_on_write', 'on_disk_dedup', 'advertisedCapacity_in_gb', 'reserved_in_gb'}


class StorageError(ValueError):
    pass


class CleanupBlocked(StorageError):
    """Replacements verified; default cleanup needs operator follow-up."""


def validate_intent(config, reviewed=False):
    keys = {'pe_endpoint', 'pe_credential', 'containers', 'expected_cluster_uuid',
            'expected_default', 'dependencies_reviewed'}
    if not isinstance(config, dict) or set(config) - keys:
        raise StorageError('Use only the documented storage intent fields and credential references.')
    try:
        identity.endpoint(config.get('pe_endpoint'))
    except ValueError:
        raise StorageError('Provide a specific PE HTTPS endpoint on port 9440.') from None
    if not isinstance(config.get('pe_credential'), str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', config['pe_credential']):
        raise StorageError('Provide a stored PE credential reference.')
    containers = config.get('containers')
    if not isinstance(containers, list) or len(containers) != 3:
        raise StorageError('Exactly three cluster-specific container definitions are required.')
    names = []
    for item in containers:
        if not isinstance(item, dict) or set(item) - FIELDS:
            raise StorageError('Unsupported container property.')
        name = item.get('name')
        if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,79}', name) or name.lower().startswith('default-container') or name.lower() in {'nutanixmanagementshare', 'selfservicecontainer'}:
            raise StorageError('Use explicit replacement names; default and system containers are excluded.')
        if type(item.get('replication_factor')) is not int or item['replication_factor'] not in (1, 2, 3):
            raise StorageError('Each container needs an integer replication_factor of 1, 2 or 3.')
        for key in ('compression_enabled',):
            if key in item and type(item[key]) is not bool:
                raise StorageError('Compression settings must be YAML booleans.')
        for key in ('compression_delay_in_secs', 'advertisedCapacity_in_gb', 'reserved_in_gb'):
            if key in item and (type(item[key]) is not int or item[key] < 0 or item[key] > 2**40):
                raise StorageError('Capacity and delay settings must be bounded nonnegative integers.')
        try:
            container_expectations(item)
        except (ValueError, TypeError):
            raise StorageError('Invalid container settings.') from None
        names.append(name.lower())
    if len(set(names)) != 3:
        raise StorageError('The three container names must be distinct.')
    if 'dependencies_reviewed' in config and type(config['dependencies_reviewed']) is not bool:
        raise StorageError('dependencies_reviewed must be a YAML boolean.')
    if 'expected_cluster_uuid' in config:
        identity.cluster_uuid(config['expected_cluster_uuid'])
    if 'expected_default' in config and config['expected_default'] is not None:
        target = config['expected_default']
        if not isinstance(target, dict) or set(target) != {'name', 'uuid'} or not isinstance(target['name'], str) or not DEFAULT.fullmatch(target['name']):
            raise StorageError('The reviewed default must have an exact numeric-suffix name and UUID.')
        identity.cluster_uuid(target['uuid'])
    if reviewed and (not config.get('expected_cluster_uuid') or 'expected_default' not in config or config.get('dependencies_reviewed') is not True):
        raise StorageError('Review the exact cluster/default identity and acknowledge dependencies before approval.')


def credentials(config, resolver):
    validate_intent(config)
    try:
        username, password = resolver(config['pe_credential'])
        if not isinstance(username, str) or not username or ':' in username or not isinstance(password, str) or not password:
            raise ValueError()
        return username, password
    except Exception:
        raise StorageError('The PE credential reference is unavailable in the selected vault.') from None


class Client:
    def __init__(self, config, credential):
        self.base = identity.endpoint(config['pe_endpoint'])
        self.headers = {'Accept': 'application/json', 'Content-Type': 'application/json',
                        'Authorization': 'Basic '+base64.b64encode(':'.join(credential).encode()).decode()}
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(),
            urllib.request.HTTPSHandler(context=ssl.create_default_context()))

    def request(self, method, path, body=None):
        req = urllib.request.Request(self.base+path, method=method, headers=self.headers,
            data=json.dumps(body).encode() if body is not None else None)
        try:
            with self.opener.open(req, timeout=30) as response:
                raw = response.read(8*1024*1024+1)
                if len(raw) > 8*1024*1024:
                    raise ValueError()
                result = json.loads(raw)
                if not isinstance(result, dict) or result.get('error') or result.get('error_code'):
                    raise ValueError()
                return result
        except urllib.error.HTTPError as error:
            if method == 'DELETE':
                raise CleanupBlocked(f'Default cleanup blocked by PE (HTTP {error.code}); inspect VDisks and dependencies. No force cleanup or retry was attempted.') from None
            raise StorageError(f'PE returned HTTP {error.code}; verify API support, credentials and connectivity. No write retry was attempted.') from None
        except Exception:
            raise StorageError('PE response could not be verified. Reconcile cluster state before retrying; writes are not retried.') from None

    def cluster_uuid(self):
        return identity.cluster_uuid(self.request('GET', '/api/nutanix/v2.0/cluster/').get('uuid'))

    def rows(self, path):
        body = self.request('GET', path)
        rows = body.get('entities')
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise StorageError('PE inventory is incomplete or unsupported; no cleanup permitted.')
        metadata = body.get('metadata') or {}
        total = metadata.get('total_entities', metadata.get('totalEntities', body.get('totalEntities')))
        if total is None or type(total) is not int or total != len(rows):
            raise StorageError('Complete PE inventory could not be established; no cleanup permitted.')
        return rows

    def containers(self):
        return self.rows('/api/nutanix/v1/containers')

    def create(self, desired):
        pools = self.rows('/api/nutanix/v1/storage_pools')
        if len(pools) != 1:
            raise StorageError('Exactly one storage pool is required for automatic placement.')
        pool = identity.cluster_uuid(pools[0].get('storagePoolUuid'))
        body = {'name': desired['name'], 'storagePoolUuid': pool, 'nfsWhitelistAddress': []}
        for field, (value, _) in container_expectations(desired).items():
            body[field] = str(value) if field == 'replicationFactor' else value
        result = self.request('POST', '/api/nutanix/v1/containers', body)
        if not result.get('value'):
            raise StorageError('PE did not confirm container creation; reconcile before retrying.')

    def check_dependencies(self, target):
        disks = self.rows('/api/nutanix/v2.0/virtual_disks/')
        for disk in disks:
            container = disk.get('storage_container_uuid')
            if not container:
                raise CleanupBlocked('VDisk inventory lacks container ownership; cleanup is blocked for review.')
            if container == target['uuid']:
                raise CleanupBlocked('Default cleanup blocked: VDisks remain in the default container. Identify and migrate or remove their owners separately.')

    def delete(self, row):
        # The pinned v1 helper deletes by its numeric id, not by a guessed name.
        value = str(row.get('id', ''))
        if not re.fullmatch(r'[0-9]+', value):
            raise StorageError('The reviewed container has no supported PE deletion identifier.')
        result = self.request('DELETE', '/api/nutanix/v1/containers/'+value)
        if not result.get('value'):
            raise StorageError('Default cleanup was not confirmed by PE; reconcile before retrying.')


def discover(rows):
    if any(not isinstance(row.get('name'), str) for row in rows):
        raise StorageError('Container inventory contains an invalid name.')
    candidates = [row for row in rows if DEFAULT.fullmatch(row['name'])]
    if len(candidates) > 1:
        raise StorageError('Multiple default containers match; explicit operator review is required.')
    if any(row['name'] == 'default-container' for row in rows):
        raise StorageError('An unsuffixed default-container requires separate operator review.')
    if not candidates:
        return None
    row = candidates[0]
    return {'name': row['name'], 'uuid': identity.cluster_uuid(row.get('containerUuid'))}


def verify_replacements(config, rows):
    for desired in config['containers']:
        matches = [row for row in rows if row.get('name') == desired['name']]
        if len(matches) != 1:
            raise StorageError('A replacement container is missing or ambiguous; cleanup stopped.')
        for field, (wanted, normalize) in container_expectations(desired).items():
            try:
                if field not in matches[0] or normalize(matches[0][field]) != wanted:
                    raise ValueError()
            except (ValueError, TypeError):
                raise StorageError('Replacement container settings differ from YAML; existing containers are not modified and cleanup stopped.') from None


def review(config, credential, client_factory=None):
    validate_intent(config)
    api = (client_factory or Client)(config, credential)
    result = copy.deepcopy(config)
    result.update(expected_cluster_uuid=api.cluster_uuid(), expected_default=discover(api.containers()), dependencies_reviewed=False)
    return result


def execute(config, credential, emit, cancelled=lambda: False, authorize=lambda: None, client_factory=None, sleep=time.sleep):
    validate_intent(config, reviewed=True)
    api = (client_factory or Client)(config, credential)
    def guard():
        if cancelled():
            raise StorageError('Storage job stopped; reconcile partial changes before retrying.')
        authorize()
        if api.cluster_uuid() != config['expected_cluster_uuid']:
            raise StorageError('PE cluster identity changed; no further changes permitted.')
    def snapshot():
        guard()
        rows = api.containers()
        if discover(rows) != config['expected_default']:
            raise StorageError('Default container identity changed since approval; cleanup stopped.')
        return rows
    rows = snapshot()
    # Validate all existing replacements before creating anything.
    for desired in config['containers']:
        present = [r for r in rows if r.get('name') == desired['name']]
        if present:
            verify_replacements({'containers': [desired]}, present)
    for desired in config['containers']:
        rows = snapshot()
        if not any(r.get('name') == desired['name'] for r in rows):
            guard()
            api.create(desired)
            emit('Submitted replacement container creation; verifying inventory and requested settings.')
            for attempt in range(15):
                rows = snapshot()
                if any(r.get('name') == desired['name'] for r in rows):
                    verify_replacements({'containers': [desired]}, rows)
                    break
                if attempt == 14:
                    raise StorageError('Replacement creation remains unverified; cleanup stopped.')
                sleep(2)
    rows = snapshot()
    verify_replacements(config, rows)
    emit('All three replacement containers and requested settings verified.')
    target = config['expected_default']
    if target is None:
        return {'replacementContainersVerified': True, 'defaultCleanup': 'already_absent', 'defaultRemovalVerified': True}
    api.check_dependencies(target)
    rows = snapshot()
    verify_replacements(config, rows)
    row = next(r for r in rows if r.get('containerUuid') == target['uuid'] and r.get('name') == target['name'])
    # Recheck after inventory refresh; PE also enforces dependencies atomically.
    api.check_dependencies(target)
    guard()
    api.delete(row)
    emit('Default deletion submitted once; verifying absence and replacement settings.')
    for attempt in range(15):
        guard()
        rows = api.containers()
        verify_replacements(config, rows)
        if not any(r.get('containerUuid') == target['uuid'] or r.get('name') == target['name'] for r in rows):
            if discover(rows) is not None:
                raise StorageError('A new default container appeared; reconcile cluster state.')
            return {'replacementContainersVerified': True, 'defaultCleanup': 'deleted', 'defaultRemovalVerified': True}
        if attempt == 14:
            raise StorageError('Default container removal could not be verified; no deletion retry attempted.')
        sleep(2)
