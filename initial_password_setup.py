"""Reference-only initial host/CVM password setup core.

The caller owns authorization, the exact confirmation, the server live-enable
flag, exclusive cluster job locking, and durable atomic checkpoint storage.
No network work occurs at import. This module never enables or creates accounts.

Injected ssh signature: (python_path, node, credential, action, replacement=None)
-> dict. Actions: inspect, verify, change, probe. node contains role and account; a host
verification also carries an in-memory account_credential. Results contain ok,
identity, version; CVM inspect adds cvms/hosts. Identity is machine-id bound to
the configured SSH pin. Host verification uses PAM su from nobody. Selected
admin replacement additionally authenticates fresh admin SSH before verification
is persisted and becomes the access credential for subsequent host accounts.
PAM verification of root/nutanix does not establish direct SSH access to them.
Unsupported PAM/sudo/prompt policy fails closed.
This fixed-command adapter requires target-version lab validation before the
server live flag is enabled (including CVM synchronization and AHV PAM policy).

State is JSON containing workflow, canonical config, and ordered targets.
Keys are cvm:<canonical-ip>:nutanix or host:<canonical-ip>:<account>.
Reconcile selection is exactly 'current' or 'replacement', shared by the chosen
target_keys. All members of the cluster-wide CVM operation must be reconciled
together. Reconciliation tests both credentials and requires exactly one to
authenticate; it does not write passwords. No automatic retry or rollback of
an uncertain write is permitted.
"""
import base64
import copy
import hashlib
import ipaddress
import json
from pathlib import Path
import re
import subprocess
import sys
import time

WORKFLOW = 'initial-host-cvm-password-setup'
CONFIRMATION = 'SET INITIAL HOST AND CVM PASSWORDS'
ACCOUNTS = ('root', 'admin', 'nutanix')
STATUSES = ('preflight', 'pending', 'change_attempted', 'verified')


def _ip(value):
    if not isinstance(value, str) or '%' in value:
        raise ValueError('Invalid IP address')
    addr = ipaddress.ip_address(value)
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    return str(addr)


def _ref(value):
    return isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', value)


def validate_intent(config):
    """Return safe, non-input-reflecting errors for the strict reference schema."""
    try:
        if not isinstance(config, dict):
            raise ValueError()
        required = {'cluster_name', 'host_key_evidence', 'cvms', 'hosts'}
        if not required <= set(config) or set(config) - required - {'datacenter'}:
            raise ValueError()
        for key in ('cluster_name', 'host_key_evidence', 'datacenter'):
            if key in config and (not isinstance(config[key], str) or not config[key].strip()
                                  or len(config[key]) > 2048
                                  or any(ord(c) < 32 or ord(c) == 127 for c in config[key])):
                raise ValueError()
        seen = set()
        pairs = set()
        for group in ('cvms', 'hosts'):
            nodes = config[group]
            if not isinstance(nodes, list) or not 1 <= len(nodes) <= 64:
                raise ValueError()
            for node in nodes:
                fields = {'address', 'ssh_host_key_sha256'} | (
                    {'current_credential_ref', 'replacement_credential_ref'} if group == 'cvms'
                    else {'access_credential_ref', 'accounts'})
                if not isinstance(node, dict) or set(node) != fields:
                    raise ValueError()
                address = _ip(node['address'])
                if address in seen:
                    raise ValueError()
                seen.add(address)
                pin = node['ssh_host_key_sha256']
                if not isinstance(pin, str) or not re.fullmatch(r'SHA256:[A-Za-z0-9+/]{43}', pin):
                    raise ValueError()
                if group == 'hosts':
                    if not _ref(node['access_credential_ref']):
                        raise ValueError()
                    accounts = node['accounts']
                    if not isinstance(accounts, list) or not 1 <= len(accounts) <= 3:
                        raise ValueError()
                else:
                    accounts = [node]
                users = set()
                for account in accounts:
                    if group == 'hosts':
                        if not isinstance(account, dict) or set(account) != {
                                'username', 'current_credential_ref', 'replacement_credential_ref'}:
                            raise ValueError()
                        user = account['username']
                        if not isinstance(user, str) or user not in ACCOUNTS or user in users:
                            raise ValueError()
                        users.add(user)
                    old, new = (account[k] for k in ('current_credential_ref', 'replacement_credential_ref'))
                    if not _ref(old) or not _ref(new) or old == new:
                        raise ValueError()
                    if group == 'cvms':
                        pairs.add((old, new))
        if len(pairs) != 1:
            raise ValueError()
    except (ValueError, TypeError, KeyError):
        return ['Invalid initial-password intent: require strict reference-only fields, both inventories, unique IPs, pinned keys and distinct credential pairs']
    return []


