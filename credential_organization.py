"""Non-secret credential labels; never part of the runtime credential resolver."""
import re


def empty_organization():
    return {'version': 1, 'revision': 0, 'groups': [], 'assignments': {}}


def validate_organization(value):
    def text(item, limit=120, empty=False):
        return isinstance(item, str) and len(item) <= limit and (empty or bool(item.strip())) and not any(ord(c) < 32 for c in item)

    if not isinstance(value, dict) or set(value) != {'version', 'revision', 'groups', 'assignments'}:
        raise ValueError('Expected version, revision, groups and assignments only.')
    if type(value['version']) is not int or value['version'] != 1 or type(value['revision']) is not int or value['revision'] < 0:
        raise ValueError('Unsupported credential grouping version or revision.')
    groups, assignments = value['groups'], value['assignments']
    if not isinstance(groups, list) or len(groups) > 500 or not isinstance(assignments, dict) or len(assignments) > 10000:
        raise ValueError('Invalid credential grouping size or shape.')
    ids, names = set(), set()
    for group in groups:
        if not isinstance(group, dict) or set(group) != {'id', 'name', 'datacenter', 'kind'}:
            raise ValueError('Groups contain id, name, datacenter and kind only.')
        gid = group['id']
        if not isinstance(gid, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', gid) or gid in ids:
            raise ValueError('Group identifiers must be unique and valid.')
        if group['kind'] not in ('cluster', 'shared') or not text(group['name']) or not text(group['datacenter'], empty=group['kind'] == 'shared'):
            raise ValueError('Cluster groups require a name and datacenter; shared groups require a name.')
        name = (group['kind'], group['datacenter'].strip().casefold(), group['name'].strip().casefold())
        if name in names:
            raise ValueError('Group names must be unique within their datacenter and kind.')
        ids.add(gid)
        names.add(name)
    for ref, assignment in assignments.items():
        if not text(ref, 256) or not isinstance(assignment, dict) or set(assignment) != {'groupId', 'purpose'}:
            raise ValueError('Assignments contain a reference, groupId and purpose only; never passwords.')
        if not text(assignment['groupId'], 80, empty=True) or (assignment['groupId'] != '' and assignment['groupId'] not in ids):
            raise ValueError('An assignment points to an unknown group.')
        if not text(assignment['purpose'], empty=True):
            raise ValueError('Credential purpose must be plain text of at most 120 characters.')
    return value
