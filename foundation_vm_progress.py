"""Bounded, allow-listed Foundation telemetry for durable deployment views.

Never infer phase completion from aggregate percentages or retain raw responses.
Unknown response layouts remain unreported until a verified adapter is added.
"""

import math


PHASES = (
    ('validation', 'Workflow validation'),
    ('image_preparation', 'Image preparation'),
    ('hardware_configuration', 'Hardware configuration'),
    ('hypervisor_installation', 'AHV installation'),
    ('aos_installation', 'AOS installation'),
    ('cluster_formation', 'Cluster formation'),
)
ALIASES = {
    'patch_iso': 'image_preparation', 'prepare_image': 'image_preparation',
    'ipmi_config': 'hardware_configuration', 'configure_hardware': 'hardware_configuration',
    'install_hypervisor': 'hypervisor_installation', 'install_aos': 'aos_installation',
    'create_cluster': 'cluster_formation',
    **{key: key for key, _ in PHASES},
}


def status(value):
    value = str(value or '').lower().strip()
    for normalized, aliases in (
        ('completed', {'complete', 'completed', 'success', 'succeeded'}),
        ('failed', {'failed', 'failure', 'error'}),
        ('running', {'running', 'in_progress', 'in progress'}),
        ('pending', {'pending', 'not_started', 'queued'}),
        ('cancelled', {'aborted', 'cancelled', 'canceled'}),
    ):
        if value in aliases:
            return normalized
    return 'unknown'


def percent(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
        return max(0, min(100, round(number))) if math.isfinite(number) else None
    except (ValueError, TypeError, OverflowError):
        return None


def records(value):
    if isinstance(value, list):
        return [(str(item.get('name') or item.get('stage') or ''), item)
                for item in value[:256] if isinstance(item, dict)]
    if isinstance(value, dict):
        return [(str(key), item) for key, item in list(value.items())[:256] if isinstance(item, dict)]
    return []


def metric(item):
    return {'status': status(item.get('status') or item.get('state')),
            'percent': percent(item.get('percent_complete', item.get('percent')))}


def phase_key(value):
    return ALIASES.get(str(value or '').lower().strip().replace(' ', '_').replace('-', '_'))


def normalize_progress(response, config):
    response = response if isinstance(response, dict) else {}
    phases = {key: {'id': key, 'label': label, 'status': 'unknown', 'percent': None, 'nodes': []}
              for key, label in PHASES}
    nodes = []
    for cluster in config.get('create_clusters', [])[:64]:
        for node in cluster.get('nodes_list', [])[:256]:
            nodes.append({'serial': str(node.get('node_serial') or '')[:128],
                          'hostIp': str(node.get('host_ip') or '')[:64],
                          'cvmIp': str(node.get('cvm_ip') or '')[:64],
                          'status': 'unknown', 'percent': None, 'activity': 'Not reported'})
    nodes = nodes[:256]
    for name, item in records(response.get('stages') or response.get('phases')):
        key = phase_key(name)
        if key and key != 'validation':
            phases[key].update(metric(item))
    node_records = records(response.get('nodes'))
    for _name, block in records(response.get('blocks')):
        node_records.extend(records(block.get('nodes')))
    for name, item in node_records[:256]:
        identities = {name, str(item.get('node_serial') or ''), str(item.get('hypervisor_ip') or ''),
                      str(item.get('cvm_ip') or '')} - {''}
        node = next((node for node in nodes if identities.intersection(
            {node['serial'], node['hostIp'], node['cvmIp']} - {''})), None)
        if node is None:
            continue
        node.update(metric(item))
        active = phase_key(item.get('stage') or item.get('phase'))
        if active and active != 'validation':
            node['activity'] = phases[active]['label']
        for stage, details in records(item.get('stages') or item.get('phases')):
            key = phase_key(stage)
            if key and key != 'validation':
                phases[key]['nodes'].append({**node, **metric(details), 'activity': phases[key]['label']})
        if active and active != 'validation' and not any(
            row['serial'] == node['serial'] for row in phases[active]['nodes']
        ):
            phases[active]['nodes'].append(dict(node))
    for phase in phases.values():
        reported = phase['nodes']
        if phase['status'] != 'unknown' or not reported:
            continue
        states = {row['status'] for row in reported}
        if 'failed' in states:
            phase['status'] = 'failed'
        elif 'running' in states:
            phase['status'] = 'running'
        # Partial node coverage is never enough to mark a whole phase complete.
        elif len({row['serial'] for row in reported}) == len(nodes) and states == {'completed'}:
            phase['status'] = 'completed'
    return {
        'status': status(response.get('aggregate_status') or response.get('status')),
        'percent': percent(response.get('aggregate_percent_complete', response.get('percent_complete'))),
        'phases': list(phases.values()), 'nodes': nodes,
    }
