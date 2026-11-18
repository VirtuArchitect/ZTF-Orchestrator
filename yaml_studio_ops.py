"""Read-only authoring checks and exact saved-file pipeline handoff helpers."""
import hashlib
import ipaddress
import json
import re

import yaml


TASKS = [
    {'id': 'ChangeDefaultAdminPasswordPe', 'category': 'Initial access', 'action': 'ChangeDefaultAdminPasswordPe', 'keys': ['new_pe_admin_credential']},
    {'id': 'AcceptEulaPe', 'category': 'EULA & Pulse', 'action': 'config-cluster', 'keys': ['eula', 'enable_pulse']},
    {'id': 'UpdatePulsePe', 'category': 'EULA & Pulse', 'action': 'config-cluster', 'keys': ['enable_pulse']},
    {'id': 'AddNameServersPe', 'category': 'Networking', 'action': 'config-cluster', 'keys': ['name_servers_list']},
    {'id': 'AddNtpServersPe', 'category': 'Networking', 'action': 'config-cluster', 'keys': ['ntp_servers_list']},
    {'id': 'UpdateDsip', 'category': 'Networking', 'action': 'config-cluster', 'keys': ['dsip']},
    {'id': 'HaReservation', 'category': 'Availability', 'action': 'config-cluster', 'keys': ['ha_reservation']},
    {'id': 'RebuildCapacityReservation', 'category': 'Availability', 'action': 'config-cluster', 'keys': ['enable_rebuild_reservation']},
    {'id': 'CreateContainerPe', 'category': 'Storage', 'action': 'config-cluster', 'keys': ['containers']},
    {'id': 'SetPrismLoginTitlePe', 'category': 'Prism settings', 'action': 'SetPrismLoginTitlePe', 'keys': ['prism_login_title']},
    {'id': 'RegisterToPc', 'category': 'PC registration', 'action': 'config-cluster', 'keys': []},
]
REF = re.compile(r'[A-Za-z0-9_.-]{1,128}')
MAX_CONTENT = 256 * 1024


class StudioInputError(ValueError):
    """Only safe, application-authored diagnostics; never raw YAML fragments."""
    pass


def digest(value):
    return hashlib.sha256((value if isinstance(value, str) else json.dumps(value, sort_keys=True, separators=(',', ':'))).encode()).hexdigest()


class UniqueLoader(yaml.SafeLoader):
    pass


def unique_mapping(loader, node, deep=False):
    result = {}
    for key, value in node.value:
        name = loader.construct_object(key, deep=deep)
        if not isinstance(name, (str, int, float, bool)) or name in result:
            raise StudioInputError('Use distinct scalar YAML keys; duplicate keys and merge keys are not accepted.')
        result[name] = loader.construct_object(value, deep=deep)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


def parse(content):
    if not isinstance(content, str) or not content.strip() or len(content) > MAX_CONTENT:
        raise StudioInputError('Provide a nonempty YAML document of at most 256 KiB.')
    try:
        if any(isinstance(token, (yaml.tokens.AliasToken, yaml.tokens.AnchorToken)) for token in yaml.scan(content)):
            raise StudioInputError('YAML aliases and anchors are not accepted in guided tasks.')
        value = yaml.load(content, Loader=UniqueLoader)
    except yaml.YAMLError as error:
        mark = getattr(error, 'problem_mark', None)
        position = f' at line {mark.line + 1}, column {mark.column + 1}' if mark else ''
        raise StudioInputError('Invalid YAML' + position + '. Check indentation and distinct keys.') from None
    if not isinstance(value, dict):
        raise StudioInputError('The YAML document root must be a mapping.')
    return value


