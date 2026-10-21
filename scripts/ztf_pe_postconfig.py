"""Fail-closed verification for the pinned legacy PE post-configuration scripts."""

from decimal import Decimal, InvalidOperation


def _integer(value):
    if isinstance(value, bool):
        raise ValueError('Expected an integer')
    try:
        number = Decimal(str(value))
        if not number.is_finite() or number != number.to_integral_value() or number < 0:
            raise ValueError('Expected a nonnegative integer')
        return int(number)
    except InvalidOperation:
        raise ValueError('Expected an integer') from None


def _boolean(value):
    if value is True or value == 'true':
        return True
    if value is False or value == 'false':
        return False
    raise ValueError('Expected a boolean')


def _switch(value):
    if not isinstance(value, str) or value.upper() not in ('ON', 'OFF'):
        raise ValueError('Expected ON or OFF')
    return value.upper()


CONTAINER_FIELDS = {
    'replication_factor': ('replicationFactor', _integer),
    'advertisedCapacity_in_gb': ('advertisedCapacity', _integer),
    'reserved_in_gb': ('totalExplicitReservedCapacity', _integer),
    'compression_enabled': ('compressionEnabled', _boolean),
    'compression_delay_in_secs': ('compressionDelayInSecs', _integer),
    'erasure_code': ('erasureCode', _switch),
    'finger_print_on_write': ('fingerPrintOnWrite', _switch),
    'on_disk_dedup': ('onDiskDedup', _switch),
    'enable_software_encryption': ('enableSoftwareEncryption', _boolean),
    'storage_pool_uuid': ('storagePoolUuid', str),
    'affinity_host_uuid': ('affinityHostUuid', str),
    'nfsWhitelistAddress': ('nfsWhitelistAddress', sorted),
}


def container_expectations(desired):
    """Map explicitly requested fields to the v1 API, including legacy GiB units."""
    if not isinstance(desired, dict) or not isinstance(desired.get('name'), str) or not desired['name'].strip():
        raise ValueError('Container name is required')
    if set(desired) - {'name'} - set(CONTAINER_FIELDS):
        raise ValueError('Unsupported container property')
    expected = {}
    for key, value in desired.items():
        if key == 'name':
            continue
        field, normalize = CONTAINER_FIELDS[key]
        if value is None:
            raise ValueError('Explicit container properties must not be null')
        if key == 'nfsWhitelistAddress':
            # The legacy creation helper only supports an empty whitelist.
            if value != []:
                raise ValueError('Nonempty NFS whitelists are not supported by this helper')
        value = normalize(value)
        if key in ('advertisedCapacity_in_gb', 'reserved_in_gb'):
            value *= 1024 ** 3
        if key == 'replication_factor' and value not in (1, 2, 3):
            raise ValueError('Invalid replication factor')
        expected[field] = (value, normalize)
    return expected


