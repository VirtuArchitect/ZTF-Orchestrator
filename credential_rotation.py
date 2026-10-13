"""Controlled-UAT CVM and Dell iDRAC password rotation.

Only credential references belong in persisted intent. SSH runs in the existing
legacy ZTF Python environment; secrets travel over stdin, never command arguments.
"""
import base64
import hashlib
import ipaddress
import json
from pathlib import Path
import re
import ssl
import subprocess
import sys
import threading
import time
import urllib.request

WORKFLOW = 'cvm-idrac-password-rotation'
CONFIRMATION = 'ROTATE CVM AND IDRAC PASSWORDS'
ROTATION_LOCK = threading.Lock()


def validate_intent(config):
    errors = []
    if not isinstance(config, dict):
        return ['Intent must be a YAML mapping']
    if set(config) - {'aos_version', 'cvms', 'idracs', 'idrac_followup_acknowledged'}:
        errors.append('Only documented intent fields and credential references are allowed')
    if config.get('aos_version') != '7.5.1.8':
        errors.append('This controlled-UAT workflow is scoped to AOS 7.5.1.8')
    for group in ('cvms', 'idracs'):
        nodes = config.get(group, [])
        if not isinstance(nodes, list) or len(nodes) > 64:
            errors.append(f'{group} must be a list of at most 64 nodes')
            continue
        seen = set()
        for node in nodes:
            allowed = {'address', 'current_credential_ref', 'replacement_credential_ref'}
            if group == 'cvms':
                allowed.add('ssh_host_key_sha256')
            if not isinstance(node, dict) or set(node) - allowed:
                errors.append(f'{group}: unexpected fields; never embed passwords')
                continue
            try:
                address = str(ipaddress.ip_address(node.get('address', '')))
                if address in seen:
                    raise ValueError()
                seen.add(address)
            except ValueError:
                errors.append(f'{group}: addresses must be unique IP addresses')
            for key in ('current_credential_ref', 'replacement_credential_ref'):
                if not isinstance(node.get(key), str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', node[key]):
                    errors.append(f'{group}: {key} must be a credential reference')
            if node.get('current_credential_ref') == node.get('replacement_credential_ref'):
                errors.append(f'{group}: use distinct current and replacement references')
            if group == 'cvms' and not re.fullmatch(r'SHA256:[A-Za-z0-9+/]{43}', str(node.get('ssh_host_key_sha256', ''))):
                errors.append('Each CVM requires an independently verified SHA256 SSH host-key fingerprint')
    if not config.get('cvms') and not config.get('idracs'):
        errors.append('Select at least one CVM or iDRAC')
    if config.get('idracs') and config.get('idrac_followup_acknowledged') is not True:
        errors.append('Acknowledge manual Nutanix host IPMI credential synchronization and external consumer updates')
    # One cluster-wide change requires one common old/new credential pair.
    if isinstance(config.get('cvms'), list):
        pairs = {(n.get('current_credential_ref'), n.get('replacement_credential_ref'))
                 for n in config['cvms'] if isinstance(n, dict)
                 and isinstance(n.get('current_credential_ref'), str)
                 and isinstance(n.get('replacement_credential_ref'), str)}
        if len(pairs) > 1:
            errors.append('All CVMs must belong to one cluster and share the same credential references')
    return errors


def resolve_credentials(config, lookup):
    credentials = {}
    for group in ('cvms', 'idracs'):
        for node in config.get(group, []):
            for key in ('current_credential_ref', 'replacement_credential_ref'):
                ref = node[key]
                if ref not in credentials:
                    user, password, error = lookup(ref)
                    if error or not user or not password:
                        raise ValueError('A required credential reference is unavailable')
                    if not re.fullmatch(r'[A-Za-z0-9_.@-]{1,128}', user):
                        raise ValueError('Credential username contains unsupported characters')
                    if any(ord(c) < 32 or ord(c) == 127 for c in password):
                        raise ValueError('Passwords cannot contain terminal control characters')
                    credentials[ref] = (user, password)
            old, new = (credentials[node[key]] for key in ('current_credential_ref', 'replacement_credential_ref'))
            if old[0] != new[0] or (group == 'cvms' and old[0] != 'nutanix'):
                raise ValueError('Rotation changes passwords only; CVM username must be nutanix')
            if old[1] == new[1]:
                raise ValueError('Replacement password must differ from the current password')
    return credentials


def ssh_request(python_path, node, credential, action, replacement=None):
    request = {'node': node, 'credential': credential, 'action': action, 'replacement': replacement}
    # No shell, environment secret, temporary secret file, or raw child output.
    try:
        proc = subprocess.run([python_path, str(Path(__file__).resolve()), '--ssh-worker'],
                              input=json.dumps(request), text=True, capture_output=True, timeout=110)
        result = json.loads(proc.stdout)
        if proc.returncode or result.get('ok') is not True:
            raise ValueError()
        return result
    except Exception:
        raise RuntimeError('CVM SSH operation failed; verify runtime, pinned host key, credentials, and password policy') from None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise RuntimeError('Redfish redirects are not allowed')


def redfish(address, credential, path, method='GET', body=None):
    # Reject foreign/absolute links to prevent forwarding credentials off-target.
    if not isinstance(path, str) or not re.fullmatch(r'/redfish/v1/[A-Za-z0-9_./-]*', path) or '..' in path:
        raise ValueError('Invalid Redfish resource link')
    host = str(ipaddress.ip_address(address))
    if ':' in host:
        host = f'[{host}]'
    token = base64.b64encode(f'{credential[0]}:{credential[1]}'.encode()).decode()
    req = urllib.request.Request(f'https://{host}{path}', method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': f'Basic {token}', 'Accept': 'application/json',
                                          'Content-Type': 'application/json'})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(),
                                        urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    try:
        with opener.open(req, timeout=20) as response:
            if response.status not in (200, 204):
                raise RuntimeError()
            raw = response.read(1024 * 1024)
            return json.loads(raw) if raw else {}
    except Exception:
        raise RuntimeError('iDRAC request failed; verify trusted TLS, account permissions, credentials, and password policy') from None


