#!/usr/bin/env bash
set -euo pipefail

VERSION="${VERSION:-dev}"
ZTF_ORCHESTRATOR_VERSION="${ZTF_ORCHESTRATOR_VERSION:-latest}"
QEMU_ACCELERATOR="${QEMU_ACCELERATOR:-tcg}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKER_DIR="$(cd "${SCRIPT_DIR}/../packer" && pwd)"

command -v packer >/dev/null 2>&1 || {
  echo "packer is required. Install Packer and rerun." >&2
  exit 1
}

if ! command -v qemu-system-x86_64 >/dev/null 2>&1 && ! command -v qemu-system-x86 >/dev/null 2>&1; then
  echo "QEMU is required. Install qemu-system-x86 and qemu-utils, then rerun." >&2
  exit 1
fi

cd "${PACKER_DIR}"
packer init ahv-qcow2.pkr.hcl
packer validate \
  -var "version=${VERSION}" \
  -var "ztf_orchestrator_version=${ZTF_ORCHESTRATOR_VERSION}" \
  -var "qemu_accelerator=${QEMU_ACCELERATOR}" \
  ahv-qcow2.pkr.hcl
packer build \
  -var "version=${VERSION}" \
  -var "ztf_orchestrator_version=${ZTF_ORCHESTRATOR_VERSION}" \
  -var "qemu_accelerator=${QEMU_ACCELERATOR}" \
  ahv-qcow2.pkr.hcl

sha256sum output/*.qcow2 > output/SHA256SUMS
echo "AHV appliance image written to ${PACKER_DIR}/output"