class VerifiedPasswordChange:
    def run(self, **kwargs):
        result = super().run(**kwargs)
        requested = [ip for ip, details in self.pe_clusters.items() if details.get('new_pe_admin_credential')]
        if self.exceptions or any(
            self.results.get('clusters', {}).get(ip, {}).get('Change_Default_password') != 'PASS'
            for ip in requested
        ):
            self.logger.error('PE password change or replacement authentication failed; later configuration was stopped')
            raise SystemExit(1)
        return result

    def execute_single_cluster(self, cluster_ip, cluster_details):
        from framework.helpers.helper_functions import read_creds
        from framework.helpers.rest_utils import RestAPIUtil

        credential = cluster_details.get('new_pe_admin_credential')
        if not credential:
            self.logger.info('PE password change skipped: no replacement credential requested')
            return
        try:
            username, password = read_creds(data=self.data, credential=credential)
            if username != self.DEFAULT_USERNAME or not password or password == self.DEFAULT_SYSTEM_PASSWORD:
                raise ValueError('Invalid replacement administrator credential')
            session = RestAPIUtil(cluster_ip, user=username, pwd=self.default_pe_password, port='9440', secured=True)
            self.change_default_password(session, self.default_pe_password, password, cluster_ip)
        except Exception:
            # Upstream API errors can contain passwords and response bodies.
            self.exceptions.append('PE password change failed; check credential references and PE connectivity')

    def verify_single_cluster(self, cluster_ip, cluster_details):
        from framework.helpers.helper_functions import read_creds
        from framework.helpers.rest_utils import RestAPIUtil
        from framework.scripts.python.helpers.v2.cluster import Cluster

        credential = cluster_details.get('new_pe_admin_credential')
        result = {'Change_Default_password': 'SKIP' if not credential else "CAN'T VERIFY"}
        self.results['clusters'][cluster_ip] = result
        if not credential:
            return
        try:
            username, password = read_creds(data=self.data, credential=credential)
            if username != self.DEFAULT_USERNAME or not password:
                raise ValueError('Invalid replacement administrator credential')
            session = RestAPIUtil(cluster_ip, user=username, pwd=password, port='9440', secured=True)
            response = Cluster(session).read()
            if not isinstance(response, dict) or not response.get('uuid'):
                raise ValueError('PE did not return a cluster identity')
            cluster_details['pe_session'] = session
            cluster_details['pe_credential'] = credential
            result['Change_Default_password'] = 'PASS'
        except Exception:
            self.logger.error('PE replacement credential verification failed; check administrator credentials and connectivity')


class VerifiedContainers:
    def run(self, **kwargs):
        result = super().run(**kwargs)
        failed = bool(self.exceptions)
        for ip, details in self.pe_clusters.items():
            statuses = self.results.get('clusters', {}).get(ip, {}).get('Create_container', {})
            for desired in details.get('containers') or []:
                if statuses.get(desired.get('name')) != 'PASS':
                    failed = True
        if failed:
            self.logger.error('PE container creation or property verification failed; later pipeline steps were stopped')
            raise SystemExit(1)
        return result

    def execute_single_cluster(self, cluster_ip, cluster_details):
        from framework.scripts.python.helpers.v1.container import Container

        desired = cluster_details.get('containers') or []
        if not desired:
            return
        try:
            # Validate the whole request before any container mutation.
            names = [item['name'] for item in desired if container_expectations(item) is not None]
            if len(names) != len(set(names)):
                raise ValueError('Duplicate container names')
            api = Container(cluster_details['pe_session'])
            existing = {item['name'] for item in api.read()}
            for item in desired:
                if item['name'] in existing:
                    self.logger.info('Existing PE container will be checked without modification')
                    continue
                response = api.create(**item)
                if not isinstance(response, dict) or not response.get('value'):
                    raise ValueError('Container creation was not confirmed')
        except Exception:
            self.exceptions.append('PE container creation failed; check requested properties, credentials and connectivity')

    def verify_single_cluster(self, cluster_ip, cluster_details):
        from framework.scripts.python.helpers.v1.container import Container

        desired = cluster_details.get('containers') or []
        if not desired:
            return
        statuses = {item.get('name', '<invalid>'): "CAN'T VERIFY" for item in desired}
        self.results['clusters'][cluster_ip] = {'Create_container': statuses}
        try:
            observed = Container(cluster_details['pe_session']).read()
            for item in desired:
                expected = container_expectations(item)
                matches = [row for row in observed if row.get('name') == item['name']]
                mismatches = []
                if len(matches) != 1:
                    mismatches.append('name')
                else:
                    for field, (wanted, normalize) in expected.items():
                        try:
                            if field not in matches[0] or normalize(matches[0][field]) != wanted:
                                mismatches.append(field)
                        except (ValueError, TypeError):
                            mismatches.append(field)
                statuses[item['name']] = 'FAIL' if mismatches else 'PASS'
                if mismatches:
                    self.logger.error('PE container verification mismatch in fields: %s', ', '.join(mismatches))
        except Exception:
            self.logger.error('PE container property verification failed; check API access and supported properties')