def _canonical(config):
    if validate_intent(config):
        raise ValueError('Invalid initial-password intent')
    result = copy.deepcopy(config)
    for group in ('cvms', 'hosts'):
        for node in result[group]:
            node['address'] = _ip(node['address'])
            if group == 'hosts':
                node['accounts'].sort(key=lambda a: a['username'])
        result[group].sort(key=lambda n: n['address'])
    return result


def _targets(config):
    targets = []
    for role, group in (('cvm', 'cvms'), ('host', 'hosts')):
        for node in config[group]:
            for account in ([dict(node, username='nutanix')] if role == 'cvm' else node['accounts']):
                targets.append({'key': role + ':' + node['address'] + ':' + account['username'],
                                'role': role, 'address': node['address'], 'username': account['username'],
                                'current_credential_ref': account['current_credential_ref'],
                                'replacement_credential_ref': account['replacement_credential_ref'],
                                'status': 'preflight'})
    return targets


def resolve_credentials(config, lookup):
    config = _canonical(config)
    refs = {t[k] for t in _targets(config)
            for k in ('current_credential_ref', 'replacement_credential_ref')}
    refs.update(n['access_credential_ref'] for n in config['hosts'])
    result = {}
    try:
        for ref in sorted(refs):
            user, password, error = lookup(ref)
            if error or user not in ACCOUNTS or not isinstance(password, str) or not password:
                raise ValueError()
            if any(ord(c) < 32 or ord(c) == 127 for c in password):
                raise ValueError()
            result[ref] = (user, password)
        for target in _targets(config):
            old, new = (result[target[k]] for k in ('current_credential_ref', 'replacement_credential_ref'))
            if old[0] != target['username'] or new[0] != old[0] or old[1] == new[1]:
                raise ValueError()
        for node in config['hosts']:
            access = result[node['access_credential_ref']]
            if access[0] not in ('root', 'admin'):
                raise ValueError()
            for account in node['accounts']:
                if account['username'] == access[0] and access != result[account['current_credential_ref']]:
                    raise ValueError()
    except Exception:
        raise ValueError('Required credential unavailable, unsafe, mismatched or unchanged') from None
    return result


def _version(value, role):
    # Full numeric release or known on-disk vendor wrappers, never substring guesses.
    if not isinstance(value, str):
        raise ValueError('Unknown observed version')
    value = value.strip()
    pattern = (r'(?:el\d+(?:\.\d+)?-release-)?(\d+\.\d+\.\d+\.\d+)(?:-stable)?'
               if role == 'cvm' else r'(?:Nutanix (?:AHV|Acropolis)(?: version)? )?(\d+\.\d+\.\d+\.\d+-\d+)')
    match = re.fullmatch(pattern, value)
    if not match:
        raise ValueError('Unknown observed version')
    numbers = tuple(int(n) for n in re.split(r'[.-]', match[1]))
    if numbers < ((7, 5, 1, 8) if role == 'cvm' else (11, 0, 1, 3, 23)):
        raise ValueError('Observed version below minimum')
    return match[1]


def ssh_request(python_path, node, credential, action, replacement=None):
    """Secrets travel only in the captured child's stdin, never argv/env/files."""
    try:
        proc = subprocess.run([str(python_path), str(Path(__file__).resolve()), '--ssh-worker'],
                              input=json.dumps(dict(node=node, credential=credential, action=action,
                                                    replacement=replacement)),
                              text=True, capture_output=True, timeout=120, shell=False)
        result = json.loads(proc.stdout)
        if proc.returncode or result.get('ok') is not True:
            raise ValueError()
        return result
    except Exception:
        raise RuntimeError('Pinned SSH operation failed; inspect runtime, policy and credentials') from None


