"""Run with the candidate image, no mounts and --network none. Never targets a cluster."""
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import time
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    with tempfile.TemporaryDirectory(prefix='pe-direct-rehearsal-') as directory:
        os.environ.update(ZTF_DATA_DIR=directory, ZTF_STORAGE_BACKEND='file',
                          ZTF_AHV_UPLINK_MIGRATION_ENABLED='true', ZTF_DARE_ENABLE_MUTATION='true')
        os.environ.pop('ZTF_DATABASE_URL', None)
        import server
        import pe_direct
        import pe_direct_dare
        import pe_direct_uplink_ssh
        from tests.pe_direct_lab import Lab, CONNECTION, UPLINK, DARE, DESIRED, CLUSTER, resolver

        server.limiter.enabled = False
        server._save_users([{'username': name, 'role': 'admin'} for name in ('requester', 'reviewer')])
        requester = {'Authorization': 'Bearer ' + server._create_session('requester', 'admin')}
        reviewer = {'Authorization': 'Bearer ' + server._create_session('reviewer', 'admin')}
        results = []
        try:
            with server.app.test_client() as client, patch.object(socket.socket, 'connect', side_effect=AssertionError('Network forbidden')):
                for workflow, config, intent, count in [('ahv-uplink-migration', UPLINK, DESIRED, 9), ('dare', CONNECTION, DARE, 1)]:
                    lab = Lab()
                    with patch.object(pe_direct, 'Client', lambda *_: lab), patch.object(pe_direct_dare, 'Client', lambda *_: lab), \
                            patch.object(pe_direct_uplink_ssh, 'run', lab.ssh), patch.object(server, '_pe_login_title_resolver', lambda _: resolver):
                        base = '/api/' + workflow
                        discovery = client.post(base + '/discover', json=config, headers=requester)
                        assert discovery.status_code == 200, discovery.get_json()
                        preflight = client.post(base + '/preflight', json=intent, headers=requester)
                        assert preflight.status_code == 200, preflight.get_json()
                        content = preflight.get_json()['content']
                        assert not lab.writes
                        approval = client.post(base + '/approval', json={'content': content}, headers=requester)
                        assert approval.status_code == 201, approval.get_json()
                        identity = approval.get_json()['id']
                        confirmation = ('ENCRYPT ' if workflow == 'dare' else 'APPLY UPLINKS ') + CLUSTER
                        body = {'content': content, 'approvalId': identity, 'confirmation': confirmation}
                        assert client.post(base + '/apply', json=body, headers=requester).status_code == 403
                        assert client.post('/api/approvals/' + identity + '/approve', json={}, headers=requester).status_code == 403
                        assert client.post('/api/approvals/' + identity + '/approve', json={}, headers=reviewer).status_code == 200
                        response = client.post(base + '/apply', json=body, headers=requester)
                        assert response.status_code == 202, response.get_json()
                        job_id = response.get_json()['id']
                        assert client.post(base + '/apply', json=body, headers=requester).get_json()['id'] == job_id
                        for _ in range(200):
                            job = server._job_manager.get_job(job_id)
                            if job['status'] in ('success', 'failed'):
                                break
                            time.sleep(.05)
                        assert job['status'] == 'success', job.get('diagnostics')
                        assert len(lab.writes) == count
                        assert job['diagnostics']['verifyTls'] is False
                        if workflow == 'ahv-uplink-migration':
                            assert len(job['diagnostics']['verifiedHosts']) == 3
                            assert all(row['stage'] == 'verified' for row in job['diagnostics']['verifiedHosts'])
                        results.append({'workflow': workflow, 'status': job['status'], 'mockWrites': count,
                                        'independentApproval': True, 'replaySubmittedAgain': False})
        finally:
            if server._recovery_service:
                server._recovery_service.shutdown()
            if server._job_manager:
                server._job_manager.stop()
        print(json.dumps({'mockedOnly': True, 'results': results}))


if __name__ == '__main__':
    main()
