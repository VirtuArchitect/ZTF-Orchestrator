"""Installed into the bundled legacy ZTF runtime by patch_ztf_runtime.py."""

from framework.helpers.helper_functions import read_creds
from framework.helpers.pe_local_users import provision
from framework.scripts.python.script import Script
from framework.helpers.log_utils import get_logger


class CreateLocalUsersPe(Script):
    def __init__(self, data, **kwargs):
        super().__init__(**kwargs)
        self.data = data
        self.logger = self.logger or get_logger(__name__)

    def execute(self, **kwargs):
        try:
            results = provision(
                self.data, lambda ref: read_creds(self.data, ref), self.logger.info,
            )
            self.results['clusters'] = {host: {'Create_Local_Users': users} for host, users in results.items()}
        except Exception:
            # Upstream exceptions can embed credentials and response bodies.
            self.logger.error('CreateLocalUsersPe failed; review credential references, TLS trust, existing accounts and PE API compatibility. Partial provisioning may require manual review.')
            self.exceptions.append('PE local-user creation or verification failed; no passwords were logged')
            self.results['Create_Local_Users'] = 'FAIL'

    def verify(self, **kwargs):
        # provision performs fresh account and role reads after every creation.
        pass
