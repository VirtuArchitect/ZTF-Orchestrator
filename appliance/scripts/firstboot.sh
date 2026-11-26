#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root or with sudo." >&2
  exit 1
fi

APP_DIR="${ZTF_APPLIANCE_DIR:-/opt/ztf-orchestrator}"
SOURCE_REPO="${ZTF_SOURCE_REPO:-https://github.com/VirtuArchitect/ZTF-Orchestrator.git}"
SOURCE_REF="${ZTF_SOURCE_REF:-main}"
LOCAL_SOURCE_DIR="${ZTF_LOCAL_SOURCE_DIR:-/opt/ztf-orchestrator-source}"
IMAGE_VERSION="${ZTF_ORCHESTRATOR_VERSION:-auto}"
APPLIANCE_PROFILE="${ZTF_APPLIANCE_PROFILE:-standard}"
HOST_BIND="${ZTF_HOST_BIND:-0.0.0.0}"
PRELOAD_DIR="${ZTF_PRELOAD_DIR:-/opt/ztf-orchestrator-preload}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "${APPLIANCE_PROFILE}" in
  standard|airgap|minimal) ;;
  *) echo 'Unsupported appliance profile.' >&2; exit 1 ;;
esac

# Existing installations are never repinned by a first-boot rerun. A pending
# marker belongs only to an interrupted fresh bootstrap; its credentials survive.
if [[ -f "${APP_DIR}/.firstboot-complete" ]]; then
  echo 'First boot already completed; existing appliance configuration retained.'
  exit 0
fi
if [[ -f "${APP_DIR}/.env" && ! -f "${APP_DIR}/.firstboot-pending" ]]; then
  echo 'Existing appliance .env retained; use the normal update procedure.'
  exit 0
fi

bash "${SCRIPT_DIR}/install-docker.sh"

apt_get_install() {
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y "$@"
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y "$@"
  fi
}

if ! command -v git >/dev/null 2>&1; then
  apt_get_install git ca-certificates curl openssl
fi

