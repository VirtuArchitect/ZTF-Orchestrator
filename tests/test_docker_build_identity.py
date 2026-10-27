import importlib.util
import json
from pathlib import Path
import subprocess
import sys

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_identity', ROOT / 'scripts/validate_build_identity.py')
identity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(identity)


@pytest.mark.parametrize('tag,commit', [
    ('v1.8.5-rc1', ''), ('v1.8.5-rc1-abcdef0', ''),
    ('sha-abcdef0', 'abcdef0' + '1' * 33),
    ('sha-' + 'a' * 40, 'a' * 40),
])
def test_valid_source_build_tags(tag, commit):
    identity.validate_build_identity('1.8.5-rc1', tag, commit)


@pytest.mark.parametrize('tag,commit', [
    ('v1.8.4', ''), ('v1.8.5', ''), ('latest', ''), ('', ''),
    ('v1.8.5-rc10', ''), ('v1.8.5-rc1-unsafe/path', ''),
    ('sha-abcdef0', ''), ('sha-abcdef0', 'b' * 40),
])
def test_stale_or_mismatched_tags_are_rejected(tag, commit):
    with pytest.raises(ValueError, match='Remove stale'):
        identity.validate_build_identity('1.8.5-rc1', tag, commit)


@pytest.mark.parametrize('commit', ['not-a-commit', 'a' * 7])
def test_invalid_provenance_is_not_baked_into_health_metadata(commit):
    with pytest.raises(ValueError, match='full lowercase hexadecimal'):
        identity.validate_build_identity('1.8.5-rc1', 'v1.8.5-rc1', commit)


def test_source_build_defaults_and_metadata_stay_aligned():
    version = 'v' + json.loads((ROOT / 'package.json').read_text())['version']
    compose = yaml.safe_load((ROOT / 'docker-compose.yml').read_text())['services']['ztf-orchestrator']
    args = compose['build']['args']
    assert args['ZTF_ORCHESTRATOR_VERSION'] == '${ZTF_ORCHESTRATOR_VERSION:-' + version + '}'
    assert compose['image'] == args['ZTF_ORCHESTRATOR_IMAGE']
    assert compose['image'] == '${ZTF_ORCHESTRATOR_IMAGE:-ztf-orchestrator:${ZTF_ORCHESTRATOR_VERSION:-' + version + '}}'
    for key in ['ZTF_BUILD_COMMIT', 'ZTF_BUILD_DATE']:
        assert args[key] == '${' + key + ':-}'
    assert 'ZTF_ORCHESTRATOR_VERSION=' + version in (ROOT / '.env.example').read_text()
    dockerfile = (ROOT / 'Dockerfile').read_text()
    assert dockerfile.index('RUN python /tmp/validate_build_identity.py') < dockerfile.index('RUN apt-get update')
    for name in ['docker-compose.override.yml', 'docker-compose.override.yaml', 'compose.override.yml', 'compose.override.yaml']:
        assert name in (ROOT / '.gitignore').read_text().splitlines()
        assert name in (ROOT / '.dockerignore').read_text().splitlines()


def test_build_guard_cli_accepts_current_version_and_rejects_old_version():
    version = 'v' + json.loads((ROOT / 'package.json').read_text())['version']
    command = [sys.executable, str(ROOT / 'scripts/validate_build_identity.py'), '--package', str(ROOT / 'package.json'), '--version']
    assert subprocess.run(command + [version], capture_output=True).returncode == 0
    rejected = subprocess.run(command + ['v1.8.4'], capture_output=True, text=True)
    assert rejected.returncode == 2
    assert 'Remove stale ZTF_ORCHESTRATOR_VERSION' in rejected.stderr
