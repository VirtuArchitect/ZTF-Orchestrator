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
    if value.startswith(('fatal:', 'failed:', 'error:')):
        return 'failed'
    if value.startswith('running '):
        return 'running'
    for normalized, aliases in (
        ('completed', {'complete', 'completed', 'success', 'succeeded', 'finished', 'done',
                       'all operations completed successfully'}),
        ('failed', {'failed', 'failure', 'error'}),
        ('running', {'running', 'in_progress', 'in progress'}),
        ('pending', {'pending', 'not_started', 'not run', 'not started', 'queued'}),
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
        if node['status'] != 'unknown':
            node['activity'] = {
                'completed': 'Node imaging/configuration completed',
                'failed': 'Node imaging/configuration failed',
                'running': 'Node imaging/configuration in progress',
                'pending': 'Node imaging/configuration pending',
                'cancelled': 'Node imaging/configuration cancelled',
            }[node['status']]
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
    overall = status(response.get('aggregate_status') or response.get('status'))
    # Classic Foundation reports grouped node imaging and cluster records, not
    # independent AHV/AOS milestones. Do not fabricate those missing milestones.
    classic = response.get('action') == 'imaging' and not (response.get('stages') or response.get('phases'))
    if classic:
        def rollup(rows):
            states = {row['status'] for row in rows}
            if 'failed' in states:
                return 'failed'
            if 'cancelled' in states:
                return 'cancelled'
            if rows and states == {'completed'}:
                return 'completed'
            if 'running' in states:
                return 'running'
            if rows and states == {'pending'}:
                return 'pending'
            return 'unknown'

        imaging = {'id': 'node_imaging', 'label': 'Node imaging / configuration',
                   'status': rollup(nodes), 'percent': None, 'nodes': nodes}
        expected = config.get('create_clusters', [])
        reported_clusters = records(response.get('clusters'))
        expected_names = {str(item.get('cluster_name')) for item in expected if item.get('cluster_name')}
        if len(expected_names) == len(expected) and expected_names:
            by_name = {str(item.get('cluster_name') or name): metric(item)
                       for name, item in reported_clusters}
            cluster_rows = [by_name.get(name, {'status': 'unknown', 'percent': None})
                            for name in sorted(expected_names)]
        else:
            cluster_rows = [metric(item) for _, item in reported_clusters]
        cluster = phases['cluster_formation']
        cluster['status'] = rollup(cluster_rows)
        if len(cluster_rows) != len(expected) and cluster['status'] == 'completed':
            cluster['status'] = 'unknown'
        if cluster_rows and all(row['percent'] is not None for row in cluster_rows):
            cluster['percent'] = min(row['percent'] for row in cluster_rows)
        phases = {key: value for key, value in (
            ('validation', phases['validation']), ('node_imaging', imaging),
            ('cluster_formation', cluster))}
        if overall == 'unknown':
            overall = rollup([imaging, cluster])
            if overall == 'completed' and response.get('imaging_stopped') is not True:
                overall = 'running'
    return {
        'status': overall,
        'percent': percent(response.get('aggregate_percent_complete', response.get('percent_complete'))),
        'phases': list(phases.values()), 'nodes': nodes,
    }
