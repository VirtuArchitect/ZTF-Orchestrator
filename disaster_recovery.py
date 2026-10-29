"""Versioned recovery intent and conservative coordination of existing jobs.

No deployment commands or credentials are implemented here. Execution delegates
to the existing authenticated submission path. A service restart never replays
imaging or configuration; an administrator must reconcile uncertain target state.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone, timedelta
import hashlib
import json
import re
import threading
import uuid
from urllib.parse import urlsplit

import yaml
from flask import jsonify, request


WORKFLOW = 'cluster-create-foundation-vm'
POST_ACTIONS = {'config-cluster', 'ChangeDefaultAdminPasswordPe', 'CreateLocalUsersPe'}
ACTIVE = {'submitting', 'deploying', 'awaiting_health_verification', 'ready_for_configuration',
          'configuring', 'awaiting_acceptance', 'needs_reconciliation', 'stopping'}
TERMINAL_JOBS = {'success', 'failed', 'cancelled', 'interrupted'}
PREREQUISITES = ('network', 'images', 'credentials', 'dnsNtp', 'backupAccess')


class RecoveryError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def required(value, label, limit=200):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise RecoveryError(f'{label} is required and must be at most {limit} characters')
    return value.strip()


def reference_only(content):
    if not isinstance(content, str) or len(content.encode('utf-8')) > 131072:
        raise RecoveryError('Configuration must be UTF-8 YAML smaller than 128 KiB')
    try:
        value = yaml.safe_load(content)
    except (yaml.YAMLError, RecursionError):
        raise RecoveryError('Configuration must contain valid YAML') from None
    seen = set()
    budget = [20000]

    def visit(item, depth=0):
        budget[0] -= 1
        if budget[0] < 0:
            raise RecoveryError('Configuration contains too many values')
        if depth > 30 or isinstance(item, (dict, list)) and id(item) in seen:
            raise RecoveryError('Recursive or excessively nested configuration is not supported')
        if isinstance(item, (dict, list)):
            seen.add(id(item))
        if isinstance(item, dict):
            for key, child in item.items():
                if not isinstance(key, str):
                    raise RecoveryError('Configuration keys must be strings')
                if re.search(r'password|secret|token|private.?key', key, re.I) and not isinstance(child, bool):
                    raise RecoveryError('Recovery baselines accept credential references, not literal secrets')
                visit(child, depth + 1)
        elif isinstance(item, list):
            for child in item:
                visit(child, depth + 1)
        elif isinstance(item, str):
            if re.search(r'-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----', item):
                raise RecoveryError('Recovery baselines must not contain private keys')
            if '://' in item or item.startswith('//'):
                try:
                    parsed = urlsplit(item)
                except ValueError:
                    raise RecoveryError('Configuration contains an invalid URL') from None
                if parsed.username is not None or parsed.password is not None:
                    raise RecoveryError('Recovery baselines must not contain URL credentials')
        elif item is not None and not isinstance(item, (str, bool, int, float)):
            raise RecoveryError('Unsupported YAML value')
        if isinstance(item, (dict, list)):
            seen.remove(id(item))

    visit(value)
    if not isinstance(value, dict):
        raise RecoveryError('Configuration must be a YAML mapping')
    return value


def pe_host(value):
    try:
        parsed = urlsplit(value if '://' in value else f'//{value}')
    except ValueError:
        raise RecoveryError('Invalid PE target identity') from None
    if parsed.username or parsed.password or not parsed.hostname:
        raise RecoveryError('Invalid PE target identity')
    return parsed.hostname.lower().rstrip('.')


class RecoveryService:
    def __init__(self, services, lock):
        self.s = services
        self.lock = lock
        self.stop_event = threading.Event()
        self.threads = []
        with lock:
            state = self.load()
            changed = False
            for run in state['runs']:
                if run['status'] in {'submitting', 'configuring', 'stopping'}:
                    run['status'] = 'needs_reconciliation'
                    self.event(run, 'Service restarted; inspect target state before continuing', 'system')
                    changed = True
            if changed:
                self.save(state)

    def load(self):
        state = self.s['read']()
        if not isinstance(state, dict) or any(not isinstance(state.get(k), list) for k in ('datacenters', 'profiles', 'runs')):
            raise RecoveryError('Recovery records are unreadable; restore or repair storage before execution', 503)
        for key in ('datacenters', 'profiles', 'runs'):
            state.setdefault(key, [])
        return state

    def shutdown(self):
        self.stop_event.set()
        for thread in self.threads:
            thread.join(timeout=2)

    def save(self, state):
        self.s['write'](state)

    @staticmethod
    def find(state, collection, identity):
        item = next((x for x in state[collection] if x['id'] == identity), None)
        if not item:
            raise RecoveryError('Recovery record not found', 404)
        return item

    @staticmethod
    def event(run, message, actor):
        run['updatedAt'] = now()
        run.setdefault('events', []).append({'at': now(), 'actor': actor, 'message': message})

    def audit(self, action, actor, identity):
        self.s['audit'](action, actor, identity)

    def refresh(self, run):
        if run['status'] != 'deploying':
            return
        job = self.s['job'](run.get('deploymentJobId', ''))
        if not job or job.get('status') in {'failed', 'cancelled', 'interrupted'}:
            run['status'] = 'needs_reconciliation'
            self.event(run, 'Deployment outcome requires target reconciliation', 'system')
        elif job.get('status') == 'success':
            run['status'] = 'awaiting_health_verification'
            self.event(run, 'Deployment job succeeded; independent PE health evidence is required', 'system')

    def public(self, run, detail=False):
        result = deepcopy(run)
        if not detail:
            result.pop('snapshot', None)
            result.pop('events', None)
        return result

    def overview(self):
        with self.lock:
            state = self.load()
            changed = False
            for run in state['runs']:
                previous = run['status']
                self.refresh(run)
                changed = changed or run['status'] != previous
            if changed:
                self.save(state)
            profiles = []
            for profile in state['profiles']:
                item = {k: deepcopy(v) for k, v in profile.items() if k != 'revisions'}
                item['revision'] = len(profile['revisions'])
                item['reviewed'] = bool(profile['revisions'] and profile['revisions'][-1].get('approvedBy'))
                item['drifted'] = False
                if item['reviewed']:
                    try:
                        self.check_drift(profile['revisions'][-1])
                        dc = self.find(state, 'datacenters', profile['datacenterId'])
                        item['drifted'] = dc['foundationEndpoint'] != profile['revisions'][-1]['foundationEndpoint']
                    except RecoveryError:
                        item['drifted'] = True
                item['lastRehearsal'] = next((r['updatedAt'] for r in reversed(state['runs'])
                                              if r['profileId'] == profile['id'] and r['mode'] == 'rehearsal'
                                              and r['status'] == 'accepted'), None)
                profiles.append(item)
            return {'datacenters': state['datacenters'], 'profiles': profiles,
                    'runs': [self.public(r) for r in reversed(state['runs'])],
                    'prerequisiteKeys': list(PREREQUISITES)}

    def datacenter(self, data, actor, identity=None):
        name = required(data.get('name'), 'Datacenter name', 100)
        endpoint = self.s['endpoint_text'](required(data.get('foundationEndpoint'), 'Foundation endpoint'))
        checks = data.get('prerequisites', {})
        if not isinstance(checks, dict) or any(checks.get(k, 'needs_review') not in ('reviewed', 'needs_review') for k in PREREQUISITES):
            raise RecoveryError('Prerequisites must be reviewed or needs_review')
        notes = required(data.get('notes'), 'Datacenter recovery notes', 2000)
        with self.lock:
            state = self.load()
            if identity:
                item = self.find(state, 'datacenters', identity)
                if any(r['datacenterId'] == identity and r['status'] in ACTIVE for r in state['runs']):
                    raise RecoveryError('Datacenter has an active or unreconciled recovery run', 409)
            else:
                item = {'id': str(uuid.uuid4()), 'createdAt': now()}
                state['datacenters'].append(item)
            item.update(name=name, foundationEndpoint=endpoint, notes=notes,
                        prerequisites={k: checks.get(k, 'needs_review') for k in PREREQUISITES},
                        updatedAt=now(), updatedBy=actor)
            self.save(state)
            self.audit('datacenter_saved', actor, item['id'])
            return deepcopy(item)

    def profile(self, data, actor, identity=None):
        name = required(data.get('name'), 'Recovery profile name', 100)
        if data.get('kind', 'existing') not in ('new', 'existing'):
            raise RecoveryError('Cluster kind must be new or existing')
        with self.lock:
            state = self.load()
            dc = self.find(state, 'datacenters', data.get('datacenterId'))
            if identity:
                item = self.find(state, 'profiles', identity)
                if any(r['profileId'] == identity and r['status'] in ACTIVE for r in state['runs']):
                    raise RecoveryError('Profile has an active or unreconciled run', 409)
            else:
                item = {'id': str(uuid.uuid4()), 'revisions': [], 'createdAt': now()}
                state['profiles'].append(item)
            content = self.s['config'](required(data.get('deploymentConfigFile'), 'Deployment config file'))
            config = reference_only(content)
            errors = self.s['validate_foundation'](config)
            if errors:
                raise RecoveryError('Foundation configuration is incomplete or invalid; validate it in the Foundation VM workflow')
            clusters = config.get('create_clusters') or []
            if len(clusters) != 1:
                raise RecoveryError('Each recovery profile must describe exactly one cluster')
            if self.s['endpoint_config'](config) != dc['foundationEndpoint']:
                raise RecoveryError('Deployment endpoint must match the datacenter Foundation endpoint')
            cluster = clusters[0]
            required(cluster.get('cluster_name'), 'Cluster name', 100)
            required(cluster.get('cluster_vip'), 'Cluster VIP')
            if cluster.get('skip_cluster_creation'):
                raise RecoveryError('Recovery profiles require cluster formation, not imaging-only intent')
            pipeline = self.s['pipeline'](required(data.get('pipelineId'), 'Post-configuration pipeline'))
            if not pipeline or not pipeline.get('steps') or len(pipeline['steps']) > 30:
                raise RecoveryError('Select a saved pipeline with 1-30 post-configuration steps')
            steps = []
            for step in pipeline['steps']:
                if step.get('workflow') not in POST_ACTIONS:
                    raise RecoveryError('Recovery post-configuration supports Configure Cluster and the PE admin scripts only')
                file = required(step.get('configFile'), 'Pipeline config file')
                text = self.s['config'](file)
                parsed = reference_only(text)
                targets = parsed.get('clusters')
                if not isinstance(targets, dict) or len(targets) != 1 or pe_host(next(iter(targets))) != pe_host(cluster['cluster_vip']):
                    raise RecoveryError('Every pipeline file must target only the recovery cluster VIP')
                target = next(iter(targets.values()))
                if not isinstance(target, dict) or target.get('name') != cluster['cluster_name']:
                    raise RecoveryError('Every pipeline file must name the recovery cluster')
                steps.append({'workflow': step['workflow'], 'configFile': file, 'configContent': text, 'sha256': digest(text)})
            snapshot = {'deploymentConfigFile': data['deploymentConfigFile'], 'deploymentContent': content,
                        'foundationEndpoint': dc['foundationEndpoint'], 'pipelineId': pipeline['id'],
                        'pipelineName': pipeline['name'], 'steps': steps,
                        'clusterName': cluster['cluster_name'], 'clusterVip': cluster['cluster_vip'],
                        'targets': sorted(n['node_serial'] for n in cluster['nodes_list']),
                        'createdAt': now(), 'createdBy': actor}
            if data.get('observedConfigFile'):
                observed = self.s['config'](required(data['observedConfigFile'], 'Observed config file'))
                reference_only(observed)
                snapshot['observation'] = {'source': 'operator-import-not-live-discovery', 'at': now(),
                    'configFile': data['observedConfigFile'], 'sha256': digest(observed), 'content': observed}
            snapshot['sha256'] = digest(json.dumps(snapshot, sort_keys=True))
            snapshot['revision'] = len(item['revisions']) + 1
            item.update(name=name, kind=data.get('kind', 'existing'), datacenterId=dc['id'],
                        deploymentConfigFile=data['deploymentConfigFile'], pipelineId=pipeline['id'], updatedAt=now())
            item['revisions'].append(snapshot)
            self.save(state)
            self.audit('profile_revision_saved', actor, item['id'])
            return deepcopy(item)

    def detail_profile(self, identity):
        with self.lock:
            return deepcopy(self.find(self.load(), 'profiles', identity))

    def approve(self, identity, actor, data):
        with self.lock:
            state = self.load()
            profile = self.find(state, 'profiles', identity)
            revision = profile['revisions'][-1]
            if data.get('sha256') != revision['sha256']:
                raise RecoveryError('Review hash does not match the current revision', 409)
            revision.update(approvedBy=actor, approvedAt=now(), reviewNotes=required(data.get('notes'), 'Baseline review notes', 2000))
            self.save(state)
            self.audit('baseline_reviewed', actor, identity)
            return deepcopy(revision)

    def prepare(self, data, actor):
        with self.lock:
            state = self.load()
            profile = self.find(state, 'profiles', data.get('profileId'))
            revision = profile['revisions'][-1]
            if not revision.get('approvedBy') or data.get('sha256') != revision['sha256']:
                raise RecoveryError('Review and approve the current baseline before preparing a run', 409)
            dc = self.find(state, 'datacenters', profile['datacenterId'])
            if any(dc['prerequisites'].get(k) != 'reviewed' for k in PREREQUISITES):
                raise RecoveryError('Review every datacenter prerequisite first', 409)
            if dc['foundationEndpoint'] != revision['foundationEndpoint']:
                raise RecoveryError('Foundation endpoint changed; capture and review a new baseline', 409)
            self.check_drift(revision)
            if data.get('mode') not in ('recovery', 'rehearsal'):
                raise RecoveryError('Select recovery or rehearsal; both execute real changes')
            run = {'id': str(uuid.uuid4()), 'profileId': profile['id'], 'profileName': profile['name'],
                   'datacenterId': dc['id'], 'mode': data['mode'], 'status': 'prepared', 'createdBy': actor,
                   'createdAt': now(), 'updatedAt': now(), 'snapshot': deepcopy(revision),
                   'revision': revision['revision'], 'baselineSha256': revision['sha256'],
                   'clusterName': revision['clusterName'], 'clusterVip': revision['clusterVip'],
                   'foundationEndpoint': revision['foundationEndpoint'], 'steps': [], 'events': []}
            self.event(run, 'Prepared immutable execution snapshot; nothing has executed', actor)
            state['runs'].append(run)
            self.save(state)
            self.audit('run_prepared', actor, run['id'])
            return self.public(run, True)

    def check_drift(self, snapshot):
        if self.s['config'](snapshot['deploymentConfigFile']) != snapshot['deploymentContent']:
            raise RecoveryError('Deployment file changed; capture and review a new baseline', 409)
        pipeline = self.s['pipeline'](snapshot['pipelineId'])
        expected = [{'workflow': x['workflow'], 'configFile': x['configFile']} for x in snapshot['steps']]
        if not pipeline or pipeline.get('steps') != expected:
            raise RecoveryError('Pipeline changed; capture and review a new baseline', 409)
        for step in snapshot['steps']:
            if self.s['config'](step['configFile']) != step['configContent']:
                raise RecoveryError('Pipeline file changed; capture and review a new baseline', 409)

    def detail_run(self, identity):
        with self.lock:
            state = self.load()
            run = self.find(state, 'runs', identity)
            previous = run['status']
            self.refresh(run)
            if run['status'] != previous:
                self.save(state)
            return self.public(run, True)

    @staticmethod
    def deployment_file(run):
        return f'dr-{run["id"]}-deploy.yml'

    def request_approval(self, identity, actor, authorization):
        with self.lock:
            state = self.load()
            run = self.find(state, 'runs', identity)
            if run['status'] != 'prepared':
                raise RecoveryError('Only a prepared run may request deployment approval', 409)
            approval = self.s['request_approval']({'workflow': WORKFLOW, 'configFile': self.deployment_file(run),
                        'configContent': run['snapshot']['deploymentContent'],
                        'notes': f'Recovery run {run["id"]}; baseline {run["baselineSha256"]}',
                        'metadata': {'recoveryRunId': run['id'], 'baselineSha256': run['baselineSha256']}}, authorization)
            run['approvalId'] = approval['id']
            self.event(run, 'Requested exact-content destructive deployment approval', actor)
            self.save(state)
            return approval

    def foundation_guard(self, config, owner=''):
        """Called inside the existing queue lock for every Foundation submission."""
        endpoint = self.s['endpoint_config'](config)
        serials = {n.get('node_serial') for c in config.get('create_clusters', []) for n in c.get('nodes_list', [])}
        for run in self.load()['runs']:
            if run['id'] != owner and run['status'] in ACTIVE:
                if endpoint == run['foundationEndpoint'] or serials.intersection(run['snapshot']['targets']):
                    raise RecoveryError('A recovery run owns this Foundation endpoint or node set; reconcile or complete it first', 409)
        for job in self.s['jobs']():
            if job.get('workflow') != WORKFLOW or job.get('status') not in {'queued', 'running', 'cancelling'}:
                continue
            payload = self.s['payload'](job['id']) or {}
            parsed = reference_only(payload.get('configContent') or '')
            other = {n.get('node_serial') for c in parsed.get('create_clusters', []) for n in c.get('nodes_list', [])}
            if endpoint == self.s['endpoint_config'](parsed) or serials.intersection(other):
                raise RecoveryError('Foundation endpoint or node set already has an active deployment', 409)

    def deploy(self, identity, actor, data, authorization):
        with self.lock:
            state = self.load()
            run = self.find(state, 'runs', identity)
            if run['status'] != 'prepared':
                raise RecoveryError('This run has already been submitted or requires reconciliation', 409)
            if data.get('targetConfirmation') != f'REFOUNDATION {run["clusterName"]}' or data.get('riskAcknowledged') is not True:
                raise RecoveryError('Explicit target and destructive re-foundation acknowledgement are required', 403)
            if data.get('destructiveConfirmation') != 'DEPLOY FOUNDATION VM':
                raise RecoveryError('Foundation confirmation must exactly match DEPLOY FOUNDATION VM', 403)
            self.check_drift(run['snapshot'])
            dc = self.find(state, 'datacenters', run['datacenterId'])
            if dc['foundationEndpoint'] != run['foundationEndpoint'] or any(dc['prerequisites'].get(k) != 'reviewed' for k in PREREQUISITES):
                raise RecoveryError('Datacenter prerequisites or endpoint changed; prepare a new reviewed run', 409)
            approval_id = required(data.get('approvalId') or run.get('approvalId'), 'Deployment approval')
            self.s['verify_approval'](approval_id, self.deployment_file(run), run['snapshot']['deploymentContent'])
            self.foundation_guard(reference_only(run['snapshot']['deploymentContent']), run['id'])
            run['status'] = 'submitting'
            self.save(state)  # Persist intent before touching the existing submission path.
            try:
                job = self.s['submit']({'workflow': WORKFLOW, 'configFile': self.deployment_file(run),
                    'configContent': run['snapshot']['deploymentContent'], 'approvalId': approval_id,
                    'destructiveConfirmation': 'DEPLOY FOUNDATION VM'}, authorization, run['id'])
                run['deploymentJobId'] = job['id']
                # Recovery always consumes approval, even when the general
                # workflow approval policy is disabled.
                self.s['link_approval'](approval_id, job['id'])
            except Exception:
                run['status'] = 'needs_reconciliation'
                self.event(run, 'Submission did not complete; inspect Jobs and Foundation before retry', actor)
                self.save(state)
                raise
            run.update(deploymentJobId=job['id'], status='deploying', approvalId=approval_id)
            self.event(run, f'Submitted Foundation deployment job {job["id"]}', actor)
            self.save(state)
            self.audit('deployment_submitted', actor, identity)
            return self.public(run, True)

    def attest_health(self, identity, actor, data):
        with self.lock:
            state = self.load()
            run = self.find(state, 'runs', identity)
            self.refresh(run)
            if run['status'] not in {'awaiting_health_verification', 'ready_for_configuration'}:
                raise RecoveryError('Successful deployment is required before health verification', 409)
            if data.get('clusterIdentity') != run['clusterName'] or data.get('membershipVerified') is not True or data.get('servicesHealthy') is not True:
                raise RecoveryError('Confirm exact cluster identity, expected membership and healthy services')
            run['healthEvidence'] = {'source': 'independent-operator-attestation', 'by': actor, 'at': now(),
                'notes': required(data.get('notes'), 'PE health readback notes', 2000),
                'reference': required(data.get('evidenceRef'), 'Evidence reference', 500),
                'clusterIdentity': run['clusterName'], 'deploymentJobId': run['deploymentJobId']}
            run['status'] = 'ready_for_configuration'
            self.event(run, 'Administrator recorded independent PE health evidence', actor)
            self.save(state)
            self.audit('health_attested', actor, identity)
            return self.public(run, True)

    def check_health(self, run):
        evidence = run.get('healthEvidence') or {}
        if not evidence.get('at') or datetime.now(timezone.utc) - datetime.fromisoformat(evidence['at']) > timedelta(minutes=15):
            raise RecoveryError('PE health evidence is older than 15 minutes; refresh it before starting configuration', 409)

    def start_configuration(self, identity, actor, data, authorization):
        with self.lock:
            state = self.load()
            run = self.find(state, 'runs', identity)
            if run['status'] != 'ready_for_configuration':
                raise RecoveryError('Verify cluster health before running post-configuration', 409)
            self.check_health(run)
            for step in run['snapshot']['steps'][len(run['steps']):]:
                error = self.s['step_error'](step)
                if error:
                    raise RecoveryError(f'Use the existing approved direct-job path for this step: {error}', 403)
            scripts = list(dict.fromkeys(x['workflow'] for x in run['snapshot']['steps'] if x['workflow'] != 'config-cluster'))
            if scripts and (data.get('riskAcknowledged') is not True or data.get('destructiveConfirmation') != f'RUN {",".join(scripts)}'):
                raise RecoveryError(f'PE administration confirmation must exactly match RUN {",".join(scripts)}', 403)
            run['status'] = 'configuring'
            self.event(run, 'Starting sequential configuration using immutable reviewed snapshots', actor)
            self.save(state)
            # Authorization exists only in this thread's memory, never in stored records.
            thread = threading.Thread(target=self._configure, args=(identity, actor, authorization), daemon=True)
            self.threads.append(thread)
            thread.start()
            self.audit('configuration_started', actor, identity)
            return self.public(run, True)

    def _configure(self, identity, actor, authorization):
        try:
            while not self.stop_event.is_set():
                with self.lock:
                    state = self.load()
                    run = self.find(state, 'runs', identity)
                    if run['status'] != 'configuring':
                        return
                    index = len(run['steps'])
                    if index == len(run['snapshot']['steps']):
                        run['status'] = 'awaiting_acceptance'
                        self.event(run, 'Configuration jobs succeeded; independent final acceptance is required', actor)
                        self.save(state)
                        return
                    step = run['snapshot']['steps'][index]
                    error = self.s['step_error'](step)
                    if error:
                        raise RecoveryError('Approval policy changed; use the approved direct-job path', 403)
                    action = step['workflow']
                    payload = {'configContent': step['configContent'], 'configFile': f'dr-{identity}-step-{index+1}.yml'}
                    payload.update({'workflow': action} if action == 'config-cluster' else
                                   {'script': action, 'riskAcknowledged': True, 'destructiveConfirmation': f'RUN {action}'})
                    job = self.s['submit'](payload, authorization, identity)
                    run['currentJobId'] = job['id']
                    self.event(run, f'Configuration step {index+1} submitted as job {job["id"]}', actor)
                    self.save(state)
                while not self.stop_event.wait(1):
                    current = self.s['job'](job['id'])
                    if not current or current.get('status') in TERMINAL_JOBS:
                        break
                if self.stop_event.is_set():
                    return
                with self.lock:
                    state = self.load()
                    run = self.find(state, 'runs', identity)
                    if run['status'] != 'configuring':
                        return
                    if not current or current['status'] != 'success':
                        raise RecoveryError('Configuration failed or was interrupted; inspect target state')
                    run['steps'].append({'index': index, 'workflow': action, 'jobId': job['id'], 'status': 'success', 'sha256': step['sha256']})
                    self.save(state)
        except Exception:
            if self.stop_event.is_set():
                return
            with self.lock:
                state = self.load()
                run = self.find(state, 'runs', identity)
                run['status'] = 'needs_reconciliation'
                self.event(run, 'Configuration stopped; inspect Jobs and actual settings before continuing', actor)
                self.save(state)

    def link_configuration_job(self, identity, actor, data):
        """Record the existing direct approved-job path without bypassing policy."""
        with self.lock:
            state = self.load()
            run = self.find(state, 'runs', identity)
            if run['status'] != 'ready_for_configuration':
                raise RecoveryError('Health verification or reconciliation is required first', 409)
            index = len(run['steps'])
            if index >= len(run['snapshot']['steps']):
                raise RecoveryError('All configuration steps are already recorded', 409)
            step = run['snapshot']['steps'][index]
            job_id = required(data.get('jobId'), 'Successful direct job ID')
            if any(s.get('jobId') == job_id for s in run['steps']):
                raise RecoveryError('This execution job is already linked to a recovery step', 409)
            job = self.s['job'](job_id)
            payload = self.s['payload'](job_id) or {}
            if not job or job.get('status') != 'success' or job.get('workflow') != step['workflow'] or payload.get('dryRun'):
                raise RecoveryError('A successful matching execution job is required')
            if payload.get('configContent') != step['configContent']:
                raise RecoveryError('Direct job YAML does not match this immutable recovery step', 409)
            if self.s['step_error'](step) and not payload.get('approvalId'):
                raise RecoveryError('This step requires an existing approved direct job', 403)
            try:
                submitted = datetime.fromisoformat(job.get('createdAt', '').replace('Z', '+00:00'))
                if submitted.tzinfo is None:
                    raise ValueError('Missing timezone')
            except ValueError:
                raise RecoveryError('Direct job has no usable submission timestamp') from None
            checked = datetime.fromisoformat(run['healthEvidence']['at'])
            if not timedelta(0) <= submitted - checked <= timedelta(minutes=15):
                raise RecoveryError('Direct job submission must follow the health check within 15 minutes')
            run['steps'].append({'index': index, 'workflow': step['workflow'], 'jobId': job_id, 'status': 'success', 'sha256': step['sha256']})
            if len(run['steps']) == len(run['snapshot']['steps']):
                run['status'] = 'awaiting_acceptance'
            self.event(run, f'Linked verified direct execution for configuration step {index+1}', actor)
            self.save(state)
            return self.public(run, True)

    def attest(self, identity, actor, data, accept=False):
        with self.lock:
            state = self.load()
            run = self.find(state, 'runs', identity)
            if accept and run['status'] != 'awaiting_acceptance':
                raise RecoveryError('All configuration steps must succeed before acceptance', 409)
            if accept:
                jobs = [self.s['job'](run.get('deploymentJobId', ''))] + [self.s['job'](s['jobId']) for s in run['steps']]
                if len(run['steps']) != len(run['snapshot']['steps']) or any(not j or j.get('status') != 'success' for j in jobs):
                    raise RecoveryError('Retained successful deployment and configuration jobs are required for acceptance', 409)
            if not accept and run['status'] not in ACTIVE:
                raise RecoveryError('This run does not require reconciliation', 409)
            if not accept:
                active = [self.s['job'](run.get(k, '')) for k in ('deploymentJobId', 'currentJobId')]
                if any(j and j.get('status') not in TERMINAL_JOBS for j in active):
                    raise RecoveryError('Stop or finish active jobs before releasing recovery ownership', 409)
                if data.get('foundationSessionEnded') is not True or data.get('targetReconciled') is not True:
                    raise RecoveryError('Confirm Foundation session ended and actual target state was reconciled')
            elif data.get('configurationVerified') is not True or data.get('clusterHealthy') is not True:
                raise RecoveryError('Confirm configuration readbacks and current cluster health')
            evidence = {'at': now(), 'by': actor, 'notes': required(data.get('notes'), 'Independent verification notes', 2000),
                        'reference': required(data.get('evidenceRef'), 'Evidence reference', 500)}
            run['acceptance' if accept else 'reconciliation'] = evidence
            resume = not accept and data.get('resumeConfiguration') is True
            if resume:
                deployment = self.s['job'](run.get('deploymentJobId', ''))
                if not deployment or deployment.get('status') != 'success':
                    raise RecoveryError('Only a successfully deployed cluster can resume remaining configuration', 409)
                pending = run['snapshot']['steps'][len(run['steps']):]
                if any(x['workflow'] == 'ChangeDefaultAdminPasswordPe' or
                       any(c.get('new_pe_admin_credential') for c in reference_only(x['configContent']).get('clusters', {}).values())
                       for x in pending):
                    raise RecoveryError('An uncertain password-change request cannot be replayed; reconcile credentials through the existing direct workflow', 409)
                run['status'] = 'awaiting_health_verification'
            else:
                run['status'] = 'accepted' if accept else 'closed_reconciled'
            self.event(run, 'Accepted for backup-platform restore handoff' if accept else
                       'Reconciled; fresh PE health and explicit configuration start are required' if resume else
                       'Closed after target reconciliation; no changes were replayed', actor)
            self.save(state)
            self.audit('run_accepted' if accept else 'run_reconciled', actor, identity)
            return self.public(run, True)

    def stop(self, identity, actor):
        with self.lock:
            state = self.load()
            run = self.find(state, 'runs', identity)
            if run['status'] not in ACTIVE:
                raise RecoveryError('No active recovery orchestration to stop', 409)
            run['status'] = 'needs_reconciliation'
            self.event(run, 'Orchestration stopped; Foundation or in-flight operations may continue; reconcile before retry', actor)
            self.save(state)
            for key in ('deploymentJobId', 'currentJobId'):
                if run.get(key):
                    self.s['cancel'](run[key], actor)
            return self.public(run, True)


def register_routes(app, service, require_role, limiter):
    """Additive API; no new deployment transport or privilege bypass."""
    def add(path, methods, handler, roles):
        def call(**args):
            try:
                data = request.get_json(silent=True)
                data = {} if data is None else data
                if not isinstance(data, dict):
                    raise RecoveryError('JSON body must be an object')
                actor = request.current_user['username']
                auth = request.headers.get('Authorization', '')
                return jsonify(handler(data, actor, auth, **args))
            except RecoveryError as exc:
                return jsonify({'error': str(exc)}), exc.status
        wrapped = require_role(*roles)(limiter.limit('60 per minute' if methods == ['GET'] else '15 per minute')(call))
        app.add_url_rule('/api/recovery' + path, endpoint='recovery_' + methods[0] + path, view_func=wrapped, methods=methods)
    read = ('admin', 'operator', 'viewer')
    admin = ('admin',)
    add('', ['GET'], lambda d, u, a: service.overview(), read)
    add('/datacenters', ['POST'], lambda d, u, a: service.datacenter(d, u), admin)
    add('/datacenters/<identity>', ['PUT'], lambda d, u, a, identity: service.datacenter(d, u, identity), admin)
    add('/profiles', ['POST'], lambda d, u, a: service.profile(d, u), admin)
    add('/profiles/<identity>', ['GET'], lambda d, u, a, identity: service.detail_profile(identity), read)
    add('/profiles/<identity>', ['PUT'], lambda d, u, a, identity: service.profile(d, u, identity), admin)
    add('/profiles/<identity>/approve', ['POST'], lambda d, u, a, identity: service.approve(identity, u, d), admin)
    add('/runs', ['POST'], lambda d, u, a: service.prepare(d, u), admin)
    add('/runs/<identity>', ['GET'], lambda d, u, a, identity: service.detail_run(identity), read)
    add('/runs/<identity>/approval', ['POST'], lambda d, u, a, identity: service.request_approval(identity, u, a), admin)
    add('/runs/<identity>/deploy', ['POST'], lambda d, u, a, identity: service.deploy(identity, u, d, a), admin)
    add('/runs/<identity>/health', ['POST'], lambda d, u, a, identity: service.attest_health(identity, u, d), admin)
    add('/runs/<identity>/configure', ['POST'], lambda d, u, a, identity: service.start_configuration(identity, u, d, a), admin)
    add('/runs/<identity>/configuration-job', ['POST'], lambda d, u, a, identity: service.link_configuration_job(identity, u, d), admin)
    add('/runs/<identity>/accept', ['POST'], lambda d, u, a, identity: service.attest(identity, u, d, True), admin)
    add('/runs/<identity>/reconcile', ['POST'], lambda d, u, a, identity: service.attest(identity, u, d), admin)
    add('/runs/<identity>/stop', ['POST'], lambda d, u, a, identity: service.stop(identity, u), admin)
