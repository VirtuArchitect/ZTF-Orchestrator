"""Controlled classic Foundation VM integration helpers.

The functions in this module deliberately keep credentials out of persisted
configuration and logs. Callers provide a credential resolver at execution
time and explicitly opt into mutating API calls.
"""

from __future__ import annotations

import base64
import http.client
import ipaddress
import json
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable


CredentialResolver = Callable[[str], tuple[str | None, str | None, str]]

FOUNDATION_TERMINAL_STATES = {
    'imaging_stopped', 'complete', 'completed', 'success', 'succeeded',
    'failed', 'failure', 'error', 'aborted', 'cancelled', 'canceled',
}

PLATFORM_VALUES = {
    'autodetect': 'auto', 'auto': 'auto', 'nutanix': 'nutanix_nx',
    'nutanix_nx': 'nutanix_nx', 'dell': 'dell_xc', 'dell_xc': 'dell_xc',
    'lenovo': 'lenovo_hx', 'lenovo_hx': 'lenovo_hx', 'ibm': 'ibm_powerpc',
    'ibm_powerpc': 'ibm_powerpc', 'cisco_ucs': 'cisco_ucs',
    'cisco_standalone': 'cisco_ucs', 'hpe': 'hpe_proliant',
    'hpe_proliant': 'hpe_proliant', 'hitachi': 'hitachi', 'inspur': 'inspur',
    'intel': 'intel', 'nec': 'nec', 'fujitsu': 'fujitsu', 'other': 'other',
}

BOND_VALUES = {'none': '', 'static': 'static', 'lacp': 'dynamic', 'dynamic': 'dynamic'}


def endpoint(config: dict) -> tuple[str, str, int]:
    raw_host = str(config.get('foundation_vm_ip') or config.get('foundation_vm_host') or '').strip()
    parsed = urllib.parse.urlparse(raw_host if '://' in raw_host else f'//{raw_host}')
    host = str(parsed.hostname or raw_host).strip()
    scheme = str(parsed.scheme or config.get('foundation_vm_scheme') or 'http').strip().lower()
    if scheme not in {'http', 'https'}:
        scheme = 'http'
    try:
        port = int(parsed.port or config.get('foundation_vm_port') or 8000)
    except (TypeError, ValueError):
        port = 8000
    return host, scheme, port


def url(config: dict, resource: str) -> str:
    host, scheme, port = endpoint(config)
    path = str(resource or '').strip().lstrip('/')
    if not path.startswith('foundation/'):
        path = f'foundation/{path}'
    return f'{scheme}://{host}:{port}/{path}'


def request_json(
    config: dict,
    resource: str,
    *,
    method: str = 'GET',
    payload: dict | None = None,
    timeout: int = 20,
) -> tuple[bool, str, object, float]:
    target = url(config, resource)
    started = time.monotonic()
    data = None if payload is None else json.dumps(payload).encode('utf-8')
    headers = {'Accept': 'application/json'}
    if data is not None:
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(target, data=data, headers=headers, method=method)
    context = ssl._create_unverified_context() if target.startswith('https://') else None
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=context) as response:  # nosec B310 - admin-configured appliance.
            raw = response.read(4 * 1024 * 1024).decode('utf-8', 'replace').strip()
        if not raw:
            body: object = {}
        else:
            try:
                body = json.loads(raw)
            except json.JSONDecodeError:
                body = raw
        return True, '', body, (time.monotonic() - started) * 1000
    except urllib.error.HTTPError as exc:
        detail = exc.read(8192).decode('utf-8', 'replace').strip()
        return False, f'HTTP {exc.code}: {detail or exc.reason}', {}, (time.monotonic() - started) * 1000
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        reason = getattr(exc, 'reason', exc)
        return False, str(reason), {}, (time.monotonic() - started) * 1000


def image_inventory(config: dict) -> tuple[dict, list[str]]:
    inventory: dict[str, object] = {}
    errors: list[str] = []
    for key, resource in (
        ('aos', 'enumerate_nos_packages'),
        ('hypervisors', 'enumerate_hypervisor_isos'),
    ):
        ok, error, body, latency = request_json(config, resource)
        if ok:
            inventory[key] = body
            inventory[f'{key}LatencyMs'] = round(latency)
        else:
            errors.append(f'{resource}: {error}')
    return inventory, errors


