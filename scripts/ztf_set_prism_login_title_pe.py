"""Dedicated verified PE login-title adapter for the bundled runtime."""

from framework.helpers.helper_functions import read_creds
from framework.helpers.pe_login_title import LoginTitleError, configure
from framework.helpers.log_utils import get_logger
from framework.scripts.python.script import Script


class SetPrismLoginTitlePe(Script):
    def __init__(self, data, **kwargs):
        super().__init__(**kwargs)
        self.data = data
        self.logger = self.logger or get_logger(__name__)

    def run(self, **kwargs):
        result = super().run(**kwargs)
        if self.exceptions or self.results.get('Prism_Login_Title') == 'FAIL':
            raise SystemExit(1)
        return result

    def execute(self, **kwargs):
        try:
            self.results['clusters'] = configure(
                self.data, lambda ref: read_creds(data=self.data, credential=ref), self.logger.info,
            )
        except LoginTitleError as exc:
            self.logger.error(str(exc))
            self.exceptions.append(str(exc))
            self.results['Prism_Login_Title'] = 'FAIL'
        except Exception:
            # Even upstream credential errors can contain the resolved secret.
            message = 'SetPrismLoginTitlePe failed; check title-only intent, selected-vault credentials, TLS trust and PE API compatibility. Review the title before retrying.'
            self.logger.error(message)
            self.exceptions.append(message)
            self.results['Prism_Login_Title'] = 'FAIL'

    def verify(self, **kwargs):
        # configure verifies the title with a fresh read after any update.
        pass
