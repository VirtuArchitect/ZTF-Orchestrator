import ast
import importlib.util
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _load_offline_package_module():
    path = ROOT / 'scripts' / 'build_offline_update_package.py'
    spec = importlib.util.spec_from_file_location('build_offline_update_package', path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _frontend_script_ids() -> set[str]:
    text = (ROOT / 'src' / 'data.ts').read_text(encoding='utf-8')
    scripts_block = text.split('export const SCRIPTS', 1)[1].split('export const TIMEZONES', 1)[0]
    return set(re.findall(r"\{ id: '([^']+)'", scripts_block))


def test_release_version_metadata_is_consistent():
    import server

    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    package_lock = json.loads((ROOT / 'package-lock.json').read_text(encoding='utf-8'))
    version_ts = (ROOT / 'src' / 'version.ts').read_text(encoding='utf-8')
    readme = (ROOT / 'README.md').read_text(encoding='utf-8')
    changelog = (ROOT / 'CHANGELOG.md').read_text(encoding='utf-8')

    expected = package['version']
    assert server.APP_VERSION == expected
    assert package_lock['version'] == expected
    assert package_lock['packages']['']['version'] == expected
    assert f"export const APP_VERSION = '{expected}'" in version_ts
    assert readme.startswith(f'# ZTF-Orchestrator · v{expected}')
    assert f'## [{expected}]' in changelog


def test_frontend_script_catalogue_is_backend_allowlisted():
    import server

    ids = _frontend_script_ids()
    assert ids
    assert not (ids - server.ALLOWED_SCRIPTS)
    assert not (ids & set(server.AMBIGUOUS_SCRIPT_ALIASES))


def test_offline_update_package_generator_writes_verified_manifest(tmp_path):
    module = _load_offline_package_module()
    image_tar = tmp_path / 'ztf-orchestrator-v1.5.4-image.tar'
    image_tar.write_bytes(b'test image tar content')
    output_zip = tmp_path / 'ztf-update-v1.5.4.zip'

    package, package_sha = module.create_package(
        image_tar=image_tar,
        version='v1.5.4',
        output_zip=output_zip,
    )

    assert package == output_zip
    assert package_sha == module.sha256_file(output_zip)

    import zipfile
    with zipfile.ZipFile(output_zip) as archive:
        names = set(archive.namelist())
        assert names == {
            'manifest.json',
            'SHA256SUMS',
            'images/ztf-orchestrator-v1.5.4-image.tar',
        }
        manifest = json.loads(archive.read('manifest.json'))
        sha_line = archive.read('SHA256SUMS').decode('utf-8')

    artifact = manifest['artifacts'][0]
    assert manifest['version'] == 'v1.5.4'
    assert manifest['containerImage'] == 'ghcr.io/virtuarchitect/ztf-orchestrator:v1.5.4'
    assert artifact['path'] == 'images/ztf-orchestrator-v1.5.4-image.tar'
    assert artifact['sha256'] == module.sha256_file(image_tar)
    assert sha_line == f"{artifact['sha256']}  {artifact['path']}\n"


def test_airgap_release_script_runs_required_release_steps():
    script = (ROOT / 'scripts' / 'build_airgap_release.ps1').read_text(encoding='utf-8')

    assert 'python -m pytest tests/test_release_integrity.py -q' in script
    assert 'npm run build' in script
    assert 'docker build' in script
    assert 'docker save' in script
    assert 'build_offline_update_package.py' in script
    assert 'Get-FileHash' in script


def test_create_vms_pc_wizard_matches_runtime_contract():
    schema = (ROOT / 'src' / 'scriptConfigSchemas.ts').read_text(encoding='utf-8')
    create_vms_pc = schema.split('CreateVmsPc:', 1)[1].split('DeployPC:', 1)[0]

    assert "network: text(values, 'network_name')" in create_vms_pc
    assert 'ip_endpoint_list' in create_vms_pc
    assert 'nic_list' not in create_vms_pc
    assert 'num_vcpus_per_socket' in create_vms_pc


def test_deploy_pc_workflow_generator_matches_runtime_contract():
    yaml_builder = (ROOT / 'src' / 'utils' / 'yaml.ts').read_text(encoding='utf-8')
    deploy_pc = yaml_builder.split('export function buildPCDeployYaml', 1)[1].split('export function buildClusterConfigYaml', 1)[0]

    assert 'pc_configs' in deploy_pc
    assert not re.search(r'^\s+pc_vms:', deploy_pc, flags=re.MULTILINE)
    assert 'pe_credential: cfg.peCredential' in deploy_pc
    assert 'cvm_credential: cfg.cvmCredential' in deploy_pc
    assert 'pc_vm_name_prefix' in deploy_pc
    assert 'num_pc_vms: 1' in deploy_pc
    assert 'pc_size: cfg.vmSize' in deploy_pc
    assert 'pc_vip: c.vip || c.pcIp' in deploy_pc
    assert 'ip_list: [c.pcIp]' in deploy_pc
    assert 'metadata_file_url' in deploy_pc
    assert 'network_name: c.networkName' in deploy_pc
    assert 'container_name: cfg.container' in deploy_pc
    assert 'subnet_mask: c.subnetMask' in deploy_pc


def test_script_config_wizard_covers_all_catalog_scripts():
    schema = (ROOT / 'src' / 'scriptConfigSchemas.ts').read_text(encoding='utf-8')

    assert 'SCRIPTS.reduce' in schema
    assert 'genericSchemaFor' not in schema
    assert 'ALL_SCRIPT_CONFIG_SCHEMAS[script.id]' in schema
    assert '...EXACT_SCRIPT_CONFIG_SCHEMAS' in schema
    assert '...FIELD_GUIDED_SCRIPT_CONFIG_SCHEMAS' in schema
    assert 'Missing script config schemas' in schema


def test_docker_build_patches_ztf_pc_entity_filter_bug():
    dockerfile = (ROOT / 'Dockerfile').read_text(encoding='utf-8')
    patch_script = (ROOT / 'scripts' / 'patch_ztf_runtime.py').read_text(encoding='utf-8')

    assert 'scripts/patch_ztf_runtime.py' in dockerfile
    assert 'RUN python /tmp/patch_ztf_runtime.py' in dockerfile
    assert 'filter_criteria = kwargs.pop("filter", None)' in patch_script
    assert 'payload["filter"] = filter_criteria' in patch_script
    assert 'payload["spec"]["name"] = kwargs["name"]' in patch_script