def idrac_account(node, credential):
    managers = redfish(node['address'], credential, '/redfish/v1/Managers')
    # Scope to Dell iDRAC, with no guessed user IDs.
    links = [m.get('@odata.id') for m in managers.get('Members', [])]
    if '/redfish/v1/Managers/iDRAC.Embedded.1' not in links:
        raise RuntimeError('Target is not a supported Dell iDRAC')
    root = redfish(node['address'], credential, '/redfish/v1/')
    service = redfish(node['address'], credential, root['AccountService']['@odata.id'])
    if service.get('RequireChangePasswordAction') is True:
        raise RuntimeError('iDRAC requires an unsupported ChangePassword action')
    accounts = redfish(node['address'], credential, service['Accounts']['@odata.id'])
    matches = []
    for member in accounts.get('Members', []):
        path = member['@odata.id']
        account = redfish(node['address'], credential, path)
        if account.get('UserName') == credential[0] and account.get('Enabled') is True:
            matches.append(path)
    if len(matches) != 1:
        raise RuntimeError('An unambiguous enabled iDRAC account was not found')
    return matches[0]


def execute(config, credentials, python_path, emit, cancelled=lambda: False,
            ssh=ssh_request, rf=redfish, account_lookup=idrac_account, dry_run=False):
    """Preflight every target before changing anything; never retry a mutation."""
    results = []
    phase = 'preflight'
    try:
        accounts = {}
        for node in config.get('cvms', []):
            phase = f"CVM preflight {node['address']}"
            if cancelled():
                raise RuntimeError('Cancelled before mutation')
            ssh(python_path, node, credentials[node['current_credential_ref']], 'verify')
        if config.get('cvms'):
            phase = 'CVM cluster inventory check'
            node = config['cvms'][0]
            discovered = ssh(python_path, node, credentials[node['current_credential_ref']], 'discover')['addresses']
            expected = {str(ipaddress.ip_address(n['address'])) for n in config['cvms']}
            if set(discovered) != expected:
                raise RuntimeError('CVM inventory must include every CVM returned by svmips in exactly one cluster')
        for node in config.get('idracs', []):
            phase = f"iDRAC account preflight {node['address']}"
            if cancelled():
                raise RuntimeError('Cancelled before mutation')
            accounts[node['address']] = account_lookup(node, credentials[node['current_credential_ref']])
        emit('[PASS] All selected targets passed read-only authentication and identity checks')
        if dry_run:
            return True, results
        if config.get('cvms'):
            phase = 'CVM cluster password change'
            node = config['cvms'][0]
            if cancelled():
                raise RuntimeError('Cancelled before CVM mutation')
            results.append({'target': node['address'], 'operation': 'cvm_cluster_password',
                            'status': 'change_attempted', 'verifiedCvms': []})
            emit('[TARGET] ' + json.dumps(results[-1]))
            ssh(python_path, node, credentials[node['current_credential_ref']], 'change',
                credentials[node['replacement_credential_ref']][1])
            # Wait for synchronization without repeatedly trying credentials that
            # may not yet be active (which can trigger account lockout).
            for _ in range(10):
                if cancelled():
                    raise RuntimeError('Cancelled during CVM synchronization wait')
                time.sleep(1)
            for cvm in config['cvms']:
                phase = f"CVM replacement login {cvm['address']}"
                if cancelled():
                    raise RuntimeError('Cancelled during CVM verification')
                ssh(python_path, cvm, credentials[cvm['replacement_credential_ref']], 'verify')
                emit(f"[PASS] CVM {cvm['address']}: replacement password login verified")
                results[-1]['verifiedCvms'].append(cvm['address'])
            results[-1]['status'] = 'verified'
            emit('[TARGET] ' + json.dumps(results[-1]))
        for node in config.get('idracs', []):
            phase = f"iDRAC password change and verification {node['address']}"
            if cancelled():
                raise RuntimeError('Cancelled; inspect completed targets before resubmitting')
            old = credentials[node['current_credential_ref']]
            new = credentials[node['replacement_credential_ref']]
            path = accounts[node['address']]
            results.append({'target': node['address'], 'operation': 'idrac_password', 'status': 'change_attempted'})
            emit('[TARGET] ' + json.dumps(results[-1]))
            rf(node['address'], old, path, 'PATCH', {'Password': new[1]})
            verified = rf(node['address'], new, path)
            if verified.get('UserName') != new[0]:
                raise RuntimeError('iDRAC replacement credential identity verification failed')
            results[-1]['status'] = 'verified'
            emit('[TARGET] ' + json.dumps(results[-1]))
            emit(f"[PASS] iDRAC {node['address']}: replacement password login verified")
        if config.get('idracs'):
            emit('[ACTION REQUIRED] Synchronize Nutanix host IPMI credentials through the supported AOS procedure before relying on cluster power operations.')
        emit('[ACTION REQUIRED] Update connection-profile credential references and external consumers after reviewing verified targets. Original references were preserved.')
        return True, results
    except Exception:
        # Never serialize transport errors or output: either can contain secrets.
        emit(f'[FAIL] Rotation stopped during {phase}. Inspect per-target results; change_attempted means password state is uncertain. Do not blindly retry or roll back.')
        return False, results


