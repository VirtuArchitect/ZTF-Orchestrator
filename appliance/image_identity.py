#!/usr/bin/env python3
"""Source-bound image provisioning for fresh appliances, without mutable pins."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time

REPOSITORY = 'ghcr.io/virtuarchitect/ztf-orchestrator'
TAG = re.compile(r'v[0-9][A-Za-z0-9_.-]{0,63}\Z')
COMMIT = re.compile(r'[a-f0-9]{40}\Z')


def command(args, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, **kwargs)
    if result.returncode:
        raise ValueError('Appliance image command failed: ' + ' '.join(str(a) for a in args[:3]))
    return result.stdout.strip()


def version_for(package_version, commit, requested='auto'):
    if not COMMIT.fullmatch(commit):
        raise ValueError('A full source commit is required.')
    base = 'v' + package_version
    if requested in ('', 'auto', 'latest', 'main'):
        requested = base + '-' + commit[:12]
    elif requested.startswith('sha-'):
        suffix = requested[4:]
        if not re.fullmatch(r'[a-f0-9]{7,40}', suffix) or not commit.startswith(suffix):
            raise ValueError('Requested SHA tag does not match the source commit.')
        requested = base + '-' + commit[:12]
    if not TAG.fullmatch(requested) or not (requested == base or requested.startswith(base + '-')):
        raise ValueError('Use a version matching package.json, or auto for a source-stamped appliance tag.')
    return requested


def plan(source, requested='auto'):
    package = json.loads((source / 'package.json').read_text(encoding='utf-8'))
    commit = command(['git', '-C', str(source), 'rev-parse', 'HEAD'])
    version = version_for(package['version'], commit, requested)
    return {'version': version, 'sourceCommit': commit, 'packageVersion': package['version'],
            'image': REPOSITORY + ':' + version,
            'registrySourceImage': REPOSITORY + ':sha-' + commit[:7],
            'buildDate': command(['git', '-C', str(source), 'show', '-s', '--format=%cI', 'HEAD'])}


def inspect_image(reference):
    result = subprocess.run(['docker', 'image', 'inspect', reference], capture_output=True, text=True)
    if result.returncode:
        return None
    return json.loads(result.stdout)[0]


def validate_image(image, identity):
    if not isinstance(image, dict) or image.get('Os') != 'linux' or image.get('Architecture') != 'amd64':
        raise ValueError('Appliances require a Linux/amd64 image.')
    env = dict(line.split('=', 1) for line in image.get('Config', {}).get('Env', []) if '=' in line)
    if env.get('ZTF_BUILD_COMMIT') != identity['sourceCommit']:
        raise ValueError('Image source commit does not match the appliance source. No tag was replaced.')
    if image.get('Config', {}).get('Labels', {}).get('io.ztf.appliance-update-protocol') != '1':
        raise ValueError('Image does not support the appliance update protocol.')
    spec = importlib.util.spec_from_file_location('appliance_build_identity',
        Path(__file__).resolve().parents[1] / 'scripts/validate_build_identity.py')
    validator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(validator)
    validator.validate_build_identity(identity['packageVersion'], env.get('ZTF_ORCHESTRATOR_VERSION', ''), identity['sourceCommit'])
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', image.get('Id', '')):
        raise ValueError('Invalid local image identity.')
    return image['Id']


def ensure_image(identity, source, *, build=False, allow_pull=False,
                 framework_repo='https://github.com/nutanixdev/zerotouch-framework.git', framework_ref='v1.5.2'):
    existing = inspect_image(identity['image'])
    if existing:
        if build:
            labels = existing.get('Config', {}).get('Labels', {})
            if (labels.get('io.ztf.appliance.framework-ref') != framework_ref
                    or labels.get('io.ztf.appliance.framework-repo') != framework_repo):
                raise ValueError('Existing build tag has different framework inputs. No image was replaced.')
        return validate_image(existing, identity)
    if build:
        # Build directly only when this versioned name is absent. A conflicting
        # existing tag is rejected above, never silently replaced.
        command(['docker', 'build', '--build-arg', 'ZTF_REPO_URL=' + framework_repo,
            '--build-arg', 'ZTF_REF=' + framework_ref,
            '--build-arg', 'ZTF_ORCHESTRATOR_VERSION=' + identity['version'],
            '--build-arg', 'ZTF_BUILD_COMMIT=' + identity['sourceCommit'],
            '--build-arg', 'ZTF_BUILD_DATE=' + identity['buildDate'],
            '--build-arg', 'ZTF_ORCHESTRATOR_IMAGE=' + identity['image'],
            '--label', 'io.ztf.appliance.framework-ref=' + framework_ref,
            '--label', 'io.ztf.appliance.framework-repo=' + framework_repo,
            '-t', identity['image'], str(source)])
    else:
        # Minimal can obtain the immutable expected source image. Verify the full
        # commit after resolving the registry's shortened SHA tag, then alias it
        # locally for the updater. Never pull latest/main or replace baked tags.
        candidate = inspect_image(identity['registrySourceImage'])
        if candidate is None:
            if not allow_pull:
                raise ValueError('Expected baked image is missing; offline startup cannot fetch a replacement.')
            command(['docker', 'pull', identity['registrySourceImage']])
            candidate = inspect_image(identity['registrySourceImage'])
        if candidate is None:
            raise ValueError('Expected source image was not loaded.')
        image_id = validate_image(candidate, identity)
        command(['docker', 'tag', image_id, identity['image']])
    selected = inspect_image(identity['image'])
    if selected is None:
        raise ValueError('Versioned appliance image is unavailable.')
    return validate_image(selected, identity)


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix='.image-identity-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w') as stream:
            json.dump(value, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def verify_running(identity):
    for _ in range(60):
        app = json.loads(command(['docker', 'inspect', 'ztf-orchestrator']))[0]
        if app['Image'] != identity['imageId'] or app['Config']['Image'] != identity['image']:
            raise ValueError('Running appliance image differs from the prepared rollback baseline.')
        if app['State'].get('Health', {}).get('Status') == 'healthy':
            health = json.loads(command(['docker', 'exec', 'ztf-orchestrator', 'python', '-c',
                "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:5001/health',timeout=10).read().decode())"]))
            if health.get('status') != 'healthy' or health.get('installed', {}).get('versionTag') != identity['version']:
                raise ValueError('Reported appliance version differs from its rollback baseline.')
            if validate_image(inspect_image(identity['image']), identity) != app['Image']:
                raise ValueError('Rollback image tag has drifted.')
            return
        time.sleep(2)
    raise ValueError('Appliance did not become healthy within 120 seconds.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--version', default='auto')
    parser.add_argument('--build', action='store_true')
    parser.add_argument('--allow-pull', action='store_true')
    parser.add_argument('--defer', action='store_true', help='Record Minimal source identity without obtaining an image')
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--verify-running', action='store_true')
    parser.add_argument('--framework-repo', default='https://github.com/nutanixdev/zerotouch-framework.git')
    parser.add_argument('--framework-ref', default='v1.5.2')
    args = parser.parse_args()
    identity = plan(args.source.resolve(), args.version)
    if args.verify_running:
        if not args.manifest:
            parser.error('--verify-running requires --manifest')
        retained = json.loads(args.manifest.read_text())
        if any(retained.get(key) != identity[key] for key in ('version', 'image', 'sourceCommit')):
            raise ValueError('Prepared image manifest differs from the selected source.')
        verify_running(retained)
    else:
        if not args.defer:
            identity['imageId'] = ensure_image(identity, args.source.resolve(), build=args.build,
                allow_pull=args.allow_pull, framework_repo=args.framework_repo, framework_ref=args.framework_ref)
        identity['deferred'] = args.defer
        if args.manifest:
            atomic_json(args.manifest, identity)
    print(json.dumps(identity, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError) as error:
        raise SystemExit(str(error))
