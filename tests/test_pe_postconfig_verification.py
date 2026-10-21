import importlib.util
import logging
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest


ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def runtime(monkeypatch):
    module = load('ztf_pe_postconfig')
    calls = []
    state = {'failure': None, 'rows': [], 'credentials': ('admin', 'replacement-test-secret')}

    def creds(**kwargs):
        calls.append(('credential', kwargs['credential']))
        if state['failure'] == 'credential':
            raise ValueError('replacement-test-secret')
        return state['credentials']

    def session(ip, **kwargs):
        calls.append(('session', kwargs))
        return SimpleNamespace(**kwargs)

    class Cluster:
        def __init__(self, session):
            self.session = session

        def read(self, endpoint):
            calls.append(('authenticate', self.session.pwd))
            if state['failure'] in ('401', 'timeout', 'TLS'):
                raise RuntimeError('replacement-test-secret')
            return {} if state['failure'] == 'empty' else {'uuid': 'cluster-test-uuid'}

    class Container:
        def __init__(self, session):
            pass

        def read(self):
            if state['failure'] == 'read':
                raise RuntimeError('replacement-test-secret')
            return state['rows']

        def create(self, **kwargs):
            calls.append(('create', kwargs))
            return {'value': True}

    for name, exports in (
        ('framework.helpers.helper_functions', {'read_creds': creds}),
        ('framework.helpers.rest_utils', {'RestAPIUtil': session}),
        ('framework.scripts.python.helpers.v2.cluster', {'Cluster': Cluster}),
        ('framework.scripts.python.helpers.v1.container', {'Container': Container}),
    ):
        stub = ModuleType(name)
        stub.__dict__.update(exports)
        monkeypatch.setitem(sys.modules, name, stub)

    class Base:
        def __init__(self, details):
            self.pe_clusters = details
            self.data = {'clusters': details}
            self.results = {'clusters': {}}
            self.exceptions = []
            self.logger = logging.getLogger('postconfig-test')
            self.default_pe_password = 'old-test-secret'

        def run(self, **kwargs):
            for ip, details in self.pe_clusters.items():
                self.execute_single_cluster(ip, details)
                self.verify_single_cluster(ip, details)
            return self.results

        def change_default_password(self, session, old, new, ip):
            calls.append(('change', old, new))
            if state['failure'] == 'change':
                raise RuntimeError('replacement-test-secret')

    class Password(module.VerifiedPasswordChange, Base):
        DEFAULT_USERNAME = 'admin'
        DEFAULT_SYSTEM_PASSWORD = 'factory-test-secret'

    class Containers(module.VerifiedContainers, Base):
        pass

    return SimpleNamespace(module=module, calls=calls, state=state, Password=Password, Containers=Containers)


@pytest.mark.parametrize('failure', [None, '401', 'timeout', 'TLS', 'empty', 'credential', 'change', 'wrong-user'])
def test_password_requires_fresh_replacement_authentication(runtime, failure, caplog):
    runtime.state['failure'] = failure
    if failure == 'wrong-user':
        runtime.state['credentials'] = ('other', 'replacement-test-secret')
    old = object()
    details = {'new_pe_admin_credential': 'new-admin', 'pe_session': old}
    script = runtime.Password({'192.0.2.1': details})
    with caplog.at_level(logging.INFO):
        if failure:
            with pytest.raises(SystemExit):
                script.run()
        else:
            script.run()
    if failure not in ('change',):
        assert (details['pe_session'] is old) == bool(failure)
    if not failure:
        assert details['pe_credential'] == 'new-admin'
        assert ('authenticate', 'replacement-test-secret') in runtime.calls
        assert ('authenticate', 'old-test-secret') not in runtime.calls
        assert script.results['clusters']['192.0.2.1']['Change_Default_password'] == 'PASS'
    assert 'replacement-test-secret' not in caplog.text
    assert 'old-test-secret' not in caplog.text
    assert 'replacement-test-secret' not in str(script.exceptions)


def test_missing_password_change_is_explicit_skip_without_calls(runtime):
    script = runtime.Password({'192.0.2.1': {}})
    assert script.run()['clusters']['192.0.2.1']['Change_Default_password'] == 'SKIP'
    assert runtime.calls == []


def test_mixed_password_requests_and_fail_closed_downstream_gate(runtime):
    runtime.state['failure'] = '401'
    script = runtime.Password({'192.0.2.1': {}, '192.0.2.2': {'new_pe_admin_credential': 'new-admin'}})
    downstream = []
    with pytest.raises(SystemExit):
        script.run()
        downstream.append('must not execute')
    assert downstream == []
    assert script.results['clusters']['192.0.2.1']['Change_Default_password'] == 'SKIP'


DESIRED = {
    'name': 'test-container', 'replication_factor': 2, 'advertisedCapacity_in_gb': 10,
    'reserved_in_gb': 0, 'compression_enabled': True, 'compression_delay_in_secs': 0,
    'erasure_code': 'OFF', 'on_disk_dedup': 'OFF', 'nfsWhitelistAddress': [],
}
OBSERVED = {
    'name': 'test-container', 'replicationFactor': '2', 'advertisedCapacity': 10 * 1024 ** 3,
    'totalExplicitReservedCapacity': 0, 'compressionEnabled': True, 'compressionDelayInSecs': 0,
    'erasureCode': 'OFF', 'onDiskDedup': 'OFF', 'nfsWhitelistAddress': [],
}


