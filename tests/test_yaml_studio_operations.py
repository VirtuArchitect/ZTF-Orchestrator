import copy
import json
import pytest
import yaml
from yaml_studio_ops import validate, digest, TASKS

BASE = {'clusters': {'192.0.2.20': {'name': 'sample-cluster', 'pe_credential': 'pe_ref', 'ntp_servers_list': ['time.example.invalid']}}}
CONTENT = yaml.safe_dump(BASE)

@pytest.mark.parametrize('task,fields,root', [
 ('AddNtpServersPe', {'ntp_servers_list': ['time.example.invalid']}, {}),
 ('AddNameServersPe', {'name_servers_list': ['192.0.2.10']}, {}),
 ('ChangeDefaultAdminPasswordPe', {'new_pe_admin_credential': 'new_ref'}, {}),
 ('AcceptEulaPe', {'eula': {'username':'Operator','company_name':'Example','job_title':'Engineer'},'enable_pulse':False}, {}),
 ('UpdatePulsePe', {'enable_pulse':False}, {}),
 ('UpdateDsip', {'dsip':'192.0.2.21'}, {}),
 ('HaReservation', {'ha_reservation':{'enable_failover':True,'num_host_failure_to_tolerate':1}}, {}),
 ('RebuildCapacityReservation', {'enable_rebuild_reservation':True}, {}),
 ('CreateContainerPe', {'containers':[{'name':'container','replication_factor':2}]}, {}),
 ('SetPrismLoginTitlePe', {'prism_login_title':'Example'}, {'prism_login_title_verify_tls':True}),
 ('RegisterToPc', {}, {'pc_ip':'192.0.2.30','pc_credential':'pc_ref'}),
])
def test_all_guided_tasks(task, fields, root):
 value = {**root, 'clusters': {'192.0.2.20': {'name':'sample-cluster','pe_credential':'pe_ref',**fields}}}
 result = validate(task, yaml.safe_dump(value), ['pe_ref','new_ref','pc_ref'])
 assert result['valid'], result
 assert result['livePreflight'] == 'not_run'
 assert result['contentHash'] == digest(yaml.safe_dump(value))
 assert next(t for t in TASKS if t['id']==task)['action'] in {'config-cluster','SetPrismLoginTitlePe','ChangeDefaultAdminPasswordPe'}

@pytest.mark.parametrize('content', [
 'clusters: {}\nclusters: {}', 'clusters: &c {copy: *c}', '!!python/object/apply:os.system [echo nope]',
 'password: TOP_SECRET', yaml.safe_dump({**BASE,'unrelated':'TOP_SECRET'}),
 yaml.safe_dump({'clusters':{'192.0.2.20':{**BASE['clusters']['192.0.2.20'],'pe_credential':{'password':'TOP_SECRET'}}}}),
])
def test_bad_or_sensitive_inputs_are_rejected(content):
 result = validate('AddNtpServersPe',content,['pe_ref'])
 assert not result['valid']
 assert 'TOP_SECRET' not in json.dumps(result)

@pytest.fixture
def setup_studio(client, auth_headers, monkeypatch):
 import server
 server.get_global_config_path().parent.mkdir(parents=True,exist_ok=True)
 server.get_global_config_path().write_text(yaml.safe_dump({'vault_to_use':'local','vaults':{'local':{'credentials':{'pe_ref':{'username':'operator','password':'TOP_SECRET'}}}}}))
 server.write_json(server.CONFIG_DIR/'credential_organization.json', {'version':1,'revision':0,'groups':[{'id':'sample','name':'sample-cluster','datacenter':'Example DC','kind':'cluster'}],'assignments':{'pe_ref':{'groupId':'sample','purpose':'PE'}}})
 settings=server.get_settings(); settings['approvalRequiredWorkflows']=[]; server.write_json(server.SETTINGS_FILE,settings)
 steps=[{'workflow':'config-cluster','configFile':f'{i:02d}_step.yml'} for i in range(1,9)]
 pipeline={'id':'example','name':'Existing pipeline','steps':steps,'createdAt':'unchanged','updatedAt':'before'}
 server._save_pipelines([pipeline])
 return server,copy.deepcopy(pipeline)

def save_request(client,headers,**patch):
 return client.post('/api/yaml-studio/save',headers=headers,json={'taskId':'AddNtpServersPe','content':CONTENT,'filename':'new-ntp.yml','expectedHash':'','groupId':'sample','groupRevision':0,**patch})

def handoff_request(client,headers,**patch):
 context=client.get('/api/yaml-studio/context',headers=headers).get_json()
 body={'pipelineId':'example','pipelineHash':context['pipelines'][0]['studioHash'],'taskId':'AddNtpServersPe','filename':'new-ntp.yml','contentHash':digest(CONTENT),**patch}
 return client.post('/api/yaml-studio/handoff',headers=headers,json=body)