def address(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 253:
        return False
    try:
        ip = ipaddress.ip_address(value)
        return not (ip.is_unspecified or ip.is_multicast or ip.is_loopback or ip.is_link_local)
    except ValueError:
        if re.fullmatch(r'[0-9.]+', value):
            return False
        return bool(re.fullmatch(r'(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?', value))


def validate(task_id, content, references):
    task = next((item for item in TASKS if item['id'] == task_id), None)
    result = {'kind': 'workflow-config', 'taskId': task_id if isinstance(task_id, str) else '', 'valid': False, 'errors': [], 'warnings': [],
              'references': [], 'syntaxValid': False, 'shapeValid': False, 'livePreflight': 'not_run',
              'contentHash': digest(content) if isinstance(content, str) else ''}
    errors = result['errors']
    if not task:
        errors.append('Select a supported operational task. Other generators remain in Additional authoring tools.')
        return result
    try:
        parsed = parse(content)
        result['syntaxValid'] = True
        roots = {'clusters'} | ({'pc_ip', 'pc_credential'} if task_id == 'RegisterToPc' else
                               {'prism_login_title_verify_tls'} if task_id == 'SetPrismLoginTitlePe' else set())
        if set(parsed) - roots:
            errors.append('Only fields for the selected task are allowed; remove unrelated root settings or use Additional authoring tools.')
        clusters = parsed.get('clusters')
        if not isinstance(clusters, dict) or len(clusters) != 1:
            raise StudioInputError('Select exactly one cluster for this guided task. Multi-cluster files remain available in Additional authoring tools.')
        target, cluster = next(iter(clusters.items()))
        if not address(target) or not isinstance(cluster, dict):
            raise StudioInputError('clusters: supply a specific PE address and a cluster mapping.')
        allowed = {'name', 'pe_credential', *task['keys']}
        if set(cluster) - allowed:
            errors.append('clusters: unrelated settings do not match the selected task.')
        for key in ['name', 'pe_credential', *task['keys']]:
            if key not in cluster or cluster[key] is None or cluster[key] == '' or cluster[key] == [] or cluster[key] == {}:
                errors.append(f'clusters.<target>.{key}: a value is required.')
        if not isinstance(cluster.get('name'), str) or not cluster['name'].strip():
            errors.append('clusters.<target>.name: enter the cluster name.')
        refs = [cluster.get('pe_credential')]
        if task_id == 'ChangeDefaultAdminPasswordPe':
            refs.append(cluster.get('new_pe_admin_credential'))
        if task_id == 'RegisterToPc':
            if not address(parsed.get('pc_ip')):
                errors.append('pc_ip: enter a specific Prism Central address.')
            refs.append(parsed.get('pc_credential'))
        for key in ('ntp_servers_list', 'name_servers_list'):
            if key in task['keys'] and (not isinstance(cluster.get(key), list) or not cluster[key]
                    or len(cluster[key]) > 32 or any(not address(item) for item in cluster[key])):
                errors.append(f'clusters.<target>.{key}: enter a nonempty list of server addresses.')
        for key in ('enable_pulse', 'enable_rebuild_reservation'):
            if key in task['keys'] and type(cluster.get(key)) is not bool:
                errors.append(f'clusters.<target>.{key}: explicitly select enabled or disabled.')
        if task_id == 'AcceptEulaPe':
            eula = cluster.get('eula')
            if not isinstance(eula, dict) or set(eula) != {'username', 'company_name', 'job_title'} or any(
                    not isinstance(eula.get(k), str) or not eula[k].strip() for k in ('username', 'company_name', 'job_title')):
                errors.append('clusters.<target>.eula: username, company_name and job_title are required.')
        if task_id == 'UpdateDsip' and not address(cluster.get('dsip')):
            errors.append('clusters.<target>.dsip: enter an explicit address; IPAM allocation uses the existing workflow editor.')
        if task_id == 'HaReservation':
            ha = cluster.get('ha_reservation')
            if (not isinstance(ha, dict) or set(ha) != {'enable_failover', 'num_host_failure_to_tolerate'}
                    or type(ha.get('enable_failover')) is not bool
                    or type(ha.get('num_host_failure_to_tolerate')) is not int or not 1 <= ha['num_host_failure_to_tolerate'] <= 4):
                errors.append('clusters.<target>.ha_reservation: review the boolean enable_failover and host-failure count (1–4).')
        if task_id == 'CreateContainerPe':
            containers = cluster.get('containers')
            if not isinstance(containers, list) or len(containers) != 1:
                errors.append('clusters.<target>.containers: define exactly one storage container.')
            else:
                container = containers[0]
                permitted = {'name', 'replication_factor', 'advertisedCapacity_in_gb', 'reserved_in_gb', 'compression_enabled',
                             'compression_delay_in_secs', 'erasure_code', 'on_disk_dedup', 'nfsWhitelistAddress'}
                if (not isinstance(container, dict) or set(container) - permitted or not isinstance(container.get('name'), str)
                        or not container['name'].strip() or type(container.get('replication_factor')) is not int
                        or container['replication_factor'] not in (1, 2, 3)):
                    errors.append('containers[0]: enter a name and explicitly choose replication factor 1, 2 or 3.')
                else:
                    for key in ('advertisedCapacity_in_gb', 'reserved_in_gb', 'compression_delay_in_secs'):
                        if key in container and (type(container[key]) is not int or container[key] < 0):
                            errors.append(f'containers[0].{key}: enter a nonnegative integer.')
                    if 'compression_enabled' in container and type(container['compression_enabled']) is not bool:
                        errors.append('containers[0].compression_enabled: choose a boolean.')
                    for key in ('erasure_code', 'on_disk_dedup'):
                        if key in container and container[key] not in ('ON', 'OFF'):
                            errors.append(f'containers[0].{key}: choose ON or OFF.')
                    if container.get('nfsWhitelistAddress', []) != []:
                        errors.append('containers[0].nfsWhitelistAddress: use Additional authoring tools to review whitelist changes.')
                    if container.get('replication_factor') == 1:
                        result['warnings'].append('Replication factor 1 provides no replicated data protection; confirm the target policy.')
        if task_id == 'SetPrismLoginTitlePe':
            title = cluster.get('prism_login_title')
            if not isinstance(title, str) or not title.strip() or len(title) > 128 or any(ord(c) < 32 or c in '<>' for c in title):
                errors.append('prism_login_title: use 1–128 nonblank plain-text characters.')
            if 'prism_login_title_verify_tls' in parsed and type(parsed['prism_login_title_verify_tls']) is not bool:
                errors.append('prism_login_title_verify_tls: use a boolean.')
        result['shapeValid'] = not errors
        for ref in dict.fromkeys(ref for ref in refs if isinstance(ref, str)):
            if not REF.fullmatch(ref):
                errors.append('Credential references must be saved reference names, not inline credentials.')
                continue
            found = ref in references
            result['references'].append({'name': ref, 'status': 'found' if found else 'not_found'})
            if not found:
                errors.append(f'Credential reference "{ref}" is not in the saved catalogue. Declare it in Global Config.')
        if any(not isinstance(ref, str) for ref in refs):
            errors.append('Credential references must be nonempty strings.')
    except StudioInputError as error:
        errors.append(str(error))
    except (ValueError, TypeError, RecursionError):
        # Never echo raw YAML fragments, objects or parser exceptions into UI/logs.
        errors.append('Check the selected task fields, one-cluster structure, explicit target and distinct YAML keys.')
    result['valid'] = not errors
    result['warnings'].append('Authoring checks only. Authentication, connectivity and live preflight have not been performed.')
    return result
