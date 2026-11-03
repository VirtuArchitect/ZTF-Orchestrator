"""Additive operator records and explicit read-only PE observations.

No execution, credential mutation or changes to saved automation. Coordination
uses the application's existing single-process lock and generic document store.
"""
from copy import deepcopy
from datetime import datetime, timezone
import re
import uuid

from flask import jsonify, request
from prism_drift import endpoint
from upgrade_inventory import read


def now():
    return datetime.now(timezone.utc).isoformat()


def bounded(value, title, limit=128, optional=False):
    if not isinstance(value, str) or len(value) > limit or any(ord(c) < 32 for c in value):
        raise ValueError(f'{title} must be bounded text without control characters')
    value = value.strip()
    if not value and not optional:
        raise ValueError(f'{title} is required')
    return value


def empty():
    return {'version': 1, 'revision': 0, 'clusters': [], 'attention': {}}


def age_seconds(value):
    try:
        return (datetime.now(timezone.utc) - datetime.fromisoformat(value)).total_seconds()
    except (ValueError, TypeError):
        return None


def validate_cluster(data):
    fields = {'name', 'datacenter', 'peEndpoint', 'peCredential', 'expectedUuid',
              'expectedNodes', 'configFiles', 'pipelineId', 'recoveryProfileId', 'owner'}
    if not isinstance(data, dict) or set(data) - fields:
        raise ValueError('Use cluster identity, reference and ownership fields only; never secret values')
    result = {key: bounded(data.get(key, ''), key, 128, key not in {'name', 'peEndpoint'})
              for key in fields - {'expectedNodes', 'configFiles', 'peEndpoint'}}
    result['peEndpoint'] = endpoint(bounded(data.get('peEndpoint'), 'PE endpoint', 300))
    if result['expectedUuid']:
        try:
            result['expectedUuid'] = str(uuid.UUID(result['expectedUuid']))
        except (ValueError, AttributeError):
            raise ValueError('Expected cluster UUID must be a UUID obtained independently from PE') from None
    for key in ('pipelineId', 'recoveryProfileId'):
        if result[key] and not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', result[key]):
            raise ValueError('Invalid linked record ID')
    configs = data.get('configFiles', [])
    if not isinstance(configs, list) or len(configs) > 100:
        raise ValueError('Select at most 100 saved configuration filenames')
    result['configFiles'] = []
    for value in configs:
        value = bounded(value, 'Configuration filename', 255)
        if '/' in value or '\\' in value or not value.endswith(('.yml', '.yaml', '.json')):
            raise ValueError('Use saved configuration filenames, without paths')
        if value in result['configFiles']:
            raise ValueError('Duplicate configuration filename')
        result['configFiles'].append(value)
    nodes = data.get('expectedNodes', [])
    if not isinstance(nodes, list) or len(nodes) > 256:
        raise ValueError('Expected nodes must be a list of at most 256 entries')
    result['expectedNodes'] = []
    import ipaddress
    for node in nodes:
        if not isinstance(node, dict) or set(node) != {'serial', 'hostIp', 'cvmIp'}:
            raise ValueError('Each expected node requires serial, hostIp and cvmIp')
        entry = {k: bounded(v, k) for k, v in node.items()}
        for key in ('hostIp', 'cvmIp'):
            try:
                entry[key] = str(ipaddress.ip_address(entry[key]))
            except ValueError:
                raise ValueError('Expected AHV/CVM addresses must be IP addresses') from None
        result['expectedNodes'].append(entry)
    serials = [n['serial'] for n in result['expectedNodes']]
    addresses = [n[k] for n in result['expectedNodes'] for k in ('hostIp', 'cvmIp')]
    if len(set(serials)) != len(serials) or len(set(addresses)) != len(addresses):
        raise ValueError('Expected node serials and AHV/CVM addresses must be unique')
    return result


