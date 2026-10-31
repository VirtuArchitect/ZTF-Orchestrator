"""Restricted file-spool client for the separately installed appliance service.

The application can write requests, but cannot write service results, access
Docker, or choose host commands. No host service is required for legacy staging.
"""
import json
import os
import time
import uuid
from pathlib import Path


TERMINAL = {'succeeded', 'failed', 'interrupted', 'rejected'}


def control_root():
    return Path(os.environ.get('ZTF_UPDATE_CONTROL_DIR', '/run/ztf-update-control'))


def status():
    result = control_root() / 'results/status.json'
    try:
        data = json.loads(result.read_text())
        if not isinstance(data, dict) or not isinstance(data.get('maintenance'), bool) or not isinstance(data.get('operation'), (dict, type(None))):
            raise ValueError('Invalid service state')
        fresh = 0 <= time.time() - float(data['heartbeat']) < 30
        pending = control_root() / 'requests/request.json'
        if pending.is_file() and (not data.get('operation') or data['operation'].get('status') in TERMINAL):
            command = json.loads(pending.read_text())
            data['operation'] = {'id': command['id'], 'action': command['action'], 'status': 'queued', 'message': 'Waiting for host service acknowledgement'}
        return {**data, 'available': fresh,
                'message': '' if fresh else 'Update service is offline. Do not resubmit an installation; reconnect or inspect its retained report.'}
    except (OSError, ValueError, KeyError, TypeError):
        return {'available': False, 'maintenance': result.exists(), 'operation': None,
                'message': 'Guided updates require the one-time host update service installation. Legacy staging remains available.'}


def maintenance():
    # An interrupted cutover remains locked even when the service is unavailable.
    return bool(status().get('maintenance'))


def submit(action, payload, user, request_id):
    request_id = str(uuid.UUID(request_id))
    current = status()
    if not current['available']:
        raise ValueError(current['message'])
    op = current.get('operation') or {}
    if op.get('id') == request_id:
        return op
    if op and op.get('status') not in TERMINAL:
        raise ValueError('Another appliance operation is in progress. Follow its existing progress report.')
    if current.get('maintenance') and action != 'rollback':
        raise ValueError('An interrupted update requires reconciliation or compatible image rollback before another operation.')
    inbox = control_root() / 'requests'
    # O_EXCL gives concurrent web workers one queue slot, without overwriting work.
    path = inbox / 'request.json'
    lock = inbox / 'pending.lock'
    data = {'id': request_id, 'action': action, 'payload': payload,
            'requestedBy': user, 'requestedAt': time.time()}
    try:
        with lock.open('x'):
            pass
    except FileExistsError:
        raise ValueError('An appliance request is already pending. Refresh its progress; do not submit it again.') from None
    temporary = inbox / (request_id + '.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            json.dump(data, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except OSError:
        temporary.unlink(missing_ok=True)
        lock.unlink(missing_ok=True)
        raise
    return {'id': request_id, 'action': action, 'status': 'queued'}