def ssh_worker(data):
    """Runs only inside the already-installed ZTF SSH runtime."""
    import paramiko
    node = data['node']
    class PinnedKey(paramiko.MissingHostKeyPolicy):
        def missing_host_key(self, client, hostname, key):
            fingerprint = 'SHA256:' + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip('=')
            if fingerprint != node['ssh_host_key_sha256']:
                raise RuntimeError('SSH host key mismatch')
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(PinnedKey())
    try:
        client.connect(node['address'], username='nutanix', password=data['credential'][1],
                       allow_agent=False, look_for_keys=False, timeout=15, auth_timeout=15, banner_timeout=15)
        if data['action'] == 'verify':
            return {'ok': True}
        if data['action'] == 'discover':
            _, stdout, _ = client.exec_command('svmips', timeout=20)
            addresses = [str(ipaddress.ip_address(s)) for s in stdout.read(16384).decode().split()]
            if stdout.channel.recv_exit_status() or not addresses:
                raise RuntimeError()
            return {'ok': True, 'addresses': addresses}
        if data['action'] != 'change':
            raise ValueError()
        channel = client.get_transport().open_session(timeout=15)
        channel.get_pty()
        channel.exec_command('LC_ALL=C sudo passwd nutanix')
        buffer = ''
        counts = {'old': 0, 'new': 0, 'repeat': 0}
        deadline = time.monotonic() + 75
        while time.monotonic() < deadline:
            if channel.recv_ready():
                buffer = (buffer + channel.recv(4096).decode(errors='replace'))[-8192:]
                lower = buffer.lower()
                kind = None
                if re.search(r'retype (?:new )?password:\s*$', lower):
                    kind = 'repeat'
                elif re.search(r'new password:\s*$', lower):
                    kind = 'new'
                elif re.search(r'(?:\[sudo\].*password for nutanix|\(?(?:current|old)\)?(?: unix)? password):\s*$', lower):
                    kind = 'old'
                if kind:
                    counts[kind] += 1
                    if counts[kind] > (2 if kind == 'old' else 1):
                        raise RuntimeError('Unexpected password prompt')
                    channel.sendall((data['credential'][1] if kind == 'old' else data['replacement']) + '\n')
                    buffer = ''
            if channel.exit_status_ready() and not channel.recv_ready():
                if channel.recv_exit_status() or counts['new'] != 1 or counts['repeat'] != 1:
                    raise RuntimeError()
                return {'ok': True}
            time.sleep(0.05)
        raise RuntimeError('Password prompt timeout')
    finally:
        client.close()


if __name__ == '__main__':
    try:
        if sys.argv[1:] != ['--ssh-worker']:
            raise ValueError()
        result = ssh_worker(json.loads(sys.stdin.read()))
    except Exception:
        result = {'ok': False}
    print(json.dumps(result))
    sys.exit(0 if result['ok'] else 1)
