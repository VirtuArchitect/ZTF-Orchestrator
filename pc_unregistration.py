"""PC-side PE unregistration through the documented Prism v4.2 API.

Strict HTTPS only; no shell/SSH fallback, force cleanup or mutation retry.
Verification covers PC inventory, not PE-side cleanup or dependent services.
"""
import base64
import ipaddress
import json
import re
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

WORKFLOW = 'unregister-pe-from-pc'
SCRIPT = 'UnregisterPeFromPc'
LOCK = threading.Lock()
MAX_BYTES = 2 * 1024 * 1024
KEYS = {'pc_endpoint', 'pc_credential', 'pe_cluster_uuid', 'expected_pc_uuid',
        'expected_pe_name', 'dependencies_reviewed'}


class UnregistrationError(ValueError):
    """Only fixed, safe messages may cross the target boundary."""


def cluster_uuid(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', value):
        raise UnregistrationError('Provide a canonical cluster UUID.')
    parsed = uuid.UUID(value)
    if not parsed.int:
        raise UnregistrationError('The nil UUID is not a cluster identity.')
    return str(parsed)


def endpoint(value):
    if not isinstance(value, str) or len(value) > 300 or any(c.isspace() for c in value):
        raise UnregistrationError('Provide an HTTPS PC endpoint, without credentials or a path.')
    try:
        url = urllib.parse.urlsplit(value)
        host = url.hostname
        if url.scheme != 'https' or not host or url.username or url.password or url.path not in ('', '/') or url.query or url.fragment or url.port not in (None, 9440):
            raise ValueError()
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            if re.fullmatch(r'[0-9.]+', host) or not re.fullmatch(r'(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9-]{2,63}', host):
                raise ValueError()
        else:
            address = getattr(address, 'ipv4_mapped', None) or address
            if address.is_unspecified or address.is_multicast or address.is_loopback or address.is_link_local or '%' in host:
                raise ValueError()
        authority = f'[{host}]' if ':' in host else host
        return f'https://{authority}:9440'
    except (ValueError, TypeError):
        raise UnregistrationError('Use a specific PC HTTPS address on port 9440, without credentials or a path.') from None


def validate_intent(config, reviewed=False):
    if not isinstance(config, dict) or set(config) - KEYS:
        raise UnregistrationError('Use only the documented unregistration fields and credential references.')
    endpoint(config.get('pc_endpoint'))
    cluster_uuid(config.get('pe_cluster_uuid'))
    if not isinstance(config.get('pc_credential'), str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', config['pc_credential']):
        raise UnregistrationError('Provide a PC credential reference, not a password.')
    if 'dependencies_reviewed' in config and type(config['dependencies_reviewed']) is not bool:
        raise UnregistrationError('dependencies_reviewed must be a YAML boolean.')
    if 'expected_pc_uuid' in config:
        cluster_uuid(config['expected_pc_uuid'])
    name = config.get('expected_pe_name')
    if name is not None and (not isinstance(name, str) or not name.strip() or len(name) > 128 or any(ord(c) < 32 for c in name)):
        raise UnregistrationError('The expected PE name must be nonempty plain text.')
    if reviewed and (not config.get('expected_pc_uuid') or not name or config.get('dependencies_reviewed') is not True):
        raise UnregistrationError('Review the PC and PE identity and acknowledge dependent-service prerequisites before approval.')


def credentials(config, resolver):
    validate_intent(config)
    try:
        username, password = resolver(config['pc_credential'])
        if not isinstance(username, str) or not username or ':' in username or not isinstance(password, str) or not password:
            raise ValueError()
        return username, password
    except Exception:
        raise UnregistrationError('The PC credential reference is unavailable in the selected vault.') from None


class Client:
    def __init__(self, config, credential):
        self.base = endpoint(config['pc_endpoint'])
        self.headers = {'Accept': 'application/json', 'Content-Type': 'application/json',
                        'Authorization': 'Basic ' + base64.b64encode((':'.join(credential)).encode()).decode()}

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None

        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(),
                                                 urllib.request.HTTPSHandler(context=ssl.create_default_context()))

    def request(self, method, path, payload=None, absent=False):
        request = urllib.request.Request(self.base + path, method=method,
                                         data=json.dumps(payload).encode() if payload is not None else None,
                                         headers={**self.headers, **({'Ntnx-Request-Id': str(uuid.uuid4())} if method == 'POST' else {})})
        try:
            with self.opener.open(request, timeout=30) as response:
                raw = response.read(MAX_BYTES + 1)
                if len(raw) > MAX_BYTES:
                    raise ValueError()
                body = json.loads(raw)
                if not isinstance(body, dict) or 'data' not in body or body.get('error') or 'ErrorResponse' in str(body.get('data', {}).get('$objectType', '') if isinstance(body.get('data'), dict) else ''):
                    raise ValueError()
                return body['data']
        except urllib.error.HTTPError as error:
            if error.code == 404 and absent:
                return None
            raise UnregistrationError(f'PC returned HTTP {int(error.code)}. No mutation retry was attempted; review target state.') from None
        except (OSError, ValueError):
            raise UnregistrationError('PC transport, TLS trust or response validation failed. No mutation retry was attempted; review target state.') from None

    def pc_uuid(self):
        rows = self.request('GET', '/api/prism/v4.2/config/domain-managers')
        if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
            raise UnregistrationError('PC identity is missing or ambiguous; no target was inferred.')
        return cluster_uuid(rows[0].get('extId'))

    def pe(self, identity, absent=False):
        row = self.request('GET', '/api/clustermgmt/v4.2/config/clusters/' + cluster_uuid(identity), absent=absent)
        if row is None and absent:
            return None
        if not isinstance(row, dict) or row.get('extId') != cluster_uuid(identity) or not isinstance(row.get('name'), str) or not row['name'].strip():
            raise UnregistrationError('The returned PE identity does not match the requested UUID.')
        return {'uuid': row['extId'], 'name': row['name']}

    def unregister(self, pc_uuid, pe_uuid, dry_run=False):
        return self.request('POST', '/api/prism/v4.2/management/domain-managers/' + cluster_uuid(pc_uuid)
                            + '/$actions/unregister' + ('?$dryrun=true' if dry_run else ''),
                            {'extId': cluster_uuid(pe_uuid), '$objectType': 'prism.v4.management.ClusterReference'})

    def task(self, identity):
        if not isinstance(identity, str) or not re.fullmatch(r'[A-Za-z0-9_+=:/.-]{1,256}', identity):
            raise UnregistrationError('PC returned an invalid task reference; inspect target state.')
        return self.request('GET', '/api/prism/v4.2/config/tasks/' + urllib.parse.quote(identity, safe=''))


def review(config, credential, client_factory=Client):
    validate_intent(config)
    client = client_factory(config, credential)
    pc = client.pc_uuid()
    pe = client.pe(config['pe_cluster_uuid'])
    if pc == pe['uuid']:
        raise UnregistrationError('The PE UUID identifies PC itself; removal is blocked.')
    if config.get('expected_pc_uuid') and config['expected_pc_uuid'] != pc:
        raise UnregistrationError('PC identity changed; review a new intent.')
    if config.get('expected_pe_name') and config['expected_pe_name'] != pe['name']:
        raise UnregistrationError('PE name changed; review a new intent.')
    result = {**config, 'pc_endpoint': endpoint(config['pc_endpoint']),
              'pe_cluster_uuid': pe['uuid'], 'expected_pc_uuid': pc, 'expected_pe_name': pe['name']}
    validate_intent(result)
    return result


def execute(config, credential, emit, cancelled=lambda: False, client_factory=Client, sleep=time.sleep, authorize=lambda: None):
    validate_intent(config, reviewed=True)
    client = client_factory(config, credential)
    if review(config, credential, client_factory) != config:
        raise UnregistrationError('Intent must use the exact canonical reviewed PC and PE identities.')

    def wait(reference):
        if not isinstance(reference, dict) or not reference.get('extId'):
            raise UnregistrationError('PC did not return a task reference; inspect target state before retrying.')
        for _ in range(120):
            if cancelled():
                raise UnregistrationError('Verification interrupted. Target-side work may continue; reconcile before retrying.')
            task = client.task(reference['extId'])
            if not isinstance(task, dict):
                raise UnregistrationError('Unrecognized PC task response; completion cannot be verified.')
            status = task.get('status')
            if status == 'SUCCEEDED':
                return
            if status not in {'QUEUED', 'RUNNING', 'PENDING'}:
                raise UnregistrationError('PC task did not succeed; inspect target state before retrying.')
            sleep(2)
        raise UnregistrationError('PC task verification timed out; reconcile target state before retrying.')

    if cancelled():
        raise UnregistrationError('Cancelled before target preflight.')
    emit('Checking vendor unregistration prerequisites (dry-run); no force cleanup is available.')
    wait(client.unregister(config['expected_pc_uuid'], config['pe_cluster_uuid'], dry_run=True))
    # Recheck the approved identity after the vendor preflight and before the write.
    review(config, credential, client_factory)
    if cancelled():
        raise UnregistrationError('Cancelled before unregistration submission.')
    authorize()
    emit('Submitting the approved PC-side unregistration once.')
    wait(client.unregister(config['expected_pc_uuid'], config['pe_cluster_uuid']))
    if client.pc_uuid() != config['expected_pc_uuid']:
        raise UnregistrationError('PC identity changed during verification; outcome is uncertain.')
    for _ in range(15):
        if cancelled():
            raise UnregistrationError('Verification interrupted; reconcile target state before retrying.')
        if client.pe(config['pe_cluster_uuid'], absent=True) is None:
            emit('Verified successful task and PE absence from this PC inventory. PE-side cleanup and dependent services require separate verification.')
            return {'pcUuid': config['expected_pc_uuid'], 'peUuid': config['pe_cluster_uuid'],
                    'pcInventoryRemovalVerified': True, 'peSideCleanupVerified': False, 'followupRequired': True}
        sleep(2)
    raise UnregistrationError('The PE remains in PC inventory; removal could not be verified. Do not replay the request blindly.')
