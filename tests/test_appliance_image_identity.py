"""Isolated image/bootstrap contracts. Docker/Prism operations are test doubles."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest
import yaml

from appliance import image_identity as identity
from tests.test_guided_appliance_updates import host, package, operation

ROOT = Path(__file__).resolve().parents[1]
SHA = 'a' * 40
VERSION = 'v1.8.5-rc1-' + SHA[:12]
PLAN = {'sourceCommit': SHA, 'packageVersion': '1.8.5-rc1', 'version': VERSION,
        'image': identity.REPOSITORY + ':' + VERSION,
        'registrySourceImage': identity.REPOSITORY + ':sha-' + SHA[:7], 'buildDate': '2026-01-01T00:00:00Z'}


def image(version=VERSION, commit=SHA):
    return {'Id': 'sha256:' + 'b' * 64, 'Os': 'linux', 'Architecture': 'amd64',
            'Config': {'Labels': {'io.ztf.appliance-update-protocol': '1'},
                       'Env': ['ZTF_BUILD_COMMIT=' + commit, 'ZTF_ORCHESTRATOR_VERSION=' + version]}}


@pytest.mark.parametrize('requested', ['', 'auto', 'latest', 'main', 'sha-' + SHA[:7], 'sha-' + SHA])
def test_legacy_moving_and_sha_inputs_become_versioned_source_pins(requested):
    assert identity.version_for('1.8.5-rc1', SHA, requested) == VERSION


@pytest.mark.parametrize('requested', ['v1.8.4', 'v1.8.5-rc10', 'sha-' + 'f' * 7, 'bad;command', 'v1.8.5-rc1/' + SHA])
def test_invalid_or_mismatched_requested_versions_fail(requested):
    with pytest.raises(ValueError):
        identity.version_for('1.8.5-rc1', SHA, requested)


def test_short_commit_not_accepted_as_full_provenance():
    with pytest.raises(ValueError):
        identity.version_for('1.8.5-rc1', SHA[:7])


def test_baked_image_reused_without_pull_or_retag(monkeypatch):
    monkeypatch.setattr(identity, 'inspect_image', lambda _: image())
    monkeypatch.setattr(identity, 'command', lambda *_: pytest.fail('No Docker mutation expected'))
    assert identity.ensure_image(PLAN, ROOT) == image()['Id']


@pytest.mark.parametrize('field', ['commit', 'platform', 'version', 'protocol'])
def test_baked_image_mismatch_fails_without_overwriting_tag(monkeypatch, field):
    value = image()
    if field == 'commit': value['Config']['Env'][0] = 'ZTF_BUILD_COMMIT=' + 'c' * 40
    if field == 'platform': value['Architecture'] = 'arm64'
    if field == 'version': value['Config']['Env'][1] = 'ZTF_ORCHESTRATOR_VERSION=v1.8.4'
    if field == 'protocol': value['Config']['Labels'] = {}
    monkeypatch.setattr(identity, 'inspect_image', lambda _: value)
    monkeypatch.setattr(identity, 'command', lambda *_: pytest.fail('A conflicting image must not be replaced'))
    with pytest.raises(ValueError): identity.ensure_image(PLAN, ROOT)


def test_offline_missing_image_fails_without_pull(monkeypatch):
    monkeypatch.setattr(identity, 'inspect_image', lambda _: None)
    monkeypatch.setattr(identity, 'command', lambda *_: pytest.fail('Offline startup must not pull'))
    with pytest.raises(ValueError, match='offline startup'): identity.ensure_image(PLAN, ROOT)


def test_minimal_pulls_exact_source_then_aliases_verified_id(monkeypatch):
    images, calls = {}, []
    def command(args):
        calls.append(args)
        if args[1] == 'pull': images[args[-1]] = image('sha-' + SHA)
        if args[1] == 'tag': images[args[-1]] = copy.deepcopy(images[PLAN['registrySourceImage']])
    monkeypatch.setattr(identity, 'inspect_image', images.get)
    monkeypatch.setattr(identity, 'command', command)
    assert identity.ensure_image(PLAN, ROOT, allow_pull=True) == image()['Id']
    assert calls == [['docker', 'pull', PLAN['registrySourceImage']], ['docker', 'tag', image()['Id'], PLAN['image']]]


def test_short_registry_tag_collision_never_aliases_wrong_full_commit(monkeypatch):
    monkeypatch.setattr(identity, 'inspect_image', lambda ref: None if ref == PLAN['image'] else image('sha-' + 'c' * 40, 'c' * 40))
    monkeypatch.setattr(identity, 'command', lambda *_: pytest.fail('A mismatched image must not be aliased'))
    with pytest.raises(ValueError, match='source commit'): identity.ensure_image(PLAN, ROOT, allow_pull=True)


def test_build_passes_all_application_identity_arguments(monkeypatch):
    images, calls = {}, []
    def command(args):
        calls.append(args); images[PLAN['image']] = image()
    monkeypatch.setattr(identity, 'inspect_image', images.get)
    monkeypatch.setattr(identity, 'command', command)
    identity.ensure_image(PLAN, ROOT, build=True)
    args = calls[0]
    for entry in ('ZTF_ORCHESTRATOR_VERSION=' + VERSION, 'ZTF_BUILD_COMMIT=' + SHA,
                  'ZTF_ORCHESTRATOR_IMAGE=' + PLAN['image'], 'ZTF_BUILD_DATE=' + PLAN['buildDate']):
        assert entry in args


def test_deferred_minimal_manifest_does_not_contact_docker(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(identity, 'plan', lambda *_: dict(PLAN))
    monkeypatch.setattr(identity, 'ensure_image', lambda *_args, **_kwargs: pytest.fail('Deferred build must not obtain an image'))
    manifest = tmp_path / 'image.json'
    monkeypatch.setattr(sys, 'argv', ['image_identity', '--source', str(ROOT), '--defer', '--manifest', str(manifest)])
    identity.main()
    assert json.loads(manifest.read_text())['deferred'] is True
    assert 'imageId' not in json.loads(capsys.readouterr().out)


def test_compose_version_metadata_follows_update_and_rollback():
    service = yaml.safe_load((ROOT / 'appliance/docker-compose.appliance.yml').read_text())['services']['ztf-orchestrator']
    assert service['pull_policy'] == 'never'
    assert '${ZTF_ORCHESTRATOR_VERSION:?' in service['image']
    assert '${ZTF_ORCHESTRATOR_VERSION:?' in service['environment']['ZTF_ORCHESTRATOR_VERSION']
    assert service['environment']['ZTF_ORCHESTRATOR_IMAGE'] == service['image']


def test_existing_appliance_without_saved_foundation_setting_keeps_disabled_fallback():
    service = yaml.safe_load((ROOT / 'appliance/docker-compose.appliance.yml').read_text())['services']['ztf-orchestrator']
    assert service['environment']['ZTF_FOUNDATION_VM_ENABLE_MUTATION'] == '${ZTF_FOUNDATION_VM_ENABLE_MUTATION:-false}'


def test_workflow_resolves_one_commit_for_all_profiles():
    workflow = yaml.safe_load((ROOT / '.github/workflows/ahv-appliance-image.yml').read_text())
    resolver = workflow['jobs']['resolve-profiles']
    assert resolver['outputs']['source_commit'] == '${{ steps.identity.outputs.source_commit }}'
    run = next(s['run'] for s in resolver['steps'] if s.get('id') == 'identity')
    assert 'git rev-parse FETCH_HEAD' in run and 'version_for' in run
    build = workflow['jobs']['build-qcow2']
    inputs = next(s['run'] for s in build['steps'] if s.get('id') == 'vars')
    assert '${{ needs.resolve-profiles.outputs.source_commit }}' in inputs
    assert '${{ needs.resolve-profiles.outputs.image_version }}' in inputs
    for step in build['steps']:
        if step.get('name') in ('Validate Packer template', 'Build AHV QCOW2'):
            assert 'appliance_profile=${{ steps.vars.outputs.profile }}' in step['run']


def test_new_appliance_baseline_is_eligible_for_first_guided_update_and_rollback(host):
    # Actual updater archive/plan/backup logic with fake Docker responses.
    host.current_image = PLAN['image']
    (host.app / '.env').write_text('ZTF_ORCHESTRATOR_VERSION=' + VERSION + '\nSECRET=retained\n')
    payload = package(host)
    plan = operation(host, 'preflight', payload)['plan']
    result = operation(host, 'install', {'planId': plan['id'], 'confirmation': 'INSTALL ' + payload['version']})
    assert result['status'] == 'succeeded'
    assert host.state['rollback']['image'] == PLAN['image']
    # Rollback interface needs exact retained receipt and a fresh plan.
    assert host.state['rollback']['version'] == VERSION
    rolled_back = operation(host, 'rollback', {'confirmation': 'ROLLBACK ' + VERSION, 'databaseCompatible': True})
    assert rolled_back['status'] == 'succeeded'
    assert host.current_image == PLAN['image']
    assert 'ZTF_ORCHESTRATOR_VERSION=' + VERSION in (host.app / '.env').read_text()


def test_bootstrap_env_has_pinned_identity_not_branch_names():
    spec = importlib.util.spec_from_file_location('bootstrap_env', ROOT / 'appliance/scripts/write-bootstrap-env.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    text = module.contents(PLAN, 'airgap')
    assert 'ZTF_SOURCE_REF=' + SHA in text
    assert 'ZTF_ORCHESTRATOR_VERSION=' + VERSION in text
    assert 'ZTF_APPLIANCE_PROFILE=airgap' in text
    with pytest.raises(ValueError): module.contents({**PLAN, 'version': 'latest'}, 'airgap')


@pytest.mark.skipif(os.name == 'nt' or not hasattr(os, 'geteuid') or os.geteuid() != 0,
                    reason='Linux root sandbox only; no host services or Docker daemon are used')
@pytest.mark.parametrize('profile,mode,scenario', [('standard', 'baked', 'fresh'), ('airgap', 'baked', 'fresh'),
    ('minimal', 'missing', 'fresh'), ('airgap', 'missing', 'fresh'),
    ('standard', 'baked', 'existing'), ('standard', 'baked', 'existing-disabled'), ('standard', 'baked', 'retry'),
    ('standard', 'baked', 'disabled'), ('airgap', 'baked', 'disabled'), ('minimal', 'missing', 'disabled')])
def test_firstboot_shell_in_disconnected_sandbox(tmp_path, profile, mode, scenario):
    """Run the real shell/helper with local Git and command stubs, no network."""
    source = tmp_path / 'source'; source.mkdir()
    paths = ['package.json', 'scripts/validate_build_identity.py', 'appliance/image_identity.py',
             'appliance/scripts/firstboot.sh', 'appliance/scripts/install-docker.sh',
             'appliance/systemd/ztf-orchestrator.service', 'appliance/docker-compose.appliance.yml']
    for name in paths:
        target = source / name; target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text((ROOT / name).read_text(encoding='utf-8'), encoding='utf-8')
    for args in (['init'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Fixture']):
        subprocess.run(['git', '-C', str(source), *args], check=True, capture_output=True)
    commit = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    version = 'v1.8.5-rc1-' + commit[:12]
    binary = tmp_path / 'bin'; binary.mkdir()
    log = tmp_path / 'calls.jsonl'; state = tmp_path / 'state.json'
    state.write_text(json.dumps({'present': mode == 'baked', 'candidate': False}))
    stub = binary / 'docker'
    stub.write_text('''#!/usr/bin/env python3
import json,os,sys,pathlib
args=sys.argv[1:]
with open(os.environ['FIXTURE_LOG'],'a') as f:f.write(json.dumps(args)+'\\n')
p=pathlib.Path(os.environ['FIXTURE_STATE']);s=json.loads(p.read_text())
sha=os.environ['FIXTURE_COMMIT'];version='v1.8.5-rc1-'+sha[:12]
ref='ghcr.io/virtuarchitect/ztf-orchestrator:'+version
image={'Id':'sha256:'+'b'*64,'Os':'linux','Architecture':'amd64','Config':{'Labels':{'io.ztf.appliance-update-protocol':'1'},'Env':['ZTF_BUILD_COMMIT='+sha,'ZTF_ORCHESTRATOR_VERSION=sha-'+sha]}}
if args[:2]==['image','inspect']:
 if args[2]=='postgres:16-alpine':print('[{}]');sys.exit(0)
 if (args[2]==ref and s['present']) or (args[2].endswith('sha-'+sha[:7]) and s['candidate']):print(json.dumps([image]));sys.exit(0)
 sys.exit(1)
if args[:1]==['pull']:s['candidate']=True;p.write_text(json.dumps(s))
if args[:1]==['tag']:s['present']=True;p.write_text(json.dumps(s))
if args[:1]==['inspect']:print(json.dumps([{'Image':image['Id'],'Config':{'Image':ref},'State':{'Health':{'Status':'healthy'}}}]))
if args[:1]==['exec']:print(json.dumps({'status':'healthy','installed':{'versionTag':version}}))
''', encoding='utf-8'); stub.chmod(0o755)
    for name in ('systemctl', 'install', 'apt-get', 'dnf'):
        target = binary / name; target.write_text('#!/bin/sh\nexit 0\n'); target.chmod(0o755)
    app = tmp_path / 'app'
    if scenario.startswith('existing'):
        existing = 'ZTF_ORCHESTRATOR_VERSION=latest\nPOSTGRES_PASSWORD=keep-existing\n'
        if scenario == 'existing-disabled':
            existing += 'ZTF_FOUNDATION_VM_ENABLE_MUTATION=false\n'
        app.mkdir(); (app / '.env').write_text(existing)
    if scenario == 'retry':
        (binary / 'systemctl').write_text('''#!/bin/sh
if [ "$1" = restart ] && [ ! -f "$FIXTURE_FAILED" ]; then touch "$FIXTURE_FAILED"; exit 1; fi
exit 0
''')
    env = {**os.environ, 'PATH': str(binary) + os.pathsep + os.environ['PATH'],
           'ZTF_APPLIANCE_DIR': str(app), 'ZTF_LOCAL_SOURCE_DIR': str(source), 'ZTF_SOURCE_REF': commit,
           'ZTF_SOURCE_COMMIT': commit, 'ZTF_PRELOAD_DIR': str(tmp_path / 'preload'),
           'ZTF_APPLIANCE_PROFILE': profile, 'ZTF_ORCHESTRATOR_VERSION': 'auto', 'POSTGRES_PASSWORD': 'fixture-only',
           'FIXTURE_LOG': str(log), 'FIXTURE_STATE': str(state), 'FIXTURE_COMMIT': commit,
           'FIXTURE_FAILED': str(tmp_path / 'failed-once')}
    env.pop('ZTF_FOUNDATION_VM_ENABLE_MUTATION', None)
    if scenario == 'disabled':
        env['ZTF_FOUNDATION_VM_ENABLE_MUTATION'] = 'false'
    result = subprocess.run(['bash', str(source / 'appliance/scripts/firstboot.sh')], env=env, capture_output=True, text=True)
    calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
    if scenario.startswith('existing'):
        assert result.returncode == 0 and not calls
        assert (app / '.env').read_text() == existing
        return
    if scenario == 'retry':
        assert result.returncode != 0 and (app / '.firstboot-pending').exists()
        original = (app / '.env').read_bytes()
        result = subprocess.run(['bash', str(source / 'appliance/scripts/firstboot.sh')],
            env={**env, 'POSTGRES_PASSWORD': 'must-not-replace', 'ZTF_FOUNDATION_VM_ENABLE_MUTATION': 'false'}, capture_output=True, text=True)
        assert (app / '.env').read_bytes() == original
    if profile == 'airgap' and mode == 'missing':
        assert result.returncode != 0 and not (app / '.env').exists()
    else:
        assert result.returncode == 0, result.stderr
        assert 'ZTF_ORCHESTRATOR_VERSION=' + version in (app / '.env').read_text()
        expected_gate = 'false' if scenario == 'disabled' else 'true'
        assert 'ZTF_FOUNDATION_VM_ENABLE_MUTATION=' + expected_gate in (app / '.env').read_text()
        assert (app / '.firstboot-complete').exists() and not (app / '.firstboot-pending').exists()
        original = (app / '.env').read_bytes()
        again = subprocess.run(['bash', str(source / 'appliance/scripts/firstboot.sh')], env=env, capture_output=True)
        assert again.returncode == 0 and (app / '.env').read_bytes() == original
    pulls = [call for call in calls if call[0] == 'pull']
    if profile != 'minimal': assert not pulls
    else: assert pulls == [['pull', identity.REPOSITORY + ':sha-' + commit[:7]]]
