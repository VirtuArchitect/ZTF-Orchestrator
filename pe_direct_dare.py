"""PE v2 software encryption with local KMS and no PC dependency."""
import time

from pe_direct import Client, DirectError, credential, inventory

STATE = '/data_at_rest_encryption'
KMS = '/key_management_servers/type'


def state(pe):
    kms = pe.request('GET', KMS)
    value = pe.request('GET', STATE)
    if kms.get('kms_type') != 'LKM':
        raise DirectError('PE must report Native KMS Local (LKM). Existing external or PC key managers are never converted.')
    if type(value.get('is_ready_for_software_encryption')) is not bool:
        raise DirectError('PE software encryption readiness is missing or unsupported.')
    if value.get('desired_password_protection') is not False:
        raise DirectError('Existing drive-based encryption or incomplete protection state needs independent review.')
    scope = value.get('software_encryption_scope')
    encrypted = value.get('storage_container_encryption_status')
    if not isinstance(encrypted, dict) or any(type(v) is not bool for v in encrypted.values()):
        raise DirectError('PE encryption readback is incomplete.')
    if scope == 'CLUSTER':
        status = 'already_configured'
    elif scope is None and value['is_ready_for_software_encryption'] and not any(encrypted.values()):
        status = 'unconfigured'
    else:
        raise DirectError('Existing, partial or unsupported PE encryption configuration needs independent review.')
    return {'state': status, 'lastKeyBackupAt': None, 'kmsType': 'LKM', 'scope': scope,
            'ready': value['is_ready_for_software_encryption'], 'containers': encrypted}


def observe(config, resolver):
    pe = Client(config, credential(config, resolver))
    cluster, _ = inventory(config, pe)
    return pe, cluster, state(pe)


def inspect(config, resolver):
    _, cluster, current = observe(config, resolver)
    return {'cluster': cluster, 'state': current['state'], 'lastKeyBackupAt': None}


def preflight(intent, resolver, desired):
    _, cluster, current = observe(intent['connection'], resolver)
    return {'intent': intent, 'cluster': cluster, 'encryption': current, 'desired': dict(desired)}


def execute(plan, resolver, authorize, cancelled, emit, sleep=time.sleep):
    if cancelled():
        raise DirectError('Cancelled before encryption enablement.')
    pe, cluster, current = observe(plan['intent']['connection'], resolver)
    if cluster != plan['cluster']:
        raise DirectError('PE cluster identity, version or host membership changed. Run preflight again.')
    if current['state'] == 'already_configured':
        emit('PE already reports cluster-wide software encryption with Local KMS. No mutation submitted.')
        return {'encryptionState': 'already_configured', 'backgroundStatus': 'unreported', 'lastKeyBackupAt': None}
    if current != plan['encryption']:
        raise DirectError('PE encryption state changed after approval. Run preflight again.')
    authorize()
    if cancelled():
        raise DirectError('Cancelled before encryption enablement.')
    emit('Submitting software encryption directly to PE with Local KMS. No automatic mutation retry.')
    result = pe.request('POST', STATE + '/enable', {'software_encryption_scope': 'CLUSTER', 'value': True})
    if result.get('value') is not True:
        raise DirectError('PE did not confirm the enable request. Reconcile encryption state before retrying.')
    for _ in range(30):
        if cancelled():
            raise DirectError('Encryption verification interrupted. Reconcile PE before retrying.')
        current = state(pe)
        actual, _ = inventory(plan['intent']['connection'], pe)
        if actual != cluster:
            raise DirectError('PE identity or membership changed during encryption verification.')
        if current['state'] == 'already_configured':
            complete = bool(current['containers']) and all(current['containers'].values())
            emit('PE cluster encryption configuration verified. Complete key backup and monitor background encryption in PE.')
            return {'encryptionState': 'enabled', 'backgroundStatus': 'unreported',
                    'containerReadback': 'all_enabled' if complete else 'incomplete_or_unreported',
                    'lastKeyBackupAt': None}
        sleep(2)
    raise DirectError('PE accepted enablement, but configuration did not verify. Reconcile before retrying.')
