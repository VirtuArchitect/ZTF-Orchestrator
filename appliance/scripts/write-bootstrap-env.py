#!/usr/bin/env python3
"""Persist only validated source/image bootstrap identity into a fresh QCOW2."""
import argparse
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from image_identity import COMMIT, REPOSITORY, TAG


def contents(identity, profile):
    if (profile not in ('standard', 'airgap', 'minimal')
            or not TAG.fullmatch(identity.get('version', ''))
            or not COMMIT.fullmatch(identity.get('sourceCommit', ''))
            or identity.get('image') != REPOSITORY + ':' + identity['version']):
        raise ValueError('Invalid appliance bootstrap identity.')
    return '\n'.join([
        'ZTF_SOURCE_REPO=https://github.com/VirtuArchitect/ZTF-Orchestrator.git',
        'ZTF_LOCAL_SOURCE_DIR=/opt/ztf-orchestrator-source',
        'ZTF_SOURCE_REF=' + identity['sourceCommit'],
        'ZTF_SOURCE_COMMIT=' + identity['sourceCommit'],
        'ZTF_ORCHESTRATOR_VERSION=' + identity['version'],
        'ZTF_APPLIANCE_PROFILE=' + profile,
        'ZTF_HOST_BIND=0.0.0.0', '',
    ])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--profile', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    value = contents(json.loads(args.manifest.read_text()), args.profile)
    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        stream.write(value)


if __name__ == '__main__':
    main()
