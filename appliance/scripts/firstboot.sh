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
IMAGE_VERSION="${ZTF_ORCHESTRATOR_VERSION:-latest}"
HOST_BIND="${ZTF_HOST_BIND:-0.0.0.0}"
PRELOAD_DIR="${ZTF_PRELOAD_DIR:-/opt/ztf-orchestrator-preload}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

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
  rm -rf "${APP_DIR:?}/"*
  if [[ -d "${LOCAL_SOURCE_DIR}/.git" ]]; then
    git clone --branch "${SOURCE_REF}" "${LOCAL_SOURCE_DIR}" "${APP_DIR}" \
      || git clone "${LOCAL_SOURCE_DIR}" "${APP_DIR}"
  else
    git clone --branch "${SOURCE_REF}" "${SOURCE_REPO}" "${APP_DIR}"
  fi
else
  if [[ -d "${LOCAL_SOURCE_DIR}/.git" ]]; then
    git -C "${APP_DIR}" fetch "${LOCAL_SOURCE_DIR}" "${SOURCE_REF}" || true
    git -C "${APP_DIR}" checkout FETCH_HEAD || git -C "${APP_DIR}" checkout "${SOURCE_REF}" || true
  else
    git -C "${APP_DIR}" fetch --all --tags
    git -C "${APP_DIR}" checkout "${SOURCE_REF}"
    git -C "${APP_DIR}" pull --ff-only || true
  fi
fi

cd "${APP_DIR}"

if [[ ! -f .env ]]; then
  POSTGRES_PASSWORD_VALUE="${POSTGRES_PASSWORD:-$(openssl rand -base64 32 | tr -d '\n')}"
  cat > .env <<EOF
ZTF_ORCHESTRATOR_VERSION=${IMAGE_VERSION}
ZTF_HOST_BIND=${HOST_BIND}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD_VALUE}
ZTF_DATABASE_URL=postgresql://ztf:${POSTGRES_PASSWORD_VALUE}@postgres:5432/ztf_orchestrator
ZTF_LOG_LEVEL=INFO
ZTF_EXEC_TIMEOUT=3600
ZTF_EXEC_WORKERS=1
ZTF_TOKEN_TTL=28800
ZTF_CONFIG_BACKUPS=5
ZTF_AUDIT_RETENTION_DAYS=90
ZTF_EXECUTION_RETENTION_DAYS=180
EOF
  chmod 600 .env
fi

install -m 0644 "${APP_DIR}/appliance/systemd/ztf-orchestrator.service" /etc/systemd/system/ztf-orchestrator.service
systemctl daemon-reload
systemctl enable ztf-orchestrator

docker compose -f appliance/docker-compose.appliance.yml pull || true
systemctl restart ztf-orchestrator

cat <<'EOF'
ZTF-Orchestrator appliance started.

Useful commands:
  sudo systemctl status ztf-orchestrator
  sudo journalctl -u ztf-orchestrator -f
  cd /opt/ztf-orchestrator && sudo docker compose -f appliance/docker-compose.appliance.yml ps

Open:
  http://<appliance-ip>:5001
EOF