def collect_health(record, lookup):
    """Two fixed GETs; HTTPS identity verification is mandatory, with no bypass."""
    checks = []
    result = {'collectedAt': now(), 'status': 'unknown', 'checks': checks,
              'source': 'verified-https-pe-readback', 'message': 'Expected UUID, credential and complete node baseline are required.'}
    if not record['expectedUuid'] or not record['peCredential'] or not record['expectedNodes']:
        return result
    try:
        cluster = read(record['peEndpoint'], record['peCredential'],
                       '/PrismGateway/services/rest/v2.0/cluster/?include_health_summary=true', lookup)
        hosts = read(record['peEndpoint'], record['peCredential'],
                     '/PrismGateway/services/rest/v2.0/hosts/?include_health_summary=true', lookup)
        if not isinstance(cluster, dict) or not isinstance(hosts, dict):
            raise ValueError('Unsupported readback')
        def check(name, passed):
            checks.append({'name': name, 'status': 'passed' if passed else 'unknown_or_failed'})
        identity = (cluster.get('uuid') == record['expectedUuid'] and cluster.get('name') == record['name'])
        check('Expected PE UUID and cluster name', identity)
        entities, meta = hosts.get('entities'), hosts.get('metadata')
        expected = record['expectedNodes']
        complete = (isinstance(entities, list) and isinstance(meta, dict)
                    and type(meta.get('grand_total_entities')) is int
                    and meta['grand_total_entities'] == len(entities) == len(expected)
                    and ('total_entities' not in meta or type(meta['total_entities']) is int)
                    and meta.get('total_entities', len(entities)) == len(entities)
                    and all(isinstance(n, dict) for n in entities))
        check('Complete expected host inventory', complete)
        matches = False
        if complete:
            actual = {n.get('serial'): n for n in entities if isinstance(n.get('serial'), str)}
            matches = len(actual) == len(expected) and set(actual) == {n['serial'] for n in expected}
            if matches:
                matches = all(actual[n['serial']].get('hypervisor_address') == n['hostIp']
                              and actual[n['serial']].get('service_vmexternal_ip') == n['cvmIp'] for n in expected)
        check('Expected serials and AHV/CVM addresses', matches)
        def good(value):
            summary = value.get('health_summary')
            return isinstance(summary, dict) and summary.get('health_status') == 'Good'
        check('PE-reported cluster health Good', good(cluster))
        check('PE-reported host health Good', complete and all(good(n) for n in entities))
        result['status'] = 'good' if all(c['status'] == 'passed' for c in checks) else 'unknown'
        reported = ([cluster.get('health_summary', {})] + [h.get('health_summary', {}) for h in entities]) if complete else []
        if identity and matches and any(isinstance(s, dict) and s.get('health_status') in ('Critical', 'Warning', 'Bad', 'Error') for s in reported):
            result['status'] = 'not_good'
        result['message'] = ('PE reports Good; expected identity and membership matched. This is not NCC or application acceptance.'
                             if result['status'] == 'good' else 'PE readback is incomplete or differs from the expected identity, membership or reported health.')
    except (ValueError, TypeError, KeyError, OSError):
        result['message'] = 'PE observation failed. Check the credential reference, certificate trust/SAN, connectivity and API compatibility.'
    result['completedAt'] = now()
    return result


