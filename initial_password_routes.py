"""Governed initial-password jobs and reference-only durable journals.

Route authorization and maintenance decorators belong to the server. No target
requests occur here except through the explicitly invoked core service.
"""
import copy
from contextlib import ExitStack
import datetime as dt
import ipaddress
import json
import os
import threading
import time
import uuid

from flask import Response, jsonify
import yaml

import credential_rotation as rotation
import initial_password_setup as core

LOCK = threading.RLock()
ACTIVE = {'queued', 'running', 'cancelling'}
ERROR = 'Initial password setup request could not be validated'


class _MissingJournal:
    def __deepcopy__(self, memo):
        return self


MISSING_JOURNAL = _MissingJournal()


class PasswordSetupService:
    def __init__(self, server_module):
        self.S = server_module

    @staticmethod
    def writes_enabled():
        return os.environ.get('ZTF_ALLOW_INITIAL_PASSWORD_SETUP', '').lower() in {'1', 'true', 'yes'}

    def capabilities(self):
        return {'workflow': core.WORKFLOW, 'applyEnabled': self.writes_enabled(),
                'liveEnabled': self.writes_enabled(), 'confirmation': core.CONFIRMATION}

    def parse(self, data):
        try:
            if not isinstance(data, dict) or data.get('script') or data.get('framework') not in (
                    None, '', core.WORKFLOW, 'initial-password-setup'):
                raise ValueError()
            if data.get('workflow', core.WORKFLOW) != core.WORKFLOW:
                raise ValueError()
            content = data.get('configContent')
            if not isinstance(content, str) or not content.strip() or len(content.encode('utf-8')) > 65536:
                raise ValueError()
            # Disallow aliases and duplicate keys rather than silently changing intent.
            for token in yaml.scan(content):
                if isinstance(token, (yaml.tokens.AliasToken, yaml.tokens.AnchorToken)):
                    raise ValueError()
            node = yaml.compose(content, Loader=yaml.SafeLoader)
            def unique(n):
                if isinstance(n, yaml.MappingNode):
                    keys = [k.value for k, _ in n.value]
                    if len(keys) != len(set(keys)):
                        raise ValueError()
                    for _, child in n.value:
                        unique(child)
                elif isinstance(n, yaml.SequenceNode):
                    for child in n.value:
                        unique(child)
            unique(node)
            config = yaml.safe_load(content)
            if core.validate_intent(config):
                raise ValueError()
            return config
        except Exception:
            raise ValueError(ERROR) from None

    def _admin(self, actor):
        if not isinstance(actor, str) or not actor:
            return False
        user = self.S._find_user(actor)
        return bool(user and user.get('role') == 'admin' and user.get('enabled', True) is not False
                    and not user.get('disabled', False))

    def validate_approval(self, payload, actor, binding_id=''):
        try:
            self.parse(payload)
            if not self.writes_enabled() or not self._admin(actor):
                raise ValueError()
            if payload.get('destructiveConfirmation') != core.CONFIRMATION:
                raise ValueError()
            approval = self.S._approval_manager.get_approval(str(payload.get('approvalId') or ''))
            filename = payload.get('configFile')
            if not isinstance(filename, str) or not filename.strip() or len(filename) > 512:
                raise ValueError()
            if self.S._workflow_approval_error(approval, core.WORKFLOW, filename, payload['configContent']):
                raise ValueError()
            if not approval or approval.get('status') != 'approved' or approval.get('workflow') != core.WORKFLOW:
                raise ValueError()
            if approval.get('configContent') != payload['configContent'] or approval.get('configFile') != filename:
                raise ValueError()
            expiry = self.S._parse_iso_datetime(approval.get('expiresAt'))
            if not expiry or expiry.tzinfo is None or expiry <= dt.datetime.now(dt.timezone.utc):
                raise ValueError()
            decider = approval.get('decidedBy')
            if approval.get('requestedBy') != actor or not isinstance(decider, str):
                raise ValueError()
            if decider.casefold() == actor.casefold() or not self._admin(decider):
                raise ValueError()
            if approval.get('jobId') and approval['jobId'] != binding_id:
                raise ValueError()
            return approval
        except Exception:
            raise ValueError(ERROR) from None

    def reserve_approval(self, payload, actor, binding_id):
        with LOCK:
            if not isinstance(binding_id, str) or not binding_id:
                raise ValueError(ERROR)
            approval = self.validate_approval(payload, actor, binding_id)
            linked = self.S._approval_manager.link_job(approval['id'], binding_id)
            if not linked:
                raise ValueError(ERROR)
            return linked

    @staticmethod
    def _now():
        return dt.datetime.now(dt.timezone.utc).isoformat()

    @property
    def _path(self):
        return self.S.CONFIG_DIR / 'initial-password-setup-runs.json'

    def _read_runs(self):
        """Only an absent document is empty; unreadable history blocks writes."""
        try:
            if getattr(getattr(self.S, '_storage', None), 'name', None) == 'file':
                try:
                    runs = json.loads(self._path.read_text(encoding='utf-8'))
                except FileNotFoundError:
                    runs = []
            else:
                # Postgres returns this default only for a missing row. A stored
                # JSON null or malformed document must never look like absence.
                runs = self.S.read_json(self._path, MISSING_JOURNAL)
                if runs is MISSING_JOURNAL:
                    runs = []
            if not isinstance(runs, list):
                raise ValueError()
            ids = set()
            for run in runs:
                if (not isinstance(run, dict) or not isinstance(run.get('id'), str)
                        or not run['id'] or run['id'] in ids
                        or not isinstance(run.get('configContent'), str)
                        or not isinstance(run.get('configFile'), str) or 'state' not in run):
                    raise ValueError()
                ids.add(run['id'])
                state = run['state']
                if state is not None and (
                        not isinstance(state, dict) or not isinstance(state.get('targets'), list)
                        or any(not isinstance(t, dict) or t.get('status') not in core.STATUSES
                               for t in state['targets'])):
                    raise ValueError()
                attempts = run.get('pipelineAttempts', {})
                if not isinstance(attempts, dict) or any(
                        not isinstance(k, str) or not k.isdecimal()
                        or v not in ('pending', 'completed', 'change_attempted') for k, v in attempts.items()):
                    raise ValueError()
            return runs
        except Exception:
            raise ValueError('Initial password journal is unreadable; restore or repair storage before execution') from None

    def list_runs(self):
        with LOCK:
            runs = copy.deepcopy(self._read_runs())
        for run in runs:
            run['targets'] = copy.deepcopy((run.get('state') or {}).get('targets', []))
            if (any(t.get('status') == 'change_attempted' for t in run['targets'])
                    or 'change_attempted' in (run.get('pipelineAttempts') or {}).values()):
                run['status'] = 'needs_reconciliation'
            elif run.get('jobId'):
                job = self.S._job_manager.get_job(run['jobId'])
                if job and job.get('status') in ACTIVE:
                    run['status'] = job['status']
                elif run.get('status') in ACTIVE:
                    run['status'] = job.get('status', 'interrupted') if job else 'interrupted'
        return runs

    def get_run(self, run_id):
        with LOCK:
            return next((copy.deepcopy(r) for r in self._read_runs() if r.get('id') == run_id), None)

    def save_run(self, run):
        with LOCK:
            runs = self._read_runs()
            value = copy.deepcopy(run)
            value.pop('targets', None)
            value['updatedAt'] = self._now()
            index = next((i for i, r in enumerate(runs) if r.get('id') == value['id']), None)
            if index is None:
                runs.append(value)
            else:
                runs[index] = value
            try:
                saved = self.S.write_json(self._path, runs)
            except Exception:
                raise ValueError('Initial password journal could not be saved') from None
            if saved is False:
                raise ValueError('Initial password journal could not be saved')
        return value

    @staticmethod
    def _canonical_address(address):
        try:
            if not isinstance(address, str) or '%' in address:
                raise ValueError()
            value = ipaddress.ip_address(address)
            if isinstance(value, ipaddress.IPv6Address) and value.ipv4_mapped:
                value = value.ipv4_mapped
            return str(value)
        except (TypeError, ValueError):
            raise ValueError(ERROR) from None

    def _target_pairs(self, config):
        if core.validate_intent(config):
            raise ValueError(ERROR)
        return {(self._canonical_address(node['address']), node['ssh_host_key_sha256'])
                for group in ('cvms', 'hosts') for node in config[group]}

    def _resource_addresses(self, addresses):
        if addresses is None:
            return set()
        if not isinstance(addresses, (list, tuple, set, frozenset)):
            raise ValueError(ERROR)
        return {self._canonical_address(address) for address in addresses}

    def validate_new_targets(self, config, exclude_run_id='', resource_addresses=None):
        """Refuse a fresh identity-equivalent retry of any uncertain journal.

        SSH identity is the canonical IP plus independently supplied pin. Extra
        pipeline resources (PE addresses) have no SSH pin and remain blocked
        while a legacy stage is uncertain. Resources which are SSH endpoints
        in both intents use their pins, allowing a separately verified rebuild.
        The pipeline caller must invoke this before its earlier legacy writes.
        """
        try:
            with LOCK:
                incoming = self._target_pairs(config)
                incoming_ips = {address for address, _pin in incoming}
                resources = self._resource_addresses(resource_addresses) | incoming_ips
                runs = self._read_runs()
                for previous in runs:
                    if exclude_run_id and previous.get('id') == exclude_run_id:
                        continue
                    uncertain = any(t.get('status') == 'change_attempted'
                                    for t in (previous.get('state') or {}).get('targets', []))
                    legacy_uncertain = 'change_attempted' in (previous.get('pipelineAttempts') or {}).values()
                    if not uncertain and not legacy_uncertain:
                        continue
                    known = self._target_pairs(self.parse(previous))
                    if incoming.intersection(known):
                        raise ValueError()
                    if legacy_uncertain:
                        known_ips = {address for address, _pin in known}
                        known_resources = self._resource_addresses(previous.get('resourceAddresses')) | known_ips
                        # A shared SSH IP with a changed pin represents a new
                        # verified identity; do not reduce it to IP-only matching.
                        shared_unpinned = (resources & known_resources) - (incoming_ips & known_ips)
                        if shared_unpinned:
                            raise ValueError()
        except Exception:
            raise ValueError('Reconcile overlapping uncertain password runs before starting new work') from None

    def new_run(self, payload, actor, pipelineId='', pipelineSnapshot=None, *, resource_addresses=None):
        with LOCK:
            config = self.parse(payload)
            resources = resource_addresses if resource_addresses is not None else payload.get('resourceAddresses')
            if payload.get('dryRun') is not True:
                self.validate_new_targets(config, resource_addresses=resources)
            run = {'id': str(uuid.uuid4()), 'cluster_name': config['cluster_name'], 'status': 'queued',
                   'actor': actor, 'configContent': payload['configContent'],
                   'configFile': str(payload.get('configFile') or ''), 'state': None,
                   'completedSteps': [], 'createdAt': self._now(), 'jobId': ''}
            if pipelineId:
                run.update(pipelineId=pipelineId, pipelineSnapshot=copy.deepcopy(pipelineSnapshot))
            if resources is not None:
                run['resourceAddresses'] = sorted(self._resource_addresses(resources))
            self.save_run(run)
            return run

    def _payload(self, data):
        self.parse(data)
        return {'workflow': core.WORKFLOW, 'framework': 'initial-password-setup',
                'configContent': data['configContent'], 'configFile': str(data.get('configFile') or ''),
                'approvalId': str(data.get('approvalId') or ''),
                'destructiveConfirmation': str(data.get('destructiveConfirmation') or ''),
                'dryRun': data.get('dryRun') is True}

    def submit(self, data, actor, role, stream=False):
        try:
            # DR dispatch already holds the reentrant job-manager lock. Always
            # take it first so a standalone submission cannot invert that order.
            with self.S._job_manager._lock, LOCK:
                if role != 'admin' or not self._admin(actor):
                    raise ValueError(ERROR)
                payload = self._payload(data)
                if not payload['dryRun']:
                    self.validate_approval(payload, actor)
                run = self.new_run(payload, actor)
                payload['initialPasswordRunId'] = run['id']
                job = self.S._job_manager.submit(payload, actor)
                run['jobId'] = job['id']
                self.save_run(run)
                if not payload['dryRun']:
                    self.reserve_approval(payload, actor, job['id'])
            if stream:
                return Response(self.S._job_manager.stream_events(job['id']), mimetype='text/event-stream',
                                headers={'Cache-Control': 'no-cache'})
            return jsonify({**job, 'initialPasswordRunId': run['id']}), 202
        except Exception:
            return jsonify({'error': ERROR}), 403

    def execute_run(self, run, payload, actor, emit, cancelled, *, binding_id=''):
        acquired = rotation.ROTATION_LOCK.acquire(blocking=False)
        if not acquired:
            raise ValueError('Another password operation is active')
        try:
            with LOCK:
                run = self.get_run(run['id'])
                if not run or payload.get('configContent') != run['configContent'] or payload.get('configFile') != run['configFile']:
                    raise ValueError(ERROR)
                config = self.parse(payload)
                dry = payload.get('dryRun') is True
                binding = binding_id or payload.get('bindingId') or run.get('jobId') or ''
                if not self._admin(actor):
                    raise ValueError(ERROR)
                if not dry:
                    self.validate_new_targets(config, exclude_run_id=run['id'],
                                              resource_addresses=run.get('resourceAddresses'))
                    approval = self.validate_approval(payload, actor, binding)
                    if not binding or approval.get('jobId') != binding:
                        raise ValueError(ERROR)
                run['status'] = 'running'
                self.save_run(run)
            deadline = time.monotonic() + self.S.EXEC_TIMEOUT
            def stopped():
                return cancelled() or time.monotonic() >= deadline or (not dry and not self.writes_enabled())
            def checkpoint(state):
                with LOCK:
                    if not dry:
                        approval = self.validate_approval(payload, actor, binding)
                        if approval.get('jobId') != binding:
                            raise ValueError(ERROR)
                    fresh = self.get_run(run['id'])
                    fresh['state'] = copy.deepcopy(state)
                    self.save_run(fresh)
                return True
            credentials = core.resolve_credentials(config, self.S._lookup_credential_ref)
            ok, state = core.execute(config, credentials, self.S.get_settings()['pythonPath'], emit,
                                     cancelled=stopped, dry_run=dry, state=run.get('state'), checkpoint=checkpoint)
            was_stopped = stopped()  # callbacks may acquire the job-manager lock
            with LOCK:
                fresh = self.get_run(run['id'])
                if state is not None:
                    fresh['state'] = state
                uncertain = any(t.get('status') == 'change_attempted' for t in (fresh.get('state') or {}).get('targets', []))
                fresh['status'] = ('needs_reconciliation' if uncertain else
                                   'cancelled' if was_stopped else 'success' if ok else 'failed')
                self.save_run(fresh)
            return bool(ok and not stopped() and not uncertain)
        except Exception:
            with LOCK:
                fresh = self.get_run(run['id']) if run else None
                if fresh:
                    uncertain = any(t.get('status') == 'change_attempted' for t in (fresh.get('state') or {}).get('targets', []))
                    fresh['status'] = 'needs_reconciliation' if uncertain else 'failed'
                    self.save_run(fresh)
            raise ValueError('Initial password setup stopped; inspect the durable journal') from None
        finally:
            rotation.ROTATION_LOCK.release()

    def run_job(self, manager, job_id, payload, actor):
        status, code, run = 'failed', -1, None
        try:
            # Submission holds this lock until journal and approval are linked.
            with LOCK:
                run = self.get_run(payload.get('initialPasswordRunId'))
                if not run or run.get('pipelineId') or run.get('jobId') != job_id:
                    raise ValueError(ERROR)
            def cancelled():
                return manager._stop or (manager.get_job(job_id) or {}).get('status') == 'cancelling'
            ok = self.execute_run(run, payload, actor, lambda line: manager._emit(job_id, 'stdout', line), cancelled)
            status = ('success' if ok else 'cancelled' if
                      (manager.get_job(job_id) or {}).get('status') in {'cancelling', 'cancelled'} else 'failed')
            code = 0 if ok else -1
        except Exception:
            manager._emit(job_id, 'error', 'Initial password setup stopped; inspect the durable journal')
            if (manager.get_job(job_id) or {}).get('status') in {'cancelling', 'cancelled'}:
                status = 'cancelled'
        finally:
            try:
                fresh = self.get_run(run['id']) if run else None
                diagnostics = {'initialPasswordRunId': (run or {}).get('id', ''),
                               'journalStatus': (fresh or {}).get('status', ''),
                               'state': copy.deepcopy((fresh or {}).get('state')),
                               'targets': ((fresh or {}).get('state') or {}).get('targets', []),
                               'followupRequired': status != 'success', 'dryRun': payload.get('dryRun') is True}
                manager._set_diagnostics(job_id, diagnostics)
                self.S._record_execution_history(execution_id=job_id, workflow_or_script=core.WORKFLOW,
                                                execution_type='workflow', status=status, user=actor,
                                                config_file=(run or {}).get('configFile', ''),
                                                config_content=(run or {}).get('configContent', ''),
                                                return_code=code, diagnostics=diagnostics)
            except Exception:
                manager._emit(job_id, 'error', 'Initial password job audit could not be saved; inspect the durable journal')
            finally:
                manager._complete(job_id, status, code)

    def _inactive(self, run, job):
        if not run:
            raise ValueError(ERROR)
        if job and job.get('status') in ACTIVE:
            raise ValueError('Initial password job is still active')
        active = getattr(self.S, '_INITIAL_PASSWORD_ACTIVE_PIPELINES', set())
        if run.get('pipelineId') and (run['pipelineId'] in active or run['id'] in active
                                      or run.get('pipelineRunId') in active):
            raise ValueError('Initial password pipeline is still active')

    def _attest_pipeline_step(self, run, data, actor):
        index = data.get('pipelineStep')
        steps = (run.get('pipelineSnapshot') or {}).get('steps', [])
        if not run.get('pipelineId') or type(index) is not int or not 0 <= index < len(steps):
            raise ValueError(ERROR)
        if steps[index].get('workflow') == core.WORKFLOW:
            raise ValueError(ERROR)
        attempts = run.get('pipelineAttempts') or {}
        if attempts.get(str(index)) != 'change_attempted' or data.get('independentlyVerified') is not True:
            raise ValueError(ERROR)
        if data.get('selection') not in ('completed', 'not_applied'):
            raise ValueError(ERROR)
        # This records an explicit operator claim, never a target verification.
        completed = list(run.get('completedSteps') or [])
        if data['selection'] == 'completed':
            if index not in completed:
                completed.append(index)
            attempts[str(index)] = 'completed'
        else:
            completed = [i for i in completed if i != index]
            attempts[str(index)] = 'pending'
        run['pipelineAttempts'] = attempts
        run['completedSteps'] = completed
        run['status'] = ('needs_reconciliation' if 'change_attempted' in attempts.values()
                         or any(t.get('status') == 'change_attempted' for t in (run.get('state') or {}).get('targets', []))
                         else 'reconciled')
        run.setdefault('reconciliations', []).append({
            'source': 'operator-attestation', 'actor': actor, 'createdAt': self._now(),
            'pipelineStep': index, 'selection': data['selection'], 'independentlyVerified': True,
            'notes': data['notes'], 'evidence': data['evidence']})
        self.save_run(run)
        return self.get_run(run['id'])

    def reconcile_run(self, run_id, data, actor):
        acquired = rotation.ROTATION_LOCK.acquire(blocking=False)
        try:
            if not acquired or not self._admin(actor) or not isinstance(data, dict):
                raise ValueError(ERROR)
            with ExitStack() as journal:
                # Acquire in DR order, then release the queue lock before SSH.
                # Retain the journal lock so admission cannot race reconciliation.
                with self.S._job_manager._lock:
                    journal.enter_context(LOCK)
                    run = self.get_run(run_id)
                    job = self.S._job_manager.get_job(run.get('jobId', '')) if run else None
                    self._inactive(run, job)
                config = self.parse(run)
                for field in ('notes', 'evidence'):
                    if not isinstance(data.get(field), str) or not data[field].strip() or len(data[field]) > 4096:
                        raise ValueError(ERROR)
                if 'pipelineStep' in data:
                    return self._attest_pipeline_step(run, data, actor)
                if data.get('selection') not in ('current', 'replacement'):
                    raise ValueError(ERROR)
                credentials = core.resolve_credentials(config, self.S._lookup_credential_ref)
                def checkpoint(state):
                    fresh = self.get_run(run_id)
                    fresh['state'] = copy.deepcopy(state)
                    fresh.setdefault('reconciliations', []).append({
                        'actor': actor, 'createdAt': self._now(), 'selection': data['selection'],
                        'targetKeys': copy.deepcopy(data.get('targetKeys')), 'notes': data['notes'], 'evidence': data['evidence']})
                    fresh['status'] = 'needs_reconciliation' if any(t['status'] == 'change_attempted' for t in state['targets']) else 'reconciled'
                    self.save_run(fresh)
                    return True
                ok, _state = core.reconcile(config, credentials, self.S.get_settings()['pythonPath'],
                                            run.get('state'), data.get('targetKeys'), data['selection'],
                                            lambda line: None, checkpoint)
                if not ok:
                    raise ValueError(ERROR)
                result = self.get_run(run_id)
                result['targets'] = copy.deepcopy((result.get('state') or {}).get('targets', []))
                return result
        except Exception:
            raise ValueError(ERROR) from None
        finally:
            if acquired:
                rotation.ROTATION_LOCK.release()

    def resume(self, run_id, data, actor):
        try:
            with self.S._job_manager._lock, LOCK:
                run = self.get_run(run_id)
                job = self.S._job_manager.get_job(run.get('jobId', '')) if run else None
                self._inactive(run, job)
                if run.get('pipelineId') or not self._admin(actor) or not isinstance(data, dict):
                    raise ValueError(ERROR)
                if any(field in data and data[field] != run[field] for field in ('configContent', 'configFile')):
                    raise ValueError(ERROR)
                if any(t.get('status') == 'change_attempted' for t in (run.get('state') or {}).get('targets', [])):
                    raise ValueError(ERROR)
                payload = self._payload({**data, 'configContent': run['configContent'], 'configFile': run['configFile'], 'dryRun': False})
                self.validate_approval(payload, actor)
                payload['initialPasswordRunId'] = run_id
                job = self.S._job_manager.submit(payload, actor)
                self.reserve_approval(payload, actor, job['id'])
                run.update(jobId=job['id'], actor=actor, status='queued')
                self.save_run(run)
                return jsonify({**job, 'initialPasswordRunId': run_id}), 202
        except Exception:
            return jsonify({'error': ERROR}), 409
