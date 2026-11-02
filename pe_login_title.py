"""Narrow PE login-title configuration with verified transport and read-back.

Uses the legacy Prism UI system-data contract, not a public v4 API guarantee.
No shell, CVM file edits, theme replacement, or cluster rename is performed.
"""

import base64
from contextlib import contextmanager, ExitStack
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import ssl
import tempfile
import unicodedata
import urllib.error
import urllib.request


SCRIPT_ID = 'SetPrismLoginTitlePe'
UI_PATH = '/PrismGateway/services/rest/v1/application/system_data'
UI_TYPE = 'CUSTOM_LOGIN_SCREEN'
UI_KEY = 'product_title'
MAX_RESPONSE_BYTES = 1024 * 1024
CLUSTER_KEYS = {'name', 'pe_credential', 'prism_login_title', 'prism_login_title_verify_tls'}


class LoginTitleError(ValueError, RuntimeError):
    """Fixed safe error categories; raw server responses must never be logged."""

    def __init__(self, category, detail):
        self.category = category
        self.detail = detail
        super().__init__(detail)


def has_title_intent(config):
    if not isinstance(config, dict):
        return False
    if 'prism_login_title' in config or 'prism_login_title_verify_tls' in config:
        return True
    clusters = config.get('clusters')
    return isinstance(clusters, dict) and any(
        isinstance(cluster, dict) and ('prism_login_title' in cluster or 'prism_login_title_verify_tls' in cluster)
        for cluster in clusters.values()
    )


def validate_intent(config):
    clusters = config.get('clusters') if isinstance(config, dict) else None
    if not isinstance(clusters, dict) or not 1 <= len(clusters) <= 32:
        raise LoginTitleError('invalid_intent', 'Provide 1-32 clusters keyed by PE IP address.')
    if 'prism_login_title' in config:
        raise LoginTitleError('invalid_intent', 'prism_login_title belongs inside each cluster entry.')
    if 'pe_credential' in config and (not isinstance(config['pe_credential'], str) or not config['pe_credential'].strip()):
        raise LoginTitleError('invalid_intent', 'pe_credential must be a nonempty credential reference string.')
    if not isinstance(config.get('prism_login_title_verify_tls', True), bool):
        raise LoginTitleError('invalid_intent', 'prism_login_title_verify_tls must be a YAML boolean.')
    targets = set()
    for host, cluster in clusters.items():
        try:
            if not isinstance(host, str) or '%' in host:
                raise ValueError()
            address = ipaddress.ip_address(host)
            if address.is_unspecified or address.is_multicast:
                raise ValueError()
        except ValueError:
            raise LoginTitleError('invalid_intent', 'Cluster keys must be specific PE IP addresses, without URLs or ports.') from None
        if address in targets:
            raise LoginTitleError('invalid_intent', 'Duplicate PE target addresses are not allowed.')
        targets.add(address)
        if not isinstance(cluster, dict) or set(cluster) - CLUSTER_KEYS:
            raise LoginTitleError('invalid_intent', 'Login-title changes require a separate title-only step; remove other cluster settings.')
        if not isinstance(cluster.get('name'), str) or not cluster['name'].strip():
            raise LoginTitleError('invalid_intent', 'Every cluster requires its existing name.')
        if 'pe_credential' in cluster and (not isinstance(cluster['pe_credential'], str) or not cluster['pe_credential'].strip()):
            raise LoginTitleError('invalid_intent', 'Per-cluster pe_credential must be a nonempty reference string.')
        ref = cluster.get('pe_credential') or config.get('pe_credential')
        if not isinstance(ref, str) or not ref.strip():
            raise LoginTitleError('invalid_intent', 'Every target requires a nonempty pe_credential reference.')
        title = cluster.get('prism_login_title')
        if not isinstance(title, str) or not title.strip() or len(title) > 128 or any(
            char in '<>' or unicodedata.category(char).startswith('C') for char in title
        ):
            raise LoginTitleError('invalid_intent', 'prism_login_title must contain 1-128 plain-text characters without markup or control characters.')
        if not isinstance(cluster.get('prism_login_title_verify_tls', True), bool):
            raise LoginTitleError('invalid_intent', 'Per-cluster prism_login_title_verify_tls must be a YAML boolean.')
    return clusters


