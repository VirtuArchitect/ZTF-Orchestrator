#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root or with sudo." >&2
  exit 1
fi

APP_DIR="${ZTF_APPLIANCE_DIR:-/opt/ztf-orchestrator}"
REQUEST_FILE="${ZTF_UPDATE_REQUEST_FILE:-}"
IMAGE_TAR="${ZTF_UPDATE_IMAGE_TAR:-}"
FRAMEWORK_ARCHIVE="${ZTF_UPDATE_FRAMEWORK_ARCHIVE:-}"
ARTIFACT_DIR="${ZTF_UPDATE_ARTIFACT_DIR:-${APP_DIR}/update-artifacts}"
REQUIRE_PRE_UPDATE_BACKUP="${ZTF_REQUIRE_PRE_UPDATE_BACKUP:-1}"

if [[ -z "${REQUEST_FILE}" ]]; then
  REQUEST_FILE="${APP_DIR}/appliance_update_request.json"
  if [[ ! -f "${REQUEST_FILE}" && -d "${APP_DIR}" ]]; then
    container_id="$(docker compose --env-file "${APP_DIR}/.env" -f "${APP_DIR}/appliance/docker-compose.appliance.yml" ps -q ztf-orchestrator 2>/dev/null || true)"
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

REQUEST_IMAGE_TAR="$(python3 - "$REQUEST_FILE" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding='utf-8'))
path = str(data.get('imageTarPath') or '').strip()
if path and not path.startswith('/'):
    raise SystemExit('Invalid imageTarPath')
print(path)
PY
)"

REQUEST_FRAMEWORK_ARCHIVE="$(python3 - "$REQUEST_FILE" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding='utf-8'))
path = str(data.get('frameworkArchivePath') or '').strip()
if path and not path.startswith('/'):
    raise SystemExit('Invalid frameworkArchivePath')
print(path)
PY
)"

REQUEST_CHECKSUM="$(python3 - "$REQUEST_FILE" <<'PY'
import json, re, sys
data = json.load(open(sys.argv[1], encoding='utf-8'))
checksum = str(data.get('checksum') or '').strip().lower()
if checksum and not re.fullmatch(r'[a-f0-9]{64}', checksum):
    raise SystemExit('Invalid checksum')
print(checksum)
PY
)"

if [[ -z "${IMAGE_TAR}" && -n "${REQUEST_IMAGE_TAR}" ]]; then
  IMAGE_TAR="${REQUEST_IMAGE_TAR}"
fi

if [[ -z "${FRAMEWORK_ARCHIVE}" && -n "${REQUEST_FRAMEWORK_ARCHIVE}" ]]; then
  FRAMEWORK_ARCHIVE="${REQUEST_FRAMEWORK_ARCHIVE}"
fi

verify_checksum() {
  local path="$1"
  local expected="$2"
  if [[ -z "${expected}" ]]; then
    return 0
  fi
  if ! command -v sha256sum >/dev/null 2>&1; then
    echo "sha256sum is required to verify staged artifacts." >&2
    exit 1
  fi
  local actual
  actual="$(sha256sum "${path}" | awk '{print $1}')"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "Checksum mismatch for ${path}" >&2
    echo "Expected: ${expected}" >&2
    echo "Actual:   ${actual}" >&2
    exit 1
  fi
}

compose_ps_id() {
  local service="$1"
  docker compose --env-file "${APP_DIR}/.env" -f "${APP_DIR}/appliance/docker-compose.appliance.yml" ps -q "${service}" 2>/dev/null || true
}

pre_update_backup_failed() {
  local message="$1"
  if [[ "${REQUIRE_PRE_UPDATE_BACKUP}" = "0" ]]; then
    echo "WARNING: ${message}" >&2
    return 0
  fi
  echo "${message}" >&2
  echo "Set ZTF_REQUIRE_PRE_UPDATE_BACKUP=0 only if you have an independent VM or database backup." >&2
  exit 1
}