@pytest.mark.parametrize('field', list(OBSERVED))
def test_container_mismatch_is_failure_without_modifying_existing(runtime, field):
    row = dict(OBSERVED)
    row[field] = 'different' if field != 'name' else 'another-container'
    runtime.state['rows'] = [row]
    script = runtime.Containers({'192.0.2.1': {'containers': [DESIRED], 'pe_session': object()}})
    with pytest.raises(SystemExit):
        script.run()
    assert script.results['clusters']['192.0.2.1']['Create_container']['test-container'] == 'FAIL'
    if field != 'name':
        assert not any(call[0] == 'create' for call in runtime.calls)


@pytest.mark.parametrize('field', list(OBSERVED))
def test_missing_observed_property_is_not_success(runtime, field):
    row = dict(OBSERVED)
    del row[field]
    runtime.state['rows'] = [row]
    script = runtime.Containers({'192.0.2.1': {'containers': [DESIRED], 'pe_session': object()}})
    # Verification does not invent omitted properties or turn missing values into defaults.
    script.verify_single_cluster('192.0.2.1', script.pe_clusters['192.0.2.1'])
    assert script.results['clusters']['192.0.2.1']['Create_container']['test-container'] == 'FAIL'


def test_existing_matching_container_passes_without_mutation(runtime):
    runtime.state['rows'] = [dict(OBSERVED, compressionDelayInSecs='0', compressionEnabled='true')]
    script = runtime.Containers({'192.0.2.1': {'containers': [DESIRED], 'pe_session': object()}})
    assert script.run()['clusters']['192.0.2.1']['Create_container']['test-container'] == 'PASS'
    assert runtime.calls == []


@pytest.mark.parametrize('update', [{'typo': True}, {'nfsWhitelistAddress': ['192.0.2.0/24']},
                                    {'reserved_in_gb': -1}, {'compression_enabled': 1},
                                    {'replication_factor': 7}, {'advertisedCapacity_in_gb': 1.5}])
def test_invalid_container_properties_stop_before_mutation(runtime, update):
    script = runtime.Containers({'192.0.2.1': {'containers': [dict(DESIRED, **update)], 'pe_session': object()}})
    with pytest.raises(SystemExit):
        script.run()
    assert runtime.calls == []


def test_container_read_failure_stops_and_redacts(runtime, caplog):
    runtime.state['failure'] = 'read'
    script = runtime.Containers({'192.0.2.1': {'containers': [DESIRED], 'pe_session': object()}})
    with pytest.raises(SystemExit):
        script.run()
    assert 'replacement-test-secret' not in caplog.text + str(script.exceptions)


def test_patcher_is_idempotent_and_keeps_upstream_initialization(tmp_path, monkeypatch):
    patcher = load('patch_ztf_runtime')
    monkeypatch.setattr(patcher, 'RUNTIME_ROOT', tmp_path)
    (tmp_path / 'framework/helpers').mkdir(parents=True)
    targets = []
    for relative, name in [('other_ops/change_system_password.py', 'ChangeDefaultAdminPasswordPe'),
                           ('create/create_container_pe.py', 'CreateContainerPe')]:
        path = tmp_path / 'framework/scripts/python/pe' / relative
        path.parent.mkdir(parents=True)
        path.write_text(f'class {name}(ClusterScript):\n    def __init__(self):\n        self.preserved = True\n'
                        '    def execute_single_cluster(self, ip, details):\n        pass\n'
                        '    def verify_single_cluster(self, ip, details):\n        pass\n')
        targets.append(path)
    patcher.patch_pe_postconfig_verification()
    first = [path.read_text() for path in targets]
    patcher.patch_pe_postconfig_verification()
    assert first == [path.read_text() for path in targets]
    assert all('self.preserved = True' in text and 'def verify_single_cluster' not in text for text in first)


@pytest.mark.parametrize('summary,expected', [
    ("{'Change_Default_password': 'SKIP'}", 'success'),
    ("{'Change_Default_password': 'SKIP', 'HA_state': \"CAN'T VERIFY\"}", 'success'),
    ("{'Create_container': {'test': 'PASS'}, 'HA_state': \"CAN'T VERIFY\"}", 'success'),
    ("{'Change_Default_password': \"CAN'T VERIFY\"}", 'failed'),
    ("{'Accept_Eula': \"CAN'T VERIFY\"}", 'failed'),
    ("{'Update_Pulse': \"CAN'T VERIFY\"}", 'failed'),
    ("{'Create_container': {'test': 'FAIL'}}", 'failed'),
    ("{'Create_container': {'test': \"CAN'T VERIFY\"}}", 'failed'),
    ("\x1b[31m[ERROR]\x1b[0m Authentication failed", 'failed'),
])
def test_pipeline_zero_exit_verification_gate(summary, expected):
    import server
    assert server._ztf_process_status(0, summary, '') == expected