def prepare_credentials(config, resolve):
    clusters = validate_intent(config)
    planned = []
    for host, cluster in clusters.items():
        ref = cluster.get('pe_credential') or config['pe_credential']
        try:
            username, password = resolve(ref)
            if not isinstance(username, str) or not username.strip() or ':' in username or any(
                unicodedata.category(char).startswith('C') for char in username
            ) or not isinstance(password, str) or not password:
                raise ValueError()
        except Exception:
            raise LoginTitleError('credential_resolution_failed',
                                  f'[PE-TITLE] stage=credential_resolution target={host} category=credential_resolution_failed: '
                                  'Check the reference in the selected vault and its username/password. No PE requests were made.') from None
        planned.append((host, cluster['name'], ref, username, password, cluster['prism_login_title'],
                        cluster.get('prism_login_title_verify_tls', config.get('prism_login_title_verify_tls', True))))
    return planned


class PeLoginTitleClient:
    def __init__(self, host, username, password, verify_tls=True):
        if type(verify_tls) is not bool:
            raise LoginTitleError('invalid_intent', 'TLS verification must be a boolean.')
        address = ipaddress.ip_address(host)
        self.url = f'https://[{address}]:9440{UI_PATH}' if address.version == 6 else f'https://{address}:9440{UI_PATH}'
        auth = base64.b64encode(f'{username}:{password}'.encode('utf-8')).decode('ascii')
        self.headers = {'Authorization': 'Basic ' + auth, 'Content-Type': 'application/json', 'Accept': 'application/json'}

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None

        context = ssl.create_default_context()
        if not verify_tls:
            # Explicit per-operation opt-out; never alter process-global trust.
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect(), urllib.request.HTTPSHandler(context=context),
        )

    def request(self, method, payload=None):
        if method not in {'GET', 'POST', 'PUT'}:
            raise LoginTitleError('invalid_operation', 'Unsupported login-title request method.')
        body = json.dumps(payload).encode('utf-8') if payload is not None else None
        req = urllib.request.Request(self.url, data=body, headers=self.headers, method=method)
        try:
            with self.opener.open(req, timeout=30) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                if len(raw) > MAX_RESPONSE_BYTES:
                    raise ValueError()
                parsed = json.loads(raw) if raw else None
                if isinstance(parsed, dict) and (parsed.get('error') or parsed.get('success') is False or parsed.get('value') is False):
                    raise LoginTitleError('api_rejected', 'PE rejected the operation; inspect target state before retrying.')
                return parsed
        except urllib.error.HTTPError as exc:
            category = {401: 'authentication_failed', 403: 'authorization_failed', 404: 'api_incompatible',
                        405: 'api_incompatible', 409: 'concurrent_change', 412: 'concurrent_change',
                        429: 'rate_limited'}.get(exc.code, 'http_failed')
            raise LoginTitleError(category, f'PE UI settings returned HTTP {int(exc.code)}; no automatic mutation retry was attempted.') from None
        except LoginTitleError:
            raise
        except (OSError, ValueError) as exc:
            reason = exc.reason if isinstance(exc, urllib.error.URLError) else exc
            if isinstance(reason, ssl.SSLCertVerificationError):
                identity = getattr(reason, 'verify_code', None) in {62, 64}
                category = 'certificate_identity_mismatch' if identity else 'certificate_trust_failed'
                detail = 'Check certificate IP/SAN identity.' if identity else 'Check the trusted certificate bundle and validity.'
            elif isinstance(reason, ssl.SSLError):
                category, detail = 'tls_failed', 'Check TLS configuration.'
            elif isinstance(exc, (ValueError, UnicodeError)):
                category, detail = 'response_invalid', 'PE returned an invalid, non-JSON or oversized response.'
            else:
                category, detail = 'network_failed', 'Check routing and port 9440 from the Orchestrator.'
            raise LoginTitleError(category, detail) from None

    def read_title(self):
        response = self.request('GET')
        rows = response.get('entities') if isinstance(response, dict) else response
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise LoginTitleError('api_incompatible', 'Unrecognized PE system-data response; no settings were inferred.')
        matches = [row for row in rows if row.get('type') == UI_TYPE and row.get('key') == UI_KEY]
        if len(matches) > 1 or (matches and not isinstance(matches[0].get('value'), str)):
            raise LoginTitleError('response_invalid', 'PE returned ambiguous or malformed login-title data.')
        return matches[0]['value'] if matches else None

    def write_title(self, title, exists):
        return self.request('PUT' if exists else 'POST', {'type': UI_TYPE, 'key': UI_KEY, 'value': title})


