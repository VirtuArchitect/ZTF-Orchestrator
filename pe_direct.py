"""Per-plan PE transport and identity checks for cluster-local configuration."""
import base64
import ipaddress
import json
import re
import ssl
import urllib.error
import urllib.request

from cluster_storage_standard import StorageError
from pc_unregistration import cluster_uuid, endpoint

PREFIX = '/PrismGateway/services/rest/v2.0'
REF = re.compile(r'[A-Za-z0-9_.-]{1,128}')


class DirectError(StorageError):
    pass


def direct(config):
    return isinstance(config, dict) and config.get('mode') == 'pe-direct'


def connection(value):
    required = {'mode', 'pe_endpoint', 'pe_credential', 'cluster_uuid', 'verify_tls', 'tls_bypass_reason'}
    if not isinstance(value, dict) or not required.issubset(value) or set(value) - required - {'cvm_credential', 'cvm_host_keys'}:
        raise DirectError('Provide the complete PE-direct connection and explicit TLS verification setting.')
    if value['mode'] != 'pe-direct' or type(value['verify_tls']) is not bool:
        raise DirectError('Select PE direct and a boolean TLS verification setting.')
    reason = value['tls_bypass_reason']
    if (not isinstance(reason, str) or len(reason) > 200
            or any(ord(c) < 32 or ord(c) == 127 for c in reason)
            or (not value['verify_tls'] and not reason.strip())):
        raise DirectError('A TLS bypass needs a nonempty reason of at most 200 characters, without control characters.')
    if not isinstance(value['pe_credential'], str) or not REF.fullmatch(value['pe_credential']):
        raise DirectError('Use a saved PE credential reference.')
    try:
        address = endpoint(value['pe_endpoint'])
        identity = cluster_uuid(value['cluster_uuid'])
    except ValueError:
        raise DirectError('Use a specific PE HTTPS endpoint on port 9440 and the expected cluster UUID.') from None
    result = {**value, 'pe_endpoint': address, 'cluster_uuid': identity,
              'tls_bypass_reason': reason.strip() if not value['verify_tls'] else ''}
    return result


def credential(config, resolver, name='pe_credential'):
    try:
        user, password = resolver(config[name])
        if not isinstance(user, str) or not user or ':' in user or not isinstance(password, str) or not password:
            raise ValueError()
        return user, password
    except Exception:
        raise DirectError('The saved credential reference could not be resolved.') from None


class Client:
    def __init__(self, config, saved_credential):
        self.config = connection(config)
        context = ssl.create_default_context() if self.config['verify_tls'] else ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        if not self.config['verify_tls']:
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None

        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(),
                                                  urllib.request.HTTPSHandler(context=context))
        self.headers = {'Accept': 'application/json', 'Content-Type': 'application/json',
                        'Authorization': 'Basic ' + base64.b64encode(':'.join(saved_credential).encode()).decode()}

    def request(self, method, path, body=None):
        allowed = {'GET': {'/cluster/', '/hosts/', '/data_at_rest_encryption', '/key_management_servers/type'},
                   'POST': {'/data_at_rest_encryption/enable'}}
        if path not in allowed.get(method, set()):
            raise DirectError('Unsupported PE-direct operation.')
        req = urllib.request.Request(self.config['pe_endpoint'] + PREFIX + path, method=method,
            headers=self.headers, data=json.dumps(body).encode() if body is not None else None)
        try:
            with self.opener.open(req, timeout=30) as response:
                raw = response.read(8 * 1024 * 1024 + 1)
                if len(raw) > 8 * 1024 * 1024:
                    raise ValueError()
                result = json.loads(raw)
                if not isinstance(result, dict) or result.get('error') or result.get('error_code'):
                    raise ValueError()
                return result
        except urllib.error.HTTPError as error:
            raise DirectError(f'PE {method} returned HTTP {error.code}. No mutation retry was attempted; reconcile before retrying.') from None
        except urllib.error.URLError as error:
            if isinstance(error.reason, ssl.SSLCertVerificationError):
                raise DirectError('PE certificate trust or hostname verification failed. Review the per-run TLS setting.') from None
            raise DirectError('PE connectivity failed. No mutation retry was attempted; reconcile before retrying.') from None
        except (OSError, ValueError, TypeError):
            raise DirectError('PE response was incomplete or unsupported. Reconcile before retrying.') from None


def inventory(config, pe):
    cluster = pe.request('GET', '/cluster/')
    if cluster_uuid(cluster.get('uuid')) != config['cluster_uuid']:
        raise DirectError('PE cluster UUID does not match the reviewed target.')
    name = cluster.get('name')
    if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_. -]{0,127}', name):
        raise DirectError('PE cluster name is missing or unsupported.')
    if (cluster.get('health_summary') or {}).get('health_status') != 'Good':
        raise DirectError('PE does not report Good cluster health.')
    body = pe.request('GET', '/hosts/')
    rows = body.get('entities')
    total = (body.get('metadata') or {}).get('grand_total_entities')
    if not isinstance(rows, list) or type(total) is not int or total != len(rows) or not 3 <= len(rows) <= 16:
        raise DirectError('Complete PE inventory of 3–16 healthy AHV hosts is required.')
    hosts = []
    for row in rows:
        if (not isinstance(row, dict) or (row.get('health_summary') or {}).get('health_status') != 'Good'
                or row.get('hypervisor_type') not in {'kKvm', 'AHV'}):
            raise DirectError('Every host must be an identifiable, healthy AHV host.')
        serial = row.get('serial')
        if not isinstance(serial, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', serial):
            raise DirectError('PE host serial is missing or invalid.')
        host_name = row.get('name') or serial
        if not isinstance(host_name, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_. -]{0,127}', host_name):
            raise DirectError('PE host name is missing or unsupported.')
        hosts.append({'id': cluster_uuid(row.get('uuid')), 'serial': serial,
                      'name': host_name,
                      'hostIp': row.get('hypervisor_address'), 'cvmIp': row.get('service_vmexternal_ip')})
    if len({h['id'] for h in hosts}) != len(hosts) or len({h['serial'] for h in hosts}) != len(hosts):
        raise DirectError('PE host identity is ambiguous.')
    return {'name': name, 'uuid': config['cluster_uuid'], 'aosVersion': str(cluster.get('version') or ''),
            'hostSerials': sorted(h['serial'] for h in hosts)}, sorted(hosts, key=lambda h: h['id'])


def host_ip(value):
    try:
        ip = ipaddress.ip_address(value)
        if not isinstance(ip, ipaddress.IPv4Address) or ip.is_unspecified or ip.is_multicast or ip.is_loopback or ip.is_link_local:
            raise ValueError()
        return str(ip)
    except (ValueError, TypeError):
        raise DirectError('PE must report specific AHV and CVM IPv4 addresses.') from None
