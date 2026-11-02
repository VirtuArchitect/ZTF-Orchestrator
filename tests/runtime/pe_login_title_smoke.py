"""Run with bundled ZTF Python in an isolated runtime copy; no live targets."""
from copy import deepcopy
import base64
import json
from pathlib import Path
import ssl
import tempfile
import urllib.parse
import urllib.request
import runpy
import socket
import subprocess
import sys
from unittest.mock import patch

from framework.scripts.python.pe import configure_cluster as cluster_module
from framework.scripts.python.pe.other_ops import set_prism_login_title_pe as adapter
from framework.scripts.python import __all__ as registry
from framework.helpers import pe_login_title as core
from framework.helpers.helper_functions import validate_schema

HOST = '192.0.2.10'
DATA = {'pe_credential': 'admin_ref', 'clusters': {HOST: {
    'name': 'fixture', 'prism_login_title': 'Operations'}},
    'vault_to_use': 'local', 'vaults': {'local': {'credentials': {
        'admin_ref': {'username': 'admin', 'password': 'fixture-only-secret'}}}}}


def run():
    calls, titles = [], {}
    # Real OS contention across two runtime processes, without target traffic.
    lock_probe = '''from framework.helpers import pe_login_title as core
try:
    with core._target_lock("192.0.2.10"):
        raise SystemExit(2)
except core.LoginTitleError as exc:
    assert exc.category == "target_busy"
'''
    with core._target_lock(HOST):
        subprocess.run([sys.executable, '-c', lock_probe], check=True)
    def request(client, method, payload=None):
        host = urllib.parse.urlsplit(client.url).hostname
        assert host == HOST
        expected_auth = 'Basic ' + base64.b64encode(b'admin:fixture-only-secret').decode('ascii')
        assert client.headers['Authorization'] == expected_auth
        context = next(handler._context for handler in client.opener.handlers
                       if isinstance(handler, urllib.request.HTTPSHandler))
        verified = context.verify_mode == ssl.CERT_REQUIRED and context.check_hostname
        calls.append(('request', method, verified))
        if method == 'GET':
            return {'entities': [] if host not in titles else [
                {'type': core.UI_TYPE, 'key': core.UI_KEY, 'value': titles[host]}]}
        assert method in {'POST', 'PUT'}
        assert payload == {'type': core.UI_TYPE, 'key': core.UI_KEY, 'value': 'Operations'}
        titles[host] = payload['value']
        return {'success': True}
    def forbidden(*args, **kwargs):
        raise AssertionError('Live target or legacy preparation reached')
    with patch.object(socket, 'create_connection', forbidden), patch.object(socket.socket, 'connect', forbidden), \
            patch.object(cluster_module, 'create_pe_objects', forbidden), patch.object(core.PeLoginTitleClient, 'request', request):
        assert 'SetPrismLoginTitlePe' in registry
        result = adapter.SetPrismLoginTitlePe(deepcopy(DATA)).run()
        assert result['clusters'][HOST]['Prism_Login_Title'] == 'PASS'
        assert result['clusters'][HOST]['changed'] is True
        assert ('request', 'POST', True) in calls
        calls.clear()
        data = deepcopy(DATA)
        data.pop('vaults')
        data.pop('vault_to_use')
        data['prism_login_title_verify_tls'] = False
        workflow = cluster_module.ClusterConfig(data, global_data=deepcopy(DATA))
        result = workflow.run()
        assert result['clusters'][HOST]['changed'] is False
        assert result == workflow.data['json_output']
        assert ('request', 'GET', False) in calls
        assert all(call[1] == 'GET' for call in calls)
        invalid = deepcopy(DATA)
        invalid['clusters']['192.0.2.11'] = {
            'name': 'second', 'pe_credential': 'missing', 'prism_login_title': 'Operations'}
        mixed = deepcopy(DATA)
        mixed['clusters'][HOST]['pulse'] = True
        typo = deepcopy(DATA)
        typo['prism_login_title'] = 'wrong root'
        for rejected in (invalid, mixed, typo):
            calls.clear()
            try:
                cluster_module.ClusterConfig(rejected).run()
            except SystemExit as exc:
                assert exc.code == 1
            else:
                raise AssertionError('Invalid title intent did not fail closed')
            assert calls == []
        original_argv = sys.argv
        try:
            with tempfile.TemporaryDirectory(prefix='title-cli-smoke-') as folder:
                config_path = Path(folder) / 'title.json'
                config_path.write_text(json.dumps(DATA))
                for flag, action in [('--script', 'SetPrismLoginTitlePe'), ('--workflow', 'config-cluster')]:
                    calls.clear()
                    titles.clear()
                    sys.argv = ['main.py', flag, action, '-f', str(config_path)]
                    main = runpy.run_path('main.py', run_name='__main__')
                    assert titles == {HOST: 'Operations'}
                    assert ('request', 'POST', True) in calls
                    assert calls[-1] == ('request', 'GET', True)
                assert validate_schema(main['WORKFLOW_CONFIG']['config-cluster']['schema'], DATA)
        finally:
            sys.argv = original_argv
    print(json.dumps({'bundledRuntimeTitleSmoke': 'PASS', 'actualScriptAndClusterConfig': True,
                      'rootCredentialAndGlobalVaultMerge': True, 'titleOnlyStopsLegacy': True,
                      'allCredentialsBeforeTargets': True, 'defaultAndExplicitFalseTLS': True,
                      'configClusterSchema': True, 'actualMainScriptAndWorkflowCLI': True,
                      'requestOnlyMock': True, 'liveTargetCalls': 0}))


if __name__ == '__main__':
    run()