def _stage(stage, host, operation):
    try:
        return operation()
    except Exception as exc:
        category = exc.category if type(exc) is LoginTitleError else 'unexpected_error'
        detail = exc.detail if type(exc) is LoginTitleError else 'Unexpected failure; raw exception suppressed.'
        if stage in {'apply', 'verification'}:
            detail += ' The title may have changed; inspect current target state before retrying.'
        raise LoginTitleError(category, f'[PE-TITLE] stage={stage} target={host} category={category}: {detail}') from None


@contextmanager
def _target_lock(host):
    """Nonblocking shared-file lock; released by the OS even if a job exits."""
    base = os.environ.get('ZTF_DATA_DIR')
    fallback = f'ztf-pe-title-{getattr(os, "getuid", lambda: "local")()}'
    folder = (Path(base) if base else Path(tempfile.gettempdir()) / fallback) / '.pe-login-title-locks'
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    if folder.is_symlink() or not folder.is_dir():
        raise LoginTitleError('lock_unavailable', 'The login-title lock directory is unavailable.')
    name = hashlib.sha256(str(ipaddress.ip_address(host)).encode('ascii')).hexdigest() + '.lock'
    flags = os.O_CREAT | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0)
    try:
        fd = os.open(folder / name, flags, 0o600)
    except OSError:
        raise LoginTitleError('lock_unavailable', 'Unable to open the login-title target lock.') from None
    locked = False
    try:
        if os.name == 'nt':
            import msvcrt
            if os.fstat(fd).st_size == 0:
                os.write(fd, b'0')
            os.lseek(fd, 0, os.SEEK_SET)
            try:
                msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
                locked = True
            except OSError:
                raise LoginTitleError('target_busy', 'Another login-title operation owns this target; retry after it finishes.') from None
        else:
            import fcntl
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                locked = True
            except OSError:
                raise LoginTitleError('target_busy', 'Another login-title operation owns this target; retry after it finishes.') from None
        yield
    finally:
        if locked and os.name == 'nt':
            os.lseek(fd, 0, os.SEEK_SET)
            msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
        elif locked:
            fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def configure(config, resolve, emit, client_factory=PeLoginTitleClient):
    planned = prepare_credentials(config, resolve)
    with ExitStack() as stack:
        for host in sorted(str(ipaddress.ip_address(item[0])) for item in planned):
            _stage('target_lock', host, lambda: stack.enter_context(_target_lock(host)))
        return _configure_locked(planned, emit, client_factory)


def _configure_locked(planned, emit, client_factory):
    inspected = []
    # All target reads must succeed before the first mutation.
    for host, name, ref, username, password, title, verify_tls in planned:
        if not verify_tls:
            emit(f'[PE-TITLE] target={host}: TLS certificate verification is explicitly disabled for this operation.')
        client = _stage('connection_setup', host, lambda: client_factory(host, username, password, verify_tls))
        previous = _stage('current_title_read', host, client.read_title)
        inspected.append((host, title, previous, client))
    results = {}
    for host, title, previous, client in inspected:
        changed = previous != title
        if changed:
            current = _stage('pre_apply_read', host, client.read_title)
            if current != previous:
                raise LoginTitleError('concurrent_change', f'[PE-TITLE] stage=pre_apply_read target={host} category=concurrent_change: '
                                      'The login title changed after inspection; no write was attempted for this target.')
            emit(f'[PE-TITLE] stage=apply target={host}: updating only the Prism login title.')
            _stage('apply', host, lambda: client.write_title(title, previous is not None))
        observed = _stage('verification', host, client.read_title)
        if observed != title:
            raise LoginTitleError('verification_failed', f'[PE-TITLE] stage=verification target={host} category=verification_failed: '
                                  'Fresh PE read-back did not match the requested title. Inspect target state before retrying.')
        results[host] = {'Prism_Login_Title': 'PASS', 'changed': changed, 'previous_title': previous,
                         'requested_title': title, 'verified_title': observed}
        emit(f'[PE-TITLE] target={host}: {"updated" if changed else "unchanged"}; fresh login-title verification PASS.')
    return results
