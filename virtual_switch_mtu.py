import json
import os
import re

import ahv_uplink_migration as uplink

WORKFLOW = 'change-virtual-switch-mtu'
FILENAME = WORKFLOW + '.yml'
TARGET_MTU = 9000


def writes_enabled():
    return os.environ.get('ZTF_VS0_MTU_ENABLE_MUTATION', '').lower() == 'true'


def load_plan(content):
    if not isinstance(content, str) or len(content) > uplink.MAX_CONTENT:
        raise uplink.MigrationError('Provide a bounded MTU preflight plan.')
    plan = json.loads(content)
    if (not isinstance(plan, dict) or set(plan) != {'intent', 'switch', 'hosts', 'clusterName', 'targetMtu'}
            or uplink.canonical(plan) != content):
        raise uplink.MigrationError('Use the exact MTU preflight plan.')
    return plan


def connection(intent):
    if (not isinstance(intent, dict) or set(intent) != {'connection', 'fabricReviewed', 'rollbackJobId'}
            or intent['fabricReviewed'] is not True or not isinstance(intent['rollbackJobId'], str)
            or (intent['rollbackJobId'] and not re.fullmatch(r'[A-Za-z0-9-]{1,80}', intent['rollbackJobId']))):
        raise uplink.MigrationError('Review the network and recovery prerequisites before running preflight.')
    return uplink.connection(intent['connection'])


def switch_identity(config):
    return {key: value for key, value in config.items() if key != 'mtu'}


def host_evidence(inventory):
    config = inventory['source']['config']
    ports = uplink.host_ports(config)
    hosts = []
    for host in inventory['hosts']:
        nics = [nic for nic in host['nics'] if nic['name'] in ports[host['id']]]
        if (len(nics) < 2 or any(not nic['up'] or nic['switchId'] != config['extId']
                or type(nic['mtu']) is not int for nic in nics)):
            raise uplink.MigrationError('Every host must report at least two up vs0 uplinks with MTU telemetry.')
        hosts.append({'hostId': host['id'], 'host': host['name'], 'serial': host['serial'],
                      'uplinks': [{'name': nic['name'], 'mtu': nic['mtu']} for nic in nics]})
    return hosts


def preflight(intent, pc, pe, original=None):
    config = connection(intent)
    rollback_id = intent['rollbackJobId']
    inventory = uplink.collect(config, pc, pe, include_nic_mtu=True)
    switch = inventory['source']
    current = switch['config']['mtu']
    if (switch['config']['isDefault'] is not True or switch['config']['name'] != 'vs0'
            or type(current) is not int or current not in (1500, TARGET_MTU)
            or not re.fullmatch(r'"[^"\r\n]+"', switch['etag'])):
        raise uplink.MigrationError('The default switch must report MTU 1500 or 9000 and a strong ETag.')
    hosts = host_evidence(inventory)
    target = TARGET_MTU
    allowed = {current}
    if rollback_id:
        if (not original or original['intent']['rollbackJobId']
                or original['intent']['connection'] != config
                or original['targetMtu'] != TARGET_MTU
                or original['switch']['config']['mtu'] != 1500
                or switch_identity(original['switch']['config']) != switch_identity(switch['config'])
                or [(row['hostId'], row['serial']) for row in original['hosts']]
                    != [(row['hostId'], row['serial']) for row in hosts]):
            raise uplink.MigrationError('The original change job does not match this default switch and host baseline.')
        target = original['switch']['config']['mtu']
        allowed.update((target, TARGET_MTU))
    if any(nic['mtu'] not in allowed for host in hosts for nic in host['uplinks']):
        raise uplink.MigrationError('Host uplink MTU differs from the expected preflight values.')
    return {'intent': {**intent, 'connection': config}, 'clusterName': inventory['clusterName'],
            'switch': switch, 'hosts': hosts, 'targetMtu': target}


def needs_change(plan):
    return (plan['switch']['config']['mtu'] != plan['targetMtu']
            or any(nic['mtu'] != plan['targetMtu'] for host in plan['hosts'] for nic in host['uplinks']))


def execute(plan, pc, pe, emit, authorize, cancelled, report, original=None, sleep=None, mark_attempt=lambda: None):
    live = preflight(plan['intent'], pc, pe, original)
    if live != plan or not needs_change(live):
        raise uplink.MigrationError('The reviewed MTU plan changed or is already satisfied. Run preflight again.')
    switch = live['switch']['config']
    body = uplink.switch_body(switch, uplink.host_ports(switch))
    body['mtu'] = live['targetMtu']
    authorize()
    mark_attempt()
    reference, _, _ = pc.exchange('PUT', uplink.SWITCHES + '/' + switch['extId'], body, live['switch']['etag'])
    if sleep is None:
        sleep = uplink.time.sleep
    uplink.wait_task(pc, reference, emit, cancelled, sleep)
    observed = uplink.collect(live['intent']['connection'], pc, pe, include_nic_mtu=True)
    updated = observed['source']['config']
    if switch_identity(updated) != switch_identity(switch) or updated['mtu'] != live['targetMtu']:
        raise uplink.MigrationError('Switch settings or MTU did not verify after the Prism task.')
    verified = []
    try:
        for before, after in zip(live['hosts'], host_evidence(observed), strict=True):
            if before['hostId'] != after['hostId'] or before['serial'] != after['serial']:
                raise uplink.MigrationError('Host identity changed during verification.')
            matches = all(nic['mtu'] == live['targetMtu'] for nic in after['uplinks'])
            verified.append({**after, 'verified': matches})
    finally:
        report(verified)
    if not all(host['verified'] for host in verified):
        raise uplink.MigrationError('One or more hosts did not report the requested uplink MTU.')
    emit('Prism switch and physical uplink MTU verified. Confirm end-to-end VLAN traffic separately.')
