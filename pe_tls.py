"""Explicit per-operation PE TLS policy; never changes process or PC trust."""
import logging
import ssl

FIELDS = {'pe_verify_tls', 'pe_tls_bypass_reason'}
REASON = 'Initial cluster deployment or disaster recovery configuration'


def policy(config):
    verify = config.get('pe_verify_tls', True)
    reason = config.get('pe_tls_bypass_reason', '')
    if type(verify) is not bool or not isinstance(reason, str) or len(reason) > 200 or any(ord(c) < 32 or ord(c) == 127 for c in reason):
        raise ValueError('PE TLS verification must be a boolean; its reason must be bounded plain text.')
    if not verify and not reason.strip():
        raise ValueError('A per-operation PE TLS exception requires a reason without passwords.')
    return {'pe_verify_tls': verify, 'pe_tls_bypass_reason': reason.strip() if not verify else ''}


def context(config):
    selected = policy(config)
    if selected['pe_verify_tls']:
        return ssl.create_default_context()
    # A broken/missing CA bundle must not block an explicitly selected exception.
    result = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    result.check_hostname = False
    result.verify_mode = ssl.CERT_NONE
    logging.getLogger(__name__).warning('pe_tls_verification_bypassed', extra={
        'action': 'pe_tls_verification_bypassed', 'verifyTls': False,
        'reason': selected['pe_tls_bypass_reason'],
        'endpoint': config.get('pe_endpoint', ''),
    })
    return result
