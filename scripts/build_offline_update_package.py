#!/usr/bin/env python3
"""Build an air-gapped ZTF-Orchestrator update package.

The package layout matches the Appliance Update Manager importer:

ztf-update-vX.Y.Z.zip
├── manifest.json
├── SHA256SUMS
└── images/
    └── ztf-orchestrator-vX.Y.Z-image.tar
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path


DEFAULT_REPOSITORY = "VirtuArchitect/ZTF-Orchestrator"
DEFAULT_IMAGE_REPOSITORY = "ghcr.io/virtuarchitect/ztf-orchestrator"
ROOT = Path(__file__).resolve().parents[1]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_version(value: str) -> str:
    version = value.strip()
    if not re.fullmatch(r"v[0-9][A-Za-z0-9_.-]{0,63}", version):
        raise ValueError("version must look like v1.7.1")
    return version


def build_manifest(
    *,
    version: str,
    artifact_name: str,
    artifact_sha256: str,
    repository: str = DEFAULT_REPOSITORY,
    image_repository: str = DEFAULT_IMAGE_REPOSITORY,
    release_url: str = "",
    notes: str = "",
    source_ref: str = "",
) -> dict:
    artifact_path = f"images/{artifact_name}"
    return {
        "target": "ztf-orchestrator",
        "version": version,
        "repository": repository,
        "containerImage": f"{image_repository}:{version}",
        "sourceRef": source_ref or version,
        "releaseUrl": release_url or f"https://github.com/{repository}/releases/tag/{version}",
        "artifacts": [
            {
                "type": "container-image",
                "name": "ZTF-Orchestrator image",
                "path": artifact_path,
                "sha256": artifact_sha256,
            }
        ],
        "notes": notes or "Transferred through the approved air-gapped media process.",
    }


def create_package(
    *,
    image_tar: Path,
    version: str,
    output_zip: Path,
    repository: str = DEFAULT_REPOSITORY,
    image_repository: str = DEFAULT_IMAGE_REPOSITORY,
    release_url: str = "",
    notes: str = "",
    include_host_service: bool = False,
    source_ref: str = "",
) -> tuple[Path, str]:
    image_tar = image_tar.resolve()
    output_zip = output_zip.resolve()
    if not image_tar.is_file():
        raise FileNotFoundError(f"image tar not found: {image_tar}")
    if image_tar.suffix != ".tar":
        raise ValueError("image artifact must be a .tar file created with docker save")
    if output_zip.exists():
        raise FileExistsError("Refusing to overwrite an existing update package")
    output_zip.parent.mkdir(parents=True, exist_ok=True)

    artifact_name = image_tar.name
    artifact_sha = sha256_file(image_tar)
    manifest = build_manifest(
        version=version,
        artifact_name=artifact_name,
        artifact_sha256=artifact_sha,
        repository=repository,
        image_repository=image_repository,
        release_url=release_url,
        notes=notes,
        source_ref=source_ref,
    )
    host_files = {}
    if include_host_service:
        paths = {
            'appliance/update_service.py': 'appliance/update_service.py',
            'appliance/scripts/install-update-service.sh': 'appliance/scripts/install-update-service.sh',
            'appliance/scripts/apply-update-request.sh': 'appliance/scripts/apply-update-request.sh',
            'appliance/systemd/ztf-update-service.service': 'appliance/systemd/ztf-update-service.service',
            'appliance/docker-compose.appliance.yml': 'appliance/docker-compose.appliance.yml',
            'configure-update-service.py': 'appliance/scripts/configure-update-service.py',
            'bootstrap-guided-updates.sh': 'appliance/scripts/bootstrap-guided-updates.sh',
            'README.md': 'appliance/host-service-bundle.md',
        }
        for dest, source in paths.items():
            host_files[dest] = (ROOT / source).read_text(encoding='utf-8').replace('\r\n', '\n').encode('utf-8')
        host_files['README.md'] = host_files['README.md'].decode().replace('{{VERSION}}', version).replace('{{IMAGE_FILENAME}}', artifact_name).replace('{{SOURCE_REF}}', source_ref or version).encode()
        host_files['bundle.json'] = (json.dumps({'version': version, 'sourceRef': source_ref or version,
            'applicationImage': manifest['containerImage'], 'hostServiceProtocol': 1}, indent=2) + '\n').encode()
        host_files['SHA256SUMS'] = ''.join(f'{hashlib.sha256(content).hexdigest()}  {name}\n' for name, content in sorted(host_files.items())).encode()
        for name, content in sorted(host_files.items()):
            manifest['artifacts'].append({'type': 'appliance-host-service', 'name': name,
                'path': 'host-service/' + name, 'sha256': hashlib.sha256(content).hexdigest()})
        manifest['hostService'] = {'protocol': 1, 'installer': 'host-service/bootstrap-guided-updates.sh',
                                 'installation': 'explicit-host-bootstrap-required', 'automaticallyExecuted': False}
    manifest_bytes = json.dumps(manifest, indent=2).encode("utf-8") + b"\n"
    sha_line = ''.join(f"{entry['sha256']}  {entry['path']}\n" for entry in manifest['artifacts'])

    with zipfile.ZipFile(output_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", manifest_bytes)
        archive.writestr("SHA256SUMS", sha_line)
        archive.write(image_tar, f"images/{artifact_name}")
        for name, content in sorted(host_files.items()):
            archive.writestr('host-service/' + name, content)

    return output_zip, sha256_file(output_zip)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True, help="Release version, for example v1.7.1")
    parser.add_argument("--image-tar", required=True, type=Path, help="docker save image tar")
    parser.add_argument("--output", type=Path, help="Output zip path")
    parser.add_argument("--repository", default=DEFAULT_REPOSITORY)
    parser.add_argument("--image-repository", default=DEFAULT_IMAGE_REPOSITORY)
    parser.add_argument("--release-url", default="")
    parser.add_argument("--notes", default="")
    parser.add_argument("--include-host-service", action="store_true")
    parser.add_argument("--source-ref", default="")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    version = normalize_version(args.version)
    output = args.output or Path(f"ztf-update-{version}.zip")
    package, package_sha = create_package(
        image_tar=args.image_tar,
        version=version,
        output_zip=output,
        repository=args.repository,
        image_repository=args.image_repository,
        release_url=args.release_url,
        notes=args.notes,
        include_host_service=args.include_host_service,
        source_ref=args.source_ref,
    )
    print(f"Package: {package}")
    print(f"SHA256:  {package_sha}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
