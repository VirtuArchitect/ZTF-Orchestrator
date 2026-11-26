"""Run only against a disposable database. No remote cluster requests are made."""
import json
import uuid
import yaml
import server
import scoped_access

assert server._storage.name == 'postgres'
users=[{'id':str(uuid.uuid4()),'username':role,'role':role,'password_hash':'synthetic-no-login'} for role in ('admin','operator','viewer')]
server._save_users(users)
headers={u['role']:{'Authorization':'Bearer '+server._create_session(u['username'],u['role'])} for u in users}
server._load_global_config_data=lambda:{}
def no_remote(*args,**kwargs):
    raise AssertionError('A metadata smoke test must not contact PE')
server._access_service.identity=no_remote
server.get_configs_dir().mkdir(parents=True,exist_ok=True)
(server.get_configs_dir()/'scope.yml').write_text(yaml.safe_dump({'clusters':{'192.0.2.20':{'name':'Example','pe_credential':'pe_ref','enable_pulse':False}}}),encoding='utf-8')
pipeline={'id':'baseline','name':'Example baseline','executor':'legacy','steps':[{'workflow':'config-cluster','configFile':'scope.yml'}]}
server._save_pipelines([pipeline])
server.write_json(server.SETTINGS_FILE,{**server.get_settings(),'approvalRequiredWorkflows':[]})
server.write_json(server.CONFIG_DIR/'approvals.json',[{'id':'retained-approval','status':'approved'}])
policy=scoped_access.empty_policy()
policy['scopes']=[{'id':'one','name':'Example','datacenter':'Example DC','pcIp':'','credentialRefs':['pe_ref'],'connection':{'mode':'pe-direct','pe_endpoint':'https://192.0.2.20:9440','pe_credential':'pe_ref','cluster_uuid':'00000000-0000-0000-0000-000000000001','verify_tls':True,'tls_bypass_reason':''}}]
policy['assignments']={u['id']:{'scopeIds':['one'],'capabilities':['pipeline.execute','requests.create'] if u['role']=='operator' else []} for u in users if u['role']!='admin'}
with server.app.test_client() as client:
    assert client.get('/api/access/workspace',headers=headers['viewer']).get_json()['scopes']==[]
    assert client.put('/api/access/admin/policy',headers=headers['admin'],json=policy).status_code==200
    body={'accountId':users[1]['id'],'pipelineId':'baseline','scopeIds':['one']}
    review=client.post('/api/access/admin/review',headers=headers['admin'],json=body)
    assert review.status_code==200,review.get_json()
    binding=client.post('/api/access/admin/authorise',headers=headers['admin'],json={**body,**review.get_json(),'confirmation':'AUTHORISE baseline FOR operator'})
    assert binding.status_code==201,binding.get_json()
    viewer=client.get('/api/access/workspace',headers=headers['viewer']).get_json()
    assert len(viewer['scopes'])==1 and not viewer['pipelines'][0]['executable']
    assert client.get('/api/global-config',headers=headers['operator']).status_code==403
    assert client.post('/api/access/requests',headers=headers['viewer'],json={'scopeIds':['one'],'kind':'recovery'}).status_code==403
    assert client.post('/api/access/requests',headers=headers['operator'],json={'scopeIds':['one'],'kind':'recovery'}).status_code==201
    assert server._load_pipelines()==[pipeline]
    assert server.read_json(server.CONFIG_DIR/'approvals.json',[])==[{'id':'retained-approval','status':'approved'}]
    assert len(server._access_service.records('operational_requests.json'))==1
    assert client.delete('/api/access/admin/bindings/'+binding.get_json()['id'],headers=headers['admin']).status_code==200
print(json.dumps({'postgresMetadata':True,'scopedReads':True,'viewerWritesDenied':True,'delegationReviewAndRevocation':True,'pipelineAndApprovalPreserved':True,'remoteRequests':0}))
server._recovery_service.shutdown()
server._job_manager.stop()