class OperationsService:
    def __init__(self, services, lock):
        self.s, self.lock = services, lock
        self.collecting = set()

    def load(self):
        value = self.s['read']()
        if (not isinstance(value, dict) or set(value) != {'version', 'revision', 'clusters', 'attention'}
                or type(value.get('version')) is not int or value.get('version') != 1 or type(value.get('revision')) is not int or value['revision'] < 0
                or not isinstance(value['clusters'], list) or not isinstance(value['attention'], dict)):
            raise ValueError('Operational records are unreadable; reconcile storage before saving')
        # Fail closed on corrupted identity/reference records; never reset them.
        for row in value['clusters']:
            validate_cluster({k: v for k, v in row.items() if k not in {'id', 'updatedAt', 'createdAt', 'observation'}})
            if not isinstance(row.get('id'), str):
                raise ValueError('Invalid operational cluster record')
            observation = row.get('observation')
            if observation is not None and (not isinstance(observation, dict)
                    or observation.get('status') not in ('good', 'unknown', 'not_good')
                    or not isinstance(observation.get('collectedAt'), str)):
                raise ValueError('Operational observation is unreadable; reconcile storage before saving')
        for key, item in value['attention'].items():
            if (not isinstance(key, str) or not isinstance(item, dict) or item.get('id') != key
                    or item.get('status') not in ('open', 'acknowledged', 'resolved')
                    or any(not isinstance(item.get(k), str) for k in ('title', 'detail', 'owner', 'notes', 'updatedAt'))):
                raise ValueError('Operational attention records are unreadable; reconcile storage before saving')
        return value

    def save(self, state):
        state['revision'] += 1
        self.s['write'](state)

    def record(self, data, actor, identity=None):
        if not isinstance(data, dict) or type(data.get('revision')) is not int:
            raise ValueError('The current operations revision is required')
        proposed = validate_cluster({k: v for k, v in data.items() if k != 'revision'})
        # References must exist; do not resolve secrets or inspect YAML bodies.
        if any(not self.s['config_exists'](name) for name in proposed['configFiles']):
            raise ValueError('A linked configuration file is unavailable')
        if proposed['pipelineId'] and not self.s['pipeline'](proposed['pipelineId']):
            raise ValueError('The linked pipeline is unavailable')
        recovery = self.s['recovery']()
        if proposed['recoveryProfileId'] and not any(p['id'] == proposed['recoveryProfileId'] for p in recovery['profiles']):
            raise ValueError('The linked recovery profile is unavailable')
        with self.lock:
            state = self.load()
            if data['revision'] != state['revision']:
                return {'error': 'Operational records changed. Reload before saving.'}, 409
            old = next((r for r in state['clusters'] if r['id'] == identity), None)
            if identity and not old:
                return {'error': 'Cluster record not found'}, 404
            if any(r['id'] != identity and r['peEndpoint'] == proposed['peEndpoint'] for r in state['clusters']):
                raise ValueError('This PE endpoint already has an operational record')
            if proposed['expectedUuid'] and any(r['id'] != identity and r['expectedUuid'] == proposed['expectedUuid'] for r in state['clusters']):
                raise ValueError('This cluster UUID already has an operational record')
            if len(state['clusters']) >= 1000 and not old:
                raise ValueError('The managed-cluster record limit is 1000')
            row = {**proposed, 'id': identity or str(uuid.uuid4()), 'createdAt': old['createdAt'] if old else now(), 'updatedAt': now()}
            health_keys = ('name', 'peEndpoint', 'peCredential', 'expectedUuid', 'expectedNodes')
            if old and all(old[k] == row[k] for k in health_keys) and old.get('observation'):
                row['observation'] = old['observation']
            state['clusters'] = [r for r in state['clusters'] if r['id'] != identity] + [row]
            self.save(state)
            self.s['audit']('cluster_record_saved', actor, row['id'])
            return {'id': row['id'], 'revision': state['revision']}, 200

    def observe(self, identity, actor):
        with self.lock:
            state = self.load()
            row = next((r for r in state['clusters'] if r['id'] == identity), None)
            if not row:
                return {'error': 'Cluster record not found'}, 404
            if identity in self.collecting:
                return {'error': 'PE readback already in progress'}, 409
            snapshot = deepcopy(row)
            self.collecting.add(identity)
        try:
            observation = self.s['collect'](snapshot)
            with self.lock:
                state = self.load()
                row = next((r for r in state['clusters'] if r['id'] == identity), None)
                if row != snapshot:
                    return {'error': 'Cluster baseline changed during collection; result discarded.'}, 409
                row['observation'] = observation
                self.save(state)
                self.s['audit']('cluster_pe_readback', actor, identity)
                return observation, 200
        finally:
            with self.lock:
                self.collecting.discard(identity)

    def summary(self):
        jobs = self.s['jobs']()
        recovery = self.s['recovery']()
        with self.lock:
            state = self.load()
            changed = False
            sources = []
            for job in jobs:
                if job.get('status') not in ('failed', 'interrupted'):
                    continue
                identity = 'job-' + str(job['id'])
                sources.append({'id': identity, 'jobId': str(job['id']), 'title': 'Job requires review',
                                'detail': str(job.get('workflow') or 'Job')[:128], 'sourceVersion': str(job['id'])})
            for row in state['clusters']:
                observed = row.get('observation')
                age = age_seconds((observed or {}).get('collectedAt'))
                if observed and (observed.get('status') != 'good' or age is None or age < 0 or age > 900):
                    sources.append({'id': 'health-' + row['id'], 'clusterId': row['id'],
                                    'title': 'PE observation needs review', 'detail': row['name'],
                                    'sourceVersion': observed['collectedAt'] + ('-stale' if age is not None and age > 900 else '')})
            for run in recovery['runs']:
                if run.get('status') in ('needs_reconciliation', 'stopping'):
                    sources.append({'id': 'recovery-' + run['id'], 'recoveryRunId': run['id'],
                                    'title': 'Recovery requires reconciliation', 'detail': run.get('clusterName', '')[:128],
                                    'sourceVersion': run['updatedAt']})
            for source in sources:
                previous = state['attention'].get(source['id'])
                if not previous:
                    state['attention'][source['id']] = {**source, 'status': 'open', 'owner': '', 'notes': '',
                                                       'createdAt': now(), 'updatedAt': now()}
                    changed = True
                elif previous.get('sourceVersion') != source['sourceVersion']:
                    # A new failed observation is a new review obligation. A later
                    # successful collection never silently resolves an incident.
                    previous.update(source, status='open', updatedAt=now())
                    changed = True
            if changed and self.s.get('can_write', lambda: True)():
                self.save(state)
            view = deepcopy(state)
        for row in view['clusters']:
            age = age_seconds((row.get('observation') or {}).get('collectedAt'))
            row['observationFresh'] = age is not None and 0 <= age <= 900
        # No raw config, payload, target passwords or job log output is returned.
        view.update(collectedAt=now(), recoveryProfiles=recovery['profiles'], recoveryRuns=[{
            k: r.get(k) for k in ('id', 'profileId', 'clusterName', 'status', 'updatedAt', 'steps', 'deploymentJobId', 'currentJobId', 'healthEvidence')
        } for r in recovery['runs']], pipelines=[{'id': p['id'], 'name': p['name']} for p in self.s['pipelines']()])
        view['jobs'] = [{k: j.get(k) for k in ('id', 'workflow', 'status', 'createdAt', 'updatedAt', 'configFile')} for j in jobs]
        return view

    def attention(self, identity, data, actor):
        if not isinstance(data, dict) or set(data) != {'revision', 'status', 'owner', 'notes'}:
            raise ValueError('Use revision, status, owner and review notes')
        if data['status'] not in ('open', 'acknowledged', 'resolved'):
            raise ValueError('Invalid attention status')
        owner = bounded(data['owner'], 'Owner', optional=True)
        notes = bounded(data['notes'], 'Review notes', 2000, optional=data['status'] == 'open')
        if data['status'] == 'acknowledged' and not owner:
            raise ValueError('Acknowledgement requires an owner')
        with self.lock:
            state = self.load()
            if type(data['revision']) is not int or data['revision'] != state['revision']:
                return {'error': 'Operational records changed. Reload before saving.'}, 409
            item = state['attention'].get(identity)
            if not item:
                return {'error': 'Attention item not found'}, 404
            item.setdefault('reviews', []).append({'at': now(), 'actor': actor, 'status': data['status'], 'owner': owner, 'notes': notes})
            item['reviews'] = item['reviews'][-100:]
            item.update(status=data['status'], owner=owner, notes=notes, updatedAt=now(), updatedBy=actor)
            self.save(state)
            self.s['audit']('operations_attention_' + data['status'], actor, identity)
            return {'revision': state['revision']}, 200


