"""Telemetry must never invent phase completion or retain raw credentials."""
import json

import pytest

from foundation_vm_progress import normalize_progress, percent, status


CONFIG = {'create_clusters': [{'nodes_list': [
    {'node_serial': 'NODE-A', 'host_ip': '192.0.2.11', 'cvm_ip': '192.0.2.12'},
    {'node_serial': 'NODE-B', 'host_ip': '192.0.2.13', 'cvm_ip': '192.0.2.14'},
]}]}


def test_aggregate_success_does_not_promote_any_phase_or_node():
    snapshot = normalize_progress({'aggregate_status': 'completed', 'aggregate_percent_complete': 100}, CONFIG)
    assert snapshot['status'] == 'completed'
    assert snapshot['percent'] == 100
    assert all(phase['status'] == 'unknown' and phase['percent'] is None for phase in snapshot['phases'])
    assert all(node['status'] == 'unknown' for node in snapshot['nodes'])


def test_per_node_failure_and_explicit_phases_with_redacted_boundary():
    snapshot = normalize_progress({
        'aggregate_status': 'failed', 'aggregate_percent_complete': 94,
        'stages': {'install_hypervisor': {'status': 'completed', 'percent_complete': 100}},
        'nodes': {'NODE-A': {'status': 'failed', 'percent_complete': 94, 'stage': 'install_aos',
                             'password': 'SECRET', 'message': 'SECRET',
                             'stages': {'install_aos': {'status': 'failed', 'percent_complete': 94, 'error': 'SECRET'}}}},
    }, CONFIG)
    assert snapshot['nodes'][0]['status'] == 'failed'
    assert snapshot['nodes'][0]['activity'] == 'AOS installation'
    assert snapshot['nodes'][1]['status'] == 'unknown'
    assert snapshot['phases'][3]['status'] == 'completed'
    assert snapshot['phases'][4]['nodes'][0]['percent'] == 94
    assert snapshot['phases'][4]['status'] == 'failed'
    assert snapshot['phases'][5]['status'] == 'unknown'
    assert 'SECRET' not in json.dumps(snapshot)


@pytest.mark.parametrize('response', [None, [], 'unrecognized', {'nodes': {'unmatched': {'status': 'completed'}}}])
def test_unknown_shapes_are_not_reported(response):
    snapshot = normalize_progress(response, CONFIG)
    assert snapshot['percent'] is None
    assert all(node['status'] == 'unknown' for node in snapshot['nodes'])


@pytest.mark.parametrize('value,expected', [(0, 0), ('94', 94), (120, 100), (-1, 0), ('nan', None), ('inf', None), (True, None), ({}, None)])
def test_percent_is_bounded_without_inventing_missing_values(value, expected):
    assert percent(value) == expected


def test_partial_completed_node_does_not_complete_phase():
    snapshot = normalize_progress({'nodes': [{'node_serial': 'NODE-A', 'stage': 'install_aos', 'status': 'completed', 'percent_complete': 100}]}, CONFIG)
    assert snapshot['phases'][4]['status'] == 'unknown'
    assert snapshot['phases'][4]['nodes'][0]['status'] == 'completed'


def test_nested_block_nodes_and_human_readable_stage_names():
    snapshot = normalize_progress({'blocks': [{'nodes': [{'node_serial': 'NODE-A', 'stage': 'Install Hypervisor', 'status': 'running', 'percent_complete': 27}]}]}, CONFIG)
    assert snapshot['nodes'][0]['percent'] == 27
    assert snapshot['phases'][3]['status'] == 'running'
    assert snapshot['phases'][3]['nodes'][0]['serial'] == 'NODE-A'


@pytest.mark.parametrize('value,expected', [
    ('Not Run', 'pending'), ('fatal: Running validations', 'failed'),
    ('Running validations', 'running'), ('Finished', 'completed'),
    ('All operations completed successfully', 'completed'), ('Done', 'completed'),
])
def test_foundation_status_labels(value, expected):
    assert status(value) == expected


def test_classic_foundation_explicit_success_and_grouped_phases():
    response = {'action': 'imaging', 'imaging_stopped': True,
                'aggregate_percent_complete': 100,
                'nodes': [{'node_serial': name, 'status': 'Done', 'percent_complete': 100}
                          for name in ('NODE-A', 'NODE-B')],
                'clusters': [{'status': 'Finished', 'percent_complete': 100}]}
    snapshot = normalize_progress(response, CONFIG)
    assert snapshot['status'] == 'completed'
    assert [phase['id'] for phase in snapshot['phases']] == ['validation', 'node_imaging', 'cluster_formation']
    assert snapshot['phases'][1]['status'] == 'completed'
    assert snapshot['phases'][2]['status'] == 'completed'
    assert all(node['activity'] == 'Node imaging/configuration completed' for node in snapshot['nodes'])


def test_classic_failure_not_run_and_unknown_never_promoted_by_percent():
    response = {'action': 'imaging', 'imaging_stopped': True, 'aggregate_percent_complete': 100,
                'nodes': [{'node_serial': 'NODE-A', 'status': 'fatal: Running validations',
                           'messages': ['SECRET'], 'percent_complete': 0.97}],
                'clusters': [{'status': 'Not Run', 'percent_complete': 0}]}
    snapshot = normalize_progress(response, CONFIG)
    assert snapshot['status'] == 'failed'
    assert snapshot['phases'][2]['status'] == 'pending'
    assert 'SECRET' not in json.dumps(snapshot)
    response['nodes'][0]['status'] = 'Done'
    assert normalize_progress(response, CONFIG)['phases'][1]['status'] == 'unknown'


def test_unrelated_cluster_cannot_complete_configured_cluster():
    config = {'create_clusters': [{**CONFIG['create_clusters'][0], 'cluster_name': 'EXPECTED'}]}
    snapshot = normalize_progress({'action': 'imaging', 'imaging_stopped': True,
        'clusters': [{'cluster_name': 'OTHER', 'status': 'Done', 'percent_complete': 100}]}, config)
    assert snapshot['phases'][2]['status'] == 'unknown'
    assert snapshot['status'] == 'unknown'