def validate_image_selection(config: dict, inventory: dict) -> list[str]:
    """Confirm that the configured image basenames exist in Foundation inventory."""
    available: set[str] = set()

    def collect(value: object) -> None:
        if isinstance(value, str):
            available.add(Path(value).name)
        elif isinstance(value, list):
            for item in value:
                collect(item)
        elif isinstance(value, dict):
            for key, item in value.items():
                if key in {'filename', 'name'} and isinstance(item, str):
                    available.add(Path(item).name)
                else:
                    collect(item)

    collect(inventory.get('aos'))
    collect(inventory.get('hypervisors'))
    images = config.get('aos_hypervisor_images') or {}
    errors: list[str] = []
    for key in ('aos_package', 'hypervisor_iso'):
        selected = Path(str(images.get(key) or '')).name
        if selected and selected not in available:
            errors.append(f'aos_hypervisor_images.{key} is not present in Foundation image inventory: {selected}')
    phoenix = Path(str(images.get('phoenix_iso') or '')).name
    if phoenix and phoenix not in available:
        errors.append(f'aos_hypervisor_images.phoenix_iso is not present in Foundation image inventory: {phoenix}')
    return errors


def validate_intent(config: dict, resolver: CredentialResolver | None = None) -> list[str]:
    errors: list[str] = []
    host, _scheme, port = endpoint(config)
    if not host:
        errors.append('foundation_vm_ip is required')
    if not 1 <= port <= 65535:
        errors.append('foundation_vm_port must be between 1 and 65535')

    options = config.get('foundation_vm_options')
    if not isinstance(options, dict):
        errors.append('foundation_vm_options must be a mapping')
        options = {}
    platform = str(options.get('hardware_platform') or '').strip().lower()
    if platform not in PLATFORM_VALUES:
        errors.append('foundation_vm_options.hardware_platform is not supported by Foundation')
    lag = str(options.get('lag_type') or 'none').strip().lower()
    if lag not in BOND_VALUES:
        errors.append('foundation_vm_options.lag_type must be none, static, or dynamic')

    images = config.get('aos_hypervisor_images')
    if not isinstance(images, dict):
        errors.append('aos_hypervisor_images must be a mapping')
        images = {}
    if not str(images.get('aos_package') or '').strip():
        errors.append('aos_hypervisor_images.aos_package is required')
    if not str(images.get('hypervisor_iso') or '').strip():
        errors.append('aos_hypervisor_images.hypervisor_iso is required')

    network = config.get('common_network_settings')
    if not isinstance(network, dict):
        errors.append('common_network_settings must be a mapping')
        network = {}
    for key in ('dns_servers', 'ntp_servers'):
        if not isinstance(network.get(key), list) or not network.get(key):
            errors.append(f'common_network_settings.{key} must contain at least one value')
    if isinstance(network.get('dns_servers'), list) and len(network['dns_servers']) > 3:
        errors.append('common_network_settings.dns_servers supports at most three values')

    clusters = config.get('create_clusters')
    if not isinstance(clusters, list) or not clusters:
        errors.append('create_clusters must contain at least one cluster')
        return errors

    seen_ips: set[str] = set()
    seen_positions: set[tuple[str, str]] = set()
    global_network: tuple[str, ...] | None = None
    for cluster_index, cluster in enumerate(clusters, start=1):
        prefix = f'create_clusters[{cluster_index - 1}]'
        if not isinstance(cluster, dict):
            errors.append(f'{prefix} must be a mapping')
            continue
        if not str(cluster.get('cluster_name') or '').strip() and not cluster.get('skip_cluster_creation'):
            errors.append(f'{prefix}.cluster_name is required unless cluster formation is skipped')
        if not str(cluster.get('cluster_vip') or '').strip() and not cluster.get('skip_cluster_creation'):
            errors.append(f'{prefix}.cluster_vip is required unless cluster formation is skipped')
        network_values = tuple(str(cluster.get(key) or '').strip() for key in (
            'host_netmask', 'host_gateway', 'cvm_netmask', 'cvm_gateway',
            'ipmi_netmask', 'ipmi_gateway', 'cvm_vlan_id',
        ))
        if global_network is None:
            global_network = network_values
        elif network_values != global_network:
            errors.append(f'{prefix} uses network values that differ from the first cluster; Foundation VM accepts one global network definition')
        for key in ('host_netmask', 'host_gateway', 'cvm_netmask', 'cvm_gateway'):
            if not str(cluster.get(key) or '').strip():
                errors.append(f'{prefix}.{key} is required')
        if not cluster.get('no_ipmi_subnet'):
            for key in ('ipmi_netmask', 'ipmi_gateway'):
                if not str(cluster.get(key) or '').strip():
                    errors.append(f'{prefix}.{key} is required unless IPMI has no subnet')
        for key in ('host_gateway', 'cvm_gateway', 'ipmi_gateway'):
            value = str(cluster.get(key) or '').strip()
            if value:
                try:
                    ipaddress.ip_address(value)
                except ValueError:
                    errors.append(f'{prefix}.{key} is not a valid IP address')
        for key in ('host_netmask', 'cvm_netmask', 'ipmi_netmask'):
            value = str(cluster.get(key) or '').strip()
            if value:
                try:
                    ipaddress.ip_network(f'0.0.0.0/{value}')
                except ValueError:
                    errors.append(f'{prefix}.{key} is not a valid IPv4 netmask')
        nodes = cluster.get('nodes_list')
        if not isinstance(nodes, list) or not nodes:
            errors.append(f'{prefix}.nodes_list must contain at least one node')
            continue
        non_compute = 0
        for node_index, node in enumerate(nodes, start=1):
            node_prefix = f'{prefix}.nodes_list[{node_index - 1}]'
            if not isinstance(node, dict):
                errors.append(f'{node_prefix} must be a mapping')
                continue
            role = str(node.get('node_role') or 'hyperconverged').strip().lower()
            if role not in {'hyperconverged', 'storage-only', 'compute-only'}:
                errors.append(f'{node_prefix}.node_role is invalid')
            if role != 'compute-only':
                non_compute += 1
                if not str(node.get('cvm_ip') or '').strip():
                    errors.append(f'{node_prefix}.cvm_ip is required')
                try:
                    cvm_ram = int(node.get('cvm_ram_gb') or 0)
                except (TypeError, ValueError):
                    cvm_ram = 0
                if cvm_ram < 20:
                    errors.append(f'{node_prefix}.cvm_ram_gb must be at least 20')
            if not str(node.get('node_serial') or '').strip():
                errors.append(f'{node_prefix}.node_serial is required')
            if not str(node.get('hypervisor_hostname') or '').strip():
                errors.append(f'{node_prefix}.hypervisor_hostname is required')
            if node.get('ipmi_configure_now') and not str(node.get('ipmi_mac') or '').strip():
                errors.append(f'{node_prefix}.ipmi_mac is required when IPMI configuration is enabled')
            for key in ('host_ip', 'ipmi_ip', 'cvm_ip'):
                if key == 'cvm_ip' and role == 'compute-only':
                    continue
                value = str(node.get(key) or '').strip()
                if not value:
                    errors.append(f'{node_prefix}.{key} is required')
                    continue
                try:
                    ipaddress.ip_address(value)
                except ValueError:
                    errors.append(f'{node_prefix}.{key} is not a valid IP address')
                if value in seen_ips:
                    errors.append(f'{node_prefix}.{key} duplicates another node address')
                seen_ips.add(value)
            position = str(node.get('node_position') or '').strip().upper()
            if position not in {'A', 'B', 'C', 'D'}:
                errors.append(f'{node_prefix}.node_position must be A, B, C, or D')
            block = str(node.get('block_serial') or node.get('node_serial') or f'cluster-{cluster_index}').strip()
            if (block, position) in seen_positions:
                errors.append(f'{node_prefix}.node_position duplicates a position in block {block}')
            seen_positions.add((block, position))
            credential_ref = str(node.get('ipmi_credential_ref') or '').strip()
            if not credential_ref:
                errors.append(f'{node_prefix}.ipmi_credential_ref is required')
            elif resolver:
                _username, _password, credential_error = resolver(credential_ref)
                if credential_error:
                    errors.append(f'{node_prefix}.ipmi_credential_ref: {credential_error}')
        if any(str(node.get('node_role') or '').lower() == 'compute-only' for node in nodes if isinstance(node, dict)) and non_compute < 3:
            errors.append(f'{prefix} requires at least three non-compute nodes when compute-only nodes are present')
        try:
            redundancy_factor = int(cluster.get('redundancy_factor') or 2)
        except (TypeError, ValueError):
            redundancy_factor = 0
        minimum_nodes = 5 if redundancy_factor == 3 else 3 if redundancy_factor == 2 else 0
        if not minimum_nodes:
            errors.append(f'{prefix}.redundancy_factor must be 2 or 3')
        elif not cluster.get('skip_cluster_creation') and non_compute < minimum_nodes:
            errors.append(f'{prefix} requires at least {minimum_nodes} regular or storage nodes for RF-{redundancy_factor}')

        for address_key, mask_key, gateway_key in (
            ('host_ip', 'host_netmask', 'host_gateway'),
            ('cvm_ip', 'cvm_netmask', 'cvm_gateway'),
            ('ipmi_ip', 'ipmi_netmask', 'ipmi_gateway'),
        ):
            if address_key == 'ipmi_ip' and cluster.get('no_ipmi_subnet'):
                continue
            mask = str(cluster.get(mask_key) or '').strip()
            gateway = str(cluster.get(gateway_key) or '').strip()
            if not mask or not gateway:
                continue
            try:
                expected_network = ipaddress.ip_interface(f'{gateway}/{mask}').network
            except ValueError:
                continue
            for node_index, node in enumerate(nodes):
                if not isinstance(node, dict) or (address_key == 'cvm_ip' and str(node.get('node_role') or '').lower() == 'compute-only'):
                    continue
                address = str(node.get(address_key) or '').strip()
                try:
                    if address and ipaddress.ip_address(address) not in expected_network:
                        errors.append(f'{prefix}.nodes_list[{node_index}].{address_key} is outside the {gateway_key} subnet')
                except ValueError:
                    pass

    for ref_key in ('hypervisor_credential', 'cluster_credential'):
        ref = str(config.get(ref_key) or '').strip()
        if not ref:
            errors.append(f'{ref_key} is required')
        elif resolver:
            _username, _password, credential_error = resolver(ref)
            if credential_error:
                errors.append(f'{ref_key}: {credential_error}')
    return errors