def _state(config, state):
    expected = _targets(config)
    if state is None:
        return {'workflow': WORKFLOW, 'config': config, 'targets': expected}
    state = copy.deepcopy(state)
    if not isinstance(state, dict) or set(state) != {'workflow', 'config', 'targets'}:
        raise ValueError('Invalid state')
    if state['workflow'] != WORKFLOW or state['config'] != config or not isinstance(state['targets'], list):
        raise ValueError('Resume configuration mismatch')
    if len(expected) != len(state['targets']):
        raise ValueError('Invalid targets')
    for target, base in zip(state['targets'], expected):
        if not isinstance(target, dict) or set(target) - set(base) - {'identity', 'version'}:
            raise ValueError('Invalid target state')
        if any(target.get(k) != v for k, v in base.items() if k != 'status'):
            raise ValueError('Invalid target identity')
        if target.get('status') not in STATUSES:
            raise ValueError('Invalid target status')
        if target['status'] != 'preflight' and (not isinstance(target.get('identity'), str)
                                               or not target.get('identity') or not isinstance(target.get('version'), str)):
            raise ValueError('Missing observed identity')
    return state


def _node(config, target):
    node = next(n for n in config['cvms' if target['role'] == 'cvm' else 'hosts']
                if n['address'] == target['address'])
    return dict(node, role=target['role'], account=target['username'],
                expected_identity=target.get('identity'))


def _access(config, target, credentials, state):
    if target['role'] == 'cvm':
        return credentials[target['replacement_credential_ref'] if target['status'] == 'verified'
                           else target['current_credential_ref']]
    node = _node(config, target)
    access = credentials[node['access_credential_ref']]
    # A persisted verified admin has passed fresh replacement SSH, not only
    # a PAM check through root. Prefer it even if root was the initial access.
    for other in state['targets']:
        if (other['role'] == 'host' and other['address'] == target['address']
                and other['username'] == 'admin' and other['status'] == 'verified'):
            return credentials[other['replacement_credential_ref']]
    for other in state['targets']:
        if other['address'] == target['address'] and other['username'] == access[0]:
            if other['status'] == 'verified':
                return credentials[other['replacement_credential_ref']]
            if other['status'] == 'change_attempted':
                raise ValueError('Access credential requires reconciliation')
    return access


def _observe(target, result):
    if not isinstance(result, dict) or result.get('ok') is not True:
        raise ValueError('SSH request failed')
    identity = result.get('identity')
    if not isinstance(identity, str) or not re.fullmatch(r'[a-f0-9]{32}:SHA256:[A-Za-z0-9+/]{43}', identity):
        raise ValueError('Missing machine identity')
    if target.get('identity') and target['identity'] != identity:
        raise ValueError('Machine identity changed')
    version = _version(result.get('version'), target['role'])
    target.update(identity=identity, version=version)


def _request(config, target, credentials, state, python_path, ssh, action, choice=None):
    node = _node(config, target)
    selected = credentials[target[(choice or ('replacement' if target['status'] == 'verified' else 'current')) + '_credential_ref']]
    credential = selected if target['role'] == 'cvm' else _access(config, target, credentials, state)
    if target['role'] == 'host':
        node['account_credential'] = selected
    result = ssh(python_path, node, credential, action,
                 credentials[target['replacement_credential_ref']][1] if action == 'change' else None)
    _observe(target, result)
    if result['identity'].split(':', 1)[1] != node['ssh_host_key_sha256']:
        raise ValueError('Pin mismatch')
    return result


def _save(state, checkpoint):
    if checkpoint(copy.deepcopy(state)) is False:
        raise RuntimeError('Durable checkpoint refused')