mkdir -p "${APP_DIR}"
mkdir -p "${PRELOAD_DIR}/nkp-zerotouch-framework" "${PRELOAD_DIR}/bundles"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  if [[ -n "$(find "${APP_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    echo 'Application directory is not empty; refusing to replace existing files.' >&2
    exit 1
  fi
  if [[ -d "${LOCAL_SOURCE_DIR}/.git" ]]; then
    git clone --no-checkout "${LOCAL_SOURCE_DIR}" "${APP_DIR}"
    git -C "${APP_DIR}" checkout --detach "${SOURCE_REF}"
  else
    git clone --no-checkout "${SOURCE_REPO}" "${APP_DIR}"
    git -C "${APP_DIR}" fetch --depth=1 origin -- "${SOURCE_REF}"
    git -C "${APP_DIR}" checkout --detach FETCH_HEAD
  fi
fi
SOURCE_COMMIT="$(git -C "${APP_DIR}" rev-parse HEAD)"
EXPECTED_COMMIT="${ZTF_SOURCE_COMMIT:-$(git -C "${APP_DIR}" rev-parse "${SOURCE_REF}^{commit}")}"
if [[ "${SOURCE_COMMIT}" != "${EXPECTED_COMMIT}" ]]; then
  echo 'Source checkout does not match the pinned appliance source; refusing to start.' >&2
  exit 1
fi

cd "${APP_DIR}"

if ! command -v python3 >/dev/null 2>&1; then
  apt_get_install python3
fi
IMAGE_ARGS=()
if [[ "${APPLIANCE_PROFILE}" != airgap ]]; then
  IMAGE_ARGS+=(--allow-pull)
fi
python3 "${APP_DIR}/appliance/image_identity.py" --source "${APP_DIR}" \
  --version "${IMAGE_VERSION}" "${IMAGE_ARGS[@]}" --manifest "${APP_DIR}/.firstboot-image.json"
IMAGE_VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "${APP_DIR}/.firstboot-image.json")"
export ZTF_ORCHESTRATOR_VERSION="${IMAGE_VERSION}"
# Reuse the baked support image; only connected/Minimal deployments may fetch it.
if ! docker image inspect postgres:16-alpine >/dev/null 2>&1; then
  if [[ "${APPLIANCE_PROFILE}" = airgap ]]; then
    echo 'Baked PostgreSQL image is missing; airgap bootstrap will not pull images.' >&2
    exit 1
  fi
  docker pull postgres:16-alpine
fi

if [[ ! -f .env ]]; then
  umask 077
  touch .firstboot-pending
  POSTGRES_PASSWORD_VALUE="${POSTGRES_PASSWORD:-$(openssl rand -hex 32)}"
  [[ ! -e .env.firstboot-tmp ]] || { echo "Interrupted temporary .env requires review." >&2; exit 1; }
  cat > .env.firstboot-tmp <<EOF
ZTF_ORCHESTRATOR_VERSION=${IMAGE_VERSION}
ZTF_HOST_BIND=${HOST_BIND}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD_VALUE}
ZTF_DATABASE_URL=postgresql://ztf:${POSTGRES_PASSWORD_VALUE}@postgres:5432/ztf_orchestrator
ZTF_LOG_LEVEL=INFO
ZTF_EXEC_TIMEOUT=3600
ZTF_EXEC_WORKERS=1
ZTF_TOKEN_TTL=28800
ZTF_CONFIG_BACKUPS=5
ZTF_NATIVE_FOUNDATION_ENABLE_DELL_IDRAC_DISCOVERY=${ZTF_NATIVE_FOUNDATION_ENABLE_DELL_IDRAC_DISCOVERY:-true}
ZTF_NATIVE_FOUNDATION_ENABLE_DELL_IDRAC_MUTATION=${ZTF_NATIVE_FOUNDATION_ENABLE_DELL_IDRAC_MUTATION:-true}
ZTF_NATIVE_FOUNDATION_ENABLE_REAL_DEPLOYMENT_ADAPTER=${ZTF_NATIVE_FOUNDATION_ENABLE_REAL_DEPLOYMENT_ADAPTER:-false}
ZTF_NATIVE_FOUNDATION_ADAPTER_COMMAND=${ZTF_NATIVE_FOUNDATION_ADAPTER_COMMAND:-}
ZTF_NATIVE_FOUNDATION_ADAPTER_ARGS=${ZTF_NATIVE_FOUNDATION_ADAPTER_ARGS:-}
ZTF_NATIVE_FOUNDATION_ADAPTER_TIMEOUT=${ZTF_NATIVE_FOUNDATION_ADAPTER_TIMEOUT:-14400}
ZTF_AUDIT_RETENTION_DAYS=90
ZTF_EXECUTION_RETENTION_DAYS=180
EOF
  chmod 600 .env.firstboot-tmp
  mv .env.firstboot-tmp .env
else
  SAVED_VERSION="$(python3 -c 'import sys; rows=[x.split("=",1)[1].strip() for x in open(sys.argv[1]).read().splitlines() if x.startswith("ZTF_ORCHESTRATOR_VERSION=")]; print(rows[-1] if len(rows)==1 else "")' "${APP_DIR}/.env")"
  if [[ "${SAVED_VERSION}" != "${IMAGE_VERSION}" ]]; then
    echo 'Interrupted bootstrap has a different version pin; existing .env retained.' >&2
    exit 1
  fi
fi

install -m 0644 "${APP_DIR}/appliance/systemd/ztf-orchestrator.service" /etc/systemd/system/ztf-orchestrator.service
if [[ "${APP_DIR}" = /opt/ztf-orchestrator ]]; then
  bash "${APP_DIR}/appliance/scripts/install-update-service.sh"
else
  echo 'Guided updates are disabled for this custom application path; existing CLI updates remain available.'
fi
systemctl daemon-reload
systemctl enable ztf-orchestrator

# The selected image is already present and verified. Never refresh its tag.
docker compose --env-file "${APP_DIR}/.env" -f "${APP_DIR}/appliance/docker-compose.appliance.yml" config --quiet
systemctl restart ztf-orchestrator
python3 "${APP_DIR}/appliance/image_identity.py" --source "${APP_DIR}" --version "${IMAGE_VERSION}" --manifest "${APP_DIR}/.firstboot-image.json" --verify-running
touch "${APP_DIR}/.firstboot-complete"
rm -f "${APP_DIR}/.firstboot-pending"

cat <<'EOF'
ZTF-Orchestrator appliance started.

Useful commands:
  sudo systemctl status ztf-orchestrator
  sudo journalctl -u ztf-orchestrator -f
  sudo docker compose --env-file /opt/ztf-orchestrator/.env -f /opt/ztf-orchestrator/appliance/docker-compose.appliance.yml ps

Open:
  http://<appliance-ip>:5001
EOF
