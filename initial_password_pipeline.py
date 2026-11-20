"""Opt-in password step in otherwise unchanged ZTF 1.x pipelines.

Only hashes of other configuration files are persisted in the password journal.
Resumption requires the same pipeline and files, a fresh exact-intent approval,
and fresh target verification. Existing pipelines never enter this adapter.
"""
from copy import deepcopy
import hashlib
import json
import queue
import threading
import time

import yaml
import initial_password_setup as passwords

LOCK = threading.RLock()
ACTIVE = {}
SSH_REFERENCE_FIELDS = {
    'cvm_credential', 'cvm_credential_ref', 'host_credential', 'host_credential_ref',
    'ahv_credential', 'ahv_credential_ref', 'hypervisor_credential', 'hypervisor_credential_ref',
}


def prepare(server, pipeline, data, actor, role, binding_id):
    indices = [i for i, step in enumerate(pipeline['steps']) if step['workflow'] == passwords.WORKFLOW]
    if not indices:
        if data.get('passwordSetupResumeRunId'):
            raise ValueError('This pipeline has no initial password setup action')
        return None
    if role != 'admin':
        raise ValueError('A pipeline containing initial password setup requires an administrator')
    if len(indices) != 1:
        raise ValueError('Use one initial Host & CVM password setup action per pipeline')
    index = indices[0]
    if index == 0:
        raise ValueError('Place initial Host & CVM password setup immediately after initial_config_admin_pwd')
    contents, digests = {}, {}
    for step in pipeline['steps']:
        name = step.get('configFile', '')
        if name and name not in contents:
            path = server.safe_config_path(name, server.get_configs_dir())
            if not path or not path.is_file():
                raise ValueError('A saved pipeline configuration is missing or invalid')
            try:
                raw = path.read_bytes()
                contents[name] = raw.decode('utf-8')
            except (OSError, UnicodeError):
                raise ValueError('A pipeline configuration cannot be read') from None
            digests[name] = hashlib.sha256(raw).hexdigest()
    previous = pipeline['steps'][index - 1]
    try:
        bootstrap = yaml.safe_load(contents.get(previous.get('configFile', ''), ''))
        clusters = bootstrap.get('clusters', {}) if isinstance(bootstrap, dict) else {}
        initial_pe = (previous['workflow'] in {'ChangeDefaultAdminPasswordPe', 'config-cluster'}
                      and isinstance(clusters, dict) and bool(clusters) and all(
                          isinstance(value, dict)
                          and isinstance(value.get('new_pe_admin_credential'), str)
                          and value['new_pe_admin_credential'].strip() for value in clusters.values()))
    except yaml.YAMLError:
        initial_pe = False
    if not initial_pe:
        raise ValueError('Initial password setup must immediately follow a saved PE administrator password step')
    name = pipeline['steps'][index]['configFile']
    payload = {'workflow': passwords.WORKFLOW, 'configFile': name, 'configContent': contents[name],
               'approvalId': data.get('passwordSetupApprovalId', ''),
               'destructiveConfirmation': data.get('passwordSetupConfirmation', ''), 'bindingId': binding_id}
    service = server._initial_password_service()
    config = service.parse(payload)
    # Ambiguous reference promotion could hand a later SSH step the wrong password.
    reference_map(config)
    snapshot = {'pipelineId': pipeline['id'], 'name': pipeline['name'],
                'steps': deepcopy(pipeline['steps']), 'configHashes': digests}
    resume_id = str(data.get('passwordSetupResumeRunId') or '')
    with LOCK:
        addresses = {node['address'] for group in ('cvms', 'hosts') for node in config[group]}
        # Guard the earlier PE bootstrap too, before the SSH rotation lock applies.
        addresses.update(str(address) for address in clusters)
        if any(active.get('pipelineId') == pipeline['id'] or addresses.intersection(active.get('addresses', set()))
               for active in ACTIVE.values()):
            raise ValueError('A password pipeline for these targets is already active')
        run = service.get_run(resume_id) if resume_id else None
        if resume_id:
            if not run or run.get('pipelineId') != pipeline['id'] or run.get('pipelineSnapshot') != snapshot:
                raise ValueError('Resume requires the original pipeline and unchanged configuration files')
            if run['id'] in ACTIVE:
                raise ValueError('This password pipeline is already active')
            if run.get('configContent') != payload['configContent']:
                raise ValueError('The reviewed password intent changed; do not reuse this recovery run')
            if any(value == 'change_attempted' for value in run.get('pipelineAttempts', {}).values()):
                raise ValueError('Reconcile the uncertain legacy pipeline stage before resuming; completed work will not be replayed')
        service.validate_new_targets(config, exclude_run_id=resume_id, resource_addresses=addresses)
        service.validate_approval(payload, actor)
        if not run:
            run = service.new_run(payload, actor, pipelineId=pipeline['id'], pipelineSnapshot=snapshot,
                                  resource_addresses=addresses)
        service.reserve_approval(payload, actor, binding_id)
        run['pipelineRunId'] = binding_id
        service.save_run(run)
        payload['initialPasswordRunId'] = run['id']
        context = {'runId': run['id'], 'service': service, 'payload': payload, 'contents': contents,
                   'config': config, 'actor': actor, 'index': index, 'cancel': threading.Event(),
                   'worker': None, 'deadline': time.monotonic() + server.EXEC_TIMEOUT}
        ACTIVE[run['id']] = {'bindingId': binding_id, 'pipelineId': pipeline['id'], 'addresses': addresses}
        return context


