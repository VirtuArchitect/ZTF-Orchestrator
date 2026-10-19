"""Read-only Prism Element drift collection. No raw API responses are retained."""

import base64
import errno
import ipaddress
import json
import re
import socket
import ssl
import urllib.error
import urllib.parse
import urllib.request


SETTINGS = {
    'name_servers_list': '/cluster/name_servers',
    'ntp_servers_list': '/cluster/ntp_servers',
    'enable_pulse': '/pulse',
}


def endpoint(value):
    raw = str(value)
    parsed = urllib.parse.urlsplit(raw if '://' in raw else 'https://' + raw)
    host = parsed.hostname or ''
    if (parsed.scheme != 'https' or parsed.username or parsed.password
            or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
        raise ValueError('PE target must be an HTTPS host or IP with an optional port')
    try:
        ipaddress.ip_address(host)
    except ValueError:
        if not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?', host):
            raise ValueError('Invalid PE hostname') from None
    port = parsed.port or 9440
    if not 1 <= port <= 65535:
        raise ValueError('Invalid PE port')
    authority = f'[{host}]' if ':' in host else host
    return f'https://{authority}:{port}'


def normalize_servers(value):
    if not isinstance(value, list) or any(not isinstance(item, str) or not item.strip() for item in value):
        raise ValueError('Server settings must be arrays of non-empty strings')
    normalized = []
    for item in value:
        item = item.strip().lower().rstrip('.')
        try:
            item = str(ipaddress.ip_address(item))
        except ValueError:
            if not re.fullmatch(r'[a-z0-9][a-z0-9.-]*', item):
                raise ValueError('Invalid DNS or NTP server') from None
        normalized.append(item)
    return sorted(set(normalized))


def targets(config):
    clusters = config.get('clusters') if isinstance(config, dict) else None
    if not isinstance(clusters, dict) or not 1 <= len(clusters) <= 16:
        raise ValueError('Live PE monitoring requires a clusters mapping with 1 to 16 targets')
    result = []
    for address, cluster in clusters.items():
        url = endpoint(address)
        if not isinstance(cluster, dict):
            raise ValueError('Each PE target must contain settings and pe_credential')
        ref = cluster.get('pe_credential')
        if not isinstance(ref, str) or not ref.strip():
            raise ValueError('Each PE target requires a pe_credential reference')
        settings = {}
        for key in SETTINGS:
            if key not in cluster:
                continue
            value = cluster[key]
            if key == 'enable_pulse':
                if not isinstance(value, bool):
                    raise ValueError('enable_pulse must be a boolean')
                settings[key] = value
            else:
                settings[key] = normalize_servers(value)
        if not settings:
            raise ValueError('Each PE target needs DNS, NTP or Pulse desired settings')
        result.append((url, ref.strip(), settings))
    return result


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def connection_error(exc):
    # urllib wraps socket/TLS exceptions; classify types/codes, never raw messages.
    reason = exc.reason if isinstance(exc, urllib.error.URLError) else exc
    if isinstance(reason, ssl.SSLCertVerificationError):
        code = getattr(reason, 'verify_code', None)
        if code in (62, 64):  # OpenSSL hostname and IP address mismatch.
            return ('PE TLS hostname/IP mismatch: the target is not covered by the certificate SAN. '
                    'Use a covered DNS name/IP or replace the PE certificate.')
        if code in (2, 18, 19, 20, 21, 27):
            return ('PE TLS certificate trust failed: the issuer or certificate chain is not trusted. '
                    'Install the approved CA chain in the container trust bundle or SSL_CERT_FILE.')
        if code in (9, 10):
            return 'PE TLS certificate validity failed: check certificate dates and the appliance clock.'
        return ('PE TLS certificate verification failed: check certificate validity and the approved CA chain. '
                'TLS verification remains required.')
    if isinstance(reason, ssl.SSLError):
        return 'PE TLS handshake failed: check the HTTPS port and supported TLS configuration.'
    if isinstance(reason, socket.gaierror):
        return 'PE DNS resolution failed: check the target hostname and container DNS connectivity.'
    if isinstance(reason, TimeoutError):
        return 'PE network timeout: check routing, firewall access and PE responsiveness on the configured port.'
    if isinstance(reason, ConnectionRefusedError) or getattr(reason, 'errno', None) == errno.ECONNREFUSED:
        return 'PE connection refused: check the target port, PE service and firewall rules.'
    if getattr(reason, 'errno', None) in (errno.ENETUNREACH, errno.EHOSTUNREACH):
        return 'PE network unreachable: check container routing and firewall access to the target.'
    return 'PE network connection failed: check target reachability, routing, firewall rules and the PE service.'


def read_setting(url, ref, key, lookup):
    username, password, error = lookup(ref)
    if error or not username or not password:
        raise ValueError('PE credential reference could not be resolved')
    token = base64.b64encode(f'{username}:{password}'.encode()).decode('ascii')
    req = urllib.request.Request(url + '/PrismGateway/services/rest/v1' + SETTINGS[key],
                                 headers={'Authorization': 'Basic ' + token, 'Accept': 'application/json'},
                                 method='GET')
    try:
        context = ssl.create_default_context()
    except OSError:
        raise ValueError('PE TLS trust configuration could not be loaded: check the container CA bundle and SSL_CERT_FILE.') from None
    try:
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect(),
            urllib.request.HTTPSHandler(context=context),
        )
        with opener.open(req, timeout=10) as response:  # nosec B310 - validated operator-selected HTTPS PE host; fixed read-only paths, no redirects.
            raw = response.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise ValueError('PE response exceeds the collection limit')
        value = json.loads(raw)
        if key == 'enable_pulse':
            if not isinstance(value, dict) or not isinstance(value.get('enable'), bool):
                raise ValueError('Unsupported PE Pulse response')
            return value['enable']
        return normalize_servers(value)
    except urllib.error.HTTPError as exc:
        raise ValueError(f'PE returned HTTP {exc.code}') from None
    except (urllib.error.URLError, OSError) as exc:
        raise ValueError(connection_error(exc)) from None
    except (UnicodeError, json.JSONDecodeError):
        raise ValueError('PE returned invalid JSON') from None


def collect(config, lookup):
    findings, collections = [], []
    summary = dict(matched=0, changed=0, missing=0, unexpected=0, unknown=0, total=0)
    for url, ref, settings in targets(config):
        errors = {}
        for key, desired in settings.items():
            try:
                observed = read_setting(url, ref, key, lookup)
                status = 'matched' if desired == observed else 'changed'
            except ValueError as exc:
                observed, status = None, 'unknown'
                errors[key] = str(exc)
            findings.append(dict(path=f'{url}.{key}', status=status, desired=desired, observed=observed))
            summary[status] += 1
            summary['total'] += 1
        collections.append(dict(endpoint=url, errors=errors))
    # Preserve confirmed drift even if another read failed; unknown is never matched.
    status = 'drifted' if summary['changed'] else 'unknown' if summary['unknown'] else 'matched'
    return dict(status=status, findings=findings, summary=summary, collections=collections)