def build_native_payload(config: dict, resolver: CredentialResolver) -> dict:
    errors = validate_intent(config, resolver)
    if errors:
        raise ValueError('; '.join(errors))

    options = config['foundation_vm_options']
    images = config['aos_hypervisor_images']
    network = config['common_network_settings']
    clusters = config['create_clusters']
    _hypervisor_user, hypervisor_password, _ = resolver(str(config['hypervisor_credential']))
    _cluster_user, cluster_password, _ = resolver(str(config['cluster_credential']))
    hypervisor_type = str(images.get('hypervisor_type') or 'kvm').strip().lower().replace('ahv', 'kvm').replace('esxi', 'esx').replace('hyper-v', 'hyperv')
    has_storage_nodes = any(
        str(node.get('node_role') or '').lower() == 'storage-only'
        for cluster in clusters for node in cluster['nodes_list']
    )

    first_cluster = clusters[0]
    dns_servers = ', '.join(
        str(server).strip() for server in network.get('dns_servers') or []
        if str(server).strip()
    )
    ntp_servers = ', '.join(
        str(server).strip() for server in network.get('ntp_servers') or []
        if str(server).strip()
    )
    blocks_by_serial: dict[str, list[dict]] = {}
    for cluster in clusters:
        for node in cluster['nodes_list']:
            ipmi_user, ipmi_password, _ = resolver(str(node['ipmi_credential_ref']))
            role = str(node.get('node_role') or 'hyperconverged').lower()
            block_serial = str(node.get('block_serial') or node.get('node_serial') or 'Manual').strip()
            native_node = {
                'node_serial': str(node.get('node_serial') or '').strip() or None,
                'node_position': str(node['node_position']).upper(),
                'hypervisor_ip': str(node['host_ip']).strip(),
                'hypervisor_hostname': str(node.get('hypervisor_hostname') or '').strip(),
                'ipmi_ip': str(node['ipmi_ip']).strip(),
                'ipmi_mac': str(node.get('ipmi_mac') or '').strip().upper(),
                'cvm_ip': None if role == 'compute-only' else str(node.get('cvm_ip') or '').strip(),
                'cvm_gb_ram': 0 if role == 'compute-only' else int(node.get('cvm_ram_gb') or 20),
                'is_light_compute': role == 'storage-only',
                'compute_only': role == 'compute-only',
                'hypervisor': 'kvm' if role == 'storage-only' else hypervisor_type,
                'hardware_attributes_override': {'minimal_compute_node': True} if role == 'storage-only' else {},
                'nos_version': '99.0',
                'cvm_boot_drive_source': 'layout',
                'device_hint': 'CVM',
                'is_bare_metal': False,
                'is_selected': True,
                'ipmi_configure_now': bool(node.get('ipmi_configure_now')),
                'image_now': True,
                'ipmi_user': ipmi_user,
                'ipmi_password': ipmi_password,
            }
            blocks_by_serial.setdefault(block_serial, []).append(native_node)

    native_clusters = []
    for cluster in clusters:
        member_ips = [str(node.get('cvm_ip') or '').strip() for node in cluster['nodes_list'] if str(node.get('node_role') or '').lower() != 'compute-only']
        native_cluster = {
            'cluster_name': str(cluster.get('cluster_name') or '').strip(),
            'cluster_external_ip': str(cluster.get('cluster_vip') or '').strip(),
            'cluster_members': member_ips,
            'redundancy_factor': int(cluster.get('redundancy_factor') or 2),
            'cluster_init_now': not bool(cluster.get('skip_cluster_creation')),
            'timezone': str(cluster.get('timezone') or 'UTC'),
            'cvm_dns_servers': dns_servers,
            'cvm_ntp_servers': ntp_servers,
            'cluster_password': cluster_password,
            'lockdown_mode': bool(cluster.get('lockdown_mode')),
            'restricted_shell_mode': bool(cluster.get('restricted_shell_mode')),
            'ssh_using_password': bool(cluster.get('ssh_using_password', True)),
            'external_access_keys': list(cluster.get('external_access_keys') or []),
        }
        native_clusters.append(native_cluster)

    return {
        'ui_platform': PLATFORM_VALUES[str(options.get('hardware_platform')).lower()],
        'bond_mode': BOND_VALUES[str(options.get('lag_type') or 'none').lower()],
        'bond_lacp_rate': str(options.get('lacp_rate') or 'fast') if BOND_VALUES[str(options.get('lag_type') or 'none').lower()] == 'dynamic' else None,
        'rdma_passthrough': bool(options.get('rdma_passthrough')),
        'ui_skip_network_check': bool(options.get('skip_network_check')),
        'ui_no_ipmi_subnet': bool(first_cluster.get('no_ipmi_subnet')),
        'ui_need_ipmi_subnet': not bool(first_cluster.get('no_ipmi_subnet')),
        'ui_is_installing_cvm': True,
        'ui_is_installing_hypervisor': True,
        'ui_is_installing_secondary_hypervisor': has_storage_nodes,
        'ui_cvm_boot_drive_source': 'layout',
        'hypervisor_netmask': str(first_cluster.get('host_netmask') or ''),
        'hypervisor_gateway': str(first_cluster.get('host_gateway') or ''),
        'hypervisor_password': hypervisor_password,
        'ipmi_netmask': str(first_cluster.get('ipmi_netmask') or ''),
        'ipmi_gateway': str(first_cluster.get('ipmi_gateway') or ''),
        'cvm_netmask': str(first_cluster.get('cvm_netmask') or ''),
        'cvm_gateway': str(first_cluster.get('cvm_gateway') or ''),
        'current_cvm_vlan_tag': first_cluster.get('cvm_vlan_id') or None,
        'nos_package': str(images.get('aos_package') or '').strip(),
        'hypervisor_iso': str(images.get('hypervisor_iso') or '').strip(),
        'phoenix_iso': str(images.get('phoenix_iso') or '').strip() or None,
        'hypervisor_nameserver': dns_servers,
        'hypervisor_ntp_servers': ntp_servers,
        'blocks': [
            {'block_id': serial if serial != 'Manual' else None, 'ui_block_id': serial, 'nodes': nodes}
            for serial, nodes in blocks_by_serial.items()
        ],
        'clusters': native_clusters,
    }