def execute(config, credentials, python_path, emit, cancelled=lambda: False,
            dry_run=False, state=None, checkpoint=lambda state: None, ssh=ssh_request):
    """Return (success, reference-only state); failures never include raw errors."""
    result = None
    phase, target_key = 'intent validation', '-'
    try:
        config = _canonical(config)
        credentials = resolve_credentials(config, lambda ref: (*credentials[ref], None))
        result = _state(config, state)
        if any(t['status'] == 'change_attempted' for t in result['targets']):
            raise ValueError('Explicit reconciliation required')
        for node in config['hosts']:
            users = {a['username'] for a in node['accounts']}
            if credentials[node['access_credential_ref']][0] == 'root' and 'root' in users and 'admin' not in users:
                raise ValueError('Root initial access requires selected admin SSH handoff before changing root')

        def stop():
            if cancelled():
                raise RuntimeError('Cancelled')

        # Every account on every endpoint must pass before the first mutation.
        for target in result['targets']:
            phase, target_key = 'preflight', target['key']
            emit(f'[CHECK] {phase} {target_key}')
            stop()
            observed = _request(config, target, credentials, result, python_path, ssh, 'inspect')
            if target['role'] == 'cvm':
                for field in ('cvms', 'hosts'):
                    addresses = observed.get(field)
                    if not isinstance(addresses, list):
                        raise ValueError('Missing membership')
                    canonical = [_ip(a) for a in addresses]
                    if len(set(canonical)) != len(canonical) or set(canonical) != {n['address'] for n in config[field]}:
                        raise ValueError('Membership mismatch')
            if target['status'] != 'verified':
                target['status'] = 'pending'
            emit(f"[PASS] preflight {target_key} version={target['version']}")
        phase = 'preflight checkpoint'
        _save(result, checkpoint)
        if dry_run:
            emit('[PASS] Read-only preflight completed; no passwords changed')
            return True, result
        cvms = [t for t in result['targets'] if t['role'] == 'cvm']
        pending = [t for t in cvms if t['status'] != 'verified']
        if pending and len(pending) != len(cvms):
            raise ValueError('CVM state must be reconciled as one cluster operation')
        batches = ([cvms] if pending else []) + [[t] for t in result['targets']
                                                  if t['role'] == 'host' and t['status'] != 'verified']
        for batch in batches:
            stop()
            # Capture access before marking an access account uncertain.
            target = batch[0]
            node = _node(config, target)
            access = _access(config, target, credentials, result)
            node['account_credential'] = credentials[target['current_credential_ref']]
            # Fresh pin, identity, version and selected authentication before write.
            phase, target_key = 'current verification', target['key']
            emit(f'[VERIFY] current {target_key}')
            _request(config, target, credentials, result, python_path, ssh, 'verify', 'current')
            for item in batch:
                item['status'] = 'change_attempted'
            phase = 'change checkpoint'
            _save(result, checkpoint)  # failure MUST prevent the write
            stop()
            phase = 'password change'
            emit(f'[CHECK] {phase} {target_key}')
            changed = ssh(python_path, node, access, 'change', credentials[target['replacement_credential_ref']][1])
            _observe(target, changed)
            # Wait once for cluster synchronization; never retry password login
            # failures, which can exhaust target-side authentication limits.
            if target['role'] == 'cvm':
                phase = 'CVM synchronization wait'
                emit(f'[CHECK] {phase} {target_key}')
                time.sleep(10)
            for item in batch:
                phase, target_key = 'replacement verification', item['key']
                emit(f'[VERIFY] replacement {target_key}')
                stop()
                if item['role'] == 'host':
                    # Use admin replacement SSH for the verification request
                    # itself, BEFORE marking the durable target verified. This
                    # simultaneously tests the PAM password and the SSH handoff.
                    verify_state = copy.deepcopy(result)
                    for other in verify_state['targets']:
                        if other['key'] == item['key']:
                            other['status'] = 'verified'
                    _request(config, item, credentials, verify_state, python_path, ssh, 'verify', 'replacement')
                else:
                    _request(config, item, credentials, result, python_path, ssh, 'verify', 'replacement')
                method = 'SSH' if item['role'] == 'cvm' else 'SSH+PAM' if item['username'] == 'admin' else 'PAM'
                emit(f"[PASS] replacement {target_key} version={item['version']} method={method}")
            # All CVMs transition together; a partial sync remains uncertain.
            for item in batch:
                item['status'] = 'verified'
            try:
                phase = 'verification checkpoint'
                _save(result, checkpoint)
            except Exception:
                for item in batch:
                    item['status'] = 'change_attempted'
                raise
        emit('[PASS] Selected passwords verified; admin handoffs use fresh SSH; root/nutanix verification uses PAM, not direct account SSH')
        return True, result
    except Exception:
        emit(f'[FAIL] phase={phase} target={target_key}; Initial password setup stopped; inspect state. Reconcile change_attempted targets explicitly; never retry or roll back blindly')
        return False, result


