"""Approval-bound cluster-wide software DARE with Native KMS (Local)."""
import datetime
import json
import os
import re
import threading
import time

from ahv_uplink_migration import clients, connection, member, wait_task
from pc_unregistration import cluster_uuid

WORKFLOW = 'enable-dare'
FILENAME = 'enable-dare.yml'
LOCK = threading.Lock()
CLUSTERS = '/api/clustermgmt/v4.3/config/clusters'
CONFIG_TYPE = 'clustermgmt.v4.config.EncryptionConfig'
KMS_SPEC_TYPE = 'clustermgmt.v4.config.KmsSpec'
DESIRED = {'type': 'SOFTWARE', 'scope': 'CLUSTER', 'kmsType': 'NATIVE_LOCAL'}
MAX_CONTENT = 16384


class DareError(ValueError):
    pass


def writes_enabled():
    return os.environ.get('ZTF_DARE_ENABLE_MUTATION', '').lower() == 'true'


def intent(value):
    if not isinstance(value, dict) or set(value) != {'connection', 'review', 'recoveryReference'}:
        raise DareError('Provide the target and all key recovery and change-control attestations.')
    review = value['review']
    attestations = {'license', 'keyManager', 'backup', 'irreversible', 'prismState'}
    if not isinstance(review, dict) or set(review) != attestations or any(v is not True for v in review.values()):
        raise DareError('Confirm licensing, KMS prerequisites, the backup plan and the current Prism settings.')
    reference = value['recoveryReference']
    if not isinstance(reference, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,79}', reference):
        raise DareError('Use a change-ticket or runbook ID only. Key material must stay in the approved secure store.')
    return {'connection': connection(value['connection']), 'review': dict(review), 'recoveryReference': reference}


def good(obj):
    return member(obj.get('health_summary')).get('health_status') == 'Good'