create_pre_update_state_backups() {
  local timestamp backup_dir app_container postgres_container pg_backup data_backup
  timestamp="$(date -u +%Y%m%d%H%M%S)"
  backup_dir="${ARTIFACT_DIR}/pre-update-backups"
  mkdir -p "${backup_dir}"
  chmod 700 "${backup_dir}" || true

  postgres_container="$(compose_ps_id postgres)"
  if [[ -n "${postgres_container}" ]]; then
    pg_backup="${backup_dir}/ztf-orchestrator-postgres-pre-${VERSION}-${timestamp}.dump"
    if docker exec "${postgres_container}" pg_dump \
      --format=custom \
      --no-owner \
      --no-privileges \
      --username ztf \
      ztf_orchestrator > "${pg_backup}"; then
      chmod 600 "${pg_backup}" || true
      echo "Pre-update PostgreSQL backup: ${pg_backup}"
    else
      rm -f "${pg_backup}"
      pre_update_backup_failed "Unable to create pre-update PostgreSQL backup."
    fi
  else
    pre_update_backup_failed "PostgreSQL container is not running; cannot create pre-update PostgreSQL backup."
  fi

  app_container="$(compose_ps_id ztf-orchestrator)"
  if [[ -n "${app_container}" ]]; then
    data_backup="${backup_dir}/ztf-orchestrator-data-pre-${VERSION}-${timestamp}.tar.gz"
    if docker exec "${app_container}" tar -C /var/lib/ztf-orchestrator -czf - . > "${data_backup}"; then
      chmod 600 "${data_backup}" || true
      echo "Pre-update data directory snapshot: ${data_backup}"
    else
      rm -f "${data_backup}"
      pre_update_backup_failed "Unable to create pre-update data directory snapshot."
    fi
  else
    pre_update_backup_failed "ZTF-Orchestrator container is not running; cannot create pre-update data directory snapshot."
  fi
}

cd "${APP_DIR}"

if [[ "${TARGET}" != "ztf-orchestrator" ]]; then
  if [[ -z "${TARGET_PATH}" ]]; then
    echo "Framework update request does not include targetPath." >&2
    exit 1
  fi
  if [[ -n "${FRAMEWORK_ARCHIVE}" ]]; then
    if [[ ! -f "${FRAMEWORK_ARCHIVE}" ]]; then
      echo "Framework archive does not exist: ${FRAMEWORK_ARCHIVE}" >&2
      exit 1
    fi
    verify_checksum "${FRAMEWORK_ARCHIVE}" "${REQUEST_CHECKSUM}"
    if ! command -v tar >/dev/null 2>&1; then
      echo "tar is required to apply framework archives." >&2
      exit 1
    fi
    if tar -tf "${FRAMEWORK_ARCHIVE}" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
      echo "Framework archive contains unsafe paths." >&2
      exit 1
    fi
    backup_path="${TARGET_PATH}.pre-update-$(date -u +%Y%m%d%H%M%S)"
    if [[ -e "${TARGET_PATH}" ]]; then
      mv "${TARGET_PATH}" "${backup_path}"
    fi
    mkdir -p "$(dirname "${TARGET_PATH}")"
    tmp_extract="$(mktemp -d)"
    tar -xf "${FRAMEWORK_ARCHIVE}" -C "${tmp_extract}"
    entry_count="$(find "${tmp_extract}" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')"
    if [[ "${entry_count}" = "1" ]]; then
      only_entry="$(find "${tmp_extract}" -mindepth 1 -maxdepth 1 | head -n 1)"
      if [[ -d "${only_entry}" ]]; then
        mv "${only_entry}" "${TARGET_PATH}"
      else
        mkdir -p "${TARGET_PATH}"
        mv "${only_entry}" "${TARGET_PATH}/"
      fi
    else
      mv "${tmp_extract}" "${TARGET_PATH}"
      tmp_extract=""
    fi
    if [[ -n "${tmp_extract}" ]]; then
      rm -rf "${tmp_extract}"
    fi
    echo "${TARGET} archive applied to ${TARGET_PATH}."
    if [[ -n "${backup_path:-}" ]]; then
      echo "Previous framework backup: ${backup_path}"
    fi
    exit 0
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

create_pre_update_state_backups

if [[ -n "${IMAGE_TAR}" ]]; then
  if [[ ! -f "${IMAGE_TAR}" ]]; then
    echo "ZTF_UPDATE_IMAGE_TAR does not exist: ${IMAGE_TAR}" >&2
    exit 1
  fi
  verify_checksum "${IMAGE_TAR}" "${REQUEST_CHECKSUM}"
  docker load -i "${IMAGE_TAR}"
fi

if grep -q '^ZTF_ORCHESTRATOR_VERSION=' .env; then
  sed -i "s/^ZTF_ORCHESTRATOR_VERSION=.*/ZTF_ORCHESTRATOR_VERSION=${VERSION}/" .env
else
  printf '\nZTF_ORCHESTRATOR_VERSION=%s\n' "${VERSION}" >> .env
fi

docker compose --env-file "${APP_DIR}/.env" -f "${APP_DIR}/appliance/docker-compose.appliance.yml" pull ztf-orchestrator || true
systemctl restart ztf-orchestrator

echo "ZTF-Orchestrator appliance update staged to ${VERSION}."
echo "Previous .env backup: ${APP_DIR}/${backup}"
echo "Verify with: curl http://localhost:5001/health"