def reconcile(config, credentials, python_path, state, target_keys, selection,
              emit, checkpoint, ssh=ssh_request):
    """Read-only administrator reconciliation; returns (success, state).

    Authentication exceptions are inconclusive, never evidence that a password
    was rejected. Adapter must explicitly return authenticated=False for an
    authentication rejection; identity must still have been validated first.
    """
    result = None
    phase, target_key = 'reconciliation validation', '-'
    try:
        config = _canonical(config)
        credentials = resolve_credentials(config, lambda ref: (*credentials[ref], None))
        result = _state(config, state)
        if selection not in ('current', 'replacement') or not isinstance(target_keys, list) or not target_keys:
            raise ValueError()
        if len(set(target_keys)) != len(target_keys):
            raise ValueError()
        chosen = [t for t in result['targets'] if t['key'] in target_keys]
        if len(chosen) != len(target_keys) or any(t['status'] != 'change_attempted' for t in chosen):
            raise ValueError()
        cvms = [t for t in result['targets'] if t['role'] == 'cvm']
        if any(t['role'] == 'cvm' for t in chosen) and not all(t in chosen for t in cvms):
            raise ValueError()
        selected_state = copy.deepcopy(result)
        for target in selected_state['targets']:
            if target['key'] in target_keys:
                target['status'] = 'verified' if selection == 'replacement' else 'pending'
        # First authenticate the administrator's selected secret and validate
        # saved machine identity. Only then test the competing credential.
        for target in chosen:
            phase, target_key = 'reconciliation identity verification', target['key']
            emit(f'[VERIFY] selected {target_key}')
            _request(config, target, credentials, selected_state, python_path, ssh, 'verify', selection)
        updates = []
        for target in chosen:
            node = _node(config, target)
            # Identity is read with a known usable access credential first. For
            # CVMs both candidates may be needed; transport failures remain fatal.
            results = {}
            for choice in ('current', 'replacement'):
                phase, target_key = 'reconciliation ' + choice + ' probe', target['key']
                emit(f'[CHECK] {phase} {target_key}')
                selected = credentials[target[choice + '_credential_ref']]
                if target['role'] == 'cvm':
                    access = selected
                    node['probe_alternate'] = credentials[target[
                        ('replacement' if choice == 'current' else 'current') + '_credential_ref']]
                else:
                    access = _access(config, target, credentials, selected_state)
                    node['account_credential'] = selected
                observed = ssh(python_path, node, access, 'probe', None)
                _observe(target, observed)
                if observed['identity'].split(':', 1)[1] != node['ssh_host_key_sha256']:
                    raise ValueError()
                if type(observed.get('authenticated')) is not bool:
                    raise ValueError()
                results[choice] = observed['authenticated']
            if results[selection] is not True or results['current' if selection == 'replacement' else 'replacement'] is not False:
                raise ValueError('Ambiguous reconciliation')
            updates.append(target)
            emit(f"[PASS] reconciliation {target_key} version={target['version']}")
        for target in updates:
            target['status'] = 'verified' if selection == 'replacement' else 'pending'
        try:
            phase = 'reconciliation checkpoint'
            _save(result, checkpoint)
        except Exception:
            for target in updates:
                target['status'] = 'change_attempted'
            raise
        emit('[PASS] Read-only reconciliation completed')
        return True, result
    except Exception:
        emit(f'[FAIL] phase={phase} target={target_key}; Reconciliation inconclusive; no passwords changed')
        return False, result


def _read(client, command):
    _, stdout, _ = client.exec_command(command, timeout=15)
    data = stdout.read(16385)
    if len(data) > 16384 or stdout.channel.recv_exit_status():
        raise RuntimeError('Read-only command failed')
    return data.decode('utf-8').strip()


