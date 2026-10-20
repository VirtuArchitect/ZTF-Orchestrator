"""Exercise the extension entry point with the upstream keyword-only resolver contract."""
import importlib.util
import logging
from pathlib import Path
import sys
import types


def test_extension_resolves_credentials_by_keyword_and_sanitizes_failure(monkeypatch, caplog):
    class Script:
        def __init__(self, **kwargs):
            self.logger, self.results, self.exceptions = None, {}, []
    calls = []
    def read_creds(*, data, credential):
        calls.append((data, credential))
        return 'ops.one', 'fixture-password'
    def provision(data, resolve, emit):
        assert resolve('ops_ref') == ('ops.one', 'fixture-password')
        return {'192.0.2.10': {'ops.one': 'PASS'}}
    modules = {
        'framework.helpers.helper_functions': {'read_creds': read_creds},
        'framework.helpers.pe_local_users': {'provision': provision},
        'framework.scripts.python.script': {'Script': Script},
        'framework.helpers.log_utils': {'get_logger': lambda name: logging.getLogger(name)},
    }
    for name, attributes in modules.items():
        module = types.ModuleType(name)
        module.__dict__.update(attributes)
        monkeypatch.setitem(sys.modules, name, module)
    path = Path(__file__).parents[1] / 'scripts/ztf_create_local_users_pe.py'
    spec = importlib.util.spec_from_file_location('local_users_entry', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    script = module.CreateLocalUsersPe({'fixture': True})
    script.execute()
    script.verify()
    assert calls == [({'fixture': True}, 'ops_ref')]
    assert not script.exceptions
    assert script.results['clusters']['192.0.2.10']['Create_Local_Users']['ops.one'] == 'PASS'
    def fail(*args):
        raise RuntimeError('fixture-password')
    monkeypatch.setattr(module, 'provision', fail)
    with caplog.at_level(logging.ERROR):
        script.execute()
    assert script.exceptions and script.results['Create_Local_Users'] == 'FAIL'
    assert 'fixture-password' not in caplog.text
