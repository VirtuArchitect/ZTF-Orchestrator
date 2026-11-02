"""Config labels only; execution documents and credential values are never modified."""
import re

PURPOSES = ('', 'Deployment', 'Post-configuration', 'Monitoring', 'Recovery', 'Shared template')


def empty_config_organization():
    return {'version': 1, 'revision': 0, 'assignments': {}}


def validate_config_organization(value):
    if not isinstance(value, dict) or set(value) != {'version', 'revision', 'assignments'}:
        raise ValueError('Invalid document')
    if type(value['version']) is not int or value['version'] != 1 or type(value['revision']) is not int or value['revision'] < 0:
        raise ValueError('Invalid revision')
    assignments = value['assignments']
    if not isinstance(assignments, dict) or len(assignments) > 10000:
        raise ValueError('Invalid assignments')
    for name, item in assignments.items():
        if not isinstance(name, str) or len(name) > 255 or '/' in name or '\\' in name or any(ord(c) < 32 for c in name) or not name.endswith(('.yml', '.yaml', '.json')):
            raise ValueError('Invalid filename')
        if not isinstance(item, dict) or set(item) != {'groupId', 'purpose'}:
            raise ValueError('Invalid assignment')
        if not isinstance(item['groupId'], str) or (item['groupId'] and not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', item['groupId'])) or item['purpose'] not in PURPOSES:
            raise ValueError('Invalid label')
    return value
