#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root or with sudo." >&2
  exit 1
fi

APP_DIR="${ZTF_APPLIANCE_DIR:-/opt/ztf-orchestrator}"
REQUEST_FILE="${ZTF_UPDATE_REQUEST_FILE:-}"
IMAGE_TAR="${ZTF_UPDATE_IMAGE_TAR:-}"

if [[ -z "${REQUEST_FILE}" ]]; then
  REQUEST_FILE="${APP_DIR}/appliance_update_request.json"
  if [[ ! -f "${REQUEST_FILE}" && -d "${APP_DIR}" ]]; then
    container_id="$(docker compose -f "${APP_DIR}/appliance/docker-compose.appliance.yml" ps -q ztf-orchestrator 2>/dev/null || true)"
    if [[ -n "${container_id}" ]]; then
      tmp_request="$(mktemp)"
      if docker cp "${container_id}:/var/lib/ztf-orchestrator/appliance_update_request.json" "${tmp_request}" 2>/dev/null; then
        REQUEST_FILE="${tmp_request}"
      else
        rm -f "${tmp_request}"
      fi
    fi
  fi
fi

if [[ ! -f "${REQUEST_FILE}" ]]; then
  echo "Update request file not found: ${REQUEST_FILE}" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to parse the update request." >&2
  exit 1
fi

VERSION="$(python3 - "$REQUEST_FILE" <<'PY'
import json, re, sys
path = sys.argv[1]
data = json.load(open(path, encoding='utf-8'))
target = str(data.get('target') or 'ztf-orchestrator').strip()
version = str(data.get('version') or '').strip()
image = str(data.get('containerImage') or '').strip()
if not re.fullmatch(r'v?[0-9][A-Za-z0-9_.-]{0,63}', version):
    raise SystemExit('Invalid update version')
if target == 'ztf-orchestrator' and image and not (image.startswith('ghcr.io/virtuarchitect/ztf-orchestrator:') or image.startswith('ztf-orchestrator:')):
    raise SystemExit('Invalid container image')
print(version)
PY
)"

TARGET="$(python3 - "$REQUEST_FILE" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding='utf-8'))
target = str(data.get('target') or 'ztf-orchestrator').strip()
if target not in {'ztf-orchestrator', 'ztf-framework', 'nkp-framework'}:
    raise SystemExit('Invalid update target')
print(target)
PY
)"

SOURCE_REF="$(python3 - "$REQUEST_FILE" <<'PY'
import json, re, sys
data = json.load(open(sys.argv[1], encoding='utf-8'))
source_ref = str(data.get('sourceRef') or data.get('version') or '').strip()
if (
    not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._/-]{0,127}', source_ref)
    or source_ref.startswith(('-', '/', '.'))
    or source_ref.endswith(('/', '.'))
    or '..' in source_ref
    or '@{' in source_ref
    or '\\' in source_ref
):
    raise SystemExit('Invalid sourceRef')
print(source_ref)
PY
)"

TARGET_PATH="$(python3 - "$REQUEST_FILE" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding='utf-8'))
target_path = str(data.get('targetPath') or '').strip()
if target_path and not target_path.startswith('/'):
    raise SystemExit('Invalid targetPath')
print(target_path)
PY
)"

cd "${APP_DIR}"

if [[ "${TARGET}" != "ztf-orchestrator" ]]; then
  if [[ -z "${TARGET_PATH}" ]]; then
    echo "Framework update request does not include targetPath." >&2
    exit 1
  fi
  if [[ ! -d "${TARGET_PATH}/.git" ]]; then
    echo "Framework target path is not a git checkout: ${TARGET_PATH}" >&2
    echo "Stage a reviewed checkout at this path or update the framework through an appliance rebuild." >&2
    exit 1
  fi
  backup_ref="$(git -C "${TARGET_PATH}" rev-parse --short HEAD)"
  echo "${backup_ref}" > "${TARGET_PATH}/.ztf-orchestrator-pre-update-ref"
  if ! git -C "${TARGET_PATH}" fetch --tags --prune; then
    echo "Unable to fetch remote refs; attempting local checkout of ${SOURCE_REF}." >&2
  fi
  git -C "${TARGET_PATH}" checkout "${SOURCE_REF}"
  echo "${TARGET} updated to ${SOURCE_REF} at ${TARGET_PATH}."
  exit 0
fi

if [[ ! -f appliance/docker-compose.appliance.yml ]]; then
  echo "Appliance Compose file not found under ${APP_DIR}." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Appliance .env file not found under ${APP_DIR}." >&2
  exit 1
fi

backup=".env.pre-update-$(date -u +%Y%m%d%H%M%S)"
cp .env "${backup}"
chmod 600 "${backup}"

if [[ -n "${IMAGE_TAR}" ]]; then
  if [[ ! -f "${IMAGE_TAR}" ]]; then
    echo "ZTF_UPDATE_IMAGE_TAR does not exist: ${IMAGE_TAR}" >&2
    exit 1
  fi
  docker load -i "${IMAGE_TAR}"
fi

if grep -q '^ZTF_ORCHESTRATOR_VERSION=' .env; then
  sed -i "s/^ZTF_ORCHESTRATOR_VERSION=.*/ZTF_ORCHESTRATOR_VERSION=${VERSION}/" .env
else
  printf '\nZTF_ORCHESTRATOR_VERSION=%s\n' "${VERSION}" >> .env
fi

docker compose -f appliance/docker-compose.appliance.yml pull ztf-orchestrator || true
systemctl restart ztf-orchestrator

echo "ZTF-Orchestrator appliance update staged to ${VERSION}."
echo "Previous .env backup: ${APP_DIR}/${backup}"
echo "Verify with: curl http://localhost:5001/health"
