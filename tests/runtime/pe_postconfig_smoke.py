"""Run with the installed ZTF Python from its runtime directory; no live APIs."""

import json
from types import SimpleNamespace
from unittest.mock import patch

from framework.scripts.python.pe import configure_cluster as config
from framework.scripts.python.pe.other_ops.change_system_password import ChangeDefaultAdminPasswordPe
from framework.scripts.python.pe.create.create_container_pe import CreateContainerPe


HOST = '192.0.2.10'
SECRET = 'isolated-replacement-fixture'
calls = []
sessions = []
row = {'name': 'fixture-container', 'replicationFactor': '2', 'compressionEnabled': True}


def credentials(**kwargs):
    assert kwargs['credential'] == 'replacement-admin'
    return 'admin', SECRET


def session(host, **kwargs):
    assert host == HOST
    result = SimpleNamespace(**kwargs)
    sessions.append(result)
    return result


def prepare(data, **kwargs):
    data['clusters'][HOST].update(pe_session='original-session', cluster_info={'uuid': 'fixture-uuid'})


class RemainingAction:
    def __init__(self, data, **kwargs):
        self.data = data

    def run(self):
        details = self.data['clusters'][HOST]
        calls.append((details['pe_session'], details.get('pe_credential')))
        return {}


def run():
    stages = ('AcceptEulaPe', 'UpdatePulsePe', 'AddAdServerPe', 'OpenRepPort',
              'AddNtpServersPe', 'AddNameServersPe', 'CreateSubnetPe', 'HaReservation',
              'RebuildCapacityReservation', 'UpdateDsip', 'CreateRoleMappingPe')
    from contextlib import ExitStack
    with ExitStack() as stack:
        for name in stages:
            stack.enter_context(patch.object(config, name, RemainingAction))
        stack.enter_context(patch.object(config, 'create_pe_objects', prepare))
        stack.enter_context(patch('framework.helpers.helper_functions.read_creds', credentials))
        stack.enter_context(patch('framework.helpers.rest_utils.RestAPIUtil', session))
        change = stack.enter_context(patch.object(ChangeDefaultAdminPasswordPe, 'change_default_password'))
        auth = stack.enter_context(patch('framework.scripts.python.helpers.v2.cluster.Cluster.read', return_value={'uuid': 'fixture-uuid'}))
        inventory = stack.enter_context(patch('framework.scripts.python.helpers.v1.container.Container.read', return_value=[row]))
        create = stack.enter_context(patch('framework.scripts.python.helpers.v1.container.Container.create'))
        data = {'clusters': {HOST: {'new_pe_admin_credential': 'replacement-admin', 'pe_credential': 'old-admin'}}}

        workflow = config.ClusterConfig(data)
        workflow.run()
        assert change.call_count == 1 and auth.call_count == 1
        assert calls and all(ref == 'replacement-admin' and sess.pwd == SECRET for sess, ref in calls)
        assert sessions[-1].pwd == SECRET

        calls.clear()
        auth.side_effect = RuntimeError('fixture-authentication-rejection')
        try:
            config.ClusterConfig(data).run()
        except SystemExit as error:
            assert error.code == 1
        else:
            raise AssertionError('Failed authentication advanced configuration')
        assert calls == []

        auth.reset_mock()
        auth.side_effect = None
        change.reset_mock()
        calls.clear()
        config.ClusterConfig({'clusters': {HOST: {'pe_credential': 'replacement-admin'}}}).run()
        assert not change.called and not auth.called
        assert calls and all(sess == 'original-session' for sess, ref in calls)

        details = {'pe_session': 'fixture-session', 'containers': [
            {'name': 'fixture-container', 'replication_factor': 2, 'compression_enabled': True},
        ]}
        script = CreateContainerPe({'clusters': {HOST: details}})
        assert script.run()['clusters'][HOST]['Create_container']['fixture-container'] == 'PASS'
        assert not create.called
        inventory.return_value = [dict(row, compressionEnabled=False)]
        try:
            CreateContainerPe({'clusters': {HOST: details}}).run()
        except SystemExit as error:
            assert error.code == 1
        else:
            raise AssertionError('Mismatched existing container passed verification')
        assert not create.called
    print(json.dumps({'installedRuntimeSmoke': 'PASS', 'freshReplacementAuthentication': True,
                      'nestedWorkflowStopsOnFailure': True, 'missingPasswordRequestSkips': True,
                      'containerPropertiesVerified': True, 'livePrismCalls': 0}))


if __name__ == '__main__':
    run()
