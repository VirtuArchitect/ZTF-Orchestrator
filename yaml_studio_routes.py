"""Authoring metadata and append-only handoff; never submits execution jobs."""
from functools import wraps
import threading

from flask import jsonify, request
import yaml

import yaml_studio_ops as ops
from credential_organization import empty_organization, validate_organization
from config_organization import empty_config_organization, validate_config_organization

FILE_LOCK = threading.RLock()
PIPELINE_LOCK = threading.RLock()


def guard(lock):
    def decorate(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            with lock:
                return function(*args, **kwargs)
        return wrapped
    return decorate


def metadata(server):
    """Return declared reference names and grouping only, never credential values."""
    path = server.get_global_config_path()
    if not path.exists():
        path = server.get_legacy_global_config_path()
    data = yaml.safe_load(path.read_text(encoding='utf-8')) if path.exists() else {}
    data = data or {}
    selected = (data.get('vaults') or {}).get(data.get('vault_to_use'), {})
    refs = selected.get('credentials', {})
    if not isinstance(refs, dict):
        raise ValueError('Invalid credential catalogue')
    with server._CREDENTIAL_ORGANIZATION_LOCK:
        catalogue = validate_organization(server._read_group_document(server.CONFIG_DIR / 'credential_organization.json', empty_organization()))
    names = sorted(name for name in refs if isinstance(name, str) and ops.REF.fullmatch(name))
    return {'references': [{'name': name, **catalogue['assignments'].get(name, {'groupId': '', 'purpose': ''})} for name in names],
            'groups': catalogue['groups'], 'tasks': [{**task, 'handoffError': server._pipeline_step_error({'workflow': task['action'], 'configFile': 'reviewed.yml'})} for task in ops.TASKS], 'referenceCheck': 'declaration_only'}


def validate_request(server, data):
    if not isinstance(data, dict):
        return {'valid': False, 'errors': ['Provide a task and YAML content.'], 'warnings': []}
    refs = [ref['name'] for ref in metadata(server)['references']]
    return ops.validate(data.get('taskId'), data.get('content'), refs)


def filename_path(server, name):
    if (not isinstance(name, str) or not 1 <= len(name) <= 200 or '/' in name or '\\' in name
            or not name.endswith(('.yml', '.yaml')) or any(ord(c) < 32 for c in name)):
        raise ValueError('Use a YAML filename without directories.')
    path = server.safe_config_path(name, server.get_configs_dir())
    if path is None or name.casefold() in {'global.yml', 'global.yaml'}:
        raise ValueError('Use a task-specific filename. Shared credentials belong in Global Config.')
    return path


def save(server, data):
    try:
        with FILE_LOCK:
            if server._maintenance_active():
                return jsonify({'error': 'Appliance maintenance is active.'}), 409
            if not isinstance(data, dict) or not isinstance(data.get('groupId', ''), str) or type(data.get('groupRevision')) is not int:
                return jsonify({'error': 'Use a saved group ID and an integer grouping revision.'}), 400
            validation = validate_request(server, data)
            if not validation['valid']:
                return jsonify({'error': 'Resolve the authoring checks before saving.', 'validation': validation}), 400
            path = filename_path(server, data.get('filename'))
            if 'expectedHash' not in data or not isinstance(data['expectedHash'], str):
                return jsonify({'error': 'Review the existing file or confirm a new filename.'}), 409
            current_hash = ops.digest(path.read_text(encoding='utf-8')) if path.exists() else ''
            if data['expectedHash'] != current_hash:
                return jsonify({'error': 'The file exists or changed. Review its current content before overwriting.', 'currentHash': current_hash}), 409
            with server._CREDENTIAL_ORGANIZATION_LOCK:
                catalogue = metadata(server)
                group_id = data.get('groupId', '')
                if group_id and group_id not in {g['id'] for g in catalogue['groups']}:
                    return jsonify({'error': 'The selected group changed. Reload before saving.'}), 409
                group_path = server.CONFIG_DIR / 'config_organization.json'
                organization = validate_config_organization(server._read_group_document(group_path, empty_config_organization()))
                if data.get('groupRevision') != organization['revision']:
                    return jsonify({'error': 'Config grouping changed. Reload the grouping before saving.'}), 409
                server.backup_config(path)
                server._secure_write(path, data['content'])
                server.write_json(group_path, {**organization, 'revision': organization['revision'] + 1,
                    'assignments': {**organization['assignments'], path.name: {'groupId': group_id, 'purpose': 'Post-configuration'}}})
            server.log.info('yaml_studio_saved', extra={'action': 'yaml_studio_save', 'user': request.current_user['username'],
                                                       'configFile': path.name, 'taskId': data['taskId']})
            return jsonify({'success': True, 'filename': path.name, 'contentHash': validation['contentHash'], 'validation': validation})
    except (ValueError, TypeError, AttributeError, OSError, yaml.YAMLError):
        return jsonify({'error': 'The task, credential catalogue or grouping could not be verified. Reload before saving.'}), 400


def register_routes(app, require_role, server):
    @app.route('/api/yaml-studio/context')
    @require_role('admin', 'operator', 'viewer')
    def yaml_studio_context():
        try:
            result = metadata(server)
            with PIPELINE_LOCK:
                result['pipelines'] = [{**p, 'studioHash': ops.digest(p)} for p in server._load_pipelines()]
            return jsonify(result)
        except (ValueError, TypeError, AttributeError, OSError, yaml.YAMLError):
            return jsonify({'error': 'Authoring metadata is unavailable. Reload before validating or handing off.'}), 503

    @app.route('/api/yaml-studio/handoff', methods=['POST'])
    @require_role('admin', 'operator')
    def yaml_studio_handoff():
        data = request.get_json(silent=True)
        keys = {'pipelineId', 'pipelineHash', 'taskId', 'filename', 'contentHash'}
        if not isinstance(data, dict) or set(data) != keys or any(not isinstance(v, str) for v in data.values()):
            return jsonify({'error': 'Review the exact saved file and pipeline before handing off.'}), 400
        try:
            with PIPELINE_LOCK, FILE_LOCK:
                if server._maintenance_active():
                    return jsonify({'error': 'Appliance maintenance is active.'}), 409
                path = filename_path(server, data['filename'])
                if not path.is_file() or ops.digest(path.read_text(encoding='utf-8')) != data['contentHash']:
                    return jsonify({'error': 'The saved file changed. Reload, validate and save it again.'}), 409
                validation = validate_request(server, {**data, 'content': path.read_text(encoding='utf-8')})
                if not validation['valid']:
                    return jsonify({'error': 'The saved file no longer passes authoring checks.', 'validation': validation}), 409
                task = next(t for t in ops.TASKS if t['id'] == data['taskId'])
                step = {'workflow': task['action'], 'configFile': path.name}
                error = server._pipeline_step_error(step)
                if error:
                    return jsonify({'error': error}), 400
                pipelines = server._load_pipelines()
                pipeline = next((p for p in pipelines if p['id'] == data['pipelineId']), None)
                if not pipeline:
                    return jsonify({'error': 'The selected pipeline no longer exists.'}), 404
                if pipeline.get('executor', 'legacy') != 'legacy':
                    return jsonify({'error': 'Use an existing ZTF 1.x pipeline. Executors are not converted here.'}), 409
                if step in pipeline['steps']:
                    return jsonify({'error': 'This action and file are already in the pipeline. No duplicate was appended.'}), 409
                if ops.digest(pipeline) != data['pipelineHash']:
                    return jsonify({'error': 'The pipeline changed. Review the updated steps before appending.'}), 409
                jobs = server._job_manager.list_jobs(limit=1000000)
                if any(j.get('status') in {'queued', 'running', 'cancelling'} for j in jobs):
                    return jsonify({'error': 'Wait for active jobs to finish before changing a pipeline.'}), 409
                pipeline['steps'] = [*pipeline['steps'], step]
                pipeline['updatedAt'] = server._now_iso()
                server._save_pipelines(pipelines)
                server.log.info('yaml_studio_pipeline_handoff', extra={'action': 'yaml_studio_pipeline_handoff',
                    'user': request.current_user['username'], 'pipelineId': pipeline['id'], 'configFile': path.name,
                    'workflow': step['workflow']})
                return jsonify({'pipelineId': pipeline['id'], 'step': step, 'stepCount': len(pipeline['steps']),
                                'executionStarted': False, 'studioHash': ops.digest(pipeline)})
        except (ValueError, TypeError, AttributeError, KeyError, StopIteration, OSError, yaml.YAMLError):
            return jsonify({'error': 'The saved configuration or pipeline could not be verified. Reload before retrying.'}), 400