def cluster_details(target, pc, pe):
    identity = target['cluster_uuid']
    cluster, _, _ = pc.exchange('GET', CLUSTERS + '/' + identity)
    local = pe.request('GET', '/api/nutanix/v2.0/cluster/')
    name = member(cluster).get('name')
    if (not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_. -]{0,127}', name)
            or cluster_uuid(cluster.get('extId')) != identity or cluster_uuid(local.get('uuid')) != identity
            or local.get('name') != name):
        raise DareError('Prism Central and Prism Element do not agree on the target cluster identity.')
    if not good(local):
        raise DareError('Prism Element does not report Good cluster health.')
    pe_hosts = pe.request('GET', '/api/nutanix/v2.0/hosts/')
    entries = pe_hosts.get('entities')
    if (not isinstance(entries, list) or len(entries) < 3
            or member(pe_hosts.get('metadata')).get('grand_total_entities') != len(entries)
            or any(not isinstance(row, dict) or not good(row) for row in entries)):
        raise DareError('Native KMS (Local) requires at least three healthy hosts and a complete PE inventory.')
    serials = [row.get('serial') for row in entries]
    if (any(not isinstance(serial, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', serial) for serial in serials)
            or len(set(serials)) != len(serials)):
        raise DareError('PE host serials are incomplete or ambiguous.')
    hosts = pc.rows(CLUSTERS + '/' + identity + '/hosts')
    if (len(hosts) != len(serials) or {row.get('nodeSerial') for row in hosts} != set(serials)
            or any(member(row.get('hypervisor')).get('type') != 'AHV' for row in hosts)):
        raise DareError('PC inventory must confirm the same AHV hosts as Prism Element.')
    version = local.get('version')
    if not isinstance(version, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,100}', version):
        raise DareError('Prism Element did not report an AOS version.')
    return {'name': name, 'uuid': identity, 'aosVersion': version, 'hostSerials': sorted(serials)}


def backup_time(value):
    if not isinstance(value, str) or len(value) > 40:
        return None
    try:
        parsed = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None or parsed.year < 2000:
            return None
        return parsed.astimezone(datetime.timezone.utc).isoformat()
    except ValueError:
        return None


def encryption_state(identity, pc):
    data, etag, _ = pc.exchange('GET', CLUSTERS + '/' + identity + '/encryption-config')
    if not isinstance(data, dict) or data.get('$objectType') != CONFIG_TYPE or data.get('$unknownFields'):
        raise DareError('Encryption state is unsupported or ambiguous. Verify it in Prism; no write is allowed.')
    if set(data) - {'$objectType', '$reserved', '$unknownFields', 'type', 'scope', 'kmsSpec',
                    'lastKeyGenTime', 'lastKeyBackupTime'}:
        raise DareError('Unexpected encryption configuration fields. Verify the target contract before proceeding.')
    kms = member(data.get('kmsSpec'))
    config = {'type': data.get('type'), 'scope': data.get('scope'), 'kmsType': kms.get('kmsType')}
    # This typed API representation needs hardware validation. HTTP errors and
    # missing, redacted or partial responses never imply an unencrypted cluster.
    if all(data.get(field) is None for field in ('type', 'scope', 'kmsSpec', 'lastKeyGenTime', 'lastKeyBackupTime')):
        if not isinstance(etag, str) or not re.fullmatch(r'"[!#-~]{1,254}"', etag):
            raise DareError('The unconfigured encryption response has no strong revision token. Automation is blocked.')
        return {'state': 'unconfigured', 'config': config, 'etag': etag, 'lastKeyBackupAt': None}
    if (config == DESIRED and kms.get('$objectType') == KMS_SPEC_TYPE
            and not kms.get('$unknownFields') and kms.get('externalKmsExtIds') in (None, [])
            and not set(kms) - {'$objectType', '$reserved', '$unknownFields', 'kmsType', 'externalKmsExtIds'}):
        return {'state': 'already_configured', 'config': config, 'etag': None,
                'lastKeyBackupAt': backup_time(data.get('lastKeyBackupTime'))}
    raise DareError('Existing, partial or different encryption settings need manual review. This workflow never converts them.')


def inspect(target, resolver):
    target = connection(target)
    pc, pe = clients(target, resolver)
    cluster = cluster_details(target, pc, pe)
    state = encryption_state(cluster['uuid'], pc)
    return {'cluster': cluster, 'state': state['state'], 'lastKeyBackupAt': state['lastKeyBackupAt']}


def preflight(data, resolver):
    planned = intent(data)
    target = planned['connection']
    pc, pe = clients(target, resolver)
    cluster = cluster_details(target, pc, pe)
    state = encryption_state(cluster['uuid'], pc)
    return {'intent': planned, 'cluster': cluster, 'encryption': state, 'desired': dict(DESIRED)}


def parse_plan(content):
    if not isinstance(content, str) or not content or len(content) > MAX_CONTENT:
        raise DareError('Provide the complete reviewed encryption plan.')
    try:
        plan = json.loads(content)
    except (ValueError, RecursionError):
        raise DareError('The reviewed encryption plan is invalid.') from None
    if not isinstance(plan, dict) or set(plan) != {'intent', 'cluster', 'encryption', 'desired'} or plan['desired'] != DESIRED:
        raise DareError('The reviewed encryption plan is invalid.')
    if not isinstance(plan['cluster'], dict) or not isinstance(plan['encryption'], dict):
        raise DareError('Preflight evidence is incomplete.')
    if intent(plan['intent']) != plan['intent']:
        raise DareError('The target identity must match the canonical reviewed plan.')
    return plan


def execute(plan, resolver, authorize, cancelled, emit, sleep=time.sleep):
    if cancelled():
        raise DareError('Cancelled before encryption enablement.')
    target = plan['intent']['connection']
    pc, pe = clients(target, resolver)
    cluster = cluster_details(target, pc, pe)
    identity = cluster['uuid']
    if cluster != plan['cluster']:
        raise DareError('The cluster identity, AOS version or host membership changed. Run preflight again.')
    state = encryption_state(identity, pc)
    if state['state'] == 'already_configured':
        emit('The approved encryption configuration is already present. No change was submitted.')
        return {'encryptionState': 'already_configured', 'backgroundStatus': 'unreported', 'lastKeyBackupAt': state['lastKeyBackupAt']}
    if state != plan['encryption']:
        raise DareError('Encryption state changed after review. Run preflight again.')
    authorize()
    emit('Submitting cluster-wide software encryption with Native KMS (Local).')
    payload = {'$objectType': CONFIG_TYPE, 'type': 'SOFTWARE', 'scope': 'CLUSTER',
               'kmsSpec': {'$objectType': KMS_SPEC_TYPE, 'kmsType': 'NATIVE_LOCAL'}}
    reference, _, _ = pc.exchange('PUT', CLUSTERS + '/' + identity + '/encryption-config', payload, state['etag'])
    wait_task(pc, reference, emit, cancelled, sleep)
    for _ in range(15):
        if cancelled():
            raise DareError('Verification was interrupted. Check the existing Prism task before retrying.')
        actual = encryption_state(identity, pc)
        if actual['state'] == 'already_configured':
            if cluster_details(target, pc, pe) != cluster:
                raise DareError('Target identity or membership changed after the Prism task.')
            emit('Encryption configuration verified. Check background encryption and secure key backup in Prism.')
            return {'encryptionState': 'enabled', 'backgroundStatus': 'unreported', 'lastKeyBackupAt': actual['lastKeyBackupAt']}
        sleep(2)
    raise DareError('The Prism task succeeded, but encryption could not be verified. Reconcile in Prism before retrying.')
