"""Guarded PE v1 local-user provisioning; no passwords in intent or output."""

import base64
import ipaddress
import json
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request


SCRIPT_ID = 'CreateLocalUsersPe'
ADMIN_ROLES = ['ROLE_CLUSTER_ADMIN', 'ROLE_USER_ADMIN']


def validate_intent(config):
    clusters = config.get('clusters') if isinstance(config, dict) else None
    if not isinstance(clusters, dict) or not clusters or len(clusters) > 32:
        raise ValueError('Provide 1-32 clusters keyed by PE IP address')
    for host, cluster in clusters.items():
        try:
            ipaddress.ip_address(host)
        except (ValueError, TypeError):
            raise ValueError('Cluster keys must be PE IP addresses') from None
        if not isinstance(cluster, dict) or any(
            not isinstance(cluster.get(key), str) or not cluster[key].strip()
            for key in ('name', 'pe_credential')
        ):
            raise ValueError('Each cluster requires name and pe_credential')
        users = cluster.get('local_users')
        if not isinstance(users, list) or not 1 <= len(users) <= 50:
            raise ValueError('Each cluster requires 1-50 local_users')
        names, refs = set(), set()
        for user in users:
            if not isinstance(user, dict) or set(user) - {'username', 'credential_ref', 'first_name', 'last_name'}:
                raise ValueError('Users accept username, credential_ref, first_name and last_name only')
            name, ref = user.get('username'), user.get('credential_ref')
            if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_.-]{0,63}', name):
                raise ValueError('Invalid local username')
            if name.lower() in {'admin', 'nutanix', 'root', 'anonymous'} or name.lower() in names:
                raise ValueError('Built-in or duplicate local username is not allowed')
            if not isinstance(ref, str) or not ref.strip() or ref in refs or ref == cluster['pe_credential']:
                raise ValueError('Each user requires a separate credential_ref, distinct from pe_credential')
            for key in ('first_name', 'last_name'):
                if key in user and (not isinstance(user[key], str) or len(user[key]) > 128):
                    raise ValueError('Invalid user profile name')
            names.add(name.lower())
            refs.add(ref)
    return clusters


class PeUsersClient:
    def __init__(self, host, username, password):
        address = ipaddress.ip_address(host)
        host = f'[{address}]' if address.version == 6 else str(address)
        self.base = f'https://{host}:9440/api/nutanix/v1/users'
        token = base64.b64encode(f'{username}:{password}'.encode()).decode('ascii')
        self.headers = {'Authorization': f'Basic {token}', 'Content-Type': 'application/json'}
        # No proxy or redirect may forward account credentials elsewhere.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect(),
            urllib.request.HTTPSHandler(context=ssl.create_default_context()),
        )

    def request(self, method, suffix='', payload=None):
        body = None if payload is None else json.dumps(payload).encode()
        request = urllib.request.Request(self.base + suffix, data=body, headers=self.headers, method=method)
        try:
            with self.opener.open(request, timeout=30) as response:
                raw = response.read(1024 * 1024 + 1)
                if len(raw) > 1024 * 1024:
                    raise ValueError('PE response exceeds size limit')
                result = json.loads(raw) if raw else None
                if method == 'POST' and isinstance(result, dict) and (
                    result.get('value') is False or result.get('success') is False or result.get('error')
                ):
                    raise RuntimeError('PE rejected the user operation; review partial provisioning')
                return result
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f'PE user API returned HTTP {exc.code}; check privileges and API compatibility') from None
        except (OSError, ValueError):
            raise RuntimeError('PE user API failed; check certificate trust, network and response format') from None

    def users(self):
        response = self.request('GET')
        users = response.get('entities') if isinstance(response, dict) else response
        if not isinstance(users, list) or any(
            not isinstance(user, dict) or not isinstance(user.get('profile'), dict)
            or not isinstance(user['profile'].get('username'), str) for user in users
        ):
            raise RuntimeError('PE users response has an unsupported shape')
        return {user['profile']['username']: user for user in users}

    def roles(self, username):
        response = self.request('GET', '/' + urllib.parse.quote(username, safe='') + '/roles')
        roles = response.get('roles') if isinstance(response, dict) else response
        if not isinstance(roles, list) or any(not isinstance(role, str) for role in roles):
            raise RuntimeError('PE user roles response has an unsupported shape')
        return set(roles)

    def create(self, user, password):
        self.request('POST', payload={'profile': {
            'username': user['username'], 'password': password,
            'first_name': user.get('first_name', ''), 'last_name': user.get('last_name', ''),
        }})
        self.request('POST', '/' + urllib.parse.quote(user['username'], safe='') + '/roles', ADMIN_ROLES)


def prepare_credentials(config, resolve):
    clusters = validate_intent(config)
    planned = []
    # Resolve every reference before any network activity or mutation.
    try:
        for host, cluster in clusters.items():
            admin, admin_password = resolve(cluster['pe_credential'])
            if not isinstance(admin, str) or not admin or not isinstance(admin_password, str) or not admin_password:
                raise ValueError()
            users, passwords = [], set()
            for user in cluster['local_users']:
                username, password = resolve(user['credential_ref'])
                if username != user['username'] or not isinstance(password, str) or not password or password in passwords:
                    raise ValueError()
                passwords.add(password)
                users.append((user, password))
            planned.append((host, admin, admin_password, users))
    except Exception:
        raise ValueError('Credential resolution failed: check all references, matching usernames and unique nonempty passwords') from None

    return planned


def provision(config, resolve, emit, client_factory=PeUsersClient):
    planned = prepare_credentials(config, resolve)
    prepared = []
    for host, admin, password, users in planned:
        client = client_factory(host, admin, password)
        existing = client.users()
        for user, _ in users:
            name = user['username']
            if any(name.lower() == current.lower() and name != current for current in existing):
                raise RuntimeError('A case-conflicting account exists; review before provisioning')
            if name in existing and existing[name]['profile'].get('enabled') is False:
                raise RuntimeError('An existing account is disabled; review before provisioning')
            if name in existing and not set(ADMIN_ROLES) <= client.roles(name):
                raise RuntimeError('An existing account lacks the requested admin roles; no existing account will be elevated')
        prepared.append((host, client, existing, users))

    results = {}
    for host, client, existing, users in prepared:
        results[host] = {}
        for user, password in users:
            name = user['username']
            if name not in existing:
                client.create(user, password)
            if name not in client.users() or not set(ADMIN_ROLES) <= client.roles(name):
                raise RuntimeError('PE account or admin-role verification failed; review partial provisioning before retrying')
            results[host][name] = 'PASS'
            emit(f'{host}: {name}: {"Existing account roles verified; password unchanged" if name in existing else "Created and admin roles verified"}')
    return results