def test_metadata_save_and_handoff_preserve_execution_state(client,auth_headers,setup_studio,monkeypatch):
 server,original=setup_studio
 def forbidden(*args,**kwargs): raise AssertionError('Authoring must never submit a job')
 monkeypatch.setattr(server._job_manager,'submit',forbidden)
 server.write_json(server.APPROVALS_FILE,[{'id':'retained-approval','status':'approved','workflow':'config-cluster','configFile':'08_step.yml'}])
 server.write_json(server.RECOVERY_FILE,{'datacenters':[],'profiles':[], 'runs':[{'id':'retained-recovery','status':'needs_reconciliation','approvalId':'retained-approval','executor':'legacy','completedSteps':list(range(1,8)),'pendingSteps':[8]}]})
 protected=[server.CONFIG_DIR/name for name in ['approvals.json','recovery.json','jobs.json','users.json']]
 before={p:p.read_bytes() if p.exists() else None for p in protected}
 response=client.get('/api/yaml-studio/context',headers=auth_headers)
 assert response.status_code==200
 assert 'TOP_SECRET' not in response.text and 'password' not in response.text and 'operator' not in response.text
 assert response.get_json()['references'][0]['name']=='pe_ref'
 result=save_request(client,auth_headers)
 assert result.status_code==200,result.text
 assert server.read_json(server.CONFIG_DIR/'config_organization.json',{})['assignments']['new-ntp.yml']['groupId']=='sample'
 result=handoff_request(client,auth_headers)
 assert result.status_code==200,result.text
 assert result.get_json()['executionStarted'] is False
 pipeline=server._load_pipelines()[0]
 assert pipeline['steps'][:-1]==original['steps']
 assert pipeline['createdAt']=='unchanged'
 assert pipeline['steps'][-1]=={'workflow':'config-cluster','configFile':'new-ntp.yml'}
 assert {p:p.read_bytes() if p.exists() else None for p in protected}==before
 assert handoff_request(client,auth_headers).status_code==409

def test_stale_file_and_pipeline_protection(client,auth_headers,setup_studio):
 server,_=setup_studio
 assert save_request(client,auth_headers).status_code==200
 assert save_request(client,auth_headers,groupRevision=1).status_code==409
 assert handoff_request(client,auth_headers,pipelineHash='stale').status_code==409
 path=server.get_configs_dir()/'new-ntp.yml'
 path.write_text(CONTENT+'\n# edited elsewhere')
 assert handoff_request(client,auth_headers).status_code==409
 assert len(server._load_pipelines()[0]['steps'])==8
 assert client.get('/api/configs/new-ntp.yml',headers=auth_headers).get_json()['sha256']==digest(path.read_text())

@pytest.mark.parametrize('filename',['../escape.yml','global.yml','global.yaml','nested/file.yml','file.json'])
def test_safe_filename(client,auth_headers,setup_studio,filename):
 assert save_request(client,auth_headers,filename=filename).status_code==400

def test_fail_closed_and_existing_endpoints(client,auth_headers,setup_studio,monkeypatch):
 server,_=setup_studio
 assert save_request(client,auth_headers,groupRevision=99).status_code==409
 assert save_request(client,auth_headers,groupId='missing').status_code==409
 assert save_request(client,auth_headers).status_code==200
 monkeypatch.setattr(server._job_manager,'list_jobs',lambda **kwargs:[{'status':'running'}])
 assert handoff_request(client,auth_headers).status_code==409
 monkeypatch.setattr(server,'_maintenance_active',lambda:True)
 assert handoff_request(client,auth_headers).status_code==409
 assert save_request(client,auth_headers).status_code==409
 assert client.post('/api/yaml-studio/validate',headers=auth_headers,json={'kind':'workflow-config','content':CONTENT}).status_code==200

def test_viewer_permissions(client,auth_headers,setup_studio,monkeypatch):
 import server
 original=server._current_session
 def viewer():
  user=original()
  return {**user,'role':'viewer'} if user else user
 monkeypatch.setattr(server,'_current_session',viewer)
 assert client.get('/api/yaml-studio/context',headers=auth_headers).status_code==200
 assert client.post('/api/yaml-studio/validate',headers=auth_headers,json={'taskId':'AddNtpServersPe','content':CONTENT}).status_code==200
 assert save_request(client,auth_headers).status_code==403
 assert handoff_request(client,auth_headers).status_code==403
 assert client.get('/api/yaml-studio/context').status_code==401


def test_current_approval_policy_blocks_handoff(client,auth_headers,setup_studio):
 server,_=setup_studio
 settings=server.get_settings(); settings['approvalRequiredWorkflows']=['config-cluster']; server.write_json(server.SETTINGS_FILE,settings)
 assert save_request(client,auth_headers).status_code==200
 context=client.get('/api/yaml-studio/context',headers=auth_headers).get_json()
 assert next(t for t in context['tasks'] if t['id']=='AddNtpServersPe')['handoffError']
 response=handoff_request(client,auth_headers)
 assert response.status_code==400
 assert 'approval' in response.get_json()['error']
 assert len(server._load_pipelines()[0]['steps'])==8
