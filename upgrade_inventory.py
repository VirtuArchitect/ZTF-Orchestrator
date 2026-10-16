"""Bounded, verified HTTPS inventory reads; never invokes upgrade operations."""
import base64
import datetime
import json
import re
import urllib.error
import urllib.request
import ssl

from prism_drift import endpoint, NoRedirect

COMPONENTS = ('aos', 'ahv', 'prismCentral', 'ncc', 'lcm', 'foundation', 'firmware')


def read(url, ref, path, lookup, product_header=False):
    user, password, error = lookup(ref)
    if error or not user or not password:
        raise ValueError('Credential reference could not be resolved')
    authorization = base64.b64encode(f'{user}:{password}'.encode()).decode('ascii')
    req = urllib.request.Request(url + path, headers={
        'Authorization': 'Basic ' + authorization, 'Accept': 'application/json'}, method='GET')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(),
                                        urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    try:
        try:
            # Validated HTTPS target; fixed GET paths, without redirects or proxies.
            response = opener.open(req, timeout=10)  # nosec B310
        except urllib.error.HTTPError as exc:
            if product_header and exc.code in (301, 302, 303, 307, 308):
                response = exc
            else:
                raise
        with response:
            if product_header:
                version = response.headers.get('x-ntnx-product', '')
                if not re.fullmatch(r'pc\.[A-Za-z0-9_.-]{1,125}', version):
                    raise ValueError('PC version header is unavailable; enter a verified version manually')
                return version
            raw = response.read(1024 * 1024 + 1)
            if len(raw) > 1024 * 1024:
                raise ValueError('Inventory response exceeds 1 MiB')
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        raise ValueError(f'Inventory returned HTTP {exc.code}') from None
    except (urllib.error.URLError, OSError):
        raise ValueError('Inventory connection or TLS verification failed') from None
    except (UnicodeError, json.JSONDecodeError):
        raise ValueError('Inventory returned invalid JSON') from None


def text(value):
    return value.strip()[:128] if isinstance(value, str) else ''


def collect(data, lookup):
    if not isinstance(data, dict) or set(data) - {'peEndpoint', 'peCredential', 'pcEndpoint', 'pcCredential'}:
        raise ValueError('Only PE/PC endpoints and credential references are accepted')
    targets = []
    for kind in ('pe', 'pc'):
        address, ref = data.get(kind + 'Endpoint'), data.get(kind + 'Credential')
        if address:
            if not isinstance(address, str) or len(address) > 300 or not isinstance(ref, str) or not 1 <= len(ref.strip()) <= 128:
                raise ValueError('Each endpoint requires a bounded credential reference')
            targets.append((kind, endpoint(address), ref.strip()))
    if not targets:
        raise ValueError('At least one PE or PC endpoint is required')
    result = dict(clusterName='', components={}, observations=[], errors=[], readOnly=True,
                  collectedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
    for kind, url, ref in targets:
        if kind == 'pc':
            try:
                version = read(url, ref, '/', lookup, product_header=True)
                result['components']['prismCentral'] = version
                result['observations'].append(dict(component='prismCentral', value=version, endpoint=url,
                                                   source='HTTPS product header; not an authenticated API permission check'))
            except ValueError as exc:
                result['errors'].append(dict(component='prismCentral', endpoint=url, message=str(exc)))
            continue
        for component, path in [('aos', '/PrismGateway/services/rest/v2.0/cluster/'),
                                ('ahv', '/PrismGateway/services/rest/v2.0/hosts/')]:
            try:
                body = read(url, ref, path, lookup)
                if not isinstance(body, dict):
                    raise ValueError('Unsupported inventory response')
                if component == 'aos':
                    version = text(body.get('version')) or text(body.get('full_version'))
                    result['clusterName'] = text(body.get('name'))
                else:
                    hosts = body.get('entities')
                    if not isinstance(hosts, list) or not hosts or len(hosts) > 256:
                        raise ValueError('Host inventory unavailable or incomplete')
                    metadata = body.get('metadata', {})
                    if not isinstance(metadata, dict):
                        raise ValueError('Host inventory completeness is unknown; verify every host manually')
                    total = metadata.get('grand_total_entities', metadata.get('total_entities'))
                    if total is None:
                        raise ValueError('Host inventory completeness is unknown; verify every host manually')
                    if total != len(hosts) or metadata.get('total_entities', len(hosts)) != len(hosts):
                        raise ValueError('Host inventory is paginated; verify the complete host inventory manually')
                    versions = {text(h.get('hypervisor_full_name')) for h in hosts if isinstance(h, dict)}
                    if len(versions) != 1 or '' in versions or any(not isinstance(h, dict) for h in hosts):
                        raise ValueError('Mixed or missing hypervisor versions; inspect every host')
                    version = versions.pop()
                    if not ('AHV' in version.upper() or 'NUTANIX' in version.upper()):
                        raise ValueError('Host inventory is not identified as AHV')
                if not version:
                    raise ValueError('Version is absent from inventory')
                result['components'][component] = version
                result['observations'].append(dict(component=component, value=version, endpoint=url, source=path))
            except ValueError as exc:
                result['errors'].append(dict(component=component, endpoint=url, message=str(exc)))
    result['unknownComponents'] = [c for c in COMPONENTS if c not in result['components']]
    return result


def assessment_input(data):
    """Store only the documented assessment contract, never arbitrary input fields."""
    if not isinstance(data, dict):
        raise ValueError('JSON object required')
    inventory = data.get('inventory', {})
    evidence = data.get('evidence', {})
    context = data.get('context', {})
    if not all(isinstance(x, dict) for x in (inventory, evidence, context)):
        raise ValueError('Inventory, context and evidence must be objects')
    def versions(value):
        if not isinstance(value, dict) or set(value) - set(COMPONENTS):
            raise ValueError('Unsupported version fields')
        if any(not isinstance(v, str) or len(v) > 128 for v in value.values()):
            raise ValueError('Versions must be strings of at most 128 characters')
        return {k: v.strip() for k, v in value.items() if v.strip()}
    targets = versions(data.get('targets', {}))
    if not targets:
        raise ValueError('At least one target version is required')
    flags = ('releaseNotesReviewed', 'compatibilityReviewed', 'prismCentralVersionCaptured', 'darkSiteBundleReviewed')
    if any(k in evidence and not isinstance(evidence[k], bool) for k in flags):
        raise ValueError('Evidence flags must be booleans')
    if evidence.get('lcmPrecheck', '') not in ('', 'passed', 'warning', 'failed'):
        raise ValueError('Invalid LCM precheck result')
    name, features = inventory.get('clusterName', ''), context.get('features', '')
    if not isinstance(name, str) or len(name) > 128 or not isinstance(features, (str, list)):
        raise ValueError('Invalid cluster name or workload signals')
    if isinstance(features, list):
        if any(not isinstance(x, str) for x in features):
            raise ValueError('Workload signals must be text')
        features = ','.join(features)
    if len(features) > 1000 or context.get('edition', 'enterprise') not in ('enterprise', 'community') or not isinstance(context.get('darkSite', False), bool):
        raise ValueError('Invalid environment context')
    return dict(inventory=dict(clusterName=name.strip(), components=versions(inventory.get('components', {}))),
                targets=targets, evidence={**{k: evidence.get(k, False) for k in flags}, 'lcmPrecheck': evidence.get('lcmPrecheck', '')},
                context=dict(edition=context.get('edition', 'enterprise'), darkSite=context.get('darkSite', False), features=features))