def register_routes(app, service, require_role, limiter):
    def observe(data, actor, identity):
        if data is not None and data != {}:
            raise ValueError('PE health collection accepts no target overrides or TLS exceptions')
        return service.observe(identity, actor)
    def bind(path, methods, roles, action, limit):
        def call(**kwargs):
            try:
                value = action(request.get_json(silent=True), request.current_user['username'], **kwargs)
                if isinstance(value, tuple):
                    return jsonify(value[0]), value[1]
                return jsonify(value)
            except ValueError as error:
                return jsonify({'error': str(error)}), 400
            except (OSError, UnicodeError, TypeError, KeyError):
                return jsonify({'error': 'Operational records unavailable; reconcile storage before continuing.'}), 503
        app.add_url_rule('/api/operations' + path, 'operations_' + path + methods[0],
                         require_role(*roles)(limiter.limit(limit)(call)), methods=methods)
    readers = ('admin', 'operator', 'viewer')
    bind('', ['GET'], readers, lambda d, u: service.summary(), '30 per minute')
    bind('/clusters', ['POST'], ('admin',), lambda d, u: service.record(d, u), '10 per minute')
    bind('/clusters/<identity>', ['PUT'], ('admin',), lambda d, u, identity: service.record(d, u, identity), '10 per minute')
    bind('/clusters/<identity>/health', ['POST'], ('admin', 'operator'), observe, '6 per minute')
    bind('/attention/<identity>', ['PUT'], ('admin', 'operator'), lambda d, u, identity: service.attention(identity, d, u), '20 per minute')