def _sudo_status(client, account, access_password):
    """Bounded read-only status check; sudo receives one password via SSH stdin.

    No PTY/echo, password argv, prompt/output logging, or sudoers changes. A
    NOPASSWD rule may leave stdin unread; password sudo consumes its single line.
    Drain both channels with a shared deadline and output cap before exit status.
    """
    commands = {
        'root': "sudo -S -p '' passwd -S root",
        'admin': "sudo -S -p '' passwd -S admin",
        'nutanix': "sudo -S -p '' passwd -S nutanix",
    }
    channel = None
    try:
        command = commands[account]
        if not isinstance(access_password, str) or not access_password or any(
                ord(c) < 32 or ord(c) == 127 for c in access_password):
            raise ValueError()
        deadline = time.monotonic() + 15
        stdin, stdout, _ = client.exec_command(command, timeout=15, get_pty=False)
        channel = stdout.channel
        try:
            stdin.write(access_password + '\n')
            stdin.flush()
            stdin.channel.shutdown_write()
        except Exception:
            # Fast NOPASSWD commands can finish and close stdin before sending.
            # Only an already-finished command may proceed to exit/output checks.
            if not channel.exit_status_ready():
                raise
        output, received = bytearray(), 0
        while time.monotonic() < deadline:
            if channel.recv_ready():
                data = channel.recv(4096)
                output.extend(data)
                received += len(data)
            if channel.recv_stderr_ready():
                received += len(channel.recv_stderr(4096))
            if received > 16384:
                raise RuntimeError()
            if channel.exit_status_ready() and not channel.recv_ready() and not channel.recv_stderr_ready():
                if channel.recv_exit_status():
                    raise RuntimeError()
                return output.decode('utf-8').strip()
            time.sleep(0.05)
        raise RuntimeError()
    except Exception:
        raise RuntimeError('Read-only sudo account status check failed') from None
    finally:
        if channel is not None:
            try:
                channel.close()
            except Exception:
                pass  # Never expose transport cleanup details or output.


def _dialog(client, command, access_password, account_password=None, replacement=None):
    """Strict English prompt adapter; unknown/localized prompts fail closed."""
    channel = client.get_transport().open_session(timeout=15)
    try:
        channel.get_pty()
        channel.exec_command(command)
        buffer, counts = '', dict.fromkeys(('sudo', 'password', 'new', 'repeat'), 0)
        deadline = time.monotonic() + 65
        while time.monotonic() < deadline:
            if channel.recv_ready():
                buffer = (buffer + channel.recv(4096).decode(errors='replace'))[-8192:]
                lower = buffer.lower()
                kind = None
                if re.search(r'ztf-sudo:\s*$', lower) or re.search(r'\[sudo\] password for (?:root|admin|nutanix):\s*$', lower):
                    kind = 'sudo'
                elif re.search(r'retype (?:new )?password:\s*$', lower):
                    kind = 'repeat'
                elif re.search(r'new password:\s*$', lower):
                    kind = 'new'
                elif re.search(r'(?:\(?(?:current|old)\)?(?: unix)? )?password:\s*$', lower):
                    kind = 'password'
                if kind:
                    counts[kind] += 1
                    if counts[kind] > 1:
                        raise RuntimeError('Repeated password prompt')
                    value = (access_password if kind == 'sudo' else replacement if kind in ('new', 'repeat')
                             else account_password)
                    if value is None:
                        raise RuntimeError('Unexpected prompt')
                    channel.sendall(value + '\n')
                    buffer = ''
            if channel.exit_status_ready() and not channel.recv_ready():
                status = channel.recv_exit_status()
                if replacement is not None:
                    if status or counts['new'] != 1 or counts['repeat'] != 1:
                        raise RuntimeError('Password write failed')
                    return True
                if counts['password'] != 1:
                    raise RuntimeError('PAM password was not tested')
                # Only explicit PAM auth rejection is negative evidence. Policy,
                # shell and command failures are inconclusive.
                if status and 'authentication failure' in buffer.lower():
                    return False
                if status:
                    raise RuntimeError('PAM verification inconclusive')
                return True
            time.sleep(0.05)
        raise RuntimeError('Prompt timeout')
    finally:
        channel.close()