def redact_payload(payload: dict) -> dict:
    secret_keys = {'ipmi_password', 'hypervisor_password', 'cluster_password'}

    def redact(value: object) -> object:
        if isinstance(value, dict):
            return {key: ('***' if key in secret_keys and item else redact(item)) for key, item in value.items()}
        if isinstance(value, list):
            return [redact(item) for item in value]
        return value

    return redact(payload)  # type: ignore[return-value]


def test_ipmi_credentials(config: dict, resolver: CredentialResolver) -> list[dict]:
    results: list[dict] = []
    for cluster in config.get('create_clusters') or []:
        for node in cluster.get('nodes_list') or []:
            address = str(node.get('ipmi_ip') or '').strip()
            ref = str(node.get('ipmi_credential_ref') or '').strip()
            username, password, error = resolver(ref)
            if error:
                results.append({'ipmiIp': address, 'credentialRef': ref, 'ok': False, 'error': error})
                continue
            token = base64.b64encode(f'{username}:{password}'.encode('utf-8')).decode('ascii')
            request = urllib.request.Request(
                f'https://{address}/redfish/v1/Managers',
                headers={'Authorization': f'Basic {token}', 'Accept': 'application/json'},
            )
            started = time.monotonic()
            try:
                with urllib.request.urlopen(request, timeout=10, context=ssl._create_unverified_context()) as response:  # nosec B310 - configured BMC endpoint.
                    response.read(4096)
                results.append({'ipmiIp': address, 'credentialRef': ref, 'ok': True, 'latencyMs': round((time.monotonic() - started) * 1000)})
            except urllib.error.HTTPError as exc:
                results.append({'ipmiIp': address, 'credentialRef': ref, 'ok': False, 'error': f'HTTP {exc.code}'})
            except (urllib.error.URLError, OSError, TimeoutError) as exc:
                results.append({'ipmiIp': address, 'credentialRef': ref, 'ok': False, 'error': str(getattr(exc, 'reason', exc))})
    return results