def is_preserved(context, index):
    if not context or index == context['index']:
        return False
    return index in context['service'].get_run(context['runId']).get('completedSteps', [])


def completed(context, index):
    if not context:
        return
    with LOCK:
        run = context['service'].get_run(context['runId'])
        run['completedSteps'] = sorted(set(run.get('completedSteps', []) + [index]))
        if index != context['index']:
            run.setdefault('pipelineAttempts', {})[str(index)] = 'completed'
        context['service'].save_run(run)


def attempted(context, index):
    if not context:
        return
    with LOCK:
        run = context['service'].get_run(context['runId'])
        run.setdefault('pipelineAttempts', {})[str(index)] = 'change_attempted'
        # Failure to persist this marker must prevent the legacy subprocess.
        context['service'].save_run(run)


def finish(context, status):
    if not context:
        return
    with LOCK:
        run = context['service'].get_run(context['runId'])
        run['pipelineStatus'] = status
        context['service'].save_run(run)


def release(context):
    if not context:
        return
    context['cancel'].set()
    worker = context.get('worker')
    if not worker or not worker.is_alive():
        with LOCK:
            ACTIVE.pop(context['runId'], None)


def stream_step(context):
    events = queue.Queue()
    outcome = []

    def work():
        try:
            run = context['service'].get_run(context['runId'])
            ok = context['service'].execute_run(
                run, context['payload'], context['actor'], lambda line: events.put(('stdout', line)),
                lambda: context['cancel'].is_set() or time.monotonic() >= context['deadline'])
            outcome.append(bool(ok))
        except Exception:
            events.put(('stderr', 'Initial password setup stopped; review its saved per-target state before retrying.'))
            outcome.append(False)
        finally:
            events.put(None)
            if context['cancel'].is_set():
                with LOCK:
                    ACTIVE.pop(context['runId'], None)

    worker = threading.Thread(target=work, daemon=True)
    context['worker'] = worker
    worker.start()
    try:
        while True:
            try:
                event = events.get(timeout=5)
            except queue.Empty:
                yield 'stdout', '[RUNNING] Initial password setup; waiting for verified SSH results.'
                continue
            if event is None:
                break
            yield event
        yield 'password_setup_result', {'ok': bool(outcome and outcome[0]), 'runId': context['runId']}
    finally:
        if worker.is_alive():
            context['cancel'].set()


def reference_map(config):
    refs = {}
    entries = list(config['cvms']) + [account for host in config['hosts'] for account in host['accounts']]
    for item in entries:
        old, new = item['current_credential_ref'], item['replacement_credential_ref']
        if old in refs and refs[old] != new:
            raise ValueError('Use unambiguous current/replacement references for pipeline credential handoff')
        refs[old] = new
    return refs


def config_snapshot(context, step, index):
    if not context or not step.get('configFile'):
        return None
    text = context['contents'][step['configFile']]
    if index <= context['index']:
        return text
    run = context['service'].get_run(context['runId'])
    if context['index'] not in run.get('completedSteps', []):
        raise ValueError('Replacement credential references are unavailable until password verification succeeds')
    refs = reference_map(context['config'])
    try:
        value = yaml.safe_load(text)
    except yaml.YAMLError:
        raise ValueError('A later pipeline configuration is not valid YAML') from None
    changed = False

    def rewrite(node):
        nonlocal changed
        if isinstance(node, dict):
            for key, item in node.items():
                if key in SSH_REFERENCE_FIELDS and isinstance(item, str) and item in refs:
                    node[key] = refs[item]
                    changed = True
                else:
                    rewrite(item)
        elif isinstance(node, list):
            for item in node:
                rewrite(item)
    rewrite(value)
    return yaml.safe_dump(value, sort_keys=False) if changed else text