def ssh_worker(data):
    """Fixed command allowlist in the existing Paramiko legacy interpreter."""
    import paramiko
    node, credential, action = data['node'], data['credential'], data['action']
    role, account = node['role'], node['account']
    if role not in ('cvm', 'host') or account not in ACCOUNTS or action not in ('inspect', 'verify', 'change', 'probe'):
        raise ValueError()
    if credential[0] not in (('nutanix',) if role == 'cvm' else ('root', 'admin')):
        raise ValueError()
    _ip(node['address'])

    class PinnedKey(paramiko.MissingHostKeyPolicy):
        def missing_host_key(self, client, hostname, key):
            actual = 'SHA256:' + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip('=')
            if actual != node['ssh_host_key_sha256']:
                raise RuntimeError('SSH host key changed')

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(PinnedKey())
    try:
        authenticated = True
        try:
            client.connect(node['address'], username=credential[0], password=credential[1],
                           allow_agent=False, look_for_keys=False, timeout=12, auth_timeout=12, banner_timeout=12)
        except paramiko.AuthenticationException:
            if action != 'probe' or role != 'cvm':
                raise RuntimeError('Authentication failed; identity unavailable') from None
            authenticated = False
            client.close()
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(PinnedKey())
            alternate = node['probe_alternate']
            client.connect(node['address'], username='nutanix', password=alternate[1],
                           allow_agent=False, look_for_keys=False, timeout=12, auth_timeout=12, banner_timeout=12)
            credential = alternate
        identity = _read(client, 'cat /etc/machine-id')
        if not re.fullmatch(r'[a-f0-9]{32}', identity):
            raise RuntimeError('Unknown machine identity')
        result = {'ok': True, 'identity': identity + ':' + node['ssh_host_key_sha256'],
                  'version': _read(client, 'cat /etc/nutanix/release_version' if role == 'cvm'
                                   else 'cat /etc/nutanix-release')}
        if node.get('expected_identity') and node['expected_identity'] != result['identity']:
            raise RuntimeError('Machine identity changed')
        _version(result['version'], role)
        prefix = '' if credential[0] == 'root' else "sudo -S -p 'ZTF-SUDO:' "
        if role == 'cvm':
            status = _sudo_status(client, 'nutanix', credential[1])
        else:
            # No dynamic account text: choose complete literals from an allowlist.
            status = (_sudo_status(client, account, credential[1]) if prefix else
                      _read(client, dict(root='passwd -S root', admin='passwd -S admin', nutanix='passwd -S nutanix')[account]))
        status_fields = status.split()
        if len(status_fields) < 2 or status_fields[0] != account or status_fields[1] not in ('PS', 'P'):
            raise RuntimeError('Account missing, locked or without password')
        if role == 'cvm':
            if action == 'inspect':
                result.update(cvms=_read(client, 'svmips').split(), hosts=_read(client, 'hostips').split())
            if action == 'change':
                _dialog(client, 'sudo passwd nutanix', credential[1], credential[1], data['replacement'])
            if action == 'probe':
                result['authenticated'] = authenticated
        else:
            commands = {
                'root': 'runuser -u nobody -- su - root -c /usr/bin/true',
                'admin': 'runuser -u nobody -- su - admin -c /usr/bin/true',
                'nutanix': 'runuser -u nobody -- su - nutanix -c /usr/bin/true',
            }
            if action == 'change':
                _dialog(client, prefix + dict(root='passwd root', admin='passwd admin', nutanix='passwd nutanix')[account],
                        credential[1], node['account_credential'][1], data['replacement'])
            else:
                authenticated = _dialog(client, prefix + commands[account], credential[1], node['account_credential'][1])
                if action == 'probe':
                    result['authenticated'] = authenticated
                elif not authenticated:
                    raise RuntimeError('Selected password rejected')
        return result
    finally:
        client.close()


if __name__ == '__main__':
    try:
        if sys.argv[1:] != ['--ssh-worker']:
            raise ValueError()
        output = ssh_worker(json.loads(sys.stdin.read()))
    except Exception:
        output = {'ok': False}
    print(json.dumps(output))
    sys.exit(0 if output['ok'] else 1)