def upload_image(
    config: dict,
    image_path: Path,
    installer_type: str,
    filename: str | None = None,
) -> tuple[bool, str, object, float]:
    if installer_type not in {'nos', 'hypervisor', 'phoenix'}:
        return False, 'installer_type must be nos, hypervisor, or phoenix', {}, 0.0
    remote_filename = str(filename or image_path.name).strip()
    if not remote_filename or Path(remote_filename).name != remote_filename:
        return False, 'filename must be a basename', {}, 0.0
    query = urllib.parse.urlencode({
        'installer_type': installer_type,
        'filename': remote_filename,
    })
    target = f'{url(config, "upload")}?{query}'
    parsed = urllib.parse.urlparse(target)
    connection_type = http.client.HTTPSConnection if parsed.scheme == 'https' else http.client.HTTPConnection
    connection = connection_type(
        parsed.hostname,
        parsed.port,
        timeout=3600,
        **({'context': ssl._create_unverified_context()} if parsed.scheme == 'https' else {}),
    )
    started = time.monotonic()
    try:
        content_length = image_path.stat().st_size
        request_target = parsed.path + (f'?{parsed.query}' if parsed.query else '')
        connection.putrequest('POST', request_target)
        connection.putheader('Accept', 'application/json')
        connection.putheader('Content-Type', 'application/octet-stream')
        connection.putheader('Content-Length', str(content_length))
        connection.endheaders()
        with image_path.open('rb') as source:
            while chunk := source.read(1024 * 1024):
                connection.send(chunk)
        response = connection.getresponse()
        raw = response.read(1024 * 1024).decode('utf-8', 'replace').strip()
        if not 200 <= response.status < 300:
            return False, f'HTTP {response.status}: {raw or response.reason}', {}, (time.monotonic() - started) * 1000
        return True, '', json.loads(raw) if raw else {}, (time.monotonic() - started) * 1000
    except (http.client.HTTPException, urllib.error.URLError, OSError, TimeoutError) as exc:
        return False, str(getattr(exc, 'reason', exc)), {}, (time.monotonic() - started) * 1000
    finally:
        connection.close()
