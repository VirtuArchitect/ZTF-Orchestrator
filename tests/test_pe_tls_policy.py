"""PE-only transport exceptions; all requests are mocked and no targets are contacted."""
import ssl
from copy import deepcopy
import pytest
import pe_tls
import cluster_storage_standard as storage
import ahv_uplink_migration as uplink
import pc_unregistration as pc
import virtual_switch_mtu as mtu
from tests.test_virtual_switch_mtu import MtuLab, draft

EXCEPTION = {'pe_verify_tls': False, 'pe_tls_bypass_reason': pe_tls.REASON}

@pytest.mark.parametrize('bad', [
    {'pe_verify_tls': 'false'}, {'pe_verify_tls': None}, {'pe_verify_tls': 0},
    {'pe_verify_tls': False}, {**EXCEPTION, 'pe_tls_bypass_reason': ''},
    {**EXCEPTION, 'pe_tls_bypass_reason': 'a\nb'}, {**EXCEPTION, 'pe_tls_bypass_reason': 'x' * 201},
])
def test_bad_policies_rejected_before_client_creation(bad):
    with pytest.raises(ValueError): pe_tls.policy(bad)


def test_bypass_does_not_need_any_ca_bundle_and_cannot_change_global_tls(monkeypatch):
    original = ssl.create_default_context
    monkeypatch.setattr(pe_tls.ssl, 'create_default_context', lambda: pytest.fail('Bypass loaded CA bundle'))
    bypass = pe_tls.context(EXCEPTION)
    assert bypass.verify_mode == ssl.CERT_NONE and not bypass.check_hostname
    monkeypatch.setattr(pe_tls.ssl, 'create_default_context', original)
    assert pe_tls.context({}).verify_mode == ssl.CERT_REQUIRED
    assert ssl.create_default_context().check_hostname


def test_pc_managed_pe_exception_does_not_disable_pc_verification(monkeypatch):
    contexts = []
    def opener(*handlers):
        contexts.extend(h._context for h in handlers if hasattr(h, '_context'))
        return object()
    monkeypatch.setattr(storage.urllib.request, 'build_opener', opener)
    config = {'pe_endpoint': 'https://pe.example.com:9440', 'pc_endpoint': 'https://pc.example.com:9440', **EXCEPTION}
    storage.Client(config, ('admin', 'fixture-only'))
    pc.Client(config, ('admin', 'fixture-only'))
    assert contexts[0].verify_mode == ssl.CERT_NONE
    assert contexts[1].verify_mode == ssl.CERT_REQUIRED and contexts[1].check_hostname


def test_mtu_preflight_binds_tls_policy_and_reason_to_exact_plan():
    lab = MtuLab()
    intent = draft()
    baseline = mtu.preflight(intent, lab, lab)
    intent['connection'].update(EXCEPTION)
    reviewed = mtu.preflight(intent, lab, lab)
    assert reviewed['intent']['connection']['pe_verify_tls'] is False
    assert uplink.fingerprint(reviewed) != uplink.fingerprint(baseline)
    changed = deepcopy(intent)
    changed['connection']['pe_tls_bypass_reason'] = 'Different approved deployment'
    assert uplink.fingerprint(mtu.preflight(changed, lab, lab)) != uplink.fingerprint(reviewed)
    assert not lab.writes


def test_health_collection_propagates_per_collection_flag(monkeypatch):
    import cluster_operations as ops
    from tests.test_pe_health_errors import record
    calls = []
    def read(*args, **kwargs):
        calls.append(kwargs)
        return {}  # incomplete inventory must never imply healthy
    monkeypatch.setattr(ops, 'read', read)
    result = ops.collect_health({**record(), **EXCEPTION}, None)
    assert len(calls) == 2 and all(c['verify_tls'] is False for c in calls)
    assert result['source'] == 'tls-exception-pe-readback'
    assert result['pe_tls_bypass_reason'] == pe_tls.REASON
    assert result['status'] == 'unknown'


def test_rollback_can_reapprove_a_pe_tls_exception_without_changing_original_target():
    lab = MtuLab()
    original = mtu.preflight(draft(), lab, lab)
    from tests.test_virtual_switch_mtu import execute
    execute(lab, original)
    requested = draft('original-job')
    requested['connection'].update(EXCEPTION)
    rollback = mtu.preflight(requested, lab, lab, original)
    assert rollback['targetMtu'] == 1500
    assert rollback['intent']['connection']['pe_verify_tls'] is False
    changed = deepcopy(requested)
    changed['connection']['pe_credential'] = 'different-reference'
    with pytest.raises(uplink.MigrationError): mtu.preflight(changed, lab, lab, original)
