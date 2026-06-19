#!/usr/bin/env bash
set -euo pipefail

VERSION="${VERSION:-dev}"
IMAGE_LABEL="${IMAGE_LABEL:-${VERSION}}"
ZTF_ORCHESTRATOR_VERSION="${ZTF_ORCHESTRATOR_VERSION:-latest}"
QEMU_ACCELERATOR="${QEMU_ACCELERATOR:-tcg}"
ZTF_CONTAINER_IMAGE="${ZTF_CONTAINER_IMAGE:-ghcr.io/virtuarchitect/ztf-orchestrator}"
ZTF_POSTGRES_IMAGE="${ZTF_POSTGRES_IMAGE:-postgres:16-alpine}"
ZTF_BUILD_CONTAINER_IMAGE="${ZTF_BUILD_CONTAINER_IMAGE:-true}"
ZTF_PULL_CONTAINER_IMAGES="${ZTF_PULL_CONTAINER_IMAGES:-true}"
ZTF_FRAMEWORK_REPO_URL="${ZTF_FRAMEWORK_REPO_URL:-https://github.com/nutanixdev/zerotouch-framework.git}"
ZTF_FRAMEWORK_REF="${ZTF_FRAMEWORK_REF:-v1.5.2}"
ZTF_BAKE_NKP_FRAMEWORK="${ZTF_BAKE_NKP_FRAMEWORK:-true}"
ZTF_NKP_FRAMEWORK_REPO_URL="${ZTF_NKP_FRAMEWORK_REPO_URL:-https://github.com/VirtuArchitect/nkp-zerotouch-framework.git}"
ZTF_NKP_FRAMEWORK_REF="${ZTF_NKP_FRAMEWORK_REF:-main}"
ZTF_NKP_BUNDLE_URLS="${ZTF_NKP_BUNDLE_URLS:-}"
QEMU_BINARY="${QEMU_BINARY:-qemu-system-x86_64}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKER_DIR="$(cd "${SCRIPT_DIR}/../packer" && pwd)"
PACKER_SSH_KEY_FILE="${PACKER_SSH_KEY_FILE:-${PACKER_DIR}/packer-build-key}"

command -v packer >/dev/null 2>&1 || {
  echo "packer is required. Install Packer and rerun." >&2
  exit 1
}

if ! command -v qemu-system-x86_64 >/dev/null 2>&1 && ! command -v qemu-system-x86 >/dev/null 2>&1; then
  echo "QEMU is required. Install qemu-system-x86 and qemu-utils, then rerun." >&2
  exit 1
fi

if ! command -v xorriso >/dev/null 2>&1 && ! command -v mkisofs >/dev/null 2>&1 && ! command -v hdiutil >/dev/null 2>&1 && ! command -v oscdimg >/dev/null 2>&1; then
  echo "An ISO creation tool is required for Packer cd_files. Install xorriso or mkisofs, then rerun." >&2
  exit 1
fi

if [ ! -f "${PACKER_SSH_KEY_FILE}" ]; then
  ssh-keygen -t ed25519 -N "" -f "${PACKER_SSH_KEY_FILE}" -C "ztf-orchestrator-packer" >/dev/null
fi
chmod 600 "${PACKER_SSH_KEY_FILE}"
PACKER_SSH_PUBLIC_KEY="$(cat "${PACKER_SSH_KEY_FILE}.pub")"

cd "${PACKER_DIR}"
packer init ahv-qcow2.pkr.hcl
packer validate \
  -var "version=${VERSION}" \
  -var "image_label=${IMAGE_LABEL}" \
  -var "ztf_orchestrator_version=${ZTF_ORCHESTRATOR_VERSION}" \
  -var "ztf_container_image=${ZTF_CONTAINER_IMAGE}" \
  -var "postgres_image=${ZTF_POSTGRES_IMAGE}" \
  -var "build_container_image=${ZTF_BUILD_CONTAINER_IMAGE}" \
  -var "pull_container_images=${ZTF_PULL_CONTAINER_IMAGES}" \
  -var "ztf_framework_repo_url=${ZTF_FRAMEWORK_REPO_URL}" \
  -var "ztf_framework_ref=${ZTF_FRAMEWORK_REF}" \
  -var "bake_nkp_framework=${ZTF_BAKE_NKP_FRAMEWORK}" \
  -var "nkp_framework_repo_url=${ZTF_NKP_FRAMEWORK_REPO_URL}" \
  -var "nkp_framework_ref=${ZTF_NKP_FRAMEWORK_REF}" \
  -var "nkp_bundle_urls=${ZTF_NKP_BUNDLE_URLS}" \
  -var "qemu_binary=${QEMU_BINARY}" \
  -var "qemu_accelerator=${QEMU_ACCELERATOR}" \
  -var "packer_ssh_private_key_file=${PACKER_SSH_KEY_FILE}" \
  -var "packer_ssh_public_key=${PACKER_SSH_PUBLIC_KEY}" \
  ahv-qcow2.pkr.hcl
packer build \
  -var "version=${VERSION}" \
  -var "image_label=${IMAGE_LABEL}" \
  -var "ztf_orchestrator_version=${ZTF_ORCHESTRATOR_VERSION}" \
  -var "ztf_container_image=${ZTF_CONTAINER_IMAGE}" \
  -var "postgres_image=${ZTF_POSTGRES_IMAGE}" \
  -var "build_container_image=${ZTF_BUILD_CONTAINER_IMAGE}" \
  -var "pull_container_images=${ZTF_PULL_CONTAINER_IMAGES}" \
  -var "ztf_framework_repo_url=${ZTF_FRAMEWORK_REPO_URL}" \
  -var "ztf_framework_ref=${ZTF_FRAMEWORK_REF}" \
  -var "bake_nkp_framework=${ZTF_BAKE_NKP_FRAMEWORK}" \
  -var "nkp_framework_repo_url=${ZTF_NKP_FRAMEWORK_REPO_URL}" \
  -var "nkp_framework_ref=${ZTF_NKP_FRAMEWORK_REF}" \
  -var "nkp_bundle_urls=${ZTF_NKP_BUNDLE_URLS}" \
  -var "qemu_binary=${QEMU_BINARY}" \
  -var "qemu_accelerator=${QEMU_ACCELERATOR}" \
  -var "packer_ssh_private_key_file=${PACKER_SSH_KEY_FILE}" \
  -var "packer_ssh_public_key=${PACKER_SSH_PUBLIC_KEY}" \
  ahv-qcow2.pkr.hcl

sha256sum output/*.qcow2 > output/SHA256SUMS
echo "AHV appliance image written to ${PACKER_DIR}/output"
