#!/usr/bin/env python3
"""Reject stale Docker version labels without importing the application."""
import argparse
import json
from pathlib import Path
import re


def validate_build_identity(package_version, version_tag, commit=''):
    if commit and not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise ValueError('ZTF_BUILD_COMMIT must be a full lowercase hexadecimal source commit or empty.')
    base = 'v' + package_version
    if version_tag == base:
        return
    if (version_tag.startswith(base + '-')
            and re.fullmatch(r'v[0-9][A-Za-z0-9_.-]{0,63}', version_tag)):
        return
    if (re.fullmatch(r'sha-[a-f0-9]{7,40}', version_tag)
            and re.fullmatch(r'[a-f0-9]{40}', commit)
            and commit.startswith(version_tag[4:])):
        return
    raise ValueError('Docker build version must match package.json, use a matching patch suffix, '
                     'or be a sha tag matching the supplied full build commit. '
                     'Remove stale ZTF_ORCHESTRATOR_VERSION overrides before rebuilding.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', required=True, type=Path)
    parser.add_argument('--version', required=True)
    parser.add_argument('--commit', default='')
    args = parser.parse_args()
    package = json.loads(args.package.read_text(encoding='utf-8'))
    try:
        validate_build_identity(package['version'], args.version, args.commit)
    except ValueError as exc:
        parser.exit(2, str(exc) + '\n')
    print('Docker build version matches the source release identity.')


if __name__ == '__main__':
    main()
