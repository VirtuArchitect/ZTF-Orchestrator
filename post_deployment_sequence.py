"""Durable cursor for one reviewed post-deployment sequence per cluster."""
import datetime
import re
import uuid

import post_deployment as post
from post_deployment_ncc import WORKFLOW as NCC

STAGES = ('certificate', post.FQDN, 'cvm-renames', 'platform-changes',
          post.LCM, NCC, 'acceptance', 'signoff')
CHECKPOINTS = frozenset({'certificate', 'cvm-renames', 'platform-changes', 'signoff'})
ACTIVE = frozenset({'queued', 'running', 'cancelling'})


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def reference(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_.:/#-]{1,128}', value):
        raise post.PostDeploymentError('Provide a change or evidence reference, not credentials or a free-text log.')
    return value


def validate(value):
    if not isinstance(value, dict) or set(value) != {'connection', 'fqdn', 'repository', 'hostSerials', 'containers', 'ncc'}:
        raise post.PostDeploymentError('Provide the reviewed cluster, acceptance settings and NCC target.')
    config = post.acceptance_intent({key: item for key, item in value.items() if key != 'ncc'})
    ncc = value['ncc']
    if (not isinstance(ncc, dict) or set(ncc) != {'hostSerial', 'credential', 'hostKey'}
            or ncc['hostSerial'] not in config['hostSerials']
            or not isinstance(ncc['credential'], str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', ncc['credential'])
            or not isinstance(ncc['hostKey'], str) or not re.fullmatch(r'SHA256:[A-Za-z0-9+/]{43}', ncc['hostKey'])):
        raise post.PostDeploymentError('Select an expected host serial, saved CVM credential and independently verified SSH host-key pin.')
    return {**config, 'ncc': dict(ncc)}


def create(config, pc_uuid, actor):
    return {'id': str(uuid.uuid4()), 'revision': 0, 'stage': STAGES[0], 'owner': actor,
            'intent': config, 'pcUuid': pc_uuid, 'completed': [], 'reconciliations': [],
            'approvalId': '', 'attempt': '', 'updatedAt': now()}


def finish(run, actor, evidence):
    stage = run['stage']
    run['completed'].append({'stage': stage, 'actor': actor, 'at': now(), 'evidence': evidence})
    run['stage'] = (STAGES + ('complete',))[STAGES.index(stage) + 1]
    run['approvalId'] = run['attempt'] = ''


def job_evidence(stage, job):
    details = job.get('diagnostics') or {}
    if job.get('workflow') != stage or job.get('status') != 'success':
        return None
    if stage == NCC and details.get('status') == 'passed' and details.get('total', 0) > 0 and job.get('finishedAt'):
        return {'jobId': job['id'], 'counts': details['counts'], 'total': details['total'],
                'finishedAt': job['finishedAt']}
    if stage in post.WORKFLOWS and details.get('status') == 'verified' and details.get('taskId'):
        return {'jobId': job['id'], 'taskId': details['taskId']}
    return None
